import { randomUUID } from "node:crypto";
import type { Report, ReportStatus } from "@/lib/store";

const cookieName = "signal_auth_session";
const sessionAge = 60 * 60 * 24 * 7;

type HostedSession = { access_token: string; refresh_token: string; expires_at: number };
export type HostedUser = { id: string; email?: string };
export type WorkspaceAccess = { tenantId: string; user: HostedUser; accessToken: string; refreshedCookie?: string };

export function hostedAuthConfigured() {
  return Boolean(process.env.SUPABASE_URL || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY);
}
function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.");
  return { url, key };
}

function makeCookie(session: HostedSession, age = sessionAge) {
  const value = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

function clearCookie() {
  return `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

function readHostedSession(request: Request): HostedSession | null {
  try {
    const raw = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!raw) return null;
    const session = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as HostedSession;
    if (typeof session.access_token !== "string" || typeof session.refresh_token !== "string" || !Number.isInteger(session.expires_at)) return null;
    return session;
  } catch { return null; }
}

export async function signInWithPassword(email: string, password: string) {
  const { url, key } = config();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ email, password }), cache: "no-store",
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.msg === "string" ? data.msg : typeof data.message === "string" ? data.message : "Email or password is incorrect.");
  if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string" || typeof data.expires_in !== "number") throw new Error("Authentication provider returned an invalid session.");
  const session: HostedSession = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Math.floor(Date.now() / 1000) + data.expires_in };
  const user = data.user as HostedUser | undefined;
  if (!user?.id) throw new Error("Authentication provider did not return a user.");
  const membershipResponse = await providerFetch(`/rest/v1/workspace_memberships?select=workspace_id&user_id=eq.${encodeURIComponent(user.id)}`, session.access_token);
  if (!membershipResponse.ok) throw new Error("Could not check workspace access. Apply the database setup from supabase/migrations first.");
  const memberships = await membershipResponse.json() as { workspace_id: string }[];
  return { session, user, tenantIds: memberships.map((item) => item.workspace_id), cookie: makeCookie(session) };
}

async function refresh(session: HostedSession): Promise<HostedSession | null> {
  const { url, key } = config();
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ refresh_token: session.refresh_token }), cache: "no-store",
  });
  if (!response.ok) return null;
  const data = await response.json() as Record<string, unknown>;
  if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string" || typeof data.expires_in !== "number") return null;
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Math.floor(Date.now() / 1000) + data.expires_in };
}

async function providerFetch(path: string, accessToken: string, init?: RequestInit) {
  const { url, key } = config();
  return fetch(`${url}${path}`, {
    ...init, cache: "no-store",
    headers: { apikey: key, Authorization: `Bearer ${accessToken}`, ...(init?.headers || {}) },
  });
}

async function getUser(accessToken: string): Promise<HostedUser | null> {
  const response = await providerFetch("/auth/v1/user", accessToken);
  if (!response.ok) return null;
  const data = await response.json() as HostedUser;
  return typeof data.id === "string" ? data : null;
}

export async function workspaceAccess(request: Request, tenantId: string): Promise<WorkspaceAccess | null> {
  let session = readHostedSession(request);
  if (!session) return null;
  let refreshedCookie: string | undefined;
  if (session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    const renewed = await refresh(session);
    if (!renewed) return null;
    session = renewed;
    refreshedCookie = makeCookie(session);
  }
  const user = await getUser(session.access_token);
  if (!user) return null;
  const membership = await providerFetch(`/rest/v1/workspace_memberships?select=workspace_id&user_id=eq.${encodeURIComponent(user.id)}&workspace_id=eq.${encodeURIComponent(tenantId)}&limit=1`, session.access_token);
  if (!membership.ok) return null;
  const rows = await membership.json() as { workspace_id: string }[];
  if (!Array.isArray(rows)) return null;
  if (!rows.some((row) => row.workspace_id === tenantId)) return null;
  return { tenantId, user, accessToken: session.access_token, ...(refreshedCookie ? { refreshedCookie } : {}) };
}

export function setHostedCookie(response: Response, cookie: string) { response.headers.append("Set-Cookie", cookie); }
export function clearHostedCookie(response: Response) { response.headers.append("Set-Cookie", clearCookie()); }

export async function hostedSession(request: Request) {
  const session = readHostedSession(request);
  if (!session) return null;
  const access = await workspaceAccessForUser(request);
  if (!access) return null;
  return access;
}

async function workspaceAccessForUser(request: Request): Promise<{ user: HostedUser; tenantIds: string[]; cookie?: string } | null> {
  let session = readHostedSession(request);
  if (!session) return null;
  let cookie: string | undefined;
  if (session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    const renewed = await refresh(session);
    if (!renewed) return null;
    session = renewed;
    cookie = makeCookie(session);
  }
  const user = await getUser(session.access_token);
  if (!user) return null;
  const membership = await providerFetch(`/rest/v1/workspace_memberships?select=workspace_id&user_id=eq.${encodeURIComponent(user.id)}`, session.access_token);
  if (!membership.ok) return null;
  const rows = await membership.json() as { workspace_id: string }[];
  if (!Array.isArray(rows) || !rows.length) return null;
  return { user, tenantIds: rows.map((row) => row.workspace_id), ...(cookie ? { cookie } : {}) };
}

export async function hostedReports(access: WorkspaceAccess): Promise<Report[]> {
  const response = await providerFetch(`/rest/v1/reports?select=*&workspace_id=eq.${encodeURIComponent(access.tenantId)}&order=created_at.desc`, access.accessToken);
  if (!response.ok) throw new Error(`Could not load reports from Supabase (${response.status}).`);
  const rows = await response.json() as Record<string, unknown>[];
  return rows.map(rowToReport);
}

export async function hostedCreateReport(access: WorkspaceAccess, input: Pick<Report, "title" | "customer" | "email" | "product" | "description" | "priority">): Promise<Report> {
  const now = new Date().toISOString();
  const payload = {
    id: `SIG-${randomUUID().slice(0, 8).toUpperCase()}`, workspace_id: access.tenantId,
    title: input.title, customer: input.customer, email: input.email, product: input.product,
    description: input.description, priority: input.priority, status: "Investigating",
    issue: "Not linked", created_at: now, updated_at: now,
  };
  const response = await providerFetch("/rest/v1/reports", access.accessToken, { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Could not save report in Supabase (${response.status}).`);
  const rows = await response.json() as Record<string, unknown>[];
  if (!rows[0]) throw new Error("Supabase saved no report row.");
  return rowToReport(rows[0]);
}

export async function hostedUpdateReport(access: WorkspaceAccess, reportId: string, status: ReportStatus): Promise<Report | null> {
  const response = await providerFetch(`/rest/v1/reports?id=eq.${encodeURIComponent(reportId)}&workspace_id=eq.${encodeURIComponent(access.tenantId)}`, access.accessToken, {
    method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Could not update report in Supabase (${response.status}).`);
  const rows = await response.json() as Record<string, unknown>[];
  return rows[0] ? rowToReport(rows[0]) : null;
}

export async function hostedFindReport(access: WorkspaceAccess, reportId: string): Promise<Report | null> {
  const response = await providerFetch(`/rest/v1/reports?select=*&id=eq.${encodeURIComponent(reportId)}&workspace_id=eq.${encodeURIComponent(access.tenantId)}&limit=1`, access.accessToken);
  if (!response.ok) throw new Error(`Could not load report from Supabase (${response.status}).`);
  const rows = await response.json() as Record<string, unknown>[];
  return rows[0] ? rowToReport(rows[0]) : null;
}

function rowToReport(row: Record<string, unknown>): Report {
  const status = row.status;
  const priority = row.priority;
  if (typeof row.id !== "string" || typeof row.workspace_id !== "string" || typeof row.title !== "string" || typeof row.customer !== "string" || typeof row.email !== "string" || typeof row.product !== "string" || typeof row.description !== "string" || !["Investigating", "In progress", "Fixed"].includes(String(status)) || !["High", "Medium", "Low"].includes(String(priority))) throw new Error("A report row has an invalid shape.");
  return {
    id: row.id, tenantId: row.workspace_id, title: row.title, customer: row.customer,
    initials: row.customer.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    email: row.email, product: row.product, status: status as ReportStatus,
    priority: priority as Report["priority"], issue: typeof row.issue === "string" ? row.issue : "Not linked",
    created: String(row.created_at ?? ""), lastUpdate: String(row.updated_at ?? row.created_at ?? ""), description: row.description,
  };
}

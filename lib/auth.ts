import { createHmac, timingSafeEqual } from "node:crypto";

export const sessionCookieName = "signal_session";
const sessionLifetimeSeconds = 60 * 60 * 8;
export type TenantId = "northstar" | "orbit";
export type WorkspaceSession = { tenantId: TenantId; expiresAt: number };

function sessionSecret() {
  const secret = process.env.SIGNAL_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SIGNAL_SESSION_SECRET must contain at least 32 characters.");
  return secret;
}

function signature(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function passwordForTenant(tenantId: TenantId) {
  return process.env[tenantId === "northstar" ? "SIGNAL_NORTHSTAR_PASSWORD" : "SIGNAL_ORBIT_PASSWORD"];
}

export function checkPassword(tenantId: TenantId, password: string) {
  const expected = passwordForTenant(tenantId);
  if (!expected || password.length > 256) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSession(tenantId: TenantId) {
  const expiresAt = Math.floor(Date.now() / 1000) + sessionLifetimeSeconds;
  const payload = Buffer.from(JSON.stringify({ tenantId, expiresAt } satisfies WorkspaceSession)).toString("base64url");
  return { value: `${payload}.${signature(payload)}`, maxAge: sessionLifetimeSeconds };
}

export function readSession(request: Request): WorkspaceSession | null {
  try {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const raw = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookieName}=`))?.slice(sessionCookieName.length + 1);
    if (!raw) return null;
    const [payload, suppliedSignature] = raw.split(".");
    if (!payload || !suppliedSignature) return null;
    const expected = Buffer.from(signature(payload));
    const supplied = Buffer.from(suppliedSignature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as WorkspaceSession;
    if ((session.tenantId !== "northstar" && session.tenantId !== "orbit") || !Number.isInteger(session.expiresAt) || session.expiresAt <= Date.now() / 1000) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookie(value: string, maxAge: number) {
  return `${sessionCookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function tenantForRequest(request: Request, tenantId: string) {
  const session = readSession(request);
  return session?.tenantId === tenantId ? session : null;
}

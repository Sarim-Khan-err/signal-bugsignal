import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;
const GITHUB_ISSUE_URL = /^https:\/\/github\.com\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})\/issues\/(\d+)\/?$/;

function secretMatches(request: Request, expected: string) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!supplied) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const callbackSecret = process.env.FASTN_CALLBACK_SECRET;
  if (!callbackSecret || callbackSecret.length < 32) {
    return NextResponse.json({ error: "Callback is not configured" }, { status: 503 });
  }
  if (!secretMatches(request, callbackSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "Invalid callback payload" }, { status: 400 });

  const { reportId, tenantId, issueNumber, issueUrl } = payload as Record<string, unknown>;
  if (typeof reportId !== "string" || !/^SIG-[A-F0-9]{8}$/i.test(reportId) || (tenantId !== "northstar" && tenantId !== "orbit") || typeof issueUrl !== "string" || typeof issueNumber !== "number" || !Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    return NextResponse.json({ error: "Missing or invalid report, workspace, or issue fields" }, { status: 400 });
  }
  const match = GITHUB_ISSUE_URL.exec(issueUrl);
  if (!match || Number(match[3]) !== issueNumber) return NextResponse.json({ error: "Invalid GitHub issue URL" }, { status: 400 });

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Database callback is not configured" }, { status: 503 });

  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
  const issue = `${match[1]}/${match[2]}#${issueNumber}`;
  const filter = `id=eq.${encodeURIComponent(reportId)}&workspace_id=eq.${encodeURIComponent(tenantId)}`;
  const update = await fetch(`${supabaseUrl}/rest/v1/reports?${filter}&issue=eq.${encodeURIComponent("Not linked")}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({ issue, updated_at: new Date().toISOString() }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  if (!update) return NextResponse.json({ error: "Database is temporarily unavailable" }, { status: 503 });
  if (!update.ok) return NextResponse.json({ error: "Could not save the GitHub issue link" }, { status: 502 });
  const rows = await update.json().catch(() => []);
  if (Array.isArray(rows) && rows.length) return NextResponse.json({ ok: true, reportId, issue, issueUrl });

  // Fastn may retry after a timeout. Treat the same already-saved issue as success.
  const existing = await fetch(`${supabaseUrl}/rest/v1/reports?select=issue&id=eq.${encodeURIComponent(reportId)}&workspace_id=eq.${encodeURIComponent(tenantId)}&limit=1`, {
    headers, cache: "no-store", signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  if (!existing?.ok) return NextResponse.json({ error: "Could not verify the report link" }, { status: 502 });
  const found = await existing.json().catch(() => []);
  if (Array.isArray(found) && found[0]?.issue === issue) return NextResponse.json({ ok: true, reportId, issue, issueUrl, duplicate: true });
  if (Array.isArray(found) && found.length) return NextResponse.json({ error: "Report is already linked to a different issue" }, { status: 409 });
  return NextResponse.json({ error: "Report not found in the specified workspace" }, { status: 404 });
}

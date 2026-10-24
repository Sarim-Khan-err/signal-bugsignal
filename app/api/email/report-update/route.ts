import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { findReport, isTenantId } from "@/lib/store";
import { hostedAuthConfigured, hostedFindReport, setHostedCookie, workspaceAccess } from "@/lib/hosted";
import { tenantForRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SIGNAL_FROM_EMAIL;
  if (!apiKey || !from) return NextResponse.json({ error: "Email delivery is not configured yet. Add RESEND_API_KEY and SIGNAL_FROM_EMAIL on the server." }, { status: 503 });
  const body: unknown = await request.json().catch(() => null);
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (typeof input.tenantId !== "string" || !isTenantId(input.tenantId) || typeof input.reportId !== "string" || input.reportId.length > 64) return NextResponse.json({ error: "Choose a valid report." }, { status: 400 });

  const access = hostedAuthConfigured() ? await workspaceAccess(request, input.tenantId) : null;
  if (hostedAuthConfigured() ? !access : !tenantForRequest(request, input.tenantId)) return NextResponse.json({ error: "Sign in to this workspace before sending a customer update." }, { status: 401 });
  const report = access ? await hostedFindReport(access, input.reportId) : await findReport(input.tenantId, input.reportId);
  if (!report) return NextResponse.json({ error: "Report not found in this workspace." }, { status: 404 });

  const subject = `Update on your report ${report.id}: ${report.title}`;
  const text = `Hi ${report.customer},\n\nYour report “${report.title}” is currently marked ${report.status.toLowerCase()}. We’ll keep you updated as it moves forward.\n\n— Signal`;
  const html = `<p>Hi ${escapeHtml(report.customer)},</p><p>Your report <strong>${escapeHtml(report.title)}</strong> (<code>${escapeHtml(report.id)}</code>) is currently marked <strong>${escapeHtml(report.status.toLowerCase())}</strong>.</p><p>We’ll keep you updated as it moves forward.</p><p>— Signal</p>`;
  const idempotencyKey = createHash("sha256").update(`${input.tenantId}:${report.id}:${report.status}:${report.lastUpdate}`).digest("hex");
  let delivery: Response;
  try {
    delivery = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from, to: [report.email], subject, text, html }), cache: "no-store",
    });
  } catch (error) {
    console.error("Resend request failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Email provider could not be reached. Try again." }, { status: 502 });
  }
  const result = await delivery.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
  if (!delivery.ok) {
    console.error("Resend rejected customer update", delivery.status, result.name ?? "provider_error");
    return NextResponse.json({ error: "Email provider rejected the update. Check the verified sender address and Resend account." }, { status: 502 });
  }
  const response = NextResponse.json({ sent: true, emailId: result.id });
  if (access?.refreshedCookie) setHostedCookie(response, access.refreshedCookie);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

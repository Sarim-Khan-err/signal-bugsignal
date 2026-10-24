import { NextResponse } from "next/server";
import { isTenantId, updateReport, type ReportStatus } from "@/lib/store";
import { tenantForRequest } from "@/lib/auth";
import { hostedAuthConfigured, hostedUpdateReport, setHostedCookie, workspaceAccess } from "@/lib/hosted";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const statuses = new Set<ReportStatus>(["Investigating", "In progress", "Fixed"]);

type Context = { params: Promise<{ tenantId: string; reportId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { tenantId, reportId } = await params;
  if (!isTenantId(tenantId)) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  const access = hostedAuthConfigured() ? await workspaceAccess(request, tenantId) : null;
  if (hostedAuthConfigured() ? !access : !tenantForRequest(request, tenantId)) return NextResponse.json({ error: "Sign in to this workspace to update reports." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const status = body && typeof body === "object" ? (body as Record<string, unknown>).status : undefined;
  if (typeof status !== "string" || !statuses.has(status as ReportStatus)) {
    return NextResponse.json({ error: "Choose a valid report status" }, { status: 400 });
  }
  const report = access ? await hostedUpdateReport(access, reportId, status as ReportStatus) : await updateReport(tenantId, reportId, status as ReportStatus);
  if (!report) return NextResponse.json({ error: "Report not found in this workspace" }, { status: 404 });
  const response = NextResponse.json({ report }, { headers: { "Cache-Control": "no-store" } });
  if (access?.refreshedCookie) setHostedCookie(response, access.refreshedCookie);
  return response;
}

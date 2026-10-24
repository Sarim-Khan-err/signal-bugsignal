import { NextResponse } from "next/server";
import { createReport, isTenantId, listReports } from "@/lib/store";
import { tenantForRequest } from "@/lib/auth";
import { sendReportCreatedToFastn } from "@/lib/fastn-workflow";
import { hostedAuthConfigured, hostedCreateReport, hostedReports, setHostedCookie, workspaceAccess } from "@/lib/hosted";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { tenantId } = await params;
  if (!isTenantId(tenantId)) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (hostedAuthConfigured()) {
    const access = await workspaceAccess(_request, tenantId);
    if (!access) return NextResponse.json({ error: "Sign in to a member account to view this workspace's reports." }, { status: 401 });
    const response = NextResponse.json({ reports: await hostedReports(access) });
    if (access.refreshedCookie) setHostedCookie(response, access.refreshedCookie);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  if (!tenantForRequest(_request, tenantId)) return NextResponse.json({ error: "Sign in to this workspace to view its reports." }, { status: 401 });
  return NextResponse.json({ reports: await listReports(tenantId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: Context) {
  const { tenantId } = await params;
  if (!isTenantId(tenantId)) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  const access = hostedAuthConfigured() ? await workspaceAccess(request, tenantId) : null;
  if (hostedAuthConfigured() ? !access : !tenantForRequest(request, tenantId)) return NextResponse.json({ error: "Sign in to this workspace to add reports." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const input = body as Record<string, unknown>;
  const fields = ["title", "customer", "email", "product", "description"] as const;
  for (const field of fields) {
    if (typeof input[field] !== "string" || !input[field].trim()) {
      return NextResponse.json({ error: `${field} is required` }, { status: 400 });
    }
    if ((input[field] as string).length > (field === "description" ? 5000 : 180)) {
      return NextResponse.json({ error: `${field} is too long` }, { status: 400 });
    }
  }
  const email = input.email as string;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  const priority = input.priority;
  if (priority !== "High" && priority !== "Medium" && priority !== "Low") {
    return NextResponse.json({ error: "Choose a valid priority" }, { status: 400 });
  }
  const reportInput = {
    title: (input.title as string).trim(),
    customer: (input.customer as string).trim(),
    email: email.trim(),
    product: (input.product as string).trim(),
    description: (input.description as string).trim(),
    priority,
  } as const;
  const report = access ? await hostedCreateReport(access, reportInput) : await createReport(tenantId, reportInput);
  const fastnDelivery = await sendReportCreatedToFastn(tenantId, report);
  const response = NextResponse.json({ report, fastnDelivery }, { status: 201, headers: { "Cache-Control": "no-store" } });
  if (access?.refreshedCookie) setHostedCookie(response, access.refreshedCookie);
  return response;
}

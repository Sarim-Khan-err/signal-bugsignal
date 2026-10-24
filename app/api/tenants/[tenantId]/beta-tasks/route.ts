import { NextResponse } from "next/server";
import { hostedAuthConfigured, hostedBetaTasks, hostedCreateBetaTask, setHostedCookie, workspaceAccess } from "@/lib/hosted";
import { isTenantId } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { tenantId } = await params;
  if (!isTenantId(tenantId)) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (!hostedAuthConfigured()) return NextResponse.json({ error: "Beta testing requires the hosted Supabase account." }, { status: 503 });
  const access = await workspaceAccess(request, tenantId);
  if (!access) return NextResponse.json({ error: "Sign in to a workspace member account." }, { status: 401 });
  try {
    const response = NextResponse.json({ tasks: await hostedBetaTasks(access) }, { headers: { "Cache-Control": "no-store" } });
    if (access.refreshedCookie) setHostedCookie(response, access.refreshedCookie);
    return response;
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load beta tasks" }, { status: 502 }); }
}

export async function POST(request: Request, { params }: Context) {
  const { tenantId } = await params;
  if (!isTenantId(tenantId)) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (!hostedAuthConfigured()) return NextResponse.json({ error: "Beta testing requires the hosted Supabase account." }, { status: 503 });
  const access = await workspaceAccess(request, tenantId);
  if (!access) return NextResponse.json({ error: "Sign in to a workspace member account." }, { status: 401 });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input || typeof input.title !== "string" || typeof input.description !== "string" || typeof input.product !== "string") return NextResponse.json({ error: "Title, task brief, and product area are required." }, { status: 400 });
  const title = input.title.trim(), description = input.description.trim(), product = input.product.trim();
  if (!title || title.length > 160 || !description || description.length > 3000 || !product || product.length > 100) return NextResponse.json({ error: "Check the task fields and length limits." }, { status: 400 });
  try {
    const task = await hostedCreateBetaTask(access, { title, description, product });
    const response = NextResponse.json({ task }, { status: 201, headers: { "Cache-Control": "no-store" } });
    if (access.refreshedCookie) setHostedCookie(response, access.refreshedCookie);
    return response;
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create beta task" }, { status: 502 }); }
}

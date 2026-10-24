import { NextResponse } from "next/server";
import { hostedAuthConfigured, hostedJoinBetaTask, hostedUpdateBetaTask, setHostedCookie, workspaceAccess, type BetaTask } from "@/lib/hosted";
import { isTenantId } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ tenantId: string; taskId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { tenantId, taskId } = await params;
  if (!isTenantId(tenantId)) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (!hostedAuthConfigured()) return NextResponse.json({ error: "Beta testing requires the hosted Supabase account." }, { status: 503 });
  const access = await workspaceAccess(request, tenantId);
  if (!access) return NextResponse.json({ error: "Sign in to a workspace member account." }, { status: 401 });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  try {
    if (input?.action === "join") await hostedJoinBetaTask(access, taskId);
    else if (input?.action === "status" && ["Open", "In progress", "Completed"].includes(String(input.status))) await hostedUpdateBetaTask(access, taskId, input.status as BetaTask["status"]);
    else return NextResponse.json({ error: "Choose join or a valid task status." }, { status: 400 });
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    if (access.refreshedCookie) setHostedCookie(response, access.refreshedCookie);
    return response;
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update beta task" }, { status: 502 }); }
}

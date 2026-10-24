import { NextResponse } from "next/server";
import { mintEmbedToken } from "@fastn-ai/embed/server";
import { readSession } from "@/lib/auth";
import { hostedAuthConfigured, setHostedCookie, workspaceAccess } from "@/lib/hosted";
import { isTenantId } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const tenantId = body && typeof body === "object" ? (body as Record<string, unknown>).tenantId : undefined;
  if (typeof tenantId !== "string" || !isTenantId(tenantId)) return NextResponse.json({ error: "Choose a valid workspace." }, { status: 400 });
  const access = hostedAuthConfigured() ? await workspaceAccess(request, tenantId) : null;
  const localSession = hostedAuthConfigured() ? null : readSession(request);
  if (hostedAuthConfigured() ? !access : localSession?.tenantId !== tenantId) return NextResponse.json({ error: "Sign in before connecting workspace apps." }, { status: 401 });
  if (!process.env.FASTN_API_KEY) return NextResponse.json({ error: "Fastn server credentials are missing. Add FASTN_API_KEY to the private server environment." }, { status: 503 });
  try {
    const tenant = tenantId === "northstar" ? { customerName: "Northstar Cloud" } : { customerName: "Orbit Analytics" };
    const customerId = `signal-${tenantId}`;
    const minted = await mintEmbedToken({
      customerId,
      customerName: tenant.customerName,
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("x-end-org-id", customerId);
        return fetch(input, { ...init, headers });
      },
    });
    const response = NextResponse.json(minted);
    if (access?.refreshedCookie) setHostedCookie(response, access.refreshedCookie);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const fastnError = error as Error & { status?: number; code?: string; hint?: string; detail?: unknown };
    console.error("Fastn embed token request failed", JSON.stringify({
      message: fastnError.message,
      status: fastnError.status,
      code: fastnError.code,
      hint: fastnError.hint,
      detail: fastnError.detail,
    }));
    return NextResponse.json({ error: "Fastn could not issue a workspace token. Check the server API key and its customer provisioning permissions." }, { status: 502 });
  }
}

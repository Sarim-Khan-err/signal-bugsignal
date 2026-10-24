import { NextResponse } from "next/server";
import { completeHostedSetup, hostedAuthConfigured, setHostedCookie } from "@/lib/hosted";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hostedAuthConfigured()) return NextResponse.json({ error: "Hosted accounts are not configured." }, { status: 503 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.accessToken !== "string" || body.accessToken.length > 8192 || typeof body.refreshToken !== "string" || body.refreshToken.length > 8192 || typeof body.expiresIn !== "number" || !Number.isInteger(body.expiresIn) || body.expiresIn < 60 || body.expiresIn > 86400 || typeof body.password !== "string" || body.password.length < 12 || body.password.length > 256) {
    return NextResponse.json({ error: "Use a password between 12 and 256 characters, then try again." }, { status: 400 });
  }
  try {
    const result = await completeHostedSetup(body.accessToken, body.refreshToken, body.expiresIn, body.password);
    const response = NextResponse.json({ authenticated: true, authMode: "supabase", tenantIds: result.tenantIds, tenantId: result.tenantIds[0], email: result.user.email });
    setHostedCookie(response, result.cookie);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not complete account setup." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}


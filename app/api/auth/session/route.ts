import { NextResponse } from "next/server";
import { readSession, sessionCookie } from "@/lib/auth";
import { clearHostedCookie, hostedAuthConfigured, hostedSession, setHostedCookie } from "@/lib/hosted";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (hostedAuthConfigured()) {
    const hosted = await hostedSession(request);
    if (!hosted) {
      const response = NextResponse.json({ authenticated: false, authMode: "supabase" }, { status: 401 });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    const response = NextResponse.json({ authenticated: true, authMode: "supabase", tenantIds: hosted.tenantIds, tenantId: hosted.tenantIds[0], email: hosted.user.email });
    if (hosted.cookie) setHostedCookie(response, hosted.cookie);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const session = readSession(request);
  if (!session) {
    const response = NextResponse.json({ authenticated: false }, { status: 401 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const response = NextResponse.json({ authenticated: true, tenantId: session.tenantId });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ signedOut: true });
  response.headers.set("Set-Cookie", sessionCookie("", 0));
  clearHostedCookie(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

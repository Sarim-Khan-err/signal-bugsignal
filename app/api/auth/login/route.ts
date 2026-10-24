import { NextResponse } from "next/server";
import { checkPassword, createSession, sessionCookie } from "@/lib/auth";
import { isTenantId } from "@/lib/store";
import { clearHostedCookie, hostedAuthConfigured, signInWithPassword } from "@/lib/hosted";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; resetsAt: number }>();

export async function POST(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const window = attempts.get(forwardedFor);
  if (window && window.resetsAt > now && window.count >= 10) {
    return NextResponse.json({ error: "Too many sign-in attempts. Wait a few minutes and try again." }, { status: 429 });
  }

  const body: unknown = await request.json().catch(() => null);
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const tenantId = input.tenantId;
  const password = input.password;
  try {
    if (hostedAuthConfigured()) {
      if (typeof input.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || typeof password !== "string" || password.length > 256) {
        return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
      }
      const result = await signInWithPassword(input.email.trim().toLowerCase(), password);
      if (!result.tenantIds.length) return NextResponse.json({ error: "This account has no workspace access yet. Ask a workspace admin to add you." }, { status: 403 });
      const selected = typeof tenantId === "string" && result.tenantIds.includes(tenantId) ? tenantId : result.tenantIds[0];
      const response = NextResponse.json({ tenantId: selected, tenantIds: result.tenantIds, email: result.user.email, authMode: "supabase" });
      response.headers.set("Set-Cookie", result.cookie);
      response.headers.append("Set-Cookie", sessionCookie("", 0));
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Hosted account sign-in is required in production. Configure Supabase first." }, { status: 503 });
    if (typeof tenantId !== "string" || !isTenantId(tenantId) || typeof password !== "string") return NextResponse.json({ error: "Choose a workspace and enter its local preview password." }, { status: 400 });
    if (!process.env.SIGNAL_SESSION_SECRET || process.env.SIGNAL_SESSION_SECRET.length < 32 || !process.env.SIGNAL_NORTHSTAR_PASSWORD || !process.env.SIGNAL_ORBIT_PASSWORD) {
      return NextResponse.json({ error: "Workspace sign-in is not configured. Add the required values from .env.example and restart the app." }, { status: 503 });
    }
    if (!checkPassword(tenantId, password)) {
      attempts.set(forwardedFor, { count: (window?.resetsAt && window.resetsAt > now ? window.count : 0) + 1, resetsAt: window?.resetsAt && window.resetsAt > now ? window.resetsAt : now + 15 * 60_000 });
      return NextResponse.json({ error: "That password did not match this workspace." }, { status: 401 });
    }
    attempts.delete(forwardedFor);
    const session = createSession(tenantId);
    const response = NextResponse.json({ tenantId, authMode: "local" });
    response.headers.set("Set-Cookie", sessionCookie(session.value, session.maxAge));
    clearHostedCookie(response);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Workspace sign-in is unavailable", error);
    return NextResponse.json({ error: "Workspace sign-in is not configured correctly." }, { status: 503 });
  }
}

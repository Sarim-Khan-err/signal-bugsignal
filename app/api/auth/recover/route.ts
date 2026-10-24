import { NextResponse } from "next/server";
import { hostedAuthConfigured, sendPasswordRecovery } from "@/lib/hosted";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hostedAuthConfigured()) return NextResponse.json({ error: "Password recovery is not configured." }, { status: 503 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = body?.email;
  if (typeof email !== "string" || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: "Enter the email address for your account." }, { status: 400 });
  }
  try {
    await sendPasswordRecovery(email.trim().toLowerCase());
    return NextResponse.json({ sent: true, message: "If an account matches that email, a fresh password reset link is on its way." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Password recovery email could not be sent", error);
    return NextResponse.json({ error: "Could not send a password reset email right now. Please try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}


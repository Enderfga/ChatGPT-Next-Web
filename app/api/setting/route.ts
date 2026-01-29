import { NextResponse } from "next/server";

export async function GET() {
  const adminUrl = process.env.CLAWDBOT_ADMIN_URL || "http://localhost:18789";
  return NextResponse.redirect(adminUrl);
}

export const runtime = "edge";

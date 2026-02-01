import { NextResponse } from "next/server";

export async function GET() {
  const adminUrl = process.env.CLAWDBOT_ADMIN_URL || "https://api.enderfga.cn";
  const cfId = process.env.CF_ACCESS_CLIENT_ID;
  const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  if (!cfId || !cfSecret) {
    return NextResponse.json({
      ok: false,
      state: "offline",
      message: "Not configured",
    });
  }

  try {
    const authToken = process.env.CODE || "";
    const res = await fetch(`${adminUrl}/sasha-doctor/status`, {
      headers: {
        "CF-Access-Client-Id": cfId,
        "CF-Access-Client-Secret": cfSecret,
        Authorization: `Bearer ${authToken}`,
        "Cache-Control": "no-cache",
      },
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        ok: true,
        ...data,
        timestamp: Date.now(),
      });
    }

    return NextResponse.json({
      ok: false,
      state: "offline",
      message: "Failed to fetch status",
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      state: "offline",
      message: "Connection error",
    });
  }
}

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // 通过 Cloudflare Tunnel 访问 sasha-doctor
  const adminUrl = process.env.CLAWDBOT_ADMIN_URL || "https://api.enderfga.cn";
  const docsUrl = `${adminUrl}/sasha-doctor/docs`;

  try {
    console.log("[Docs API] Fetching from:", docsUrl);
    const res = await fetch(docsUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      // 不缓存，确保获取最新内容
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("[Docs API] Response not ok:", res.status);
      return NextResponse.json(
        { error: `Failed to fetch docs: ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Docs API] Error:", error);
    return NextResponse.json(
      { error: "Failed to connect to sasha-doctor" },
      { status: 500 },
    );
  }
}

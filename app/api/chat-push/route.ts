import { NextRequest, NextResponse } from "next/server";

// Chat Push API - 转发到 sasha-doctor 的 chat-push
// 解决 Vercel 10秒超时问题
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Determine backend URL based on environment
    const host = req.headers.get("host") || "";
    const isLocal = host.includes("localhost") || host.includes("127.0.0.1");

    const chatPushUrl = isLocal
      ? "http://localhost:18795/sasha-doctor/chat-push"
      : "https://api.enderfga.cn/sasha-doctor/chat-push";

    console.log("[ChatPush] Forwarding to:", chatPushUrl);
    console.log("[ChatPush] Session:", body.sessionId?.slice(0, 8));
    console.log("[ChatPush] Model:", body.model);

    const res = await fetch(chatPushUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[ChatPush] Backend error:", res.status, errText);
      return NextResponse.json(
        { error: { message: errText, status: res.status } },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[ChatPush] Exception:", err);
    return NextResponse.json(
      { error: { message: err.message || "Unknown error" } },
      { status: 500 },
    );
  }
}

export const runtime = "edge";

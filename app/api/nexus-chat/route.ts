import { NextRequest, NextResponse } from "next/server";

// Nexus chat API - connects to openclaw gateway
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Determine gateway URL based on environment
    const host = req.headers.get("host") || "";
    const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
    // Local: direct to gateway, Remote: through cloudflare tunnel (default route)
    const gatewayUrl = isLocal
      ? "http://localhost:18789/v1/chat/completions"
      : "https://api.enderfga.cn/v1/chat/completions";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (isLocal) {
      // Local: use gateway password from env
      const password = process.env.OPENCLAW_GATEWAY_PASSWORD || "";
      if (password) {
        headers["Authorization"] = `Bearer ${password}`;
      }
    } else {
      // Remote: use CF Access headers
      const cfId = process.env.CF_ACCESS_CLIENT_ID;
      const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET;
      const authToken = process.env.CODE || "";

      if (cfId && cfSecret) {
        headers["CF-Access-Client-Id"] = cfId;
        headers["CF-Access-Client-Secret"] = cfSecret;
      }
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }
    }

    console.log("[Nexus Chat] Calling:", gatewayUrl);
    console.log("[Nexus Chat] Model:", body.model);

    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[Nexus Chat] Error:", res.status, errorText);
      return NextResponse.json(
        { error: { message: errorText, status: res.status } },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[Nexus Chat] Exception:", err);
    return NextResponse.json(
      { error: { message: err.message || "Unknown error" } },
      { status: 500 },
    );
  }
}

export const runtime = "edge";

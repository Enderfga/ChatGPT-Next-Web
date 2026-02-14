import { NextRequest, NextResponse } from "next/server";

// Nexus chat API - connects to openclaw gateway with STREAMING
// Supports push fallback: if streaming connection is lost (e.g., Vercel timeout),
// gateway will send response via Push API using the X-Push-Session header
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Determine gateway URL based on environment
    const host = req.headers.get("host") || "";
    const isLocal = host.includes("localhost") || host.includes("127.0.0.1");

    // Both local and remote: call gateway directly (default cloudflare route)
    const gatewayUrl = isLocal
      ? "http://localhost:18789/v1/chat/completions"
      : "https://api.enderfga.cn/v1/chat/completions";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Gateway auth - use password from env (OPENCLAW_GATEWAY_PASSWORD or CODE)
    const gatewayPassword =
      process.env.OPENCLAW_GATEWAY_PASSWORD || process.env.CODE || "";
    if (gatewayPassword) {
      headers["Authorization"] = `Bearer ${gatewayPassword}`;
    }

    // CF Access headers for remote calls
    if (!isLocal) {
      const cfId = process.env.CF_ACCESS_CLIENT_ID;
      const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET;
      if (cfId && cfSecret) {
        headers["CF-Access-Client-Id"] = cfId;
        headers["CF-Access-Client-Secret"] = cfSecret;
      }
    }

    // Pass webchat session ID for push fallback
    // When streaming connection is lost, gateway can send response via Push API
    const pushSessionId = body.sessionId || req.headers.get("x-push-session");
    if (pushSessionId) {
      headers["X-Push-Session"] = pushSessionId;
      console.log(
        "[Nexus Chat] Push fallback enabled for session:",
        pushSessionId,
      );
    }

    console.log("[Nexus Chat] isLocal:", isLocal);
    console.log("[Nexus Chat] Calling:", gatewayUrl);
    console.log("[Nexus Chat] Model:", body.model);

    // Force streaming to avoid Vercel timeout
    const requestBody = { ...body, stream: true };

    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[Nexus Chat] Error:", res.status, errorText);
      return NextResponse.json(
        { error: { message: errorText, status: res.status } },
        { status: res.status },
      );
    }

    // Stream the response back
    return new Response(res.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("[Nexus Chat] Exception:", err);
    return NextResponse.json(
      { error: { message: err.message || "Unknown error" } },
      { status: 500 },
    );
  }
}

// Edge runtime for better streaming support (longer timeout for active streams)
export const runtime = "edge";

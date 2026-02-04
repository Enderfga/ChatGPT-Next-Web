import { NextRequest, NextResponse } from "next/server";

// Read gateway password from openclaw config
async function getGatewayPassword(): Promise<string> {
  // Try env first
  if (process.env.OPENCLAW_GATEWAY_PASSWORD) {
    return process.env.OPENCLAW_GATEWAY_PASSWORD;
  }

  // Try reading from config file (local only)
  try {
    const fs = await import("fs");
    const path = await import("path");
    const configPath = path.join(
      process.env.HOME || "/Users/fanggan",
      ".openclaw",
      "openclaw.json",
    );
    const configContent = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(configContent);
    if (config?.gateway?.password) {
      console.log("[Nexus Chat] Got gateway password from config");
      return config.gateway.password;
    }
  } catch (e) {
    // Config file not available (e.g., on Vercel)
  }

  return "";
}

// Nexus chat API - connects to openclaw gateway
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Determine gateway URL based on environment
    const host = req.headers.get("host") || "";
    const isLocal = host.includes("localhost") || host.includes("127.0.0.1");

    // Both local and remote: call gateway directly (default cloudflare route)
    // Local: localhost:18789, Remote: api.enderfga.cn (default route goes to gateway)
    const gatewayUrl = isLocal
      ? "http://localhost:18789/v1/chat/completions"
      : "https://api.enderfga.cn/v1/chat/completions";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Gateway auth - use password from env or config
    const gatewayPassword =
      (await getGatewayPassword()) || process.env.CODE || "";
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

    console.log("[Nexus Chat] isLocal:", isLocal);
    console.log("[Nexus Chat] Calling:", gatewayUrl);
    console.log("[Nexus Chat] Model:", body.model);
    console.log(
      "[Nexus Chat] Has CF headers:",
      !!headers["CF-Access-Client-Id"],
    );
    console.log("[Nexus Chat] Has Auth:", !!headers["Authorization"]);

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

// Use nodejs runtime to allow fs access for local config
export const runtime = "nodejs";

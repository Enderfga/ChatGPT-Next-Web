import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

// Cache the gateway password (read once from openclaw config)
let cachedGatewayPassword: string | null = null;

function getGatewayPassword(): string {
  if (cachedGatewayPassword !== null) return cachedGatewayPassword;

  // Try environment variable first
  if (process.env.OPENCLAW_GATEWAY_PASSWORD) {
    cachedGatewayPassword = process.env.OPENCLAW_GATEWAY_PASSWORD;
    return cachedGatewayPassword;
  }

  // Try to read from openclaw config
  try {
    const output = execSync("openclaw config get gateway.auth.password", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    // Output is the raw password string
    cachedGatewayPassword = output.replace(/^["']|["']$/g, "") || "";
    console.log("[Nexus Chat] Got gateway password from config");
  } catch (e) {
    console.log("[Nexus Chat] Failed to get gateway password:", e);
    cachedGatewayPassword = "";
  }

  return cachedGatewayPassword;
}

// Nexus chat API - connects to openclaw gateway
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Determine gateway URL based on environment
    const isLocal =
      req.headers.get("host")?.includes("localhost") ||
      req.headers.get("host")?.includes("127.0.0.1");
    const gatewayUrl = isLocal
      ? "http://localhost:18789/v1/chat/completions"
      : "https://api.enderfga.cn/gateway-api/v1/chat/completions";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (isLocal) {
      // Local: use gateway password
      const password = getGatewayPassword();
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

export const runtime = "nodejs";

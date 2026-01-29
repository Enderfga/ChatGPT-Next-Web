import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "@/app/config/server";

const serverConfig = getServerSideConfig();

export async function GET() {
  // 从环境变量获取健康检查地址，默认回退到 localhost
  const healthUrl =
    process.env.CLAWDBOT_HEALTH_URL || "http://localhost:18789/health";
  const adminUrl = process.env.CLAWDBOT_ADMIN_URL || "http://localhost:18789";

  const fetchOptions: RequestInit = {
    method: "GET",
    headers: {},
  };

  // 如果配置了 Cloudflare Access 凭据，自动注入
  if (serverConfig.cfAccessClientId && serverConfig.cfAccessClientSecret) {
    (fetchOptions.headers as any)["CF-Access-Client-Id"] =
      serverConfig.cfAccessClientId;
    (fetchOptions.headers as any)["CF-Access-Client-Secret"] =
      serverConfig.cfAccessClientSecret;
  }

  try {
    const res = await fetch(healthUrl, fetchOptions);
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        status: "online",
        adminUrl,
        details: data,
      });
    }
    // 如果返回 401/403，可能 CF Access 没配对，但也说明后端是通的
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({
        status: "online",
        adminUrl,
        message: "CF Access Error, but server is reachable",
      });
    }
    throw new Error(`Health check returned status ${res.status}`);
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "offline",
        adminUrl,
        error: error.message,
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const { action } = await req.json();
  const restartUrl =
    process.env.CLAWDBOT_RESTART_URL || "http://localhost:18789/restart";

  if (action === "restart") {
    const fetchOptions: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (serverConfig.cfAccessClientId && serverConfig.cfAccessClientSecret) {
      (fetchOptions.headers as any)["CF-Access-Client-Id"] =
        serverConfig.cfAccessClientId;
      (fetchOptions.headers as any)["CF-Access-Client-Secret"] =
        serverConfig.cfAccessClientSecret;
    }

    try {
      await fetch(restartUrl, fetchOptions);
      return NextResponse.json({ message: "Restarting..." });
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export const runtime = "edge";

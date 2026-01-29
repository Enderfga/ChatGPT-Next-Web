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
    // 关键修复：只要能返回状态码（哪怕是 403），就说明链路是通的
    if (res.status < 500) {
      return NextResponse.json({
        status: "online",
        adminUrl,
        message:
          res.status === 200 ? "OK" : `Reachable but status ${res.status}`,
      });
    }
    throw new Error(`Health check returned server error ${res.status}`);
  } catch (error: any) {
    console.error("[Health Check Error]", error.message);
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

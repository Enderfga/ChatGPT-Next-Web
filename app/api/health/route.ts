import { NextRequest, NextResponse } from "next/server";

// 安总的配置信息 - 备份/默认值
const DEFAULT_CF_ID = "8645ad22534951ab211fb96a08063d30.access";
const DEFAULT_CF_SECRET =
  "2cd9e228c0d906169a0dd7c83f22347aed6eb7fb9d1714db12c588a3e4411544";

async function handle(req: NextRequest) {
  const adminUrl = process.env.CLAWDBOT_ADMIN_URL || "https://api.enderfga.cn";
  const healthUrl = `${adminUrl}/health`;

  const cfId = process.env.CF_ACCESS_CLIENT_ID || DEFAULT_CF_ID;
  const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET || DEFAULT_CF_SECRET;

  try {
    // 如果是 POST 请求，执行重启
    if (req.method === "POST") {
      const { action } = await req.json();
      if (action === "restart") {
        await fetch(`${adminUrl}/api/gateway?action=restart`, {
          method: "POST",
          headers: {
            "CF-Access-Client-Id": cfId,
            "CF-Access-Client-Secret": cfSecret,
          },
        });
        return NextResponse.json({ status: "restarting" });
      }
    }

    // 执行健康检查
    const res = await fetch(healthUrl, {
      headers: {
        "CF-Access-Client-Id": cfId,
        "CF-Access-Client-Secret": cfSecret,
      },
      cache: "no-store",
      next: { revalidate: 0 },
    });

    // 只要能访问到（不管是 200 还是 Cloudflare 的拦截码），都说明隧道是通的
    if (res.status < 500) {
      return NextResponse.json({
        status: "online",
        adminUrl,
        statusCode: res.status,
      });
    }

    return NextResponse.json({ status: "offline" }, { status: 503 });
  } catch (e) {
    console.error("[Health] Check failed", e);
    return NextResponse.json({ status: "offline" }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
export const runtime = "edge";

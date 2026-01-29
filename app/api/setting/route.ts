import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // 优先读取环境变量，没有则跳到 api.enderfga.cn
  const adminUrl = process.env.CLAWDBOT_ADMIN_URL || "https://api.enderfga.cn";

  // 执行 307 临时重定向，方便安总直接访问后台
  return NextResponse.redirect(adminUrl, 307);
}

export const runtime = "edge";

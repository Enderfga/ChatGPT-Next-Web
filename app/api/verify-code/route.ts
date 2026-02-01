import { NextRequest, NextResponse } from "next/server";
import md5 from "spark-md5";
import { getServerSideConfig } from "@/app/config/server";

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!code) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    const serverConfig = getServerSideConfig();

    // 如果没有启用访问控制，直接返回 true
    if (!serverConfig.needCode) {
      return NextResponse.json({ valid: true });
    }

    const hashedCode = md5.hash(code).trim();
    const isValid = serverConfig.codes.has(hashedCode);

    return NextResponse.json({ valid: isValid });
  } catch (e) {
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}

export const runtime = "edge";

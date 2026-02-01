import { NextRequest, NextResponse } from "next/server";

const SASHA_DOCTOR_URL =
  process.env.SASHA_DOCTOR_URL || "http://127.0.0.1:18795";

export async function GET(req: NextRequest) {
  try {
    // 从 sasha-doctor 获取文档内容
    const res = await fetch(`${SASHA_DOCTOR_URL}/sasha-doctor/docs`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch docs" },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Docs API] Error:", error);
    return NextResponse.json(
      { error: "Failed to connect to sasha-doctor" },
      { status: 500 },
    );
  }
}

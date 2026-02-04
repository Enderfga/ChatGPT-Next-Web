import { NextResponse } from "next/server";

const SASHA_DOCTOR_URL =
  process.env.SASHA_DOCTOR_URL || "http://127.0.0.1:18795/sasha-doctor";
const ACCESS_CODE = process.env.CODE || "";

export async function GET() {
  try {
    const response = await fetch(`${SASHA_DOCTOR_URL}/notion/summary`, {
      headers: {
        Authorization: `Bearer ${ACCESS_CODE}`,
      },
      // 5 second timeout
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch from sasha-doctor" },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[notion-summary] Error:", error.message);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const adminUrl = process.env.CLAWDBOT_ADMIN_URL || "https://api.enderfga.cn";
  const docsUrl = `${adminUrl}/sasha-doctor/docs`;

  const cfId = process.env.CF_ACCESS_CLIENT_ID;
  const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  if (!cfId || !cfSecret) {
    return NextResponse.json(
      {
        error: "CF Access credentials not configured",
        cfId: !!cfId,
        cfSecret: !!cfSecret,
      },
      { status: 500 },
    );
  }

  try {
    console.log("[Docs API] Fetching from:", docsUrl);
    const res = await fetch(docsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "CF-Access-Client-Id": cfId,
        "CF-Access-Client-Secret": cfSecret,
      },
      cache: "no-store",
    });

    console.log("[Docs API] Response status:", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error(
        "[Docs API] Response not ok:",
        res.status,
        text.substring(0, 200),
      );
      return NextResponse.json(
        {
          error: `Failed to fetch docs: ${res.status}`,
          body: text.substring(0, 100),
        },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Docs API] Error:", error.message || error);
    return NextResponse.json(
      {
        error: "Failed to connect to sasha-doctor",
        detail: error.message || String(error),
      },
      { status: 500 },
    );
  }
}

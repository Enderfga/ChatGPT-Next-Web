import { NextRequest, NextResponse } from "next/server";
import { list, del } from "@vercel/blob";

const RETENTION_DAYS = 7;

export async function GET(req: NextRequest) {
  // Verify cron secret for security
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    let deleted = 0;
    let cursor: string | undefined;

    // Paginate through all blobs
    do {
      const { blobs, cursor: nextCursor } = await list({
        prefix: "uploads/",
        cursor,
      });

      for (const blob of blobs) {
        if (blob.uploadedAt < cutoffDate) {
          await del(blob.url);
          deleted++;
        }
      }

      cursor = nextCursor;
    } while (cursor);

    return NextResponse.json({
      success: true,
      deleted,
      cutoffDate: cutoffDate.toISOString(),
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json(
      { error: "Cleanup failed: " + (error as Error).message },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs"; // Need Node.js for list/del

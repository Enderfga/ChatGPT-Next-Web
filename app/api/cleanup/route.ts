import { NextRequest, NextResponse } from "next/server";

const DEFAULT_RETENTION_DAYS = 7;

export async function GET(req: NextRequest) {
  // Verify cron secret for security
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Allow override for testing (e.g., ?days=0 to delete all)
  const daysParam = req.nextUrl.searchParams.get("days");
  const retentionDays =
    daysParam !== null ? parseInt(daysParam, 10) : DEFAULT_RETENTION_DAYS;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN not set" },
      { status: 500 },
    );
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let deleted = 0;
    let checked = 0;
    let cursor: string | undefined;
    let debugBlobs: any[] = [];

    // Paginate through all blobs using REST API
    do {
      const listUrl = new URL("https://blob.vercel-storage.com");
      listUrl.searchParams.set("prefix", "uploads/");
      if (cursor) listUrl.searchParams.set("cursor", cursor);

      const listRes = await fetch(listUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!listRes.ok) {
        throw new Error(`List failed: ${listRes.status}`);
      }

      const data = await listRes.json();
      const blobs = data.blobs || [];
      cursor = data.cursor;

      for (const blob of blobs) {
        checked++;
        const uploadedAt = new Date(blob.uploadedAt);
        debugBlobs.push({
          url: blob.url?.slice(-30),
          uploadedAt: blob.uploadedAt,
          shouldDelete: uploadedAt < cutoffDate,
        });
        if (uploadedAt < cutoffDate) {
          // Delete using REST API
          const delRes = await fetch(
            `https://blob.vercel-storage.com?url=${encodeURIComponent(
              blob.url,
            )}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          if (delRes.ok) deleted++;
        }
      }
    } while (cursor);

    return NextResponse.json({
      success: true,
      deleted,
      checked,
      cutoffDate: cutoffDate.toISOString(),
      retentionDays,
      blobs: debugBlobs.slice(0, 5), // show first 5 for debug
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json(
      { error: "Cleanup failed: " + (error as Error).message },
      { status: 500 },
    );
  }
}

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".zip",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 },
      );
    }

    // Validate file extension
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "unknown");
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        {
          error: `File type "${ext}" is not allowed. Supported: ${[
            ...ALLOWED_EXTENSIONS,
          ].join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Generate timestamped filename
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `uploads/${timestamp}_${safeName}`;

    // Upload to Vercel Blob
    const blob = await put(fileName, file, {
      access: "public",
    });

    return NextResponse.json({
      success: true,
      fileName: file.name,
      filePath: blob.url,
      size: file.size,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file: " + (error as Error).message },
      { status: 500 },
    );
  }
}

export const runtime = "edge";

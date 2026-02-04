import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// 账户 UUID 到邮箱地址的映射
const ACCOUNT_MAP: Record<string, string> = {
  "4A0B5595-CD6A-49F4-A1B8-7484A9155AE6": "enderfga@gmail.com",
  "45DE070E-FE8E-488E-85E5-BB3D4609CF8B": "qq2639135175@gmail.com",
  "8A791715-A8E7-4861-A370-D735F8D0EB66": "guianfang@u.nus.edu",
  "B17DC83A-6498-4572-B9A3-FFAF7124E63D": "fanggan@utopaistudios.com",
  "6D124C16-5A42-484D-8E2E-73DAAA00C0CC": "mengshaliu87@gmail.com",
};

export async function GET() {
  // This only works when running locally (not on Vercel)
  // For production, we need to call sasha-doctor
  const isVercel = process.env.VERCEL === "1";

  if (isVercel) {
    // On Vercel, proxy to sasha-doctor
    try {
      const SASHA_DOCTOR_URL = "https://api.enderfga.cn/sasha-doctor";
      const ACCESS_CODE = process.env.CODE || "";

      const response = await fetch(`${SASHA_DOCTOR_URL}/terminal/mail-unread`, {
        headers: { Authorization: `Bearer ${ACCESS_CODE}` },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`sasha-doctor returned ${response.status}`);
      }

      const data = await response.json();
      return NextResponse.json(data);
    } catch (error: any) {
      // Return zeros if can't reach sasha-doctor
      return NextResponse.json({
        ok: true,
        personal: 0,
        work: 0,
        school: 0,
        error: error.message,
      });
    }
  }

  // Running locally - query SQLite directly
  try {
    const homeDir = process.env.HOME || "/Users/fanggan";
    const MAIL_DB = `${homeDir}/Library/Mail/V10/MailData/Envelope Index`;

    const query = `
      SELECT mb.url, COUNT(*) as unread
      FROM messages m
      JOIN mailboxes mb ON m.mailbox = mb.ROWID
      WHERE m.read = 0 AND mb.url LIKE '%INBOX%'
      GROUP BY m.mailbox;
    `;

    const { stdout } = await execAsync(`sqlite3 -json "${MAIL_DB}" "${query}"`);
    const results = JSON.parse(stdout || "[]");

    const counts = { personal: 0, work: 0, school: 0 };

    for (const row of results) {
      const url = row.url || "";
      for (const [uuid, email] of Object.entries(ACCOUNT_MAP)) {
        if (url.includes(uuid)) {
          if (email.includes("enderfga@gmail")) counts.personal += row.unread;
          else if (email.includes("utopaistudios")) counts.work += row.unread;
          else if (email.includes("u.nus.edu")) counts.school += row.unread;
        }
      }
    }

    return NextResponse.json({ ok: true, ...counts });
  } catch (error: any) {
    return NextResponse.json({
      ok: true,
      personal: 0,
      work: 0,
      school: 0,
      error: error.message,
    });
  }
}

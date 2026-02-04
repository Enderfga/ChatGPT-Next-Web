import { NextResponse } from "next/server";

const NOTION_API_KEY = process.env.NOTION_API_KEY || "";
const ACCOUNTS_DB = "11f9d363-8a67-814c-b0aa-cbae163d04f3";
const CREDIT_CARDS_DB = "2fb9d363-8a67-8196-8f27-d7147814f63d";

async function queryNotion(dbId: string) {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  return res.json();
}

export async function GET() {
  if (!NOTION_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "NOTION_API_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const [accountsData, cardsData] = await Promise.all([
      queryNotion(ACCOUNTS_DB),
      queryNotion(CREDIT_CARDS_DB),
    ]);

    // Calculate Accounts total
    let totalBalance = 0;
    const accounts: { name: string; balance: number }[] = [];
    if (accountsData.results) {
      for (const item of accountsData.results) {
        const name =
          item.properties?.Name?.title?.[0]?.text?.content || "Unknown";
        const balance =
          item.properties?.["Current Balance"]?.formula?.number || 0;
        accounts.push({ name, balance: Math.round(balance * 100) / 100 });
        totalBalance += balance;
      }
    }

    // Calculate Credit Cards total (Active only)
    let totalCreditLimit = 0;
    let activeCards = 0;
    if (cardsData.results) {
      for (const item of cardsData.results) {
        const status = item.properties?.Status?.select?.name;
        if (status === "Active") {
          const limit = item.properties?.["Credit Limit"]?.number || 0;
          totalCreditLimit += limit;
          activeCards++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      accounts: {
        total: Math.round(totalBalance * 100) / 100,
        details: accounts,
      },
      creditCards: {
        totalLimit: totalCreditLimit,
        activeCount: activeCards,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[notion-summary] Error:", error.message);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
}

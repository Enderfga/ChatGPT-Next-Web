import React, { useEffect, useState } from "react";

interface FinanceSummary {
  accounts: {
    total: number;
    details: { name: string; balance: number }[];
  };
  creditCards: {
    totalLimit: number;
    activeCount: number;
  };
}

export function FinanceBadge() {
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/notion-summary");
        if (res.ok) {
          const json = await res.json();
          if (json.ok) {
            setData(json);
          }
        }
      } catch (e) {
        console.error("[FinanceBadge] Failed to fetch:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Refresh every 5 minutes
    const timer = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  if (loading || !data) {
    return null;
  }

  const formatMoney = (amount: number) => {
    return amount >= 1000
      ? `$${(amount / 1000).toFixed(0)}k`
      : `$${amount.toFixed(0)}`;
  };

  return (
    <div
      onClick={() => setShowDetails(!showDetails)}
      title={`资产: $${data.accounts.total.toLocaleString()}\n额度: $${data.creditCards.totalLimit.toLocaleString()} (${
        data.creditCards.activeCount
      } cards)`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "10px",
        color: "#8b949e",
        cursor: "pointer",
        padding: "2px 6px",
        borderRadius: "4px",
        backgroundColor: "rgba(139, 148, 158, 0.1)",
        marginLeft: "8px",
        whiteSpace: "nowrap",
        transition: "all 0.2s",
      }}
    >
      <span>💰{formatMoney(data.accounts.total)}</span>
      <span style={{ color: "#555" }}>|</span>
      <span>💳{formatMoney(data.creditCards.totalLimit)}</span>
    </div>
  );
}

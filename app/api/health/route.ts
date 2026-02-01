import { NextRequest, NextResponse } from "next/server";

async function handle(req: NextRequest) {
  const adminUrl = process.env.OPENCLAW_ADMIN_URL || "https://api.enderfga.cn";
  const gatewayApiUrl = `${adminUrl}/gateway-api`;
  const doctorApiUrl = `${adminUrl}/sasha-doctor`;

  const cfId = process.env.CF_ACCESS_CLIENT_ID;
  const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  if (!cfId || !cfSecret) {
    return NextResponse.json(
      { status: "error", message: "CF Access credentials not configured" },
      { status: 500 },
    );
  }

  const authToken = process.env.CODE || "";
  const headers = {
    "CF-Access-Client-Id": cfId,
    "CF-Access-Client-Secret": cfSecret,
    Authorization: `Bearer ${authToken}`,
  };

  try {
    // POST: Handle various actions
    if (req.method === "POST") {
      const body = await req.json();
      const { action, model } = body;

      // Action: switch-model - Update default model via sasha-doctor and restart
      if (action === "switch-model") {
        console.log("[Health] Switching main model to:", model);

        const switchRes = await fetch(`${doctorApiUrl}/switch-model`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ model }),
        });

        if (switchRes.ok) {
          const data = await switchRes.json();
          return NextResponse.json({
            status: "switched",
            old_model: data.old_model,
            new_model: data.new_model,
            message: data.message,
          });
        } else {
          const error = await switchRes.text();
          return NextResponse.json(
            { status: "error", message: error },
            { status: 500 },
          );
        }
      }

      // Action: restart - Simple restart (original behavior)
      if (action === "restart") {
        const restartRes = await fetch(`${gatewayApiUrl}/restart`, {
          method: "POST",
          headers,
        });

        if (restartRes.ok) {
          const data = await restartRes.json();
          console.log("[Health] Restart success:", data);
          return NextResponse.json({
            status: "restarting",
            message: data.message || "Gateway restarting...",
          });
        } else {
          const error = await restartRes.text();
          console.error("[Health] Restart failed:", error);
          return NextResponse.json(
            { status: "error", message: error },
            { status: 500 },
          );
        }
      }

      // Action: restart-smart - Smart restart with doctor fallback
      if (action === "restart-smart") {
        console.log("[Health] Smart restart requested...");
        const smartRes = await fetch(`${doctorApiUrl}/restart-smart`, {
          method: "POST",
          headers,
        });

        if (smartRes.ok) {
          const data = await smartRes.json();
          console.log("[Health] Smart restart result:", data);
          return NextResponse.json({
            status: data.ok ? "restarted" : "error",
            message: data.message,
            steps: data.steps,
          });
        } else {
          const error = await smartRes.text();
          console.error("[Health] Smart restart failed:", error);
          return NextResponse.json(
            { status: "error", message: error },
            { status: 500 },
          );
        }
      }

      // Action: doctor - Run openclaw doctor --fix only
      if (action === "doctor") {
        console.log("[Health] Doctor requested...");
        const doctorRes = await fetch(`${doctorApiUrl}/doctor`, {
          method: "POST",
          headers,
        });

        if (doctorRes.ok) {
          const data = await doctorRes.json();
          console.log("[Health] Doctor result:", data);
          return NextResponse.json({
            status: data.ok ? "fixed" : "error",
            output: data.output,
            stderr: data.stderr,
          });
        } else {
          const error = await doctorRes.text();
          console.error("[Health] Doctor failed:", error);
          return NextResponse.json(
            { status: "error", message: error },
            { status: 500 },
          );
        }
      }
    }

    // GET: Health check - 直接从 sasha-doctor 获取完整状态
    const res = await fetch(`${doctorApiUrl}/gateway-status`, {
      headers,
      cache: "no-store",
    });

    if (res.ok) {
      const status = await res.json();
      return NextResponse.json({
        status: status.ok ? "online" : "degraded",
        adminUrl,
        model: status.model || status.config?.default_model,
        whatsappLinked: status.channels?.whatsapp?.linked ?? false,
        whatsappConnected: status.channels?.whatsapp?.connected ?? false,
        sessionCount: status.sessions?.count ?? 0,
      });
    }

    // Fallback: 尝试获取模型配置，但标记为 degraded（能读配置 ≠ gateway 在运行）
    try {
      const configRes = await fetch(`${doctorApiUrl}/get-config`, {
        headers,
        cache: "no-store",
      });
      if (configRes.ok) {
        const configData = await configRes.json();
        return NextResponse.json({
          status: "degraded", // 不是 online！gateway 状态未知
          adminUrl,
          model: configData.default_model || "",
          note: "Gateway status unavailable, config retrieved",
        });
      }
    } catch (e) {
      console.error("[Health] Failed to get config from sasha-doctor", e);
    }

    return NextResponse.json({ status: "offline" }, { status: 503 });
  } catch (e) {
    console.error("[Health] Check failed", e);
    return NextResponse.json({ status: "offline" }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
export const runtime = "edge";

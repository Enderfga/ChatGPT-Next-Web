import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

export async function GET() {
  try {
    // 检查 gateway 状态
    const { stdout } = await execPromise("clawdbot gateway status");
    return NextResponse.json({
      status: "online",
      details: stdout.trim(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "offline",
        error: error.message,
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const { action } = await req.json();

  if (action === "restart") {
    try {
      // 异步执行重启，不等待结果（因为重启会导致连接断开）
      exec("clawdbot gateway restart --force");
      return NextResponse.json({ message: "Restarting..." });
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

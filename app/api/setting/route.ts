import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const adminUrl = process.env.OPENCLAW_ADMIN_URL || "https://api.enderfga.cn";

  const authCookie = req.cookies.get("openclaw_auth")?.value;
  // 使用 CODE 环境变量作为认证，不再有硬编码默认值
  const secretToken = process.env.CODE || process.env.OPENCLAW_SECRET_TOKEN;

  // 如果没有配置 secretToken，拒绝访问
  if (!secretToken) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  if (authCookie === secretToken) {
    return NextResponse.redirect(adminUrl, 307);
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Auth - Sasha</title>
        <style>
            body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f4f4f7; }
            .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); width: 100%; max-width: 320px; text-align: center; }
            h2 { color: #333; margin-bottom: 0.5rem; font-size: 20px; }
            p { color: #666; font-size: 14px; margin-bottom: 1.5rem; }
            input { width: 100%; padding: 12px; margin-bottom: 1rem; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; font-size: 16px; outline: none; transition: border 0.2s; }
            input:focus { border-color: #1890ff; }
            button { width: 100%; padding: 12px; background: #1890ff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: 500; transition: background 0.2s; }
            button:hover { background: #40a9ff; }
            .tip { font-size: 12px; color: #999; margin-top: 1.2rem; line-height: 1.4; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>Access Token Required</h2>
            <p>Please enter your secret token to continue</p>
            <input type="password" id="token" placeholder="Your Secret Token">
            <button id="loginBtn">Verify and Enter</button>
            <div class="tip">Token will be saved for 30 days.</div>
        </div>
        <script>
            const btn = document.getElementById('loginBtn');
            const input = document.getElementById('token');
            function login() {
                const token = input.value;
                if (!token) return;
                document.cookie = "openclaw_auth=" + token + "; path=/; max-age=" + (30 * 24 * 60 * 60) + "; SameSite=Lax";
                location.reload();
            }
            btn.addEventListener('click', login);
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') login();
            });
        </script>
    </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const runtime = "edge";

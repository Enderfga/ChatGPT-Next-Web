"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./nexus.module.scss";
import { Path } from "../../constant";
import { useAccessStore } from "../../store";
import "xterm/css/xterm.css";

import OpenClawLogo from "../../icons/openclaw.svg";
import OpenAILogo from "../../icons/llm-icons/openai.svg";
import GeminiLogo from "../../icons/llm-icons/gemini.svg";
import ClaudeLogo from "../../icons/llm-icons/claude.svg";

// ============ TYPES ============

type SshHost = { name: string; hostname?: string };

interface GpuInfo {
  name: string;
  utilization: number;
  memory: { used: number; total: number };
  temperature: number;
}

interface ServiceStatus {
  name: string;
  status: "running" | "stopped" | "unknown";
}

type IntelState = {
  accountsTotal: number;
  creditLimitSgd: number;
  activeCards: number;
  mail: { personal: number; work: number; school: number };
};

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

// ============ HELPERS ============

function useLocalStorageState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) setValue(JSON.parse(stored) as T);
    } catch {}
  }, [key]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}

// Full SSH hosts fallback (matches ~/.ssh/config)
const SSH_HOSTS_FALLBACK: SshHost[] = [
  { name: "GMI6", hostname: "157.66.255.67" },
  { name: "GMI5", hostname: "157.66.255.3" },
  { name: "GMI4", hostname: "157.66.255.69" },
  { name: "GMI3", hostname: "157.66.255.68" },
  { name: "GMI2", hostname: "157.66.255.54" },
  { name: "GMI1", hostname: "157.66.255.53" },
  { name: "nus", hostname: "hopper.nus.edu.sg" },
  { name: "miko", hostname: "86.38.238.182" },
  { name: "air" },
  { name: "pro" },
];

// ============ MAIN COMPONENT ============

export function Nexus() {
  const navigate = useNavigate();
  const accessStore = useAccessStore();

  // Terminal state
  const [terminalMode, setTerminalMode] = useState<"local" | "ssh">("local");
  const [sshHosts, setSshHosts] = useState<SshHost[]>([]);
  const [selectedHost, setSelectedHost] = useState("GMI6");
  const [isConnected, setIsConnected] = useState(false);

  // Intel state
  const [gpuData, setGpuData] = useState<GpuInfo[]>([]);
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: "openclaw-gateway", status: "unknown" },
    { name: "sasha-doctor", status: "unknown" },
    { name: "cloudflared", status: "unknown" },
  ]);
  const [gatewayModel, setGatewayModel] = useState("-");
  const [showModelSelector, setShowModelSelector] = useState(false);

  const MODEL_OPTIONS = [
    { title: "Gemini 3 Pro", value: "gemini-3-pro-preview" },
    { title: "Azure GPT-5.2", value: "azure/gpt-5.2-chat" },
    { title: "Claude 4.5 Opus", value: "anthropic/claude-opus-4-5" },
  ];

  const getModelDisplayName = (model: string) => {
    if (model.includes("gemini-3-pro")) return "Gemini 3 Pro";
    if (model.includes("gemini")) return "Gemini";
    if (model.includes("gpt-5")) return "GPT-5.2";
    if (model.includes("gpt-4o")) return "GPT-4o";
    if (model.includes("opus")) return "Opus 4.5";
    return model;
  };
  const [intel, setIntel] = useLocalStorageState<IntelState>("nexus-intel", {
    accountsTotal: 0,
    creditLimitSgd: 0,
    activeCards: 0,
    mail: { personal: 0, work: 0, school: 0 },
  });
  const [financeLoading, setFinanceLoading] = useState(true);
  const [editIntel, setEditIntel] = useState(false);

  // Council state
  const [councilTopic, setCouncilTopic] = useState("");
  const [councilRunning, setCouncilRunning] = useState(false);
  const [councilLogs, setCouncilLogs] = useState<string[]>([]);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Agent status state
  const [agentStatus, setAgentStatus] = useState<{
    state: string;
    activity: string;
    currentTool: string | null;
  }>({ state: "idle", activity: "Ready", currentTool: null });

  // Terminal refs
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const terminalCleanupRef = useRef<(() => void) | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 10;
  const [isReconnecting, setIsReconnecting] = useState(false);

  // ============ WEBSOCKET URL ============

  const wsUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const isLocal = ["localhost", "127.0.0.1"].includes(
      window.location.hostname,
    );
    return isLocal
      ? "ws://localhost:18795/terminal"
      : "wss://api.enderfga.cn/sasha-doctor/terminal";
  }, []);

  // Use nexus-chat API which connects to openclaw gateway (not OpenAI!)
  const chatApiUrl = "/api/nexus-chat";

  // ============ LOAD SSH HOSTS ============

  useEffect(() => {
    const loadHosts = async () => {
      try {
        const res = await fetch("/api/ssh-hosts", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.hosts) && data.hosts.length > 0) {
          setSshHosts(data.hosts);
        }
      } catch {}
    };
    loadHosts();
  }, []);

  // ============ LOAD FINANCE DATA FROM NOTION ============

  useEffect(() => {
    const loadFinance = async () => {
      try {
        setFinanceLoading(true);
        const res = await fetch("/api/notion-summary", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok) {
          setIntel((prev) => ({
            ...prev,
            accountsTotal: data.accounts?.total || 0,
            creditLimitSgd: data.creditCards?.totalLimit || 0,
            activeCards: data.creditCards?.activeCount || 0,
          }));
        }
      } catch (e) {
        console.error("[NEXUS] Failed to load finance data:", e);
      } finally {
        setFinanceLoading(false);
      }
    };
    loadFinance();
    // Refresh every 5 minutes
    const timer = setInterval(loadFinance, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [setIntel]);

  // ============ LOAD MAIL UNREAD COUNT ============

  useEffect(() => {
    const loadMail = async () => {
      try {
        const res = await fetch("/api/mail-unread", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok) {
          setIntel((prev) => ({
            ...prev,
            mail: {
              personal: data.personal || 0,
              work: data.work || 0,
              school: data.school || 0,
            },
          }));
        }
      } catch (e) {
        console.error("[NEXUS] Failed to load mail data:", e);
      }
    };
    loadMail();
    // Refresh every 2 minutes
    const timer = setInterval(loadMail, 2 * 60 * 1000);
    return () => clearInterval(timer);
  }, [setIntel]);

  const hostOptions = useMemo(() => {
    return sshHosts.length > 0 ? sshHosts : SSH_HOSTS_FALLBACK;
  }, [sshHosts]);

  useEffect(() => {
    if (!hostOptions.find((h) => h.name === selectedHost)) {
      setSelectedHost(hostOptions[0]?.name || "GMI6");
    }
  }, [hostOptions, selectedHost]);

  // ============ TERMINAL ============

  const initTerminal = useCallback(async () => {
    if (!terminalRef.current || xtermRef.current || !wsUrl) return;

    const { Terminal } = await import("xterm");
    const { FitAddon } = await import("xterm-addon-fit");
    const { WebLinksAddon } = await import("xterm-addon-web-links");

    const terminal = new Terminal({
      theme: {
        background: "#0a0e14",
        foreground: "#b3b1ad",
        cursor: "#e6b450",
        cursorAccent: "#0a0e14",
        black: "#01060e",
        red: "#ea6c73",
        green: "#91b362",
        yellow: "#f9af4f",
        blue: "#53bdfa",
        magenta: "#fae994",
        cyan: "#90e1c6",
        white: "#c7c7c7",
      },
      fontFamily: '"JetBrains Mono", "SF Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: "bar",
      lineHeight: 1.2,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(terminalRef.current);
    setTimeout(() => fitAddon.fit(), 100);

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.writeln("\x1b[38;5;214m⬢ NEXUS Terminal\x1b[0m");
    terminal.writeln("\x1b[90mConnecting...\x1b[0m\n");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      const token = accessStore.accessCode;
      if (token) ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "ready") {
          setIsConnected(true);
          setIsReconnecting(false);
          reconnectAttemptRef.current = 0; // Reset on successful connection
          terminal.writeln("\x1b[32m● Connected\x1b[0m\n");
          console.log(
            "[Terminal] Ready! wsRef.current:",
            wsRef.current?.readyState,
          );
          // Use wsRef.current for reconnection support
          wsRef.current?.send(
            JSON.stringify({
              type: "resize",
              cols: terminal.cols,
              rows: terminal.rows,
            }),
          );
          // Focus terminal after ready (critical for reconnection!)
          // Multiple attempts to ensure focus works after reconnect
          terminal.focus();
          requestAnimationFrame(() => terminal.focus());
          setTimeout(() => terminal.focus(), 100);
          setTimeout(() => terminal.focus(), 300);
        } else if (msg.type === "output") {
          terminal.write(msg.data);
        } else if (msg.type === "exit") {
          terminal.writeln(`\n\x1b[31m● Exited (${msg.code})\x1b[0m`);
        } else if (msg.type === "error") {
          terminal.writeln(`\n\x1b[31m● ${msg.message}\x1b[0m`);
        }
      } catch {
        terminal.write(e.data);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);

      // Auto-reconnect logic
      if (reconnectAttemptRef.current < maxReconnectAttempts) {
        reconnectAttemptRef.current++;
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttemptRef.current - 1),
          30000,
        ); // Exponential backoff, max 30s
        terminal.writeln(
          `\n\x1b[33m● Disconnected. Reconnecting in ${delay / 1000}s... (${
            reconnectAttemptRef.current
          }/${maxReconnectAttempts})\x1b[0m`,
        );
        setIsReconnecting(true);

        reconnectTimeoutRef.current = setTimeout(() => {
          if (
            wsRef.current?.readyState === WebSocket.CLOSED ||
            !wsRef.current
          ) {
            terminal.writeln("\x1b[90mReconnecting...\x1b[0m");

            const newWs = new WebSocket(wsUrl);
            wsRef.current = newWs;

            newWs.onopen = () => {
              const token = accessStore.accessCode;
              if (token) newWs.send(JSON.stringify({ type: "auth", token }));
            };

            newWs.onmessage = ws.onmessage;
            newWs.onclose = ws.onclose;
            newWs.onerror = ws.onerror;
          }
        }, delay);
      } else {
        terminal.writeln(
          "\n\x1b[31m● Disconnected. Max reconnect attempts reached.\x1b[0m",
        );
        terminal.writeln("\x1b[90mRefresh page to reconnect.\x1b[0m");
        setIsReconnecting(false);
      }
    };

    ws.onerror = () => {
      // Error will trigger onclose, no action needed here
    };

    // IMPORTANT: Use wsRef.current instead of ws to support reconnection
    terminal.onData((data: string) => {
      console.log(
        "[Terminal] onData:",
        data,
        "wsRef.current:",
        wsRef.current?.readyState,
      );
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "resize",
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        );
      }
    });
    resizeObserver.observe(terminalRef.current);

    terminalCleanupRef.current = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      reconnectAttemptRef.current = maxReconnectAttempts; // Prevent reconnect during cleanup
      resizeObserver.disconnect();
      ws.close();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      wsRef.current = null;
    };
  }, [accessStore.accessCode, wsUrl]);

  useEffect(() => {
    initTerminal();
    return () => terminalCleanupRef.current?.();
  }, [initTerminal]);

  const sendCmd = (cmd: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", data: cmd + "\n" }));
    }
  };

  // ============ CHAT (Hacker Style) ============

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: chatInput.trim(),
      timestamp: Date.now(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    let assistantContent = "";

    // Add placeholder message for streaming
    setChatMessages((prev) => [
      ...prev,
      { role: "assistant", content: "▌", timestamp: Date.now() },
    ]);

    try {
      console.log("[Nexus] Calling:", chatApiUrl);

      const res = await fetch(chatApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model:
            gatewayModel !== "-" ? gatewayModel : "anthropic/claude-opus-4-5",
          messages: [...chatMessages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          max_tokens: 4096,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${res.status}: ${errText.slice(0, 200)}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = ""; // Buffer for incomplete lines

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            if (!data) continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content || "";
              if (delta) {
                assistantContent += delta;
                setChatMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: assistantContent + "▌",
                    timestamp: Date.now(),
                  };
                  return updated;
                });
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      // Final update without cursor
      setChatMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: assistantContent || "No response",
          timestamp: Date.now(),
        };
        return updated;
      });
    } catch (err: any) {
      // Update the placeholder message with error
      setChatMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `[ERROR] ${err.message}`,
          timestamp: Date.now(),
        };
        return updated;
      });
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ============ MODEL SWITCHING ============

  const handleModelChange = async (newModel: string) => {
    if (newModel === gatewayModel) return;
    if (
      !confirm(
        `切换主模型为 ${getModelDisplayName(
          newModel,
        )}？\n\n后端服务会立即重启。`,
      )
    )
      return;

    try {
      const res = await fetch("/api/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch-model", model: newModel }),
      });
      if (res.ok) {
        alert("🚀 正在切换并重启...");
        setTimeout(() => window.location.reload(), 3000);
      }
    } catch (e) {
      alert("❌ 切换失败");
    }
  };

  // ============ GPU STATUS ============

  const fetchGpu = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const gpuBuf: string[] = [];
    let capturing = false;
    const orig = wsRef.current.onmessage;

    wsRef.current.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "output") {
          if (msg.data.includes("__GPU_START__")) {
            capturing = true;
            return;
          }
          if (msg.data.includes("__GPU_END__")) {
            capturing = false;
            const lines = gpuBuf
              .join("")
              .split("\n")
              .filter((l) => l.includes(",") && !l.includes("name"));
            const gpus: GpuInfo[] = lines.map((line) => {
              const p = line.split(",").map((s) => s.trim());
              return {
                name: p[0] || "GPU",
                utilization: parseInt(p[1]) || 0,
                memory: {
                  used: parseInt(p[2]) || 0,
                  total: parseInt(p[3]) || 0,
                },
                temperature: parseInt(p[4]) || 0,
              };
            });
            if (gpus.length > 0) setGpuData(gpus);
            if (wsRef.current) wsRef.current.onmessage = orig;
            return;
          }
          if (capturing) gpuBuf.push(msg.data);
        }
      } catch {}
      if (orig && wsRef.current) orig.call(wsRef.current, e);
    };

    // Ensure correct case for GMI hosts (SSH config is case-sensitive)
    const sshHost = selectedHost.toUpperCase().startsWith("GMI")
      ? selectedHost.toUpperCase()
      : selectedHost;
    sendCmd(
      `echo __GPU_START__ && ssh ${sshHost} "nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits 2>/dev/null" && echo __GPU_END__`,
    );
    setTimeout(() => {
      if (wsRef.current && wsRef.current.onmessage !== orig)
        wsRef.current.onmessage = orig;
    }, 10000);
  }, [selectedHost]);

  // ============ SERVICES ============

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setGatewayModel(data.model || "-");
        setServices((prev) =>
          prev.map((s) =>
            s.name === "openclaw-gateway"
              ? {
                  ...s,
                  status: data.status === "online" ? "running" : "stopped",
                }
              : s.name === "sasha-doctor"
              ? { ...s, status: "running" }
              : s.name === "cloudflared"
              ? { ...s, status: data.cloudflaredOk ? "running" : "stopped" }
              : s,
          ),
        );
      } catch {}
    };
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, []);

  // ============ AGENT STATUS ============

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        // Use API proxy to avoid CORS issues in production
        const res = await fetch("/api/agent-status", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setAgentStatus({
            state: data.state || "idle",
            activity: data.activity || "Ready",
            currentTool: data.currentTool || null,
          });
        }
      } catch {}
    };
    fetchStatus();
    const t = setInterval(fetchStatus, 2000);
    return () => clearInterval(t);
  }, []);

  // ============ THREE MINDS ============

  const startCouncil = () => {
    if (!councilTopic.trim() || councilRunning || !wsRef.current) return;
    setCouncilRunning(true);
    setCouncilLogs([]);

    let capturing = false;
    const orig = wsRef.current.onmessage;

    wsRef.current.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "output") {
          if (msg.data.includes("__COUNCIL_START__")) {
            capturing = true;
            return;
          }
          if (msg.data.includes("__COUNCIL_END__")) {
            capturing = false;
            setCouncilRunning(false);
            if (wsRef.current) wsRef.current.onmessage = orig;
            return;
          }
          if (capturing) {
            const clean = msg.data
              .replace(/\x1b\[[0-9;]*m/g, "")
              .replace(/\r/g, "");
            const lines = clean.split("\n").filter((l: string) => l.trim());
            if (lines.length)
              setCouncilLogs((prev) => [...prev, ...lines].slice(-50));
          }
        }
      } catch {}
      if (orig && wsRef.current) orig.call(wsRef.current, e);
    };

    const escaped = councilTopic.replace(/'/g, "'\"'\"'");
    sendCmd(
      `echo __COUNCIL_START__ && three-minds '${escaped}' --max-rounds 3 2>&1; echo __COUNCIL_END__`,
    );
    setTimeout(() => {
      if (councilRunning) {
        setCouncilRunning(false);
        if (wsRef.current && wsRef.current.onmessage !== orig)
          wsRef.current.onmessage = orig;
      }
    }, 300000);
  };

  const commitSha = process.env.COMMIT_SHA || "dev";
  const shortSha = commitSha.slice(0, 7);
  const commitUrl = `https://github.com/${
    process.env.GITHUB_REPO || "Enderfga/ChatGPT-Next-Web"
  }/commit/${commitSha}`;

  // ============ RENDER ============

  return (
    <div className={styles.nexus}>
      <div className={styles.gridOverlay} />

      <header className={styles.header}>
        <div className={styles.brand}>
          <OpenClawLogo className={styles.logo} />
          <div className={styles.brandInfo}>
            <h1>NEXUS</h1>
            <span>CONSOLE</span>
          </div>
        </div>
        <div className={styles.headerMeta}>
          <span
            className={`${styles.status} ${isConnected ? styles.live : ""} ${
              isReconnecting ? styles.reconnecting : ""
            }`}
          >
            {isConnected
              ? "LIVE"
              : isReconnecting
              ? "RECONNECTING..."
              : "OFFLINE"}
          </span>
          <a
            href={commitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.version}
          >
            {shortSha}
          </a>
          <button
            onClick={() => navigate(Path.Home)}
            className={styles.exitBtn}
          >
            EXIT
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {/* LEFT: Hacker Chat */}
        <section className={styles.chatPanel}>
          <header>
            <span className={styles.panelTitle}>AGENT TERMINAL</span>
            <span
              className={styles.modelTag}
              onClick={() => setShowModelSelector(!showModelSelector)}
              style={{ cursor: "pointer" }}
              title="点击切换模型"
            >
              {getModelDisplayName(
                gatewayModel !== "-"
                  ? gatewayModel
                  : "anthropic/claude-opus-4-5",
              )}{" "}
              ▾
            </span>
            {showModelSelector && (
              <div className={styles.modelDropdown}>
                {MODEL_OPTIONS.map((opt) => (
                  <div
                    key={opt.value}
                    className={`${styles.modelOption} ${
                      gatewayModel === opt.value ? styles.active : ""
                    }`}
                    onClick={() => {
                      setShowModelSelector(false);
                      handleModelChange(opt.value);
                    }}
                  >
                    {opt.title}
                  </div>
                ))}
              </div>
            )}
          </header>
          {/* Agent Status Bar */}
          <div className={styles.agentStatus}>
            <span
              className={`${styles.statusDot} ${
                agentStatus.state === "working" ? styles.working : styles.idle
              }`}
            />
            <span className={styles.statusText}>
              {agentStatus.activity}
              {agentStatus.currentTool && (
                <span className={styles.toolName}>
                  {" "}
                  → {agentStatus.currentTool}
                </span>
              )}
            </span>
          </div>
          <div className={styles.chatMessages}>
            {chatMessages.length === 0 && (
              <div className={styles.chatEmpty}>
                <div className={styles.asciiArt}>
                  {`    ╔═══════════════════════════════════╗
    ║   OPENCLAW NEXUS v2.0             ║
    ║   Neural Interface Active         ║
    ╠═══════════════════════════════════╣
    ║   > Ready for input...            ║
    ╚═══════════════════════════════════╝`}
                </div>
                <p>Type a message to start conversation</p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`${styles.chatMsg} ${styles[msg.role]}`}>
                <span className={styles.chatPrefix}>
                  {msg.role === "user" ? "user@nexus:~$" : "claude@openclaw:~>"}
                </span>
                <pre className={styles.chatContent}>{msg.content}</pre>
              </div>
            ))}
            {chatLoading && (
              <div className={`${styles.chatMsg} ${styles.assistant}`}>
                <span className={styles.chatPrefix}>claude@openclaw:~&gt;</span>
                <span className={styles.typing}>
                  Processing<span className={styles.dots}>...</span>
                </span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className={styles.chatInputWrap}>
            <span className={styles.prompt}>&gt;</span>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
              placeholder="Enter command..."
              disabled={chatLoading}
              autoFocus
            />
            <button
              onClick={sendChat}
              disabled={chatLoading || !chatInput.trim()}
            >
              {chatLoading ? "..." : "SEND"}
            </button>
          </div>
        </section>

        {/* RIGHT: Sidebar */}
        <aside className={styles.sidebar}>
          {/* Council */}
          <section className={styles.panel}>
            <header>
              <span className={styles.panelTitle}>THREE MINDS</span>
              <div className={styles.modelBadges}>
                <OpenAILogo />
                <GeminiLogo />
                <ClaudeLogo />
              </div>
            </header>
            <div className={styles.councilContent}>
              <div className={styles.councilInput}>
                <input
                  value={councilTopic}
                  onChange={(e) => setCouncilTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startCouncil()}
                  placeholder="Discussion topic..."
                  disabled={councilRunning}
                />
                <button
                  onClick={startCouncil}
                  disabled={councilRunning || !councilTopic.trim()}
                >
                  {councilRunning ? "..." : "GO"}
                </button>
              </div>
              <div className={styles.councilLog}>
                {councilLogs.length === 0 ? (
                  <span className={styles.empty}>Awaiting topic...</span>
                ) : (
                  councilLogs.slice(-12).map((l, i) => <div key={i}>{l}</div>)
                )}
              </div>
            </div>
          </section>

          {/* Terminal */}
          <section className={`${styles.panel} ${styles.terminalPanel}`}>
            <header>
              <span className={styles.panelTitle}>TERMINAL</span>
              <div className={styles.termControls}>
                <button
                  className={terminalMode === "local" ? styles.active : ""}
                  onClick={() => setTerminalMode("local")}
                >
                  LOCAL
                </button>
                <button
                  className={terminalMode === "ssh" ? styles.active : ""}
                  onClick={() => setTerminalMode("ssh")}
                >
                  SSH
                </button>
                <select
                  value={selectedHost}
                  onChange={(e) => setSelectedHost(e.target.value)}
                >
                  {hostOptions.map((h) => (
                    <option key={h.name} value={h.name}>
                      {h.name}
                    </option>
                  ))}
                </select>
                {terminalMode === "ssh" && (
                  <>
                    <button onClick={() => sendCmd(`ssh ${selectedHost}`)}>
                      Connect
                    </button>
                    <button onClick={() => sendCmd("exit")}>Exit</button>
                  </>
                )}
              </div>
            </header>
            <div
              className={styles.terminalWrap}
              onClick={() => xtermRef.current?.focus()}
            >
              <div ref={terminalRef} className={styles.terminal} />
            </div>
          </section>

          {/* Intel */}
          <section className={styles.intelGrid}>
            <div className={styles.intelCard}>
              <h4>SERVICES</h4>
              {services.map((s) => (
                <div key={s.name} className={styles.svcRow}>
                  <span className={`${styles.dot} ${styles[s.status]}`} />
                  <span>{s.name}</span>
                </div>
              ))}
            </div>

            <div className={styles.intelCard}>
              <h4>
                FINANCE{" "}
                {financeLoading && <span style={{ opacity: 0.5 }}>⏳</span>}
              </h4>
              <div className={styles.metric}>
                <span>Accounts</span>
                <strong style={{ color: "#3fb950" }}>
                  ${intel.accountsTotal.toLocaleString()}
                </strong>
              </div>
              <div className={styles.metric}>
                <span>Credit ({intel.activeCards} cards)</span>
                <strong>${intel.creditLimitSgd.toLocaleString()}</strong>
              </div>
            </div>

            <div className={styles.intelCard}>
              <h4>MAIL</h4>
              <div className={styles.mailRow}>
                <div>
                  <span>Personal</span>
                  <strong>{intel.mail.personal}</strong>
                </div>
                <div>
                  <span>Work</span>
                  <strong>{intel.mail.work}</strong>
                </div>
                <div>
                  <span>School</span>
                  <strong>{intel.mail.school}</strong>
                </div>
              </div>
            </div>

            <div className={styles.intelCard}>
              <h4>
                GPU <span className={styles.hostTag}>{selectedHost}</span>{" "}
                <button onClick={fetchGpu}>Refresh</button>
              </h4>
              {gpuData.length === 0 ? (
                <span className={styles.empty}>No data</span>
              ) : (
                gpuData.slice(0, 4).map((g, i) => (
                  <div key={i} className={styles.gpuRow}>
                    <span className={styles.gpuName}>{g.name}</span>
                    <span>{g.utilization}%</span>
                    <span>
                      {(g.memory.used / 1024).toFixed(1)}G/
                      {(g.memory.total / 1024).toFixed(0)}G
                    </span>
                    <span className={g.temperature > 75 ? styles.red : ""}>
                      {g.temperature}°C
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default Nexus;

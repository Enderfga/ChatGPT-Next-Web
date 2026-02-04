"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./nexus.module.scss";
import { Path } from "../../constant";
import { useAccessStore } from "../../store";
import { Chat } from "../chat";
import "xterm/css/xterm.css";

import OpenClawLogo from "../../icons/openclaw.svg";
import OpenAILogo from "../../icons/llm-icons/openai.svg";
import GeminiLogo from "../../icons/llm-icons/gemini.svg";
import ClaudeLogo from "../../icons/llm-icons/claude.svg";

// ============ TYPES ============

type SshHost = {
  name: string;
  hostname?: string;
};

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
  creditLimitSgd: number;
  debtSgd: number;
  mail: { personal: number; work: number; school: number };
};

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

// ============ MAIN COMPONENT ============

export function Nexus() {
  const navigate = useNavigate();
  const accessStore = useAccessStore();

  const [terminalMode, setTerminalMode] = useState<"local" | "ssh">("local");
  const [sshHosts, setSshHosts] = useState<SshHost[]>([]);
  const [selectedHost, setSelectedHost] = useState("GMI6");

  const [isConnected, setIsConnected] = useState(false);
  const [gpuData, setGpuData] = useState<GpuInfo[]>([]);
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: "openclaw-gateway", status: "unknown" },
    { name: "sasha-doctor", status: "unknown" },
    { name: "cloudflared", status: "unknown" },
  ]);
  const [gatewayModel, setGatewayModel] = useState("-");

  const [councilTopic, setCouncilTopic] = useState("");
  const [councilRunning, setCouncilRunning] = useState(false);
  const [councilLogs, setCouncilLogs] = useState<string[]>([]);

  const [intel, setIntel] = useLocalStorageState<IntelState>("nexus-intel", {
    creditLimitSgd: 0,
    debtSgd: 2354.23,
    mail: { personal: 0, work: 0, school: 0 },
  });
  const [editIntel, setEditIntel] = useState(false);

  // Terminal refs
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const terminalCleanupRef = useRef<(() => void) | null>(null);

  // ============ CONFIG + HOSTS ============

  const wsUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    return isLocalhost
      ? "ws://localhost:18795/terminal"
      : "wss://api.enderfga.cn/sasha-doctor/terminal";
  }, []);

  useEffect(() => {
    const loadHosts = async () => {
      try {
        const res = await fetch("/api/ssh-hosts", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.hosts)) setSshHosts(data.hosts);
      } catch {}
    };
    loadHosts();
  }, []);

  const hostOptions = useMemo(() => {
    if (sshHosts.length > 0) return sshHosts;
    return [{ name: "GMI6" }, { name: "GMI1" }, { name: "GMI2" }];
  }, [sshHosts]);

  useEffect(() => {
    if (!hostOptions.length) return;
    if (!hostOptions.find((h) => h.name === selectedHost)) {
      setSelectedHost(hostOptions[0].name);
    }
  }, [hostOptions, selectedHost]);

  // ============ TERMINAL (JSON Protocol) ============

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
        switch (msg.type) {
          case "ready":
            setIsConnected(true);
            terminal.writeln("\x1b[32m● Connected\x1b[0m\n");
            ws.send(
              JSON.stringify({
                type: "resize",
                cols: terminal.cols,
                rows: terminal.rows,
              }),
            );
            break;
          case "output":
            terminal.write(msg.data);
            break;
          case "exit":
            terminal.writeln(`\n\x1b[31m● Process exited (${msg.code})\x1b[0m`);
            break;
          case "error":
            terminal.writeln(`\n\x1b[31m● Error: ${msg.message}\x1b[0m`);
            break;
        }
      } catch {
        // Raw text fallback
        terminal.write(e.data);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      terminal.writeln("\n\x1b[31m● Disconnected\x1b[0m");
    };

    terminal.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
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

  const sendTerminalCommand = (cmd: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "input", data: cmd + "\n" }));
  };

  const connectSsh = () => sendTerminalCommand(`ssh ${selectedHost}`);
  const disconnectSsh = () => sendTerminalCommand("exit");

  // ============ GPU MONITORING (via terminal) ============

  const fetchGpuStatus = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Create a temporary listener for GPU data
    const gpuBuffer: string[] = [];
    let capturing = false;

    const originalOnMessage = wsRef.current.onmessage;
    wsRef.current.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "output") {
          const data = msg.data;
          if (data.includes("__GPU_START__")) {
            capturing = true;
            return;
          }
          if (data.includes("__GPU_END__")) {
            capturing = false;
            // Parse GPU data
            const text = gpuBuffer.join("");
            const lines = text
              .split("\n")
              .filter((l) => l.includes(",") && !l.includes("name"));
            const gpus: GpuInfo[] = lines.map((line) => {
              const parts = line.split(",").map((s) => s.trim());
              return {
                name: parts[0] || "GPU",
                utilization: parseInt(parts[1]) || 0,
                memory: {
                  used: parseInt(parts[2]) || 0,
                  total: parseInt(parts[3]) || 0,
                },
                temperature: parseInt(parts[4]) || 0,
              };
            });
            if (gpus.length > 0) setGpuData(gpus);
            // Restore original handler
            if (wsRef.current) wsRef.current.onmessage = originalOnMessage;
            return;
          }
          if (capturing) {
            gpuBuffer.push(data);
          }
        }
      } catch {}
      // Call original handler
      if (originalOnMessage) originalOnMessage.call(wsRef.current, e);
    };

    // Send command to fetch GPU info
    const cmd = `echo __GPU_START__ && ssh ${selectedHost} "nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits 2>/dev/null" && echo __GPU_END__`;
    sendTerminalCommand(cmd);

    // Timeout: restore handler after 10s
    setTimeout(() => {
      if (wsRef.current && wsRef.current.onmessage !== originalOnMessage) {
        wsRef.current.onmessage = originalOnMessage;
      }
    }, 10000);
  }, [selectedHost]);

  // ============ SERVICES ============

  useEffect(() => {
    const checkServices = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setGatewayModel(data.model || "-");
        setServices((prev) =>
          prev.map((svc) => {
            if (svc.name === "openclaw-gateway") {
              return {
                ...svc,
                status: data.status === "online" ? "running" : "stopped",
              };
            }
            if (svc.name === "sasha-doctor") {
              return { ...svc, status: "running" };
            }
            return svc;
          }),
        );
      } catch {}
    };

    checkServices();
    const interval = setInterval(checkServices, 15000);
    return () => clearInterval(interval);
  }, []);

  // ============ THREE MINDS (Local) ============

  const startCouncil = () => {
    if (!councilTopic.trim() || councilRunning) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setCouncilRunning(true);
    setCouncilLogs([]);

    // Capture output for council
    const councilBuffer: string[] = [];
    let capturing = false;

    const originalOnMessage = wsRef.current.onmessage;
    wsRef.current.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "output") {
          const data = msg.data;
          if (data.includes("__COUNCIL_START__")) {
            capturing = true;
            return;
          }
          if (data.includes("__COUNCIL_END__")) {
            capturing = false;
            setCouncilRunning(false);
            if (wsRef.current) wsRef.current.onmessage = originalOnMessage;
            return;
          }
          if (capturing) {
            // Add to logs, filtering ANSI and empty lines
            const clean = data
              .replace(/\x1b\[[0-9;]*m/g, "")
              .replace(/\r/g, "");
            const lines = clean.split("\n").filter((l: string) => l.trim());
            if (lines.length > 0) {
              setCouncilLogs((prev) => [...prev, ...lines].slice(-50));
            }
          }
        }
      } catch {}
      if (originalOnMessage) originalOnMessage.call(wsRef.current, e);
    };

    // Run three-minds locally
    const escapedTopic = councilTopic.replace(/'/g, "'\"'\"'");
    const cmd = `echo __COUNCIL_START__ && three-minds '${escapedTopic}' --quiet 2>&1; echo __COUNCIL_END__`;
    sendTerminalCommand(cmd);

    // Timeout after 5 minutes
    setTimeout(() => {
      if (councilRunning) {
        setCouncilRunning(false);
        if (wsRef.current && wsRef.current.onmessage !== originalOnMessage) {
          wsRef.current.onmessage = originalOnMessage;
        }
      }
    }, 300000);
  };

  const commitSha = process.env.COMMIT_SHA || "dev";
  const repo = process.env.GITHUB_REPO || "Enderfga/ChatGPT-Next-Web";
  const shortSha = commitSha.slice(0, 7);
  const commitUrl = `https://github.com/${repo}/commit/${commitSha}`;

  return (
    <div className={styles.nexus}>
      <div className={styles.gridOverlay} />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <OpenClawLogo className={styles.logo} />
          <div className={styles.brandInfo}>
            <h1>NEXUS</h1>
            <span>{gatewayModel !== "-" ? gatewayModel : "CONSOLE"}</span>
          </div>
        </div>
        <div className={styles.headerMeta}>
          <span
            className={`${styles.status} ${isConnected ? styles.live : ""}`}
          >
            {isConnected ? "LIVE" : "OFFLINE"}
          </span>
          <span className={styles.host}>{selectedHost}</span>
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

      {/* Main Content */}
      <main className={styles.main}>
        {/* Chat Panel */}
        <section className={styles.chatPanel}>
          <header>
            <span className={styles.panelTitle}>AGENT</span>
          </header>
          <div className={styles.chatContent}>
            <Chat />
          </div>
        </section>

        {/* Right Side */}
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
          <section className={styles.panel + " " + styles.terminalPanel}>
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
                    <button onClick={connectSsh}>Connect</button>
                    <button onClick={disconnectSsh}>Exit</button>
                  </>
                )}
              </div>
            </header>
            <div className={styles.terminalWrap}>
              <div ref={terminalRef} className={styles.terminal} />
            </div>
          </section>

          {/* Intel Grid */}
          <section className={styles.intelGrid}>
            {/* Services */}
            <div className={styles.intelCard}>
              <h4>SERVICES</h4>
              {services.map((s) => (
                <div key={s.name} className={styles.svcRow}>
                  <span className={`${styles.dot} ${styles[s.status]}`} />
                  <span>{s.name}</span>
                </div>
              ))}
            </div>

            {/* Finance */}
            <div className={styles.intelCard}>
              <h4>
                FINANCE{" "}
                <button onClick={() => setEditIntel(!editIntel)}>
                  {editIntel ? "OK" : "Edit"}
                </button>
              </h4>
              {editIntel ? (
                <>
                  <label>
                    Limit{" "}
                    <input
                      type="number"
                      value={intel.creditLimitSgd}
                      onChange={(e) =>
                        setIntel((p) => ({
                          ...p,
                          creditLimitSgd: +e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Debt{" "}
                    <input
                      type="number"
                      value={intel.debtSgd}
                      onChange={(e) =>
                        setIntel((p) => ({ ...p, debtSgd: +e.target.value }))
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className={styles.metric}>
                    <span>Limit</span>
                    <strong>{intel.creditLimitSgd.toLocaleString()} SGD</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Debt</span>
                    <strong className={styles.red}>
                      {intel.debtSgd.toLocaleString()} SGD
                    </strong>
                  </div>
                </>
              )}
            </div>

            {/* Mail */}
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

            {/* GPU */}
            <div className={styles.intelCard}>
              <h4>
                GPU <span className={styles.hostTag}>{selectedHost}</span>{" "}
                <button onClick={fetchGpuStatus}>Refresh</button>
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

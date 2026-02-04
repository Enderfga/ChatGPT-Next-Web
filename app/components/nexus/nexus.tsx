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
  mail: {
    personal: number;
    work: number;
    school: number;
  };
};

// ============ HELPERS ============

const shellQuote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

const stripAnsi = (value: string) =>
  value.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "");

function useLocalStorageState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) setValue(JSON.parse(stored) as T);
    } catch {
      // Ignore corrupted local data
    }
  }, [key]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore write errors
    }
  }, [key, value]);

  return [value, setValue] as const;
}

// ============ MAIN COMPONENT ============

export function Nexus() {
  const navigate = useNavigate();
  const accessStore = useAccessStore();

  const [terminalMode, setTerminalMode] = useState<"local" | "ssh">("local");
  const [sshHosts, setSshHosts] = useState<SshHost[]>([]);
  const [selectedHost, setSelectedHost] = useState("GMI1");

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
  const councilBufferRef = useRef("");

  const [intel, setIntel] = useLocalStorageState<IntelState>("nexus-intel", {
    creditLimitSgd: 0,
    debtSgd: 2354.23,
    mail: {
      personal: 0,
      work: 0,
      school: 0,
    },
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
      } catch {
        // Ignore
      }
    };
    loadHosts();
  }, []);

  const hostOptions = useMemo(() => {
    if (sshHosts.length > 0) return sshHosts;
    return [
      { name: "GMI1" },
      { name: "GMI2" },
      { name: "GMI3" },
      { name: "GMI4" },
    ];
  }, [sshHosts]);

  useEffect(() => {
    if (!hostOptions.length) return;
    if (!hostOptions.find((h) => h.name === selectedHost)) {
      setSelectedHost(hostOptions[0].name);
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
        background: "#0b0f14",
        foreground: "#dfe9f3",
        cursor: "#39fbd6",
        cursorAccent: "#0b0f14",
        black: "#0b0f14",
        red: "#ff5566",
        green: "#17f1a5",
        yellow: "#f7b733",
        blue: "#40c9ff",
        magenta: "#ff5ef4",
        cyan: "#39fbd6",
        white: "#dfe9f3",
      },
      fontFamily: '"IBM Plex Mono", "JetBrains Mono", monospace',
      fontSize: 12,
      cursorBlink: true,
      cursorStyle: "bar",
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(terminalRef.current);
    setTimeout(() => fitAddon.fit(), 120);

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.writeln("\x1b[36m⬢ NEXUS Terminal\x1b[0m");
    terminal.writeln("\x1b[90mConnecting...\x1b[0m");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      terminal.writeln("\x1b[32m● Connected\x1b[0m\n");
      const token = accessStore.accessCode;
      if (token) ws.send(JSON.stringify({ type: "auth", token }));
      ws.send(
        JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows,
        }),
      );
    };

    ws.onmessage = (e) => terminal.write(e.data);
    ws.onclose = () => {
      setIsConnected(false);
      terminal.writeln("\n\x1b[31m● Disconnected\x1b[0m");
    };

    terminal.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
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

  const connectSsh = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(`ssh ${selectedHost}\n`);
  };

  const disconnectSsh = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send("exit\n");
  };

  // ============ GPU MONITORING ============

  const fetchGpuStatus = useCallback(
    (hostOverride?: string) => {
      if (!wsUrl) return;
      const host = hostOverride || selectedHost || "GMI1";
      const ws = new WebSocket(wsUrl);
      let outputBuffer = "";

      ws.onopen = () => {
        const token = accessStore.accessCode;
        if (token) ws.send(JSON.stringify({ type: "auth", token }));
        setTimeout(() => {
          const remoteCmd =
            "nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits";
          const cmd = `ssh ${host} ${shellQuote(
            `${remoteCmd} 2>/dev/null && echo __END__`,
          )}`;
          ws.send(`${cmd}\n`);
        }, 300);
      };

      ws.onmessage = (e) => {
        outputBuffer += e.data;
        if (outputBuffer.includes("__END__")) {
          const clean = stripAnsi(outputBuffer.replace("__END__", ""));
          const lines = clean
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.includes(","));
          const gpus: GpuInfo[] = lines.map((line) => {
            const parts = line.split(",").map((s) => s.trim());
            return {
              name: parts[0] || "Unknown GPU",
              utilization: parseInt(parts[1]) || 0,
              memory: {
                used: parseInt(parts[2]) || 0,
                total: parseInt(parts[3]) || 0,
              },
              temperature: parseInt(parts[4]) || 0,
            };
          });
          if (gpus.length > 0) setGpuData(gpus);
          ws.close();
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    },
    [accessStore.accessCode, selectedHost, wsUrl],
  );

  useEffect(() => {
    fetchGpuStatus(selectedHost);
    const interval = setInterval(() => fetchGpuStatus(selectedHost), 30000);
    return () => clearInterval(interval);
  }, [fetchGpuStatus, selectedHost]);

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
      } catch {
        // Ignore
      }
    };

    checkServices();
    const interval = setInterval(checkServices, 15000);
    return () => clearInterval(interval);
  }, []);

  // ============ THREE MINDS ============

  const startCouncil = async () => {
    if (!councilTopic.trim() || councilRunning || !wsUrl) return;

    setCouncilRunning(true);
    setCouncilLogs([]);
    councilBufferRef.current = "";

    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      const token = accessStore.accessCode;
      if (token) ws.send(JSON.stringify({ type: "auth", token }));
      setTimeout(() => {
        const topic = councilTopic.replace(/\r?\n/g, " ").trim();
        const remoteCmd = `three-minds ${shellQuote(
          topic,
        )} --quiet 2>&1; echo __END__`;
        const cmd = `ssh ${selectedHost} ${shellQuote(remoteCmd)}`;
        ws.send(`${cmd}\n`);
      }, 300);
    };

    ws.onmessage = (e) => {
      councilBufferRef.current += e.data;
      if (councilBufferRef.current.includes("__END__")) {
        const clean = stripAnsi(
          councilBufferRef.current.replace("__END__", ""),
        );
        const lines = clean
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        setCouncilLogs(lines);
        setCouncilRunning(false);
        ws.close();
        return;
      }

      const parts = councilBufferRef.current.split("\n");
      councilBufferRef.current = parts.pop() || "";
      if (parts.length) {
        setCouncilLogs((prev) => [
          ...prev,
          ...parts.map((line) => stripAnsi(line)).filter(Boolean),
        ]);
      }
    };

    ws.onerror = () => {
      setCouncilRunning(false);
      ws.close();
    };
  };

  const commitSha = process.env.COMMIT_SHA || "dev";
  const repo = process.env.GITHUB_REPO || "Enderfga/ChatGPT-Next-Web";
  const shortSha = commitSha.slice(0, 7);
  const commitUrl = `https://github.com/${repo}/commit/${commitSha}`;

  return (
    <div className={styles.nexus}>
      <div className={styles.atmoGrid} />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <OpenClawLogo className={styles.brandLogo} />
          <div className={styles.brandText}>
            <span className={styles.brandTitle}>OPENCLAW NEXUS</span>
            <span className={styles.brandSub}>
              {gatewayModel !== "-" ? gatewayModel : "CONSOLE"}
            </span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <span
            className={`${styles.connStatus} ${
              isConnected ? styles.online : ""
            }`}
          >
            {isConnected ? "● LIVE" : "○ OFFLINE"}
          </span>
          <div className={styles.hostPill}>{selectedHost}</div>
          <a
            className={styles.commitBadge}
            href={commitUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {shortSha}
          </a>
          <button
            className={styles.exitBtn}
            onClick={() => navigate(Path.Home)}
          >
            Exit
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className={styles.grid}>
        {/* Left: Chat */}
        <section className={styles.chatSection}>
          <div className={styles.sectionHeader}>
            <span>Core Agent Chat</span>
          </div>
          <div className={styles.chatShell}>
            <Chat />
          </div>
        </section>

        {/* Right Column */}
        <div className={styles.rightCol}>
          {/* Three Minds */}
          <section className={styles.councilSection}>
            <div className={styles.sectionHeader}>
              <span>Three Minds Council</span>
              <div className={styles.agentBadges}>
                <span className={styles.agentBadge} data-provider="openai">
                  <OpenAILogo />
                </span>
                <span className={styles.agentBadge} data-provider="google">
                  <GeminiLogo />
                </span>
                <span className={styles.agentBadge} data-provider="anthropic">
                  <ClaudeLogo />
                </span>
              </div>
            </div>
            <div className={styles.councilBody}>
              <div className={styles.councilInput}>
                <input
                  type="text"
                  value={councilTopic}
                  onChange={(e) => setCouncilTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startCouncil()}
                  placeholder="Enter discussion topic..."
                  disabled={councilRunning}
                />
                <button
                  onClick={startCouncil}
                  disabled={councilRunning || !councilTopic.trim()}
                >
                  {councilRunning ? "..." : "Run"}
                </button>
              </div>
              <div className={styles.councilOutput}>
                {councilLogs.length === 0 ? (
                  <span className={styles.placeholder}>
                    Awaiting topic on {selectedHost}
                  </span>
                ) : (
                  councilLogs
                    .slice(-8)
                    .map((line, i) => <div key={i}>{line}</div>)
                )}
              </div>
            </div>
          </section>

          {/* Terminal */}
          <section className={styles.terminalSection}>
            <div className={styles.sectionHeader}>
              <span>Terminal</span>
              <div className={styles.terminalControls}>
                <div className={styles.modeSwitch}>
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
                </div>
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
                <button onClick={connectSsh} disabled={terminalMode !== "ssh"}>
                  Connect
                </button>
              </div>
            </div>
            <div className={styles.terminalShell}>
              <div className={styles.terminalContainer} ref={terminalRef} />
            </div>
          </section>

          {/* Intel Row */}
          <section className={styles.intelSection}>
            {/* Services */}
            <div className={styles.intelCard}>
              <div className={styles.cardTitle}>Services</div>
              <div className={styles.serviceList}>
                {services.map((svc) => (
                  <div key={svc.name} className={styles.serviceItem}>
                    <span className={`${styles.dot} ${styles[svc.status]}`} />
                    <span className={styles.svcName}>{svc.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Finance */}
            <div className={styles.intelCard}>
              <div className={styles.cardTitle}>
                Finance
                <button onClick={() => setEditIntel((v) => !v)}>
                  {editIntel ? "Done" : "Edit"}
                </button>
              </div>
              {editIntel ? (
                <div className={styles.editGrid}>
                  <label>
                    Limit
                    <input
                      type="number"
                      value={intel.creditLimitSgd}
                      onChange={(e) =>
                        setIntel((p) => ({
                          ...p,
                          creditLimitSgd: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Debt
                    <input
                      type="number"
                      value={intel.debtSgd}
                      onChange={(e) =>
                        setIntel((p) => ({
                          ...p,
                          debtSgd: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
              ) : (
                <div className={styles.financeDisplay}>
                  <div>
                    <span>Limit</span>
                    <strong>{intel.creditLimitSgd.toLocaleString()} SGD</strong>
                  </div>
                  <div>
                    <span>Debt</span>
                    <strong className={styles.debt}>
                      {intel.debtSgd.toLocaleString()} SGD
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* Mail */}
            <div className={styles.intelCard}>
              <div className={styles.cardTitle}>Unread Mail</div>
              <div className={styles.mailGrid}>
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
              <div className={styles.cardTitle}>
                GPU ({selectedHost})
                <button onClick={() => fetchGpuStatus(selectedHost)}>
                  Refresh
                </button>
              </div>
              {gpuData.length === 0 ? (
                <span className={styles.placeholder}>Loading...</span>
              ) : (
                <div className={styles.gpuList}>
                  {gpuData.slice(0, 2).map((gpu, i) => (
                    <div key={i} className={styles.gpuItem}>
                      <span className={styles.gpuName}>{gpu.name}</span>
                      <span>{gpu.utilization}%</span>
                      <span>{(gpu.memory.used / 1024).toFixed(1)}G</span>
                      <span className={gpu.temperature > 75 ? styles.hot : ""}>
                        {gpu.temperature}°C
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default Nexus;

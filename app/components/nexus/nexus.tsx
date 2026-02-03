"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./nexus.module.scss";
import { Path } from "../../constant";
import { useChatStore, useAccessStore } from "../../store";
import "xterm/css/xterm.css";

// ============ SVG ICONS ============

// OpenAI Logo
const OpenAILogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={styles.modelLogo}>
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
  </svg>
);

// Google Gemini Logo
const GeminiLogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={styles.modelLogo}>
    <path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm0 3.6c4.638 0 8.4 3.762 8.4 8.4s-3.762 8.4-8.4 8.4-8.4-3.762-8.4-8.4S7.362 3.6 12 3.6zm0 2.4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 2.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2z" />
  </svg>
);

// Anthropic Claude Logo
const ClaudeLogo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={styles.modelLogo}>
    <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l7.06 3.53L12 11.24 4.94 7.71 12 4.18zM4 8.94l7 3.5v6.62l-7-3.5V8.94zm9 10.12v-6.62l7-3.5v6.62l-7 3.5z" />
  </svg>
);

// Panel Icons
const TerminalIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

const ChatIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const GpuIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
  </svg>
);

const ServerIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect x="2" y="3" width="20" height="6" rx="1" />
    <rect x="2" y="15" width="20" height="6" rx="1" />
    <circle cx="6" cy="6" r="1" fill="currentColor" />
    <circle cx="6" cy="18" r="1" fill="currentColor" />
  </svg>
);

const CloseIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const MaxIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);

const MinIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// ============ TYPES ============

interface GpuInfo {
  name: string;
  utilization: number;
  memory: { used: number; total: number };
  temperature: number;
}

interface ServiceStatus {
  name: string;
  status: "running" | "stopped" | "unknown";
  pid?: number;
}

interface PanelState {
  id: string;
  title: string;
  icon: React.ReactNode;
  minimized: boolean;
  maximized: boolean;
}

// ============ MAIN COMPONENT ============

export function Nexus() {
  const navigate = useNavigate();
  const accessStore = useAccessStore();
  const chatStore = useChatStore();

  // Panel states
  const [panels, setPanels] = useState<PanelState[]>([
    {
      id: "terminal",
      title: "TERMINAL",
      icon: <TerminalIcon />,
      minimized: false,
      maximized: false,
    },
    {
      id: "gpu",
      title: "GPU STATUS",
      icon: <GpuIcon />,
      minimized: false,
      maximized: false,
    },
    {
      id: "council",
      title: "THREE MINDS",
      icon: <ChatIcon />,
      minimized: false,
      maximized: false,
    },
    {
      id: "services",
      title: "SERVICES",
      icon: <ServerIcon />,
      minimized: false,
      maximized: false,
    },
  ]);

  // Data states
  const [gpuData, setGpuData] = useState<GpuInfo[]>([]);
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: "openclaw-gateway", status: "unknown" },
    { name: "sasha-doctor", status: "unknown" },
    { name: "cloudflared", status: "unknown" },
  ]);
  const [councilMessages, setCouncilMessages] = useState<
    Array<{
      agent: "openai" | "google" | "anthropic";
      content: string;
      round: number;
    }>
  >([]);
  const [councilTopic, setCouncilTopic] = useState("");
  const [councilRunning, setCouncilRunning] = useState(false);
  const [terminalMode, setTerminalMode] = useState<"local" | "gpu">("local");

  // Terminal refs
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // GPU terminal for fetching data
  const gpuWsRef = useRef<WebSocket | null>(null);

  // ============ TERMINAL ============

  useEffect(() => {
    if (!terminalRef.current) return;

    const initTerminal = async () => {
      const { Terminal } = await import("xterm");
      const { FitAddon } = await import("xterm-addon-fit");
      const { WebLinksAddon } = await import("xterm-addon-web-links");

      if (xtermRef.current) {
        xtermRef.current.dispose();
      }

      const terminal = new Terminal({
        theme: {
          background: "#0a0a12",
          foreground: "#e0e0e8",
          cursor: "#00fff7",
          cursorAccent: "#0a0a12",
          black: "#0a0a12",
          red: "#ff5555",
          green: "#00ff88",
          yellow: "#ffaa00",
          blue: "#00d4ff",
          magenta: "#bd93f9",
          cyan: "#00fff7",
          white: "#e0e0e8",
        },
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: 13,
        cursorBlink: true,
        cursorStyle: "bar",
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(new WebLinksAddon());

      terminal.open(terminalRef.current!);
      setTimeout(() => fitAddon.fit(), 100);

      xtermRef.current = terminal;

      // Connect WebSocket
      const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      const wsUrl = isLocalhost
        ? "ws://localhost:18795/terminal"
        : "wss://api.enderfga.cn/sasha-doctor/terminal";

      terminal.writeln("\x1b[36m⬢ NEXUS Terminal v2.0\x1b[0m");
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

      // Handle resize
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
      resizeObserver.observe(terminalRef.current!);

      return () => {
        resizeObserver.disconnect();
        ws.close();
        terminal.dispose();
      };
    };

    initTerminal();
  }, []);

  // ============ GPU MONITORING ============

  const fetchGpuStatus = useCallback(() => {
    // Connect to GPU server and run nvidia-smi
    const wsUrl = "wss://api.enderfga.cn/sasha-doctor/terminal";

    if (gpuWsRef.current) {
      gpuWsRef.current.close();
    }

    const ws = new WebSocket(wsUrl);
    gpuWsRef.current = ws;
    let outputBuffer = "";

    ws.onopen = () => {
      const token = accessStore.accessCode;
      if (token) ws.send(JSON.stringify({ type: "auth", token }));
      // Execute nvidia-smi with parseable output
      setTimeout(() => {
        ws.send(
          "ssh gpu 'nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits' 2>/dev/null && echo '---END---'\n",
        );
      }, 500);
    };

    ws.onmessage = (e) => {
      outputBuffer += e.data;
      if (outputBuffer.includes("---END---")) {
        // Parse nvidia-smi output
        const lines = outputBuffer
          .split("\n")
          .filter((l) => l.includes(",") && !l.includes("---END---"));
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
        if (gpus.length > 0) {
          setGpuData(gpus);
        }
        ws.close();
      }
    };

    ws.onerror = () => {
      // Fallback: show demo data if can't connect
      setGpuData([
        {
          name: "NVIDIA RTX 4090",
          utilization: 0,
          memory: { used: 0, total: 24576 },
          temperature: 35,
        },
      ]);
    };
  }, [accessStore.accessCode]);

  useEffect(() => {
    fetchGpuStatus();
    const interval = setInterval(fetchGpuStatus, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchGpuStatus]);

  // ============ SERVICES ============

  useEffect(() => {
    const checkServices = async () => {
      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          const data = await res.json();
          setServices((prev) =>
            prev.map((s) => {
              if (s.name === "openclaw-gateway") {
                return {
                  ...s,
                  status: data.status === "online" ? "running" : "stopped",
                };
              }
              if (s.name === "sasha-doctor") {
                return { ...s, status: "running" }; // If we got response, it's running
              }
              return s;
            }),
          );
        }
      } catch {
        // Services offline
      }
    };

    checkServices();
    const interval = setInterval(checkServices, 15000);
    return () => clearInterval(interval);
  }, []);

  // ============ THREE MINDS ============

  const startCouncil = async () => {
    if (!councilTopic.trim() || councilRunning) return;

    setCouncilRunning(true);
    setCouncilMessages([]);

    // Execute three-minds via terminal
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(`three-minds "${councilTopic}" --quiet 2>&1\n`);
    }

    // Simulate for now (real implementation would parse output)
    const agents: Array<"openai" | "google" | "anthropic"> = [
      "openai",
      "google",
      "anthropic",
    ];
    for (let round = 1; round <= 2; round++) {
      for (const agent of agents) {
        await new Promise((r) => setTimeout(r, 1000));
        setCouncilMessages((prev) => [
          ...prev,
          {
            agent,
            content: `[Round ${round}] Analyzing: "${councilTopic}"...`,
            round,
          },
        ]);
      }
    }
    setCouncilRunning(false);
  };

  // ============ PANEL CONTROLS ============

  const toggleMinimize = (id: string) => {
    setPanels((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, minimized: !p.minimized, maximized: false } : p,
      ),
    );
  };

  const toggleMaximize = (id: string) => {
    setPanels((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, maximized: !p.maximized, minimized: false }
          : { ...p, maximized: false },
      ),
    );
  };

  const maximizedPanel = panels.find((p) => p.maximized);

  // ============ RENDER ============

  return (
    <div className={styles.nexus}>
      {/* Scan line effect */}
      <div className={styles.scanline} />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>⬢</span>
          <span className={styles.title}>SASHA NEXUS</span>
          <span className={styles.version}>v2.0</span>
        </div>
        <div className={styles.headerCenter}>
          <div className={styles.clock}>{new Date().toLocaleTimeString()}</div>
        </div>
        <div className={styles.headerRight}>
          <span
            className={`${styles.connStatus} ${
              isConnected ? styles.online : ""
            }`}
          >
            {isConnected ? "● CONNECTED" : "○ OFFLINE"}
          </span>
          <button
            className={styles.exitBtn}
            onClick={() => navigate(Path.Home)}
          >
            EXIT
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className={styles.grid}>
        {maximizedPanel ? (
          // Maximized view
          <div className={styles.maximizedPanel}>
            {renderPanel(maximizedPanel.id)}
          </div>
        ) : (
          // Grid view
          <>
            {/* Terminal - Top Left */}
            <section
              className={`${styles.panel} ${
                panels[0].minimized ? styles.minimized : ""
              }`}
              data-panel="terminal"
            >
              <div className={styles.panelHeader}>
                <span className={styles.panelIcon}>
                  <TerminalIcon />
                </span>
                <span className={styles.panelTitle}>TERMINAL</span>
                <div className={styles.panelTabs}>
                  <button
                    className={`${styles.tab} ${
                      terminalMode === "local" ? styles.active : ""
                    }`}
                    onClick={() => setTerminalMode("local")}
                  >
                    LOCAL
                  </button>
                  <button
                    className={`${styles.tab} ${
                      terminalMode === "gpu" ? styles.active : ""
                    }`}
                    onClick={() => setTerminalMode("gpu")}
                  >
                    GPU SERVER
                  </button>
                </div>
                <div className={styles.panelControls}>
                  <button onClick={() => toggleMinimize("terminal")}>
                    <MinIcon />
                  </button>
                  <button onClick={() => toggleMaximize("terminal")}>
                    <MaxIcon />
                  </button>
                </div>
              </div>
              <div className={styles.panelContent}>
                <div className={styles.terminalContainer} ref={terminalRef} />
              </div>
            </section>

            {/* GPU Status - Top Right */}
            <section
              className={`${styles.panel} ${
                panels[1].minimized ? styles.minimized : ""
              }`}
              data-panel="gpu"
            >
              <div className={styles.panelHeader}>
                <span className={styles.panelIcon}>
                  <GpuIcon />
                </span>
                <span className={styles.panelTitle}>GPU STATUS</span>
                <button className={styles.refreshBtn} onClick={fetchGpuStatus}>
                  ↻
                </button>
                <div className={styles.panelControls}>
                  <button onClick={() => toggleMinimize("gpu")}>
                    <MinIcon />
                  </button>
                  <button onClick={() => toggleMaximize("gpu")}>
                    <MaxIcon />
                  </button>
                </div>
              </div>
              <div className={styles.panelContent}>
                <div className={styles.gpuGrid}>
                  {gpuData.length === 0 ? (
                    <div className={styles.gpuLoading}>
                      Fetching GPU data...
                    </div>
                  ) : (
                    gpuData.map((gpu, i) => (
                      <div key={i} className={styles.gpuCard}>
                        <div className={styles.gpuName}>{gpu.name}</div>
                        <div className={styles.gpuStats}>
                          <div className={styles.gpuStat}>
                            <span className={styles.gpuLabel}>UTIL</span>
                            <div className={styles.gpuBar}>
                              <div
                                className={styles.gpuBarFill}
                                style={{
                                  width: `${gpu.utilization}%`,
                                  background:
                                    gpu.utilization > 80
                                      ? "#ff5555"
                                      : "#00ff88",
                                }}
                              />
                            </div>
                            <span className={styles.gpuValue}>
                              {gpu.utilization}%
                            </span>
                          </div>
                          <div className={styles.gpuStat}>
                            <span className={styles.gpuLabel}>VRAM</span>
                            <div className={styles.gpuBar}>
                              <div
                                className={styles.gpuBarFill}
                                style={{
                                  width: `${
                                    (gpu.memory.used / gpu.memory.total) * 100
                                  }%`,
                                  background: "#00d4ff",
                                }}
                              />
                            </div>
                            <span className={styles.gpuValue}>
                              {(gpu.memory.used / 1024).toFixed(1)}/
                              {(gpu.memory.total / 1024).toFixed(0)}G
                            </span>
                          </div>
                          <div className={styles.gpuStat}>
                            <span className={styles.gpuLabel}>TEMP</span>
                            <span
                              className={`${styles.gpuTemp} ${
                                gpu.temperature > 80 ? styles.hot : ""
                              }`}
                            >
                              {gpu.temperature}°C
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            {/* Three Minds - Bottom Left */}
            <section
              className={`${styles.panel} ${
                panels[2].minimized ? styles.minimized : ""
              }`}
              data-panel="council"
            >
              <div className={styles.panelHeader}>
                <span className={styles.panelIcon}>
                  <ChatIcon />
                </span>
                <span className={styles.panelTitle}>THREE MINDS COUNCIL</span>
                <div className={styles.panelControls}>
                  <button onClick={() => toggleMinimize("council")}>
                    <MinIcon />
                  </button>
                  <button onClick={() => toggleMaximize("council")}>
                    <MaxIcon />
                  </button>
                </div>
              </div>
              <div className={styles.panelContent}>
                <div className={styles.councilAgents}>
                  <div className={`${styles.agentCard} ${styles.openai}`}>
                    <OpenAILogo />
                    <span>GPT-5.2</span>
                  </div>
                  <div className={`${styles.agentCard} ${styles.google}`}>
                    <GeminiLogo />
                    <span>Gemini 3</span>
                  </div>
                  <div className={`${styles.agentCard} ${styles.anthropic}`}>
                    <ClaudeLogo />
                    <span>Claude</span>
                  </div>
                </div>
                <div className={styles.councilChat}>
                  {councilMessages.length === 0 ? (
                    <div className={styles.councilEmpty}>
                      Enter a topic to start multi-model discussion
                    </div>
                  ) : (
                    councilMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`${styles.councilMsg} ${styles[msg.agent]}`}
                      >
                        <span className={styles.councilMsgAgent}>
                          {msg.agent === "openai" && <OpenAILogo />}
                          {msg.agent === "google" && <GeminiLogo />}
                          {msg.agent === "anthropic" && <ClaudeLogo />}
                        </span>
                        <span className={styles.councilMsgText}>
                          {msg.content}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className={styles.councilInput}>
                  <input
                    type="text"
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
                    {councilRunning ? "RUNNING..." : "START"}
                  </button>
                </div>
              </div>
            </section>

            {/* Services - Bottom Right */}
            <section
              className={`${styles.panel} ${
                panels[3].minimized ? styles.minimized : ""
              }`}
              data-panel="services"
            >
              <div className={styles.panelHeader}>
                <span className={styles.panelIcon}>
                  <ServerIcon />
                </span>
                <span className={styles.panelTitle}>SERVICES</span>
                <div className={styles.panelControls}>
                  <button onClick={() => toggleMinimize("services")}>
                    <MinIcon />
                  </button>
                  <button onClick={() => toggleMaximize("services")}>
                    <MaxIcon />
                  </button>
                </div>
              </div>
              <div className={styles.panelContent}>
                <div className={styles.serviceList}>
                  {services.map((svc, i) => (
                    <div key={i} className={styles.serviceItem}>
                      <span
                        className={`${styles.serviceStatus} ${
                          styles[svc.status]
                        }`}
                      />
                      <span className={styles.serviceName}>{svc.name}</span>
                      <span className={styles.serviceState}>
                        {svc.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
                <div className={styles.quickActions}>
                  <button
                    onClick={() =>
                      wsRef.current?.send("openclaw gateway restart\n")
                    }
                  >
                    Restart Gateway
                  </button>
                  <button
                    onClick={() =>
                      wsRef.current?.send("openclaw doctor --fix\n")
                    }
                  >
                    Run Doctor
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Grid overlay */}
      <div className={styles.gridOverlay} />
    </div>
  );

  function renderPanel(id: string) {
    // For maximized view - would render the same content as the grid panels
    const panel = panels.find((p) => p.id === id);
    if (!panel) return null;

    return (
      <section className={styles.panel} data-panel={id}>
        <div className={styles.panelHeader}>
          <span className={styles.panelIcon}>{panel.icon}</span>
          <span className={styles.panelTitle}>{panel.title}</span>
          <div className={styles.panelControls}>
            <button onClick={() => toggleMaximize(id)}>
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className={styles.panelContent}>
          {id === "terminal" && (
            <div className={styles.terminalContainer} ref={terminalRef} />
          )}
          {/* Add other panel contents here */}
        </div>
      </section>
    );
  }
}

export default Nexus;

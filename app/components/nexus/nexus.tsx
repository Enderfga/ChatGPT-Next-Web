"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./nexus.module.scss";
import { Path } from "../../constant";
import { useChatStore } from "../../store";
import { useAccessStore } from "../../store";
import "xterm/css/xterm.css";

// Icons
const CloseIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const MinimizeIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const MaximizeIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
  </svg>
);

const SendIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);

const TerminalIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="4 17 10 11 4 5"></polyline>
    <line x1="12" y1="19" x2="20" y2="19"></line>
  </svg>
);

const ChatIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);

const CouncilIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10"></circle>
    <circle cx="12" cy="12" r="4"></circle>
    <line x1="4.93" y1="4.93" x2="9.17" y2="9.17"></line>
    <line x1="14.83" y1="14.83" x2="19.07" y2="19.07"></line>
    <line x1="14.83" y1="9.17" x2="19.07" y2="4.93"></line>
    <line x1="4.93" y1="19.07" x2="9.17" y2="14.83"></line>
  </svg>
);

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface SystemStatus {
  cpu: number;
  memory: number;
  gateway: "online" | "offline" | "unknown";
  network: number[];
}

interface CouncilMessage {
  agent: "gpt" | "gemini" | "claude";
  content: string;
  timestamp: Date;
  vote?: "yes" | "no";
}

// Dracula-inspired cyber theme for terminal
const terminalTheme = {
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
  brightBlack: "#4d4d5a",
  brightRed: "#ff6e6e",
  brightGreen: "#69ff94",
  brightYellow: "#ffffa5",
  brightBlue: "#d6acff",
  brightMagenta: "#ff92df",
  brightCyan: "#a4ffff",
  brightWhite: "#ffffff",
};

export function Nexus() {
  const navigate = useNavigate();
  const chatStore = useChatStore();
  const accessStore = useAccessStore();

  // Panel states
  const [activePanel, setActivePanel] = useState<
    "dialogue" | "terminal" | "council"
  >("dialogue");
  const [terminalMode, setTerminalMode] = useState<"local" | "ssh">("local");
  const [isConnected, setIsConnected] = useState(false);

  // Messages
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "⬢ SASHA NEXUS 已激活。欢迎回来，安总。",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Council state
  const [councilMessages, setCouncilMessages] = useState<CouncilMessage[]>([]);
  const [councilTopic, setCouncilTopic] = useState("");
  const [councilActive, setCouncilActive] = useState(false);

  // System status
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    cpu: 23,
    memory: 4.2,
    gateway: "unknown",
    network: [2, 4, 6, 8, 4, 6, 3, 5],
  });

  // Terminal refs
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Messages container ref
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize terminal
  useEffect(() => {
    if (activePanel !== "terminal" || !terminalRef.current) return;

    let terminal: any = null;
    let fitAddon: any = null;

    const initTerminal = async () => {
      // Dynamically import xterm (client-side only)
      const { Terminal } = await import("xterm");
      const { FitAddon } = await import("xterm-addon-fit");
      const { WebLinksAddon } = await import("xterm-addon-web-links");

      // Clean up existing terminal
      if (xtermRef.current) {
        xtermRef.current.dispose();
      }

      terminal = new Terminal({
        theme: terminalTheme,
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: 14,
        cursorBlink: true,
        cursorStyle: "bar",
        allowProposedApi: true,
      });

      fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);

      if (terminalRef.current) {
        terminal.open(terminalRef.current);
        fitAddon.fit();
      }

      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Connect to WebSocket
      connectTerminal(terminal);
    };

    initTerminal();

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
      if (wsRef.current?.readyState === WebSocket.OPEN && xtermRef.current) {
        wsRef.current.send(
          JSON.stringify({
            type: "resize",
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows,
          }),
        );
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      wsRef.current?.close();
      if (xtermRef.current) {
        xtermRef.current.dispose();
      }
    };
  }, [activePanel, terminalMode]);

  const connectTerminal = (terminal: any) => {
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    const wsUrl = isLocalhost
      ? "ws://localhost:18795/terminal"
      : "wss://api.enderfga.cn/sasha-doctor/terminal";

    terminal.writeln("\x1b[36m⬢ Connecting to NEXUS Terminal...\x1b[0m");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      terminal.writeln("\x1b[32m⬢ Connection established\x1b[0m");
      terminal.writeln("");

      // Send auth token
      const token = accessStore.accessCode;
      if (token) {
        ws.send(JSON.stringify({ type: "auth", token }));
      }

      // Send initial size
      ws.send(
        JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows,
        }),
      );
    };

    ws.onmessage = (event) => {
      terminal.write(event.data);
    };

    ws.onclose = () => {
      setIsConnected(false);
      terminal.writeln("\x1b[31m⬢ Connection closed\x1b[0m");
    };

    ws.onerror = () => {
      terminal.writeln("\x1b[31m⬢ Connection error\x1b[0m");
    };

    // Handle terminal input
    terminal.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  };

  // Fetch system status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/agent-status");
        if (res.ok) {
          setSystemStatus((prev) => ({ ...prev, gateway: "online" }));
        }
      } catch {
        setSystemStatus((prev) => ({ ...prev, gateway: "offline" }));
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Handle send message
  const handleSend = async () => {
    if (!inputValue.trim() || isStreaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsStreaming(true);

    // Add assistant placeholder
    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      },
    ]);

    try {
      // Use chat store to send message
      const session = chatStore.currentSession();
      if (session) {
        await chatStore.onUserInput(userMessage.content);
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: "⚠ 连接中断，请重试" } : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  };

  // Start council discussion
  const startCouncil = async () => {
    if (!councilTopic.trim()) return;

    setCouncilActive(true);
    setCouncilMessages([]);

    // Simulate council discussion (in real implementation, call three-minds)
    const agents: Array<"gpt" | "gemini" | "claude"> = [
      "gpt",
      "gemini",
      "claude",
    ];

    for (const agent of agents) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setCouncilMessages((prev) => [
        ...prev,
        {
          agent,
          content: `[${agent.toUpperCase()}] 正在分析话题: "${councilTopic}"...`,
          timestamp: new Date(),
        },
      ]);
    }
  };

  // Quick commands
  const quickCommands = [
    { label: "/restart", cmd: "openclaw gateway restart" },
    { label: "/status", cmd: "openclaw gateway status" },
    { label: "/doctor", cmd: "openclaw doctor --fix" },
    { label: "/logs", cmd: "tail -f ~/.openclaw/logs/gateway.log" },
  ];

  const executeQuickCommand = (cmd: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(cmd + "\n");
    }
  };

  return (
    <div className={styles.nexus}>
      {/* Scan line effect */}
      <div className={styles.scanline}></div>

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>⬢</span>
          <span className={styles.title}>SASHA NEXUS</span>
          <span className={styles.version}>v2.0</span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statusIndicator}>
            <span
              className={`${styles.statusDot} ${styles[systemStatus.gateway]}`}
            ></span>
            <span>
              {systemStatus.gateway === "online" ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          <button
            className={styles.headerBtn}
            onClick={() => navigate(Path.Home)}
          >
            <CloseIcon />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className={styles.main}>
        {/* Left panel - System Status */}
        <aside className={styles.leftPanel}>
          <div className={styles.panelSection}>
            <h3 className={styles.sectionTitle}>SYSTEM STATUS</h3>
            <div className={styles.statusGrid}>
              <div className={styles.statusItem}>
                <span className={styles.statusLabel}>CPU</span>
                <div className={styles.statusBar}>
                  <div
                    className={styles.statusFill}
                    style={{ width: `${systemStatus.cpu}%` }}
                  ></div>
                </div>
                <span className={styles.statusValue}>{systemStatus.cpu}%</span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.statusLabel}>MEM</span>
                <div className={styles.statusBar}>
                  <div
                    className={styles.statusFill}
                    style={{ width: `${(systemStatus.memory / 16) * 100}%` }}
                  ></div>
                </div>
                <span className={styles.statusValue}>
                  {systemStatus.memory}G
                </span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.statusLabel}>NET</span>
                <div className={styles.networkGraph}>
                  {systemStatus.network.map((v, i) => (
                    <div
                      key={i}
                      className={styles.networkBar}
                      style={{ height: `${v * 10}%` }}
                    ></div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.panelSection}>
            <h3 className={styles.sectionTitle}>QUICK CMD</h3>
            <div className={styles.quickCommands}>
              {quickCommands.map((qc, i) => (
                <button
                  key={i}
                  className={styles.quickCmd}
                  onClick={() => {
                    setActivePanel("terminal");
                    setTimeout(() => executeQuickCommand(qc.cmd), 500);
                  }}
                >
                  {qc.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.panelSection}>
            <h3 className={styles.sectionTitle}>PANELS</h3>
            <div className={styles.panelButtons}>
              <button
                className={`${styles.panelBtn} ${
                  activePanel === "dialogue" ? styles.active : ""
                }`}
                onClick={() => setActivePanel("dialogue")}
              >
                <ChatIcon /> Dialogue
              </button>
              <button
                className={`${styles.panelBtn} ${
                  activePanel === "terminal" ? styles.active : ""
                }`}
                onClick={() => setActivePanel("terminal")}
              >
                <TerminalIcon /> Terminal
              </button>
              <button
                className={`${styles.panelBtn} ${
                  activePanel === "council" ? styles.active : ""
                }`}
                onClick={() => setActivePanel("council")}
              >
                <CouncilIcon /> Council
              </button>
            </div>
          </div>
        </aside>

        {/* Center panel - Main content area */}
        <main className={styles.centerPanel}>
          {activePanel === "dialogue" && (
            <div className={styles.dialoguePanel}>
              <div className={styles.dialogueHeader}>
                <ChatIcon />
                <span>DIALOGUE CORE</span>
              </div>
              <div className={styles.messages}>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`${styles.message} ${styles[msg.role]}`}
                  >
                    <div className={styles.messageContent}>
                      {msg.content || <span className={styles.typing}>▋</span>}
                    </div>
                    <div className={styles.messageTime}>
                      {msg.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div className={styles.inputArea}>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="输入消息..."
                  className={styles.input}
                  disabled={isStreaming}
                />
                <button
                  className={styles.sendBtn}
                  onClick={handleSend}
                  disabled={isStreaming || !inputValue.trim()}
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          )}

          {activePanel === "terminal" && (
            <div className={styles.terminalPanel}>
              <div className={styles.terminalHeader}>
                <TerminalIcon />
                <span>COMMAND TERMINAL</span>
                <div className={styles.terminalTabs}>
                  <button
                    className={`${styles.terminalTab} ${
                      terminalMode === "local" ? styles.active : ""
                    }`}
                    onClick={() => setTerminalMode("local")}
                  >
                    LOCAL
                  </button>
                  <button
                    className={`${styles.terminalTab} ${
                      terminalMode === "ssh" ? styles.active : ""
                    }`}
                    onClick={() => setTerminalMode("ssh")}
                  >
                    SSH
                  </button>
                </div>
                <div
                  className={`${styles.connectionStatus} ${
                    isConnected ? styles.connected : ""
                  }`}
                >
                  {isConnected ? "● CONNECTED" : "○ DISCONNECTED"}
                </div>
              </div>
              <div className={styles.terminalContainer} ref={terminalRef}></div>
            </div>
          )}

          {activePanel === "council" && (
            <div className={styles.councilPanel}>
              <div className={styles.councilHeader}>
                <CouncilIcon />
                <span>THREE MINDS COUNCIL</span>
              </div>
              <div className={styles.councilAgents}>
                <div className={`${styles.agentBadge} ${styles.gpt}`}>
                  <span className={styles.agentIcon}>🧠</span>
                  <span>GPT-5.2</span>
                </div>
                <div className={`${styles.agentBadge} ${styles.gemini}`}>
                  <span className={styles.agentIcon}>💎</span>
                  <span>Gemini 3</span>
                </div>
                <div className={`${styles.agentBadge} ${styles.claude}`}>
                  <span className={styles.agentIcon}>🎭</span>
                  <span>Claude</span>
                </div>
              </div>
              <div className={styles.councilMessages}>
                {councilMessages.length === 0 ? (
                  <div className={styles.councilEmpty}>
                    输入讨论话题，召集三位 AI 顾问进行协商
                  </div>
                ) : (
                  councilMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`${styles.councilMsg} ${styles[msg.agent]}`}
                    >
                      <span className={styles.councilAgent}>
                        {msg.agent === "gpt" && "🧠"}
                        {msg.agent === "gemini" && "💎"}
                        {msg.agent === "claude" && "🎭"}
                      </span>
                      <div className={styles.councilContent}>{msg.content}</div>
                    </div>
                  ))
                )}
              </div>
              <div className={styles.councilInput}>
                <input
                  type="text"
                  value={councilTopic}
                  onChange={(e) => setCouncilTopic(e.target.value)}
                  placeholder="输入讨论话题..."
                  className={styles.input}
                  disabled={councilActive}
                />
                <button
                  className={styles.councilBtn}
                  onClick={startCouncil}
                  disabled={councilActive || !councilTopic.trim()}
                >
                  {councilActive ? "讨论中..." : "发起讨论"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Grid overlay */}
      <div className={styles.gridOverlay}></div>
    </div>
  );
}

export default Nexus;

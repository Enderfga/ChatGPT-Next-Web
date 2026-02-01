import React, { useEffect, useState, useRef } from "react";
import styles from "./agent-terminal.module.scss";

interface ToolCall {
  tool: string;
  input: string;
  timestamp: number;
}

interface AgentStatus {
  ok: boolean;
  state: "idle" | "thinking" | "working" | "waiting";
  activity?: string;
  currentTool?: string;
  details?: any;
  timestamp?: number;
}

export function AgentTerminal() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [history, setHistory] = useState<ToolCall[]>([]);
  const [expanded, setExpanded] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    let lastTool = "";
    let lastInput = "";

    const poll = async () => {
      try {
        const res = await fetch(`/api/agent-status?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data: AgentStatus = await res.json();
          setStatus(data);

          // Auto-expand when agent is active
          if (data.state !== "idle" && data.ok) {
            setExpanded(true);
          }

          // Add to history when tool changes
          if (data.currentTool && data.details) {
            const input = formatInput(data.details);
            const toolKey = `${data.currentTool}:${input}`;
            if (toolKey !== `${lastTool}:${lastInput}`) {
              lastTool = data.currentTool;
              lastInput = input;
              setHistory((prev) => {
                const newHistory = [
                  ...prev,
                  {
                    tool: data.currentTool!,
                    input,
                    timestamp: Date.now(),
                  },
                ];
                // Keep last 20 entries
                return newHistory.slice(-20);
              });
            }
          }

          // Auto-collapse after 10 seconds of idle
          if (data.state === "idle") {
            setTimeout(() => {
              setStatus((current) => {
                if (current?.state === "idle") {
                  setExpanded(false);
                }
                return current;
              });
            }, 10000);
          }
        }
      } catch (e) {
        // Silent fail
      }
      timer = setTimeout(poll, 500); // Fast polling for real-time updates
    };

    poll();
    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll history
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history]);

  const formatInput = (details: any): string => {
    if (!details) return "";
    if (typeof details === "string") return details;
    if (details.command) return details.command;
    if (details.file_path) return details.file_path;
    if (details.path) return details.path;
    if (details.pattern) return details.pattern;
    if (details.query) return details.query;
    if (details.url) return details.url;
    try {
      return JSON.stringify(details).slice(0, 150);
    } catch {
      return String(details).slice(0, 150);
    }
  };

  const getToolIcon = (tool: string): string => {
    const icons: Record<string, string> = {
      Bash: "$",
      exec: "$",
      Read: "cat",
      read: "cat",
      Write: ">",
      write: ">",
      Edit: "vim",
      edit: "vim",
      Glob: "find",
      glob: "find",
      Grep: "grep",
      grep: "grep",
      Task: ">>",
      WebFetch: "curl",
      WebSearch: "?",
    };
    return icons[tool] || ">";
  };

  const getStateLabel = (state: string): string => {
    const labels: Record<string, string> = {
      idle: "ready",
      thinking: "thinking",
      working: "working",
      waiting: "waiting",
    };
    return labels[state] || state;
  };

  // Don't render if no status
  if (!status?.ok) return null;

  // Compact mode when idle and no recent history
  const isCompact = status.state === "idle" && !expanded;

  if (isCompact) {
    return (
      <div
        className={`${styles.terminal} ${styles.compact}`}
        onClick={() => setExpanded(true)}
      >
        <div className={styles.header}>
          <span className={styles.title}>Sasha</span>
          <span className={`${styles.status} ${styles[status.state]}`}>
            {getStateLabel(status.state)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.terminal}>
      <div className={styles.header} onClick={() => setExpanded(!expanded)}>
        <span className={styles.title}>Sasha Agent</span>
        <span className={`${styles.status} ${styles[status.state]}`}>
          {getStateLabel(status.state)}
        </span>
      </div>

      {expanded && (
        <div className={styles.history} ref={historyRef}>
          {history.length === 0 && status.state === "idle" && (
            <div className={styles.empty}>No recent activity</div>
          )}

          {history.map((entry, i) => (
            <div key={i} className={styles.line}>
              <span className={styles.prompt}>{getToolIcon(entry.tool)}</span>
              <span className={styles.tool}>[{entry.tool}]</span>
              <span className={styles.input}>{entry.input}</span>
            </div>
          ))}

          {status.currentTool && status.state !== "idle" && (
            <div className={`${styles.line} ${styles.active}`}>
              <span className={styles.prompt}>
                {getToolIcon(status.currentTool)}
              </span>
              <span className={styles.tool}>[{status.currentTool}]</span>
              <span className={styles.input}>
                {formatInput(status.details)}
              </span>
              <span className={styles.cursor}>_</span>
            </div>
          )}
        </div>
      )}

      {status.activity && status.state !== "idle" && (
        <div className={styles.footer}>{status.activity}</div>
      )}
    </div>
  );
}

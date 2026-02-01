import React, { useEffect, useState, useRef, useCallback } from "react";
import styles from "./agent-terminal.module.scss";
import { copyToClipboard } from "../utils";

interface ToolCall {
  tool: string;
  input: string;
  timestamp: number;
}

// Tool details can have various shapes depending on the tool
interface ToolDetails {
  command?: string; // For exec/Bash
  file_path?: string; // For Read/Write/Edit
  path?: string; // Alternative path field
  pattern?: string; // For Glob/Grep
  query?: string; // For search operations
  url?: string; // For web fetch
  [key: string]: unknown; // Allow other tool-specific fields
}

interface AgentStatus {
  ok: boolean;
  state: "idle" | "thinking" | "working" | "waiting";
  activity?: string;
  currentTool?: string;
  details?: ToolDetails | null;
  timestamp?: number;
}

export function AgentTerminal() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [history, setHistory] = useState<ToolCall[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const autoCollapseTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let pollTimer: NodeJS.Timeout;
    let lastTool = "";
    let lastInput = "";
    let currentState: string = "idle";

    const poll = async () => {
      try {
        const res = await fetch(`/api/agent-status?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data: AgentStatus = await res.json();
          setStatus(data);
          currentState = data.state;

          // Auto-expand logic:
          // 1. If agent starts working/thinking and user hasn't explicitly CLOSED it
          if (data.state !== "idle" && data.ok) {
            // Only auto-expand if the user hasn't manually collapsed it recently
            if (!userInteracted || expanded) {
              setExpanded(true);
            }

            // Clear any pending collapse timer because agent is busy
            if (autoCollapseTimerRef.current) {
              clearTimeout(autoCollapseTimerRef.current);
              autoCollapseTimerRef.current = null;
            }
          }

          // Add to history
          if (data.currentTool && data.details) {
            const input = formatInput(data.details);
            const toolKey = `${data.currentTool}:${input}`;
            if (toolKey !== `${lastTool}:${lastInput}`) {
              lastTool = data.currentTool;
              lastInput = input;
              setHistory((prev) => {
                const newHistory = [
                  ...prev,
                  { tool: data.currentTool!, input, timestamp: Date.now() },
                ];
                return newHistory.slice(-50);
              });
            }
          }

          // Auto-collapse logic:
          // Only auto-collapse if:
          // 1. Agent is idle
          // 2. User HAS NOT manually interacted (expanded it themselves)
          if (data.state === "idle" && !userInteracted) {
            if (!autoCollapseTimerRef.current) {
              autoCollapseTimerRef.current = setTimeout(() => {
                // Double check status is still idle before collapsing
                setExpanded(false);
                autoCollapseTimerRef.current = null;
              }, 10000);
            }
          }
        }
      } catch (e) {
        // Silent fail
      }

      // Dynamic polling interval: 500ms when working, 3000ms when idle
      const interval = currentState === "idle" ? 3000 : 500;
      pollTimer = setTimeout(poll, interval);
    };

    poll();
    return () => {
      clearTimeout(pollTimer);
      if (autoCollapseTimerRef.current)
        clearTimeout(autoCollapseTimerRef.current);
    };
  }, [userInteracted, expanded]); // Add expanded to deps to ensure logic reacts to manual toggle

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !expanded;
    setExpanded(nextState);
    // If user manually toggles, we mark as interacted
    // and stop all automatic expansion/collapsing for a while
    setUserInteracted(true);

    if (autoCollapseTimerRef.current) {
      clearTimeout(autoCollapseTimerRef.current);
      autoCollapseTimerRef.current = null;
    }
  };

  const copyHistory = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const text = history.map((h) => `[${h.tool}] ${h.input}`).join("\n");
      copyToClipboard(text);
    },
    [history],
  );

  // Auto-scroll history
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history, expanded]);

  const formatInput = (details: ToolDetails | null | undefined): string => {
    if (!details) return "";
    if (typeof details === "string") return details;
    if (details.command) return String(details.command);
    if (details.file_path) return String(details.file_path);
    if (details.path) return String(details.path);
    if (details.pattern) return String(details.pattern);
    if (details.query) return String(details.query);
    if (details.url) return String(details.url);
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

  if (!status?.ok) return null;

  const isCompact = status.state === "idle" && !expanded;

  if (isCompact) {
    return (
      <div
        className={`${styles.terminal} ${styles.compact}`}
        onClick={toggleExpand}
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
      <div className={styles.header} onClick={toggleExpand}>
        <div className={styles.headerLeft}>
          <span className={styles.arrow}>{expanded ? "▼" : "▶"}</span>
          <span className={styles.title}>Sasha Agent</span>
        </div>
        <div className={styles.headerRight}>
          {expanded && history.length > 0 && (
            <span
              className={styles.copyBtn}
              onClick={copyHistory}
              title="Copy history"
            >
              📋
            </span>
          )}
          <span className={`${styles.status} ${styles[status.state]}`}>
            {getStateLabel(status.state)}
          </span>
        </div>
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

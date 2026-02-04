"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import styles from "./terminal-modal.module.scss";
import CloseIcon from "../icons/close.svg";
import { useAccessStore } from "../store";
import "xterm/css/xterm.css";

interface TerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Terminal implementation that only runs on client
function TerminalModalInner({ isOpen, onClose }: TerminalModalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const accessCode = useAccessStore((state) => state.accessCode);

  const connect = useCallback(async () => {
    if (!terminalRef.current) return;

    // Dynamically import xterm (client-side only)
    const { Terminal } = await import("xterm");
    const { FitAddon } = await import("xterm-addon-fit");
    const { WebLinksAddon } = await import("xterm-addon-web-links");

    setInitializing(false);

    // Initialize terminal if not already done
    if (!termRef.current) {
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: "#1a1a2e",
          foreground: "#eee",
          cursor: "#f0f0f0",
          cursorAccent: "#1a1a2e",
          black: "#000000",
          red: "#ff5555",
          green: "#50fa7b",
          yellow: "#f1fa8c",
          blue: "#bd93f9",
          magenta: "#ff79c6",
          cyan: "#8be9fd",
          white: "#f8f8f2",
          brightBlack: "#6272a4",
          brightRed: "#ff6e6e",
          brightGreen: "#69ff94",
          brightYellow: "#ffffa5",
          brightBlue: "#d6acff",
          brightMagenta: "#ff92df",
          brightCyan: "#a4ffff",
          brightWhite: "#ffffff",
        },
        allowProposedApi: true,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.open(terminalRef.current);

      // Wait for DOM to be ready, then fit
      requestAnimationFrame(() => {
        fitAddon.fit();
      });

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      term.writeln("\x1b[1;36m╔═══════════════════════════════════════════╗");
      term.writeln(
        "║     \x1b[1;33mSasha Terminal\x1b[1;36m - Remote Access       ║",
      );
      term.writeln("╚═══════════════════════════════════════════╝\x1b[0m");
      term.writeln("");
      term.writeln("\x1b[90mConnecting to server...\x1b[0m");
    }

    // Cleanup previous connection resources before reconnecting
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Connect WebSocket
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;

    // Determine WebSocket URL (auth token is sent after connection, not in URL)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host =
      window.location.hostname === "localhost"
        ? "localhost:18795"
        : "api.enderfga.cn";
    const wsPath =
      window.location.hostname === "localhost"
        ? "/terminal"
        : "/sasha-doctor/terminal";

    const cols = term.cols || 80;
    const rows = term.rows || 24;
    // Auth token is now sent after connection for security (not in URL query string)
    const wsUrl = `${protocol}//${host}${wsPath}?cols=${cols}&rows=${rows}`;

    console.log("[Terminal] Connecting to:", wsUrl);

    // 先通过 fetch 检查 sasha-doctor 是否可达
    // 使用 /terminal/mail-unread 因为它在 Cloudflare bypass 列表里
    try {
      const healthRes = await fetch(
        `${
          protocol === "wss:" ? "https:" : "http:"
        }//${host}/sasha-doctor/terminal/mail-unread`,
        {
          credentials: "include",
        },
      );
      if (!healthRes.ok) {
        console.log("[Terminal] Health check failed:", healthRes.status);
      }
    } catch (e) {
      console.log("[Terminal] Health check for cookie:", e);
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[Terminal] WebSocket connected, sending auth...");
      // Send authentication token after connection (more secure than URL param)
      ws.send(JSON.stringify({ type: "auth", token: accessCode }));
      term.writeln("\x1b[90mAuthenticating...\x1b[0m");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "output":
            term.write(msg.data);
            break;
          case "ready":
            // Authentication successful, terminal is ready
            console.log(
              "[Terminal] Authenticated! Session:",
              msg.sessionId,
              "PID:",
              msg.pid,
            );
            setConnected(true);
            setError(null);
            term.writeln("\x1b[32m✓ Connected!\x1b[0m");
            term.writeln("");
            // Fit and focus after ready (critical for reconnection!)
            requestAnimationFrame(() => {
              fitAddon.fit();
              term.focus();
            });
            break;
          case "exit":
            term.writeln(
              `\r\n\x1b[33m[Session ended with code ${msg.code}]\x1b[0m`,
            );
            setConnected(false);
            break;
          case "error":
            // Authentication or other error
            console.error("[Terminal] Server error:", msg.message);
            term.writeln(`\r\n\x1b[31m✗ ${msg.message}\x1b[0m`);
            setError(msg.message);
            break;
          case "pong":
            break;
        }
      } catch (e) {
        term.write(event.data);
      }
    };

    ws.onclose = (event) => {
      console.log("[Terminal] WebSocket closed:", event.code, event.reason);
      setConnected(false);
      if (event.code !== 1000) {
        term.writeln(
          `\r\n\x1b[31m[Connection closed: ${
            event.reason || "Unknown reason"
          }]\x1b[0m`,
        );
      }
    };

    ws.onerror = () => {
      console.error("[Terminal] WebSocket error");
      setError("Connection failed. Check if sasha-doctor is running.");
      term.writeln("\r\n\x1b[31m✗ Connection failed!\x1b[0m");
      term.writeln(
        "\x1b[90mMake sure sasha-doctor is running on the server.\x1b[0m",
      );
    };

    // Send terminal input to WebSocket
    const dataDisposable = term.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }),
        );
      }
    };

    window.addEventListener("resize", handleResize);

    // Keep-alive ping every 30 seconds
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    // Store cleanup function
    cleanupRef.current = () => {
      window.removeEventListener("resize", handleResize);
      clearInterval(pingInterval);
      dataDisposable.dispose();
    };
  }, [accessCode]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        connect();
        setTimeout(() => {
          termRef.current?.focus();
          fitAddonRef.current?.fit();
        }, 200);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      // Cleanup on close
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      // Dispose Terminal instance so it can be recreated with new DOM element
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
        fitAddonRef.current = null;
      }
      // Reset states for next open
      setConnected(false);
      setInitializing(true);
    }
  }, [isOpen, connect]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && e.ctrlKey) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.title}>
            <span className={styles.statusDot} data-connected={connected} />
            Sasha Terminal
            <span className={styles.hint}>(Ctrl+Esc to close)</span>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className={styles.terminalContainer} ref={terminalRef}>
          {initializing && (
            <div className={styles.loading}>Loading terminal...</div>
          )}
        </div>
        {error && (
          <div className={styles.errorBar}>
            {error}
            <button
              onClick={() => {
                setError(null);
                connect();
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Export with dynamic import to avoid SSR issues
export const TerminalModal = dynamic(
  () => Promise.resolve(TerminalModalInner),
  { ssr: false },
);

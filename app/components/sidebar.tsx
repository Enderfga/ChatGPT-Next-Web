import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";

import styles from "./home.module.scss";

import { IconButton } from "./button";
import SettingsIcon from "../icons/settings.svg";
// GithubIcon removed - no ads
import ChatGptIcon from "../icons/chatgpt.svg";
import AddIcon from "../icons/add.svg";
import DragIcon from "../icons/drag.svg";
import ReloadIcon from "../icons/reload.svg";
import ConnectionIcon from "../icons/connection.svg";
import TerminalIcon from "../icons/terminal.svg";
import BookIcon from "../icons/book.svg";

import { TerminalModal } from "./terminal-modal";

import Locale from "../locales";

import { useAppConfig, useChatStore } from "../store";

import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  NARROW_SIDEBAR_WIDTH,
  Path,
} from "../constant";

import { Link, useNavigate } from "react-router-dom";
import { isIOS, useMobileScreen } from "../utils";
import dynamic from "next/dynamic";
import { Selector, showConfirm, showToast } from "./ui-lib";
import clsx from "clsx";
import { isMcpEnabled } from "../mcp/actions";

const ChatList = dynamic(async () => (await import("./chat-list")).ChatList, {
  loading: () => null,
});

export function useHotKey() {
  const chatStore = useChatStore();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey) {
        if (e.key === "ArrowUp") {
          chatStore.nextSession(-1);
        } else if (e.key === "ArrowDown") {
          chatStore.nextSession(1);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
}

export function useDragSideBar() {
  const limit = (x: number) => Math.min(MAX_SIDEBAR_WIDTH, x);

  const config = useAppConfig();
  const startX = useRef(0);
  const startDragWidth = useRef(config.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH);
  const lastUpdateTime = useRef(Date.now());

  const toggleSideBar = () => {
    config.update((config) => {
      if (config.sidebarWidth < MIN_SIDEBAR_WIDTH) {
        config.sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
      } else {
        config.sidebarWidth = NARROW_SIDEBAR_WIDTH;
      }
    });
  };

  const onDragStart = (e: MouseEvent) => {
    // Remembers the initial width each time the mouse is pressed
    startX.current = e.clientX;
    startDragWidth.current = config.sidebarWidth;
    const dragStartTime = Date.now();

    const handleDragMove = (e: MouseEvent) => {
      if (Date.now() < lastUpdateTime.current + 20) {
        return;
      }
      lastUpdateTime.current = Date.now();
      const d = e.clientX - startX.current;
      const nextWidth = limit(startDragWidth.current + d);
      config.update((config) => {
        if (nextWidth < MIN_SIDEBAR_WIDTH) {
          config.sidebarWidth = NARROW_SIDEBAR_WIDTH;
        } else {
          config.sidebarWidth = nextWidth;
        }
      });
    };

    const handleDragEnd = () => {
      // In useRef the data is non-responsive, so `config.sidebarWidth` can't get the dynamic sidebarWidth
      window.removeEventListener("pointermove", handleDragMove);
      window.removeEventListener("pointerup", handleDragEnd);

      // if user click the drag icon, should toggle the sidebar
      const shouldFireClick = Date.now() - dragStartTime < 300;
      if (shouldFireClick) {
        toggleSideBar();
      }
    };

    window.addEventListener("pointermove", handleDragMove);
    window.addEventListener("pointerup", handleDragEnd);
  };

  const isMobileScreen = useMobileScreen();
  const shouldNarrow =
    !isMobileScreen && config.sidebarWidth < MIN_SIDEBAR_WIDTH;

  useEffect(() => {
    const barWidth = shouldNarrow
      ? NARROW_SIDEBAR_WIDTH
      : limit(config.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH);
    const sideBarWidth = isMobileScreen ? "100vw" : `${barWidth}px`;
    document.documentElement.style.setProperty("--sidebar-width", sideBarWidth);
  }, [config.sidebarWidth, isMobileScreen, shouldNarrow]);

  return {
    onDragStart,
    shouldNarrow,
  };
}

export function SideBarContainer(props: {
  children: React.ReactNode;
  onDragStart: (e: MouseEvent) => void;
  shouldNarrow: boolean;
  className?: string;
}) {
  const isMobileScreen = useMobileScreen();
  const isIOSMobile = useMemo(
    () => isIOS() && isMobileScreen,
    [isMobileScreen],
  );
  const { children, className, onDragStart, shouldNarrow } = props;
  return (
    <div
      className={clsx(styles.sidebar, className, {
        [styles["narrow-sidebar"]]: shouldNarrow,
      })}
      style={{
        // #3016 disable transition on ios mobile screen
        transition: isMobileScreen && isIOSMobile ? "none" : undefined,
      }}
    >
      {children}
      <div
        className={styles["sidebar-drag"]}
        onPointerDown={(e) => onDragStart(e as any)}
      >
        <DragIcon />
      </div>
    </div>
  );
}

export function SideBarHeader(props: {
  title?: string | React.ReactNode;
  subTitle?: string | React.ReactNode;
  logo?: React.ReactNode;
  children?: React.ReactNode;
  shouldNarrow?: boolean;
}) {
  const { title, subTitle, logo, children, shouldNarrow } = props;
  return (
    <Fragment>
      <div
        className={clsx(styles["sidebar-header"], {
          [styles["sidebar-header-narrow"]]: shouldNarrow,
        })}
        data-tauri-drag-region
      >
        <div className={styles["sidebar-title-container"]}>
          <div className={styles["sidebar-title"]} data-tauri-drag-region>
            {title}
          </div>
          <div className={styles["sidebar-sub-title"]}>{subTitle}</div>
        </div>
        <div className={clsx(styles["sidebar-logo"], "no-dark")}>{logo}</div>
      </div>
      {children}
    </Fragment>
  );
}

export function SideBarBody(props: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
}) {
  const { onClick, children } = props;
  return (
    <div className={styles["sidebar-body"]} onClick={onClick}>
      {children}
    </div>
  );
}

function CommitBadge() {
  const commitSha = process.env.COMMIT_SHA || "dev";
  const repo = process.env.GITHUB_REPO || "Enderfga/ChatGPT-Next-Web";
  const shortSha = commitSha.slice(0, 7);
  const commitUrl = `https://github.com/${repo}/commit/${commitSha}`;

  return (
    <a
      href={commitUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={`Commit: ${commitSha}`}
      style={{
        fontSize: "10px",
        color: "#666",
        textDecoration: "none",
        fontFamily: "monospace",
        padding: "2px 6px",
        background: "rgba(255,255,255,0.05)",
        borderRadius: "4px",
        marginLeft: "8px",
        alignSelf: "center",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "#999")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "#666")}
    >
      {shortSha}
    </a>
  );
}

export function SideBarTail(props: {
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  healthStatus?: "online" | "offline" | "loading";
}) {
  const { primaryAction, secondaryAction, healthStatus } = props;

  return (
    <div className={styles["sidebar-tail"]}>
      <div className={styles["sidebar-actions-full"]}>
        {primaryAction}
        <div
          title={
            healthStatus === "online"
              ? "Openclaw Online"
              : healthStatus === "loading"
              ? "Checking..."
              : "Openclaw Offline"
          }
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            backgroundColor:
              healthStatus === "online"
                ? "#3fb950"
                : healthStatus === "loading"
                ? "#ebb10d"
                : "#f85149",
            boxShadow:
              healthStatus === "online"
                ? "0 0 8px #3fb950"
                : healthStatus === "loading"
                ? "0 0 8px #ebb10d"
                : "none",
            animation:
              healthStatus === "online" || healthStatus === "loading"
                ? "pulse 2s infinite"
                : "none",
            cursor: "help",
            marginLeft: "0px",
            alignSelf: "center",
          }}
        />
        <CommitBadge />
      </div>
    </div>
  );
}

export function SideBar(props: { className?: string }) {
  useHotKey();
  const { onDragStart, shouldNarrow } = useDragSideBar();
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const navigate = useNavigate();
  const config = useAppConfig();
  const chatStore = useChatStore();
  const [mcpEnabled, setMcpEnabled] = useState(false);

  const session = chatStore.currentSession();
  const currentModel = session.mask.modelConfig.model;

  // 只有选中了 Openclaw（通常是列表第一个，名称包含 opus-4-5）才显示
  const isOpenclawSelected = currentModel.toLowerCase().includes("opus-4-5");

  const MODEL_OPTIONS = [
    { title: "Gemini 3 Flash", value: "google/gemini-3-flash-preview" },
    { title: "Azure GPT-4o", value: "azure/gpt-4o" },
    { title: "Claude 4.5 Opus", value: "anthropic/claude-opus-4-5" },
  ];

  const getModelName = (model: string) => {
    if (model.includes("gemini")) return "Gemini 3 Flash";
    if (model.includes("gpt-4o")) return "GPT-4o (Azure)";
    if (model.includes("opus") || model.includes("claude-4.5"))
      return "Claude 4.5 Opus";
    return "Unknown Model";
  };

  // Health check states
  const [healthStatus, setHealthStatus] = useState<
    "online" | "offline" | "loading"
  >("loading");
  const [adminUrl, setAdminUrl] = useState<string>("");

  // 当前后端真实运行的模型（由 API 返回）
  const [backendModel, setBackendModel] = useState<string>("");

  const checkHealth = async (retries = 2) => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        // 检查实际的 status 字段，而不只是 HTTP 状态
        if (data.status === "online") {
          setHealthStatus("online");
        } else {
          // degraded, offline, 或其他状态都视为 offline
          setHealthStatus("offline");
        }
        if (data.model) setBackendModel(data.model);
        if (data.adminUrl) {
          setAdminUrl(data.adminUrl);
          (window as any).__OPENCLAW_ADMIN_URL = data.adminUrl;
        }
      } else {
        // Retry on non-200 responses
        if (retries > 0) {
          setTimeout(() => checkHealth(retries - 1), 2000);
        } else {
          setHealthStatus("offline");
        }
      }
    } catch (e) {
      console.error("[Health] Check failed:", e);
      // Retry on network errors
      if (retries > 0) {
        setTimeout(() => checkHealth(retries - 1), 2000);
      } else {
        setHealthStatus("offline");
      }
    }
  };

  const handleRestart = async () => {
    if (
      await showConfirm(
        "确定要重启 Openclaw 吗？\n\n如果普通重启失败，将自动尝试智能修复 (doctor --fix)",
      )
    ) {
      setHealthStatus("loading");
      try {
        const res = await fetch("/api/health", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "restart-smart" }),
        });

        const data = await res.json();
        if (data.status === "restarted") {
          showToast("✅ 重启成功");
        } else if (data.status === "error") {
          showToast("⚠️ 重启失败: " + (data.message || "未知错误"));
        }
        setTimeout(checkHealth, 5000);
      } catch (e) {
        console.error("Restart failed", e);
        showToast("❌ 重启请求失败");
      }
    }
  };

  const handleModelChange = async (newModel: string) => {
    if (
      await showConfirm(
        `确定要将 Openclaw 的主模型切换为 ${newModel} 吗？\n\n这会导致后端服务立即重启。`,
      )
    ) {
      setHealthStatus("loading");
      try {
        const res = await fetch("/api/health", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "switch-model", model: newModel }),
        });
        if (res.ok) {
          showToast("🚀 正在切换主模型并重启中...");
          setTimeout(() => {
            window.location.reload();
          }, 3000);
        }
      } catch (e) {
        showToast("❌ 切换请求失败");
      }
    }
  };

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkMcpStatus = async () => {
      const enabled = await isMcpEnabled();
      setMcpEnabled(enabled);
    };
    checkMcpStatus();
  }, []);

  return (
    <SideBarContainer
      onDragStart={onDragStart}
      shouldNarrow={shouldNarrow}
      {...props}
    >
      <SideBarHeader
        title={
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "8px",
            }}
          >
            <div
              style={{ cursor: "pointer" }}
              onClick={() => navigate(Path.Home)}
            >
              Chat
            </div>
            {isOpenclawSelected && !shouldNarrow && (
              <div
                onClick={() => setShowModelSelector(true)}
                style={{
                  cursor: "pointer",
                  fontSize: "10px",
                  color: "var(--primary)",
                  border: "1px solid var(--primary)",
                  borderRadius: "4px",
                  padding: "1px 6px",
                  display: "flex",
                  alignItems: "center",
                  lineHeight: "1.4",
                  fontWeight: "bold",
                  backgroundColor: "rgba(var(--primary-rgb), 0.15)",
                  whiteSpace: "nowrap",
                }}
              >
                {getModelName(backendModel || currentModel)}
              </div>
            )}
          </div>
        }
        subTitle="安总的 AI 助手"
        logo={<ChatGptIcon />}
        shouldNarrow={shouldNarrow}
      >
        <div className={styles["sidebar-header-bar"]}>
          <IconButton
            icon={<AddIcon />}
            title="新聊天"
            className={styles["sidebar-bar-button"]}
            onClick={() => {
              if (config.dontShowMaskSplashScreen) {
                chatStore.newSession();
                navigate(Path.Chat);
              } else {
                navigate(Path.NewChat);
              }
            }}
            shadow
          />
          <Link to={Path.Settings}>
            <IconButton
              icon={<SettingsIcon />}
              title="设置"
              className={styles["sidebar-bar-button"]}
              shadow
            />
          </Link>
          <IconButton
            icon={<BookIcon />}
            title="文档"
            className={styles["sidebar-bar-button"]}
            onClick={() => window.open("/docs", "_blank")}
            shadow
          />
          <IconButton
            icon={<TerminalIcon />}
            title="终端"
            className={styles["sidebar-bar-button"]}
            onClick={() => setShowTerminal(true)}
            shadow
          />
        </div>
        {showModelSelector && (
          <Selector
            defaultSelectedValue={backendModel}
            items={MODEL_OPTIONS}
            onClose={() => setShowModelSelector(false)}
            onSelection={(s) => {
              if (s.length === 0) return;
              const model = s[0];
              if (model !== backendModel) {
                handleModelChange(model);
              }
            }}
          />
        )}
      </SideBarHeader>
      <SideBarBody
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            navigate(Path.Home);
          }
        }}
      >
        <ChatList narrow={shouldNarrow} />
      </SideBarBody>
      <SideBarTail
        healthStatus={healthStatus}
        primaryAction={
          <>
            <div className={styles["sidebar-action"]}>
              <IconButton
                icon={<ConnectionIcon />}
                onClick={() => {
                  const adminPath = "https://api.enderfga.cn/";
                  window.open(adminPath, "_blank");
                  showToast("正在打开 Openclaw 控制台...");
                }}
                title="打开 Openclaw 管理面板"
                shadow
              />
            </div>
            <div className={styles["sidebar-action"]}>
              <IconButton
                icon={<ReloadIcon />}
                onClick={handleRestart}
                title="重启 Gateway"
                shadow
              />
            </div>
          </>
        }
      />
      <TerminalModal
        isOpen={showTerminal}
        onClose={() => setShowTerminal(false)}
      />
    </SideBarContainer>
  );
}

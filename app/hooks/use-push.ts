import { useEffect, useRef, useCallback, useState } from "react";

// 多模态内容类型
export interface MultimodalContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface PushMessage {
  id: string;
  sessionId: string;
  type: "message" | "status" | "error";
  content: string | MultimodalContent[];
  role?: "assistant" | "system";
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// 辅助函数：提取文本内容用于预览
export function getTextPreview(
  content: string | MultimodalContent[],
  maxLength = 50,
): string {
  if (typeof content === "string") {
    return content.length > maxLength
      ? content.slice(0, maxLength) + "..."
      : content;
  }

  // 多模态内容：提取文本部分
  const textParts = content
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text!)
    .join(" ");

  const hasImages = content.some((item) => item.type === "image_url");
  const imageIndicator = hasImages ? "📷 " : "";

  const preview = textParts || (hasImages ? "[图片]" : "[空内容]");
  return (
    imageIndicator +
    (preview.length > maxLength ? preview.slice(0, maxLength) + "..." : preview)
  );
}

export interface UsePushOptions {
  sessionId: string;
  onMessage?: (message: PushMessage) => void;
  onStatus?: (message: PushMessage) => void;
  onError?: (message: PushMessage) => void;
  onConnect?: (clientId: string) => void;
  onDisconnect?: () => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  pollingInterval?: number; // 轮询间隔（毫秒）
}

export interface UsePushReturn {
  isConnected: boolean;
  clientId: string | null;
  connect: () => void;
  disconnect: () => void;
  sendMessage: (
    targetSessionId: string,
    content: string | MultimodalContent[],
    options?: {
      type?: "message" | "status" | "error";
      role?: "assistant" | "system";
      metadata?: Record<string, unknown>;
    },
  ) => Promise<{ success: boolean; messageId?: string; delivered?: boolean }>;
}

export function usePush(options: UsePushOptions): UsePushReturn {
  const {
    sessionId,
    onMessage,
    onStatus,
    onError,
    onConnect,
    onDisconnect,
    pollingInterval = 3000, // 默认 3 秒轮询
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const shouldPollRef = useRef(true);

  // 轮询函数
  const poll = useCallback(async () => {
    if (!sessionId || isPollingRef.current) return;

    isPollingRef.current = true;
    try {
      const url = `/api/push?sessionId=${encodeURIComponent(sessionId)}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // 处理收到的消息
      if (data.messages && Array.isArray(data.messages)) {
        for (const message of data.messages) {
          switch (message.type) {
            case "message":
              onMessage?.(message);
              break;
            case "status":
              onStatus?.(message);
              break;
            case "error":
              onError?.(message);
              break;
            default:
              onMessage?.(message);
          }
        }
      }

      // 更新连接状态
      if (!isConnected) {
        setIsConnected(true);
      }
    } catch (e) {
      console.error("[Push] Polling error:", e);
      // 轮询失败时不立即标记为断开，等待下次轮询
    } finally {
      isPollingRef.current = false;
    }
  }, [sessionId, onMessage, onStatus, onError, isConnected]);

  // 获取轮询间隔（页面不可见时降低频率）
  const getPollingInterval = useCallback(() => {
    if (typeof document !== "undefined" && document.hidden) {
      return pollingInterval * 5; // 页面不可见时，轮询频率降为 1/5
    }
    return pollingInterval;
  }, [pollingInterval]);

  // 启动轮询
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // 立即执行一次轮询
    poll();

    // 设置定时轮询
    const scheduleNextPoll = () => {
      if (!shouldPollRef.current) return;

      pollingIntervalRef.current = setTimeout(() => {
        poll().then(() => {
          scheduleNextPoll();
        });
      }, getPollingInterval());
    };

    scheduleNextPoll();
  }, [poll, getPollingInterval]);

  // 停止轮询
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearTimeout(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    shouldPollRef.current = false;
    stopPolling();
    setIsConnected(false);
    setClientId(null);
    onDisconnect?.();
  }, [onDisconnect, stopPolling]);

  const connect = useCallback(() => {
    shouldPollRef.current = true;

    // 生成客户端 ID
    const newClientId = `poll-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    setClientId(newClientId);
    onConnect?.(newClientId);

    console.log("[Push] Starting polling for session:", sessionId);
    startPolling();
  }, [sessionId, onConnect, startPolling]);

  // 发送消息到其他 session（支持文本和多模态内容）
  const sendMessage = useCallback(
    async (
      targetSessionId: string,
      content: string | MultimodalContent[],
      options?: {
        type?: "message" | "status" | "error";
        role?: "assistant" | "system";
        metadata?: Record<string, unknown>;
      },
    ) => {
      try {
        const response = await fetch("/api/push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: targetSessionId,
            content,
            type: options?.type || "message",
            role: options?.role || "assistant",
            metadata: options?.metadata,
          }),
        });

        return await response.json();
      } catch (e) {
        console.error("[Push] Failed to send message:", e);
        return { success: false };
      }
    },
    [],
  );

  // 监听页面可见性变化
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log("[Push] Page hidden, reducing poll frequency");
      } else {
        console.log("[Push] Page visible, resuming normal poll frequency");
        // 页面变为可见时立即轮询一次
        if (shouldPollRef.current && sessionId) {
          poll();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [poll, sessionId]);

  // 自动连接
  useEffect(() => {
    if (sessionId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isConnected,
    clientId,
    connect,
    disconnect,
    sendMessage,
  };
}

// 简单的全局推送 API（用于非 React 环境）- 支持文本和多模态内容
export async function pushMessage(
  sessionId: string,
  content: string | MultimodalContent[],
  options?: {
    type?: "message" | "status" | "error";
    role?: "assistant" | "system";
    metadata?: Record<string, unknown>;
  },
) {
  try {
    const response = await fetch("/api/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId,
        content,
        type: options?.type || "message",
        role: options?.role || "assistant",
        metadata: options?.metadata,
      }),
    });

    return await response.json();
  } catch (e) {
    console.error("[Push] Failed to send message:", e);
    return { success: false };
  }
}

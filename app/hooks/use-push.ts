import { useEffect, useRef, useCallback, useState } from "react";

export interface PushMessage {
  id: string;
  sessionId: string;
  type: "message" | "status" | "error";
  content: string;
  role?: "assistant" | "system";
  timestamp: number;
  metadata?: Record<string, unknown>;
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
}

export interface UsePushReturn {
  isConnected: boolean;
  clientId: string | null;
  connect: () => void;
  disconnect: () => void;
  sendMessage: (
    targetSessionId: string,
    content: string,
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
    autoReconnect = true,
    reconnectDelay = 3000,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
    setClientId(null);
    onDisconnect?.();
  }, [onDisconnect]);

  const connect = useCallback(() => {
    // 关闭现有连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    shouldReconnectRef.current = autoReconnect;

    const url = `/api/push?sessionId=${encodeURIComponent(sessionId)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("connected", (event) => {
      try {
        const data = JSON.parse(event.data);
        setIsConnected(true);
        setClientId(data.clientId);
        onConnect?.(data.clientId);
        console.log("[Push] Connected:", data);
      } catch (e) {
        console.error("[Push] Failed to parse connected event:", e);
      }
    });

    eventSource.addEventListener("message", (event) => {
      try {
        const message: PushMessage = JSON.parse(event.data);
        onMessage?.(message);
      } catch (e) {
        console.error("[Push] Failed to parse message:", e);
      }
    });

    eventSource.addEventListener("status", (event) => {
      try {
        const message: PushMessage = JSON.parse(event.data);
        onStatus?.(message);
      } catch (e) {
        console.error("[Push] Failed to parse status:", e);
      }
    });

    eventSource.addEventListener("error", (event) => {
      try {
        // 尝试解析自定义错误事件
        if (event instanceof MessageEvent && event.data) {
          const message: PushMessage = JSON.parse(event.data);
          onError?.(message);
        }
      } catch (e) {
        // 连接错误
      }
    });

    eventSource.onerror = () => {
      console.log("[Push] Connection error, will reconnect...");
      setIsConnected(false);
      setClientId(null);

      if (shouldReconnectRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("[Push] Attempting to reconnect...");
          connect();
        }, reconnectDelay);
      }
    };
  }, [
    sessionId,
    autoReconnect,
    reconnectDelay,
    onConnect,
    onMessage,
    onStatus,
    onError,
  ]);

  // 发送消息到其他 session
  const sendMessage = useCallback(
    async (
      targetSessionId: string,
      content: string,
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

// 简单的全局推送 API（用于非 React 环境）
export async function pushMessage(
  sessionId: string,
  content: string,
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

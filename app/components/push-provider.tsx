"use client";

import { useEffect, useCallback } from "react";
import { usePush, PushMessage, getTextPreview } from "../hooks/use-push";
import { useChatStore } from "../store";
import { showToast } from "./ui-lib";

interface PushProviderProps {
  children: React.ReactNode;
  showNotifications?: boolean;
}

export function PushProvider({
  children,
  showNotifications = true,
}: PushProviderProps) {
  const chatStore = useChatStore();
  const sessionId = chatStore.getCurrentSessionId();

  const handleMessage = useCallback(
    (message: PushMessage) => {
      console.log("[PushProvider] Received message:", message);

      // 添加消息到对应的会话
      const success = chatStore.receivePushMessage(
        message.sessionId,
        message.content,
        {
          role: message.role,
          metadata: message.metadata,
        },
      );

      // 显示通知
      if (success && showNotifications) {
        const preview = getTextPreview(message.content, 50);
        showToast(`New message: ${preview}`);
      }
    },
    [chatStore, showNotifications],
  );

  const handleStatus = useCallback((message: PushMessage) => {
    console.log("[PushProvider] Received status:", message);
  }, []);

  const handleError = useCallback((message: PushMessage) => {
    console.error("[PushProvider] Received error:", message);
    showToast(`Error: ${message.content}`);
  }, []);

  const handleConnect = useCallback((clientId: string) => {
    console.log("[PushProvider] Connected with clientId:", clientId);
  }, []);

  const handleDisconnect = useCallback(() => {
    console.log("[PushProvider] Disconnected");
  }, []);

  const { isConnected, clientId } = usePush({
    sessionId: sessionId || "",
    onMessage: handleMessage,
    onStatus: handleStatus,
    onError: handleError,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    autoReconnect: true,
  });

  // 当会话改变时，连接状态会自动更新
  useEffect(() => {
    if (sessionId) {
      console.log(
        `[PushProvider] Session changed to ${sessionId}, connected: ${isConnected}`,
      );
    }
  }, [sessionId, isConnected]);

  return <>{children}</>;
}

// 用于显示连接状态的小组件（可选）
export function PushStatus() {
  const chatStore = useChatStore();
  const sessionId = chatStore.getCurrentSessionId();

  const { isConnected } = usePush({
    sessionId: sessionId || "",
    autoReconnect: true,
  });

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "12px",
        color: isConnected ? "#22c55e" : "#ef4444",
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: isConnected ? "#22c55e" : "#ef4444",
        }}
      />
      {isConnected ? "Connected" : "Disconnected"}
    </div>
  );
}

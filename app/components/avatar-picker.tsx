"use client";

import dynamic from "next/dynamic";
import { EmojiStyle, Theme as EmojiTheme } from "emoji-picker-react";

// 动态导入 EmojiPicker，只在需要时加载（~300KB）
const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: 350,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      Loading...
    </div>
  ),
});

export function getEmojiUrl(unified: string, style: EmojiStyle) {
  return `https://fastly.jsdelivr.net/npm/emoji-datasource-apple/img/${style}/64/${unified}.png`;
}

export function AvatarPicker(props: {
  onEmojiClick: (emojiId: string) => void;
}) {
  return (
    <EmojiPicker
      width={"100%"}
      lazyLoadEmojis
      theme={EmojiTheme.AUTO}
      getEmojiUrl={getEmojiUrl}
      onEmojiClick={(e) => {
        props.onEmojiClick(e.unified);
      }}
    />
  );
}

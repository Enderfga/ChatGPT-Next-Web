import { ModelType } from "../store";

// EmojiStyle 枚举值，与 emoji-picker-react 保持一致
// 不再静态导入整个库（~300KB），只用 CDN 图片
type EmojiStyle = "apple" | "google" | "twitter" | "facebook";
const DEFAULT_EMOJI_STYLE: EmojiStyle = "apple";

import BotIconDefault from "../icons/llm-icons/default.svg";
import BotIconOpenAI from "../icons/llm-icons/openai.svg";
import BotIconGemini from "../icons/llm-icons/gemini.svg";
import BotIconGemma from "../icons/llm-icons/gemma.svg";
import BotIconClaude from "../icons/llm-icons/claude.svg";
import BotIconMeta from "../icons/llm-icons/meta.svg";
import BotIconMistral from "../icons/llm-icons/mistral.svg";
import BotIconDeepseek from "../icons/llm-icons/deepseek.svg";
import BotIconMoonshot from "../icons/llm-icons/moonshot.svg";
import BotIconQwen from "../icons/llm-icons/qwen.svg";
import BotIconWenxin from "../icons/llm-icons/wenxin.svg";
import BotIconGrok from "../icons/llm-icons/grok.svg";
import BotIconHunyuan from "../icons/llm-icons/hunyuan.svg";
import BotIconDoubao from "../icons/llm-icons/doubao.svg";
import BotIconChatglm from "../icons/llm-icons/chatglm.svg";

export function getEmojiUrl(
  unified: string,
  style: EmojiStyle = DEFAULT_EMOJI_STYLE,
) {
  // Whoever owns this Content Delivery Network (CDN), I am using your CDN to serve emojis
  // Old CDN broken, so I had to switch to this one
  // Author: https://github.com/H0llyW00dzZ
  return `https://fastly.jsdelivr.net/npm/emoji-datasource-apple/img/${style}/64/${unified}.png`;
}

export function Avatar(props: { model?: ModelType; avatar?: string }) {
  let LlmIcon = BotIconDefault;

  if (props.model) {
    const modelName = props.model.toLowerCase();
    // 支持 "provider/model" 格式，提取实际模型名
    const actualModel = modelName.includes("/")
      ? modelName.split("/").pop() || modelName
      : modelName;

    if (
      actualModel.startsWith("gpt") ||
      actualModel.startsWith("chatgpt") ||
      actualModel.startsWith("dall-e") ||
      actualModel.startsWith("dalle") ||
      actualModel.startsWith("o1") ||
      actualModel.startsWith("o3")
    ) {
      LlmIcon = BotIconOpenAI;
    } else if (actualModel.startsWith("gemini")) {
      LlmIcon = BotIconGemini;
    } else if (actualModel.startsWith("gemma")) {
      LlmIcon = BotIconGemma;
    } else if (actualModel.startsWith("claude")) {
      LlmIcon = BotIconClaude;
    } else if (actualModel.includes("llama")) {
      LlmIcon = BotIconMeta;
    } else if (
      actualModel.startsWith("mixtral") ||
      actualModel.startsWith("codestral")
    ) {
      LlmIcon = BotIconMistral;
    } else if (actualModel.includes("deepseek")) {
      LlmIcon = BotIconDeepseek;
    } else if (actualModel.startsWith("moonshot")) {
      LlmIcon = BotIconMoonshot;
    } else if (actualModel.startsWith("qwen")) {
      LlmIcon = BotIconQwen;
    } else if (actualModel.startsWith("ernie")) {
      LlmIcon = BotIconWenxin;
    } else if (actualModel.startsWith("grok")) {
      LlmIcon = BotIconGrok;
    } else if (actualModel.startsWith("hunyuan")) {
      LlmIcon = BotIconHunyuan;
    } else if (
      actualModel.startsWith("doubao") ||
      actualModel.startsWith("ep-")
    ) {
      LlmIcon = BotIconDoubao;
    } else if (
      actualModel.includes("glm") ||
      actualModel.startsWith("cogview-") ||
      actualModel.startsWith("cogvideox-")
    ) {
      LlmIcon = BotIconChatglm;
    }

    return (
      <div className="no-dark">
        <LlmIcon className="user-avatar" width={30} height={30} />
      </div>
    );
  }

  return (
    <div className="user-avatar">
      {props.avatar && <EmojiAvatar avatar={props.avatar} />}
    </div>
  );
}

export function EmojiAvatar(props: { avatar: string; size?: number }) {
  const size = props.size ?? 18;
  return (
    <img
      src={getEmojiUrl(props.avatar, DEFAULT_EMOJI_STYLE)}
      alt="emoji"
      width={size}
      height={size}
      style={{ display: "inline-block", verticalAlign: "middle" }}
    />
  );
}

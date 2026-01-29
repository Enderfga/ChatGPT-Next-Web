import { useEffect } from "react";
import { useSpeechRecognition } from "@/app/hooks/use-speech-recognition";
import VoiceIcon from "@/app/icons/voice.svg";
import VoiceOffIcon from "@/app/icons/voice-off.svg";
import styles from "./voice-input-button.module.scss";
import clsx from "clsx";

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  language?: string;
  disabled?: boolean;
}

export function VoiceInputButton({
  onTranscript,
  language = "zh-CN",
  disabled = false,
}: VoiceInputButtonProps) {
  const {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition(language);

  // 当有最终识别结果时，传递给父组件
  useEffect(() => {
    if (transcript) {
      onTranscript(transcript);
      resetTranscript();
    }
  }, [transcript, onTranscript, resetTranscript]);

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  if (!isSupported) {
    return null; // 浏览器不支持，不显示按钮
  }

  return (
    <div className={styles["voice-input-wrapper"]}>
      <button
        className={clsx(styles["voice-input-button"], {
          [styles["listening"]]: isListening,
        })}
        onClick={handleClick}
        disabled={disabled}
        title={isListening ? "停止录音" : "语音输入"}
        type="button"
      >
        {isListening ? <VoiceOffIcon /> : <VoiceIcon />}
      </button>
      {isListening && interimTranscript && (
        <div className={styles["interim-transcript"]}>{interimTranscript}</div>
      )}
      {error && <div className={styles["error"]}>{error}</div>}
    </div>
  );
}

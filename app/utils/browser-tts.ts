/**
 * 浏览器原生 TTS (Web Speech API)
 * 优点：免费、无需后端、支持中文
 * 缺点：声音质量一般
 */

export interface BrowserTTSOptions {
  lang?: string;
  rate?: number; // 0.1 - 10, default 1
  pitch?: number; // 0 - 2, default 1
  volume?: number; // 0 - 1, default 1
  voiceName?: string; // 指定语音名称
}

class BrowserTTS {
  private utterance: SpeechSynthesisUtterance | null = null;
  private isPlaying: boolean = false;

  isSupported(): boolean {
    return "speechSynthesis" in window;
  }

  getVoices(): SpeechSynthesisVoice[] {
    return window.speechSynthesis.getVoices();
  }

  // 获取中文语音
  getChineseVoices(): SpeechSynthesisVoice[] {
    return this.getVoices().filter(
      (v) => v.lang.startsWith("zh") || v.lang.includes("Chinese"),
    );
  }

  async speak(text: string, options: BrowserTTSOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isSupported()) {
        reject(new Error("浏览器不支持语音合成"));
        return;
      }

      // 停止之前的播放
      this.stop();

      const utterance = new SpeechSynthesisUtterance(text);
      this.utterance = utterance;

      // 设置语言，默认中文
      utterance.lang = options.lang || "zh-CN";
      utterance.rate = options.rate || 1;
      utterance.pitch = options.pitch || 1;
      utterance.volume = options.volume || 1;

      // 尝试找一个好的中文语音
      const voices = this.getVoices();
      if (options.voiceName) {
        const voice = voices.find((v) => v.name === options.voiceName);
        if (voice) utterance.voice = voice;
      } else {
        // 优先选择中文语音
        const chineseVoice = voices.find(
          (v) =>
            v.lang.startsWith("zh") &&
            (v.name.includes("Xiaoxiao") ||
              v.name.includes("Yunxi") ||
              v.name.includes("Google") ||
              v.localService === false), // 在线语音通常质量更好
        );
        if (chineseVoice) {
          utterance.voice = chineseVoice;
        }
      }

      utterance.onstart = () => {
        this.isPlaying = true;
      };

      utterance.onend = () => {
        this.isPlaying = false;
        this.utterance = null;
        resolve();
      };

      utterance.onerror = (event) => {
        this.isPlaying = false;
        this.utterance = null;
        reject(new Error(`语音合成错误: ${event.error}`));
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    window.speechSynthesis.cancel();
    this.isPlaying = false;
    this.utterance = null;
  }

  pause(): void {
    window.speechSynthesis.pause();
  }

  resume(): void {
    window.speechSynthesis.resume();
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

// 单例
export const browserTTS = new BrowserTTS();

// 简单的朗读函数
export async function speakText(
  text: string,
  options?: BrowserTTSOptions,
): Promise<void> {
  return browserTTS.speak(text, options);
}

export function stopSpeaking(): void {
  browserTTS.stop();
}

export function isSpeaking(): boolean {
  return browserTTS.getIsPlaying();
}

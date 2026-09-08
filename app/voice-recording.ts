export type RecordingState = { phase: "idle" | "requesting" | "recording" | "finishing"; seconds: number };
export const voiceMimeTypes = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/ogg;codecs=opus"];
export function microphoneError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "麦克风权限未开启，请在浏览器的网站权限中允许麦克风；内置浏览器受限时可用 Safari 或 Chrome 打开。";
  if (name === "NotFoundError") return "没有找到可用麦克风，请检查设备连接。";
  if (name === "NotReadableError" || name === "AbortError") return "麦克风暂时无法使用，请结束占用麦克风的通话后重试。";
  return "无法开始录音，请检查浏览器麦克风权限后重试。";
}

/** One recording session. The first stop/cancel decision wins, including async stop events. */
export class VoiceRecording {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private phase: RecordingState["phase"] = "idle";
  private decision: "send" | "discard" | null = null;
  private disposed = false;
  private seconds = 0;
  private callbacks: { state: (state: RecordingState) => void; recorded: (file: File) => void; error: (message: string) => void };
  constructor(callbacks: { state: (state: RecordingState) => void; recorded: (file: File) => void; error: (message: string) => void }) { this.callbacks = callbacks; }
  private emit(phase: RecordingState["phase"]) { this.phase = phase; if (!this.disposed) this.callbacks.state({ phase, seconds: this.seconds }); }
  private release() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
  }
  stop(discard = false) {
    if (this.phase !== "recording" || this.decision) return;
    this.decision = discard ? "discard" : "send";
    if (this.timer) clearInterval(this.timer); this.timer = null;
    this.emit("finishing");
    if (this.recorder?.state !== "inactive") this.recorder?.stop();
  }
  dispose() {
    this.disposed = true; this.decision = "discard";
    if (this.recorder?.state !== "inactive") this.recorder?.stop();
    this.release();
  }
  async start() {
    if (this.disposed || this.phase !== "idle") return;
    if (!globalThis.navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      this.callbacks.error("当前浏览器未提供网页录音，请使用 HTTPS 下的 Safari 或 Chrome，或选取已有语音文件发送。"); return;
    }
    this.emit("requesting"); this.callbacks.error("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (this.disposed) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const mimeType = voiceMimeTypes.find(type => typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      this.recorder = recorder; this.decision = null;
      const chunks: Blob[] = []; let bytes = 0;
      recorder.ondataavailable = event => {
        if (!event.data.size) return;
        chunks.push(event.data); bytes += event.data.size;
        if (bytes >= 25 * 1024 * 1024) this.stop();
      };
      recorder.onerror = () => {
        this.decision = "discard";
        if (!this.disposed) this.callbacks.error("录音中断，未发送语音，请重新录制。");
        this.emit("finishing");
        if (recorder.state !== "inactive") recorder.stop();
        this.release();
      };
      recorder.onstop = () => {
        this.release(); this.emit("idle");
        if (this.disposed || this.decision === "discard") return;
        const type = recorder.mimeType || chunks.find(chunk => chunk.type)?.type || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        if (!blob.size) { this.callbacks.error("没有录到声音，请重新录制。"); return; }
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
        this.callbacks.recorded(new File([blob], `语音-${Date.now()}.${extension}`, { type }));
      };
      recorder.start(1000);
      const startedAt = Date.now(); this.seconds = 0; this.emit("recording");
      this.timer = setInterval(() => {
        this.seconds = Math.floor((Date.now() - startedAt) / 1000); this.emit("recording");
        if (this.seconds >= 300) this.stop();
      }, 250);
    } catch (error) { this.release(); this.emit("idle"); if (!this.disposed) this.callbacks.error(microphoneError(error)); }
  }
}

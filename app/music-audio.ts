export type LocalMusic = { track: MediaStreamTrack; close: () => void };
export async function connectLocalMusic(
  code: string,
  onClosed: (message: string) => void,
): Promise<LocalMusic> {
  if (!/^[a-f0-9]{48}$/.test(code)) throw Error("请输入连接程序中的配对码");
  const context = new AudioContext({ sampleRate: 48000 });
  await context.resume();
  let ws: WebSocket | undefined, node: AudioWorkletNode | undefined;
  const destination = context.createMediaStreamDestination();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    ws?.close();
    node?.disconnect();
    destination.stream.getTracks().forEach((t) => t.stop());
    void context.close();
  };
  try {
    await context.audioWorklet.addModule("/music/pcm-worklet.js");
    node = new AudioWorkletNode(context, "music-pcm", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    node.connect(destination);
    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://127.0.0.1:19743/music/${code}`);
      ws.binaryType = "arraybuffer";
      let ready = false,
        last = Date.now();
      const timer = setInterval(() => {
        if (Date.now() - last > 8000) {
          clearInterval(timer);
          close();
          const message = "网易云连接已中断，请重新连接";
          if (!ready) reject(Error(message));
          else onClosed(message);
        }
      }, 1000);
      ws.onmessage = (e) => {
        last = Date.now();
        if (typeof e.data === "string") {
          try {
            const message = JSON.parse(e.data);
            if (message.error) throw Error(message.error);
            if (message.ready && message.sampleRate === 48000) {
              ready = true;
              resolve();
            }
          } catch (err) {
            clearInterval(timer);
            close();
            reject(err);
          }
        } else if (ready) node!.port.postMessage(e.data, [e.data]);
      };
      ws.onerror = () => {
        if (!ready)
          reject(Error("无法连接本机程序，请打开它并允许浏览器访问本机网络"));
      };
      ws.onclose = () => {
        clearInterval(timer);
        if (!closed) {
          close();
          onClosed("网易云连接已停止");
        }
        if (!ready) reject(Error("连接已关闭，请检查配对码及网易云是否运行"));
      };
    });
    return { track: destination.stream.getAudioTracks()[0], close };
  } catch (e) {
    close();
    throw e;
  }
}
export async function joinMusicAudio(options: {
  diagnostics?: (samples: number, relay: boolean) => void;
  room: RTCPeerConnection;
  leader: boolean;
  track?: MediaStreamTrack;
  audio: HTMLAudioElement;
  ready: () => void;
  error: (message: string) => void;
  signal: (kind: "offer" | "answer", sdp: string) => Promise<void>;
  readSignal: () => Promise<{ offer: string; answer?: string } | undefined>;
}) {
  const pc = options.room;
  let announced = false,
    lastSamples = 0,
    lastAt = Date.now();
  pc.onconnectionstatechange = () => {
    if (["failed", "disconnected"].includes(pc.connectionState)) {
      announced = false;
      options.error("音乐连接已中断，请结束后重新邀请");
    }
    if (options.leader && pc.connectionState === "connected") options.ready();
  };
  pc.ontrack = (event) => {
    options.audio.srcObject = new MediaStream([event.track]);
    void options.audio
      .play()
      .catch(() => options.error("请点击开始收听，允许浏览器播放音乐"));
  };
  const closed = () => pc.signalingState === "closed";
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  const gather = async () => {
    const start = Date.now();
    while (
      !closed() &&
      pc.iceGatheringState !== "complete" &&
      Date.now() - start < 10000
    )
      await delay(100);
    if (closed()) throw Error("音乐连接已结束");
  };
  const waitSignal = async (key: "offer" | "answer") => {
    const start = Date.now();
    while (!closed() && Date.now() - start < 45000) {
      const signal = await options.readSignal();
      if (signal?.[key]) return signal[key]!;
      await delay(700);
    }
    throw Error("等待对方连接超时，请结束后重新邀请");
  };
  if (options.leader) {
    if (!options.track) throw Error("本机音乐已断开");
    const sender = pc.addTrack(options.track, new MediaStream([options.track]));
    const params = sender.getParameters();
    if (params.encodings?.length) {
      params.encodings[0].maxBitrate = 128000;
      await sender.setParameters(params);
    }
    await pc.setLocalDescription(await pc.createOffer());
    await gather();
    await options.signal("offer", pc.localDescription!.sdp);
    const answer = await waitSignal("answer");
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
  } else {
    const offer = await waitSignal("offer");
    await pc.setRemoteDescription({ type: "offer", sdp: offer });
    await pc.setLocalDescription(await pc.createAnswer());
    await gather();
    await options.signal("answer", pc.localDescription!.sdp);
    const monitor = async () => {
      if (closed()) return;
      try {
        const stats = await pc.getStats();
        let samples = 0;
        stats.forEach((report) => {
          if (report.type === "inbound-rtp" && report.kind === "audio")
            samples += Number(report.totalSamplesReceived) || 0;
        });
        let relay = false;
        stats.forEach((report) => {
          if (
            report.type === "candidate-pair" &&
            report.state === "succeeded" &&
            report.nominated
          ) {
            const candidate = stats.get(report.localCandidateId);
            if (candidate?.candidateType === "relay") relay = true;
          }
        });
        options.diagnostics?.(samples, relay);
        if (samples > lastSamples) {
          lastSamples = samples;
          lastAt = Date.now();
          if (!options.audio.paused && !announced) {
            announced = true;
            options.ready();
          }
        }
        if (Date.now() - lastAt > 10000) {
          announced = false;
          options.error("尚未收到音乐，请检查分享方是否仍连接");
        }
      } catch {
        options.error("音乐连接暂不可用");
      }
      if (!closed()) setTimeout(() => void monitor(), 1000);
    };
    void monitor();
  }
}

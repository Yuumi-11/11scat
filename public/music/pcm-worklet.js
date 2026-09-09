class MusicPCM extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.frames = 0;
    this.port.onmessage = (e) => {
      const pcm = new Int16Array(e.data);
      this.queue.push(pcm);
      this.frames += pcm.length / 2;
      while (this.frames > 24000 && this.queue.length > 1) {
        this.frames -= (this.queue[0].length - this.offset) / 2;
        this.queue.shift();
        this.offset = 0;
      }
    };
  }
  process(inputs, outputs) {
    const channels = outputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      if (!this.queue.length) break;
      const pcm = this.queue[0];
      channels[0][i] = pcm[this.offset++] / 32768;
      if (channels[1]) channels[1][i] = pcm[this.offset++] / 32768;
      else this.offset++;
      this.frames--;
      if (this.offset >= pcm.length) {
        this.queue.shift();
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("music-pcm", MusicPCM);

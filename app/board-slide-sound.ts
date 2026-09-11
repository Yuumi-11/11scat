let context: AudioContext | undefined;
let lastPlayed = 0;
// Short filtered friction with a quiet rail stop; created only after a click.
export function playBoardSlideSound() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || Date.now() - lastPlayed < 180) return;
  lastPlayed = Date.now();
  try {
    context ||= new AudioContext();
    const audio = context;
    void audio.resume().then(() => {
      const duration = .27, buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / data.length);
      const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
      source.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = 520; filter.Q.value = .65; gain.gain.value = .025;
      source.connect(filter).connect(gain).connect(audio.destination);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
      source.start();
    }).catch(() => undefined);
  } catch { /* An unavailable audio output must not block board selection. */ }
}

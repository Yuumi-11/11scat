type VoiceAudio = { pause: () => void; play: () => Promise<void> };
let active: VoiceAudio | null = null;

export function claimVoice(audio: VoiceAudio) {
  if (active === audio) return;
  const previous = active;
  active = audio;
  previous?.pause();
}

export function playVoice(audio: VoiceAudio) {
  claimVoice(audio);
  return audio.play();
}

export function releaseVoice(audio: VoiceAudio) {
  if (active === audio) active = null;
  audio.pause();
}

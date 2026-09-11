// Request the browser's own source and audio picker within the click gesture.
// Audio is optional: an accepted video-only stream is a successful share.
export async function requestScreenShare(devices: Pick<MediaDevices, 'getDisplayMedia'> | undefined = navigator.mediaDevices): Promise<MediaStream> {
  if (!devices?.getDisplayMedia) throw new Error('当前浏览器不支持屏幕共享，请使用最新版 Chrome、Edge 或 Safari。');
  const options: DisplayMediaStreamOptions & { systemAudio: string; windowAudio: string; surfaceSwitching: string } = {
    video: { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 30, max: 60 } },
    audio: true,
    systemAudio: 'include',
    windowAudio: 'system',
    surfaceSwitching: 'include',
  };
  const stream = await devices.getDisplayMedia(options);
  if (!stream.getVideoTracks().some(track => track.readyState === 'live')) {
    stream.getTracks().forEach(track => track.stop());
    throw new Error('没有取得共享画面，请重新选择窗口或屏幕。');
  }
  return stream;
}

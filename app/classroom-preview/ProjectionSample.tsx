"use client";
import { useEffect, useRef } from 'react';

// An offline video source for the appearance preview; no camera or screen permission.
export function ProjectionSample({ source = 'self-screen' }: { source?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1280; canvas.height = 800;
    const context = canvas.getContext('2d');
    if (!context) return;
    let frame = 0;
    const camera = source.endsWith('camera');
    const peer = source.startsWith('peer');
    const draw = () => {
      context.fillStyle = peer ? '#dedfcd' : '#dce4dd'; context.fillRect(0, 0, 1280, 800);
      if (camera) {
        context.fillStyle = peer ? '#9eb6a8' : '#c6b79d';
        context.beginPath(); context.arc(640, 290, 108, 0, Math.PI * 2); context.fill();
        context.beginPath(); context.ellipse(640, 700, 235, 265, 0, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#edf0df'; context.fillRect(1020, 95, 90, 150);
        context.fillStyle = '#c7d4c4'; context.fillRect(1030, 105, 70, 130);
        frame++; return;
      }
      context.fillStyle = '#44574f'; context.fillRect(0, 0, 1280, 35);
      ['#cb997b', '#d7c681', '#95ae98'].forEach((color, index) => {
        context.fillStyle = color; context.beginPath(); context.arc(20 + index * 22, 18, 6, 0, Math.PI * 2); context.fill();
      });
      context.fillStyle = '#c3d0c6'; context.fillRect(0, 35, 190, 765);
      context.fillStyle = '#f4f1e6'; context.fillRect(235, 80, 1000, 665);
      context.strokeStyle = '#d3d9cd'; context.lineWidth = 2;
      for (let y = 150; y < 700; y += 70) { context.beginPath(); context.moveTo(285, y); context.lineTo(1185, y); context.stroke(); }
      context.strokeStyle = peer ? '#aa8964' : '#6c9384'; context.lineWidth = 7; context.beginPath();
      for (let x = 0; x <= 900; x += 4) {
        const y = 410 + Math.sin(x / 135 + frame / 90) * 125;
        if (!x) context.moveTo(285 + x, y); else context.lineTo(285 + x, y);
      }
      context.stroke(); frame++;
    };
    draw();
    const stream = canvas.captureStream(12);
    element.srcObject = stream;
    void element.play().catch(() => undefined);
    const timer = window.setInterval(draw, 1000 / 12);
    return () => { clearInterval(timer); element.srcObject = null; stream.getTracks().forEach(track => track.stop()); };
  }, [source]);
  return <video ref={video} className="main-media preview-media" autoPlay muted playsInline aria-label="本地投影演示画面" />;
}

"use client";

import { useLayoutEffect, useRef } from 'react';
import { inboxStampScale } from './inbox-claim-stamp';

export function InboxClaimStamp({ name, fontsReady }: { name: string; fontsReady: boolean }) {
  const clipRef = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const clip = clipRef.current, stamp = stampRef.current;
    if (!clip || !stamp) return;
    const fit = () => {
      clip.style.setProperty('--inbox-stamp-scale', String(inboxStampScale(stamp.offsetWidth, stamp.offsetHeight, clip.clientWidth, clip.clientHeight)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(clip); observer.observe(stamp);
    return () => observer.disconnect();
  }, [name, fontsReady]);
  return <div ref={clipRef} className="coop-inbox-stamp-clip">
    <div className="coop-inbox-stamp-scale"><span ref={stampRef} className="coop-claim-stamp" data-fonts-ready={fontsReady} aria-label={`认领者：${name}`}><span className="coop-claim-stamp-name">{name}</span></span></div>
  </div>;
}

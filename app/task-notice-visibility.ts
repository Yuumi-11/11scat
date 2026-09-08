export function watchNoticeVisibility(element: Element, onRead: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined, visible = false, read = false;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  const schedule = () => {
    cancel();
    if (visible && !document.hidden && !read) timer = setTimeout(() => { read = true; onRead(); }, 1200);
  };
  const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 1); schedule(); }, { threshold: 1 });
  observer.observe(element); document.addEventListener("visibilitychange", schedule);
  return () => { cancel(); observer.disconnect(); document.removeEventListener("visibilitychange", schedule); };
}

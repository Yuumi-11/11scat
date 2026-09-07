self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === "string" ? data.title : "11scat 新消息";
  const body = typeof data.body === "string" ? data.body : "自习室有一条新消息";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  event.waitUntil((async () => {
    const ring = data.kind === "ring" && typeof data.ringId === "string";
    if (ring) {
      if (!Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) return;
      const existing = await self.registration.getNotifications({ tag: `11scat-ring-${data.ringId}` });
      if (existing.some(notification => !data.repeat || (notification.data?.sequence || 0) >= (data.sequence || 1))) return;
    }
    await self.registration.showNotification(title, {
    body,
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag: ring ? `11scat-ring-${data.ringId}` : "11scat-room-message",
    renotify: !ring || !!data.repeat,
    ...(ring ? { actions: [{ action: "acknowledge", title: "知道了" }] } : {}),
    data: { url, ...(ring ? { ringId: data.ringId, sequence: data.sequence || 1 } : {}) },
    });
    // Display first: background network/authentication must not swallow a push.
    if (ring) {
      try {
        const response = await fetch("/api/room/rings", { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(5000) });
        if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("application/json")) return;
        const snapshot = await response.json();
        if (!snapshot.rings.some(item => item.id === data.ringId && item.recipientId === snapshot.identityId && item.state === "active")) {
          const notifications = await self.registration.getNotifications({ tag: `11scat-ring-${data.ringId}` });
          notifications.forEach(notification => notification.close());
        }
      } catch { /* Keep the single notification when the phone is offline. */ }
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    if (event.action === "acknowledge" && event.notification.data?.ringId) {
      try {
        const response = await fetch("/api/room/rings", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: event.notification.data.ringId, action: "acknowledge" }), signal: AbortSignal.timeout(8000) });
        if (response.ok) return;
      } catch { /* Open the room so the user can retry confirmation. */ }
    }
    return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const client = clients.find((item) => item.url.startsWith(self.location.origin));
    if (client) return client.focus().then(() => client.navigate(target));
    return self.clients.openWindow(target);
    });
  })());
});

// Agent V service worker: shows pushed notifications and opens what they are about.
self.addEventListener("push", (event) => {
  let message = { title: "Agent V", body: "", link: "/tasks", notificationId: null };
  try {
    message = { ...message, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.notificationId || undefined,
      data: { link: message.link },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/tasks";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: "open", link });
      } else await self.clients.openWindow(link);
    })(),
  );
});

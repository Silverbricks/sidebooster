/* SideBooster push notifications (Firebase Cloud Messaging, Web Push).
   Plain service worker — no Firebase SDK needed here: the server sends data-only messages
   ({ title, body, url }) and this worker displays them. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { data: { body: event.data ? event.data.text() : "" } };
  }
  const data = payload.data || {};
  const n = payload.notification || {};
  const title = data.title || n.title || "SideBooster";
  const options = {
    body: data.body || n.body || "",
    icon: "/apple-icon.png",
    badge: "/apple-icon.png",
    data: { url: data.url || (payload.fcmOptions && payload.fcmOptions.link) || "/account/notifications" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : "/", self.location.origin);
  // only ever open our own site
  const url = target.origin === self.location.origin ? target.href : self.location.origin + "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

/* CinePulse Unified Web Push & OS Notification Service Worker (MovieBox Compact Card Layout) */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function buildCompactMovieBoxNotification(payload) {
  const rawTitle = String(payload?.title || payload?.movieTitle || "CinePulse").trim();
  const rawBody = String(payload?.body || payload?.hook || "").trim();
  const rawPoster = String(payload?.poster || payload?.icon || "./pwa-192x192.png").trim();
  const rawUrl = String(payload?.url || "./").trim();
  const rawTag = String(payload?.tag || "cinepulse-notif-" + Date.now()).trim();

  // Format like MovieBox screenshot:
  // Compact 2-line bold headline on the left, movie poster on the right,
  // monochrome film-play app logo badge at the top-left next to CinePulse.
  let compactTitle = rawTitle;
  let compactBody = rawBody;

  if (rawBody && !rawTitle.includes("—") && !rawTitle.includes(" - ")) {
    const cleanLine = rawBody.split("\n")[0].trim();
    if (cleanLine && (rawTitle.length + cleanLine.length) <= 95) {
      compactTitle = `${rawTitle} — ${cleanLine}`;
      compactBody = "";
    }
  }

  return {
    title: compactTitle,
    options: {
      body: compactBody || "\u200B",
      icon: rawPoster || "./pwa-192x192.png",
      badge: "./notif-badge.png",
      tag: rawTag,
      renotify: true,
      requireInteraction: false,
      silent: false,
      vibrate: [180, 80, 180],
      timestamp: Date.now(),
      data: {
        url: rawUrl,
        movieId: payload?.movieId || "",
      },
    },
  };
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "CinePulse — New Release Streaming Now!",
      body: event.data ? event.data.text() : "",
    };
  }

  const { title, options } = buildCompactMovieBoxNotification(data);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "CINEPULSE_SHOW_OS_NOTIFICATION") {
    const { title, options } = buildCompactMovieBoxNotification(data);
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "./";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          try {
            client.postMessage({
              type: "CINEPULSE_NOTIFICATION_CLICK",
              url: targetUrl,
              movieId: event.notification.data?.movieId || "",
            });
          } catch {}
          if ("navigate" in client && targetUrl && targetUrl !== "./") {
            return client.navigate(targetUrl);
          }
          return client;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

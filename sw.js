/* =============================================================
   sw.js — offline mode (PWA)
   ⚠️ ON EVERY DEPLOYMENT: increase CACHE_VERSION, otherwise devices
   keep the old version in their cache.
   Strategy: app files served from the cache, updated in the
   background when the network is available.
   ============================================================= */
const CACHE_VERSION = "acp-v20";
const FILES = [
    "./", "index.html", "manifest.json", "css/style.css",
    "images/logo.png", "images/icon-192.png", "images/icon-512.png",
    "js/storage-adapter.js", "js/i18n.js", "js/translations.js", "js/utils.js", "js/holidays.js", "js/store.js",
    "js/permissions.js", "js/auth.js", "js/hours.js", "js/segments.js", "js/leave.js", "js/countdown.js",
    "js/explanations.js", "js/xlsx.js", "js/hours-csv.js", "js/xlsx-reader.js", "js/register-import.js", "js/exports.js",
    "js/editor.js", "js/reminders.js", "js/ui.js", "js/page-login.js", "js/page-timesheet.js", "js/page-clock.js",
    "js/page-dashboard.js", "js/page-leave.js", "js/page-clients.js", "js/page-profile.js", "js/page-team.js", "js/page-reports.js",
    "js/page-admin-panels.js", "js/page-settings.js", "js/app.js"
];

self.addEventListener("install", e => {
    e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
    e.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
    if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
    e.respondWith(caches.open(CACHE_VERSION).then(cache =>
        cache.match(e.request, { ignoreSearch: true }).then(cached => {
            const network = fetch(e.request).then(res => {
                if (res && res.ok) cache.put(e.request, res.clone());
                return res;
            }).catch(() => cached || (e.request.mode === "navigate" ? cache.match("index.html") : undefined));
            return cached || network;
        })));
});

self.addEventListener("notificationclick", e => {
    e.notification.close();
    e.waitUntil(self.clients.matchAll({ type: "window" }).then(list =>
        list.length ? list[0].focus() : self.clients.openWindow("index.html")));
});

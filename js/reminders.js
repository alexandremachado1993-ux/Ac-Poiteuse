/* =============================================================
   reminders.js — reminders and automatic actions
   ⚠️ Technical limit: without a push server a web app CANNOT wake
   the phone when it is closed. Reminders are checked on start, when
   coming back to the app, and every minute while it is open. If
   notifications are allowed they are also shown as system
   notifications.

   - long timer      : a timer running for more than X h;
   - break reminder  : X h of counted time with no break/lunch;
   - automatic stop  : at the set time the timer is stopped at that
     exact time and the entry is flagged "to check";
   - forgotten clock : reminder day, time passed, nothing clocked
     today, no holiday and no approved absence;
   - night worker    : ≥ 320 night hours over 12 rolling months
     (metalworking agreement, art. 108).
   Each reminder is shown once (remembered per day).
   ============================================================= */

const Reminders = (() => {
    "use strict";

    const SEEN_KEY = "acp_reminders_seen";
    const H = 3600000;
    let active = [];

    function seen() {
        const today = Utils.isoLocal(new Date());
        try {
            const v = JSON.parse(StorageAdapter.get(SEEN_KEY) || "{}");
            return v.day === today ? v : { day: today, keys: {} };
        } catch (e) {
            return { day: today, keys: {} };
        }
    }

    function markSeen(key) {
        const v = seen();
        v.keys[key] = true;
        StorageAdapter.set(SEEN_KEY, JSON.stringify(v));
    }

    function notify(text) {
        if (!Store.settings().notifications || typeof Notification === "undefined" || Notification.permission !== "granted") return;
        const options = { body: text, icon: "images/icon-192.png", tag: "acp-" + text.length };
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(reg => reg.showNotification(I18n.t("app.title"), options)).catch(() => {});
        } else {
            try { new Notification(I18n.t("app.title"), options); } catch (e) { /* nothing */ }
        }
    }

    /* First "HH:MM" strictly after `after` (ms) */
    function nextTime(after, hhmm) {
        const d = new Date(after);
        const h = hhmm.split(":").map(Number);
        const target = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h[0], h[1]).getTime();
        return target > after ? target : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, h[0], h[1]).getTime();
    }

    /* Continuous counted time up to now (since the last break, lunch or gap > 15 min) */
    function continuousWork(now, settings) {
        const sorted = Store.entries().filter(e => e.start <= now).sort((a, b) => b.start - a.start);
        let total = 0, edge = now;
        for (const e of sorted) {
            const end = e.end == null ? now : e.end;
            if (edge - end > 15 * 60000) break;
            if (!Segments.isCounted(e.category, settings) || e.category === "break") break;
            total += Math.min(end, edge) - e.start;
            edge = e.start;
        }
        return total;
    }

    function check() {
        const now = Date.now();
        const s = Store.settings();
        const running = Store.runningEntry();
        const v = seen();
        const found = [];

        function add(key, text, level) {
            found.push({ key, text, level: level || "info" });
            if (!v.keys[key]) { notify(text); markSeen(key); }
        }

        /* Automatic stop (changes the data) */
        if (running && s.autoStopTime) {
            const limit = nextTime(running.start, s.autoStopTime);
            if (now >= limit) {
                Store.updateEntry(running.id, { end: limit, toCheck: true }, false);
                add("auto-" + running.id, I18n.t("rem.autoStop", { time: s.autoStopTime }), "warn");
                active = found;
                return active;
            }
        }

        if (running && s.longTimerAlertH > 0 && now - running.start > s.longTimerAlertH * H) {
            add("long-" + running.id, I18n.t("rem.longTimer", { duration: Utils.hm(now - running.start) }), "warn");
        }

        if (running && s.breakReminderH > 0 && Segments.isCounted(running.category, s)) {
            const continuous = continuousWork(now, s);
            if (continuous > s.breakReminderH * H) {
                add("break-" + Math.floor(continuous / H), I18n.t("rem.break", { duration: Utils.hm(continuous) }), "info");
            }
        }

        const night12 = Hours.nightLast12Months(now);
        if (night12 >= Hours.NIGHT_YEARLY_H) {
            add("night320-" + new Date(now).getMonth(), I18n.t("rem.nightWorker", { hours: Utils.hours(night12) }), "warn");
        }

        if (s.forgotReminderTime) {
            const today = Utils.isoLocal(now);
            const passed = now >= Utils.timestamp(today, s.forgotReminderTime);
            const clocked = Editor.entriesOfDay(today, now).length > 0;
            const exempt = Holidays.isHoliday(Utils.utcDate(today)) || Store.absencesOn(today).length > 0;
            if (passed && !clocked && !exempt && (s.reminderDays || []).indexOf(new Date(now).getDay()) >= 0) {
                add("forgot-" + today, I18n.t("rem.forgot"), "info");
            }
        }

        active = found;
        return active;
    }

    return { check, current: () => active.slice(), nextTime, continuousWork };
})();

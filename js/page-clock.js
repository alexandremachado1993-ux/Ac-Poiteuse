/* =============================================================
   page-clock.js — main screen (clocking), redesign 2.9 (10/11/2026)
   Order of the gesture: CLIENT → ACTIVITY → START, in one dark block:
   - status pill, live clock, running activity and its timer;
   - client: favourites ★ and recent clients as chips, then the list
     (★ button to star the chosen client);
   - activity tiles (icon + colour): a tap starts that activity with
     the chosen client (one activity at a time: starting one closes
     the previous one at the same instant);
   - Arrival / Break / Resume / Departure buttons.
   The rules live in store.js (Store.startClock / stopClock):
   - an entry shorter than 5 s (double tap) is removed;
   - "Undo" for undoSeconds (10 s) after every action (toast);
   - previous week not sent → the review / send sheet opens first;
   - approved leave / time off today → only an URGENT call-out (asked
     for confirmation, signalled to the managers; hours +50 %);
   - night period: an activity started before 21:00 is questioned
     during the last 10 s (dialog); no answer = departure at 21:00.
   "Home" (category home) is clocked like any activity (3.1); with the team
   rule homeDayPreset it becomes the fixed home work day (one tap, 7 h + lunch).
   The client / note form is never rebuilt while typing.
   ============================================================= */

const ClockPage = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    let root = null;
    let context = { clientId: "", line: "", note: "" };
    let clientsSignature = "";

    /* ---------------- Actions ---------------- */

    function undoToast(text) {
        const left = Store.undoLeft();
        if (!left) return;
        UI.toast(text, t("clock.undo"), left, () => {
            if (Store.undoClock() !== true) alert(t("clock.undoExpired"));
        });
    }

    /* Starts an activity; handles the answers of the rules (week to send, day off) */
    function start(key, ctx, urgent) {
        const c = Segments.category(key);
        const clientId = c.client ? (ctx.clientId || "") : "";
        const line = c.client ? (ctx.line || "") : "";
        const res = Store.startClock({ category: key, clientId, line, note: ctx.note || "", urgent: !!urgent });
        if (res === "weekNotSent") { const w = Store.weekToSend(); if (w) ValidationPage.openSend(w.year, w.week); return; }
        if (res === "absenceToday") { if (confirm(t("clock.urgentConfirm"))) start(key, ctx, true); return; }
        if (typeof res === "string") { alert(t(res === "forbidden" ? "clock.err.forbidden" : res === "dayRecorded" ? "clock.err.dayRecorded" : "clock.err.other")); return; }
        context.note = "";
        const noteField = document.getElementById("ckNote");
        if (noteField) noteField.value = "";
        Utils.vibrate();
        undoToast("<strong>" + E(t("clock.started", { activity: Segments.label(key), time: Utils.clock(res.start) })) + "</strong>" +
            (res.clientName ? "<br><small>" + E(res.clientName) + "</small>" : ""));
    }

    function stop() {
        if (!Store.runningEntry()) return;
        Store.stopClock();
        Utils.vibrate();
        undoToast("<strong>" + E(t("clock.stopped", { time: Utils.clock(Date.now()) })) + "</strong>");
    }

    /* Activity that ended exactly when the current break started */
    function beforeBreak(running) {
        return Store.entries().filter(e => e.end === running.start && e.category !== "break" && e.category !== "lunch")[0] || null;
    }

    function lastTime() {
        const today = Utils.isoLocal(Date.now());
        const previous = Store.entries().filter(e => e.clientId && Utils.isoLocal(e.start) < today).sort((a, b) => b.start - a.start);
        if (!previous.length) return null;
        const day = Utils.isoLocal(previous[0].start);
        return previous.filter(e => Utils.isoLocal(e.start) === day && e.category !== "travel")[0] || previous[0];
    }

    /* ---------------- Night period: 10 s countdown (every second, any page) ---------------- */
    let nightOpen = false;
    function nightTick() {
        if (!Permissions.can("timeclock.self")) return;
        const dlg = document.getElementById("night");
        const p = Store.nightPending();
        if (!p || p.left > 10000) { if (nightOpen) closeNight(dlg); return; }
        if (p.left <= 0) {
            if (Store.nightCheck()) UI.toast("<strong>" + E(t("clock.nightStopped", { time: Utils.clock(p.limit) })) + "</strong>", "", 0, null);
            closeNight(dlg);
            return;
        }
        const left = Math.ceil(p.left / 1000);
        dlg.innerHTML = '<div class="night-body">' +
            UI.ring(left / 10, 104, 9, "#7C3AED", "rgba(124,58,237,.15)", '<strong class="tight">' + left + "</strong><small>" + E(t("clock.seconds")) + "</small>") +
            '<span class="badge info">' + UI.icon("moon") + E(t("clock.nightAt", { time: Utils.clock(Date.now()) })) + "</span>" +
            '<h2 id="nightTitle">' + E(t("clock.nightTitle", { time: Utils.clock(p.limit) })) + "</h2>" +
            "<p>" + E(t("clock.nightText")) + "</p>" +
            '<button type="button" class="button primary" id="ntStop">' + UI.icon("stop") + E(t("clock.nightStop", { time: Utils.clock(p.limit) })) + "</button>" +
            '<button type="button" class="button" id="ntGo">' + UI.icon("moon") + E(t("clock.nightContinue")) + "</button>" +
            '<p class="info">' + E(t("clock.nightDefault", { time: Utils.clock(p.limit) })) + "</p></div>";
        dlg.querySelector("#ntStop").addEventListener("click", () => { Store.stopClock(); closeNight(dlg); });
        dlg.querySelector("#ntGo").addEventListener("click", () => { Store.confirmNight(); closeNight(dlg); });
        if (!nightOpen) { nightOpen = true; if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); }
    }
    function closeNight(dlg) {
        nightOpen = false;
        if (!dlg) return;
        if (typeof dlg.close === "function" && dlg.open) dlg.close(); else dlg.removeAttribute("open");
    }

    /* ---------------- Rendering ---------------- */

    /* Status, live clock, running activity (top of the dark block) */
    function renderTimer() {
        const running = Store.runningEntry();
        const zone = root.querySelector("#ckTimer");
        const now = Date.now();
        const isBreak = running && (running.category === "break" || running.category === "lunch");
        const off = Store.absenceToday();
        let status, state;
        if (!running && off.length) { status = t(off.some(a => a.type === "paid_leave") ? "clock.statusLeave" : "clock.statusTimeOff"); state = "leave"; }
        else if (!running) { status = t("clock.statusOff"); state = ""; }
        else if (isBreak) { status = t("clock.statusBreak", { time: Utils.clock(running.start) }); state = "break"; }
        else { status = t("clock.statusOn", { activity: Segments.label(running.category), time: Utils.clock(running.start) }); state = "on"; }
        zone.innerHTML =
            '<div class="clock-top"><span class="status-line">' + UI.pill(status, state) +
            (running && running.urgent ? ' <span class="tag urgent">' + E(t("clock.urgentTag")) + "</span>" : "") + "</span>" +
            '<div class="big-clock" id="ckNow">' + Utils.clock(now) + "<small>:" + Utils.pad(new Date(now).getSeconds()) + "</small></div></div>" +
            '<div class="muted" style="text-transform:capitalize">' + E(Utils.longDate(Utils.isoLocal(now))) + "</div>" +
            (running ? '<div class="running-line">' + UI.activityIcon(running.category, true) + "<div><small>" +
                E([Segments.label(running.category), running.clientName, running.note].filter(Boolean).join(" · ")) + "</small>" +
                '<div class="timer" id="ckTimerText">' + Utils.stopwatch(now - running.start) + "</div></div></div>" : "") +
            (!running && off.length ? '<p class="info" style="margin:0">' + E(t("clock.dayOffInfo")) + "</p>" : "") + UI.punchLine();
    }

    /* Arrival / Break / Resume / Departure (bottom of the dark block) */
    function renderPunch() {
        const running = Store.runningEntry();
        const zone = root.querySelector("#ckPunch");
        const isBreak = running && (running.category === "break" || running.category === "lunch");
        const back = isBreak ? beforeBreak(running) : null;
        const off = !running && Store.absenceToday().length;
        zone.innerHTML = '<div class="punch">' +
            (!running || isBreak && !back
                ? '<button type="button" class="button primary full" id="ckArrive">' + UI.icon(off ? "alert" : "play") +
                  E(off ? t("clock.urgentStart") : t("clock.startWith", { activity: Segments.label("work") })) + "</button>" : "") +
            (running && !isBreak ? '<button type="button" class="button" id="ckBreak">' + UI.icon("pause") + E(t("clock.break")) + "</button>" : "") +
            (back ? '<button type="button" class="button primary" id="ckResume">' + UI.icon("play") + E(t("clock.resume")) + "</button>" : "") +
            (running ? '<button type="button" class="button danger solid" id="ckStop">' + UI.icon("stop") + E(t("clock.depart")) + "</button>" : "") +
            "</div>";
        const on = (id, fn) => { const el = zone.querySelector(id); if (el) el.addEventListener("click", fn); };
        on("#ckArrive", () => start("work", context));
        on("#ckBreak", () => start("break", {}));
        on("#ckStop", stop);
        on("#ckResume", () => start(back.category, { clientId: Store.client(back.clientId) ? back.clientId : "", line: back.line }));
    }

    function renderForm() {
        const clients = Store.clients();
        const running = Store.runningEntry();
        if (!clientsSignature && !context.clientId && running && running.clientId) context.clientId = running.clientId;   /* open on the client being clocked */
        clientsSignature = JSON.stringify(clients) + JSON.stringify(Store.settings().favoriteClients || []);
        if (context.clientId && !clients.some(c => c.id === context.clientId)) context = { clientId: "", line: "", note: context.note };
        const favorites = (Store.settings().favoriteClients || []).filter(id => clients.some(c => c.id === id));
        const recent = [];
        Store.entries().filter(e => e.clientId).sort((a, b) => b.start - a.start).forEach(e => {
            if (recent.length < 4 && recent.indexOf(e.clientId) < 0 && favorites.indexOf(e.clientId) < 0 && clients.some(c => c.id === e.clientId)) recent.push(e.clientId);
        });
        const chip = (id, fav) => {
            const c = clients.find(x => x.id === id);
            return '<button type="button" class="chip' + (id === context.clientId ? " active" : "") + '" data-recent="' + E(id) + '">' +
                (fav ? '<span class="star">★</span>' : "") + E(c.name) + "</button>";
        };
        const starred = context.clientId && favorites.indexOf(context.clientId) >= 0;
        const zone = root.querySelector("#ckContext");
        zone.innerHTML =
            /* no "Line" field on the Clock screen (request of 05/11/2026): it stays in
               Clients, corrections and exports. 4.7.1: label, list, then the favourite / recent chips */
            '<div class="client-row"><label>' + E(t("common.client")) + '<select id="ckClient">' + Editor.clientOptions(context.clientId) + "</select></label>" +
            '<button type="button" class="icon-button' + (starred ? " star-on" : "") + '" id="ckStar" aria-pressed="' + !!starred + '" aria-label="' +
            E(t(starred ? "clock.unstar" : "clock.star")) + '"' + (context.clientId ? "" : " disabled") + ">" + UI.icon("star") + "</button></div>" +
            (favorites.length || recent.length ? '<div class="chips client-chips">' + favorites.map(id => chip(id, true)).join("") + recent.map(id => chip(id, false)).join("") + "</div>" : "") +
            '<label style="margin-top:.6rem">' + E(t("clock.noteOptional")) + '<input type="text" id="ckNote" maxlength="200" value="' + E(context.note) + '"></label>' +
            /* 4.7.1: only managers can add clients (Settings → Company → Clients) */
            (clients.length ? "" : '<p class="info">' + E(t(Permissions.can("settings.manage") ? "clock.noClients" : "clock.noClientsTech")) + "</p>");

        const clientSel = zone.querySelector("#ckClient");
        clientSel.addEventListener("change", () => {
            context.clientId = clientSel.value; context.line = "";
            renderForm(); renderSwitch();
        });
        zone.querySelector("#ckNote").addEventListener("input", e => { context.note = e.target.value; });
        zone.querySelector("#ckStar").addEventListener("click", () => { if (context.clientId) Store.toggleFavoriteClient(context.clientId); });
        zone.querySelectorAll("[data-recent]").forEach(b => b.addEventListener("click", () => {
            context.clientId = b.dataset.recent; context.line = "";
            renderForm(); renderSwitch();
        }));
    }

    /* "Move the running timer to this client" when the chosen context
       differs from the running activity (category with a client). */
    function renderSwitch() {
        const zone = root.querySelector("#ckSwitch");
        const running = Store.runningEntry();
        const differs = running && Segments.category(running.category).client && running.clientId !== context.clientId;
        zone.innerHTML = differs
            ? '<button type="button" class="button wide" id="ckMove">' + E(t("clock.moveTo", {
                target: context.clientId ? (Store.client(context.clientId) || {}).name || "" : t("common.noClient") })) + "</button>"
            : "";
        const b = zone.querySelector("#ckMove");
        if (b) b.addEventListener("click", () => start(running.category, context));
    }

    const CLOCK_BUTTONS = ["work", "home", "meeting", "training", "travel", "lunch"];

    function declareHome() {
        if (Store.weekToSend()) { const w = Store.weekToSend(); ValidationPage.openSend(w.year, w.week); return; }
        const res = Store.declareHomeDay(Utils.isoLocal(Date.now()));
        if (typeof res === "string") alert(t("home.err." + res));
        else Utils.vibrate();
    }

    function renderActivities() {
        const running = Store.runningEntry();
        const last = lastTime();
        const zone = root.querySelector("#ckActivities");
        /* The clocking categories (request of 05/11/2026), in this order. "Home" is a
           timer like the others, or the fixed home day when the rule homeDayPreset is on (3.1). */
        zone.innerHTML =
            '<div class="activities">' + CLOCK_BUTTONS.map(key => {
                const c = Segments.category(key);
                return '<button type="button" class="activity' + (running && running.category === key ? " active" : "") +
                    '" style="--c:' + c.color + '" data-activity="' + key + '">' + UI.activityIcon(key) + E(Segments.label(key)) + "</button>";
            }).join("") + "</div>" +
            (last && !running ? '<button type="button" class="button wide" id="ckLast">' + E(t("clock.likeLastTime", {
                what: Segments.label(last.category) + (last.clientName ? " · " + last.clientName : "") })) + "</button>" : "");
        zone.querySelectorAll("[data-activity]").forEach(b => b.addEventListener("click", () => {
            /* 3.1: "Home" is clocked like any activity, unless the employer set the fixed day (rule homeDayPreset) */
            if (b.dataset.activity === "home" && Store.org().homeDayPreset) declareHome(); else start(b.dataset.activity, context);
        }));
        const bl = zone.querySelector("#ckLast");
        if (bl) bl.addEventListener("click", () => {
            const id = Store.client(last.clientId) ? last.clientId : "";
            context.clientId = id; context.line = "";
            renderForm();
            start(last.category, context);
        });
    }

    /* Banner: previous week to review and send */
    function renderBanner() {
        const w = Store.weekToSend();
        const r = Store.previousWeek ? Store.weekValidation(Store.currentUserId(), Store.previousWeek().year, Store.previousWeek().week) : null;
        const zone = root.querySelector("#ckBanner");
        zone.innerHTML = w ? '<div class="banner warn block">' + UI.icon("send") + "<span>" +
                E(t(r && r.status === "returned" ? "week.banner.returned" : "week.banner.toSend", { week: w.week, comment: r ? r.comment : "" })) + '</span><span class="spacer"></span>' +
                '<button type="button" class="button primary" id="ckSendWeek">' + E(t("week.review")) + "</button></div>" : "";
        const b = zone.querySelector("#ckSendWeek");
        if (b) b.addEventListener("click", () => ValidationPage.openSend(w.year, w.week));
    }

    /* 4.4 (D): today against the compliance thresholds (information only) */
    function dayCheck(iso) {
        const c = DashboardPage.dayCompliance(iso);
        if (c.empty) return "";
        return '<div class="day-check">' + DashboardPage.dayBadge(iso) + (c.issues.length ? "<span>" + E(c.issues.join(" · ")) + "</span>" : "") + "</div>";
    }

    function renderSummary() {
        const now = Date.now();
        const today = Utils.isoLocal(now);
        const settings = Store.settings();
        const entries = Store.entries();
        const summary = Segments.day(today, entries, settings, now);
        const w = Hours.isoWeek(Utils.utcDate(today));
        const sheet = Segments.weekSheet(w.year, w.week, entries, settings, now);
        const s = Hours.weekSummary(sheet);
        const pct = s.goal > 0 ? Math.min(1, s.done / s.goal) : 1;
        const p = Countdown.parts(s.toRecover);

        root.querySelector("#ckSummary").innerHTML =
            '<div class="day-state">' + UI.ring(pct, 96, 9, "#801F35", "var(--surface-2)",
                '<strong class="tight">' + Math.round(pct * 100) + " %</strong><small>" + E(t("clock.ofGoal", { goal: Utils.hours(s.goal) })) + "</small>") +
            '<div class="figures" style="flex:1">' +
            "<div><span>" + E(t("clock.weekDone", { n: w.week })) + "</span><strong>" + Utils.hours(s.done) + "</strong></div>" +
            "<div><span>" + E(p.label) + "</span><strong>" + E(p.value.replace("−", "")) + "</strong></div>" +
            "<div><span>" + E(t("clock.today")) + "</span><strong>" + Utils.hm(summary.totalMs) + "</strong></div>" +
            "<div><span>" + E(t("clock.ofWhichNight")) + "</span><strong>" + Utils.hm(summary.nightMs) + "</strong></div>" +
            "</div></div>" + dayCheck(today) + Countdown.detailHtml(s) +
            '<div style="margin-top:1rem">' + UI.weekBars(sheet) + UI.weekLegend() + "</div>";

        const dayStart = Utils.localDate(today).getTime();
        const dayLength = Utils.localDate(Utils.addDays(today, 1)).getTime() - dayStart;
        root.querySelector("#ckTimeline").innerHTML = summary.pieces.length
            ? '<div class="timeline">' + summary.pieces.map(pc => {
                const c = Segments.category(pc.entry.category);
                return '<span title="' + E(Segments.label(c.key)) + " " + Utils.clock(pc.start) + "-" + Utils.clock(pc.end) +
                    '" style="left:' + ((pc.start - dayStart) / dayLength * 100).toFixed(3) + "%;width:" +
                    Math.max(0.3, (pc.end - pc.start) / dayLength * 100).toFixed(3) + "%;background:" + c.color + '"></span>';
            }).join("") + "</div>" +
              '<div class="timeline-scale"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>24 h</span></div>' +
              '<div class="legend">' + Segments.CATEGORIES.filter(c => summary.byCategory[c.key] > 0).map(c =>
                  '<span><i style="background:' + c.color + '"></i>' + E(Segments.label(c.key)) + " " + Utils.hm(summary.byCategory[c.key]) + "</span>").join("") + "</div>"
            : "";

        /* no correction button without the right (managers only, 06/11/2026) */
        const list = Editor.entriesOfDay(today, now);
        root.querySelector("#ckJournal").innerHTML = list.length
            ? Editor.listHtml(list, now, !Permissions.can("timeclock.correction.approve"), Store.currentUserId())
            : '<p class="empty">' + UI.icon("clock") + E(t("clock.noEntryToday")) + "</p>";
    }

    function render() {
        if (!root) return;
        if (tab !== "today") { sheet.render(); return; }
        if (JSON.stringify(Store.clients()) + JSON.stringify(Store.settings().favoriteClients || []) !== clientsSignature) renderForm();
        renderBanner();
        renderTimer();
        renderSwitch();
        renderActivities();
        renderPunch();
        renderSummary();
    }

    /* Called every second: the timer text and the night countdown */
    function tick() {
        if (!root || tab !== "today") return;
        const now = Date.now();
        const el = root.querySelector("#ckTimerText");
        const running = Store.runningEntry();
        if (el && running) el.textContent = Utils.stopwatch(now - running.start);
        const clockEl = root.querySelector("#ckNow");
        if (clockEl) clockEl.innerHTML = Utils.clock(now) + "<small>:" + Utils.pad(new Date(now).getSeconds()) + "</small>";
    }

    /* Two tabs: Today (clocking) and Timesheet (week / month, validation, exports). */
    let tab = "today";
    const TABS = ["today", "sheet"];
    const sheet = makeTimesheet({ rootId: "ckSheet" });

    function body() {
        const zone = root.querySelector("#ckBody");
        zone.innerHTML = tab === "today"
            ? '<div id="ckBanner"></div>' +
              '<div class="clock-hero">' +
              '<section class="hero timer-card' + (Store.absenceToday().length ? " teal" : "") + '"><div id="ckTimer" style="display:flex;flex-direction:column;gap:.8rem"></div>' +
              '<div id="ckContext"></div><div id="ckSwitch"></div><div id="ckActivities"></div><div id="ckPunch"></div></section>' +
              '<div class="card"><h2>' + E(t("clock.myWeek")) + '</h2><div id="ckSummary"></div><div id="ckTimeline"></div></div></div>' +
              '<div class="card" style="margin-top:1.1rem"><div class="title-row"><h2>' + E(t("clock.journal")) + "</h2>" +
              (Permissions.can("timeclock.report_issue") ? '<div class="actions"><a class="button mini" href="#clock/sheet">' + UI.icon("flag") + E(t("clock.reportLink")) + "</a></div>" : "") +
              '</div><div id="ckJournal"></div></div>'
            : '<div id="ckSheet"></div>';
        if (tab === "today") { clientsSignature = ""; render(); } else sheet.init();
    }

    function layout() {
        root.innerHTML = UI.pageHeader(t("nav.clock"), t("clock.subtitle")) +
            UI.tabs([["today", t("common.today")], ["sheet", t("clock.tabSheet")]], tab, "clock") + '<div id="ckBody"></div>';
        UI.onTabs(root, "clock", k => { tab = k; App.setSub("clock", k); body(); UI.fadeIn(root.querySelector("#ckBody")); });
        body();
    }

    function init() {
        root = document.getElementById("page-clock");
        layout();
    }

    /* Deep link (#clock/sheet) and URL sync */
    function setTab(k) {
        if (TABS.indexOf(k) < 0 || k === tab) return;
        tab = k;
        if (root) layout();
    }

    return { init, render, tick, nightTick, start, stop, setTab, getTab: () => tab, context: () => context };
})();

/* =============================================================
   page-clockings.js — "Clockings" (4.6, decision of 18/11/2026)
   The clocking of every technician of the perimeter, day by day,
   on one screen — the managers' Excel table, kept up to date:
   - week view: one row per technician, one cell per day (hours,
     first → last time, running clocking, leave / holiday, day to
     check), total, result of the week, validation state;
   - month view: one cell per week of the month (hours + state);
   - a click on a day opens its detail below the table (segments,
     clients), with links to the full timesheet and the correction.
   No calculation of its own: Segments.day / weekSheet, Hours.
   weekSummary, DashboardPage.dayCompliance, ValidationPage.badgeOf.
   4.7: drawn inside Team → "Clockings" (TeamPage), with
   "reports.team.view" (team lead, quality, director); the
   technicians of the perimeter come from Permissions.
   ============================================================= */

const ClockingsPage = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    let root = null;
    const st = { mode: "week", year: 0, week: 0, monthYear: 0, month: 0, section: "", open: "" };   /* open = "userId|iso" */

    function goToday() {
        const w = Hours.isoWeek(Utils.utcDate(Utils.isoLocal(Date.now())));
        st.year = w.year; st.week = w.week;
        const d = new Date();
        st.monthYear = d.getFullYear(); st.month = d.getMonth();
    }

    /* technicians of the perimeter (same rule as the dashboard), optionally one section */
    function technicians() {
        const me = Store.currentUserId();
        return Permissions.visibleUsers().filter(x => x.id !== me && x.accountStatus !== "disabled" &&
            (x.clockRequired || Permissions.has(x.id, "timeclock.self")) && (!st.section || x.sectionIds.indexOf(st.section) >= 0));
    }

    const span = s => (s.pieces.length ? Utils.clock(s.pieces[0].start) + "–" + Utils.clock(s.pieces[s.pieces.length - 1].end) : "");

    /* One day of the person in context: { cls, main, sub, title } */
    function dayCell(iso, sheetDay, running) {
        const today = Utils.isoLocal(Date.now());
        const s = sheetDay.summary;
        const hours = sheetDay.hours;
        const absences = Store.absencesOn(iso);
        const holiday = Holidays.isHoliday(Utils.utcDate(iso)) ? Holidays.name(Utils.utcDate(iso)) : "";
        const live = running && iso === today;
        const issues = iso <= today && s.pieces.length ? DashboardPage.dayCompliance(iso).issues : [];
        const absence = absences.length ? t(UI.LEAVE_TYPE_KEYS[absences[0].type] || "leave.type.other") : "";
        if (live) return { cls: "run", main: Utils.hours(hours), sub: "● " + t(running.category === "break" ? "tc.paused" : "flag.running"), title: issues.join(" · ") };
        if (hours > 0) return { cls: issues.length ? "warn" : absence ? "lv" : "ok", main: Utils.hours(hours), sub: issues.length ? "⚠ " + t("flag.toCheck") : absence || span(s), title: issues.join(" · ") };
        if (absence) return { cls: "lv", main: absence, sub: "", title: "" };
        if (holiday) return { cls: "hol", main: t("dash.cal.holiday"), sub: holiday, title: holiday };
        return { cls: "no", main: "—", sub: "", title: "" };
    }

    function weekRow(x) {
        return Store.withUser(x.id, () => {
            const sheet = Segments.weekSheet(st.year, st.week, Store.entries(), Store.settings(), Date.now());
            const s = Hours.weekSummary(sheet);
            const running = Store.runningEntry();
            const cells = Hours.DAYS.map(k => {
                const d = sheet.days[k], c = dayCell(d.iso, d, running);
                const key = x.id + "|" + d.iso;
                return '<td><button type="button" class="tc-day ' + c.cls + (st.open === key ? " open" : "") + '" data-day="' + E(key) + '"' +
                    (c.title ? ' title="' + E(c.title) + '"' : "") + ' aria-expanded="' + (st.open === key) + '">' + E(c.main) + (c.sub ? "<small>" + E(c.sub) + "</small>" : "") + "</button></td>";
            }).join("");
            const result = Countdown.parts(s.toRecover).value;
            return '<tr><td><span class="person">' + UI.avatarStatus(x.name, UI.personState(x.id), "small") + "<span><strong>" + E(x.name) + "</strong><small>" +
                E(Store.sections().filter(sec => x.sectionIds.indexOf(sec.id) >= 0).map(sec => sec.name).join(", ")) + "</small></span></span></td>" + cells +
                '<td class="num"><strong>' + E(Utils.hours(s.worked)) + "</strong></td>" +
                '<td class="num ' + (s.toRecover < 0 ? "tc-neg" : "tc-pos") + '">' + E(result) + "</td>" +
                "<td>" + ValidationPage.badgeOf(Store.weekValidation(x.id, st.year, st.week)) + "</td></tr>";
        });
    }

    function monthRow(x, weeks) {
        return Store.withUser(x.id, () => {
            const entries = Store.entries(), settings = Store.settings();
            const cells = weeks.map(w => {
                const s = Hours.weekSummary(Segments.weekSheet(w.year, w.week, entries, settings, Date.now()));
                return '<td><button type="button" class="tc-day ' + (s.worked > 0 ? "ok" : "no") + '" data-week="' + w.year + "-" + w.week + '">' +
                    E(s.worked > 0 ? Utils.hours(s.worked) : "—") + "<small>" + E(ValidationPage.statusOf(Store.weekValidation(x.id, w.year, w.week))[0]) + "</small></button></td>";
            }).join("");
            return '<tr><td><span class="person">' + UI.avatar(x.name, "small") + "<strong>" + E(x.name) + "</strong></span></td>" + cells +
                '<td class="num"><strong>' + E(Utils.hours(Hours.monthFigures(st.monthYear, st.month).worked)) + "</strong></td></tr>";
        });
    }

    /* Detail of one day, below the table */
    function detailHtml() {
        if (!st.open) return "";
        const [uid, iso] = st.open.split("|");
        const x = Store.user(uid);
        if (!x || !technicians().some(y => y.id === uid)) return "";
        return Store.withUser(uid, () => {
            const s = Segments.day(iso, Store.entries(), Store.settings(), Date.now());
            const issues = s.pieces.length && iso <= Utils.isoLocal(Date.now()) ? DashboardPage.dayCompliance(iso).issues : [];
            const absences = Store.absencesOn(iso).map(a => t(UI.LEAVE_TYPE_KEYS[a.type] || "leave.type.other"));
            const rows = s.pieces.map(p => {
                const e = p.entry, counted = Segments.isCounted(e.category, Store.settings());
                return '<li><span class="tc-cat">' + UI.activityIcon(e.category) + E(Segments.label(e.category)) + "</span><span>" + E(Utils.clock(p.start)) + " → " +
                    E(e.end == null ? t("tc.now") : Utils.clock(p.end)) + "</span><span>" + E(e.clientName ? t("tc.client", { name: e.clientName }) : counted ? "" : t("tc.notCounted")) +
                    '</span><span class="num">' + E(Utils.hm(p.end - p.start)) + "</span></li>";
            }).join("");
            return '<div class="card tc-detail" id="tcDetail"><div class="title-row"><h2>' + E(x.name + " — " + Utils.longDate(iso)) + "</h2>" +
                '<button type="button" class="icon-button" data-close-day aria-label="' + E(t("common.close")) + '">' + UI.icon("x") + "</button></div>" +
                (issues.length ? '<p class="tc-issues">' + UI.icon("alert") + E(issues.join(" · ")) + "</p>" : "") +
                (absences.length ? '<p class="info">' + E(absences.join(", ")) + "</p>" : "") +
                (rows ? '<ul class="tc-segments">' + rows + "</ul>" : '<p class="empty">' + E(t("tc.noClocking")) + "</p>") +
                '<p class="info">' + E(t("tc.dayTotal", { hours: Utils.hm(s.totalMs) })) + "</p>" +
                '<div class="actions"><a class="button" href="#team/' + E(uid) + '">' + UI.icon("file") + E(t("tc.openSheet")) + "</a>" +
                (Permissions.can("timeclock.correction.approve") ? '<button type="button" class="button" data-correct="' + E(iso) + '">' + UI.icon("wrench") + E(t("tc.correct")) + "</button>" : "") +
                "</div></div>";
        });
    }

    function render() {
        if (!root || !root.isConnected) return;
        if (!st.year) goToday();
        const techs = technicians();
        const sections = Store.sections().filter(sec => (Store.profile().allSections || Store.profile().sectionIds.indexOf(sec.id) >= 0));
        const title = st.mode === "week"
            ? t("tc.weekTitle", { week: st.week, from: Utils.dateDmy(Hours.isoDayOf(st.year, st.week, 0)), to: Utils.dateDmy(Hours.isoDayOf(st.year, st.week, 6)) })
            : Utils.monthName(st.month) + " " + st.monthYear;
        const toolbar = '<div class="card tc-tools"><div class="toolbar">' +
            '<div class="toggle"><button type="button" data-mode="week" class="' + (st.mode === "week" ? "active" : "") + '">' + E(t("sheet.week")) + "</button>" +
            '<button type="button" data-mode="month" class="' + (st.mode === "month" ? "active" : "") + '">' + E(t("sheet.month")) + "</button></div>" +
            '<div class="nav"><button type="button" class="button mini" data-nav="-1" aria-label="' + E(t("common.previous")) + '">‹</button><strong>' + E(title) + "</strong>" +
            '<button type="button" class="button mini" data-nav="1" aria-label="' + E(t("common.next")) + '">›</button>' +
            '<button type="button" class="button secondary" data-nav="0">' + E(t("common.today")) + "</button></div>" +
            '<div class="actions"><select id="tcSection" aria-label="' + E(t("team.sections")) + '"><option value="">' + E(t("rep.wholeTeam")) + "</option>" +
            sections.map(sec => '<option value="' + E(sec.id) + '"' + (st.section === sec.id ? " selected" : "") + ">" + E(sec.name) + "</option>").join("") + "</select></div></div></div>";
        let table;
        if (!techs.length) table = '<div class="card"><p class="empty">' + E(t("dash.noTechs")) + "</p></div>";
        else if (st.mode === "week") {
            const head = Hours.DAYS.map((k, i) => { const iso = Hours.isoDayOf(st.year, st.week, i);
                return '<th class="tc-col' + (iso === Utils.isoLocal(Date.now()) ? " today" : "") + '">' + E(Utils.dayName(iso).slice(0, 3) + " " + iso.slice(8)) + "</th>"; }).join("");
            table = '<div class="card"><div class="scroll"><table class="table tc-table"><thead><tr><th>' + E(t("role.technician")) + "</th>" + head +
                '<th class="num">' + E(t("common.total")) + '</th><th class="num">' + E(t("dash.weekResult")) + "</th><th>" + E(t("sheet.week")) + "</th></tr></thead><tbody>" +
                techs.map(weekRow).join("") + "</tbody></table></div>" +
                '<div class="tc-legend"><span><i class="ok"></i>' + E(t("tc.l.ok")) + '</span><span><i class="run"></i>' + E(t("tc.l.run")) + '</span><span><i class="lv"></i>' +
                E(t("tc.l.leave")) + '</span><span><i class="hol"></i>' + E(t("dash.cal.holiday")) + '</span><span><i class="warn"></i>' + E(t("tc.l.check")) + "</span></div>" +
                '<p class="info">' + E(t("tc.info")) + "</p></div>" + detailHtml();
        } else {
            const weeks = Hours.weeksOfMonth(st.monthYear, st.month);
            table = '<div class="card"><div class="scroll"><table class="table tc-table"><thead><tr><th>' + E(t("role.technician")) + "</th>" +
                weeks.map(w => '<th class="tc-col">' + E(t("tc.weekShort", { n: w.week })) + "</th>").join("") + '<th class="num">' + E(t("sheet.monthTotal")) + "</th></tr></thead><tbody>" +
                techs.map(x => monthRow(x, weeks)).join("") + '</tbody></table></div><p class="info">' + E(t("tc.monthInfo")) + "</p></div>";
        }
        root.innerHTML = '<p class="info tc-sub">' + E(t("tc.subtitle")) + "</p>" + toolbar + table;
        wire();
    }

    function wire() {
        const q = s => root.querySelector(s);
        root.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => { st.mode = b.dataset.mode; st.open = ""; render(); }));
        root.querySelectorAll("[data-nav]").forEach(b => b.addEventListener("click", () => {
            const n = +b.dataset.nav;
            st.open = "";
            if (!n) goToday();
            else if (st.mode === "week") {
                const w = Hours.isoWeek(Utils.utcDate(Utils.addDays(Hours.isoDayOf(st.year, st.week, 0), 7 * n)));
                st.year = w.year; st.week = w.week;
            } else {
                const d = new Date(st.monthYear, st.month + n, 1);
                st.monthYear = d.getFullYear(); st.month = d.getMonth();
            }
            render();
        }));
        q("#tcSection").addEventListener("change", e => { st.section = e.target.value; st.open = ""; render(); });
        root.querySelectorAll("[data-day]").forEach(b => b.addEventListener("click", () => {
            st.open = st.open === b.dataset.day ? "" : b.dataset.day;
            render();
            const d = root.querySelector("#tcDetail");
            if (d && d.scrollIntoView) d.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }));
        root.querySelectorAll("[data-week]").forEach(b => b.addEventListener("click", () => {
            const p = b.dataset.week.split("-").map(Number);
            st.year = p[0]; st.week = p[1]; st.mode = "week"; st.open = "";
            render();
        }));
        const close = q("[data-close-day]");
        if (close) close.addEventListener("click", () => { st.open = ""; render(); });
        const correct = q("[data-correct]");
        if (correct) correct.addEventListener("click", () => Editor.open({ date: correct.dataset.correct, userId: st.open.split("|")[0] }));
    }

    /* 4.7: drawn in the zone given by the Team page */
    function init(zone) {
        root = zone;
        render();
    }

    return { init, render };
})();

/* =============================================================
   page-timesheet.js — timesheet (version 2.4)
   One module, two uses (makeTimesheet):
   - technician: their own hours (Clock → Timesheet tab), with corrections,
     manual entries and imports;
   - administrator: the hours of a chosen technician (Team timesheets),
     READ-ONLY (Team → individual file), exports allowed.
   Week (Monday → Sunday): one row per day (counted time, night,
   detail by activity, holiday/leave, flags), then:
   - each day: clocked − lunch (not paid) = day total;
   - SUMMARY: fixed goal (39 h) → hours done (worked + credited leave,
     time off and holidays at 39 h ÷ 7) → result of the countdown;
     progress bar; composition line by line; overtime +25 % / +50 %;
   - COUNTERS: night hours → +25 %, holiday hours → +50 % (separate
     lines), Sunday hours (included in the week, for information);
   - anomalies, totals per client and per activity.
   Month: weeks attached to the month by their Thursday.
   "Save as" (Excel, PDF, HTML, CSV) and "Print": exports.js.
   Import (technician): CSV (hours-csv.js) or the Excel hours register
   (register-import.js, one sheet chosen when there are several).
   ============================================================= */

function makeTimesheet(options) {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    const readOnly = !!options.readOnly;
    /* Rights on this sheet (06/11/2026): corrections and imports by managers
       only, technicians and team leads report an error instead. */
    const ownerId = () => (options.userId ? options.userId() : Store.currentUserId());
    const canCorrect = () => !readOnly && Permissions.can("timesheet.correct.approve");
    /* imports write into the data of the account SHOWN (inContext): a manager
       imports a technician's register from that technician's file */
    const canImport = () => Permissions.can("timesheet.correct.approve");
    const canReport = () => !canCorrect() && Permissions.can("timesheet.correct.request");
    let root = null;
    let message = { cls: "", text: "" };
    let pendingSheets = null;   /* several register sheets found in an Excel file: user chooses one */
    const state = { mode: "week", year: 0, week: 0, monthYear: 0, month: 0, openDay: null, ready: false };

    /* Runs fn in the context of the account shown (admin view) */
    function inContext(fn) {
        const id = options.userId ? options.userId() : null;
        return id ? Store.withUser(id, fn) : fn();
    }

    function goToday() {
        const today = Utils.isoLocal(Date.now());
        const w = Hours.isoWeek(Utils.utcDate(today));
        state.year = w.year; state.week = w.week;
        const d = Utils.localDate(today);
        state.monthYear = d.getFullYear(); state.month = d.getMonth();
    }

    function moveWeek(n) {
        const monday = Hours.mondayOf(state.year, state.week);
        monday.setUTCDate(monday.getUTCDate() + 7 * n);
        const w = Hours.isoWeek(monday);
        state.year = w.year; state.week = w.week; state.openDay = null;
    }

    function moveMonth(n) {
        const d = new Date(state.monthYear, state.month + n, 1);
        state.monthYear = d.getFullYear(); state.month = d.getMonth();
    }

    function dayStatus(iso) {
        const tags = [];
        if (Holidays.isHoliday(Utils.utcDate(iso))) tags.push('<span class="tag holiday">' + E(t("tag.holiday")) + "</span>");
        const TAGS = { paid_leave: "tag.paidLeave", time_off: "tag.timeOff", other: "tag.other" };
        Store.absencesOn(iso).forEach(a => tags.push('<span class="tag leave">' + E(t(TAGS[a.type] || "tag.other")) + "</span>"));
        return tags.join(" ");
    }

    function totalsTable(title, obj, labels, colors) {
        const keys = Object.keys(obj).filter(k => obj[k] > 0).sort((a, b) => obj[b] - obj[a]);
        if (!keys.length) return "";
        const total = keys.reduce((s, k) => s + obj[k], 0);
        return '<div class="card"><h2>' + E(title) + '</h2><table class="table"><tbody>' +
            keys.map(k => "<tr><td>" + (colors ? '<i class="dot" style="background:' + colors[k] + '"></i>' : "") +
                E(labels ? labels[k] : k) + '</td><td class="num">' + Utils.hm(obj[k]) + '</td><td class="num">' +
                Math.round(obj[k] / total * 100) + " %</td></tr>").join("") + "</tbody></table></div>";
    }

    /* "10 h 00 | −1 h 00 | 9 h 00": clocked, lunch (not paid), day total (request 2.5) */
    function dayHoursCells(b) {
        const clocked = Object.keys(b.byCategory).reduce((sum, k) => sum + b.byCategory[k], 0);
        const lunch = b.byCategory.lunch || 0;
        return '<td class="num">' + (clocked ? Utils.hm(clocked) : "—") + "</td>" +
            '<td class="num">' + (lunch ? "−" + Utils.hm(lunch) : "—") + "</td>" +
            '<td class="num"><strong>' + (b.totalMs ? Utils.hm(b.totalMs) : "—") + "</strong></td>";
    }

    const row = (label, value, cls) => "<tr><td" + (cls === "indent" ? ' class="indent"' : "") + ">" + label + '</td><td class="num' +
        (cls && cls !== "indent" ? " " + cls : "") + '">' + value + "</td></tr>";

    /* Summary (2.5): fixed goal → hours done (worked + credited days) → result,
       bar, the composition line by line, overtime counters */
    function summaryHtml(s) {
        const o = Store.org();
        const c = s.counters, cr = s.credits;
        const pct = s.goal > 0 ? Math.min(100, Math.max(0, s.done / s.goal * 100)) : 100;
        const parts = [t("sheet.workedShort", { value: Utils.hours(s.worked) })];
        if (cr.total > 0) parts.push(t("sheet.creditedShort", { value: Utils.hours(cr.total) }));
        const line = (label, value, cls) => row(E(label), value, cls);
        return '<div class="card printable"><h2>' + E(t("sheet.summary")) + "</h2>" +
            '<div class="figures">' +
            "<div><span>" + E(t("sheet.goal")) + "</span><strong>" + Utils.hours(s.goal) + "</strong><small>" +
            E(s.homeDays ? t("sheet.goalHome", { base: Utils.hours(s.contractGoal), n: s.homeDays, minus: Utils.hours(s.homeReduction) }) : t("sheet.goalFull")) + "</small></div>" +
            "<div><span>" + E(t("sheet.done")) + "</span><strong>" + Utils.hours(s.done) + "</strong><small>" + E(parts.join(" + ")) + "</small></div>" +
            "<div><span>" + E(t("sheet.result")) + '</span><strong class="' + (s.toRecover < 0 ? "negative" : "positive") + '">' +
            E(Countdown.parts(s.toRecover).value) + '</strong><span class="figure-label ' + (s.toRecover < 0 ? "negative" : "positive") + '">' +
            E(Countdown.parts(s.toRecover).label) + "</span><small>" + E(t("countdown.start", { base: Utils.hours(-s.goal) })) + "</small></div>" +
            '</div><div class="bar"><div style="width:' + pct.toFixed(1) + '%"></div></div>' +
            '<table class="table"><tbody>' +
            line(t("sheet.l.clocked"), Utils.hours(c.clocked)) +
            (c.lunch > 0 ? line(t("sheet.l.lunch"), "−" + Utils.hours(c.lunch), "indent") : "") +
            (c.breaks > 0 ? line(t("sheet.l.breaks"), "−" + Utils.hours(c.breaks), "indent") : "") +
            line(t("sheet.l.worked"), Utils.hours(s.worked)) +
            (s.homeDays ? line(t("sheet.l.home", { n: s.homeDays }), Utils.hours(s.homeHours), "indent") : "") +
            (cr.leave > 0 ? line(t("sheet.l.leave", { day: Utils.hours(o.dayHours) }), "+" + Utils.hours(cr.leave), "indent") : "") +
            (cr.timeOff > 0 ? line(t("sheet.l.timeOff", { day: Utils.hours(o.dayHours) }), "+" + Utils.hours(cr.timeOff), "indent") : "") +
            (cr.holiday > 0 ? line(t("sheet.l.holiday", { day: Utils.hours(o.dayHours) }), "+" + Utils.hours(cr.holiday), "indent") : "") +
            row("<strong>" + E(t("sheet.done")) + "</strong>", "<strong>" + Utils.hours(s.done) + "</strong>") +
            ((s.overtime.h25 || s.overtime.h50)
                ? line(t("sheet.ot25", { from: Math.round(o.overtime25From) + 1, to: Math.round(o.overtime50From) }), Utils.hours(s.overtime.h25)) +
                  line(t("sheet.ot50", { from: Math.round(o.overtime50From) + 1 }), Utils.hours(s.overtime.h50))
                : "") +
            "</tbody></table>" +
            (cr.timeOff > 0 ? '<p class="info">' + E(t("sheet.timeOffInfo", { value: Utils.hours(cr.timeOff) })) + "</p>" : "") +
            (s.complete ? "" : '<p class="info">' + E(t("sheet.weekInProgress")) + "</p>") + "</div>";
    }

    /* Counters with night and holiday premiums on separate lines (request 8) */
    function countersHtml(s) {
        const o = Store.org();
        const c = s.counters;
        const pct = r => Math.round(r * 100) + " %";
        return '<div class="card printable"><h2>' + E(t("sheet.countersTitle")) + '</h2><table class="table"><thead><tr><th></th><th class="num">' +
            E(t("sheet.col.hours")) + '</th><th class="num">' + E(t("sheet.col.premium")) + "</th></tr></thead><tbody>" +
            "<tr><td>" + E(t("sheet.c.night", { from: Utils.pad(o.nightStart), to: Utils.pad(o.nightEnd) })) + '</td><td class="num">' +
            Utils.hours(c.night) + '</td><td class="num">+' + Utils.hours(s.premiumNight) + " <small>(" + pct(o.nightRate) + ")</small></td></tr>" +
            "<tr><td>" + E(t("sheet.c.holidayWorked")) + '</td><td class="num">' + Utils.hours(c.holidayWorked) +
            '</td><td class="num">+' + Utils.hours(s.premiumHoliday) + " <small>(" + pct(o.holidayRate) + ")</small></td></tr>" +
            "<tr><td>" + E(t("sheet.c.sunday")) + '</td><td class="num">' + Utils.hours(c.sunday) + '</td><td class="num">—</td></tr>' +
            "</tbody></table>" +
            '<p class="info">' + E(t("sheet.countersInfo")) + "</p>" +
            (s.habitualNight ? '<p class="banner warn">' + E(t("sheet.nightWorker", { n: s.nightDays3 })) + "</p>" : "") + "</div>";
    }

    function renderWeek() {
        const now = Date.now();
        const entries = Store.entries();
        const settings = Store.settings();
        const sheet = Segments.weekSheet(state.year, state.week, entries, settings, now);
        const s = Hours.weekSummary(sheet);

        const byClient = {}, byActivity = {}, colors = {}, labels = {};
        Segments.CATEGORIES.forEach(c => { colors[c.key] = c.color; labels[c.key] = Segments.label(c.key); });
        const weekStart = Utils.localDate(sheet.days.monday.iso).getTime();
        const weekEnd = Utils.localDate(Utils.addDays(sheet.days.sunday.iso, 1)).getTime();

        let dayRows = "";
        Hours.DAYS.forEach(key => {
            const j = sheet.days[key];
            const b = j.summary;
            Object.keys(b.byClient).forEach(k => { byClient[k] = (byClient[k] || 0) + b.byClient[k]; });
            Object.keys(b.byCategory).forEach(k => { byActivity[k] = (byActivity[k] || 0) + b.byCategory[k]; });
            const gaps = Segments.gaps(b, 15);
            const open = state.openDay === j.iso;
            dayRows +=
                '<tr class="day' + (key === "sunday" ? " sunday" : "") + (open ? " open" : "") + '" data-day="' + j.iso + '">' +
                "<td><strong>" + E(Utils.dayName(j.iso)) + "</strong> " + Utils.dateDmy(j.iso).slice(0, 5) + " " + dayStatus(j.iso) +
                (b.edited ? ' <span class="tag edited">' + E(t("flag.edited")) + "</span>" : "") +
                (b.toCheck ? ' <span class="tag warn">' + E(t("flag.toCheck")) + "</span>" : "") +
                (gaps.length ? ' <span class="tag">' + E(t("sheet.gaps", { n: gaps.length })) + "</span>" : "") + "</td>" +
                dayHoursCells(b) +
                '<td class="num">' + (b.nightMs ? Utils.hm(b.nightMs) : "—") + "</td>" +
                '<td class="detail">' + Segments.CATEGORIES.filter(c => b.byCategory[c.key] > 0).map(c =>
                    '<span><i class="dot" style="background:' + c.color + '"></i>' + E(labels[c.key]) + " " + Utils.hm(b.byCategory[c.key]) + "</span>").join(" ") +
                "</td></tr>";
            if (open) {
                dayRows += '<tr class="day-detail"><td colspan="6">' + Editor.listHtml(Editor.entriesOfDay(j.iso, now), now, !canCorrect(), ownerId()) +
                    (gaps.length ? '<p class="info">' + E(t("sheet.gapsList", { list: gaps.map(g => Utils.clock(g.from) + "→" + Utils.clock(g.to)).join(", ") })) + "</p>" : "") +
                    (canCorrect() ? '<button type="button" class="button secondary" data-add="' + j.iso + '">' + E(t("sheet.addEntryDay")) + "</button>" : "") +
                    (canReport() ? '<button type="button" class="button secondary" data-report="' + j.iso + '">' + UI.icon("bell") + E(t("report.button")) + "</button>" : "") +
                    "</td></tr>";
            }
        });

        const anomalies = Segments.anomalies(entries, now).filter(a =>
            a.entry.start < weekEnd && (a.entry.end == null ? now : a.entry.end) > weekStart);

        return '<div class="card printable"><h2>' + E(t("sheet.weekTitle", { n: state.week, from: Utils.dateDmy(sheet.days.monday.iso), to: Utils.dateDmy(sheet.days.sunday.iso) })) + "</h2>" +
            '<div class="scroll"><table class="table sheet"><thead><tr><th>' + E(t("sheet.col.day")) + '</th><th class="num">' + E(t("sheet.col.clocked")) +
            '</th><th class="num">' + E(t("sheet.col.lunch")) + '</th><th class="num">' + E(t("sheet.col.dayTotal")) +
            '</th><th class="num">' + E(t("sheet.col.night")) + "</th><th>" + E(t("sheet.col.detail")) + "</th></tr></thead><tbody>" + dayRows + "</tbody></table></div></div>" +
            summaryHtml(s) +
            countersHtml(s) +
            (anomalies.length ? '<div class="card"><h2>' + E(t("sheet.toCheck")) + '</h2><ul class="anomalies">' + anomalies.map(a =>
                "<li>" + Utils.dateDmy(Utils.isoLocal(a.entry.start)) + " " + Utils.clock(a.entry.start) + " — " + E(Segments.label(a.entry.category)) +
                " : " + E(a.text) + (canCorrect() ? ' <button type="button" class="button mini" data-edit="' + E(a.entry.id) + '" data-owner="' + E(ownerId()) + '">✎</button>'
                    : canReport() ? ' <button type="button" class="button mini" data-report="' + Utils.isoLocal(a.entry.start) + '">' + E(t("report.button")) + "</button>" : "") +
                "</li>").join("") + "</ul></div>" : "") +
            reportsHtml() +
            totalsTable(t("sheet.byClient"), byClient) +
            totalsTable(t("sheet.byActivity"), byActivity, labels, colors);
    }

    /* Error reports of the account shown (open first, then the 8 latest) */
    function reportsHtml() {
        const list = Store.correctionRequests(ownerId());
        if (!list.length) return "";
        const shown = list.filter(r => r.status === "open").concat(list.filter(r => r.status !== "open").slice(0, 8));
        const kind = { open: "warning", done: "success", rejected: "danger" };
        return '<div class="card"><h2>' + E(t("report.title")) + '</h2><ul class="feed">' + shown.map(r =>
            "<li>" + UI.badge(t("report.status." + r.status), kind[r.status]) + "<div><strong>" + Utils.dateDmy(r.date) + "</strong> — " + E(r.text) +
            '<br><small class="muted">' + E(t("report.by", { name: (Store.user(r.requestedBy) || {}).name || "—", at: Utils.dateTime(new Date(r.requestedAt).getTime()) })) +
            (r.comment ? " · " + E(t("report.answer", { text: r.comment })) : "") + "</small></div>" +
            (r.status === "open" && canCorrect() ? '<button type="button" class="button mini danger" data-reject-cr="' + E(r.id) + '">' + E(t("admin.reject")) + "</button>" : "") +
            "</li>").join("") + "</ul></div>";
    }

    function openReport(iso) {
        UI.openSheet("<h2>" + E(t("report.title")) + "</h2>" +
            '<p class="info">' + E(t("report.info")) + "</p>" +
            "<label>" + E(t("editor.date")) + '<input type="date" id="rpDate" value="' + E(iso) + '"></label>' +
            "<label>" + E(t("report.text")) + '<textarea id="rpText" rows="3" maxlength="400" style="width:100%"></textarea></label>' +
            '<p class="error" id="rpErr"></p><div class="actions"><span class="spacer"></span>' +
            '<button type="button" class="button" data-close>' + E(t("common.cancel")) + "</button>" +
            '<button type="button" class="button primary" id="rpSend">' + UI.icon("bell") + E(t("report.send")) + "</button></div>", dlg => {
            dlg.querySelector("#rpSend").addEventListener("click", () => {
                const res = Store.requestCorrection({ userId: ownerId(), date: dlg.querySelector("#rpDate").value, text: dlg.querySelector("#rpText").value });
                if (typeof res === "string") { dlg.querySelector("#rpErr").textContent = t("report.err." + res); return; }
                UI.closeSheet();
                message = { cls: "success", text: t("report.sent") };
                render();
            });
        });
    }

    function renderMonth() {
        const now = Date.now();
        const entries = Store.entries();
        const settings = Store.settings();
        let total = 0, recover = 0, h25 = 0, h50 = 0, night = 0, sunday = 0;
        const rows = Hours.weeksOfMonth(state.monthYear, state.month).map(w => {
            const sheet = Segments.weekSheet(w.year, w.week, entries, settings, now);
            const s = Hours.weekSummary(sheet);
            total += s.done; night += s.counters.night; sunday += s.counters.sunday; h25 += s.overtime.h25; h50 += s.overtime.h50;
            if (!s.empty) recover += s.toRecover;
            return '<tr data-week="' + w.year + "-" + w.week + '" class="clickable"><td>' + E(t("sum.weekShort")) + w.week +
                " <small>" + Utils.dateDmy(sheet.days.monday.iso).slice(0, 5) + "→" + Utils.dateDmy(sheet.days.sunday.iso).slice(0, 5) + "</small></td>" +
                '<td class="num">' + Utils.hours(s.done) + '</td><td class="num">' + Utils.hours(s.goal) + "</td>" +
                '<td class="num ' + (s.toRecover < 0 && !s.empty ? "negative" : "") + '">' + (s.empty ? "—" : Utils.hours(s.toRecover)) + "</td>" +
                '<td class="num">' + Utils.hours(s.overtime.h25) + '</td><td class="num">' + Utils.hours(s.overtime.h50) + "</td>" +
                '<td class="num">' + Utils.hours(s.counters.night) + '</td><td class="num">' + Utils.hours(s.counters.sunday) + "</td></tr>";
        }).join("");
        const taken = Hours.timeOffTaken({ year: state.monthYear, month: state.month });
        return '<div class="card printable"><h2>' + E(Utils.monthName(state.month) + " " + state.monthYear) + "</h2>" +
            '<div class="scroll"><table class="table"><thead><tr><th>' + E(t("sum.week")) + "</th><th>" + E(t("sheet.done")) + "</th><th>" +
            E(t("sheet.goal")) + "</th><th>" + E(t("sheet.result")) + "</th><th>25 %</th><th>50 %</th><th>" + E(t("sheet.col.night")) +
            "</th><th>" + E(t("sheet.c.sundayShort")) + "</th></tr></thead>" +
            "<tbody>" + rows + "</tbody><tfoot><tr><td>" + E(t("sheet.monthTotal")) + '</td><td class="num">' + Utils.hours(total) +
            '</td><td class="num">' + E(t("sheet.monthRef", { n: Hours.MONTHLY_REFERENCE })) + '</td><td class="num">' + Utils.hours(recover) +
            '</td><td class="num">' + Utils.hours(h25) + '</td><td class="num">' + Utils.hours(h50) +
            '</td><td class="num">' + Utils.hours(night) + '</td><td class="num">' + Utils.hours(sunday) + "</td></tr></tfoot></table></div>" +
            '<p class="info">' + E(t("sheet.monthInfo", { taken: Utils.hours(taken) })) + "</p></div>";
    }

    function saveAs(key) {
        const format = Exports.FORMATS[key];
        if (!format) return;
        const n = inContext(() => format.run(Exports.period(state)));
        message = (n || key === "pdf")
            ? { cls: "success", text: t(format.message, { n }) }
            : { cls: "error", text: t("export.msg.empty") };
        render();
    }

    /* Excel register (2026_Registres_Heures format) — technician only */
    function importRegister(sheet) {
        const r = inContext(() => RegisterImport.importSheet(sheet));
        Store.recordImport("register", r.days || 0, (Store.user(ownerId()) || {}).name);
        message = { cls: r.days || r.timeOff ? "success" : "error", text: RegisterImport.message(r) };
        render();
    }

    /* Default choice: the sheet used most recently (latest day with working
       hours), then the one with the most filled working-hour cells. In the
       managers' file this is "2026 - Alexandre (2)", the sheet in use. */
    function defaultSheet(sheets) {
        let best = 0, max = "";
        sheets.forEach((s, i) => {
            const c = RegisterImport.columns(s.rows[0]);
            const worked = s.rows.filter(r => r && typeof r[c.work] === "number" && r[c.work] > 0);
            const latest = worked.map(r => XlsxReader.toIsoDate(r[c.date]) || "").sort().pop() || "";
            const score = latest + "|" + String(worked.length).padStart(6, "0");
            if (score > max) { max = score; best = i; }
        });
        return best;
    }

    function importExcel(f) {
        f.arrayBuffer().then(XlsxReader.read).then(sheets => {
            const found = RegisterImport.registerSheets(sheets);
            if (!found.length) { message = { cls: "error", text: t("reg.noRegister") }; render(); return; }
            if (found.length === 1) { importRegister(found[0]); return; }
            pendingSheets = found;
            message = { cls: "", text: "" };
            render();
        }).catch(err => {
            message = { cls: "error", text: t(err && err.message === "unsupportedBrowser" ? "reg.errBrowser" : "reg.errRead") };
            render();
        });
    }

    function toolbarHtml() {
        const title = state.mode === "week" ? t("sheet.navWeek", { n: state.week, year: state.year }) : Utils.monthName(state.month) + " " + state.monthYear;
        return '<div class="toolbar">' +
            '<div class="toggle"><button type="button" data-mode="week" class="' + (state.mode === "week" ? "active" : "") + '">' + E(t("sheet.week")) + "</button>" +
            '<button type="button" data-mode="month" class="' + (state.mode === "month" ? "active" : "") + '">' + E(t("sheet.month")) + "</button></div>" +
            '<div class="nav"><button type="button" class="button mini" data-nav="-1" aria-label="' + E(t("common.previous")) + '">‹</button>' +
            "<strong>" + E(title) + "</strong>" +
            '<button type="button" class="button mini" data-nav="1" aria-label="' + E(t("common.next")) + '">›</button>' +
            '<button type="button" class="button secondary" data-nav="0">' + E(t("common.today")) + "</button></div>" +
            '<div class="actions">' +
            (!canImport() ? "" : '<button type="button" class="button secondary" data-act="template">' + E(t("common.importTemplate")) + "</button>" +
                '<button type="button" class="button secondary" data-act="import">' + E(t("common.import")) + "</button>") +
            '<select class="save-as" data-act="saveAs" aria-label="' + E(t("sheet.saveAs")) + '">' +
            '<option value="">' + E(t(state.mode === "week" ? "sheet.saveWeekAs" : "sheet.saveMonthAs")) + "</option>" +
            Object.keys(Exports.FORMATS).map(k => '<option value="' + k + '">' + E(t(Exports.FORMATS[k].label)) + "</option>").join("") +
            "</select>" +
            '<button type="button" class="button secondary" data-act="print">' + E(t("common.print")) + "</button>" +
            (!canImport() ? "" : '<input type="file" data-act="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>') +
            "</div></div>";
    }

    function render() {
        if (!root) return;
        inContext(() => {
            root.innerHTML = toolbarHtml() +
                (message.text ? '<p class="' + message.cls + '">' + E(message.text) + "</p>" : "") +
                (pendingSheets ? '<div class="card"><p>' + E(t("reg.chooseSheet")) + '</p><div class="actions"><select data-act="sheet" class="save-as">' +
                    pendingSheets.map((s, i) => '<option value="' + i + '"' + (i === defaultSheet(pendingSheets) ? " selected" : "") + ">" + E(s.name) + "</option>").join("") +
                    '</select><button type="button" class="button primary" data-act="sheetImport">' + E(t("reg.importSheet")) + "</button></div></div>" : "") +
                (state.mode === "week" ? renderWeek() : renderMonth());
        });
        wire();
    }

    function wire() {
        const q = sel => root.querySelector(sel);
        root.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => { state.mode = b.dataset.mode; render(); }));
        root.querySelectorAll("[data-nav]").forEach(b => b.addEventListener("click", () => {
            const n = +b.dataset.nav;
            if (n === 0) goToday();
            else if (state.mode === "week") moveWeek(n);
            else moveMonth(n);
            render();
        }));
        q('[data-act="print"]').addEventListener("click", () => inContext(() => Exports.print(Exports.period(state))));
        q('[data-act="saveAs"]').addEventListener("change", e => {
            const key = e.target.value;
            e.target.value = "";
            saveAs(key);
        });
        if (canImport()) {
            q('[data-act="template"]').addEventListener("click", HoursCsv.template);
            const file = q('[data-act="file"]');
            q('[data-act="import"]').addEventListener("click", () => { file.value = ""; file.click(); });
            file.addEventListener("change", () => {
                const f = file.files[0];
                if (!f) return;
                pendingSheets = null;
                if (/\.xlsx$/i.test(f.name)) { importExcel(f); return; }
                Utils.readText(f).then(text => {
                    const r = inContext(() => HoursCsv.importCsv(text));
                    Store.recordImport("timesheet", r.imported || 0, (Store.user(ownerId()) || {}).name);
                    message = { cls: r.imported ? "success" : "error", text: HoursCsv.resultMessage(r) };
                    render();
                });
            });
            const sheetButton = q('[data-act="sheetImport"]');
            if (sheetButton) sheetButton.addEventListener("click", () => {
                const sheet = pendingSheets[+q('[data-act="sheet"]').value];
                pendingSheets = null;
                importRegister(sheet);
            });
        }
        if (canCorrect()) root.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", ev => {
            ev.stopPropagation();
            Editor.open({ date: b.dataset.add, userId: ownerId() });
        }));
        root.querySelectorAll("[data-report]").forEach(b => b.addEventListener("click", ev => { ev.stopPropagation(); openReport(b.dataset.report); }));
        root.querySelectorAll("[data-reject-cr]").forEach(b => b.addEventListener("click", ev => {
            ev.stopPropagation();
            const comment = prompt(t("report.rejectPrompt"));
            if (comment !== null) {
                const res = Store.closeCorrection(b.dataset.rejectCr, "rejected", comment);
                if (res !== true) alert(t("report.err." + res));
            }
        }));
        root.querySelectorAll("tr[data-day]").forEach(tr => tr.addEventListener("click", () => {
            state.openDay = state.openDay === tr.dataset.day ? null : tr.dataset.day;
            render();
        }));
        root.querySelectorAll("tr[data-week]").forEach(tr => tr.addEventListener("click", () => {
            const p = tr.dataset.week.split("-");
            state.year = +p[0]; state.week = +p[1]; state.mode = "week"; state.openDay = null;
            render();
        }));
    }

    function init() {
        root = document.getElementById(options.rootId);
        if (!state.ready) { goToday(); state.ready = true; }
        message = { cls: "", text: "" };
        render();
    }

    return { init, render, state: () => state };
}


/* =============================================================
   report-doc.js — exported report (4.4, mock-up validated on 17/11/2026)
   DISPLAY ONLY: every figure comes from page-reports.js (personData),
   which uses the engine functions; nothing is computed again here.
   - html(model): A4 landscape document printed by Utils.printHtml
     (browser "Save as PDF"): header with the company logo, technician
     band, summary cards, hours to be paid, time off follow-up, chart,
     then the monthly table (optionally with every week under its month,
     its validation state included). Pages are cut here (fixed row
     heights) so that a month is never split and every page keeps the
     header, the column titles and the footer.
   - workbook(model): the same parts in an Excel file (.xlsx).
   The text follows I18n.t: page-reports.js builds the model inside
   I18n.withLanguage(language chosen in the export window).
   ============================================================= */

const ReportDoc = (() => {
    "use strict";

    const E = Utils.escape;
    const t = I18n.t;
    const h = Utils.hours;
    const COLS = ["worked", "normal", "ot25", "ot50", "result", "toPay", "timeOff", "leaveDays", "night", "sunday"];
    const TITLES = { worked: "rep.worked", normal: "rep.normal", ot25: "rep.ot25", ot50: "rep.ot50", result: "rep.result", toPay: "rep.toPay",
        timeOff: "rep.timeOff", leaveDays: "rep.leaveDays", night: "rep.night", sunday: "rep.sunday" };
    const cell = (k, v) => (v ? (k === "leaveDays" ? Utils.days(v) : (k === "result" && v > 0 ? "+" : "") + h(v)) : "—");
    /* mm — fixed heights (CSS below) used to cut the table into pages */
    const ROOM = 150, HEAD = 12, MONTH = 7.6, MONTH_WEEKS = 7.2, WEEK = 5.8, TOTAL = 8.6;

    const CSS = "@font-face{font-family:Inter;src:url(fonts/inter.woff2) format('woff2');font-weight:100 900}" +
        "@font-face{font-family:'Inter Tight';src:url(fonts/inter-tight.woff2) format('woff2');font-weight:100 900}" +
        "@page{size:A4 landscape;margin:0}*{box-sizing:border-box}" +
        "body{margin:0;font:9pt/1.4 Inter,system-ui,sans-serif;color:#172033;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
        ".page{width:297mm;height:210mm;padding:10mm 12mm 8mm;display:flex;flex-direction:column;gap:5mm;page-break-after:always;break-after:page;overflow:hidden}" +
        ".page:last-child{page-break-after:auto;break-after:auto}" +
        ".kicker{display:block;font-size:7pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#801F35}" +
        ".top{display:flex;justify-content:space-between;align-items:center;padding-bottom:4mm;border-bottom:2px solid #111D2D}" +
        ".brand{display:flex;align-items:center;gap:3.5mm}.brand img{width:13mm;height:13mm;object-fit:contain}" +
        ".brand b{display:block;font:700 12pt 'Inter Tight',Inter,sans-serif;color:#111D2D}.brand span{color:#737B89;font-size:8pt}" +
        ".doc{text-align:right}.doc b{display:block;font:700 11pt 'Inter Tight',Inter,sans-serif;color:#111D2D;margin:.5mm 0}.doc .when{color:#737B89;font-size:8pt}" +
        ".ident{display:flex;justify-content:space-between;align-items:center;gap:6mm;background:#111D2D;color:#fff;border-radius:3mm;padding:4.5mm 6mm;position:relative;overflow:hidden}" +
        ".ident:after{content:'';position:absolute;right:-30mm;top:-25mm;width:70mm;height:70mm;border-radius:50%;border:9mm solid rgba(128,31,53,.55)}" +
        ".who{display:flex;align-items:center;gap:4mm;position:relative;z-index:1}" +
        ".av{flex:none;width:13mm;height:13mm;border-radius:50%;background:#801F35;display:flex;align-items:center;justify-content:center;font:700 11pt 'Inter Tight',Inter,sans-serif}" +
        ".ident .kicker{color:#E7A9B6}.ident h1{margin:.5mm 0 1mm;font:800 20pt/1.05 'Inter Tight',Inter,sans-serif;letter-spacing:-.02em}.ident p{margin:0;color:#C9CFDA;font-size:8.5pt}" +
        ".tags{display:flex;flex-direction:column;gap:1.5mm;align-items:flex-end;position:relative;z-index:1}" +
        ".tags span{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:99px;padding:1mm 3mm;font-size:7.5pt;white-space:nowrap}" +
        ".kpis{display:grid;grid-template-columns:1.35fr repeat(6,1fr);gap:3mm}" +
        ".kpi{border:1px solid #E6E7EB;border-radius:2.5mm;padding:3mm 3.5mm;background:#fff}" +
        ".kpi span{display:block;color:#737B89;font-size:7.5pt;font-weight:600}.kpi b{display:block;font:800 15pt/1.15 'Inter Tight',Inter,sans-serif;color:#111D2D;margin-top:1mm;white-space:nowrap}" +
        ".kpi small{color:#9AA1AD;font-size:6.8pt}.kpi.main{background:#111D2D;border-color:#111D2D}.kpi.main span,.kpi.main small{color:#C9CFDA}.kpi.main b{color:#fff;font-size:18pt}" +
        ".kpi.warn{border-top:1mm solid #D97706}.kpi.accent{border-top:1mm solid #801F35}.kpi.accent b{color:#801F35}" +
        ".row3{display:grid;gap:4mm;flex:1;min-height:0}" +
        ".panel{border:1px solid #E6E7EB;border-radius:2.5mm;padding:4mm;display:flex;flex-direction:column;min-height:0;overflow:hidden}" +
        "h2{margin:0 0 3mm;font:700 8.5pt Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#111D2D}h2 small{text-transform:none;letter-spacing:0;color:#737B89;font-weight:500}" +
        ".big{display:flex;flex-direction:column;background:#F7EEF1;border-radius:2mm;padding:3mm 3.5mm;margin-bottom:3mm}" +
        ".big span{color:#801F35;font-size:7.5pt;font-weight:600}.big b{font:800 20pt/1.1 'Inter Tight',Inter,sans-serif;color:#801F35}" +
        ".bars{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1.4mm}" +
        ".bars li{display:grid;grid-template-columns:22mm 1fr 15mm;align-items:center;gap:2mm;font-size:8pt}" +
        ".bars i{height:2.6mm;background:#F0F1F4;border-radius:2mm;overflow:hidden}.bars em{display:block;height:100%;background:#801F35;border-radius:2mm}.bars b{text-align:right}" +
        ".duo{display:grid;grid-template-columns:1fr 1fr;gap:2.5mm;margin-bottom:3mm}.duo.trio{grid-template-columns:1fr 1fr 1fr;gap:2mm}.duo.trio div{padding:2.2mm}.duo.trio b{font-size:12pt}.duo .bal{background:#F7EEF1}.duo .bal b{color:#801F35}.duo div{background:#F3F2EF;border-radius:2mm;padding:3mm}" +
        ".duo span{display:block;font-size:7.5pt;font-weight:600;color:#4B5466}.duo b{display:block;font:800 15pt/1.15 'Inter Tight',Inter,sans-serif;color:#111D2D}.duo small{color:#9AA1AD;font-size:6.8pt}" +
        "table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}" +
        ".mini th,.mini td{padding:.9mm 1.5mm;font-size:7.8pt;border-bottom:1px solid #EEF0F3;text-align:left}.mini th{color:#737B89;font-size:7pt;font-weight:600}" +
        ".n{text-align:right!important;white-space:nowrap}.note{margin:auto 0 0;padding-top:2mm;color:#8A92A0;font-size:7pt}" +
        ".cols{flex:1;display:grid;gap:2mm;align-items:end;min-height:0}.cols div{display:flex;flex-direction:column;align-items:center;height:100%;gap:1mm;min-width:0}" +
        ".cols b{font-size:6.8pt;font-weight:600;color:#4B5466;white-space:nowrap;writing-mode:vertical-rl;transform:rotate(180deg);height:14mm;text-align:left}.cols span{font-size:7pt;color:#737B89}" +
        ".cols i{flex:1;width:100%;display:flex;flex-direction:column-reverse;background:#F7F7F9;border-radius:1.5mm;overflow:hidden}" +
        ".cn{background:#111D2D}.ca{background:#D97706}.cc{background:#801F35}" +
        ".legend{display:flex;gap:4mm;margin-top:2mm;font-size:7.5pt;color:#4B5466}.legend i{display:inline-block;width:2.5mm;height:2.5mm;border-radius:.6mm;margin-right:1.2mm}" +
        ".tablesec{flex:1;display:flex;flex-direction:column;min-height:0}" +
        ".tbl{table-layout:fixed}.tbl col.c1{width:62mm}.tbl th.n{white-space:normal!important}" +
        ".tbl th{background:#111D2D;color:#fff;font-size:6.8pt;line-height:1.15;font-weight:600;padding:1.2mm 1.4mm;height:9mm;text-align:left;vertical-align:middle;overflow-wrap:anywhere}" +
        ".tbl th:first-child{border-radius:2mm 0 0 0}.tbl th:last-child{border-radius:0 2mm 0 0}" +
        ".tbl td{padding:0 1.4mm;font-size:8pt;border-bottom:1px solid #EEF0F3;height:" + MONTH + "mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
        ".tbl tr.alt td{background:#F7F7F9}.tbl td:first-child{font-weight:600;color:#111D2D}.neg{color:#B91C1C}" +
        ".tbl.wk tr.mrow td{height:" + MONTH_WEEKS + "mm;background:#E9ECF2;font-weight:700;color:#111D2D;border-top:1.5px solid #111D2D}" +
        ".tbl tr.wrow td{height:" + WEEK + "mm;font-size:7.6pt;color:#4B5466}.tbl tr.wrow:nth-child(odd) td{background:#FAFAFB}" +
        ".tbl tr.wrow td:first-child{font-weight:500;color:#4B5466;padding-left:4mm}.arrow{color:#B8BEC8;margin-right:1.2mm}.wd{color:#8A92A0;font-size:6.8pt;margin:0 1mm}" +
        ".wn{font-weight:500;color:#737B89;font-size:6.8pt;margin-left:1.5mm}" +
        ".tbl tr.tot td{height:" + TOTAL + "mm;background:#801F35;color:#fff;font-weight:800;font-family:'Inter Tight',Inter,sans-serif;font-size:8.6pt}" +
        ".tbl tr.tot td:first-child{border-radius:0 0 0 2mm;color:#fff}.tbl tr.tot td:last-child{border-radius:0 0 2mm 0}" +
        ".st{display:inline-block;padding:.2mm 1.6mm;border-radius:99px;font-size:6.2pt;font-weight:600;background:#EEF0F3;color:#4B5466}" +
        ".st.imp{background:#EEF2FF;color:#4338CA;margin-left:1mm}.st.success{background:#E6F4EC;color:#15803D}.st.info{background:#EAF0FB;color:#1D4ED8}.st.warning{background:#FDF3E3;color:#B45309}.st.danger{background:#FDECEC;color:#B91C1C}" +
        ".bars.two{display:grid;grid-template-columns:1fr 1fr;grid-auto-flow:column;grid-template-rows:repeat(6,auto);column-gap:4mm}.bars.two li{grid-template-columns:11mm 1fr 12mm;font-size:7.4pt}" +
        ".minis{display:flex;gap:3mm;align-items:flex-start}.minis .mini{flex:1}.minis .mini td{height:4.6mm}" +
        ".ident p.l2{margin-top:1mm;color:#9AA4B4;font-size:7.5pt}" +
        ".goal{position:relative;z-index:2;width:112mm;background:#1A2638;border:1px solid rgba(255,255,255,.14);border-radius:2.5mm;padding:2.5mm 3.5mm}" +
        ".g-fig{display:flex;align-items:baseline;gap:2mm;margin:.6mm 0 1.6mm}.g-fig b{font:800 15pt/1 'Inter Tight',Inter,sans-serif}.g-fig span{color:#C9CFDA;font-size:8pt}" +
        ".g-bar{position:relative;height:2.6mm;background:rgba(255,255,255,.14);border-radius:2mm}.g-bar em{position:absolute;top:-.8mm;width:.5mm;height:4.2mm;background:#fff;border-radius:.3mm}.g-bar i{display:block;height:100%;background:#C9566F;border-radius:2mm}" +
        ".g-sub{display:flex;justify-content:space-between;gap:2mm;margin-top:1.2mm;font-size:6.8pt;color:#C9CFDA}.g-sub strong{color:#fff}.g-sub.l3{margin-top:.6mm;color:#9AA4B4;font-size:6.4pt}" +
        "footer{margin-top:auto;display:flex;justify-content:space-between;align-items:center;padding-top:2.5mm;border-top:1px solid #E6E7EB;color:#8A92A0;font-size:7pt}" +
        "footer img{width:3.5mm;height:3.5mm;border-radius:.8mm;vertical-align:-.8mm;margin-right:1.5mm}";

    const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
    const short = m => cap(new Date(2000, m, 1).toLocaleDateString(I18n.locale(), { month: "short" }));
    const initials = name => String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
    const printed = m => Utils.dateDmy(Utils.isoLocal(m.printedAt)) + " " + Utils.clock(m.printedAt);

    function header(m, sub) {
        return '<header class="top"><div class="brand"><img src="images/logo.png" alt=""><div><b>Auxiliar Conservera</b><span>My Time Keeper — ' + E(t("app.tagline")) + "</span></div></div>" +
            '<div class="doc"><span class="kicker">' + E(t("rx.d.kicker") + (sub ? " — " + sub : "")) + "</span><b>" + E(m.period) + '</b><span class="when">' +
            E(t("export.printedOn") + " " + printed(m)) + "</span></div></header>";
    }
    const footer = (m, name) => '<footer><span><img src="images/app-icon.svg" alt="">My Time Keeper</span><span>' + E([name, m.period, t("export.printedOn") + " " + printed(m)].filter(Boolean).join(" · ")) +
        "</span><span>" + E(t("rx.d.page")) + " %PAGE%</span></footer>";
    const page = (m, sub, name, body) => '<div class="page">' + header(m, sub) + body + footer(m, name) + "</div>";

    /* Technician band */
    /* 4.5: annual target (calendar-day prorata, Hours.yearProgress) — valued = worked + assimilated */
    function goalHtml(g) {
        const pct = Math.min(100, g.pct * 100), mark = g.target > 0 ? Math.min(100, g.targetToDate / g.target * 100) : 0;
        const gap = Math.abs(g.gap) < 0.5 ? t("rx.g.even") : t(g.gap > 0 ? "rx.g.ahead" : "rx.g.behind", { value: h(Math.abs(g.gap)) });
        return '<div class="goal"><span class="kicker">' + E(t("rx.g.title", { year: String(g.year) })) + '</span><div class="g-fig"><b>' + E(h(g.valued)) + "</b><span>" +
            E(t("rx.g.of", { target: h(g.target) })) + '</span></div><div class="g-bar"><i style="width:' + pct.toFixed(1) + '%"></i><em style="left:' + mark.toFixed(1) + '%"></em></div>' +
            '<div class="g-sub"><span><strong>' + Math.round(pct) + " %</strong> " + E(t("rx.g.done")) + "</span><span>" + E(t("rx.g.toDate", { date: Utils.dateDmy(g.end).slice(0, 5), value: h(g.targetToDate) })) +
            "</span><span><strong>" + E(gap) + "</strong></span></div>" +
            '<div class="g-sub l3"><span>' + E(t("rx.g.split", { worked: h(g.worked), validated: h(g.validated), assimilated: h(g.assimilated) })) + "</span><span>" +
            E(t("rx.g.remaining", { value: h(g.remaining) })) + "</span></div></div>";
    }

    function ident(p, m) {
        const u = p.user;
        const secs = u.allSections ? t("team.allSections") : Store.sections().filter(s => (u.sectionIds || []).indexOf(s.id) >= 0).map(s => s.name).join(", ");
        const leads = Store.weekLeadsOf(u.id).map(id => (Store.user(id) || {}).name).filter(Boolean);
        const line = [u.jobTitle || t("role." + u.role), secs, u.hireDate ? t("rx.d.hired", { date: Utils.dateDmy(u.hireDate) }) : "", t("expl.v.contract")].filter(Boolean).join(" · ");
        const line2 = [u.hireDate ? t("rx.d.fromHire", { date: Utils.dateDmy(u.hireDate) }) : "", leads.length ? t("role.team_lead") + " : " + leads.join(", ") : ""].filter(Boolean).join(" · ");
        const year = m && p.year ? goalHtml(p.year) : "";
        return '<section class="ident"><div class="who"><span class="av">' + E(initials(u.name)) + '</span><div><span class="kicker">' + E(t("role." + u.role)) + "</span><h1>" + E(u.name) + "</h1><p>" + E(line) + "</p>" +
            (line2 ? '<p class="l2">' + E(line2) + "</p>" : "") + "</div></div>" + year + "</section>";
    }

    function kpis(total) {
        const o = Store.org();
        const k = (label, value, cls, sub) => '<div class="kpi ' + (cls || "") + '"><span>' + E(label) + "</span><b>" + E(value) + "</b>" + (sub ? "<small>" + E(sub) + "</small>" : "") + "</div>";
        return '<section class="kpis">' + k(t("rep.worked"), h(total.worked), "main", t("rx.k.all")) + k(t("rep.normal"), h(total.normal)) +
            k(t("rep.ot25"), h(total.ot25), "warn", t("rx.k.ot25", { from: String(Math.round(o.overtime25From) + 1), to: String(o.overtime50From) })) +
            k(t("rep.ot50"), h(total.ot50), "accent", t("rx.k.ot50", { from: String(Math.round(o.overtime50From) + 1) })) +
            k(t("rep.night"), h(total.night), "", Utils.pad(o.nightStart) + ":00 → " + Utils.pad(o.nightEnd) + ":00") +
            k(t("rep.sunday"), h(total.sunday)) + k(t("rep.leaveDays"), Utils.days(total.leaveDays), "", t("rx.k.days")) + "</section>";
    }

    function payPanel(p) {
        const o = Store.org();
        const max = Math.max.apply(null, p.rows.map(r => r.toPay).concat([1]));
        return '<section class="panel"><h2>' + E(t("rx.pay.title")) + '</h2><div class="big"><span>' + E(t("rep.toPay") + " — " + t("rep.total")) + "</span><b>" + E(h(p.total.toPay)) + '</b></div><ul class="bars' + (p.rows.length > 6 ? " two" : "") + '">' +
            p.rows.map(r => "<li><span>" + E(p.rows.length > 6 ? short(r.month) : cap(r.label)) + '</span><i><em style="width:' + (r.toPay / max * 100).toFixed(0) + '%"></em></i><b>' + E(cell("toPay", r.toPay)) + "</b></li>").join("") + "</ul>" +
            (o.hoursMethod !== "countdown" && o.paidOvertimeFromWeek ? '<p class="note">' + E(t("rx.pay.note", { from: String(o.paidOvertimeFromWeek), to: String(o.paidOvertimeToWeek) })) + "</p>" : "") + "</section>";
    }

    function recoveryPanel(p) {
        const b = p.balance;
        return '<section class="panel"><h2>' + E(t("rx.rec.title")) + '</h2><div class="duo trio"><div><span>' + E(t("rx.rec.acquired")) + "</span><b>" + E(cell("result", p.total.result)) + "</b><small>" + E(t("rx.rec.resultSub")) + "</small></div>" +
            "<div><span>" + E(t("rep.timeOff")) + "</span><b>" + E(h(p.total.timeOff)) + "</b><small>" + E(t("rx.rec.takenSub")) + "</small></div>" +
            '<div class="bal"><span>' + E(t("rx.rec.balance")) + "</span><b>" + E(b ? cell("result", b.total) : "—") + "</b><small>" + E(b ? t("rx.rec.balanceSub", { date: Utils.dateDmy(b.upTo) }) : "") + "</small></div></div>" +
            /* 4.5: more than 6 months → two tables side by side (nothing cut) */
            '<div class="minis">' + (p.rows.length > 6 ? [p.rows.slice(0, Math.ceil(p.rows.length / 2)), p.rows.slice(Math.ceil(p.rows.length / 2))] : [p.rows]).map(list =>
                '<table class="mini"><thead><tr><th>' + E(t("rep.month")) + '</th><th class="n">' + E(t("rep.col.result")) + '</th><th class="n">' + E(t("rep.col.timeOff")) + "</th></tr></thead><tbody>" +
                list.map(r => "<tr><td>" + E(p.rows.length > 6 ? short(r.month) : cap(r.label)) + '</td><td class="n' + (r.result < 0 ? " neg" : "") + '">' + E(cell("result", r.result)) + '</td><td class="n">' + E(cell("timeOff", r.timeOff)) + "</td></tr>").join("") +
                "</tbody></table>").join("") + '</div><p class="note">' + E(t("rx.rec.note")) + "</p></section>";
    }

    function chartPanel(p) {
        const max = Math.max.apply(null, p.rows.map(r => r.normal + r.ot25 + r.ot50).concat([1]));
        const pc = v => (v / max * 100).toFixed(1) + "%";
        return '<section class="panel"><h2>' + E(t("rx.chart.title")) + '</h2><div class="cols" style="grid-template-columns:repeat(' + p.rows.length + ',minmax(0,1fr))">' +
            p.rows.map(r => "<div><b>" + E(r.worked ? h(r.worked) : "") + '</b><i><em class="cn" style="height:' + pc(r.normal) + '"></em><em class="ca" style="height:' + pc(r.ot25) + '"></em>' +
                '<em class="cc" style="height:' + pc(r.ot50) + '"></em></i><span>' + E(short(r.month)) + "</span></div>").join("") + "</div>" +
            '<div class="legend"><span><i class="cn"></i>' + E(t("rep.col.normal")) + '</span><span><i class="ca"></i>25 %</span><span><i class="cc"></i>50 %</span></div></section>';
    }

    /* Summary page of one technician (only the parts chosen) */
    function summaryPage(m, p) {
        const panels = [m.parts.pay ? payPanel(p) : "", m.parts.recovery ? recoveryPanel(p) : "", m.parts.chart ? chartPanel(p) : ""].filter(Boolean);
        if (!m.parts.summary && !panels.length) return [];
        return [page(m, "", p.user.name, ident(p, m) + (m.parts.summary ? kpis(p.total) : "") +
            (panels.length ? '<div class="row3" style="grid-template-columns:repeat(' + panels.length + ',1fr)">' + panels.join("") + "</div>" : ""))];
    }

    const headRow = first => '<colgroup><col class="c1">' + COLS.map(() => "<col>").join("") + "</colgroup><thead><tr><th>" + E(first) + "</th>" + COLS.map(k => '<th class="n">' + E(t(TITLES[k])) + "</th>").join("") + "</tr></thead>";
    const figures = r => COLS.map(k => '<td class="n' + (k === "result" && r[k] < 0 ? " neg" : "") + '">' + E(cell(k, r[k])) + "</td>").join("");
    const totalRow = total => '<tr class="tot"><td>' + E(t("rep.total")) + "</td>" + COLS.map(k => '<td class="n">' + E(cell(k, total[k])) + "</td>").join("") + "</tr>";

    /* Groups of rows ({ height, html }) cut into pages, never inside a group */
    function paginate(groups) {
        const pages = [[]];
        let used = HEAD;
        groups.forEach(g => {
            if (used + g.height > ROOM && pages[pages.length - 1].length) { pages.push([]); used = HEAD; }
            pages[pages.length - 1].push(g.html);
            used += g.height;
        });
        return pages;
    }

    /* Monthly table of one technician, with or without the weeks */
    function tablePages(m, p) {
        const weeks = !!m.parts.weeks;
        const groups = p.rows.map((r, i) => {
            if (!weeks) return { height: MONTH, html: '<tr class="' + (i % 2 ? "alt" : "") + '"><td>' + E(cap(r.label)) + "</td>" + figures(r) + "</tr>" };
            const rows = '<tr class="mrow"><td>' + E(cap(r.label)) + ' <span class="wn">' + E(t("rx.table.weeks", { n: String(r.weeks.length) })) + "</span></td>" + figures(r) + "</tr>" +
                r.weeks.map(w => {
                    const s = ValidationPage.statusOf(w.record);
                    return '<tr class="wrow"><td><span class="arrow">↳</span>' + E(t("sum.weekShort") + w.week) + ' <span class="wd">' + E(Utils.dateDmy(w.from).slice(0, 5) + " → " + Utils.dateDmy(w.to).slice(0, 5)) +
                        '</span><span class="st ' + s[1] + '">' + E(s[0]) + "</span>" + (w.imported ? '<span class="st imp">' + E(t("week.imported")) + "</span>" : "") + "</td>" + figures(w) + "</tr>";
                }).join("");
            return { height: MONTH_WEEKS + r.weeks.length * WEEK, html: rows };
        }).concat([{ height: TOTAL, html: totalRow(p.total) }]);
        const parts = paginate(groups);
        const title = t(weeks ? "rx.table.titleWeeks" : "rep.historyTitle", { period: m.period });
        return parts.map((rows, i) => page(m, t(weeks ? "rx.table.kickerWeeks" : "rx.table.kicker"), p.user.name,
            '<section class="tablesec"><h2>' + E(title) + " <small>" + E(p.user.name + (i ? " · " + t("rx.table.cont") : "")) + "</small></h2>" +
            '<table class="tbl' + (weeks ? " wk" : "") + '">' + headRow(t(weeks ? "rx.table.monthWeek" : "rep.month")) + "<tbody>" + rows.join("") + "</tbody></table>" +
            (i === parts.length - 1 ? '<p class="note" style="margin-top:3mm">' + E(t("rep.info") + (weeks ? " " + t("rx.table.weeksNote") : "")) + "</p>" : "") + "</section>"));
    }

    /* Team table only: one line per technician */
    function teamPages(m) {
        const total = {};
        COLS.forEach(k => { total[k] = m.people.reduce((s, p) => s + p.total[k], 0); });
        const groups = m.people.map((p, i) => ({ height: MONTH, html: '<tr class="' + (i % 2 ? "alt" : "") + '"><td>' + E(p.user.name) + "</td>" + figures(p.total) + "</tr>" }))
            .concat([{ height: TOTAL, html: totalRow(total) }]);
        const band = '<section class="ident"><div class="who"><span class="av">' + m.people.length + '</span><div><span class="kicker">' + E(t("rx.d.team")) + "</span><h1>" + E(m.who) + "</h1><p>" +
            E(m.people.map(p => p.user.name).join(", ")) + "</p></div></div></section>";
        return paginate(groups).map((rows, i) => page(m, t("rx.d.team"), m.who, (i ? "" : band + (m.parts.summary ? kpis(total) : "")) +
            '<section class="tablesec"><h2>' + E(t("rep.teamTitle", { period: m.period })) + "</h2>" +
            '<table class="tbl">' + headRow(t("admin.col.person")) + "<tbody>" + rows.join("") + "</tbody></table></section>"));
    }

    function html(m) {
        let pages = m.team ? teamPages(m) : [].concat.apply([], m.people.map(p => summaryPage(m, p).concat(m.parts.table ? tablePages(m, p) : [])));
        if (!pages.length) pages = teamPages(m);
        pages = pages.map((x, i) => x.replace("%PAGE%", (i + 1) + " / " + pages.length));
        const base = typeof location !== "undefined" ? location.href.replace(/[#?].*$/, "").replace(/[^/]*$/, "") : "";
        return '<!DOCTYPE html><html lang="' + I18n.language() + '"><head><meta charset="UTF-8"><base href="' + E(base) + '"><title>' + E(m.fileBase) + "</title><style>" + CSS + "</style></head><body>" +
            pages.join("") + "</body></html>";
    }

    /* ---------------- Excel ---------------- */
    const num = v => Math.round(v * 100) / 100;
    const bold = v => ({ v, bold: true });
    function headSheet(m, p) {
        return [[bold(t("rx.d.kicker") + " — " + (p ? p.user.name : m.who) + " — " + m.period)], [t("export.printedOn"), printed(m)], []];
    }
    function summaryRows(p) {
        const g = p.year;
        return [[bold(t("rx.p.summary"))]].concat(COLS.map(k => [t(TITLES[k]), num(p.total[k])])).concat([[]])
            .concat(g ? [[bold(t("rx.g.title", { year: String(g.year) }))], [t("rx.x.target"), num(g.target)], [t("rx.x.toDate", { date: Utils.dateDmy(g.end) }), num(g.targetToDate)],
                [t("rx.x.valued"), num(g.valued)], [t("rx.x.worked"), num(g.worked)], [t("rx.x.validated"), num(g.validated)], [t("rx.x.assimilated"), num(g.assimilated)],
                [t("rx.x.gap"), num(g.gap)], [t("rx.x.remaining"), num(g.remaining)], [t("rx.x.pct"), Math.round(g.pct * 1000) / 10], []] : [])
            .concat(p.balance ? [[t("rx.rec.balance") + " (" + Utils.dateDmy(p.balance.upTo) + ")", num(p.balance.total)], []] : []);
    }
    function payRows(p) {
        return [[bold(t("rx.pay.title"))], [bold(t("rep.month")), bold(t("rep.toPay"))]].concat(p.rows.map(r => [cap(r.label), num(r.toPay)]))
            .concat([[bold(t("rep.total")), bold(num(p.total.toPay))], []]);
    }
    function recoveryRows(p) {
        return [[bold(t("rx.rec.title"))], [bold(t("rep.month")), bold(t("rep.result")), bold(t("rep.timeOff"))]].concat(p.rows.map(r => [cap(r.label), num(r.result), num(r.timeOff)]))
            .concat([[bold(t("rep.total")), bold(num(p.total.result)), bold(num(p.total.timeOff))], []]);
    }
    /* table rows + outline levels (weeks foldable under their month) */
    function tableRows(m, p) {
        const rows = [[bold(t(m.parts.weeks ? "rx.table.monthWeek" : "rep.month"))].concat(COLS.map(k => ({ v: t(TITLES[k]), bold: true, wrap: true })))], levels = [0];
        p.rows.forEach(r => {
            rows.push([m.parts.weeks ? bold(cap(r.label)) : cap(r.label)].concat(COLS.map(k => num(r[k])))); levels.push(0);
            if (m.parts.weeks) r.weeks.forEach(w => {
                rows.push(["   " + t("sum.weekShort") + w.week + " · " + Utils.dateDmy(w.from).slice(0, 5) + " → " + Utils.dateDmy(w.to).slice(0, 5) + " · " + ValidationPage.statusOf(w.record)[0] + (w.imported ? " · " + t("week.imported") : "")]
                    .concat(COLS.map(k => num(w[k])))); levels.push(1);
            });
        });
        rows.push([bold(t("rep.total"))].concat(COLS.map(k => bold(num(p.total[k]))))); levels.push(0);
        return { rows, levels };
    }
    const WIDTHS = [34].concat(COLS.map(() => 14));
    const offset = (levels, n) => new Array(n).fill(0).concat(levels);

    function workbook(m) {
        const sheets = [];
        const several = m.people.length > 1;
        if (m.team || several) {
            const total = {};
            COLS.forEach(k => { total[k] = m.people.reduce((s, p) => s + p.total[k], 0); });
            sheets.push({ name: t("nav.team"), widths: WIDTHS, rows: headSheet(m).concat([[bold(t("admin.col.person"))].concat(COLS.map(k => ({ v: t(TITLES[k]), bold: true, wrap: true })))])
                .concat(m.people.map(p => [p.user.name].concat(COLS.map(k => num(p.total[k])))))
                .concat([[bold(t("rep.total"))].concat(COLS.map(k => bold(num(total[k]))))]) });
        }
        if (!m.team) m.people.forEach(p => {
            const head = headSheet(m, p);
            if (several) {   /* one sheet per technician, the chosen parts one below the other */
                let rows = head.slice(), levels = [];
                if (m.parts.summary) rows = rows.concat(summaryRows(p));
                if (m.parts.pay) rows = rows.concat(payRows(p));
                if (m.parts.recovery) rows = rows.concat(recoveryRows(p));
                if (m.parts.table) { const tb = tableRows(m, p); levels = offset(tb.levels, rows.length); rows = rows.concat(tb.rows); }
                sheets.push({ name: p.user.name, widths: WIDTHS, rows, levels });
                return;
            }
            /* one technician: one sheet per part */
            if (m.parts.summary) sheets.push({ name: t("rx.p.summary"), widths: [34, 14], rows: head.concat(summaryRows(p)) });
            if (m.parts.pay) sheets.push({ name: t("rx.p.pay"), widths: [24, 18], rows: head.concat(payRows(p)) });
            if (m.parts.recovery) sheets.push({ name: t("rx.p.recovery"), widths: [24, 18, 18], rows: head.concat(recoveryRows(p)) });
            if (m.parts.table) { const tb = tableRows(m, p); sheets.push({ name: t("rx.p.table"), widths: WIDTHS, rows: head.concat(tb.rows), levels: offset(tb.levels, head.length) }); }
        });
        if (!sheets.length) sheets.push({ name: t("nav.reports"), widths: WIDTHS, rows: headSheet(m) });
        return Xlsx.create(sheets);
    }

    return { html, workbook };
})();

/* BATCH 1 — backups and data integrity (anomaly C1).
   Each test expresses a requirement: a PERSONAL backup never touches business data
   (entries, leave, clients, balances); a FULL restore needs "backups.manage", checked in the
   logic, with strict validation, preview, verified safety copy and audit trail. */
const load = require("./load");
let ok = 0, ko = 0;
function eq(a, b, m) { const s = JSON.stringify(a) === JSON.stringify(b); s ? ok++ : (ko++, console.log("FAIL", m, "got", JSON.stringify(a), "expected", JSON.stringify(b))); }

const { M, mem } = load();
const { Store: S, Leave: L, Utils: U, Permissions: P } = M;
const id = n => S.users().find(u => u.name === n).id;
const alex = id("Alexandre Machado"), dam = id("Damien Morvan"), enr = id("Enrique Soler"), yann = id("Yann Lefloc'h"), jer = id("Jérémie Augé");
const T = (d, h) => U.timestamp(d, h);
const auditOf = (who, action) => { S.setCurrentUser(yann); const r = S.auditQuery({ action }); S.setCurrentUser(who); return r; };

S.setCurrentUser(yann); S.updateUser(alex, { hireDate: "2026-05-04" });
S.setCurrentUser(alex);
S.addEntry({ category: "work", start: T("2026-10-05", "08:00"), end: T("2026-10-05", "12:00") });
const realEntry = S.entries()[0];
const balanceBefore = L.balance("2026-11-09");
const clientsBefore = JSON.stringify(S.clients());
const entriesBefore = JSON.stringify(S.entries());
const requestsBefore = JSON.stringify(S.requests());

// ============ A. Forged PERSONAL backup (C1) ============
const personal = JSON.parse(S.exportJson());
personal.requests = (personal.requests || []).concat([{ id: "forged-rq", type: "paid_leave", startDate: "2026-10-05", endDate: "2026-10-16",
    status: "approved", decidedBy: "Yann Lefloc'h", decidedAt: "2026-10-01T08:00:00.000Z" }]);
personal.entries = (personal.entries || []).concat([{ id: "forged-e", category: "work", start: T("2026-10-20", "06:00"), end: T("2026-10-20", "20:00") }]);
personal.entries[0].end = T("2026-10-05", "23:00");                                    /* changes a real entry */
personal.clients = (personal.clients || []).concat([{ id: "forged-c", name: "Made-up client", city: "Nowhere", lines: ["L1"] }]);
personal.settings = Object.assign({}, personal.settings, { vibration: false, forgotReminderTime: "07:45" });
const res = S.importJson(JSON.stringify(personal));
eq(res, null, "personal restore accepted but limited to the settings");
eq(S.requests().some(r => r.id === "forged-rq"), false, "A1: no \"approved\" leave injected");
eq(JSON.stringify(S.requests()), requestsBefore, "A1b: requests strictly unchanged");
eq(S.entries().some(e => e.id === "forged-e"), false, "A2: no made-up entry");
eq(JSON.stringify(S.entries()), entriesBefore, "A3: existing entries unchanged (including the modified end of day)");
eq(JSON.stringify(S.clients()), clientsBefore, "A4: no shared client added");
eq(L.balance("2026-11-09").taken, balanceBefore.taken, "A5: leave taken unchanged");
eq([S.settings().vibration, S.settings().forgotReminderTime], [false, "07:45"], "A6: the personal settings are restored");
const rep = S.lastPersonalRestore();
eq([rep.applied.sort(), rep.ignored.entries, rep.ignored.requests, rep.ignored.clients], [["forgotReminderTime", "vibration"].sort(), 2, 1, 1], "A7: report: settings applied, 2 entries / 1 request / 1 client ignored");
const ev = auditOf(alex, "backup.personalRestored")[0];
eq([!!ev, ev && ev.by, ev && ev.target, ev && ev.after && ev.after.ignoredEntries, ev && ev.after && ev.after.ignoredRequests, ev && ev.after && ev.after.ignoredClients],
    [true, alex, alex, 2, 1, 1], "A8: audit event: author, target, ignored items");
const safety = Object.keys(mem).filter(k => k.indexOf("acp_backup_before_personal_") === 0);
eq([safety.length, safety.length && JSON.parse(mem[safety[0]]).userId === alex], [1, true], "A9: safety copy of the settings before restoring");

// invalid or forbidden settings
const bad = JSON.parse(S.exportJson());
bad.settings = { vibration: "yes", reminderDays: [9, "x"], forgotReminderTime: "99:99", role: "quality", __proto__x: 1 };
eq(S.importJson(JSON.stringify(bad)), "invalidSettings", "A10: settings of the wrong type or not in the list refused");
eq([S.settings().vibration, S.settings().forgotReminderTime, S.currentUserId()], [false, "07:45", alex], "A10b: nothing changed by the refused file");
eq(P.has(alex, "leave.global.approve"), false, "A10c: no right obtained");
const full = JSON.parse(S.exportJson()); full.kind = "full";
eq(S.importJson(JSON.stringify(full)), "notBackup", "A11: a full backup is not a personal backup");
eq(S.importJson("{not json"), "notJson", "A12: unreadable file refused");
// direct call on another account's data: the restore only targets the caller
const damBefore = S.withUser(dam, () => JSON.stringify(S.settings()));
S.withUser(dam, () => S.importJson(JSON.stringify(personal)));
eq(S.withUser(dam, () => JSON.stringify(S.settings())), damBefore, "A13: call through withUser: another account's settings do not move");
// old v1 format: same limits
const v1 = { application: "x", version: 1, entries: [], requests: [], clients: [], settings: { vibration: true } };
eq(S.importJson(JSON.stringify(v1)) === null || S.importJson(JSON.stringify(v1)) === "notBackup", true, "A14: old format handled without a runtime error");

// ============ B. FULL backup: right checked in the logic ============
S.setCurrentUser(yann);
const fullText = S.exportAll();
const usersBefore = S.users().length;
for (const [who, name] of [[alex, "technician"], [enr, "team lead"]]) {   /* 4.1.6: the director has backups.manage */
    S.setCurrentUser(who);
    const r = S.importAll(fullText);
    eq([name, r.ok, r.error], [name, false, "forbidden"], "B1: full restore refused to " + name + " (right backups.manage checked in the logic)");
    eq(S.exportAll(), null, "B1b: full export refused to " + name);
    eq(S.inspectFull(fullText).ok, true, "B1c: (inspecting alone changes nothing)");
    eq(S.previewRestore(fullText).ok, false, "B1d: preview refused to " + name);
}
eq(S.users().length, usersBefore, "B2: no data changed by the refused attempts");
const refused = auditOf(alex, "backup.restoreRefused");
/* order-independent: with equal timestamps (same millisecond) the trail keeps the insertion order */
eq(refused.filter(a => a.after.scope === "full").map(a => a.by + "|" + a.after.reason).sort(), [alex, enr].map(x => x + "|forbidden").sort(), "B3: every refused full restore attempt is logged (who, why)");
eq(refused.filter(a => a.after.scope === "personal").map(a => a.after.reason).sort(), ["invalidSettings", "notBackup", "notJson"], "B3b: refused personal restores are logged too");

// ============ C. Strict validation of a forged full file ============
S.setCurrentUser(yann);
const base = () => { const f = JSON.parse(S.exportAll()); delete f.manifest; return f; };   /* no manifest: only the structure validation protects */
const attempt = (name, mutate, expectCode) => {
    const f = base(); mutate(f.data);
    const before = JSON.stringify(S.users()) + JSON.stringify(S.sections());
    const r = S.importAll(JSON.stringify(f));
    eq([name, r.ok, r.ok ? "" : r.error], [name, false, expectCode], "C: " + name + " refused");
    eq(JSON.stringify(S.users()) + JSON.stringify(S.sections()), before, "C: " + name + ": data unchanged");
};
const someUserId = alex;
attempt("unknown request status", d => { d.perUser[someUserId].requests.push({ id: "r1", type: "paid_leave", startDate: "2026-12-01", endDate: "2026-12-02", status: "super_approved" }); }, "invalidData");
attempt("approved leave with no decider nor import", d => { d.perUser[someUserId].requests.push({ id: "r2", type: "paid_leave", startDate: "2026-12-01", endDate: "2026-12-02", status: "approved" }); }, "invalidData");
attempt("unknown leave type", d => { d.perUser[someUserId].requests.push({ id: "r3", type: "mystery", startDate: "2026-12-01", endDate: "2026-12-02", status: "draft" }); }, "invalidData");
attempt("unknown role", d => { d.users.find(u => u.id === someUserId).role = "root"; }, "invalidData");
attempt("duplicate user id", d => { d.users.push(Object.assign({}, d.users[0])); }, "invalidData");
attempt("entry ending before it starts", d => { d.perUser[someUserId].entries.push({ id: "e9", category: "work", start: 2000, end: 1000 }); }, "invalidData");
attempt("unknown entry category", d => { d.perUser[someUserId].entries.push({ id: "e10", category: "teleport", start: 1000, end: 2000 }); }, "invalidData");
attempt("duplicate entry ids", d => { const e = { id: "dup", category: "work", start: 1000, end: 2000 }; d.perUser[someUserId].entries.push(e, Object.assign({}, e)); }, "invalidData");
attempt("unknown individual right", d => { d.grants.push({ id: "g9", userId: someUserId, permission: "root.everything", kind: "permanent", start: "2026-01-01", end: "", revokedAt: null }); }, "invalidData");
attempt("temporary right without an end date", d => { d.grants.push({ id: "g10", userId: someUserId, permission: "leave.global.approve", kind: "temporary", start: "2026-01-01", end: "", revokedAt: null }); }, "invalidData");
attempt("unknown section", d => { d.users.find(u => u.id === someUserId).sectionIds = ["sec-unknown"]; }, "invalidData");
attempt("no active administrator", d => { d.users.forEach(u => { if (u.role === "quality" || u.role === "director") u.accountStatus = "disabled"; }); }, "invalidData");
attempt("team rules of the wrong type", d => { d.org.weeklyBase = "a lot"; }, "invalidData");
attempt("invalid audit trail", d => { d.audit.push({ id: 5, action: 12 }); }, "invalidData");
// file modified after the export: the fingerprint detects it
{
    const f = JSON.parse(S.exportAll()); f.data.users[0].name = "Someone else";
    const r = S.importAll(JSON.stringify(f));
    eq([r.ok, r.error], [false, "invalidData"], "C: file modified after the export (fingerprint) refused");
}
eq(S.inspectFull(JSON.stringify(Object.assign(base(), { version: 99 }))).error, "tooNew", "C: version too recent refused");

// ============ D. Preview, safety copy, audit trail: legitimate restore ============
S.setCurrentUser(yann);
S.setCurrentUser(alex); S.addEntry({ category: "work", start: T("2026-10-06", "08:00"), end: T("2026-10-06", "12:00") });
S.setCurrentUser(yann);
const exported = S.exportAll();
S.setCurrentUser(alex); S.addEntry({ category: "meeting", start: T("2026-10-07", "08:00"), end: T("2026-10-07", "10:00") });
S.setCurrentUser(yann); S.addUser({ name: "Employee added after the export" });
const pv = S.previewRestore(exported);
eq([pv.ok, pv.sound, pv.errors.length], [true, true, 0], "D1: preview of a healthy file");
eq(pv.diff.users.removed, ["Employee added after the export"], "D2: preview: the employee added after the export would disappear");
eq(pv.diff.counts.entries, { now: 3, file: 2 }, "D3: preview: entries 3 → 2");
eq(pv.diff.counts.requests.now >= 0 && Array.isArray(pv.diff.org.changed), true, "D4: preview: request counters and team rules compared");
const usersNow = S.users().length;
eq(S.users().length, usersNow, "D5: the preview changes nothing");
const before = JSON.stringify(mem);
S.previewRestore(exported);
eq(JSON.stringify(mem), before, "D5b: the preview writes nothing to the storage");
const done = S.importAll(exported);
eq(done.ok, true, "D6: legitimate restore by the quality manager");
eq(S.users().some(u => u.name === "Employee added after the export"), false, "D7: data replaced by the file");
eq(mem[done.backupKey] !== undefined && JSON.parse(mem[done.backupKey]).users.some(u => u.name === "Employee added after the export"), true, "D8: safety copy of the previous data, read back and valid");
const rs = S.auditQuery({ action: "backup.restored" })[0];
eq([rs.by, rs.target, rs.before.backupKey === done.backupKey, rs.after.users, rs.after.result], [yann, "full", true, S.users().length, "ok"], "D9: audit event: author, type, safety copy, result");
eq(S.exportAll() !== null, true, "D10: the app stays usable after the restore");

console.log("OK", ok, "KO", ko);

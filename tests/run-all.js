/* Runs every automated test suite of the project and prints a summary.
   Usage (from the project folder):   node tests/run-all.js
   - engine / rights / backups / home work: Node.js only;
   - interface and register suites: need "jsdom" (tests only, never used by
     the app): npm install --prefix tests  (see tests/README.md);
   - register suite: needs the managers' register (personal data, NOT in the
     project): ACP_REGISTER=/path/to/2026_Registres_Heures_1.xlsx */
const { spawnSync } = require("child_process");
const path = require("path");
const SUITES = [
    ["i18n-check.js", "Translations (4 languages)", false],
    ["logic.js", "Hours / leave engine, accounts, migrations", false],
    ["perms.js", "Foundations: permissions, sections, access, audit trail, backups", false],
    ["backup-security.js", "Batch 1: backups, restore, data integrity", false],
    ["admins.js", "Two managers, backups, filterable audit trail", false],
    ["home.js", "Home work (fixed day option)", false],
    ["corrections.js", "Corrections reserved to managers, error reports", false],
    ["leave-circuit.js", "Leave circuit (team lead opinion, final decision)", false],
    ["week-clock.js", "2.9: week validation, undo, night period, urgent call-out, favourites", false],
    ["v3.js", "3.0: hierarchy, leave, register \"OK\", replacements, rules", false],
    ["quick.js", "3.3: quick sign-in (PIN, fingerprint signature check)", false],
    ["targets.js", "4.5: annual target, contracts, worked / assimilated / valued", false],
    ["forgot.js", "4.3: forgotten password (request, hierarchy, reset, contact)", false],
    ["ui.js", "Interface (5 accounts, 4 languages)", true],
    ["register.js", "Managers' register \"OK\": week by week", true]
];
let hasJsdom = true;
try { require.resolve("jsdom", { paths: [__dirname] }); } catch (e) { hasJsdom = false; }
let total = 0, failed = 0;
for (const [file, label, needsDom] of SUITES) {
    if (needsDom && !hasJsdom) { console.log("SKIP  " + label + " — jsdom absent (npm install --prefix tests)"); continue; }
    const r = spawnSync(process.execPath, [path.join(__dirname, file)], { env: Object.assign({}, process.env, { TZ: "Europe/Paris" }), encoding: "utf8" });
    const out = (r.stdout || "") + (r.stderr || "");
    const m = out.match(/OK (\d+) KO (\d+)\s*$/m);
    const ok = m ? +m[1] : 0, ko = m ? +m[2] : 1;
    total += ok; failed += ko;
    console.log((ko ? "FAIL  " : "OK    ") + label + ": " + ok + " check(s)" + (ko ? ", " + ko + " failure(s)" : "") + (out.includes("SKIPPED") ? " (skipped: file missing)" : ""));
    if (ko) console.log(out.split("\n").filter(l => l.startsWith("FAIL") || l.startsWith("EXCEPTION")).slice(0, 10).join("\n"));
}
console.log("\nTotal: " + total + " check(s), " + failed + " failure(s).");
process.exit(failed ? 1 : 0);

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
    ["i18n-check.js", "Traductions (4 langues)", false],
    ["logic.js", "Moteur heures / congés / comptes / migrations", false],
    ["perms.js", "Fondations : permissions, sections, accès, historique, sauvegardes", false],
    ["admins.js", "Deux responsables, sauvegardes, historique filtrable", false],
    ["home.js", "Domicile (journée forfaitaire)", false],
    ["corrections.js", "Corrections réservées aux responsables, signalements", false],
    ["ui.js", "Interface (5 comptes, 4 langues)", true],
    ["register.js", "Import du registre des responsables", true]
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
    console.log((ko ? "FAIL  " : "OK    ") + label + " : " + ok + " vérification(s)" + (ko ? ", " + ko + " échec(s)" : "") + (out.includes("SKIPPED") ? " (ignoré : fichier absent)" : ""));
    if (ko) console.log(out.split("\n").filter(l => l.startsWith("FAIL") || l.startsWith("EXCEPTION")).slice(0, 10).join("\n"));
}
console.log("\nTotal : " + total + " vérification(s), " + failed + " échec(s).");
process.exit(failed ? 1 : 0);

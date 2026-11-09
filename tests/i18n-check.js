const fs=require("fs"),vm=require("vm"),glob=require("path");
const dir=require("path").join(__dirname,"..")+"/";let ok=0,ko=0;const fail=m=>{ko++;console.log("FAIL",m)};
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(dir+"js/translations.js","utf8")+";this.T=TRANSLATIONS",ctx);
const T=ctx.T;
// 1) every entry: 4 non-empty texts, same placeholders
for(const [k,v] of Object.entries(T)){
  if(!Array.isArray(v)||v.length!==4||v.some(x=>typeof x!=="string"||!x.trim())){fail("entry "+k);continue;}
  const ph=s=>(s.match(/\{[a-z]+\}/gi)||[]).sort().join();
  if(new Set(v.map(ph)).size!==1) fail("placeholders differ "+k+" "+v.map(ph).join(" | ")); else ok++;
}
// 2) every key used in code exists
const files=fs.readdirSync(dir+"js").filter(f=>f.endsWith(".js")&&f!=="translations.js").map(f=>dir+"js/"+f).concat([dir+"index.html"]);
const used=new Set();const auditActs=new Set();
for(const f of files){const s=fs.readFileSync(f,"utf8");
  const idFile=/(store|permissions)\.js$/.test(f);   /* identifiers (permissions, audit actions) live here: only t("…") calls are keys */
  const re=idFile?/[^a-zA-Z]t\(["']([a-z]+(?:\.[a-zA-Z0-9]+)+)["']/g:/["']([a-z]+(?:\.[a-zA-Z0-9]+)+)["']/g;
  for(const m of s.matchAll(/Store\.log\("([a-z]+\.[A-Za-z]+)"/g)){auditActs.add(m[1]);}
  for(const m of s.matchAll(re)){const k=m[1];if(auditActs.has(k)) continue;
    if(["index.html","manifest.json","sw.js","styles.xml","workbook.xml"].includes(k)||/\.(js|json|css|png|xml|rels)$/.test(k)||k.startsWith("xl.")) continue;
    used.add(k);} }
["work","travel","meeting","break","lunch","other","home"].forEach(c=>used.add("cat."+c));
// dynamic key families (built with "prefix." + code in the code): every code needs its translation
const DYN={"acc.status.":["pending","info_requested","approved","rejected","expired","revoked"],"acc.decision.":["approved","rejected","info_requested"],
 "acc.err.":["forbidden","unknownPermission","reasonRequired","alreadyGranted","badDates","notFound","ownRequest","notPending","badDecision","commentRequired","grantFailed"],
 "acc.kind.":["temporary","permanent"],"audit.family.":["session","user","permission","access","leave","timesheet","setting","section","backup","data"],
 "bk.err.":["notJson","notFull","tooNew","backupFailed","forbidden"],"bk.count.":["users","entries","requests","clients","audit","grants"],
 "home.err.":["forbidden","already","conflict"],
 "correct.err.":["forbidden","reasonRequired","badTimes","badLunch","lunchOutside","notFound"],
 "report.err.":["forbidden","textRequired","badDate","notOpen","commentRequired","badStatus"],"report.status.":["open","done","rejected"],
 "field.":["category","lunch","date","hours","permission","kind","start","end","role","accountStatus","sectionIds","allSections","clockRequired","jobTitle","name","hireDate","status","version","detail","count","anomalies","backupKey","users"],
 "notif.":["timesheet.corrected","timesheet.correctionRequested","timesheet.correction.done","timesheet.correction.rejected","permission.granted","permission.revoked","access.requested","access.approved","access.rejected","access.info_requested"]};
Object.keys(DYN).forEach(p=>DYN[p].forEach(c=>used.add(p+c)));
// every permission and every audit action is shown in the app: it needs a label
{const P=fs.readFileSync(dir+"js/permissions.js","utf8");const all=P.match(/const ALL = \[([\s\S]*?)\];/)[1].match(/"([^"]+)"/g).map(x=>x.slice(1,-1));
 all.forEach(p=>{used.delete(p);used.add("perm."+p);});
 const S=fs.readFileSync(dir+"js/store.js","utf8");const acts=new Set([...S.matchAll(/log\("([a-z.]+[A-Za-z]*)"/g)].map(m=>m[1]).concat([...S.matchAll(/action: "([a-z.]+[A-Za-z]*)"/g)].map(m=>m[1]))
   .concat([...S.matchAll(/log\([^;]*?\? "([a-z]+\.[A-Za-z]+)" : [^;]*?"([a-z]+\.[A-Za-z]+)" : "([a-z]+\.[A-Za-z]+)"/g)].flatMap(m=>[m[1],m[2],m[3]])));
 auditActs.forEach(a=>acts.add(a));["export.done","import.done"].forEach(a=>acts.add(a));
 acts.forEach(a=>{used.delete(a);used.add("audit."+a);});
 ["technician","team_lead","admin"].forEach(r=>used.add("role."+r));}
["notJson","notBackup"].forEach(c=>used.add("settings.restore."+c));
for(const k of used){ if(!T[k]) fail("missing key "+k); else ok++; }
// 3) unused keys
for(const k of Object.keys(T)) if(!used.has(k)) fail("unused key "+k);
// 4) no French left in code (identifiers/comments) — heuristic on accented chars outside translations
for(const f of files){const s=fs.readFileSync(f,"utf8");const lines=s.split("\n");
  lines.forEach((l,i)=>{ if(/[éèêàçùôî]/.test(l) && !f.endsWith("index.html") && !/const NAMES = /.test(l) && !/\{ name: "[^"]+", (role|jobTitle): /.test(l)) fail("accent in code "+f.split("/").pop()+":"+(i+1)+" "+l.trim().slice(0,80)); });}
console.log("OK",ok,"KO",ko);

/* Precision 1: the two managers have the same rights and can manage each other,
   the "last active administrator" safeguard must not block them unduly. */
const load=require("./load");let ok=0,ko=0;
function eq(a,b,m){const s=JSON.stringify(a)===JSON.stringify(b);s?ok++:(ko++,console.log("FAIL",m,"got",JSON.stringify(a),"expected",JSON.stringify(b)));}
const {M}=load();const {Store:S,Permissions:P,Auth:A}=M;
const id=n=>S.users().find(u=>u.name===n).id;const yann=id("Yann Lefloc'h"),jer=id("Jérémie Augé"),enr=id("Enrique Soler");
eq(JSON.stringify(P.effective(yann).map(x=>x.permission).sort())===JSON.stringify(P.effective(jer).map(x=>x.permission).sort()),true,"identical rights");
eq([S.user(yann).jobTitle,S.user(jer).jobTitle,S.user(yann).role,S.user(jer).role],["Responsable Qualité","Responsable Commercial France & PDG","admin","admin"],"same role, distinct job titles");
// each manages the other: job title, grants, password reset, status
for(const [me,other] of [[yann,jer],[jer,yann]]){
  S.setCurrentUser(me);
  eq(S.updateUser(other,{jobTitle:S.user(other).jobTitle+" "}),true,"edit the other's account");
  S.updateUser(other,{jobTitle:S.user(other).jobTitle.trim()});
  const g=S.grant({userId:other,permission:"clock.own",kind:"temporary",start:"2026-11-05",end:"2026-11-30",reason:"test"});
  eq(!!g,true,"grant a right to the other");eq(S.revokeGrant(g.id,"fin"),true,"revoke the other's right");
  S.updateUser(other,{pinHash:"x"});eq(A.resetPassword(other),true,"reset the other's password");
  eq(S.updateUser(other,{accountStatus:"disabled"}),true,"disable the other (one admin stays active)");
  eq(S.updateUser(other,{accountStatus:"active"}),true,"re-enable the other");
}
// no undue blocking: with Jérémie disabled, Yann still manages everything else
S.setCurrentUser(yann);S.updateUser(jer,{accountStatus:"disabled"});
eq(S.updateUser(enr,{jobTitle:"Chef d'équipe"}),true,"Yann alone still manages the other accounts");
eq(S.updateOrg({weeklyBase:39}),true,"and the settings");
eq(S.updateUser(jer,{role:"technician"}),true,"he may even change the disabled admin's role");
S.updateUser(jer,{role:"admin",accountStatus:"active"});
// what IS refused, on purpose
eq(S.updateUser(yann,{accountStatus:"disabled"}),false,"nobody disables themselves");
S.setCurrentUser(jer);S.updateUser(yann,{accountStatus:"disabled"});
eq(S.updateUser(jer,{role:"technician"}),false,"no self-demotion");
S.setCurrentUser("");eq(S.updateUser(jer,{accountStatus:"disabled"}),false,"never zero active administrator (system check)");
S.setCurrentUser(jer);S.updateUser(yann,{accountStatus:"active"});
eq([P.has(yann,"users.manage"),P.has(jer,"users.manage")],[true,true],"both active admins again");
// (totals printed by the second part)
// ---- precision 3: restore test on a copy, storage use, safety copies; precision 4: audit query
(async()=>{let ok2=0,ko2=0;const eq2=(a,b,m)=>{const s=JSON.stringify(a)===JSON.stringify(b);s?ok2++:(ko2++,console.log("FAIL",m,"got",JSON.stringify(a),"expected",JSON.stringify(b)));};
const {M,mem}=load();const {Store:S,Auth:A}=M;const id=n=>S.users().find(u=>u.name===n).id;const yann=id("Yann Lefloc'h"),alex=id("Alexandre Machado");
await A.setPassword(yann,"123456");S.addUser({name:"Test Restore"});
const full=S.exportAll();const before=JSON.stringify(mem);
const t=S.testRestore(full);
eq2([t.ok,t.sound,t.lost,t.restored.users],[true,true,[],6],"restore test: sound, nothing lost");
eq2(JSON.stringify(mem)===before,true,"restore test wrote NOTHING (original data untouched)");
const broken=JSON.parse(full);broken.data.perUser={};
const t2=S.testRestore(JSON.stringify(broken));eq2([t2.ok,t2.sound,t2.anomalies.length>0],[true,false,true],"a damaged backup is detected before restoring");
eq2(S.testRestore("not json").error,"notJson","unreadable file refused");
const u=S.storageUsage();eq2(u.bytes>0&&u.quotaEstimate===5242880&&u.ratio<1,true,"storage use measured");
// audit query: by user, period, action, text
S.updateOrg({weeklyBase:39.5});S.updateOrg({weeklyBase:39});
const all=S.auditQuery({});
eq2(S.auditQuery({action:"setting.changed"}).length,2,"filter by action");
eq2(S.auditQuery({action:"session."}).every(a=>a.action.startsWith("session.")),true,"filter by action family");
eq2(S.auditQuery({userId:yann}).length>0&&S.auditQuery({userId:yann}).every(a=>a.by===yann||a.target===yann),true,"filter by user");
eq2(S.auditQuery({from:"2099-01-01"}).length,0,"filter by period");
eq2(S.auditQuery({text:"39.5"}).length,2,"search in old/new values");
eq2(all.some(a=>a.action==="session.signIn"&&a.by===yann),true,"sign-in traced");
S.setCurrentUser(alex);eq2(S.auditQuery({}),[],"no audit for a technician (audit.view)");
S.setCurrentUser(yann);const bk=S.localBackups();eq2(Array.isArray(bk),true,"safety copies listed");
console.log("OK",ok+ok2,"KO",ko+ko2);})();

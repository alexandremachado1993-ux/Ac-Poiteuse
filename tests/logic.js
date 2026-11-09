const load=require("./load");let ok=0,ko=0;
function eq(a,b,m){const s=JSON.stringify(a)===JSON.stringify(b);s?ok++:(ko++,console.log("FAIL",m,"got",a,"expected",b));}
/* approved leave through the REAL circuit: the employee asks, a manager decides
   (addRequest no longer accepts a status from the caller, 06/11/2026) */
const approved=(St,f)=>{const me=St.currentUserId();const g=Object.assign({},f);delete g.status;const r=St.addRequest(g);
  const adm=St.users().find(u=>u.role==="admin"&&u.id!==me).id;St.setCurrentUser(adm);St.decideRequest(me,r.id,"approved",adm);St.setCurrentUser(me);return r;};
const near=(a,b,m)=>eq(Math.round(a*1000)/1000,Math.round(b*1000)/1000,m);
(async()=>{
const {M}=load();const {Utils:O,Store:S,Segments:G,Hours:C,Leave:CG,Auth:A}=M;
const t=(iso,h)=>O.timestamp(iso,h);
// ---- accounts seeded
const names=S.users().map(u=>[u.name,u.role]);
eq(names,[["Alexandre Machado","technician"],["Damien Morvan","technician"],["Enrique Soler","team_lead"],["Jérémie Augé","admin"],["Yann Lefloc'h","admin"]],"5 reference accounts (2.8): technicians, team lead, admins");
eq(S.users().every(u=>!u.pinHash),true,"no password yet");
const alex=S.users()[0].id;
// ---- nobody signed in: no data written
eq(S.entries().length,0,"no current user: empty");
await A.setPassword(alex,"123456");eq(S.currentUserId(),alex,"signed in after first password");
// ---- pieces / night (unchanged)
near(G.nightWithinDay(t("2026-11-02","20:00"),t("2026-11-02","23:00"))/36e5,2,"night 20-23");
const mc=G.pieces(t("2026-10-10","22:00"),t("2026-10-11","02:00"));eq(mc.map(m=>m.day),["2026-10-10","2026-10-11"],"split midnight");
const dst=G.pieces(t("2026-10-25","00:00"),t("2026-10-25","06:00"));near((dst[0].end-dst[0].start)/36e5,7,"DST real duration");
// ---- week 41 (05→11/10/2026): Mon-Fri 9 h (1 travel + 8 work), lunch & break not counted, Sunday 3 h with night
["2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09"].forEach(d=>{
 S.addEntry({category:"travel",start:t(d,"07:00"),end:t(d,"08:00")});
 S.addEntry({category:"work",start:t(d,"08:00"),end:t(d,"12:00")});
 S.addEntry({category:"lunch",start:t(d,"12:00"),end:t(d,"13:00")});
 S.addEntry({category:"work",start:t(d,"13:00"),end:t(d,"17:00")});
 S.addEntry({category:"break",start:t(d,"17:00"),end:t(d,"17:15")});
});
S.addEntry({category:"work",start:t("2026-10-11","20:00"),end:t("2026-10-11","23:00")});
const f=G.weekSheet(2026,41,S.entries(),S.settings(),Date.now());
const s=C.weekSummary(f);
near(s.worked,48,"week Mon→Sun: 45 + 3 Sunday = 48");near(s.base,39,"base 39");near(s.toRecover,9,"countdown result +9 h");
near(s.counters.sunday,3,"Sunday counter 3 h (included in the week)");near(s.counters.night,2,"night 2 h");eq(s.complete,true,"week 41 complete");
near(s.counters.lunch,5,"lunch deducted 5 h, shown");near(s.counters.breaks,1.25,"breaks not counted 1.25 h, shown");near(s.counters.clocked,54.25,"clocked 54.25 = 48 + 5 + 1.25");
eq([s.overtime.h25,s.overtime.h50],[4,5],"48 h: hours 40-43 at 25 %, 44-48 at 50 %");
near(s.premiumNight,0.5,"Sunday night now gets the night premium (2 h × 25 %)");near(s.premiumHoliday,0,"no holiday");
// countdown: Monday 10 h → −29 h
const mon=G.weekSheet(2026,41,[{category:"work",start:t("2026-10-05","08:00"),end:t("2026-10-05","18:00")}],S.settings());
near(C.weekSummary(mon).toRecover,-29,"−39 + 10 = −29 h still to work");
// reduced base: holiday week, 39 h worked → 3.8 h below the 36th (no counter) + 4 h at 25 %
const ot=C.overtime(39,31.2);near(ot.h25,0,"holiday week, 39 h: hours 36-39 covered by the contract, no 25 %");near(ot.h50,0,"no 50 %");
near(C.overtime(41,31.2).h25,2,"holiday week 41 h: hours 40-41 at 25 %");
near(C.overtime(30,23.4).h25,0,"under the 36th: no overtime counter");
// ---- holiday on Tuesday 14/07 (week 29) and on Saturday 15/08 (week 33): base reduced Mon→Sat
const D=39/7;near(C.weekBase(2026,29,null),39-D,"holiday Tuesday credited 39÷7");near(C.weekBase(2026,33,null),39-D,"holiday Saturday 15/08 credited (weekend rule)");
S.addEntry({category:"work",start:t("2026-07-14","08:00"),end:t("2026-07-14","10:00")});
const s29=C.weekSummary(G.weekSheet(2026,29,S.entries(),S.settings()));
near(s29.counters.holidayWorked,2,"holiday worked counter");near(s29.premiums,1,"holiday 2 h × 50 % = 1 h");
// ---- approved leave (Mon-Tue week 42) not worked: base 23.4; 25 h worked
["2026-10-14","2026-10-15","2026-10-16"].forEach(d=>S.addEntry({category:"work",start:t(d,"08:00"),end:t(d,"16:20")}));
approved(S,{type:"paid_leave",startDate:"2026-10-12",endDate:"2026-10-13",status:"approved"});
const s42=C.weekSummary(G.weekSheet(2026,42,S.entries(),S.settings()));
near(s42.credits.leave,2*D,"2 leave days credited 2 × 5 h 34");near(s42.goal,39,"goal fixed 39 h");near(s42.done,25+2*D,"done = 25 + 11.14");near(s42.toRecover,25+2*D-39,"result −2.86 (39÷7 chosen)");
// pending leave does not reduce the base
S.addRequest({type:"paid_leave",startDate:"2026-10-19",endDate:"2026-10-19"});
near(C.weekBase(2026,43,null),39,"pending leave does not reduce");
// ---- 2.5: a full week of leave Monday→Sunday = exactly the goal; weekend leave days credited
{const {M:M6}=load();const S6=M6.Store,C6=M6.Hours,G6=M6.Segments;S6.setCurrentUser(S6.users()[0].id);
 approved(S6,{type:"paid_leave",startDate:"2026-09-28",endDate:"2026-10-04",status:"approved"});
 const w=C6.weekSummary(G6.weekSheet(2026,40,S6.entries(),S6.settings()));
 near(w.credits.leave,39,"7 days × 39÷7 = 39 h");near(w.toRecover,0,"full week off: result 0");}
// ---- 2.6: "other" absence has no effect on any calculation
{const {M:M7}=load();const S7=M7.Store,C7=M7.Hours,G7=M7.Segments,L7=M7.Leave;S7.setCurrentUser(S7.users()[0].id);
 S7.updateProfile({hireDate:"2026-05-04"});
 approved(S7,{type:"other",startDate:"2026-10-05",endDate:"2026-10-09",status:"approved"});
 const w=C7.weekSummary(G7.weekSheet(2026,41,S7.entries(),S7.settings()));
 near(w.credits.total,0,"other absence not credited");near(C7.timeOffTaken({year:2026}),0,"other absence not taken from time off");
 const lb=L7.balance("2026-11-02");eq([lb.taken,lb.pending],[0,0],"other absence not in the paid-leave balance");
 eq(S7.updateUser(S7.users()[0].id,{jobTitle:"X"}),false,"a technician cannot change account data (users.manage checked in the store)");
 S7.setCurrentUser(S7.users().find(u=>u.role==="admin").id);
 eq(S7.updateUser(S7.users()[0].id,{jobTitle:"Technicien sertisseur"})&&S7.user(S7.users()[0].id).jobTitle,"Technicien sertisseur","an admin can");}
// ---- time off: worked day not counted as taken
approved(S,{type:"time_off",startDate:"2026-10-07",endDate:"2026-10-07",status:"approved"});
near(C.timeOffTaken({year:2026}),0,"worked time-off day not taken");
approved(S,{type:"time_off",startDate:"2026-10-20",endDate:"2026-10-20",status:"approved"});
// security (06/11/2026): a caller can no longer create an already-approved request
eq(S.addRequest({type:"paid_leave",startDate:"2026-12-01",endDate:"2026-12-01",status:"approved"}).status,"pending","status chosen by the caller is ignored: always pending");
eq(S.addApprovedRequest({type:"time_off",startDate:"2026-12-02",endDate:"2026-12-02"}),null,"approved history refused to a technician");
S.requests().filter(r=>r.startDate==="2026-12-01").forEach(r=>S.deleteRequest(r.id));
near(C.timeOffTaken({year:2026}),D,"not worked time-off day taken = 39÷7");
// ---- balance: completed weeks only (29: 2−31.2 ; 41: +6 ; 42: +1.6 ; 43 empty→ignored) − 7.8 taken
S.addEntry({category:"work",start:Date.now()-3600e3,end:Date.now()-1800e3});   // current week, not counted
const rb=C.recoveryBalance();
const bank=(2+D-39)+9+(25+2*D-39);near(rb.bank,bank,"bank of completed weeks");near(rb.taken,D,"taken");near(rb.balance,bank-D,"balance");
near(rb.counters.sunday,3,"Sunday counter");
near(rb.premiumHoliday,1,"holiday 14/07 2 h × 50 %");near(rb.premiumNight,0.5,"night 2 h × 25 %");near(rb.total,rb.balance+1.5,"total = balance + premiums (like AB2)");
eq([rb.counters.h25,rb.counters.h50],[4,5],"overtime counters over completed weeks");eq(!!rb.current,true,"current week shown separately");
// ---- leave balance
S.updateProfile({hireDate:"2026-05-04"});
const lb=CG.balance("2026-11-02");near(lb.earned,5*2.5,"earned: 5 full months × 2.5 days (ouvrables, 2.8)");eq([lb.taken,lb.pending],[2,1],"leave taken / pending");
// ---- admin decisions
const yann=S.users().find(u=>u.name==="Yann Lefloc'h").id;const jer=S.users().find(u=>u.name==="Jérémie Augé").id;
const pend=S.requests().find(r=>r.status==="pending");
eq(S.decideRequest(alex,pend.id,"approved",alex),false,"technician cannot decide");
eq(S.decideRequest(alex,pend.id,"approved",yann),true,"admin approves");
eq([S.requests().find(r=>r.id===pend.id).status,S.requests().find(r=>r.id===pend.id).decidedBy],["approved","Yann Lefloc'h"],"status + decider");
eq(S.decideRequest(alex,pend.id,"rejected",jer),false,"already decided");
near(C.weekBase(2026,43,null),39-2*D,"approved leave 19/10 + time off 20/10 credited");
// admin cannot decide own request
S.setCurrentUser(yann);const own=S.addRequest({type:"paid_leave",startDate:"2026-12-01",endDate:"2026-12-01"});
eq(S.decideRequest(yann,own.id,"approved",yann),false,"no self-approval");eq(S.decideRequest(yann,own.id,"approved",jer),true,"other admin approves");
eq(S.entries().length,0,"accounts are separate (Yann has no entries)");
eq(S.allRequests().length,5,"allRequests across accounts (4 Alexandre + 1 Yann)");
// withUser reads another account without switching
eq(S.withUser(alex,()=>S.entries().length)>0 && S.currentUserId()===yann,true,"withUser");
// addUser / duplicate
eq(S.addUser({name:"damien  morvan"}),null,"duplicate name refused");eq(S.addUser({name:"Nouveau Tech",role:"technician"}).role,"technician","new account");
S.setCurrentUser(alex);
// ---- team rules (admin configuration)
S.setCurrentUser(alex);eq(S.updateOrg({weeklyBase:35}),false,"technician cannot change the rules");
S.setCurrentUser(jer);eq(S.updateOrg({weeklyBase:35,nightStart:22}),true,"admin changes the rules");
S.setCurrentUser(alex);near(C.weekSummary(G.weekSheet(2026,41,S.entries(),S.settings())).toRecover,13,"base 35 → +13 h");
near(C.weekSummary(G.weekSheet(2026,41,S.entries(),S.settings())).counters.night,1,"night from 22:00 → 1 h");
S.setCurrentUser(jer);S.updateOrg(Object.assign({},S.DEFAULT_ORG));S.setCurrentUser(alex);
near(C.weekSummary(G.weekSheet(2026,41,S.entries(),S.settings())).toRecover,9,"defaults restored");
eq(S.settings().countShortBreaks,false,"team rule visible in settings()");
S.setCurrentUser(jer);S.updateOrg({countShortBreaks:true});S.setCurrentUser(alex);
near(G.weekSheet(2026,41,S.entries(),S.settings()).days.monday.hours,9.25,"breaks counted by team rule");
S.setCurrentUser(jer);S.updateOrg({countShortBreaks:false});S.setCurrentUser(alex);
S.updateSettings({countShortBreaks:true});eq(S.settings().countShortBreaks,false,"technician cannot change a team rule via updateSettings");
// ---- backup round trip (current account) and v1 backup
const js=S.exportJson();eq(JSON.parse(js).account.pinHash,undefined,"no password in backup");
const n=S.entries().length;eq(S.importJson(js),null,"restore");eq(S.entries().length,n,"restored entries");
// ---- clients shared
eq(S.addClient({name:"Usine",city:"Sète"}),null,"technician cannot create a shared client (06/11/2026)");
S.setCurrentUser(yann);const cl=S.addClient({name:"Usine",city:"Sète"});S.setCurrentUser(alex);eq(S.clients().length,1,"clients shared (created by a manager)");
eq([S.updateClient(cl.id,{name:"X",city:"",lines:[]}),S.deleteClient(cl.id),S.clients().length],[false,false,1],"technician cannot change or delete it");
{ // MIGRATION v2 → v3 (profile + data + password kept)
const v2={profile:{id:"pr-1",name:"Alexandre",hireDate:"2026-05-04",pinHash:"abc",language:"es"},settings:{countShortBreaks:true,premiumInRecovery:false},
 clients:[{id:"cl-1",name:"Usine",city:"",lines:[]}],entries:[{id:"e1",category:"work",start:1,end:2}],requests:[{id:"r1",type:"time_off",startDate:"2026-01-02",endDate:"2026-01-02",status:"approved"}]};
const {M:M3,mem}=load({acp_data_v2:JSON.stringify(v2)});const S3=M3.Store;S3.load();
const u=S3.users().find(x=>x.id==="pr-1");eq([u.name,u.pinHash,u.language,u.role,u.sectionIds,u.clockRequired],["Alexandre Machado","abc","es","technician",["sec-sud"],true],"v2 profile kept, mapped to the reference account (2.8)");
eq(S3.users().length,5,"Alexandre not duplicated by the seed (4 others added)");
S3.setCurrentUser("pr-1");eq([S3.entries().length,S3.requests().length,S3.clients().length],[1,1,1],"v2 data kept");
eq([S3.settings().countShortBreaks,"premiumInRecovery" in S3.settings()],[true,false],"settings kept, premium setting removed");
eq(!!mem.acp_data_v2&&!!mem.acp_data_v4,true,"old key kept intact, new key v4 saved");
const bk=Object.keys(mem).find(k=>k.startsWith("acp_backup_before_v4_"));eq(!!bk&&mem[bk]===mem.acp_data_v2,true,"verified backup identical to the original before migrating");
eq(S3.migrationReport().backupVerified,true,"migration report: backup verified");
eq(S3.auditTrail().some(a=>a.action==="user.migrated"&&a.before.name==="Alexandre"&&a.after.name==="Alexandre Machado"),true,"renaming traced in the audit (before/after)");
}
{ // MIGRATION v1 → v3
const v1={profil:{nom:"Alexandre",dateEmbauche:"2026-05-04"},pointages:[{id:"p1",categorie:"pause_dejeuner",debut:1,fin:2}],demandes:[{id:"d1",type:"heure_recuperer",dateDebut:"2026-01-02",dateFin:"2026-01-02",statut:"acceptee"}],clients:[]};
const {M:M4}=load({acp_donnees_v1:JSON.stringify(v1)});const S4=M4.Store;S4.load();
const u=S4.users().find(x=>x.name==="Alexandre Machado");S4.setCurrentUser(u.id);
eq([S4.entries()[0].category,S4.requests()[0].type,S4.requests()[0].status],["lunch","time_off","approved"],"v1 converted");
}
{ // AUTH
const {M:M5}=load();const A5=M5.Auth,S5=M5.Store;const d=S5.users()[1].id;
eq(A5.checkNewPassword("12345","12345"),"auth.tooShort","too short");
eq(await A5.signIn(d,"123456"),false,"no password yet: cannot sign in");
eq(await A5.setPassword(d,"123456"),true,"first password");eq(await A5.setPassword(d,"999999"),false,"cannot overwrite an existing password");
eq(S5.user(d).pinHash,"8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92","sha256 hex like CONGER PAYER");
A5.signOut();eq(await A5.signIn(d,"000000"),false,"wrong");eq(await A5.signIn(d,"123456"),true,"sign in");
eq(A5.resetPassword(S5.users()[0].id),false,"technician cannot reset");
const adm=S5.users().find(x=>x.role==="admin").id;A5.signOut();await A5.setPassword(adm,"111111");
eq(A5.isAdmin(),true,"admin");eq(A5.resetPassword(d),true,"admin resets");eq(A5.hasPassword(d),false,"password cleared");
eq(await A5.changePassword("bad","222222"),"wrongCurrent","change wrong");eq(await A5.changePassword("111111","222222"),"ok","change ok");
S5.updateUser(d,{active:false});eq(await A5.setPassword(d,"333333"),false,"deactivated account cannot even set a password");
S5.updateUser(d,{active:true});eq(await A5.setPassword(d,"333333"),true,"reactivated: can choose a password and sign in");
}
console.log("OK",ok,"KO",ko);})();

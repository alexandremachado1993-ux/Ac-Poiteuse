/* Home work day (information of 05/11/2026): 7 h max, 35 h basis, home + lunch only, recorded directly */
const load=require("./load");let ok=0,ko=0;
function eq(a,b,m){const s=JSON.stringify(a)===JSON.stringify(b);s?ok++:(ko++,console.log("FAIL",m,"got",JSON.stringify(a),"expected",JSON.stringify(b)));}
const near=(a,b,m)=>eq(Math.round(a*1000)/1000,Math.round(b*1000)/1000,m);
const {M}=load();const {Store:S,Hours:H,Segments:G,Utils:U}=M;
const id=n=>S.users().find(u=>u.name===n).id;const alex=id("Alexandre Machado"),yann=id("Yann Lefloc'h"),enr=id("Enrique Soler");
const sheet=(y,w)=>G.weekSheet(y,w,S.entries(),S.settings());
// rights: only accounts that clock
S.setCurrentUser(yann);eq(S.declareHomeDay("2026-10-12"),"forbidden","manager without clocking right: refused");
S.setCurrentUser(enr);eq(S.declareHomeDay("2026-10-12"),"forbidden","team lead without clocking right: refused");
// one tap = home 08:00-12:00 + lunch 12:00-13:00 + home 13:00-16:00
S.setCurrentUser(alex);const c=S.declareHomeDay("2026-10-12");
eq(c.map(e=>[e.category,U.clock(e.start),U.clock(e.end)]),[["home","08:00","12:00"],["lunch","12:00","13:00"],["home","13:00","16:00"]],"day = home work + lunch");
const d=G.day("2026-10-12",S.entries(),S.settings());near(d.totalMs/36e5,7,"counted 7 h (lunch not paid)");near(d.homeMs/36e5,7,"home 7 h");
eq(S.declareHomeDay("2026-10-12"),"already","only one home day per date");
S.addEntry({category:"work",start:U.timestamp("2026-10-13","08:00"),end:U.timestamp("2026-10-13","10:00")});
eq(S.declareHomeDay("2026-10-13"),"conflict","refused when the day already has other entries");
eq(S.auditTrail().some(a=>a.action==="timesheet.homeDeclared"&&a.after.date==="2026-10-12"&&a.after.hours===7),true,"declaration traced");
// 7 h MAXIMUM, no night
const h1=S.entries().find(e=>e.category==="home"&&U.clock(e.start)==="08:00");
/* the day made longer by a MANAGER (technicians can no longer correct, 06/11/2026) */
eq(S.updateEntry(h1.id,{start:U.timestamp("2026-10-12","05:00")},true),null,"technician cannot lengthen the day");
S.setCurrentUser(yann);eq(!!S.withUser(alex,()=>S.updateEntry(h1.id,{start:U.timestamp("2026-10-12","05:00")},true,"test")),true,"manager lengthens it by 3 h (1 at night)");
const d2=S.withUser(alex,()=>G.day("2026-10-12",S.entries(),S.settings()));
eq(S.withUser(alex,()=>U.clock(S.entry(h1.id).start)),"05:00","the change is really applied");
near(d2.totalMs/36e5,7,"capped at 7 h even if longer");eq(d2.nightMs,0,"no night hours on a home day");
S.withUser(alex,()=>S.updateEntry(h1.id,{start:U.timestamp("2026-10-12","08:00")},true,"test"));S.setCurrentUser(alex);
// a full week at home, week 43 (19→23/10, no public holiday; week 44 holds the 1st of November, credited separately)
S.setCurrentUser(alex);["2026-10-19","2026-10-20","2026-10-21","2026-10-22","2026-10-23"].forEach(x=>S.declareHomeDay(x));
const w44=H.weekSummary(sheet(2026,43));
eq([w44.homeDays,w44.contractGoal],[5,39],"5 home days, contract still 39 h");
near(w44.goal,35,"goal on the 35 h basis");near(w44.worked,35,"worked 35 h");near(w44.toRecover,0,"result 0: no deficit, no overtime");
near(w44.habitualEarned,0,"no habitual +25 % hours earned");eq([w44.overtime.h25,w44.overtime.h50],[0,0],"no overtime from home work");
// mixed week: 4 intervention days of 9 h + 1 home day (week 41: 05→09/10)
["2026-10-05","2026-10-06","2026-10-07","2026-10-08"].forEach(x=>S.addEntry({category:"work",start:U.timestamp(x,"08:00"),end:U.timestamp(x,"17:00")}));
S.declareHomeDay("2026-10-09");
const w41=H.weekSummary(sheet(2026,41));
near(w41.worked,43,"36 h of intervention + 7 h at home");near(w41.goal,38.2,"goal 39 − 0 h 48");near(w41.toRecover,4.8,"result +4 h 48");
near(w41.habitualEarned,3.2,"habitual +25 % earned: 4 − 0 h 48");
console.log("   mixed week overtime counters:",JSON.stringify(w41.overtime));
// setting off: home day on the 39 h basis
S.setCurrentUser(yann);S.updateOrg({homeReducesHabitual:false});S.setCurrentUser(alex);
near(H.weekSummary(sheet(2026,43)).goal,39,"rule configurable: goal back to 39 h when switched off");
S.setCurrentUser(yann);S.updateOrg({homeWorkHours:6});S.setCurrentUser(alex);
near(G.day("2026-10-12",S.entries(),S.settings()).totalMs/36e5,6,"value configurable (6 h)");
console.log("OK",ok,"KO",ko);

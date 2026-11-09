/* Corrections reserved to managers + error reports (request of 06/11/2026) */
const load=require("./load");let ok=0,ko=0;
function eq(a,b,m){const s=JSON.stringify(a)===JSON.stringify(b);s?ok++:(ko++,console.log("FAIL",m,"got",JSON.stringify(a),"expected",JSON.stringify(b)));}
const {M}=load();const {Store:S,Utils:U,Segments:G,Permissions:P}=M;
const id=n=>S.users().find(u=>u.name===n).id;const alex=id("Alexandre Machado"),yann=id("Yann Lefloc'h"),enr=id("Enrique Soler"),dam=id("Damien Morvan");
const T=(d,h)=>U.timestamp(d,h);
// ---- technician: live clocking OK, corrections refused IN THE LOGIC
S.setCurrentUser(alex);
const live=S.addEntry({category:"work",start:T("2026-11-03","07:55")});eq(!!live,true,"live clocking: start");
eq(!!S.updateEntry(live.id,{end:T("2026-11-03","16:47")},false),true,"live clocking: stop the running entry");
const lunch=S.addEntry({category:"lunch",start:T("2026-11-03","12:00"),end:T("2026-11-03","12:51"),});
eq(S.updateEntry(live.id,{end:T("2026-11-03","18:00")},true),null,"technician cannot correct (traced change)");
eq(S.updateEntry(live.id,{end:T("2026-11-03","18:00")},false),null,"…nor change a finished entry without trace");
eq(S.addEntry({category:"work",start:T("2026-11-02","08:00"),end:T("2026-11-02","17:00"),manual:true}),null,"…nor add a manual entry");
eq(S.addEntry({category:"work",start:T("2026-11-02","08:00"),end:T("2026-11-02","17:00"),imported:true}),null,"…nor import");
eq(S.deleteEntry(live.id),false,"…nor delete a finished entry");
const run=S.addEntry({category:"travel",start:Date.now()});eq(S.deleteEntry(run.id),true,"live clocking may cancel its own running entry");
eq(S.correctDay({userId:alex,entryId:live.id,fields:{category:"work",start:T("2026-11-03","07:55"),end:T("2026-11-03","17:00")},lunch:null,reason:"x"}),"forbidden","technician: correctDay refused");
// ---- older data: a meal inside the activity is flagged plainly (not deducted)
{const an=G.anomalies(S.entries(),Date.now()).find(a=>a.entry.id===live.id);eq([an.type,an.text.includes("12:00–12:51")&&an.text.includes("pas déduit")],["mealInside",true],"meal inside the activity flagged: not deducted");}
// ---- error report by the technician
eq(S.requestCorrection({date:"2026-11-03",text:""}),"textRequired","report needs a text");
const rep=S.requestCorrection({date:"2026-11-03",text:"Départ réel 17 h 30, repas 12 h 00 → 13 h 00"});eq(rep.status,"open","report open");
S.setCurrentUser(yann);eq(S.notifications().some(n=>n.type==="timesheet.correctionRequested"),true,"managers notified");
eq(S.correctionRequests().some(r=>r.id===rep.id),true,"manager sees the report");
// team lead: can report for his perimeter, cannot correct
S.setCurrentUser(enr);eq(!!S.requestCorrection({userId:alex,date:"2026-11-02",text:"lundi incomplet"}).id,true,"team lead can report for a technician of his sections");
eq(S.correctDay({userId:alex,entryId:live.id,fields:{category:"work",start:T("2026-11-03","07:55"),end:T("2026-11-03","17:30")},lunch:null,reason:"x"}),"forbidden","team lead cannot correct");
S.setCurrentUser(dam);eq(S.correctionRequests().length,0,"another technician sees nothing");
// ---- manager corrects the whole day: entry + meal, one operation
S.setCurrentUser(yann);
const base={userId:alex,entryId:live.id,fields:{category:"work",clientId:"",line:"",note:"",start:T("2026-11-03","07:55"),end:T("2026-11-03","17:30")}};
eq(S.correctDay(Object.assign({},base,{lunch:{start:T("2026-11-03","12:00"),end:T("2026-11-03","13:00")},reason:""})),"reasonRequired","reason mandatory");
eq(S.correctDay(Object.assign({},base,{lunch:{start:T("2026-11-03","06:00"),end:T("2026-11-03","07:00")},reason:"r"})),"lunchOutside","meal must be inside the day");
eq(S.correctDay(Object.assign({},base,{lunch:{start:T("2026-11-03","13:00"),end:T("2026-11-03","12:00")},reason:"r"})),"badLunch","meal end after start");
eq(S.correctDay(Object.assign({},base,{lunch:{start:T("2026-11-03","12:00"),end:T("2026-11-03","13:00")},reason:"signalement d'Alexandre"})),true,"day corrected");
eq(S.currentUserId(),yann,"the actor is still the manager after the correction");
S.withUser(alex,()=>{
  const e=S.entry(live.id);eq([U.clock(e.start),U.clock(e.end),e.edited],["07:55","12:00",true],"main part corrected");
  eq([e.history[0].by,e.history[0].reason,U.clock(e.history[0].before.end)],[yann,"signalement d'Alexandre","16:47"],"original value kept, with author and reason");
  const m=S.entries().filter(x=>x.category==="lunch");eq(m.map(x=>[U.clock(x.start),U.clock(x.end)]),[["12:00","13:00"]],"meal corrected (one meal)");
  const w=S.entries().filter(x=>x.category==="work"&&U.isoLocal(x.start)==="2026-11-03").sort((a,b)=>a.start-b.start);
  eq(w.map(x=>[U.clock(x.start),U.clock(x.end)]),[["07:55","12:00"],["13:00","17:30"]],"day rebuilt cleanly: work · meal · work (no overlap)");
  const bl=S.dayBlock(m[0].id);eq([U.clock(bl.start),U.clock(bl.end),U.clock(bl.lunch.start)],["07:55","17:30","12:00"],"the block is read back from any of its parts");
  const day=G.day("2026-11-03",S.entries(),S.settings());eq(Math.round(day.totalMs/6e4),515,"day = 9 h 35 pointed − 1 h meal = 8 h 35");
});
const au=S.auditTrail().find(a=>a.action==="timesheet.corrected");
eq([au.by,au.target,au.before.end,au.after.end,au.before.lunch.end,au.after.lunch.end,au.reason],[yann,alex,"16:47","17:30","12:51","13:00","signalement d'Alexandre"],"one audit event: who, whose, before/after day and meal, reason");
eq(S.correctionRequests(alex).find(r=>r.id===rep.id).status,"done","the report of that day is answered");
S.setCurrentUser(alex);eq(S.notifications().some(n=>n.type==="timesheet.corrected"),true,"technician notified of the correction");
// remove the meal; add a missing day; delete with reason
S.setCurrentUser(yann);
eq(S.correctDay(Object.assign({},base,{lunch:null,reason:"pas de repas"})),true,"meal removed");
S.withUser(alex,()=>{eq(S.entries().filter(x=>x.category==="lunch").length,0,"no meal left that day");
  eq(S.entries().filter(x=>x.category==="work"&&U.isoLocal(x.start)==="2026-11-03").map(x=>[U.clock(x.start),U.clock(x.end)]),[["07:55","17:30"]],"one work entry again (afternoon part merged)");});
eq(S.correctDay({userId:alex,entryId:null,fields:{category:"work",start:T("2026-11-02","08:00"),end:T("2026-11-02","17:00")},lunch:{start:T("2026-11-02","12:00"),end:T("2026-11-02","13:00")},reason:"journée oubliée"}),true,"missing day added with its meal");
S.withUser(alex,()=>{const n=S.entries().filter(x=>U.isoLocal(x.start)==="2026-11-02");eq(n.map(x=>x.category).sort(),["lunch","work","work"],"added day = work · meal · work");
  eq(S.deleteEntry(n.find(x=>x.category==="work").id,"doublon"),true,"manager deletes with a reason");});
eq(S.auditTrail().some(a=>a.action==="timesheet.entryDeleted"&&a.reason==="doublon"),true,"deletion traced");
eq(S.correctionRequests(alex).filter(r=>r.date==="2026-11-02")[0].status,"done","the team lead's report of the 2nd was answered by the correction");
// reject a report
S.setCurrentUser(alex);S.requestCorrection({date:"2026-11-04",text:"oubli de pause"});S.setCurrentUser(yann);
const r2=S.correctionRequests(alex).find(r=>r.status==="open");
eq(S.closeCorrection(r2.id,"rejected",""),"commentRequired","rejecting a report needs a comment");
eq(S.closeCorrection(r2.id,"rejected","pointage correct"),true,"report rejected with a comment");
// rights during withUser are the ACTOR's (bug fixed: withUser used to switch the actor)
S.setCurrentUser(alex);S.withUser(yann,()=>eq(P.can("users.manage"),false,"withUser does not give the subject's rights"));
console.log("OK",ok,"KO",ko);

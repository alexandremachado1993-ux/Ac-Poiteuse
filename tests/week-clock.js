/* Lot 2.9 (10/11/2026): clocking actions (undo, urgent call-out during leave, night period),
   favourite clients, week validation (technician → team lead → quality OR director) */
const load=require("./load");let ok=0,ko=0;
function eq(a,b,m){const s=JSON.stringify(a)===JSON.stringify(b);s?ok++:(ko++,console.log("FAIL",m,"got",JSON.stringify(a),"expected",JSON.stringify(b)));}
const near=(a,b,m)=>eq(Math.round(a*1000)/1000,Math.round(b*1000)/1000,m);
try{
const {M}=load();const {Store:S,Permissions:P,Hours:C,Segments:G,Utils:U,Validation:V}=M;
const id=n=>S.users().find(u=>u.name===n).id;const alex=id("Alexandre Machado"),dam=id("Damien Morvan"),enr=id("Enrique Soler"),yann=id("Yann Lefloc'h"),jer=id("Jérémie Augé");
const notif=(who,type)=>{const k=S.currentUserId();S.setCurrentUser(who);const n=S.notifications().some(x=>x.type===type);S.setCurrentUser(k);return n;};
const today=U.isoLocal(Date.now());

// ---- permissions of the new matrix
eq([P.has(enr,"timesheet.week.review"),P.has(enr,"timesheet.week.lock"),P.has(yann,"timesheet.week.lock"),P.has(jer,"timesheet.week.lock"),P.has(alex,"timesheet.week.review")],
   [true,false,true,true,false],"week rights: team lead reviews, quality AND director lock, technician neither");

// ---- start / switch / departure
S.setCurrentUser(alex);
const e1=S.startClock({category:"work"});eq(e1.category,"work","start work");
eq(S.undoLeft()>0,true,"undo offered right after the action");
eq(S.undoClock(),true,"undo");eq(S.runningEntry(),null,"the start is undone (nothing running)");eq(S.undoClock(),"expired","nothing more to undo");
S.setCurrentUser(yann);eq(S.auditQuery({action:"clock.undone"}).length,1,"undo traced in the audit");S.setCurrentUser(alex);
// a switch closes the previous one; undoing the switch reopens it
{const a=S.startClock({category:"travel"}); /* move the start 10 min back (an entry < 5 s is dropped by design) */
 S.setCurrentUser("");S.withUser(alex,()=>S.updateEntry(a.id,{start:Date.now()-600000},false));S.setCurrentUser(alex);
 const b=S.startClock({category:"work"});
 eq([S.entry(a.id).end!=null,S.runningEntry().id],[true,b.id],"switch: previous closed, new running");
 S.undoClock();eq([S.runningEntry().id,S.entry(b.id)],[a.id,null],"undo the switch: travel running again, work removed");
 eq(S.stopClock(),true,"departure");eq(S.runningEntry(),null,"nothing running");S.undoClock();eq(S.runningEntry().id,a.id,"undo the departure: running again");
 S.stopClock();}
// undo window = team rule (0 = off)
S.setCurrentUser(yann);S.updateOrg({undoSeconds:0});S.setCurrentUser(alex);S.startClock({category:"work"});eq([S.undoLeft(),S.undoClock()],[0,"expired"],"undo off when the rule is 0");
S.stopClock();S.setCurrentUser(yann);S.updateOrg({undoSeconds:10});S.setCurrentUser(alex);
// a person with no clocking right
S.setCurrentUser(enr);eq(S.startClock({category:"work"}),"forbidden","team lead does not clock by default");

// ---- favourite clients
S.setCurrentUser(yann);const cl=S.addClient({name:"Client test",city:"Landes"}).client;S.setCurrentUser(alex);
eq(S.toggleFavoriteClient(cl.id),true,"starred");eq(S.settings().favoriteClients,[cl.id],"kept in the personal settings");
eq(S.toggleFavoriteClient(cl.id),false,"unstarred");eq(S.toggleFavoriteClient("nope"),false,"unknown client refused");
eq(V.settings({favoriteClients:["a","b"]}).errors,[],"setting valid");eq(V.settings({favoriteClients:"x"}).errors,["settings.badValue:favoriteClients"],"bad setting refused");

// ---- night period: started before 21:00, still running at 21:00
{const dayIso=today;const at=(h)=>U.timestamp(dayIso,h);
 S.setCurrentUser("");S.withUser(alex,()=>S.entries().filter(e=>U.isoLocal(e.start)===today).forEach(e=>S.deleteEntry(e.id)));
 const e=S.withUser(alex,()=>S.addEntry({category:"work",start:at("19:00")}));S.setCurrentUser(alex);
 const p=S.nightPending(at("20:59")+50000);eq([!!p,p&&p.left],[true,10000],"countdown pending 10 s before 21:00");
 eq(S.nightCheck(at("20:59")+55000),false,"before 21:00: nothing done");
 eq(S.nightCheck(at("21:00")+2000),true,"no answer at 21:00: departure clocked");
 eq([S.entry(e.id).end,S.entry(e.id).toCheck],[at("21:00"),true],"departure at 21:00 exactly, flagged to check");
 eq([notif(enr,"clock.nightAutoStop"),notif(yann,"clock.nightAutoStop")],[true,true],"team lead and managers informed");
 S.setCurrentUser("");const e2=S.withUser(alex,()=>S.addEntry({category:"work",start:at("20:30")}));S.setCurrentUser(alex);
 eq(S.confirmNight(),true,"still working: confirmed");eq([S.nightPending(at("21:00")+1000),S.nightCheck(at("21:30"))],[null,false],"confirmed: no countdown, no automatic departure");
 S.setCurrentUser("");S.withUser(alex,()=>S.updateEntry(e2.id,{end:at("21:30")},false));
 const e3=S.withUser(alex,()=>S.addEntry({category:"work",start:at("21:40")}));S.setCurrentUser(alex);
 eq(S.nightPending(at("22:00")),null,"started during the night period: never questioned");
 S.setCurrentUser("");S.withUser(alex,()=>S.entries().filter(x=>U.isoLocal(x.start)===today).forEach(x=>S.deleteEntry(x.id)));S.setCurrentUser(alex);}

// ---- urgent call-out on a day of approved time off (decision of 10/11/2026)
{S.setCurrentUser(alex);const r=S.addRequest({type:"time_off",startDate:today,endDate:today});
 S.setCurrentUser(enr);S.reviewRequest(alex,r.id,"favorable","");S.setCurrentUser(jer);S.decideRequest(alex,r.id,"approved",jer);S.setCurrentUser(alex);
 eq(S.absenceToday().length,1,"approved time off today");
 eq(S.startClock({category:"work"}),"absenceToday","plain start refused on a day off");
 const u1=S.startClock({category:"work",urgent:true});eq([u1.category,u1.urgent],["work",true],"urgent call-out allowed, entry flagged");
 eq([notif(enr,"clock.urgent"),notif(jer,"clock.urgent")],[true,true],"managers informed of the urgent call-out");
 S.setCurrentUser(yann);eq(S.auditQuery({action:"clock.urgent"}).length,1,"urgent call-out traced");
 S.setCurrentUser("");S.withUser(alex,()=>{S.updateEntry(u1.id,{start:Date.now()-2*3600e3,end:Date.now()-3600e3},false);});S.setCurrentUser(alex);
 const w=C.isoWeek(U.utcDate(today));const s=C.weekSummary(G.weekSheet(w.year,w.week,S.entries(),S.settings(),Date.now()));
 near(s.counters.absenceWorked,1,"1 h worked on the day off");near(s.premiumAbsence,0.5,"paid +50 %");eq(s.credits.timeOff>0,true,"the day stays credited");
 S.setCurrentUser("");S.withUser(alex,()=>{S.deleteEntry(u1.id);});S.setCurrentUser(alex);}

// ---- week validation
{const prev=S.previousWeek();const mon=C.isoDayOf(prev.year,prev.week,0);
 S.setCurrentUser("");S.withUser(alex,()=>S.addEntry({category:"work",start:U.timestamp(mon,"08:00"),end:U.timestamp(mon,"17:00")}));
 S.setCurrentUser(alex);
 /* today may be a day off (block above): the closure rule is checked first */
 eq(JSON.stringify(S.weekToSend()),JSON.stringify(prev),"previous week worked and not sent");
 eq(S.startClock({category:"work"}),"weekNotSent","clocking blocked until the week is sent");
 S.setCurrentUser(enr);eq(S.sendWeek(prev.year,prev.week),"forbidden","only the person who clocks sends");S.setCurrentUser(alex);
 const cur=C.isoWeek(U.utcDate(today));eq(S.sendWeek(cur.year,cur.week),"notComplete","current week cannot be sent");
 const r=S.sendWeek(prev.year,prev.week);eq([r.status,r.done>=9],["sent",true],"sent → waiting for the team lead, total kept");
 eq(S.weekToSend(),null,"clocking allowed again");eq(S.sendWeek(prev.year,prev.week),"alreadySent","sent once");
 eq(notif(enr,"week.toReview"),true,"team lead notified");
 S.setCurrentUser(jer);eq(S.lockWeek(r.id,"lock",""),"notWaiting","the lock waits for the team lead");
 S.setCurrentUser(dam);eq(S.reviewWeek(r.id,"validate",""),"forbidden","a technician cannot validate");
 S.setCurrentUser(enr);eq(S.reviewWeek(r.id,"return",""),"commentRequired","returning needs a comment");
 eq(S.reviewWeek(r.id,"validate","ok"),true,"team lead validates first");
 const v=S.weekValidation(alex,prev.year,prev.week);eq([v.status,v.leadBy],["pending_lock",enr],"→ waiting for quality OR director, validator kept");
 eq([notif(alex,"week.validated"),notif(yann,"week.toLock"),notif(jer,"week.toLock")],[true,true,true],"technician, quality and director notified");
 S.setCurrentUser(jer);eq(S.lockWeek(r.id,"lock",""),true,"director locks: final decision");
 S.setCurrentUser(yann);eq(S.lockWeek(r.id,"lock",""),"notWaiting","the first of the two decides");
 const l=S.weekValidation(alex,prev.year,prev.week);eq([l.status,l.lockedBy,l.history.map(h=>h.to)],["locked",jer,["sent","pending_lock","locked"]],"locked by Jérémie, every step kept");
 eq(notif(alex,"week.locked"),true,"technician notified of the lock");
 // a locked week cannot be corrected
 const ent=S.withUser(alex,()=>S.entries().find(e=>U.isoLocal(e.start)===mon));
 eq(S.correctDay({userId:alex,entryId:ent.id,fields:{category:"work",start:U.timestamp(mon,"08:00"),end:U.timestamp(mon,"18:00")},lunch:null,reason:"x"}),"weekLocked","correction refused on a locked week");
 eq(S.withUser(alex,()=>S.deleteEntry(ent.id,"x")),false,"deletion refused on a locked week");
 // reopened by a manager (comment required), corrected, sent again
 eq(S.lockWeek(r.id,"return",""),"commentRequired","reopening needs a comment");
 eq(S.lockWeek(r.id,"return","departure to correct"),true,"reopened");eq(S.weekValidation(alex,prev.year,prev.week).status,"returned","→ returned to the technician");
 eq(S.correctDay({userId:alex,entryId:ent.id,fields:{category:"work",start:U.timestamp(mon,"08:00"),end:U.timestamp(mon,"18:00")},lunch:null,reason:"departure"}),true,"correction possible again");
 S.setCurrentUser(alex);eq(S.weekToSend()!==null,true,"a returned week must be sent again before clocking");
 eq(S.sendWeek(prev.year,prev.week).status,"sent","sent again");
 S.setCurrentUser(yann);eq(S.weekValidations().some(x=>x.userId===alex),true,"visible to the quality manager");
 S.setCurrentUser(dam);eq(S.weekValidations().some(x=>x.userId===alex),false,"not visible to another technician");
 // data validation and backup round trip
 S.setCurrentUser(yann);const full=S.exportAll();eq(S.previewRestore(full).errors,[],"backup with week validations is sound");
 const forged=JSON.parse(full);forged.data.weekValidations[0].status="locked";forged.data.weekValidations[0].lockedBy="";delete forged.manifest;
 eq(S.previewRestore(JSON.stringify(forged)).errors.some(x=>x.startsWith("weekValidation.unlocked")),true,"forged lock refused");}

// ---- no team lead covering: straight to the lock
{const {M:M2}=load();const S2=M2.Store,U2=M2.Utils,C2=M2.Hours;const id2=n=>S2.users().find(u=>u.name===n).id;
 const al=id2("Alexandre Machado"),en=id2("Enrique Soler"),ya=id2("Yann Lefloc'h");
 S2.setCurrentUser(ya);S2.updateUser(en,{sectionIds:["sec-nord"]});S2.setCurrentUser(al);
 const prev=S2.previousWeek();const mon=C2.isoDayOf(prev.year,prev.week,1);
 S2.setCurrentUser("");S2.withUser(al,()=>S2.addEntry({category:"work",start:U2.timestamp(mon,"08:00"),end:U2.timestamp(mon,"12:00")}));S2.setCurrentUser(al);
 eq(S2.sendWeek(prev.year,prev.week).status,"pending_lock","no team lead on Sud: straight to the lock");
 S2.setCurrentUser(ya);S2.updateOrg({weekClosureRequired:false});S2.setCurrentUser(al);eq(S2.weekToSend(),null,"rule off: never blocks");}
}catch(x){ko++;console.log("EXCEPTION",x.stack)}
console.log("OK",ok,"KO",ko);

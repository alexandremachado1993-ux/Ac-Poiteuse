/* 3.0 — hierarchy, leave rules, register "OK" method and its options, weeks (unlock,
   replacements), rule-change notification, account requests. Node.js only. */
const load=require("./load");let ok=0,ko=0;
function eq(a,b,m){const s=JSON.stringify(a)===JSON.stringify(b);s?ok++:(ko++,console.log("FAIL",m,"got",JSON.stringify(a),"expected",JSON.stringify(b)));}
const near=(a,b,m)=>eq(Math.round(a*1000)/1000,Math.round(b*1000)/1000,m);
const {M}=load();const {Store:S,Permissions:P,Hours:H,Segments:G,Leave:L,Utils:U}=M;
const id=n=>S.users().find(u=>u.name.startsWith(n)).id;
const alex=id("Alexandre"),dam=id("Damien"),enr=id("Enrique"),yann=id("Yann"),jer=id("Jérémie");
const as=(who,fn)=>{const me=S.currentUserId();S.setCurrentUser(who);try{return fn();}finally{S.setCurrentUser(me);}};
const notif=(who,type)=>as(who,()=>S.notifications().filter(n=>n.type===type));
const t=(iso,h)=>U.timestamp(iso,h);
const realNow=Date.now;const freeze=iso=>{Date.now=()=>new Date(iso+"T12:00:00").getTime();};
freeze("2026-11-10");

// ================= hierarchy (10/11/2026) =================
eq([P.canSeeUser(enr,alex),P.canSeeUser(enr,dam)],[true,true],"team lead sees his technicians");
eq([P.canSeeUser(enr,yann),P.canSeeUser(enr,jer)],[false,false],"team lead NEVER sees his superiors");
eq([P.canSeeUser(yann,jer),P.canSeeUser(jer,yann),P.canSeeUser(yann,enr),P.canSeeUser(jer,alex)],[true,true,true,true],"quality and director see everybody, each other included");
eq([P.canSeeUser(alex,dam),P.canSeeUser(alex,enr)],[false,false],"a technician sees nobody");
eq(as(enr,()=>P.visibleUsers().map(u=>u.name)),["Alexandre Machado","Damien Morvan","Enrique Soler"],"team lead's perimeter: himself and his technicians");
eq(["leave.self.request","leave.self.view"].map(p=>P.has(enr,p)||P.has(yann,p)||P.has(jer,p)),[false,false],"team lead and managers: no own leave rights");
eq(P.has(enr,"leave.team.approve"),true,"team lead: decides the leave of his technicians");
// IT department account
const it=as(yann,()=>S.addUser({name:"Service Informatique",role:"it_admin"}));
eq(it&&it.role,"it_admin","IT account created");
eq([P.canSeeUser(it.id,alex),P.canSeeUser(yann,it.id),P.has(it.id,"employees.manage"),P.has(it.id,"backups.manage"),P.has(it.id,"timeclock.global.view"),P.has(it.id,"leave.global.view")],
   [false,false,true,true,false,false],"IT: accounts and backups, no hours, no leave, invisible in the teams");

// ================= leave: one decision is final (10.1) =================
as(yann,()=>S.updateUser(alex,{hireDate:"2026-05-04"}));as(yann,()=>S.updateUser(dam,{hireDate:"2025-09-01"}));
S.setCurrentUser(alex);
const r1=S.addRequest({type:"paid_leave",startDate:"2026-12-14",endDate:"2026-12-20"});   // a full week Mon → Sun = 5 days
eq(r1.status,"pending_final","no opinion step: straight to the decision");
eq([notif(enr,"leave.toDecide").length,notif(yann,"leave.toDecide").length,notif(jer,"leave.toDecide").length],[1,1,1],"the 3 deciders are notified");
eq(L.workingDaysOf(r1,S.profile()),5,"a week of leave = 5 days (Monday → Friday, 3.1)");
as(yann,()=>S.updateOrg({leaveDayMode:"monSat"}));eq(L.workingDaysOf(r1,S.profile()),6,"option \"monSat\": Monday → Saturday = 6 days");as(yann,()=>S.updateOrg({leaveDayMode:"monFri"}));
eq(as(enr,()=>S.decideRequest(alex,r1.id,"rejected",enr,{})),false,"refusal needs a comment");
eq(as(enr,()=>S.decideRequest(alex,r1.id,"approved",enr,{})),true,"the team lead approves: final");
eq(S.withUser(alex,()=>S.requests().find(r=>r.id===r1.id).decidedBy),"Enrique Soler","decided by the team lead");
eq(as(yann,()=>S.decideRequest(alex,r1.id,"rejected",yann,{comment:"x"})),false,"already decided: nobody decides again");
// on behalf: managers yes, team lead no; managers never for themselves
eq(as(yann,()=>S.withUser(dam,()=>S.addRequest({type:"time_off",startDate:"2026-12-07",endDate:"2026-12-07"})))!==null,true,"a manager files a request for a technician");
eq(as(enr,()=>S.withUser(dam,()=>S.addRequest({type:"time_off",startDate:"2026-12-08",endDate:"2026-12-08"}))),null,"the team lead does not file requests for others (3)");
eq(as(enr,()=>S.addRequest({type:"paid_leave",startDate:"2026-12-21",endDate:"2026-12-21"})),null,"the team lead requests no leave for himself");
// types
eq(S.addRequest({type:"other",startDate:"2027-01-11",endDate:"2027-01-11"}),null,"\"other\" without comment refused");
eq(!!S.addRequest({type:"other",startDate:"2027-01-11",endDate:"2027-01-11",comment:"moving house"}),true,"\"other\" with a comment");
eq(["justified","family_event","training"].every(k=>!!S.addRequest({type:k,startDate:"2027-02-0"+(1+["justified","family_event","training"].indexOf(k)),endDate:"2027-02-0"+(1+["justified","family_event","training"].indexOf(k))})),true,"justified absence, family event, training");
// 3.0.1: calendar — leave counted (and drawn) Monday → Saturday, never on Sundays nor public holidays
eq([L.countsOn("2026-11-13"),L.countsOn("2026-11-14"),L.countsOn("2026-11-15"),L.countsOn("2026-11-11"),L.countsOn("2026-11-16")],[true,false,false,false,true],"Friday counted; Saturday, Sunday and Armistice (11/11) not");
eq(L.workingDaysOf({startDate:"2026-11-09",endDate:"2026-11-15"},S.profile()),4,"week of 11/11: Mon→Fri minus the holiday = 4 days");
// half day
const hd=S.addRequest({type:"paid_leave",startDate:"2027-01-15",endDate:"2027-01-15",half:"pm"});
eq([hd.half,L.workingDaysOf(hd,S.profile())],["pm",0.5],"half day = 0.5 day");
eq(S.addRequest({type:"paid_leave",startDate:"2027-01-18",endDate:"2027-01-19",half:"am"}).half,"","half day only on a one-day request");
// notice period: 1 day → 2 days, 2-5 days → 7 days, > 5 days → 14 days
const late=S.addRequest({type:"paid_leave",startDate:"2026-11-11",endDate:"2026-11-11"});
eq(late.lateNotice,true,"1 day asked 1 day ahead: late (2 days needed)");
eq(notif(yann,"leave.lateNotice").length>=1,true,"deciders told about the late request");
eq(S.noticeOf({startDate:"2026-11-16",endDate:"2026-11-19"},alex),{days:4,required:7,given:6,late:true},"4 days asked 6 days ahead: 7 needed");
eq(S.noticeOf({startDate:"2026-12-01",endDate:"2026-12-12"},alex).late,false,"11 days asked 3 weeks ahead: in time");
as(yann,()=>S.updateOrg({leaveNoticeBlocks:true}));
eq(S.addRequest({type:"time_off",startDate:"2026-11-11",endDate:"2026-11-11"}),null,"rule: late requests refused");
eq(!!S.addRequest({type:"time_off",startDate:"2026-11-11",endDate:"2026-11-11",draft:true}),true,"…a draft can still be kept");
as(yann,()=>S.updateOrg({leaveNoticeBlocks:false}));
// overlap and balance
S.setCurrentUser(dam);const ov=S.addRequest({type:"paid_leave",startDate:"2026-12-16",endDate:"2026-12-16"});
eq(ov.overlap,true,"Damien's leave overlaps Alexandre's: flagged");eq(notif(jer,"leave.overlap").length>=1,true,"deciders told about the overlap");
S.setCurrentUser(alex);
const big=S.addRequest({type:"paid_leave",startDate:"2027-03-01",endDate:"2027-04-17"});
eq(big.overBalance,true,"beyond the balance: flagged, decided by a manager");
// cancellation of an approved leave (16)
eq(S.requestCancellation(r1.id,"project postponed"),true,"the requester asks to cancel an approved leave");
eq(S.requestCancellation(r1.id,""),false,"…only once");
eq(notif(enr,"leave.cancelAsked").length,1,"deciders notified");
eq(as(jer,()=>S.decideCancellation(alex,r1.id,false,"")),"commentRequired","refusing the cancellation needs a comment");
eq(as(jer,()=>S.decideCancellation(alex,r1.id,true,"")),true,"cancellation accepted");
eq(S.requests().find(r=>r.id===r1.id).status,"cancelled","→ cancelled, history kept");
// ================= balance: May → May, carry-over on request =================
eq(L.periodStart("2026-11-10"),"2026-05-01","period from 1 May");eq(L.periodStart("2027-04-30"),"2026-05-01","…to 30 April");
const b1=L.balance("2026-11-10");eq([b1.period,Math.round(b1.earned*100)/100,b1.carried],["2026-05-01",12.5,0],"hired 04/05/2026: 6 full months × 25 ÷ 12 = 12.5 days");
eq(Math.round(S.org().leaveDaysPerMonth*12),25,"25 days a year = 5 weeks of 5 days");
{const b=L.balance("2027-05-10");eq([b.period,b.earned],["2027-05-01",0],"new period: earned starts again");eq(b.previousLeft>0,true,"what is left of the previous period can be carried over");}
eq(S.requestCarryOver(3,""),true,"the technician asks for a carry-over");eq(notif(enr,"leave.carryAsked").length,1,"deciders notified");
eq(as(enr,()=>S.carryOver(alex,3,"")),true,"a decider records it");
eq(L.balance("2026-11-10").carried,3,"3 days carried over in the period");
eq(as(dam,()=>S.carryOver(alex,3,"")),"forbidden","a technician cannot record a carry-over");

// ================= register "OK" method =================
S.setCurrentUser(alex);
const week=(y,w)=>H.weekSummary(G.weekSheet(y,w,S.entries(),S.settings()));
// week 41 (05→11/10): Mon-Fri 9 h + Sunday 3 h with 2 h of night = 48 h
["2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09"].forEach(d=>{S.addEntry({category:"work",start:t(d,"07:00"),end:t(d,"12:00")});S.addEntry({category:"lunch",start:t(d,"12:00"),end:t(d,"13:00")});S.addEntry({category:"work",start:t(d,"13:00"),end:t(d,"17:00")});});
S.addEntry({category:"work",start:t("2026-10-11","20:00"),end:t("2026-10-11","23:00")});
{const s=week(2026,41).register;near(s.cumul,48.5,"cumul = 48 h + night 2 h × 25 %");near(s.extra,9.5,"9.5 h above 39 h");near(s.valued,9.5*1.25,"valued × 1.25 (1 h 15 per hour)");eq(s.paid,false,"October: banked");near(s.sundayPremium,3,"Sunday 3 h × 100 %, separate counter");}
as(yann,()=>S.updateOrg({overtime50InRecovery:true}));near(week(2026,41).register.valued,4*1.25+5.5*1.5,"option 11.2: above the 43rd hour × 1.5");
as(yann,()=>S.updateOrg({overtime50InRecovery:false,premiumsBeforeOvertime:false}));
{const s=week(2026,41).register;near([s.valued,s.premiumsAfter].reduce((a,b)=>a+b),9*1.25+0.5,"option 11.6: premiums added after");}
as(yann,()=>S.updateOrg({premiumsBeforeOvertime:true}));
// holiday week 29 (14/07 Tuesday): goal 39 − 7.8; summer week → PAID
S.addEntry({category:"work",start:t("2026-07-13","08:00"),end:t("2026-07-13","18:00")});
{const s=week(2026,29).register;near(s.goal,31.2,"holiday Mon→Fri: goal 39 − 7.8");near(s.valued,0,"week under the goal: 0 (11.3)");eq(s.paid,true,"week 29: paid period (11.7)");}
as(yann,()=>S.updateOrg({negativeWeeks:"carry"}));near(week(2026,29).register.valued,10-31.2,"option 11.3: shortfall deducted");as(yann,()=>S.updateOrg({negativeWeeks:"zero"}));
// Saturday holiday not credited (15/08/2026)
eq(H.weekCredits(2026,33,null).holiday,0,"holiday on a Saturday: not credited (Mon→Fri, register)");
// time off taken: weekdays only, 7.8 h a day
as(yann,()=>S.withUser(alex,()=>S.addRequest({type:"time_off",startDate:"2026-10-23",endDate:"2026-10-26"})));
const toff=S.requests().find(r=>r.startDate==="2026-10-23");as(jer,()=>S.decideRequest(alex,toff.id,"approved",jer,{}));
near(H.timeOffTaken({year:2026}),2*7.8,"Fri 23 → Mon 26: 2 weekdays × 7.8 h (week-end not taken)");
const rb=H.recoveryBalance();eq(rb.method,"register","register method by default");
near(rb.bank,9.5*1.25,"bank = valued weeks outside the summer");near(rb.toPay,0,"week 29 under the goal: nothing to pay");near(rb.total,9.5*1.25-2*7.8,"total = bank − time off taken");
// countdown option still available
as(yann,()=>S.updateOrg({hoursMethod:"countdown"}));eq(H.recoveryBalance().method,"countdown","option: 2.9.1 countdown method");as(yann,()=>S.updateOrg({hoursMethod:"register"}));
// migration: old default 39 ÷ 7 → 7.8, a value chosen by a manager kept
{const old={version:5,org:{dayHours:39/7,weekendHolidays:true,rulesVersion:28},users:[{id:"u1",name:"Alexandre Machado",role:"technician"}],perUser:{u1:{}}};
 const {M:M2}=load({acp_data_v5:JSON.stringify(old)});const o=M2.Store.org();eq([o.dayHours,o.weekendHolidays,o.leaveAcquisitionStart,o.rulesVersion,o.hoursMethod],[7.8,false,"05-01",31,"register"],"migration to the register defaults");
 eq([Math.round(o.leaveDaysPerMonth*12),o.leaveDayMode,o.homeDayPreset],[25,"monFri",false],"3.1 migration: 2.5 → 25 ÷ 12, days Mon → Fri, Domicile clocked normally");
 const {M:M3}=load({acp_data_v5:JSON.stringify(Object.assign({},old,{org:{dayHours:8,rulesVersion:28}}))});eq(M3.Store.org().dayHours,8,"a value set by a manager is kept");}

// 3.1.1: the French values stored by 3.1.0 are converted to English ones
for (const [old, now] of [["ouvres","monFri"],["ouvrables","monSat"]]) {
 const {M:Mx}=load({acp_data_v5:JSON.stringify({version:5,org:{leaveDayMode:old,rulesVersion:31},users:[{id:"u1",name:"Alexandre Machado",role:"technician"}],perUser:{u1:{}}})});
 eq(Mx.Store.org().leaveDayMode,now,"3.1.0 value \""+old+"\" read as \""+now+"\"");}
// ================= rule change → technicians notified =================
as(yann,()=>S.updateOrg({leaveNoticeMid:10}));
{const n=notif(alex,"rules.changed").find(x=>x.params.rules.some(r=>r.k==="leaveNoticeMid"));eq([!!n,n&&n.params.name,n&&n.params.rules.some(r=>r.k==="leaveNoticeMid"&&r.b===7&&r.a===10)],[true,"Yann Lefloc'h",true],"technicians told: who, which rule, before → after");
 eq(notif(enr,"rules.changed").length,0,"not the team lead (only the technicians)");}
as(yann,()=>S.updateOrg({leaveNoticeMid:7}));

// ================= weeks: unlock request, replacements =================
freeze("2026-11-10");S.setCurrentUser(alex);
S.addEntry({category:"work",start:t("2026-11-02","08:00"),end:t("2026-11-02","17:00")});
const wk=S.sendWeek(2026,45);eq(wk.status,"sent","week sent");
as(enr,()=>S.reviewWeek(wk.id,"validate",""));as(yann,()=>S.lockWeek(wk.id,"lock",""));
eq(S.weekValidation(alex,2026,45).status,"locked","week locked");
eq(as(enr,()=>S.requestUnlock(wk.id,"")),"commentRequired","unlock request needs a reason");
eq(as(enr,()=>S.requestUnlock(wk.id,"oubli d'un trajet")),true,"the team lead asks for an unlock");
eq(notif(jer,"week.unlockAsked").length,1,"quality / director notified");
eq(as(yann,()=>S.lockWeek(wk.id,"return","unlock asked by Enrique")),true,"a manager unlocks (returns it)");
eq(S.weekValidation(alex,2026,45).unlockRequest,null,"request closed");
// team lead away → the managers lock directly
eq(as(enr,()=>S.setAway("2026-11-09","2026-11-20")),true,"the team lead declares his absence");eq(S.isAway(enr),true,"away today");
S.setCurrentUser(dam);S.addEntry({category:"work",start:t("2026-11-03","08:00"),end:t("2026-11-03","17:00")});const wd=S.sendWeek(2026,45);
eq(notif(yann,"week.toLock").some(n=>n.params.week==="45"),true,"team lead away: the managers are told at once");
eq(as(jer,()=>S.lockWeek(wd.id,"lock","")),true,"…and lock it directly");
eq(S.weekValidation(dam,2026,45).replacement,true,"locked in replacement (traced)");
as(enr,()=>S.setAway("",""));
// both managers away → the team lead's validation is final
as(yann,()=>S.setAway("2026-11-09","2026-11-20"));as(jer,()=>S.setAway("2026-11-01","2026-11-30"));
S.setCurrentUser(alex);const w2=S.sendWeek(2026,45);
eq(as(enr,()=>S.reviewWeek(w2.id,"validate","")),true,"team lead validates");
eq([S.weekValidation(alex,2026,45).status,S.weekValidation(alex,2026,45).lockedBy],["locked",enr],"managers away: the team lead's validation locks the week");
eq(notif(yann,"week.lockedInAbsence").length,1,"managers informed on their return");
eq(as(yann,()=>S.setAway("2026-11-20","2026-11-01")),false,"absence: end before start refused");
as(yann,()=>S.setAway("",""));as(jer,()=>S.setAway("",""));

// ================= account =================
eq(as(alex,()=>S.requestDeletion("")),true,"deletion request");
eq([notif(yann,"account.deletionAsked").length,notif(jer,"account.deletionAsked").length,notif(it.id,"account.deletionAsked").length],[1,1,0],"sent to the managers (not to IT)");
eq(S.org().idleLogoutMinutes,15,"automatic sign-out after 15 min");
// ================= 3.2: personal arrangement of the workspace (display only) =================
{const V=M.Validation;
 eq(V.settings({dashLayout:{me:{order:["status","kpiWeek"],hidden:["kpiLeave"],sizes:{myWeek:12}},lead:{}}}).errors,[],"layout: valid arrangement accepted");
 for(const bad of [{me:{sizes:{a:5}}},{me:{order:["<img>"]}},{me:{other:1}},{Me:{}},[],{me:"x"}])
  eq(V.settings({dashLayout:bad}).errors,["settings.badValue:dashLayout"],"layout: refused "+JSON.stringify(bad));
 eq(Object.keys(V.settings({}).values),[],"no layout in an old backup: nothing to apply");
 const {M:Mx}=load({acp_data_v5:JSON.stringify({version:5,org:{rulesVersion:31},users:[{id:"u1",name:"Alexandre Machado",role:"technician"}],perUser:{u1:{settings:{menuSide:"right"}}}})});
 Mx.Store.setCurrentUser("u1");eq([Mx.Store.settings().dashLayout,Mx.Store.settings().menuSide],[{},"right"],"3.1 data: default arrangement, former choices kept");
 const own={dashLayout:{me:{hidden:["kpiLeave"]}}};
 const before=as(alex,()=>[S.entries().length,S.requests().length]);
 as(alex,()=>S.importJson(JSON.stringify({entries:[],requests:[],clients:[],settings:own})));
 eq(as(alex,()=>[S.settings().dashLayout,S.entries().length,S.requests().length]),[own.dashLayout].concat(before),"personal backup restores the arrangement, nothing else");
 eq(as(dam,()=>S.settings().dashLayout),{},"…for this person only");}
// ================= 4.1.7: nothing counted before the hire date =================
as(alex,()=>{const hire=S.profile().hireDate;S.updateUser&&0;
 const sum=w=>H.weekSummary(G.weekSheet(2026,w,S.entries(),S.settings(),Date.now()));
 eq([hire,sum(15).goal,sum(15).done],["2026-05-04",0,0],"week before the hire date: no goal, Easter Monday not credited");
 eq(sum(19).goal,39,"hire week starting on Monday: full goal");});
{const yid=as(yann,()=>S.users().find(u=>u.name.startsWith("Damien")).id);as(yann,()=>S.updateUser(yid,{hireDate:"2026-11-04"}));
 eq(as(yid,()=>Math.round(H.weekSummary(G.weekSheet(2026,45,S.entries(),S.settings(),Date.now())).goal*100)/100),23.4,"hired on Wednesday: goal 39 − 2 days × 7.8 = 23.4");
 as(yann,()=>S.updateUser(yid,{hireDate:""}));}
Date.now=realNow;
console.log("OK",ok,"KO",ko);

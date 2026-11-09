/* Tests of the 2.8 foundations: permissions, sections, grants, access requests,
   audit, safeguards, full backup / restore, integrity, storage adapter. */
const load=require("./load");let ok=0,ko=0;
function eq(a,b,m){const s=JSON.stringify(a)===JSON.stringify(b);s?ok++:(ko++,console.log("FAIL",m,"got",JSON.stringify(a),"expected",JSON.stringify(b)));}
(async()=>{
const {M,mem}=load();const {Store:S,Permissions:P,Auth:A,StorageAdapter:SA}=M;
const id=n=>S.users().find(u=>u.name===n).id;
const alex=id("Alexandre Machado"),damien=id("Damien Morvan"),enrique=id("Enrique Soler"),yann=id("Yann Lefloc'h"),jer=id("Jérémie Augé");
// ---- reference organisation (part 3, 11): role, sections, clocking obligation, all distinct
eq([S.user(alex).sectionIds,S.user(damien).sectionIds,S.user(enrique).sectionIds,S.user(yann).allSections,S.user(jer).allSections],
   [["sec-sud"],["sec-nord"],["sec-nord","sec-sud"],true,true],"sections");
eq([alex,damien,enrique,yann,jer].map(u=>S.user(u).clockRequired),[true,true,false,false,false],"clocking obligation only for the two technicians");
eq(S.sections().map(x=>x.name),["Nord","Sud"],"two initial sections");
// ---- default permissions per profile (part 3, 19.1)
const can=(u,p)=>P.has(u,p);
eq(["clock.own","timesheet.own","leave.request","leave.balance.view","timesheet.correct.request"].every(p=>can(alex,p)),true,"technician rights");
eq(["timesheet.team.view","leave.review","leave.approve","users.manage","settings.manage","permissions.manage","audit.view"].some(p=>can(alex,p)),false,"technician: no team/admin rights");
eq(["timesheet.team.view","leave.review","team.view","reports.view","permissions.request"].every(p=>can(enrique,p)),true,"team lead rights");
eq(["leave.approve","settings.manage","users.manage","permissions.manage","clock.own"].some(p=>can(enrique,p)),false,"team lead: no final approval, no settings, no self rights, no clocking by default");
eq(P.ALL.filter(p=>p!=="clock.own").every(p=>can(yann,p)&&can(jer,p)),true,"both managers have exactly the same full rights");
eq([can(yann,"clock.own"),can(jer,"clock.own")],[false,false],"managers do not clock by default (activable per account)");
// ---- perimeter (part 3.1, 3.5)
eq([P.canSeeUser(alex,damien),P.canSeeUser(alex,alex)],[false,true],"a technician never sees another employee's data");
eq([P.canSeeUser(enrique,alex),P.canSeeUser(enrique,damien),P.canSeeUser(yann,alex)],[true,true,true],"team lead sees Nord and Sud; managers see all");
S.setCurrentUser(yann);S.updateUser(enrique,{sectionIds:["sec-nord"]});S.setCurrentUser("");
eq([P.canSeeUser(enrique,alex),P.canSeeUser(enrique,damien)],[false,true],"perimeter follows the section assignment");
S.setCurrentUser(yann);S.updateUser(enrique,{sectionIds:["sec-nord","sec-sud"]});S.setCurrentUser("");
// ---- checks in the business logic, not only in the screens (part 4)
S.setCurrentUser(enrique);
eq(S.updateOrg({weeklyBase:30}),false,"team lead cannot change the settings");
eq(S.updateUser(enrique,{role:"admin"}),false,"no self-escalation");
eq(S.grant({userId:enrique,permission:"leave.approve",kind:"permanent"}),null,"cannot grant rights");
eq(S.addUser({name:"Pirate"}),null,"cannot create accounts");
// ---- access request: temporary, approved, expires by itself (part 5)
eq(S.requestAccess({permission:"leave.approve",kind:"temporary",reason:"",end:"2026-11-20"}),"reasonRequired","reason mandatory");
const r1=S.requestAccess({permission:"leave.approve",kind:"temporary",reason:"Yann en congé",start:"2026-11-05",end:"2026-11-10"});
eq(r1.status,"pending","temporary request pending");
eq(S.decideAccess(r1.id,"approved",{}),"forbidden","requester cannot decide (no permissions.manage)");
S.setCurrentUser(yann);
eq(S.decideAccess(r1.id,"approved",{end:"2026-11-08"}),"commentRequired","a different duration must be explained");
eq(S.decideAccess(r1.id,"approved",{end:"2026-11-08",comment:"jusqu'à mon retour"}),true,"approved with a shorter duration");
const RealDate=Date;
const at=iso=>{const t=new RealDate(iso+"T12:00:00").getTime();return t;};
eq(P.has(enrique,"leave.approve",'2026-11-07'),true,"right in force during the period");
eq(P.has(enrique,"leave.approve",'2026-11-09'),false,"right expired after the end date (checked at every call)");
eq(P.has(enrique,"leave.approve",'2026-11-04'),false,"not before the start date");
// expiry derived when the app was closed for days: fake "today"
{const realNow=Date.now;Date.now=()=>at("2026-11-12");
 eq(S.accessRequests().find(x=>x.id===r1.id).status,"expired","status 'expired' derived on read, app closed for days");
 eq(P.has(enrique,"leave.approve"),false,"no right on 12/11");Date.now=realNow;}
// ---- permanent request, refused, details asked, own request
S.setCurrentUser(enrique);const r2=S.requestAccess({permission:"reports.export",kind:"permanent",reason:"exports mensuels"});
S.setCurrentUser(jer);eq(S.decideAccess(r2.id,"rejected",{}),"commentRequired","a refusal needs a comment");
eq(S.decideAccess(r2.id,"info_requested",{comment:"pour quels rapports ?"}),true,"details requested");
S.setCurrentUser(enrique);eq(S.answerAccess(r2.id,"rapports mensuels Nord et Sud"),true,"requester answers");
S.setCurrentUser(jer);eq(S.decideAccess(r2.id,"approved",{}),true,"permanent access approved");
eq(P.has(enrique,"reports.export"),true,"an approved request really changes the rights");
// revoke
const g=S.grants().find(x=>x.requestId===r2.id);eq(S.revokeGrant(g.id,"plus nécessaire"),true,"revoked");
eq([P.has(enrique,"reports.export"),S.accessRequests().find(x=>x.id===r2.id).status],[false,"revoked"],"revocation removes the right, status 'revoked'");
// self-approval: a manager cannot approve their own request (simulate a request by Jérémie via a temporarily reduced profile)
S.setCurrentUser(jer);eq(S.requestAccess({permission:"audit.view",kind:"permanent",reason:"x"}),"alreadyGranted","nothing to request when already granted");
S.setCurrentUser(yann);const tmp=S.addUser({name:"Chef Test",role:"team_lead",sectionIds:["sec-sud"]});
S.setCurrentUser(tmp.id);const r3=S.requestAccess({permission:"leave.approve",kind:"permanent",reason:"test"});
S.setCurrentUser(yann);S.grant({userId:tmp.id,permission:"permissions.manage",kind:"permanent",reason:"test"});
S.setCurrentUser(tmp.id);eq(S.decideAccess(r3.id,"approved",{}),"ownRequest","nobody approves their own request");
eq(S.grant({userId:tmp.id,permission:"leave.approve",kind:"permanent"}),null,"nobody grants rights to themselves");
// ---- safeguards on accounts
S.setCurrentUser(yann);
eq(S.updateUser(jer,{accountStatus:"disabled"}),true,"a manager can disable the other one");
eq(S.updateUser(yann,{accountStatus:"disabled"}),false,"but not themselves");
S.setCurrentUser("");eq(S.updateUser(yann,{role:"technician"}),false,"never zero active administrator");
S.setCurrentUser(yann);S.updateUser(jer,{accountStatus:"active"});
eq(await A.signIn(jer,"x"),false,"(no password yet)");
// clocking can be activated account by account
eq(S.grant({userId:enrique,permission:"clock.own",kind:"permanent",reason:"pointe en intervention"})!==null&&P.has(enrique,"clock.own"),true,"clocking activated for one account");
// ---- audit trail (part 12)
const acts=new Set(S.auditTrail().map(a=>a.action));
eq(["access.requested","access.decided","access.answered","permission.granted","permission.revoked","user.created","user.statusChanged","user.updated"].every(a=>acts.has(a)),true,"every important action traced");
const ad=S.auditTrail().find(a=>a.action==="access.decided"&&a.reason==="jusqu'à mon retour");eq([ad.by,ad.before.status,ad.after.status,!!ad.at],[yann,"pending","approved",true],"who, when, before, after, reason");
// ---- notifications (part 16)
S.setCurrentUser(enrique);eq(S.notifications().some(n=>n.type==="permission.granted"),true,"requester notified in the app");
S.setCurrentUser(yann);eq(S.notifications().some(n=>n.type==="access.requested"),true,"managers notified of access requests");
// ---- integrity + full backup / restore (part 13)
eq(S.verify(),[],"integrity check: sound");
S.setCurrentUser(alex);eq(S.exportAll(),null,"technician cannot export everything");
S.setCurrentUser(yann);const full=S.exportAll();const nUsers=S.users().length;
eq(JSON.parse(full).kind,"full","full export");
S.setCurrentUser(yann);S.addUser({name:"Après Export"});
eq(S.inspectFull("{bad").error,"notJson","bad file refused");eq(S.inspectFull('{"kind":"account"}').error,"notFull","per-account file refused here");
const res=S.importAll(full);eq(res.ok,true,"restore");eq(S.users().length,nUsers,"data back to the export");
eq(mem[res.backupKey]!==undefined&&JSON.parse(mem[res.backupKey]).users.some(u=>u.name==="Après Export"),true,"current data saved (verified) before restoring");
eq(S.auditTrail().some(a=>a.action==="backup.restored"),true,"restore traced");
// ---- storage adapter is the only door
eq(typeof SA.get==="function"&&SA.NAME,"local-browser","local adapter");
// ---- migration v3 (data of 2.7) → v4: nothing lost, reference organisation applied, backup verified
{const v3={version:3,org:{weeklyBase:39,dayHours:39/7,leaveDaysPerYear:25,countShortBreaks:true,rulesVersion:25},
  users:[{id:"u1",name:"Alexandre Machado",role:"technician",hireDate:"2026-05-04",pinHash:"h1",active:true,jobTitle:"Technicien sertisseur"},
         {id:"u2",name:"Damien Morvan",role:"technician",pinHash:"",active:false},
         {id:"u3",name:"Enrique Soler",role:"admin",pinHash:"h3",active:true},
         {id:"u4",name:"Yann Le Floc'h",role:"admin",pinHash:"",active:true},
         {id:"u5",name:"Jérémie Augé",role:"admin",pinHash:"h5",active:true}],
  clients:[{id:"c1",name:"Usine",city:"",lines:[]}],
  perUser:{u1:{settings:{vibration:false},entries:[{id:"e1",category:"work",start:1,end:3600001},{id:"e2",category:"lunch",start:3600001,end:7200001}],
               requests:[{id:"r1",type:"time_off",startDate:"2026-10-22",endDate:"2026-10-23",status:"approved",decidedBy:"Jérémie Augé"}]},
           u2:{entries:[],requests:[]},u3:{entries:[],requests:[]},u4:{entries:[],requests:[]},u5:{entries:[],requests:[]}}};
 const raw=JSON.stringify(v3);
 const {M:M2,mem:m2}=load({acp_data_v3:raw});const S2=M2.Store;S2.load();
 eq(m2.acp_data_v3,raw,"v3 key left intact");
 const bk=Object.keys(m2).find(k=>k.startsWith("acp_backup_before_v4_"));eq(m2[bk],raw,"verified copy of the v3 data");
 const u=n=>S2.users().find(x=>x.name===n);
 eq([u("Enrique Soler").role,!!u("Yann Lefloc'h"),u("Yann Lefloc'h").id,u("Damien Morvan").accountStatus],["team_lead",true,"u4","disabled"],"Enrique → team lead, Yann renamed (same id), disabled account kept disabled");
 eq([u("Alexandre Machado").pinHash,u("Jérémie Augé").pinHash,u("Alexandre Machado").jobTitle],["h1","h5","Technicien sertisseur"],"passwords and own job title kept");
 S2.setCurrentUser("u1");eq([S2.entries().length,S2.requests().length,S2.clients().length,S2.settings().vibration,S2.settings().countShortBreaks],[2,1,1,false,true],"entries, requests, clients, settings and team rules kept");
 eq([S2.org().leaveDaysPerMonth,"leaveDaysPerYear" in S2.org()],[2.5,false],"leave rule converted to 2.5 days/month");
 eq([S2.migrationReport().from,S2.migrationReport().backupVerified,S2.verify()],[3,true,[]],"report: from v3, backup verified, integrity sound");
 eq(S2.auditTrail().filter(a=>a.action==="user.migrated").length>=3,true,"every changed account traced");}
console.log("OK",ok,"KO",ko);})();

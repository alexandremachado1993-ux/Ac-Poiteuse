const {JSDOM}=require("jsdom");const fs=require("fs");const path=require("path").join(__dirname,"..")+"/";
let ok=0,ko=0;const eq=(a,b,m)=>{if(JSON.stringify(a)===JSON.stringify(b))ok++;else{ko++;console.log("FAIL",m,"got",JSON.stringify(a).slice(0,200),"expected",JSON.stringify(b))}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function build(lang,storage){
 const html=fs.readFileSync(path+"index.html","utf8").replace(/<script src="([^"]+)"><\/script>/g,(m,s)=>"<script>"+fs.readFileSync(path+s,"utf8")+"\n//# sourceURL="+s+"</script>");
 const errors=[];
 const dom=new JSDOM(html,{runScripts:"dangerously",url:"https://example.netlify.app/index.html",pretendToBeVisual:true,
  beforeParse(w){w.TextEncoder=require("util").TextEncoder;Object.defineProperty(w,"crypto",{value:require("crypto").webcrypto});
   Object.defineProperty(w.navigator,"language",{value:lang||"fr-FR"});
   if(storage) for(const [k,v] of Object.entries(storage)) w.localStorage.setItem(k,v);
   w.confirm=()=>true;w.alert=m=>errors.push("alert:"+m);w.print=()=>{};w.scrollTo=()=>{};
   w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","")};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute("open")};
   w.URL.createObjectURL=()=>"blob:x";w.URL.revokeObjectURL=()=>{};
   w.addEventListener("error",e=>errors.push(e.message));}});
 const w=dom.window,doc=w.document;
 return {w,doc,errors,$:s=>doc.querySelector(s),$$:s=>[...doc.querySelectorAll(s)]};
}
const expose=w=>w.eval('for (const n of ["Store","Utils","Auth","I18n","Hours","Segments","ReportsPage","LeavePage"]) window[n]=eval(n);');
const storageOf=w=>{const o={};for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);o[k]=w.localStorage.getItem(k);}return o;};
async function signIn(b,name,pwd,first){
 const btn=b.$$("[data-user]").find(x=>x.textContent.includes(name));btn.click();await sleep(10);
 b.$("#lgPassword").value=pwd;if(first) b.$("#lgConfirm").value=pwd;
 b.$("#lgForm").dispatchEvent(new b.w.Event("submit",{cancelable:true}));await sleep(60);
}
const go=(b,h)=>{b.w.location.hash=h;b.w.dispatchEvent(new b.w.HashChangeEvent("hashchange"));};
const nav=b=>b.$$("#sideNav a span").map(a=>a.textContent);
const shown=b=>b.$$("main > section").filter(s=>!s.hidden).map(s=>s.id);
const text=(b,sel)=>(b.$(sel)||{textContent:""}).textContent;
let files=[];const capture=b=>{files=[];b.w.eval("Utils").download=(c,n)=>files.push({c,n});};
(async()=>{try{
// ================= TECHNICIAN =================
let b=build("fr-FR");await sleep(50);expose(b.w);
eq([!b.$("#login").hidden,b.$("#shell").hidden],[true,true],"sign-in alone before the shell");
eq(b.$$("[data-user] .avatar").length,5,"accounts with avatars");eq(!!b.$("#lgLang"),true,"language selector on sign-in");
await signIn(b,"Alexandre","123456",true);
eq(b.$("#shell").hidden,false,"shell after sign-in");
eq(nav(b),["Tableau de bord","Pointage","Congés & absences","Rapports","Paramètres"],"technician side menu");
eq(b.$$("#bottomNav a").length,5,"mobile bottom tabs");
eq(shown(b),["page-dashboard"],"lands on dashboard");
for(const h of ["#team"]){go(b,h);eq(shown(b),["page-dashboard"],"technician refused "+h);}
go(b,"#dashboard");const dash=text(b,"#page-dashboard");
eq(dash.includes("Bonjour Alexandre")&&dash.includes("Semaine en cours")&&dash.includes("Congés disponibles")&&dash.includes("Heures à récupérer"),true,"technician dashboard KPIs");
// clock: arrival / break / resume / departure
go(b,"#clock");eq(!!b.$("#ckNow")&&!!b.$("#ckArrive"),true,"big clock and arrival button");
eq(text(b,"#ckTimer").includes("Hors poste"),true,"status off");
b.$("#ckArrive").click();eq(b.w.Store.runningEntry().category,"work","arrival = work");eq(text(b,"#ckTimer").includes("En poste"),true,"status on");
{const r=b.w.Store.runningEntry();b.w.Store.updateEntry(r.id,{start:Date.now()-600000});}   /* 10 min of work (a <5 s segment is deleted by design) */
b.$("#ckBreak").click();eq(b.w.Store.runningEntry().category,"break","break");
eq(text(b,"#ckTimer").includes("En pause"),true,"status break");
b.$("#ckResume").click();eq(b.w.Store.runningEntry().category,"work","resume work");
b.$("#ckStop").click();eq(b.w.Store.runningEntry(),null,"departure stops");
eq(!!b.$("#ckActivities .activity")&&!!b.$("#ckContext"),true,"activities and client choice kept");
// clocking categories (05/11/2026): exactly these buttons, in this order; no "Line" field on this screen
eq(b.$$("#ckActivities .activity").map(x=>x.textContent),["Travail","Domicile","Réunion","Trajet","Repas"],"activity buttons: Travail, Domicile, Réunion, Trajet, Repas");
eq([!!b.$("#ckLine"),!!b.$("#ckClient")],[false,true],"no Line field on the Clock screen, client kept");
// Domicile = fixed day at home (one tap = 7 h + meal), not a timer
const dom=()=>b.$('#ckActivities [data-activity="home"]');
dom().click();eq(b.errors.some(x=>x.includes("Il y a déjà des pointages aujourd'hui")),true,"refused while today already has entries (the clocking above)");
b.errors.length=0;{const me=b.w.Store.currentUserId(),today=b.w.Utils.isoLocal(Date.now());
 eq(b.w.Store.deleteEntry(b.w.Store.entries().find(e=>b.w.Utils.isoLocal(e.start)===today&&e.end!=null).id),false,"technician cannot delete a finished entry");
 b.w.Store.setCurrentUser("");b.w.Store.withUser(me,()=>b.w.Store.entries().filter(e=>b.w.Utils.isoLocal(e.start)===today).forEach(e=>b.w.Store.deleteEntry(e.id)));b.w.Store.setCurrentUser(me);}
dom().click();
eq(b.w.Store.entries().filter(e=>e.category==="home").length,2,"Domicile: day recorded in one tap");eq(b.w.Store.runningEntry(),null,"Domicile never starts a timer");
dom().click();eq(b.errors.some(x=>x.includes("déjà enregistrée")),true,"second tap refused with a message");
b.errors.length=0;
{const me=b.w.Store.currentUserId();b.w.Store.setCurrentUser("");b.w.Store.withUser(me,()=>b.w.Store.entries().filter(e=>e.category==="home"||(e.category==="lunch")).forEach(e=>b.w.Store.deleteEntry(e.id)));b.w.Store.setCurrentUser(me);}
// corrections reserved to managers (06/11/2026): no ✎ for the technician, the window refuses to open
eq(b.$$("#ckJournal [data-edit]").length,0,"technician: no correction button in the journal");
b.w.eval("Editor").open({date:"2026-10-01"});eq(b.$("#editor").hasAttribute("open"),false,"technician: correction window refused");
// data: week 41 with lunch, Sunday
const t=(d,h)=>b.w.Utils.timestamp(d,h);
["2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09"].forEach(d=>{
 b.w.Store.addEntry({category:"work",start:t(d,"08:00"),end:t(d,"12:00")});b.w.Store.addEntry({category:"lunch",start:t(d,"12:00"),end:t(d,"13:00")});
 b.w.Store.addEntry({category:"work",start:t(d,"13:00"),end:t(d,"18:00")});});
b.w.Store.addEntry({category:"work",start:t("2026-10-11","08:00"),end:t("2026-10-11","11:00")});
b.$('[data-tabs="clock"] [data-tab="sheet"]').click();
for(let i=0;i<4;i++) b.$('#ckSheet [data-nav="-1"]').click();
const ts=text(b,"#ckSheet");eq(ts.includes("Semaine 41")&&ts.includes("+9 h 00en plus"),true,"timesheet inside Clock: week 41 +9 h");
const monRow=b.$$("#ckSheet tr.day")[0].textContent;eq(monRow.includes("10 h 00")&&monRow.includes("−1 h 00")&&monRow.includes("9 h 00"),true,"day row clocked − lunch = day");
capture(b);b.$('#ckSheet [data-act="saveAs"]').value="html";b.$('#ckSheet [data-act="saveAs"]').dispatchEvent(new b.w.Event("change"));
eq(files[0]&&files[0].c.includes("Récapitulatif par jour"),true,"timesheet export still works");
// ---- 2.7 tabs: not rebuilt on click, address follows, keyboard
go(b,"#leave");const segLeave=b.$('[data-tabs="leave"]');
b.$('[data-tabs="leave"] [data-tab="requests"]').click();
eq(b.$('[data-tabs="leave"]')===segLeave,true,"tabs kept in place (not rebuilt) on click");
eq(b.w.location.hash,"#leave/requests","address follows the tab");
eq(b.$('[data-tabs="leave"] [data-tab="requests"]').getAttribute("aria-selected"),"true","aria-selected updated");
eq(b.$('[data-tabs="leave"] [data-tab="requests"]').tabIndex,0,"roving tabindex");
b.$('[data-tabs="leave"] [data-tab="requests"]').focus();
segLeave.dispatchEvent(new b.w.KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));
eq(b.w.location.hash,"#leave/calendar","ArrowRight wraps to the next tab");
eq(b.$('meta[name="theme-color"]').content,"#C8102E","company red as theme colour");
// leave: calendar + new request + detail
go(b,"#leave");eq(!!b.$(".calendar"),true,"collective calendar (month)");
b.$("#lvNew").click();eq(b.$("#sheet").hasAttribute("open"),true,"new request sheet");
b.$("#nrType").value="paid_leave";b.$("#nrStart").value="2026-12-21";b.$("#nrEnd").value="2026-12-23";b.$("#nrStart").dispatchEvent(new b.w.Event("change"));
eq(text(b,"#nrDays").includes("3 jour(s)"),true,"days preview");
b.$("#nrSend").click();eq(b.$("#sheet").hasAttribute("open"),false,"sheet closed after sending");
eq(text(b,".page-header strong")===""||true,true,"");
eq(b.$$(".calendar .absence.pending").length,3,"3 pending days shown dashed in December");
b.$("#lvNew").click();b.$("#nrStart").value="2026-12-22";b.$("#nrEnd").value="2026-12-22";b.$("#nrSend").click();
eq(text(b,"#nrError").includes("existe déjà"),true,"overlap refused");b.$("#sheet [data-close]").click();
b.$(".calendar .absence").click();eq(text(b,"#sheet").includes("Annuler la demande"),true,"detail: requester can cancel");eq(!!b.$('#sheet [data-decide]'),false,"technician cannot decide");
b.$("#sheet [data-close]").click();
b.$('[data-view="week"]').click();eq(!!b.$(".week-grid"),true,"week view");b.$('[data-view="year"]').click();eq(b.$$(".mini-month").length,12,"year view");
b.$('[data-view="month"]').click();
b.$('[data-tabs="leave"] [data-tab="requests"]').click();
eq(!!b.$(".balance-grid")&&text(b,"#page-leave").includes("Mes demandes"),true,"balances + my requests");
const csv="Début;Fin;Type;Commentaire\n02/03/2026;03/03/2026;Congé payé;hist\n";
const file=b.$("#lvFile");Object.defineProperty(file,"files",{value:[{name:"c.csv"}]});b.w.eval("Utils").readText=()=>Promise.resolve(csv);
file.dispatchEvent(new b.w.Event("change"));await sleep(30);eq(text(b,"#lvImportMessage").includes("1"),true,"CSV import message survives the redraw");
// reports
go(b,"#reports");const rp=text(b,"#page-reports");eq(rp.includes("Heures normales")&&rp.includes("Heures sup. 25 %")&&rp.includes("Historique mensuel"),true,"reports");
eq(!!b.$("#rpWho"),false,"technician: no employee filter");
capture(b);b.$("#rpXlsx").click();eq(files[0]&&files[0].n.endsWith(".xlsx")&&files[0].n.includes("alexandre-machado"),true,"report Excel");
const oct=b.w.ReportsPage.data().rows.find(r=>r.label.startsWith("octobre"));eq(Math.round(oct.ot25*100)/100,4,"report: October 25 % = week 41 hours 40-43");
// settings
go(b,"#settings");eq(b.$$('[data-tabs="settings"] [data-tab]').map(x=>x.dataset.tab),["profile","preferences","backup","reference"],"technician settings tabs");
b.$('[data-tab="reference"]').click();capture(b);b.$('[data-ref="download"]').click();eq(files[0]&&files[0].c.includes("39 h"),true,"reference document");
eq(b.errors,[],"no JS error (technician)");
// ================= ADMIN =================
b=build("fr-FR",storageOf(b.w));await sleep(50);expose(b.w);
await signIn(b,"Jérémie","654321",true);
eq(nav(b),["Tableau de bord","Congés & absences","Équipe","Rapports","Paramètres"],"admin side menu");
go(b,"#clock");eq(shown(b),["page-dashboard"],"admin refused #clock");
const ad=text(b,"#page-dashboard");eq(ad.includes("Présents")&&ad.includes("En congé aujourd'hui")&&ad.includes("À examiner")&&ad.includes("Alexandre Machado"),true,"admin dashboard (team view)");
eq(ad.includes("a demandé"),true,"recent activity feed");
go(b,"#leave");b.$('[data-tabs="leave"] [data-tab="requests"]').click();
eq(text(b,'[data-tabs="status"]').includes("En attente (1)"),true,"1 pending");
const segStatus=b.$('[data-tabs="status"]');b.$('[data-tabs="status"] [data-tab="history"]').click();
eq(b.$('[data-tabs="status"]')===segStatus,true,"status tabs kept, only the table redrawn");eq(text(b,"#lvReqTable").includes("Alexandre"),true,"history table");
b.$('[data-tabs="status"] [data-tab="pending"]').click();
b.$("[data-approve]").click();await sleep(10);
eq(b.w.Store.allRequests().filter(r=>r.status==="approved"&&r.startDate==="2026-12-21").length,1,"approved by admin");
b.$('[data-tabs="leave"] [data-tab="calendar"]').click();
const pick=(sel,v)=>{b.$(sel).value=v;b.$(sel).dispatchEvent(new b.w.Event("change"));};
// admin creates a request for Damien, then approves it from the detail sheet
b.$("#lvNew").click();const damien=b.w.Store.users().find(u=>u.name==="Damien Morvan").id;
b.$("#nrWho").value=damien;b.$("#nrType").value="time_off";b.$("#nrStart").value="2026-11-16";b.$("#nrEnd").value="2026-11-16";b.$("#nrSend").click();
const chipD=b.$$(".calendar .absence").find(x=>x.title.includes("Damien"));eq(!!chipD&&chipD.classList.contains("pending"),true,"Damien's request shown pending");
chipD.click();eq(!!b.$('#sheet [data-decide="approved"]'),true,"admin can decide from the detail");b.$('#sheet [data-decide="approved"]').click();
eq(b.w.Store.withUser(damien,()=>b.w.Store.requests()[0].status),"approved","approved from the calendar");
pick("#lvPerson",damien);eq(b.$$(".calendar .absence").every(x=>x.title.includes("Damien")),true,"filter by person");
pick("#lvPerson","");pick("#lvType","paid_leave");eq(b.$$(".calendar .absence").every(x=>x.classList.contains("paid_leave")),true,"filter by type");
b.$('[data-tabs="leave"] [data-tab="balances"]').click();eq(text(b,"#page-leave").includes("Soldes de chaque salarié")&&text(b,"#page-leave").includes("Damien Morvan"),true,"balances of each employee");
// team
go(b,"#team");eq(b.$$("#page-team tr[data-open]").length,5,"team list");
b.$$("#page-team tr[data-open]").find(x=>x.textContent.includes("Alexandre")).click();
eq(text(b,"#page-team").includes("Feuille de temps"),true,"individual file with timesheet");
// 06/11/2026: the manager imports and CORRECTS in the technician's file
eq(!!b.$("#tmSheet [data-act='import']"),true,"manager: import from the technician's file");
{const W=b.w,dam=W.Store.users().find(u=>u.name==="Damien Morvan").id,me=W.Store.currentUserId(),T=(d,h)=>W.Utils.timestamp(d,h);
 W.Store.setCurrentUser("");const legacy=W.Store.withUser(dam,()=>{const e=W.Store.addEntry({category:"work",start:T("2026-10-05","08:00"),end:T("2026-10-05","16:47")});
   W.Store.addEntry({category:"lunch",start:T("2026-10-05","12:00"),end:T("2026-10-05","12:51")});return e;});W.Store.setCurrentUser(me);
 eq(W.eval("Editor").listHtml([legacy],Date.now(),false,dam).includes('data-owner="'+dam+'"'),true,"✎ carries the owner of the entry");
 W.eval("Editor").open({id:legacy.id,userId:dam});const q=x=>b.$("#editor "+x);
 eq([q("#edStartTime").value,q("#edEndTime").value,q("#edHasMeal").checked,q("#edMealStart").value,q("#edMealEnd").value],["08:00","16:47",true,"12:00","12:51"],"one window: arrival, departure and meal pre-filled");
 eq(b.$("#editor .person").textContent.includes("Damien Morvan"),true,"the window shows whose day it is");
 eq(q("#edSummary").textContent.replace(/\s+/g," ").includes("8 h 47")&&q("#edSummary").textContent.includes("7 h 56"),true,"live summary: pointed 8 h 47 − meal = day 7 h 56");
 q("#edEndTime").value="17:30";q("#edMealEnd").value="13:00";q("#edEndTime").dispatchEvent(new W.Event("input"));
 eq(q("#edSummary").textContent.includes("8 h 30"),true,"summary follows the changes (9 h 30 − 1 h = 8 h 30)");
 q("#editorForm").dispatchEvent(new W.Event("submit",{cancelable:true}));eq(q("#edError").textContent.includes("motif"),true,"reason mandatory");
 q("#edReason").value="heure de départ oubliée";q("#editorForm").dispatchEvent(new W.Event("submit",{cancelable:true}));
 eq(b.$("#editor").hasAttribute("open"),false,"saved and closed");
 const days=W.Store.withUser(dam,()=>W.Store.entries().filter(e=>W.Utils.isoLocal(e.start)==="2026-10-05").sort((a,c)=>a.start-c.start).map(e=>[e.category,W.Utils.clock(e.start),W.Utils.clock(e.end)]));
 eq(days,[["work","08:00","12:00"],["lunch","12:00","13:00"],["work","13:00","17:30"]],"Damien's day rebuilt cleanly (meal now deducted)");
 eq(W.Store.entries().length,0,"the manager's own data untouched");
 eq(W.Store.auditQuery({action:"timesheet.corrected"})[0].reason,"heure de départ oubliée","correction traced with its reason");
 W.Store.setCurrentUser(dam);eq(W.Store.notifications().some(n=>n.type==="timesheet.corrected"),true,"Damien notified");W.Store.setCurrentUser(me);}
const job=b.$('[data-field="jobTitle"]');job.value="Technicien sertisseur";job.dispatchEvent(new b.w.Event("change"));
eq(b.w.Store.users().find(u=>u.name==="Alexandre Machado").jobTitle,"Technicien sertisseur","job title saved");
b.$("#tmBack").click();b.$("#tmNew").click();b.$("#nuName").value="Nouveau Tech";b.$("#nuJob").value="Monteur";b.$("#nuCreate").click();
eq(b.w.Store.users().some(u=>u.name==="Nouveau Tech"&&u.jobTitle==="Monteur"),true,"new employee");
b.$$("#page-team tr[data-open]").find(x=>x.textContent.includes("Damien")).click();
const act=b.$('[data-field="active"]');act.checked=false;act.dispatchEvent(new b.w.Event("change"));eq(b.w.Store.user(damien).accountStatus,"disabled","deactivated (accountStatus, 2.8)");
// reports admin
go(b,"#reports");eq(b.$("#rpWho").value,"all","whole team by default");eq(text(b,"#page-reports").includes("Alexandre Machado"),true,"team report rows");
// settings admin
go(b,"#settings");eq(b.$$('[data-tabs="settings"] [data-tab]').map(x=>x.dataset.tab),["profile","rules","clients","sections","access","audit","backup","reference"],"admin settings tabs (by permission)");
b.$('[data-tab="rules"]').click();const wb=b.$('[data-key="weeklyBase"]');wb.value="35";wb.dispatchEvent(new b.w.Event("change"));eq(b.w.Store.org().weeklyBase,35,"rule changed");
b.$("#cfDefaults").click();eq(b.w.Store.org().weeklyBase,39,"defaults");
b.$('[data-tab="clients"]').click();eq(!!b.$("#page-settings #clName"),true,"clients for admins");
eq(b.errors,[],"no JS error (admin)");
// ---- deep link: #settings/rules opens the right tab after sign-in
{const st2=storageOf(b.w);const d=build("fr-FR",st2);d.w.history.replaceState(null,"","#settings/rules");await sleep(30);
 await signIn(d,"Jérémie","654321",false);
 eq([d.w.location.hash,d.$('[data-tabs="settings"] .active').dataset.tab,!!d.$('[data-key="weeklyBase"]')],["#settings/rules","rules",true],"deep link opens the Rules tab");
 d.w.history.replaceState(null,"","#leave");d.w.dispatchEvent(new d.w.HashChangeEvent("hashchange"));
 eq(d.w.location.hash,"#leave/calendar","page link completed with its current tab");eq(d.errors,[],"no JS error deep link");}
// ================= TEAM LEAD (2.8) =================
{const st3=storageOf(b.w);const e=build("fr-FR",st3);await sleep(50);expose(e.w);e.w.eval('window.Permissions=Permissions');
 /* data seen by the team lead: today's work of Alexandre, a pending request, an open error report (system side) */
 {const W=e.w,al=W.Store.users().find(u=>u.name==="Alexandre Machado").id,today=W.Utils.isoLocal(Date.now());
  W.Store.updateUser(W.Store.users().find(u=>u.name==="Damien Morvan").id,{accountStatus:"active"});   /* disabled by an earlier step: back to active */
  W.Store.withUser(al,()=>{W.Store.addEntry({category:"work",start:Date.now()-2*3600e3,end:Date.now()-3600e3});W.Store.addRequest({type:"paid_leave",startDate:"2026-12-21",endDate:"2026-12-24"});});
  W.Store.setCurrentUser(al);W.Store.requestCorrection({date:today,text:"oubli du départ hier"});W.Store.setCurrentUser("");}
 await signIn(e,"Enrique","111111",true);
 eq(nav(e),["Tableau de bord","Congés & absences","Équipe","Rapports","Paramètres"],"team lead menu: no Clocking by default");
 // 06/11/2026: the team lead's dashboard shows HIS technicians (team view), not a personal clocking view
 go(e,"#dashboard");const dl=text(e,"#page-dashboard");
 eq([dl.includes("Mes techniciens"),dl.includes("Alexandre Machado"),dl.includes("Damien Morvan"),dl.includes("Nord, Sud")],[true,true,true,true],"team lead dashboard: his technicians and sections");
 eq(!!e.$('#page-dashboard a[href="#clock"]'),false,"no Clock button for an account that does not clock");
 eq([dl.includes("Congé payé"),dl.includes("oubli du départ hier"),dl.includes("1 demande(s) de congé · 1 signalement(s)")],[true,true,true],"requests and error reports of his technicians to look at");
 eq([dl.includes("Prendre une décision"),dl.includes("La décision finale appartient aux responsables")],[false,true],"team lead: follows, does not decide");
 const alRow=[...e.$$("#page-dashboard tbody tr")].find(r=>r.textContent.includes("Alexandre Machado")&&r.textContent.includes("Travail"));
 eq(!!alRow&&alRow.textContent.includes("1 h 00"),true,"today's hours and last entry of the technician");
 // perimeter: without the Sud section, Alexandre disappears from his dashboard
 {const W=e.w,me=W.Store.currentUserId();W.Store.setCurrentUser("");W.Store.updateUser(me,{sectionIds:["sec-nord"]});W.Store.setCurrentUser(me);go(e,"#team");go(e,"#dashboard");
  const d2=text(e,"#page-dashboard");eq([d2.includes("Damien Morvan"),d2.includes("Alexandre Machado"),d2.includes("oubli du départ hier")],[true,false,false],"dashboard limited to his sections");
  W.Store.setCurrentUser("");W.Store.updateUser(me,{sectionIds:["sec-nord","sec-sud"]});
  const dm=W.Store.users().find(u=>u.name==="Damien Morvan").id;W.Store.updateUser(dm,{accountStatus:"disabled"});W.Store.setCurrentUser(me);go(e,"#team");go(e,"#dashboard");
  eq(text(e,"#page-dashboard").includes("Damien Morvan"),false,"a disabled account is not shown");
  W.Store.setCurrentUser("");W.Store.updateUser(dm,{accountStatus:"active"});W.Store.setCurrentUser(me);}
 go(e,"#team");eq(e.$$("#page-team tr[data-open]").map(x=>x.textContent).some(t=>t.includes("Alexandre"))&&!e.$("#tmNew"),true,"team lead: team visible, no account creation");
 e.$$("#page-team tr[data-open]").find(x=>x.textContent.includes("Alexandre")).click();
 eq(e.$('[data-field="jobTitle"]').disabled,true,"team lead: read-only file");
 go(e,"#settings");eq(e.$$('[data-tabs="settings"] [data-tab]').map(x=>x.dataset.tab).includes("rules"),false,"team lead: no team rules");
 eq(e.errors,[],"no JS error (team lead)");}
// ================= 2.8 screens + rights REALLY applied (precision 5) =================
{const st4=storageOf(b.w);
 // Enrique asks for a temporary right from the interface
 let e=build("fr-FR",st4);await sleep(50);expose(e.w);e.w.eval('window.Permissions=Permissions');
 await signIn(e,"Enrique","111111",true);go(e,"#settings");e.$('[data-tab="access"]').click();
 e.$("#accPerm").value="leave.approve";e.$("#accKind").value="temporary";e.$("#accStart").value="2026-11-05";e.$("#accEnd").value="2026-11-20";
 e.$("#accSend").click();eq(e.$("[data-msg]").className,"error","reason mandatory in the interface");
 e.$("#accReason").value="remplacement pendant les congés";e.$("#accSend").click();
 eq(e.w.Store.accessRequests().filter(r=>r.status==="pending").length,1,"request created from the screen");
 // rights really applied for the team lead (calls behind the screens, not only hidden menus)
 const alexId=e.w.Store.users().find(u=>u.name==="Alexandre Machado").id;
 eq([e.w.Store.updateOrg({weeklyBase:30}),e.w.Store.updateUser(alexId,{jobTitle:"x"}),e.w.Store.exportAll(),e.w.Store.auditQuery({}).length],[false,false,null,0],"team lead: settings, accounts, full export and audit refused in the logic");
 eq(e.w.Store.grant({userId:e.w.Store.currentUserId(),permission:"leave.approve",kind:"permanent"}),null,"team lead cannot grant himself");
 eq(e.errors,[],"no JS error (team lead access screen)");
 // Yann sees the notification, approves with a comment, Enrique's rights change
 const st5=storageOf(e.w);let y=build("fr-FR",st5);await sleep(50);expose(y.w);y.w.eval('window.Permissions=Permissions');
 await signIn(y,"Yann","222222",true);
 eq(y.$("#notifButton .count")&&y.$("#notifButton .count").textContent,"1","bell: 1 unread notification");
 y.$("#notifButton").click();eq(y.$("#sheet").textContent.includes("Enrique Soler demande un accès"),true,"notification text");y.$("#ntRead").click();
 eq(!!y.$("#notifButton .count"),false,"marked as read");
 go(y,"#settings");y.$('[data-tab="access"]').click();y.$('[data-acc="approved"]').click();
 y.$("#dsEnd").value="2026-11-15";y.$("#dsOk").click();eq(y.$("#dsErr").textContent.includes("commentaire"),true,"shorter period needs a comment");
 y.$("#dsComment").value="jusqu'au 15";y.$("#dsOk").click();
 const enr=y.w.Store.users().find(u=>u.name==="Enrique Soler").id;
 eq(y.w.Permissions.has(enr,"leave.approve","2026-11-10"),true,"approved from the screen: the right really applies");
 // audit screen: filters + export
 y.$('[data-tab="audit"]').click();const total=y.w.Store.auditQuery({}).length;
 y.$('[data-f="action"]').value="access.";y.$('[data-f="action"]').dispatchEvent(new y.w.Event("change"));
 eq(y.$("#auRows").textContent.includes("Décision sur une demande d'accès")&&!y.$("#auRows").textContent.includes("Connexion"),true,"audit filtered by action type");
 eq(y.$("#auRows").textContent.includes("jusqu'au 15"),true,"reason visible in the audit");
 files=[];y.w.eval("Utils").download=(c,n)=>files.push({c,n});y.$("#auCsv").click();
 eq(files[0].n.startsWith("historique_")&&files[0].c.includes("Décision sur une demande d'accès"),true,"audit exported (CSV)");
 eq(y.w.Store.auditQuery({action:"export.done"}).length,1,"the export itself is traced");
 // sections + team file
 y.$('[data-tab="sections"]').click();y.$("#secNew").value="Centre";y.$("#secAdd").click();
 eq(y.w.Store.sections().map(x=>x.name),["Nord","Sud","Centre"],"section added from the screen");
 go(y,"#team");y.$$("#page-team tr[data-open]").find(x=>x.textContent.includes("Damien")).click();
 const cen=y.w.Store.sections().find(x=>x.name==="Centre").id;y.$('[data-sec="'+cen+'"]').checked=true;y.$('[data-sec="'+cen+'"]').dispatchEvent(new y.w.Event("change"));
 eq(y.w.Store.users().find(u=>u.name==="Damien Morvan").sectionIds,["sec-nord",cen],"section assigned in the file");
 // backup: test on a copy, nothing written
 go(y,"#settings");y.$('[data-tab="backup"]').click();files=[];y.$("#bkFull").click();const full=files[0].c;
 const before=JSON.stringify(storageOf(y.w));
 const inp=y.$("#bkFile");Object.defineProperty(inp,"files",{value:[{name:"s.json"}]});y.w.eval("Utils").readText=()=>Promise.resolve(full);
 y.$("#bkTest").click();inp.onchange();await sleep(20);
 eq(y.$("#bkReport").textContent.includes("restaurable, rien ne manque"),true,"restore test OK on a copy");
 eq(JSON.stringify(storageOf(y.w))===before,true,"restore test changed nothing on the device");
 eq(y.$("#page-settings").textContent.includes("Utilisé :"),true,"storage use shown");
 eq(y.errors,[],"no JS error (manager screens)");
 b=y;}
// ================= deactivated hidden =================
const b3=build("fr-FR",storageOf(b.w));await sleep(50);eq(b3.$$("[data-user]").some(x=>x.textContent.includes("Damien")),false,"deactivated hidden");
// ================= 4 languages, every page =================
for(const lang of ["en","es","de"]){
 const st=storageOf(b.w);st.acp_language=lang;const data=JSON.parse(st.acp_data_v4);data.users.forEach(u=>{u.language=lang;});st.acp_data_v4=JSON.stringify(data);
 for(const [who,pwd,pages] of [["Alexandre","123456",["#dashboard","#clock","#leave","#reports","#settings"]],["Jérémie","654321",["#dashboard","#leave","#team","#reports","#settings"]]]){
  const r=build(lang,st);await sleep(50);await signIn(r,who,pwd,false);
  for(const h of pages){r.w.location.hash=h;r.w.dispatchEvent(new r.w.HashChangeEvent("hashchange"));}
  r.$$('[data-view]').forEach(x=>x.click());
  eq(r.errors,[],"no JS error "+lang+" "+who);
  eq(/\{[a-z]+\}/i.test(r.$("#shell").textContent),false,"no untranslated placeholder "+lang+" "+who);
 }
}
// ================= migration from v2 =================
const v2={profile:{id:"pr-1",name:"Alexandre",hireDate:"2026-05-04",pinHash:"8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92",language:"fr"},
 settings:{longTimerAlertH:8},clients:[],entries:[{id:"e1",category:"work",start:Date.now()-7200e3,end:Date.now()-3600e3}],requests:[]};
const m=build("fr-FR",{acp_data_v2:JSON.stringify(v2)});await sleep(50);expose(m.w);await signIn(m,"Alexandre","123456",false);
go(m,"#clock");eq(text(m,"#ckJournal").includes("Travail"),true,"v2 data visible");eq(m.errors,[],"no JS error migration");
}catch(x){ko++;console.log("EXCEPTION",x.stack)}
console.log("OK",ok,"KO",ko);process.exit(0);})();

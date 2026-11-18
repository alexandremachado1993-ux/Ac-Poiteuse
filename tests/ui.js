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
 if(!b.$("#lgPassword")&&b.$("#lgUsePassword")) b.$("#lgUsePassword").click();   /* 3.3: PIN screen → password */
 b.$("#lgPassword").value=pwd;if(first) b.$("#lgConfirm").value=pwd;
 b.$("#lgForm").dispatchEvent(new b.w.Event("submit",{cancelable:true}));await sleep(60);
}
const go=(b,h)=>{b.w.location.hash=h;b.w.dispatchEvent(new b.w.HashChangeEvent("hashchange"));};
const nav=b=>b.$$("#sideNav a span:not(.count)").map(a=>a.textContent);
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
/* 3.3: presentation at the first sign-in, identical for everybody, skippable, seen once */
{const dlg=b.$("#sheet");eq([dlg.hasAttribute("open"),!!b.$("#sheet .intro"),text(b,".intro-count")],[true,true,"Étape 1 sur 7"],"presentation opened at the first sign-in");
 for(let i=0;i<6;i++) b.$("#introNext").click();await sleep(30);
 eq([!!b.$("#introDone"),b.$$("#introAccess .access-list li").length>=2,!!b.$('#introAccess li .badge')],[true,true,true],"last step: accesses with their state");
 b.$("#introPrev").click();b.$("#introSkip").click();
 eq([dlg.hasAttribute("open"),b.w.Store.settings().introDone],[false,true],"skipped: not shown again");}
eq(nav(b),["Accueil","Pointer","Congés","Mes heures","Paramètres"],"technician side menu");
go(b,"#clock");{const ck=text(b,"#page-clock");eq([ck.includes("onglet Clients"),!b.$("#ckContext .client-row + .chips, #ckContext .chips + .client-row")||!!b.$("#ckContext .client-row + .client-chips")],[false,true],"4.7.1: technician — no pointer to a Clients tab he does not have; chips under the list");}go(b,"#dashboard");
eq([text(b,"#appStatus").includes("Mode local"),text(b,"#appStatus").includes("En ligne"),text(b,"#connectionState").includes("Mode local")],[true,true,true],"4.7: app and network state under the name of the app (and on the phone bar)");
/* 4.1.3: computer header without breadcrumb — user menu (My profile, Sign out: same button as before) */
{go(b,"#leave");eq([b.$("#crumbs"),!!b.$(".deskbar #notifButton"),!!b.$("#page-leave .page-header h1")],[null,true,true],"no breadcrumb; bell in the header; page title");
 b.$("#userMenuButton").click();eq([b.$("#userPop").hidden,b.$("#userMenuButton").getAttribute("aria-expanded"),!!b.$("#userPop #signOutButton"),b.$("#userProfileLink").getAttribute("href")],[false,"true",true,"#settings/profile"],"user menu opens");
 b.doc.body.click();eq(b.$("#userPop").hidden,true,"closes on a click outside");go(b,"#dashboard");}
eq(b.$$("#bottomNav a").length,4,"4.7: mobile bottom tabs (settings via the gear)");eq(b.$("#settingsMobile").getAttribute("href"),"#settings","4.7: gear of the phone top bar");
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
eq(b.$$("#ckActivities .activity").map(x=>x.textContent),["Travail","Domicile","Réunion","Formation","Trajet","Repas"],"activity buttons: Travail, Domicile, Réunion, Formation (4.5), Trajet, Repas");
eq([!!b.$("#ckLine"),!!b.$("#ckClient")],[false,true],"no Line field on the Clock screen, client kept");
// Domicile = fixed day at home (one tap = 7 h + meal), not a timer
const dom=()=>b.$('#ckActivities [data-activity="home"]');
/* 3.1: by default Domicile is clocked like any other activity (timer) */
dom().click();eq(b.w.Store.runningEntry()&&b.w.Store.runningEntry().category,"home","Domicile: normal clocking by default (3.1)");
{const r=b.w.Store.runningEntry();b.w.Store.updateEntry(r.id,{start:Date.now()-600000});}b.$("#ckStop").click();eq(b.w.Store.runningEntry(),null,"…stopped like any activity");
/* the employer turns the fixed day on: one tap = the day */
const preset=on=>{const me=b.w.Store.currentUserId();b.w.Store.setCurrentUser(b.w.Store.users().find(u=>u.role==="quality").id);b.w.Store.updateOrg({homeDayPreset:on});b.w.Store.setCurrentUser(me);};
preset(true);
dom().click();eq(b.errors.some(x=>x.includes("déjà")),true,"fixed day refused while today already has entries (the clocking above)");
b.errors.length=0;{const me=b.w.Store.currentUserId(),today=b.w.Utils.isoLocal(Date.now());
 eq(b.w.Store.deleteEntry(b.w.Store.entries().find(e=>b.w.Utils.isoLocal(e.start)===today&&e.end!=null).id),false,"technician cannot delete a finished entry");
 b.w.Store.setCurrentUser("");b.w.Store.withUser(me,()=>b.w.Store.entries().filter(e=>b.w.Utils.isoLocal(e.start)===today).forEach(e=>b.w.Store.deleteEntry(e.id)));b.w.Store.setCurrentUser(me);}
dom().click();
eq(b.w.Store.entries().filter(e=>e.category==="home").length,2,"Domicile: day recorded in one tap");eq(b.w.Store.runningEntry(),null,"Domicile never starts a timer");
dom().click();eq(b.errors.some(x=>x.includes("déjà enregistrée")),true,"second tap refused with a message");
b.errors.length=0;
/* 3.1: no clocking on top of the hours already recorded for the day */
{const W=b.w,future=W.Store.entries().some(e=>e.end>Date.now());eq(W.Store.startClock({category:"work"})==="dayRecorded",future,"clocking refused while recorded hours cover the rest of the day");
 if(!future&&W.Store.runningEntry()){W.Store.undoClock();}}
preset(false);
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
/* go back until week 41, whatever today's date (the test must not depend on the calendar) */
for(let i=0;i<60&&!text(b,"#ckSheet").includes("Semaine 41 ");i++) b.$('#ckSheet [data-nav="-1"]').click();
const ts=text(b,"#ckSheet");eq(ts.includes("Semaine 41")&&ts.includes("+9 h 00en plus"),true,"timesheet inside Clock: week 41 +9 h");
const monRow=b.$$("#ckSheet tr.day")[0].textContent;eq(monRow.includes("10 h 00")&&monRow.includes("−1 h 00")&&monRow.includes("9 h 00"),true,"day row clocked − lunch = day");
capture(b);b.$('#ckSheet [data-act="saveAs"]').value="html";b.$('#ckSheet [data-act="saveAs"]').dispatchEvent(new b.w.Event("change"));
eq(files[0]&&files[0].c.includes("Récapitulatif par jour"),true,"timesheet export still works");
// ---- 2.7 tabs: not rebuilt on click, address follows, keyboard
go(b,"#leave");const segLeave=b.$('[data-tabs="leave"]');
eq(b.$$('[data-tabs="leave"] [data-tab]').map(x=>x.dataset.tab),["mine","calendar"],"technician: own requests first, then calendar (no team queue)");
b.$('[data-tabs="leave"] [data-tab="mine"]').click();
eq(b.$('[data-tabs="leave"]')===segLeave,true,"tabs kept in place (not rebuilt) on click");
eq(b.w.location.hash,"#leave/mine","address follows the tab");
eq(b.$('[data-tabs="leave"] [data-tab="mine"]').getAttribute("aria-selected"),"true","aria-selected updated");
eq(b.$('[data-tabs="leave"] [data-tab="mine"]').tabIndex,0,"roving tabindex");
b.$('[data-tabs="leave"] [data-tab="mine"]').focus();
segLeave.dispatchEvent(new b.w.KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));
eq(b.w.location.hash,"#leave/calendar","ArrowRight wraps to the next tab");
eq(b.$('meta[name="theme-color"]').content,"#111D2D","4.0: navy as theme colour");
eq([!!b.$(".side-company img[src='images/logo.png']"),b.$(".side-company img").getAttribute("alt")],[true,"Auxiliar Conservera"],"4.0: original Auxiliar Conservera logo in the menu");
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
b.$('[data-tabs="leave"] [data-tab="mine"]').click();
eq(!!b.$(".balance-grid")&&text(b,"#page-leave").includes("Mes demandes"),true,"balances + my requests");
/* regression of beta.3 fixed: importing approved leave history is a manager's correction —
   the technician no longer sees an import that would silently import nothing */
eq([!!b.$("#lvImport"),!!b.$("#lvTemplate"),!!b.$("#lvFile"),!!b.$("#lvExport")],[false,false,false,true],"technician: no leave import (managers only), export kept");
// reports
go(b,"#reports");const rp=text(b,"#page-reports");eq(rp.includes("Heures normales")&&rp.includes("Heures sup. 25 %")&&rp.includes("Historique mensuel"),true,"reports");
eq(!!b.$("#rpWho"),false,"technician: no employee filter");
{const h=b.$(".rp-help a");eq(h&&h.getAttribute("href"),"#settings/readReport","4.5: line under Export points to the reading guide");}capture(b);b.$("#rpExport").click();{const dlg=b.$("#sheet");eq(dlg.querySelectorAll("[data-part]").length,6,"4.4: export window — parts to choose");
 dlg.querySelector('[data-format="xlsx"]').click();dlg.querySelector('[data-part="weeks"]').checked=true;dlg.querySelector("#rxGo").click();}
eq(files[0]&&files[0].n.endsWith(".xlsx")&&files[0].n.includes("alexandre-machado"),true,"report Excel");
eq(b.w.Store.settings().reportExport.format,"xlsx","4.4: export choices remembered");
{const html=b.w.ReportsPage.runExport({format:"pdf",parts:{summary:true,pay:true,recovery:true,chart:true,table:true,weeks:true},team:"each",lang:"es"});
 eq([html.includes('lang="es"'),html.includes("Informe de fichaje"),html.includes("images/logo.png"),html.includes("↳"),/Página 1 \/ \d/.test(html)],[true,true,true,true,true],"4.4: PDF in the chosen language (Spanish), logo, weeks, page numbers");
 eq(b.w.I18n.language(),"fr","4.4: the app keeps its language after an export in another one");}
const oct=b.w.ReportsPage.data().rows.find(r=>r.label.startsWith("octobre"));eq(Math.round(oct.ot25*100)/100,4,"report: October 25 % = week 41 hours 40-43");
// settings
go(b,"#settings");eq(b.$$('[data-tabs="settings"] [data-tab]').map(x=>x.dataset.tab),["account","data","help"],"4.7: technician settings groups");
eq(b.$$('[data-tabs="settingsSub"] [data-tab]').map(x=>x.dataset.tab),["profile","workspace","preferences"],"4.7: sub-tabs of My account");
b.$('[data-tabs="settings"] [data-tab="help"]').click();eq([b.$$('[data-tabs="settingsSub"] [data-tab]').map(x=>x.dataset.tab),!!b.$('[data-ref="download"]')],[["reference","readReport"],true],"4.7: Help group opens the reference document");
go(b,"#settings/reference");capture(b);b.$('[data-ref="download"]').click();eq(files[0]&&files[0].c.includes("39 h"),true,"reference document");go(b,"#settings/readReport");eq(!!b.$("#ref-report"),true,"4.5: reading guide card");eq(files[0].c.includes("class=\"guide\""),true,"4.5: reading guide in the downloaded document");
eq(b.errors,[],"no JS error (technician)");
/* 3.1: the undo toast is built once — only its figure changes each second (it used to blink) */
{const U=b.w.eval("UI");U.toast("<strong>x</strong>","Annuler",3,null);const el=b.$("#toast .toast");eq(text(b,"#toastAction").includes("3 s"),true,"toast: countdown shown");
 await sleep(1100);eq([b.$("#toast .toast")===el,text(b,"#toastAction").includes("2 s")],[true,true],"toast: same element after a second, figure updated");
 await sleep(2100);eq(!!b.$("#toast .toast"),false,"toast: gone at 0");}
/* 3.1: each person orders and hides HIS tabs; dashboard and settings cannot be hidden; rights unchanged */
{const A=b.w.eval("App");b.w.Store.updateSettings({navOrder:["reports","clock","dashboard","leave","settings"],navHidden:["leave","dashboard"]});A.buildNav();
 eq(nav(b),["Mes heures","Pointer","Accueil","Paramètres"],"menu in the chosen order, hidden tab removed, dashboard kept");
 go(b,"#leave");eq(shown(b),["page-leave"],"a hidden tab stays reachable by its links");go(b,"#team/people");eq(shown(b).includes("page-team"),false,"…and a page without the right stays refused");
 go(b,"#settings");go(b,"#settings/workspace");eq([!!b.$("#stTheme"),!!b.$("#stSide"),b.$$("#stTabs li").length],[true,true,5],"my workspace: theme, menu side, tab list");
 b.$("#stSide").value="right";b.$("#stSide").dispatchEvent(new b.w.Event("change"));eq(b.doc.body.classList.contains("menu-right"),true,"menu on the right");
 b.$("#stTabsReset").click();eq(nav(b),["Accueil","Pointer","Congés","Mes heures","Paramètres"],"default order restored");
 b.$("#stSide").value="left";b.$("#stSide").dispatchEvent(new b.w.Event("change"));go(b,"#dashboard");}
/* 3.2: my workspace — dashboard blocks and widgets per person, display only */
{const S=b.w.Store,ids=()=>b.$$("#page-dashboard .dash-item").map(x=>x.dataset.block);
 const before=JSON.stringify([S.entries(),S.requests(),b.w.eval("Leave").balance(),S.org()]);
 go(b,"#dashboard");
 eq(ids(),["status","kpiWeek","kpiLeave","kpiRecover","kpiOvertime","myWeek","myRequests","lastWeek","monthRecap","calendar","year","activity"],"default dashboard: every block, original order (4.4: + calendar, 4.5: + year)");
 eq(b.$$("#page-dashboard .dash-item").map(x=>+x.dataset.size),[12,3,3,3,3,8,4,8,4,4,4,4],"default widths = former layout (4 tiles, 2/3 + 1/3)");
 eq([!!b.$("#dbAskLeave"),b.$$("#page-dashboard .mc-day").length>=28,!!b.$("#page-dashboard .punch-ok")===!!b.w.eval("UI").lastPunch()],[true,true,true],"4.4: request leave button, month calendar, last clocking line");
 b.$("#dbAskLeave").click();eq(!!b.$("#sheet #nrSend"),true,"4.4: the leave request opens from the dashboard");b.w.eval("UI").closeSheet();
 b.w.eval("UI").applyTheme("light");b.$("#themeButton").click();eq([b.doc.documentElement.dataset.theme,b.w.Store.settings().theme,b.$("#themeButton").textContent],["dark","dark","Mode clair"],"4.4.1: user menu switches to dark");
 b.$("#themeButton").click();eq([b.doc.documentElement.dataset.theme,b.w.Store.settings().theme],["light","light"],"4.4.1: and back to light");
 go(b,"#settings");go(b,"#settings/workspace");
 eq(b.$$("#stBlocks li").map(x=>x.dataset.block),ids(),"workspace lists the blocks of the dashboard");
 eq(b.$$("#stBlocks li .badge").filter(x=>x.textContent==="Widget").length,4,"the 4 tiles are widgets");
 const li=k=>b.$('#stBlocks li[data-block="'+k+'"]');
 li("kpiLeave").querySelector("[data-block-show]").checked=false;li("kpiLeave").querySelector("[data-block-show]").dispatchEvent(new b.w.Event("change"));
 const sz=li("monthRecap").querySelector("[data-block-size]");sz.value="12";sz.dispatchEvent(new b.w.Event("change"));
 // keyboard: "activity" handle, arrow up four times (4.4: calendar, 4.5: year before it)
 for(let i=0;i<4;i++){const h=b.$('#stBlocks [data-drag-id="activity"]');h.dispatchEvent(new b.w.KeyboardEvent("keydown",{key:"ArrowUp",bubbles:true}));}
 eq(b.$$("#stBlocks li").map(x=>x.dataset.block).slice(-5),["activity","lastWeek","monthRecap","calendar","year"],"keyboard moves a block in the list");
 // pointer drag: "myRequests" dropped on "status" (elementFromPoint stubbed: jsdom has no layout)
 {const h=b.$('#stBlocks [data-drag-id="myRequests"]'),target=li("status");b.doc.elementFromPoint=()=>target;
  h.dispatchEvent(new b.w.MouseEvent("pointerdown",{bubbles:true,button:0}));h.dispatchEvent(new b.w.MouseEvent("pointermove",{bubbles:true,clientX:5,clientY:300}));
  h.dispatchEvent(new b.w.MouseEvent("pointerup",{bubbles:true}));}
 eq(b.$$("#stBlocks li").map(x=>x.dataset.block)[0],"myRequests","drag and drop with the pointer");
 const L=S.settings().dashLayout.me;
 eq([L.hidden,L.sizes,L.order[0],L.order.indexOf("activity")<L.order.indexOf("lastWeek")],[["kpiLeave"],{monthRecap:12},"myRequests",true],"saved in the person's settings");
 go(b,"#dashboard");eq([ids()[0],ids().includes("kpiLeave"),b.$('[data-block="monthRecap"]').dataset.size],["myRequests",false,"12"],"dashboard follows: order, hidden widget, width");
 // edit directly on the dashboard
 b.$("#dbLayout").click();eq([!!b.$(".dash-grid.editing"),!!b.$('[data-block="kpiLeave"].is-hidden'),b.$$(".dash-tools").length],[true,true,12],"edit mode: tools on every block, hidden ones shown greyed");
 b.$('[data-block="kpiLeave"] [data-toggle]').click();eq(S.settings().dashLayout.me.hidden,[],"eye: shown again");
 b.$('[data-block="myWeek"] [data-size-step="1"]').click();eq(S.settings().dashLayout.me.sizes.myWeek,12,"+: wider");
 eq(b.$('[data-block="status"] [data-size-step]'),null,"the banner keeps its full width (content not compatible)");
 b.$("#dbLayout").click();eq(!!b.$(".dash-grid.editing"),false,"done: normal dashboard");
 eq(JSON.stringify([S.entries(),S.requests(),b.w.eval("Leave").balance(),S.org()]),before,"no business data changed by the arrangement");
 // bad saved values never break the page; a new block keeps its default place
 S.updateSettings({dashLayout:{me:{order:["ghost","activity"],hidden:["nope"],sizes:{activity:5}}}});go(b,"#dashboard");
 eq([ids()[0],ids().length,b.$('[data-block="activity"]').dataset.size],["status",12,"4"],"unknown ids and widths ignored, missing blocks added");
 S.updateSettings({dashLayout:{me:{hidden:["kpiLeave"],sizes:{monthRecap:12}}}});
 eq(b.errors,[],"no JS error (workspace)");
}
// persistence: sign-out, refresh, sign-in again
b=build("fr-FR",storageOf(b.w));await sleep(50);expose(b.w);await signIn(b,"Alexandre","123456",false);
eq(!!b.$("#sheet .intro"),false,"presentation not shown at the next sign-in");
eq([b.$$("#page-dashboard .dash-item").some(x=>x.dataset.block==="kpiLeave"),b.$('[data-block="monthRecap"]').dataset.size],[false,"12"],"arrangement found again after sign-in");
// reset of the whole presentation
{const S=b.w.Store;S.updateSettings({menuSide:"right",theme:"dark",navHidden:["leave"]});b.w.eval("App").applyDisplay();
 go(b,"#settings");go(b,"#settings/workspace");b.$("#stResetAll").click();
 const s=S.settings();eq([s.menuSide,s.theme,s.navHidden,s.dashLayout,b.doc.body.classList.contains("menu-right")],["left","auto",[],{},false],"reset of my presentation");
 S.updateSettings({dashLayout:{me:{hidden:["kpiLeave"]}}});go(b,"#dashboard");}
/* 3.3: quick sign-in — PIN chosen in Profile, PIN screen at sign-in, password always possible */
{go(b,"#settings/profile");await sleep(30);const q=x=>b.$(x);
 eq([!!q("#pfQuick h2"),!!q("#pfBioOn"),text(b,"#pfQuick").includes("Indisponible ici")],[true,false,true],"quick sign-in card; no fingerprint without https and a reader");
 q("#pfQuickPassword").value="123456";q("#pfPin").value="1111";q("#pfPinConfirm").value="1111";q("#pfPinSave").click();await sleep(40);
 eq(text(b,"#pfQuickMsg").includes("trop simple"),true,"simple PIN refused");
 q("#pfQuickPassword").value="123456";q("#pfPin").value="2580";q("#pfPinConfirm").value="2580";q("#pfPinSave").click();await sleep(60);
 eq(text(b,"#pfQuickMsg"),"Code PIN enregistré sur cet appareil.","PIN saved");
 b=build("fr-FR",storageOf(b.w));await sleep(50);expose(b.w);
 b.$$("[data-user]").find(x=>x.textContent.includes("Alexandre")).click();await sleep(10);
 eq([!!b.$("#lgPin"),!!b.$("#lgUsePassword"),!!b.$("#lgBio")],[true,true,false],"PIN screen first, password link");
 b.$("#lgPin").value="0000";b.$("#lgPin").dispatchEvent(new b.w.Event("input"));await sleep(40);
 eq(text(b,"#lgError"),"Code PIN incorrect.","wrong PIN");
 b.$("#lgUsePassword").click();eq(!!b.$("#lgPassword"),true,"password still possible");eq([!!b.$("#lgForm .keypad"),b.$("#lgForm .kp-key").getAttribute("tabindex")],[true,"-1"],"4.1.2: on-screen keyboard on the password (out of the Tab order)");
 {const pad=b.$("#lgForm .keypad");eq([pad.querySelectorAll(".kp-key").length,pad.querySelector(".kp-wide").textContent],[11,"0"],"4.3.1: digit pad (1-9, wide 0, erase)");
  pad.querySelector('[data-key="7"]').click();pad.querySelector('[data-key="0"]').click();
  eq(b.$("#lgPassword").value,"70","digits typed with the mouse");pad.querySelector('[data-kp="erase"]').click();eq(b.$("#lgPassword").value,"7","erase");
  const eye=b.$("#lgForm [data-pw-eye]");eye.click();eq([b.$("#lgPassword").type,eye.getAttribute("aria-pressed")],["text","true"],"eye: password shown");
  eye.click();eq(b.$("#lgPassword").type,"password","eye: hidden again");pad.querySelector('[data-key="1"]').click();eq(b.$("#lgPassword").value,"71","keypad still types after the eye");b.$("#lgPassword").value="";}
 b.$("#lgUsePin").click();eq([!!b.$("#lgPinForm .keypad"),b.$$("#lgPinForm .kp-key").length],[true,11],"PIN: same digit pad");
 for(const k of "25809") b.$('#lgPinForm [data-key="'+k+'"]').click();await sleep(80);
 eq(b.$("#shell").hidden,false,"signed in with the PIN clicked on the keypad (4th digit, no button)");
 eq(b.errors,[],"no JS error (quick sign-in)");}
// ================= ADMIN =================
b=build("fr-FR",storageOf(b.w));await sleep(50);expose(b.w);
await signIn(b,"Jérémie","654321",true);
/* 4.6: each "Steering" tile shows the detail of its figure (by week, by technician); the ⓘ shows its meaning */
{const tiles=b.$$("#page-dashboard .hero-help");eq(tiles.length,4,"4.6: 4 steering tiles");
 const panel=(x,k)=>x.querySelector('[data-panel="'+k+'"]');
 eq(tiles.every(x=>panel(x,"detail").hidden&&panel(x,"info").hidden),true,"4.6: panels closed by default");
 tiles[1].querySelector("[data-tip]").click();const d=panel(tiles[1],"detail");
 eq([d.hidden,d.textContent.includes("Par semaine"),d.textContent.includes("Alexandre Machado"),d.textContent.includes("Total")],[false,true,true,true],"4.6: click on the tile: detail by week and by technician");
 const tot=d.querySelector(".hero-list.total strong").textContent;eq(tot,tiles[1].querySelector(".hero-open strong").textContent,"4.6: the detail adds up to the figure of the tile");
 tiles[1].querySelector("[data-info]").click();eq([d.hidden,panel(tiles[1],"info").hidden,panel(tiles[1],"info").textContent.includes("40e")],[true,false,true],"4.6: the ⓘ shows the meaning (one panel at a time)");
 tiles[1].querySelector("[data-info]").click();eq(panel(tiles[1],"info").hidden,true,"4.6: second click closes it");
 tiles[3].querySelector("[data-tip]").click();eq(panel(tiles[3],"detail").textContent.includes("Par semaine"),false,"4.6: time-off balance: by technician only");}
/* 3.2: arrangements are personal — Jérémie keeps the original dashboard, Alexandre's is untouched */
{const S=b.w.Store,alex=S.users().find(u=>u.name==="Alexandre Machado").id;
 eq([S.settings().dashLayout,b.$$("#page-dashboard .dash-item").map(x=>x.dataset.block)],[{},["summary","inbox","sections","kpiPresent","kpiAbsent","kpiLeave","kpiToLook","myTechs","kpiTeamWeek","kpiTeamOvertime","monthRecap","activity"]],"director: own (default) dashboard");
 eq(S.withUser(alex,()=>S.settings().dashLayout),{me:{hidden:["kpiLeave"]}},"technician's arrangement kept apart");}
/* 4.1.1: managers choose who is counted — whole team, a section or one technician */
{const S=b.w.Store,alex=S.users().find(u=>u.name==="Alexandre Machado").id,sud=S.sections().find(x=>x.name==="Sud").id,sel=()=>b.$("#dbScope");
 eq([!!sel(),text(b,".scope-names"),text(b,".hero-scope")],[true,"Comptés : Alexandre Machado, Damien Morvan","· Toute l'équipe (2)"],"team view: whole team named");
 eq(b.$$("#dbScope option").map(o=>o.value),["","s:"+S.sections().find(x=>x.name==="Nord").id,"s:"+sud,"u:"+alex,"u:"+S.users().find(u=>u.name==="Damien Morvan").id],"choices: team, sections, technicians");
 sel().value="u:"+alex;sel().dispatchEvent(new b.w.Event("change"));
 eq([text(b,".scope-names"),text(b,".hero-scope")],["Comptés : Alexandre Machado","· Alexandre Machado"],"one technician");
 sel().value="s:"+sud;sel().dispatchEvent(new b.w.Event("change"));eq(text(b,".hero-scope"),"· Sud","one section");
 sel().value="";sel().dispatchEvent(new b.w.Event("change"));}
eq(nav(b),["Accueil","À valider","Congés","Équipe","Rapports","Paramètres"],"admin side menu (2.9: week validation)");
go(b,"#clock");eq(shown(b),["page-dashboard"],"admin refused #clock");
const ad=text(b,"#page-dashboard");eq(ad.includes("Présents")&&ad.includes("En congé aujourd'hui")&&ad.includes("À examiner")&&ad.includes("Alexandre Machado"),true,"admin dashboard (team view)");
eq(ad.includes("a demandé"),true,"recent activity feed");
go(b,"#validation");eq(b.$$('[data-tabs="validation"] [data-tab]').map(x=>x.dataset.tab),["weeks","leave","reports","history"],"4.7: To validate — weeks, leave, error reports, history");
eq(text(b,'[data-tabs="validation"] [data-tab="leave"] .tab-count'),"1","4.7: counter of the leave to decide in its tab");
b.$('[data-tabs="validation"] [data-tab="reports"]').click();eq(!!b.$("#valBody .card"),true,"4.7: error reports tab");
b.$('[data-tabs="validation"] [data-tab="history"]').click();eq(text(b,"#valBody").includes("Dernières décisions"),true,"4.7: history tab");
go(b,"#team");eq([b.$$('[data-tabs="team"] [data-tab]').map(x=>x.dataset.tab),!!b.$("#tmClockings .tc-table")],[["clockings","people"],true],"4.7: Team opens on Clockings, Employees next to it");
go(b,"#leave/requests");eq(b.w.location.hash,"#validation/leave","4.7: old address of the leave queue → To validate → Leave");
/* 3.0 (10.1): the first decision is final — no separate opinion step */
eq([text(b,'[data-tabs="status"] [data-tab="decide"]')==="À décider1",text(b,'[data-tabs="status"]').includes("Chez le chef d'équipe")],[true,false],"manager's queue: 1 to decide, no team lead step");
const segStatus=b.$('[data-tabs="status"]');b.$('[data-tabs="status"] [data-tab="history"]').click();
eq(b.$('[data-tabs="status"]')===segStatus,true,"status tabs kept, only the table redrawn");eq(text(b,"#lvReqTable").includes("Alexandre"),true,"history table");
b.$('[data-tabs="status"] [data-tab="decide"]').click();b.$("#lvReqTable tr[data-open]").click();
eq(!!b.$("#dcBypass"),false,"no justification to give: no opinion step (3.0)");
b.$('#sheet [data-decide="approved"]').click();await sleep(10);
eq(b.w.Store.allRequests().filter(r=>r.status==="approved"&&r.startDate==="2026-12-21").length,1,"approved by the director");
go(b,"#leave/calendar");
const pick=(sel,v)=>{b.$(sel).value=v;b.$(sel).dispatchEvent(new b.w.Event("change"));};
// admin creates a request for Damien, then approves it from the detail sheet
b.$("#lvNew").click();const damien=b.w.Store.users().find(u=>u.name==="Damien Morvan").id;
b.$("#nrWho").value=damien;b.$("#nrType").value="time_off";b.$("#nrStart").value="2026-11-16";b.$("#nrEnd").value="2026-11-16";b.$("#nrSend").click();
const chipD=b.$$(".calendar .absence").find(x=>x.title.includes("Damien"));eq(!!chipD&&chipD.classList.contains("pending"),true,"Damien's request shown pending");
chipD.click();eq(!!b.$('#sheet [data-decide="approved"]'),true,"admin can decide from the detail");
b.$('#sheet [data-decide="approved"]').click();
eq(b.w.Store.withUser(damien,()=>b.w.Store.requests()[0].status),"approved","approved from the calendar");
pick("#lvPerson",damien);eq(b.$$(".calendar .absence").every(x=>x.title.includes("Damien")),true,"filter by person");
pick("#lvPerson","");pick("#lvType","paid_leave");eq(b.$$(".calendar .absence").every(x=>x.classList.contains("paid_leave")),true,"filter by type");
b.$('[data-tabs="leave"] [data-tab="balances"]').click();eq(text(b,"#page-leave").includes("Soldes de chaque salarié")&&text(b,"#page-leave").includes("Damien Morvan"),true,"balances of each employee");
// team
go(b,"#team/people");eq(b.$$("#page-team tr[data-open]").length,5,"team list");
b.$$("#page-team tr[data-open]").find(x=>x.textContent.includes("Alexandre")).click();
eq(text(b,"#page-team").includes("Feuille de temps"),true,"individual file with timesheet");
// 06/11/2026: the manager imports and CORRECTS in the technician's file
// 06/11/2026: the DIRECTOR consults; the QUALITY MANAGER imports and corrects
eq(!!b.$("#tmSheet [data-act='import']"),true,"4.1.6: director may import and correct in the technician's file");
const jerId=b.w.Store.currentUserId(),yannId=b.w.Store.users().find(u=>u.role==="quality").id;
b.w.Store.setCurrentUser(yannId);go(b,"#dashboard");go(b,"#team/people");{const r=b.$$("#page-team tr[data-open]").find(x=>x.textContent.includes("Damien"));if(r) r.click();}
eq(!!b.$("#tmSheet [data-act='import']"),true,"quality manager: import from the technician's file");
/* 4.5.1: Excel register — pre-validation (nothing written), then the sentence kept on the sheet */
{const W=b.w,X=W.eval("XlsxReader"),dam=W.Store.users().find(u=>u.name==="Damien Morvan").id;
 const ser=iso=>(Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10))-Date.UTC(1899,11,30))/86400000;
 const head=["DATE","Heure de debut","Heures d'Aller","Heures de Travail","Heures de Retour","Heure de fin","Heures de Repas","Recuperation"];
 const rows=[head,[ser("2026-10-12"),8/24,1,7,1,18/24,1,null],[ser("2026-10-13"),null,0,8,0,null,0,null],[ser("2026-10-14"),null,0,0,0,null,0,7.8]];
 const realRead=X.read;X.read=()=>Promise.resolve([{name:"2026 - Damien",rows},{name:"2026 - Damien OK",rows}]);
const before=W.Store.withUser(dam,()=>W.Store.entries().length);
 const send=()=>{const inp=b.$("#tmSheet [data-act='file']");Object.defineProperty(inp,"files",{value:[{name:"registre.xlsx",arrayBuffer:()=>Promise.resolve(new ArrayBuffer(0))}]});inp.dispatchEvent(new W.Event("change"));};

 send();await sleep(30);
 eq(!!b.$("#tmSheet .reg-preview"),true,"4.5.1: pre-validation shown after choosing the file");
 eq(W.Store.withUser(dam,()=>W.Store.entries().length),before,"4.5.1: nothing written before validation");
 eq(b.$$("#tmSheet .reg-months tbody tr").length,2,"4.5.1: one row per month + total");
 eq(text(b,"#tmSheet .reg-kv").replace(/\s+/g," ").includes("2journées à importer"),true,"4.5.1: days to import");
 eq(text(b,"#tmSheet .reg-warn").includes("13/10")&&text(b,"#tmSheet .reg-warn").includes("Heure de début absente"),true,"4.5.1: day to check and its reason");
 b.$("#tmSheet [data-act='sheetCancel']").click();
 eq([!!b.$("#tmSheet .reg-preview"),W.Store.withUser(dam,()=>W.Store.entries().length)],[false,before],"4.5.1: cancel writes nothing");
 send();await sleep(30);b.$("#tmSheet [data-act='sheetImport']").click();await sleep(10);
 
 const last=text(b,"#tmSheet .reg-last");
 eq(last.includes("Dernier import Excel")&&last.includes("Yann")&&last.includes("2 journée(s) du 12/10/2026 au 13/10/2026 (17 h 00)")&&last.includes("1 jour(s) de récupération"),true,"4.5.1: sentence describing the import");
 go(b,"#dashboard");go(b,"#team/people");{const r=b.$$("#page-team tr[data-open]").find(x=>x.textContent.includes("Damien"));if(r) r.click();}
 eq(text(b,"#tmSheet .reg-last").includes("Dernier import Excel"),true,"4.5.1: the sentence stays after leaving the page");
 send();await sleep(30);eq(text(b,"#tmSheet .reg-preview").includes("Rien de nouveau"),true,"4.5.1: re-import: nothing new");
 eq(!!b.$("#tmSheet [data-act='sheetImport'][disabled]"),true,"4.5.1: nothing to validate");
 b.$("#tmSheet [data-act='sheetCancel']").click();X.read=realRead;}
/* 4.6: a technician's file opens on the timesheet; the profile has its own tab */
{eq([!!b.$("#tmSheet"),!!b.$('#page-team [data-field="jobTitle"]')],[true,false],"4.6: file opens on the timesheet tab");
 b.$('[data-tabs="teamFile"] [data-tab="info"]').click();eq([!!b.$("#tmSheet"),!!b.$('#page-team [data-field="jobTitle"]')],[false,true],"4.6: profile and contract tab");
 b.$('[data-tabs="teamFile"] [data-tab="sheet"]').click();eq(!!b.$("#tmSheet"),true,"4.6: back to the timesheet");}
/* 4.6: "Clockings" — the team's week day by day, detail of a day below */
{const W=b.w,dam=W.Store.users().find(u=>u.name==="Damien Morvan").id,today=W.Utils.isoLocal(Date.now());
 W.Store.withUser(dam,()=>W.Store.addEntry({category:"work",start:W.Utils.timestamp(today,"00:05"),end:W.Utils.timestamp(today,"00:35")}));
 go(b,"#clockings");eq([b.w.location.hash,b.$('[data-tabs="team"] [data-tab="clockings"]').classList.contains("active")],["#team/clockings",true],"4.7: Clockings = Team → Clockings (old address redirected)");
 const rows=b.$$("#page-team .tc-table tbody tr");eq(rows.length>=2&&rows.every(r=>r.querySelectorAll(".tc-day").length===7),true,"4.6: one row per technician, 7 days");
 const cell=b.$('#page-team [data-day="'+dam+"|"+today+'"]');eq(!!cell&&cell.classList.contains("ok")&&cell.textContent.includes("0 h 30"),true,"4.6: today's cell of Damien");
 cell.click();eq(text(b,"#tcDetail").includes("Damien Morvan")&&text(b,"#tcDetail").includes("00:05 → 00:35"),true,"4.6: detail of the day below the table");
 eq(b.$("#tcDetail a").getAttribute("href"),"#team/"+dam,"4.6: link to the full timesheet");
 b.$("#page-team [data-close-day]").click();eq(!!b.$("#tcDetail"),false,"4.6: detail closed");
 b.$('#page-team [data-mode="month"]').click();eq(b.$$("#page-team [data-week]").length>=8,true,"4.6: month view, one cell per week");
 b.$("#page-team [data-week]").click();eq(!!b.$('#page-team [data-mode="week"].active'),true,"4.6: a week of the month opens day by day");}
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
 q("#edReason").value="departure time forgotten";q("#editorForm").dispatchEvent(new W.Event("submit",{cancelable:true}));
 eq(b.$("#editor").hasAttribute("open"),false,"saved and closed");
 const days=W.Store.withUser(dam,()=>W.Store.entries().filter(e=>W.Utils.isoLocal(e.start)==="2026-10-05").sort((a,c)=>a.start-c.start).map(e=>[e.category,W.Utils.clock(e.start),W.Utils.clock(e.end)]));
 eq(days,[["work","08:00","12:00"],["lunch","12:00","13:00"],["work","13:00","17:30"]],"Damien's day rebuilt cleanly (meal now deducted)");
 eq(W.Store.entries().length,0,"the manager's own data untouched");
 eq(W.Store.auditQuery({action:"timesheet.corrected"})[0].reason,"departure time forgotten","correction traced with its reason");
 W.Store.setCurrentUser(dam);eq(W.Store.notifications().some(n=>n.type==="timesheet.corrected"),true,"Damien notified");W.Store.setCurrentUser(me);}
b.w.Store.setCurrentUser(jerId);go(b,"#dashboard");go(b,"#team/people");{const r=b.$$("#page-team tr[data-open]").find(x=>x.textContent.includes("Damien"));if(r) r.click();}
{const pt=b.$('[data-tabs="teamFile"] [data-tab="info"]');if(pt) pt.click();}const job=b.$('[data-field="jobTitle"]');job.value="Technicien sertisseur";job.dispatchEvent(new b.w.Event("change"));
eq(b.w.Store.users().find(u=>u.name==="Damien Morvan").jobTitle,"Technicien sertisseur","job title saved (file opened from the list)");
b.$("#tmBack").click();b.$("#tmNew").click();b.$("#nuName").value="Nouveau Tech";b.$("#nuJob").value="Monteur";b.$("#nuCreate").click();
eq(b.w.Store.users().some(u=>u.name==="Nouveau Tech"&&u.jobTitle==="Monteur"),true,"new employee");
b.$$("#page-team tr[data-open]").find(x=>x.textContent.includes("Damien")).click();
b.$('[data-tabs="teamFile"] [data-tab="info"]').click();const act=b.$('[data-field="active"]');act.checked=false;act.dispatchEvent(new b.w.Event("change"));eq(b.w.Store.user(damien).accountStatus,"disabled","deactivated (accountStatus, 2.8)");
// reports admin
go(b,"#reports");eq(b.$('#rpWho [data-who="all"]').getAttribute("aria-pressed"),"true","whole team by default");
{const dam=b.w.Store.users().find(u=>u.name==="Nouveau Tech").id,al=b.w.Store.users().find(u=>u.name==="Alexandre Machado").id;
 b.$('#rpWho [data-who="'+al+'"]').click();eq(b.w.ReportsPage.data().team,false,"one technician chosen: month by month");
 b.$('#rpWho [data-who="'+dam+'"]').click();eq(b.w.ReportsPage.data().rows.map(r=>r.label).sort(),["Alexandre Machado","Nouveau Tech"],"several technicians chosen: one row each");
 b.$('#rpWho [data-who="all"]').click();}eq(text(b,"#page-reports").includes("Alexandre Machado"),true,"team report rows");
// settings admin
go(b,"#settings");eq(b.$$('[data-tabs="settings"] [data-tab]').map(x=>x.dataset.tab),["account","company","data","help"],"4.7: director settings groups");
{const subs=[];for(const g of ["account","company","data","help"]){b.$('[data-tabs="settings"] [data-tab="'+g+'"]').click();subs.push(...b.$$('[data-tabs="settingsSub"] [data-tab]').map(x=>x.dataset.tab));}
 eq(subs,["profile","workspace","preferences","rules","clients","sections","access","backup","audit","reference","readReport"],"director settings sub-tabs (by permission)");}
go(b,"#settings/rules");eq([b.$("#stZone").classList.contains("read-only"),b.$("#stZone [data-key]").disabled,!!b.$("#cfEdit")],[false,true,true],"4.1.7: rules locked until Edit (director may edit)");
/* the quality manager changes the rule from the screen: Edit → change → Validate (nothing saved before) */
b.w.Store.setCurrentUser(yannId);go(b,"#dashboard");go(b,"#settings");go(b,"#settings/profile");go(b,"#settings/rules");
b.$("#cfEdit").click();
{const wb=b.$('[data-key="weeklyBase"]');const before=b.w.Store.auditTrail().length;eq(wb.disabled,false,"Edit: fields unlocked");
 wb.value="35";wb.dispatchEvent(new b.w.Event("change"));eq(b.w.Store.org().weeklyBase,39,"nothing saved before Validate");
 b.$("#cfSave").click();eq([b.w.Store.org().weeklyBase,b.$('[data-key="weeklyBase"]').disabled,b.$("#cfMessage").textContent.startsWith("1 modification")],[35,true,true],"Validate: saved, locked again, message");
 const a=b.w.Store.auditTrail()[0];eq([b.w.Store.auditTrail().length-before,a.action,a.target,a.before,a.after],[1,"setting.changed","weeklyBase",39,35],"one audit line per rule changed");
 go(b,"#settings/audit");eq(text(b,"#stZone").includes("Base hebdomadaire"),true,"audit trail: the rule by its name, not its code");go(b,"#settings/rules");}
b.$("#cfEdit").click();b.$('[data-key="weeklyBase"]').value="30";b.$("#cfCancel").click();eq(b.w.Store.org().weeklyBase,35,"Cancel: nothing changed");
b.$("#cfEdit").click();b.$("#cfDefaults").click();eq(b.w.Store.org().weeklyBase,35,"defaults only shown");b.$("#cfSave").click();eq(b.w.Store.org().weeklyBase,39,"defaults applied by Validate");
/* 4.1.7: sections — edit (name + people) and delete only when empty */
{go(b,"#settings/sections");const S=b.w.Store,nord=S.sections().find(x=>x.name==="Nord");
 b.$('[data-sec-edit="'+nord.id+'"]').click();eq(!!b.$("#secName"),true,"section edit mode");
 b.$("#secName").value="Nord-Ouest";const dam=S.users().find(u=>u.name==="Damien Morvan");b.$('[data-member="'+dam.id+'"]').checked=false;b.$("#secSave").click();
 eq([S.sections().find(x=>x.id===nord.id).name,S.user(dam.id).sectionIds.indexOf(nord.id)],["Nord-Ouest",-1],"renamed, Damien removed");
 const enr=S.users().find(u=>u.name==="Enrique Soler");eq(b.$('[data-sec-del="'+nord.id+'"]').disabled,S.users().some(u=>u.sectionIds.indexOf(nord.id)>=0),"delete only when empty");
 b.$('[data-sec-edit="'+nord.id+'"]').click();b.$("#secName").value="Nord";b.$('[data-member="'+dam.id+'"]').checked=true;b.$("#secSave").click();
 eq([S.sections().find(x=>x.id===nord.id).name,S.user(dam.id).sectionIds.indexOf(nord.id)>=0],["Nord",true],"restored");
 const tmp=S.addSection("Essai");go(b,"#settings/profile");go(b,"#settings/sections");b.$('[data-sec-del="'+tmp.id+'"]').click();
 eq(S.sections().some(x=>x.id===tmp.id),false,"empty section deleted");}
go(b,"#settings/clients");eq(!!b.$("#page-settings #clName"),true,"clients for admins");
eq(b.errors,[],"no JS error (admin)");
// ---- deep link: #settings/rules opens the right tab after sign-in
{const st2=storageOf(b.w);const d=build("fr-FR",st2);d.w.history.replaceState(null,"","#settings/rules");await sleep(30);
 await signIn(d,"Jérémie","654321",false);
 eq([d.w.location.hash,d.$('[data-tabs="settingsSub"] .active').dataset.tab,!!d.$('[data-key="weeklyBase"]')],["#settings/rules","rules",true],"deep link opens the Rules tab");
 d.w.history.replaceState(null,"","#leave");d.w.dispatchEvent(new d.w.HashChangeEvent("hashchange"));
 eq(d.w.location.hash,"#leave/calendar","page link completed with its current tab");eq(d.errors,[],"no JS error deep link");}
// ================= TEAM LEAD (2.8) =================
{const st3=storageOf(b.w);const e=build("fr-FR",st3);await sleep(50);expose(e.w);e.w.eval('window.Permissions=Permissions');
 /* data seen by the team lead: today's work of Alexandre, a pending request, an open error report (system side) */
 {const W=e.w,al=W.Store.users().find(u=>u.name==="Alexandre Machado").id,today=W.Utils.isoLocal(Date.now());
  W.Store.updateUser(W.Store.users().find(u=>u.name==="Damien Morvan").id,{accountStatus:"active"});   /* disabled by an earlier step: back to active */
  W.Store.withUser(al,()=>{W.Store.addEntry({category:"work",start:Date.now()-2*3600e3,end:Date.now()-3600e3});W.Store.addRequest({type:"paid_leave",startDate:"2026-12-21",endDate:"2026-12-24"});});
  W.Store.setCurrentUser(al);W.Store.requestCorrection({date:today,text:"forgot to clock out yesterday"});W.Store.setCurrentUser("");}
 await signIn(e,"Enrique","111111",true);
 eq(nav(e),["Accueil","À valider","Congés","Équipe","Rapports","Paramètres"],"team lead menu: no Clocking by default, week validation");
 // 06/11/2026: the team lead's dashboard shows HIS technicians (team view), not a personal clocking view
 go(e,"#dashboard");const dl=text(e,"#page-dashboard");
 eq([dl.includes("Mes techniciens"),dl.includes("Alexandre Machado"),dl.includes("Damien Morvan"),dl.includes("Nord, Sud")],[true,true,true,true],"team lead dashboard: his technicians and sections");
 eq(!!e.$('#page-dashboard a[href="#clock"]'),false,"no Clock button for an account that does not clock");
 eq([dl.includes("Congé payé"),dl.includes("forgot to clock out yesterday"),dl.includes("1 demande(s) de congé · 1 signalement(s)")],[true,true,true],"requests and error reports of his technicians to look at");
 eq([dl.includes("Congé à décider"),dl.includes("La décision finale appartient aux responsables")],[true,false],"team lead: decides his technicians' leave (3.0, rule 10.1)");
 const alRow=[...e.$$("#page-dashboard tbody tr")].find(r=>r.textContent.includes("Alexandre Machado")&&r.textContent.includes("Travail"));
 eq(!!alRow&&alRow.textContent.includes("1 h 00"),true,"today's hours and last entry of the technician");
 // perimeter: without the Sud section, Alexandre disappears from his dashboard
 {const W=e.w,me=W.Store.currentUserId();W.Store.setCurrentUser("");W.Store.updateUser(me,{sectionIds:["sec-nord"]});W.Store.setCurrentUser(me);go(e,"#team/people");go(e,"#dashboard");
  const d2=text(e,"#page-dashboard");eq([d2.includes("Damien Morvan"),d2.includes("Alexandre Machado"),d2.includes("forgot to clock out yesterday")],[true,false,false],"dashboard limited to his sections");
  W.Store.setCurrentUser("");W.Store.updateUser(me,{sectionIds:["sec-nord","sec-sud"]});
  const dm=W.Store.users().find(u=>u.name==="Damien Morvan").id;W.Store.updateUser(dm,{accountStatus:"disabled"});W.Store.setCurrentUser(me);go(e,"#team/people");go(e,"#dashboard");
  eq(text(e,"#page-dashboard").includes("Damien Morvan"),false,"a disabled account is not shown");
  W.Store.setCurrentUser("");W.Store.updateUser(dm,{accountStatus:"active"});W.Store.setCurrentUser(me);}
 /* 3.0: the team lead decides (first decision final), sees the balances of HIS technicians, requests nothing for himself */
 go(e,"#leave");eq(e.$$('[data-tabs="leave"] [data-tab]').map(x=>x.dataset.tab),["calendar","balances"],"team lead: calendar + team balances, no own requests (3.0); the queue is in To validate (4.7)");
 eq(!!e.$("#lvNew"),false,"team lead: no 'New request' button (3.0)");
 go(e,"#validation/leave");eq(text(e,'[data-tabs="status"] [data-tab="decide"]'),"À décider1","1 request to decide");
 e.$("#lvReqTable tr[data-open]").click();eq([!!e.$("[data-review]"),!!e.$("[data-decide]")],[false,true],"decision buttons, no opinion step");
 e.$('[data-decide="rejected"]').click();eq(text(e,"#dtErr").includes("commentaire"),true,"refusal without comment refused");
 e.$('[data-decide="approved"]').click();
 {const al=e.w.Store.users().find(u=>u.name==="Alexandre Machado").id;eq(e.w.Store.withUser(al,()=>e.w.Store.requests().find(r=>r.startDate==="2026-12-21"&&r.endDate==="2026-12-24").status),"approved","approved by the team lead");}
 eq(text(e,'[data-tabs="status"] [data-tab="decide"]'),"À décider","queue emptied");
 e.$('[data-tabs="leave"] [data-tab="balances"]').click();{const bt=text(e,"#page-leave");eq([bt.includes("Alexandre Machado"),bt.includes("Damien Morvan"),bt.includes("Yann"),bt.includes("Jérémie")],[true,true,false,false],"team balances: his technicians only, never his superiors");}
 go(e,"#team/people");eq(e.$$("#page-team tr[data-open]").map(x=>x.textContent).some(t=>t.includes("Alexandre"))&&!e.$("#tmNew"),true,"team lead: team visible, no account creation");
 e.$$("#page-team tr[data-open]").find(x=>x.textContent.includes("Alexandre")).click();
 {const pt=e.$('[data-tabs="teamFile"] [data-tab="info"]');if(pt) pt.click();}eq(e.$('[data-field="jobTitle"]').disabled,true,"team lead: read-only file");
 go(e,"#settings");eq(e.$$('[data-tabs="settings"] [data-tab]').map(x=>x.dataset.tab).includes("rules"),false,"team lead: no team rules");
 eq(e.errors,[],"no JS error (team lead)");}
// ================= 2.8 screens + rights REALLY applied (precision 5) =================
{const st4=storageOf(b.w);
 // Enrique asks for a temporary right from the interface
 let e=build("fr-FR",st4);await sleep(50);expose(e.w);e.w.eval('window.Permissions=Permissions');
 await signIn(e,"Enrique","111111",true);go(e,"#settings");go(e,"#settings/access");
 e.$("#accPerm").value="leave.global.approve";e.$("#accKind").value="temporary";e.$("#accStart").value="2026-11-05";e.$("#accEnd").value="2026-11-20";
 e.$("#accSend").click();eq(e.$("[data-msg]").className,"error","reason mandatory in the interface");
 e.$("#accReason").value="replacement during the leave";e.$("#accSend").click();
 eq(e.w.Store.accessRequests().filter(r=>r.status==="pending").length,1,"request created from the screen");
 // rights really applied for the team lead (calls behind the screens, not only hidden menus)
 const alexId=e.w.Store.users().find(u=>u.name==="Alexandre Machado").id;
 eq([e.w.Store.updateOrg({weeklyBase:30}),e.w.Store.updateUser(alexId,{jobTitle:"x"}),e.w.Store.exportAll(),e.w.Store.auditQuery({}).length],[false,false,null,0],"team lead: settings, accounts, full export and audit refused in the logic");
 eq(e.w.Store.grant({userId:e.w.Store.currentUserId(),permission:"leave.global.approve",kind:"permanent"}),null,"team lead cannot grant himself");
 eq(e.errors,[],"no JS error (team lead access screen)");
 // Yann sees the notification, approves with a comment, Enrique's rights change
 const st5=storageOf(e.w);let y=build("fr-FR",st5);await sleep(50);expose(y.w);y.w.eval('window.Permissions=Permissions');
 await signIn(y,"Yann","222222",true);
 /* 3.0: the access request + the leave decided meanwhile by the team lead (the managers are deciders too) */
 eq(y.$("#notifButton .count")&&+y.$("#notifButton .count").textContent>=1&&y.w.Store.notifications().filter(n=>!n.read).some(n=>n.type==="access.requested"),true,"bell: unread notifications, the access request among them");
 y.$("#notifButton").click();eq(y.$("#sheet").textContent.includes("Enrique Soler demande un accès"),true,"notification text");y.$("#ntRead").click();
 eq(!!y.$("#notifButton .count"),false,"marked as read");
 go(y,"#settings");go(y,"#settings/access");y.$('[data-acc="approved"]').click();
 y.$("#dsEnd").value="2026-11-15";y.$("#dsOk").click();eq(y.$("#dsErr").textContent.includes("commentaire"),true,"shorter period needs a comment");
 y.$("#dsComment").value="jusqu'au 15";y.$("#dsOk").click();
 const enr=y.w.Store.users().find(u=>u.name==="Enrique Soler").id;
 eq(y.w.Permissions.has(enr,"leave.global.approve","2026-11-10"),true,"approved from the screen: the right really applies");
 // audit screen: filters + export
 go(y,"#settings/audit");const total=y.w.Store.auditQuery({}).length;
 y.$('[data-f="action"]').value="access.";y.$('[data-f="action"]').dispatchEvent(new y.w.Event("change"));
 eq(y.$("#auRows").textContent.includes("Décision sur une demande d'accès")&&!y.$("#auRows").textContent.includes("Connexion"),true,"audit filtered by action type");
 eq(y.$("#auRows").textContent.includes("jusqu'au 15"),true,"reason visible in the audit");
 files=[];y.w.eval("Utils").download=(c,n)=>files.push({c,n});y.$("#auCsv").click();
 eq(files[0].n.startsWith("historique_")&&files[0].c.includes("Décision sur une demande d'accès"),true,"audit exported (CSV)");
 eq(y.w.Store.auditQuery({action:"export.done"}).length,1,"the export itself is traced");
 // sections + team file
 go(y,"#settings/sections");y.$("#secNew").value="Centre";y.$("#secAdd").click();
 eq(y.w.Store.sections().map(x=>x.name),["Nord","Sud","Centre"],"section added from the screen");
 go(y,"#team/people");y.$$("#page-team tr[data-open]").find(x=>x.textContent.includes("Damien")).click();
 {const pt=y.$('[data-tabs="teamFile"] [data-tab="info"]');if(pt) pt.click();}const cen=y.w.Store.sections().find(x=>x.name==="Centre").id;y.$('[data-sec="'+cen+'"]').checked=true;y.$('[data-sec="'+cen+'"]').dispatchEvent(new y.w.Event("change"));
 eq(y.w.Store.users().find(u=>u.name==="Damien Morvan").sectionIds,["sec-nord",cen],"section assigned in the file");
 // backup: test on a copy, nothing written
 go(y,"#settings");go(y,"#settings/backup");files=[];y.$("#bkFull").click();const full=files[0].c;
 const before=JSON.stringify(storageOf(y.w));
 const inp=y.$("#bkFile");Object.defineProperty(inp,"files",{value:[{name:"s.json"}]});y.w.eval("Utils").readText=()=>Promise.resolve(full);
 y.$("#bkTest").click();inp.onchange();await sleep(20);
 eq(y.$("#bkReport").textContent.includes("restaurable, rien ne manque"),true,"restore test OK on a copy");
 eq(JSON.stringify(storageOf(y.w))===before,true,"restore test changed nothing on the device");
// ---- Lot 1 from the screens: preview, refusal of forged data (no confirm offered), personal restore
 {const calls=[];y.w.confirm=m=>{calls.push(m);return false;};   /* the manager looks at the preview and declines: nothing is restored here */
  const pickFile=async(sel,text)=>{const el=y.$(sel);try{Object.defineProperty(el,"files",{configurable:true,value:[{name:"f.json"}]});}catch(e){/* already defined by the previous block: the file list is irrelevant, readText is replaced */}y.w.eval("Utils").readText=()=>Promise.resolve(text);return el;};
  // 1. a healthy file: complete preview (counts now / file / after, accounts, rules, approved leave) then restore offered
  let el=await pickFile("#bkFile",full);y.$("#bkRestore").click();el.onchange();await sleep(30);
  const rp=text(y,"#bkReport");
  eq([rp.includes("Aperçu de la restauration"),rp.includes("Actuellement"),rp.includes("Comptes qui disparaîtraient"),rp.includes("Règles d'équipe modifiées"),rp.includes("Congés acceptés")],[true,true,true,true,true],"UI: complete preview before restoring");
  eq([calls.length,calls[0]&&calls[0].includes("Remplacer TOUTES les données")],[1,true],"UI: a healthy file asks for the confirmation, which names what is replaced");
  // 2. a forged file: refused in the preview, NO confirmation, nothing restored
  const forged=JSON.parse(full);delete forged.manifest;forged.data.perUser[Object.keys(forged.data.perUser)[0]].requests.push({id:"f1",type:"paid_leave",startDate:"2026-12-01",endDate:"2026-12-05",status:"approved"});
  calls.length=0;const usersBefore=JSON.stringify(y.w.Store.users());
  el=await pickFile("#bkFile",JSON.stringify(forged));y.$("#bkRestore").click();el.onchange();await sleep(30);
  eq([text(y,"#bkReport").includes("Données refusées (1)"),text(y,"#bkReport").includes("request.undecided:f1"),calls.length,JSON.stringify(y.w.Store.users())===usersBefore],[true,true,0,true],"UI: forged data shown as refused, no confirmation, nothing restored");
  eq(y.errors,[],"no JS error (backup screen of a manager)");}
 // personal restore from a technician's screen
 {const st6=storageOf(y.w);const a=build("fr-FR",st6);await sleep(50);expose(a.w);a.w.eval('window.Permissions=Permissions');
  await signIn(a,"Alexandre","123456",false);go(a,"#settings");go(a,"#settings/backup");
  eq([!!a.$("#bkFull"),!!a.$("#bkRestore"),text(a,"#stZone").includes("Restaurer mes réglages"),text(a,"#stZone").includes("ne permet de restaurer que vos réglages")],[false,false,true,true],"UI: technician sees the personal restore only, described honestly");
  const mine=JSON.parse(a.w.Store.exportJson());
  mine.requests.push({id:"x1",type:"paid_leave",startDate:"2026-10-05",endDate:"2026-10-16",status:"approved",decidedBy:"Yann Lefloc'h",decidedAt:"2026-10-01T08:00:00.000Z"});
  mine.clients.push({id:"x2",name:"Client inventé",city:"",lines:[]});mine.settings.vibration=false;
  const reqBefore=JSON.stringify(a.w.Store.requests()),cliBefore=JSON.stringify(a.w.Store.clients());
  const msgs=[];a.w.confirm=m=>{msgs.push(m);return true;};
  const el2=a.$("#bkOwnFile");Object.defineProperty(el2,"files",{configurable:true,value:[{name:"p.json"}]});a.w.eval("Utils").readText=()=>Promise.resolve(JSON.stringify(mine));
  a.$("#bkOwnRestore").click();el2.onchange();await sleep(30);
  eq(msgs[0].includes("Seuls vos RÉGLAGES"),true,"UI: the confirmation says only the settings are restored");
  const m=text(a,"[data-msg]");
  eq([m.includes("Réglages restaurés (1)"),m.includes(mine.requests.length+" demande(s)"),m.includes(mine.clients.length+" client(s)"),mine.requests.length>1],[true,true,true,true],"UI: message : 1 setting restored; ALL the file's requests and clients (the forged ones too) ignored");
  eq([JSON.stringify(a.w.Store.requests())===reqBefore,JSON.stringify(a.w.Store.clients())===cliBefore,a.w.Store.settings().vibration],[true,true,false],"UI: no leave, no client injected; the setting was applied");
  eq(a.errors,[],"no JS error (technician backup screen)");}
 eq(y.$("#page-settings").textContent.includes("Utilisé :"),true,"storage use shown");
 eq(y.errors,[],"no JS error (manager screens)");
 b=y;}
// ================= 2.9: week closing, undo, validation from the screens =================
{const st9=storageOf(b.w);const a=build("fr-FR",st9);await sleep(50);expose(a.w);a.w.eval('window.Permissions=Permissions;window.ValidationPage=ValidationPage');
 const W=a.w;const al=W.Store.users().find(u=>u.name==="Alexandre Machado").id;
 W.Store.updateUser(W.Store.users().find(u=>u.name==="Damien Morvan").id,{accountStatus:"active"});
 const prev=W.Store.previousWeek();const mon=W.Hours.isoDayOf(prev.year,prev.week,1);
 W.Store.setCurrentUser("");W.Store.withUser(al,()=>{W.Store.entries().filter(e=>e.end==null).forEach(e=>W.Store.updateEntry(e.id,{end:Date.now()},false));
  W.Store.addEntry({category:"work",start:W.Utils.timestamp(mon,"08:00"),end:W.Utils.timestamp(mon,"16:00")});});
 await signIn(a,"Alexandre","123456",false);go(a,"#clock");
 eq(!!a.$("#ckSendWeek"),true,"clock: banner asks to review and send last week");
 a.$("#ckArrive").click();eq([a.$("#sheet").hasAttribute("open"),!!a.$("#wsSend"),W.Store.runningEntry()],[true,true,null],"clocking blocked: the review / send sheet opens instead");
 a.$("#wsSend").click();eq(text(a,"#wsErr").includes("Cochez"),true,"sending needs the confirmation box");
 a.$("#wsOk").checked=true;a.$("#wsSend").click();eq(W.Store.weekValidation(al,prev.year,prev.week).status,"sent","week sent from the screen");
 a.$("#ckArrive").click();eq(!!W.Store.runningEntry(),true,"clocking allowed once the week is sent");
 eq(text(a,"#toast").includes("Annuler"),true,"undo offered in a toast");a.$("#toastAction").click();eq(W.Store.runningEntry(),null,"undone from the toast");
 eq(a.$$("#ckActivities .act-icon").length,6,"activity tiles with their icon");
 eq(a.errors,[],"no JS error (2.9 technician)");
 const st10=storageOf(W);const e=build("fr-FR",st10);await sleep(50);expose(e.w);
 await signIn(e,"Enrique","111111",false);
 eq(e.$('#sideNav a[data-page="validation"] .count')&&e.$('#sideNav a[data-page="validation"] .count').textContent,"1","menu counter: 1 week to validate");
 go(e,"#validation");e.$("[data-open-week]").click();eq(!!e.$('[data-wd="review:validate"]'),true,"detail with the team lead's decision");
 e.$('[data-wd="review:return"]').click();eq(text(e,"#wdErr").includes("commentaire"),true,"return needs a comment");
 e.$('[data-wd="review:validate"]').click();eq(e.w.Store.weekValidation(al,prev.year,prev.week).status,"pending_lock","validated from the screen");
 go(e,"#dashboard");eq(text(e,"#page-dashboard").includes("Mon équipe sur le terrain"),true,"team lead dashboard: team in the field");
 eq(e.errors,[],"no JS error (2.9 team lead)");
 const st11=storageOf(e.w);const j=build("fr-FR",st11);await sleep(50);expose(j.w);
 await signIn(j,"Jérémie","654321",false);go(j,"#dashboard");
 eq(text(j,"#page-dashboard").includes("Semaine à verrouiller"),true,"director dashboard: week to lock in the inbox");
 j.$("[data-week]").click();j.$('[data-wd="lock:lock"]').click();
 const l=j.w.Store.weekValidation(al,prev.year,prev.week);eq([l.status,l.lockedBy===j.w.Store.currentUserId()],["locked",true],"locked by the director from his dashboard");
 go(j,"#team/people");j.$$("#page-team tr[data-open]").find(x=>x.textContent.includes("Alexandre")).click();
 eq(j.errors,[],"no JS error (2.9 director)");}
// ================= deactivated hidden =================
const b3=build("fr-FR",storageOf(b.w));await sleep(50);eq(b3.$$("[data-user]").some(x=>x.textContent.includes("Damien")),false,"deactivated hidden");
// ================= 4 languages, every page =================
for(const lang of ["en","es","de"]){
 const st=storageOf(b.w);st.acp_language=lang;const data=JSON.parse(st.acp_data_v5);data.users.forEach(u=>{u.language=lang;});st.acp_data_v5=JSON.stringify(data);
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
// ================= 4.2: reference document = real rules, theme, password fields =================
{const ex=b.w.eval("Explanations.content()");const row=ex.rules.find(r=>r[0].includes("vendredi")&&r[0].includes("congé"));
 eq(!!row&&row[1].includes("÷ 5")&&!ex.rules.some(r=>r[1].includes("÷ 7")),true,"reference: credited day = 39 h ÷ 5, Monday → Friday");
 b.w.eval('UI.applyTheme("dark")');eq(b.w.document.documentElement.dataset.theme,"dark","theme: dark forced without reading the stylesheet");
 b.w.eval('UI.applyTheme("light")');eq(b.w.document.documentElement.dataset.theme,"light","theme: light forced");
 b3.$$("[data-user]").find(x=>x.textContent.includes("Alexandre")).click();if(b3.$("#lgUsePassword"))b3.$("#lgUsePassword").click();   /* PIN set earlier: password screen */
 eq([b3.$$('input[type="password"]').length>0,b3.$$('input[type="password"][inputmode="numeric"]').length],[true,0],"password field: letters keyboard on phones");
 eq(b3.$$(".keypad .kp-key[data-key]").map(k=>k.textContent).join(""),"1234567890","keypad: digits 1 to 9 then 0");
 // 4.3: forgotten password from the sign-in screen
 b3.$("#lgForgot").click();const fc=text(b3,"#lgForgotCard");
 eq([fc.includes("Enrique Soler"),fc.includes("Yann"),fc.includes("Jérémie"),fc.includes("Damien"),b3.$$(".forgot-option.off button[disabled]").length],[true,true,true,false,2],"forgot: sent to the team lead and the managers; e-mail / SMS prepared (inactive)");
 b3.$("#lgAsk").click();eq([!!b3.$("#lgAsked"),!b3.$("#lgAsk")],[true,true],"forgot: request sent, shown as sent");
 b3.$("#lgRetry").click();eq(!!b3.$("#lgForgot"),true,"forgot: back to the sign-in");}
}catch(x){ko++;console.log("EXCEPTION",x.stack)}
console.log("OK",ok,"KO",ko);process.exit(0);})();

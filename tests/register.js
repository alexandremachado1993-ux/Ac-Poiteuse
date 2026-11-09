const {JSDOM}=require("jsdom");const fs=require("fs");const path=require("path").join(__dirname,"..")+"/";
let ok=0,ko=0;const eq=(a,b,m)=>{if(JSON.stringify(a)===JSON.stringify(b))ok++;else{ko++;console.log("FAIL",m,"got",a,"expected",b)}};
const near=(a,b,m,t=0.01)=>{if(Math.abs(a-b)<=t)ok++;else{ko++;console.log("FAIL",m,"got",a,"expected",b)}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const html=fs.readFileSync(path+"index.html","utf8").replace(/<script src="([^"]+)"><\/script>/g,(m,s)=>"<script>"+fs.readFileSync(path+s,"utf8")+"\n//# sourceURL="+s+"</script>");
const errors=[];
const dom=new JSDOM(html,{runScripts:"dangerously",url:"https://example.netlify.app/index.html#clock",pretendToBeVisual:true,
 beforeParse(w){w.TextEncoder=require("util").TextEncoder;w.TextDecoder=require("util").TextDecoder;Object.defineProperty(w,"crypto",{value:require("crypto").webcrypto});
  w.DecompressionStream=DecompressionStream;w.Blob=Blob;w.Response=Response;
  w.confirm=()=>true;w.alert=m=>errors.push("alert:"+m);w.print=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","")};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute("open")};
  w.addEventListener("error",e=>errors.push(e.message));}});
const w=dom.window,doc=w.document,$=s=>doc.querySelector(s);
(async()=>{try{
await sleep(50);
w.eval('for (const n of ["Store","Hours","Leave","XlsxReader","RegisterImport","Segments","Auth","I18n","App"]) window[n]=eval(n);');
/* switch account like the sign-in screen (password check + session), without the page reload jsdom cannot do */
const switchTo=async(name,pwd,first)=>{const id=w.Store.users().find(u=>u.name.startsWith(name)).id;
  if(first) await w.Auth.setPassword(id,pwd);eq(await w.Auth.signIn(id,pwd),true,"sign-in "+name);w.App.refreshShell();w.App.buildNav();await sleep(40);};
// sign in
[...doc.querySelectorAll("[data-user]")].find(x=>x.textContent.includes("Alexandre")).click();await sleep(10);
$("#lgPassword").value="123456";$("#lgConfirm").value="123456";
$("#lgForm").dispatchEvent(new w.Event("submit",{cancelable:true}));await sleep(60);
const REG=process.env.ACP_REGISTER||require("path").join(__dirname,"data","2026_Registres_Heures_1.xlsx");
if(!fs.existsSync(REG)){console.log("SKIPPED register test: file not found ("+REG+"). Set ACP_REGISTER to the managers' register to run it.");console.log("OK 0 KO 0");process.exit(0);}
const buf=fs.readFileSync(REG);
const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
const sheets=await w.XlsxReader.read(ab);
eq(sheets.map(s=>s.name),["2026 - Alexandre (2)","2026 - Alexandre OK"],"sheets read");
eq(w.RegisterImport.registerSheets(sheets).length,2,"both recognised as registers");
const okSheet=sheets[1];const c=w.RegisterImport.columns(okSheet.rows[0]);
eq([c.date,c.start,c.travelOut,c.work,c.travelBack,c.end,c.lunch,c.recovery,c.client,c.comment],[2,3,4,5,6,7,8,15,26,27],"columns by title");
// day plan 04/05: 07:15, aller .25, travail 6, retour 9.75, repas 1, fin 24:00
const row=okSheet.rows.find(r=>r&&w.XlsxReader.toIsoDate(r[2])==="2026-05-04");
const pl=w.RegisterImport.dayPlan(row,c);
eq(pl.segments.map(s=>[s.category,s.from,s.to]),[["travel",435,450],["work",450,720],["lunch",720,780],["work",780,870],["travel",870,1455]],"04/05 plan with lunch at noon");
eq([pl.toCheck,pl.reasons],[false,[]],"04/05 ends 00:15 next day: span 17 h = typed 17 h, not flagged");
// 06/11/2026: imports are reserved to managers — the technician has no import button
$('[data-tabs="clock"] [data-tab="sheet"]').click();await sleep(30);
eq([!!$("#ckSheet [data-act=\"import\"]"),!!$("#ckSheet [data-act=\"file\"]")],[false,false],"technician: no import");
eq(w.RegisterImport.importSheet(okSheet).entries,0,"technician: import refused in the logic too");
const alexId=w.Store.currentUserId();
// a manager imports Alexandre's register from Alexandre's file (Team → file → timesheet)
w.Auth.signOut();await switchTo("Yann","654321",true);
w.location.hash="#team";await sleep(60);[...doc.querySelectorAll("#page-team tr[data-open]")].find(x=>x.textContent.includes("Alexandre")).click();await sleep(60);
const input=$("#tmSheet [data-act=\"file\"]");Object.defineProperty(input,"files",{value:[{name:"2026_Registres_Heures.xlsx",arrayBuffer:()=>Promise.resolve(ab)}]});
input.dispatchEvent(new w.Event("change"));for(let i=0;i<40&&!$("#tmSheet [data-act=\"sheet\"]");i++) await sleep(100);
eq(!!$("[data-act=\"sheet\"]"),true,"sheet choice shown");eq($("[data-act=\"sheet\"]").selectedOptions[0].textContent,"2026 - Alexandre (2)","default = sheet in use (latest day)");
$("#tmSheet [data-act=\"sheetImport\"]").click();await sleep(100);
const msg=$("#tmSheet").textContent;
eq(/124 day\(s\) imported from the Excel register \(509 entries\) — 15 time-off day\(s\) — 19 day\(s\) to check/.test(msg),true,"import message (sheet (2), with 02/11)");
eq(w.Store.withUser(w.Store.currentUserId(),()=>w.Store.entries().length),0,"imported into ALEXANDRE's data, not the manager's");
eq(w.Store.auditQuery({action:"import.done"}).some(a=>a.target==="register"&&a.after.detail==="Alexandre Machado"),true,"import traced with the person concerned");
const againAdmin=w.Store.withUser(alexId,()=>w.RegisterImport.importSheet(sheets[0]));eq([againAdmin.entries,againAdmin.timeOff],[0,0],"re-import by the manager adds nothing");
// back to Alexandre: every figure is checked in his own data
w.Auth.signOut();await switchTo("Alexandre","123456",false);
const reqs=w.Store.requests();const ents=w.Store.entries();
eq(reqs.length,15,"15 time-off days (P) imported");
// re-import → nothing new
/* (re-import checked above, by the manager) */
// balances
const rb=w.Hours.recoveryBalance();
console.log("   APP: bank",rb.bank.toFixed(2),"taken",rb.taken.toFixed(2),"balance",rb.balance.toFixed(2),"premiums",rb.premiums.toFixed(3),"TOTAL",rb.total.toFixed(3),"h25",rb.counters.h25.toFixed(2),"h50",rb.counters.h50.toFixed(2),"nightPremium",rb.counters.nightPremium.toFixed(2),"| counters sunday",rb.counters.sunday.toFixed(2),"night",rb.counters.night.toFixed(2),"holiday worked",rb.counters.holidayWorked.toFixed(2),"| up to",rb.upTo);

near(rb.balance,113.929,"2.5 rules: week Mon→Sun, credited days at 39÷7");near(rb.taken,12*39/7,"12 time-off days × 5 h 34");
near(rb.premiums,6.5,"premiums: night 21 h × 25 % + holiday 2.5 h × 50 %");
near(rb.total,120.429,"total = hours + night 25 % + holiday 50 %");
near(rb.counters.h25,53.6,"overtime 25 % from the 40th hour");near(rb.counters.h50,84.7,"overtime 50 % from the 44th hour");
near(rb.counters.sunday,19.5,"Sunday counter = register X2");
const s43=w.Hours.weekSummary(w.Segments.weekSheet(2026,43,w.Store.entries(),w.Store.settings()));
console.log("   S43: worked",s43.worked.toFixed(3),"credits",s43.credits.total.toFixed(3),"done",s43.done.toFixed(3),"result",s43.toRecover.toFixed(3),"→",w.Countdown?"":"" );
near(s43.worked,24.3,"S43 worked 24 h 18");near(s43.credits.timeOff,2*39/7,"S43: 22-23/10 time off credited 2 × 5 h 34");near(s43.toRecover,24.3+2*39/7-39,"S43 result ≈ −3 h 33 as announced");

eq(errors,[],"no JS error");
}catch(x){ko++;console.log("EXCEPTION",x.stack)}
console.log("OK",ok,"KO",ko);process.exit(0);})();

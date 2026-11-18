/* 3.0: the app reproduces the managers' register "2026 - Alexandre OK" (one row per day,
   weekly value on the Sunday row): hours above 39 h valued × 1.25, holidays Mon→Fri at
   7.8 h, night 25 % and holiday 50 % added before the × 1.25, a week under 39 h = 0,
   weeks 22 → 39 paid ("Simu Juin-Sept"), the rest banked as time off.
   The register file is personal data: it is NOT shipped. Put it in tests/data/ (or set
   ACP_REGISTER) to run this test; otherwise it is skipped. */
const {JSDOM}=require("jsdom");const fs=require("fs");const path=require("path").join(__dirname,"..")+"/";
let ok=0,ko=0;const eq=(a,b,m)=>{if(JSON.stringify(a)===JSON.stringify(b))ok++;else{ko++;console.log("FAIL",m,"got",a,"expected",b)}};
const near=(a,b,m,t=0.01)=>{if(Math.abs(a-b)<=t)ok++;else{ko++;console.log("FAIL",m,"got",a,"expected",b)}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const REG=process.env.ACP_REGISTER||require("path").join(__dirname,"data","2026_Registres_Heures_1.xlsx");
if(!fs.existsSync(REG)){console.log("SKIPPED register test: file not found ("+REG+"). Set ACP_REGISTER to the managers' register to run it.");console.log("OK 0 KO 0");process.exit(0);}
const html=fs.readFileSync(path+"index.html","utf8").replace(/<script src="([^"]+)"><\/script>/g,(m,s)=>"<script>"+fs.readFileSync(path+s,"utf8")+"\n//# sourceURL="+s+"</script>");
const errors=[];
const dom=new JSDOM(html,{runScripts:"dangerously",url:"https://example.netlify.app/index.html#dashboard",pretendToBeVisual:true,
 beforeParse(w){w.TextEncoder=require("util").TextEncoder;w.TextDecoder=require("util").TextDecoder;Object.defineProperty(w,"crypto",{value:require("crypto").webcrypto});
  w.DecompressionStream=DecompressionStream;w.Blob=Blob;w.Response=Response;w.confirm=()=>true;w.alert=m=>errors.push("alert:"+m);w.print=()=>{};w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","")};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute("open")};
  w.addEventListener("error",e=>errors.push(e.message));}});
const w=dom.window;
(async()=>{try{
await sleep(50);
w.eval('for (const n of ["Store","Hours","XlsxReader","RegisterImport","Segments","Auth","Utils"]) window[n]=eval(n);');
const S=w.Store,H=w.Hours;
const id=n=>S.users().find(u=>u.name.startsWith(n)).id;const alex=id("Alexandre"),yann=id("Yann");
await w.Auth.setPassword(yann,"654321");eq(S.currentUserId(),yann,"quality manager signed in");
const buf=fs.readFileSync(REG);const sheets=await w.XlsxReader.read(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
const sh=sheets.find(s=>s.name==="2026 - Alexandre OK");eq(!!sh,true,"sheet \"2026 - Alexandre OK\" read");
const c=w.RegisterImport.columns(sh.rows[0]);eq(c.recovery,15,"recovery column (P) found by its title");
/* the reference date of the register: the last row filled is 09/11/2026 → completed weeks up to Sunday 08/11 */
const realNow=w.Date.now;w.Date.now=()=>new w.Date(2026,10,10,12,0,0).getTime();
const pv=S.withUser(alex,()=>w.RegisterImport.analyse(sh));const n0=S.withUser(alex,()=>S.entries().length);
const r=S.withUser(alex,()=>w.RegisterImport.importSheet(sh));
/* 4.5.1: the pre-validation announces exactly what the import does, and writes nothing */
eq([pv.days,pv.entries,pv.timeOff,pv.toCheck.length,pv.from,pv.to,pv.work+pv.travel],[r.days,r.entries,r.timeOff,r.toCheck,r.from,r.to,r.minutes],"4.5.1: pre-validation = import");
eq(S.withUser(alex,()=>S.entries().length)-n0,r.entries,"4.5.1: only the import writes");
const pv2=S.withUser(alex,()=>w.RegisterImport.analyse(sh));eq([pv2.days,pv2.timeOff,pv2.duplicates],[0,0,r.entries],"4.5.1: re-import announced as duplicates only");eq(r.timeOff,15,"15 time-off days (P) imported");
/* week by week: the value of the Sunday row (column V "Total avec revalo") */
const iso=v=>w.XlsxReader.toIsoDate(v);
let weeks=0,diffs=[];
sh.rows.slice(1).forEach(row=>{if(!row) return;const d=iso(row[2]);if(!d||row[1]!==7||d>"2026-11-08") return;
  const wk=H.isoWeek(w.Utils.utcDate(d));const s=S.withUser(alex,()=>H.weekSummary(w.Segments.weekSheet(wk.year,wk.week,S.entries(),S.settings())));
  const exp=typeof row[21]==="number"?row[21]:0;weeks++;
  if(Math.abs(s.register.valued-exp)>0.01) diffs.push("S"+wk.week+" app "+s.register.valued.toFixed(3)+" register "+exp.toFixed(3)+" (cumul "+s.register.cumul.toFixed(2)+", goal "+s.register.goal.toFixed(2)+")");});
/* 2 known differences, both from the register itself (the app is right):
   S20 — Wed 13/05 ends at 00:30 on Ascension day: the 30 min after midnight are holiday hours (+50 %), the register keeps them on the 13th;
   S21 — Thu 21/05: typed durations 13 h but 08:00 → 21:30 = 13.5 h; the app follows the typed hours (day flagged "to check"), the register counts 30 min of night. */
eq(diffs,["S20 app 13.422 register 13.109 (cumul 41.94, goal 31.20)","S21 app 12.031 register 12.188 (cumul 48.63, goal 39.00)"],"every week equal to the register ("+weeks+" weeks) but the 2 known differences");
const rb=S.withUser(alex,()=>H.recoveryBalance());
console.log("   APP: valued",rb.valued.toFixed(3),"paid",rb.toPay.toFixed(3),"bank",rb.bank.toFixed(3),"taken",rb.taken.toFixed(2),"balance",rb.balance.toFixed(3),"sunday",rb.counters.sunday.toFixed(2),"up to",rb.upTo);
const urgent=(2.5+5+0.5)*1.5;   /* 08/06 2.5 h, 04/08 5 h and 14/09 0.5 h worked during time off: paid + 50 % (register comment: "to be recovered or paid") */
near(rb.valued,219.34375+0.3125-0.15625,"total valued = register V2 (219.34 h) + the 2 known differences");
near(rb.toPay-urgent,135.5,"weeks 22 → 39 to be PAID = register \"Simu Juin-Sept\" (135.5 h)");
near(rb.bank,83.84375+0.3125-0.15625,"rest of the year banked = register \"Simu Jan-Mai Oct-Dec\" (83.84 h) + the 2 known differences");
near(rb.taken,117,"time off taken = register P2 (15 × 7.8 h = 117 h)");
near(rb.counters.sunday,19.5,"Sunday hours = register W2 (19.5 h)");
w.Date.now=realNow;
eq(errors,[],"no JS error");
}catch(x){ko++;console.log("EXCEPTION",x.stack)}
console.log("OK",ok,"KO",ko);process.exit(0);})();

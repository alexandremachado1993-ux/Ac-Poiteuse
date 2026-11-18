/* 4.5 — annual target (calendar-day prorata), contracts, worked / assimilated / valued counters.
   The 8 cases of the request of 17/11/2026. Node.js only. */
const load=require("./load");let ok=0,ko=0;
const near=(a,b,m)=>{Math.abs(a-b)<0.01?ok++:(ko++,console.log("FAIL",m,"got",a,"expected",b));};
function eq(a,b,m){const s=JSON.stringify(a)===JSON.stringify(b);s?ok++:(ko++,console.log("FAIL",m,"got",JSON.stringify(a),"expected",JSON.stringify(b)));}
(async()=>{try{
const {M}=load();const {Store:S,Auth:A,Hours:H}=M;
const id=n=>S.users().find(u=>u.name.startsWith(n)).id;
const alex=id("Alexandre"),dam=id("Damien"),yann=id("Yann");
for(const x of [alex,dam,yann]){await A.setPassword(x,"123456");A.signOut();}
await A.signIn(yann,"123456");
const days=(a,b)=>Math.round((Date.UTC(+b.slice(0,4),+b.slice(5,7)-1,+b.slice(8))-Date.UTC(+a.slice(0,4),+a.slice(5,7)-1,+a.slice(8)))/864e5)+1;
const P=(uid,year,end)=>S.withUser(uid,()=>H.yearProgress(year,end));
// 1) hired on 1 January: 2 028 h (169 h × 12)
S.updateUser(dam,{hireDate:"2026-01-01"});
near(P(dam,2026).target,2028,"case 1: hired on 1 January → 2 028 h");near(H.monthlyHours(H.contractOn(S.user(dam),"2026-06-01")),169,"39 h a week = 169 h a month");
// 2) hired on 4 May: calendar days (242 / 365)
near(P(alex,2026).target,2028*242/365,"case 2: hired on 4 May → 2 028 × 242 / 365");
near(P(alex,2026,"2026-11-30").targetToDate,Math.min(1,1)*2028*days("2026-05-04",[ "2026-11-30",M.Utils.isoLocal(Date.now())].sort()[0])/365,"case 2: target to the end of the report (never after today)");
// 3) hired on 15 September (middle of a month)
S.updateUser(dam,{hireDate:"2026-09-15"});near(P(dam,2026).target,2028*days("2026-09-15","2026-12-31")/365,"case 3: hired on 15 September");
// leaving date: target stops
S.updateUser(dam,{hireDate:"2026-01-01",leaveDate:"2026-06-30"});near(P(dam,2026).target,2028*days("2026-01-01","2026-06-30")/365,"leaving on 30 June: target stops");
S.updateUser(dam,{leaveDate:""});
// next years: leap year 2028 = 366 days
near(P(dam,2028).target,2028,"following years (2028, 366 days): full year = 2 028 h");
// 7) contract change during the year: 39 h until 30 June, 35 h from 1 July
eq(S.updateUser(dam,{contracts:[{from:"2026-07-01",weeklyHours:35,normalHours:35,workDays:5}]}),true,"contract saved by a manager");
near(P(dam,2026).target,39*52*days("2026-01-01","2026-06-30")/365+35*52*days("2026-07-01","2026-12-31")/365,"case 7: each period with its own contract");
eq(S.updateUser(dam,{contracts:[{from:"2026-07-01",weeklyHours:99,normalHours:35,workDays:5}]}),false,"absurd contract refused");
S.updateUser(dam,{contracts:[]});
// 4) a week of paid leave: assimilated, worked unchanged, no deficit
S.withUser(alex,()=>S.addApprovedRequest({type:"paid_leave",startDate:"2026-06-08",endDate:"2026-06-12"}));
let h=S.withUser(alex,()=>H.hoursBetween("2026-06-08","2026-06-14"));
eq([h.worked,Math.round(h.leave*100)/100,Math.round(h.assimilated*100)/100],[0,39,39],"case 4: a week of leave = 39 h assimilated, 0 h worked");
// 5) holiday not worked (Tuesday 14 July): credited, not worked
h=S.withUser(alex,()=>H.hoursBetween("2026-07-14","2026-07-14"));eq([h.worked,Math.round(h.holiday*100)/100],[0,7.8],"case 5: holiday credited 7 h 48, not worked");
// 6) time off: assimilated as time off, never as work; other absence types assimilated too (decision 17/11)
S.withUser(alex,()=>S.addApprovedRequest({type:"time_off",startDate:"2026-06-15",endDate:"2026-06-15"}));
S.withUser(alex,()=>S.addApprovedRequest({type:"training",startDate:"2026-06-16",endDate:"2026-06-16"}));
h=S.withUser(alex,()=>H.hoursBetween("2026-06-15","2026-06-16"));
eq([h.worked,Math.round(h.timeOff*100)/100,Math.round(h.other*100)/100],[0,7.8,7.8],"case 6: time off and training assimilated, not worked");
// worked hours: every clocked hour, validated ones apart
const T=(iso,hm)=>new Date(iso+"T"+hm+":00").getTime();
S.withUser(alex,()=>S.addEntry({category:"work",start:T("2026-06-17","08:00"),end:T("2026-06-17","12:00"),manual:true}));
h=S.withUser(alex,()=>H.hoursBetween("2026-06-15","2026-06-21"));eq([h.worked,h.validated],[4,0],"worked = every clocked hour; none validated yet");
// no double count: worked + assimilated = valued
const p=P(alex,2026,"2026-06-30");near(p.valued,p.worked+p.assimilated,"valued = worked + assimilated");
// 8) report limited to a period: annual target kept, target to the end of the report
near(p.target,2028*242/365,"case 8: annual target shown for a partial report");near(p.targetToDate,2028*days("2026-05-04","2026-06-30")/365,"case 8: target to 30 June");
near(p.gap,p.valued-p.targetToDate,"gap = valued − target to date");
}catch(x){ko++;console.log("EXCEPTION",x.stack)}
console.log("OK",ok,"KO",ko);})();

/* 4.3 — forgotten password: request from the sign-in screen, hierarchy of who is told and who
   may reset, notifications after the reset, contact (e-mail / phone) of the profile. Node.js only. */
const load=require("./load");let ok=0,ko=0;
function eq(a,b,m){const s=JSON.stringify(a)===JSON.stringify(b);s?ok++:(ko++,console.log("FAIL",m,"got",JSON.stringify(a),"expected",JSON.stringify(b)));}
(async()=>{try{
const {M}=load();const {Store:S,Auth:A,Permissions:P}=M;
const id=n=>S.users().find(u=>u.name.startsWith(n)).id;
const alex=id("Alexandre"),dam=id("Damien"),enr=id("Enrique"),yann=id("Yann"),jer=id("Jérémie");
for(const x of [alex,dam,enr,yann,jer]){await A.setPassword(x,"123456");A.signOut();}
const notes=(who,type)=>S.notifications(who).filter(n=>n.type===type);
// 1) request from the sign-in screen (nobody signed in)
eq(S.askPasswordUnlock(alex),"ok","technician asks");eq(S.askPasswordUnlock(alex),"already","one pending request at a time");
eq(!!S.user(alex).unlockAskedAt,true,"request kept on the account");
eq([enr,yann,jer,dam].map(x=>notes(x,"account.unlockAsked").length),[1,1,1,0],"technician → team lead + quality + director, not the other technician");
eq(notes(enr,"account.unlockAsked")[0].link,"team/"+alex,"the notification opens the file of the person");
S.askPasswordUnlock(enr);eq([yann,jer,alex,dam].map(x=>notes(x,"account.unlockAsked").length),[2,2,0,0],"team lead → quality + director only");
S.askPasswordUnlock(yann);eq([jer,enr].map(x=>notes(x,"account.unlockAsked").length),[3,1],"quality → director (not the team lead)");
// 2) who may reset (hierarchy)
eq([P.canResetPassword(enr,alex),P.canResetPassword(enr,dam),P.canResetPassword(enr,yann),P.canResetPassword(dam,alex),P.canResetPassword(yann,jer),P.canResetPassword(jer,jer)],
 [true,true,false,false,true,false],"team lead: his technicians; never upwards; technician: nobody; managers: each other; never oneself");
// 3) signing in after all closes one's own request
await A.signIn(enr,"123456");eq(S.user(enr).unlockAskedAt,"","signed in after all: request closed");
eq(A.resetPassword(yann),false,"team lead cannot reset a manager");eq(A.resetPassword(enr),false,"nor himself");
eq(A.resetPassword(alex),true,"team lead resets his technician");
eq([S.user(alex).pinHash,S.user(alex).unlockAskedAt],["",""],"password cleared, request closed");
eq([notes(alex,"account.passwordResetMine").length,notes(yann,"account.passwordReset").length,notes(jer,"account.passwordReset").length,notes(enr,"account.passwordReset").length],
 [1,1,1,0],"the person and the other managers are told (not the one who reset)");
A.signOut();eq(S.askPasswordUnlock(alex),"notFound","no password any more: nothing to unlock");
// 4) a technician signed in cannot reset anybody; a request for someone else is refused when signed in
await A.signIn(dam,"123456");eq(A.resetPassword(enr),false,"technician cannot reset");eq(S.askPasswordUnlock(enr),"forbidden","no request for someone else");
// 5) contact of the profile
eq(S.updateProfile({email:"pas-un-mail"}),false,"invalid e-mail refused");eq(S.updateProfile({phone:"abc"}),false,"invalid phone refused");
eq([S.updateProfile({email:" damien@example.com ",phone:"+33 6 12 34 56 78"}),S.user(dam).email,S.user(dam).phone],[true,"damien@example.com","+33 6 12 34 56 78"],"contact saved");
eq(S.updateProfile({email:""}),true,"contact may be emptied");
A.signOut();
// 6) audit trail
const acts=S.auditTrail().map(a=>a.action);eq([acts.includes("user.unlockAsked"),acts.includes("user.passwordReset")],[true,true],"audit trail");
}catch(x){ko++;console.log("EXCEPTION",x.stack)}
console.log("OK",ok,"KO",ko);})();

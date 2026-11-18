/* Leave circuit (06/11/2026): draft → team lead's opinion → final decision (quality OR director) */
const load=require("./load");let ok=0,ko=0;
function eq(a,b,m){const s=JSON.stringify(a)===JSON.stringify(b);s?ok++:(ko++,console.log("FAIL",m,"got",JSON.stringify(a),"expected",JSON.stringify(b)));}
const {M}=load();const {Store:S,Leave:L,Permissions:P}=M;
const id=n=>S.users().find(u=>u.name===n).id;const alex=id("Alexandre Machado"),dam=id("Damien Morvan"),enr=id("Enrique Soler"),yann=id("Yann Lefloc'h"),jer=id("Jérémie Augé");
const req=(who,i)=>S.withUser(who,()=>S.requests().find(r=>r.id===i));
const notif=(who,type)=>{S.setCurrentUser(who);const n=S.notifications().some(x=>x.type===type);return n;};
S.setCurrentUser(yann);S.updateUser(alex,{hireDate:"2026-05-04"});
/* 3.0: this file checks the two-step circuit (rule leaveSingleDecision = false); the single decision: v3.js */
S.updateOrg({leaveSingleDecision:false});
// ---- request → team lead
S.setCurrentUser(alex);
const draft=S.addRequest({type:"paid_leave",startDate:"2026-12-14",endDate:"2026-12-18",draft:true});
eq(draft.status,"draft","draft kept");eq(notif(enr,"leave.toReview"),false,"no notification for a draft");
S.setCurrentUser(alex);eq(S.updateDraft(draft.id,{endDate:"2026-12-17"}),true,"draft editable");
eq(S.submitRequest(draft.id),true,"draft sent");eq(req(alex,draft.id).status,"pending_lead","→ waiting for the team lead (Enrique covers Sud)");
eq(notif(enr,"leave.toReview"),true,"team lead notified");
S.setCurrentUser(alex);eq(S.deleteRequest(draft.id),false,"a sent request cannot be deleted (history kept)");
eq(S.addRequest({type:"paid_leave",startDate:"2027-01-04",endDate:"2027-01-04",status:"approved"}).status,"pending_lead","the caller never chooses the status");
// ---- forecast only while open
const lb=S.withUser(alex,()=>L.balance("2026-11-06"));eq([lb.pending>0,lb.taken],[true,0],"open request: forecast only, nothing taken");
// ---- team lead's opinion
S.setCurrentUser(enr);
eq(S.reviewRequest(alex,draft.id,"unfavorable",""),"commentRequired","unfavourable needs a comment");
eq(S.decideRequest(alex,draft.id,"approved",enr),false,"team lead cannot decide");
eq(S.reviewRequest(alex,draft.id,"favorable","team covered"),true,"favourable opinion");
eq([req(alex,draft.id).status,req(alex,draft.id).review.by],["lead_favorable",enr],"→ favourable, opinion stored");
eq(notif(yann,"leave.toDecide")&&notif(jer,"leave.toDecide"),true,"both managers notified");
eq(notif(alex,"leave.reviewed.favorable"),true,"requester informed of the opinion");
// perimeter: without the Sud section, Enrique cannot review Alexandre
S.setCurrentUser(alex);const r2=S.addRequest({type:"time_off",startDate:"2026-12-21",endDate:"2026-12-21"});
S.setCurrentUser(yann);S.updateUser(enr,{sectionIds:["sec-nord"]});
S.setCurrentUser(enr);eq(S.reviewRequest(alex,r2.id,"favorable",""),"forbidden","team lead outside his perimeter: refused");
S.setCurrentUser(yann);S.updateUser(enr,{sectionIds:["sec-nord","sec-sud"]});
// changes asked → back to draft
S.setCurrentUser(enr);eq(S.reviewRequest(alex,r2.id,"changes","rather on the 22nd"),true,"change requested");
eq(req(alex,r2.id).status,"draft","→ back to the requester as a draft");eq(notif(alex,"leave.changesAsked"),true,"requester notified");
S.setCurrentUser(alex);S.updateDraft(r2.id,{startDate:"2026-12-22",endDate:"2026-12-22"});S.submitRequest(r2.id);eq(req(alex,r2.id).status,"pending_lead","resent");
// ---- final decision
S.setCurrentUser(yann);
const o={};eq(S.decideRequest(alex,r2.id,"approved",yann,o),false,"decide without the team lead's opinion…");eq(o.result,"bypassRequired","…needs a justification");
eq(S.decideRequest(alex,r2.id,"approved",yann,{bypass:"Enrique travelling"}),true,"exception justified");
eq([req(alex,r2.id).status,req(alex,r2.id).bypassReason],["approved","Enrique travelling"],"approved, exception kept");
S.setCurrentUser(jer);const o2={};eq(S.decideRequest(alex,draft.id,"rejected",jer,o2),false,"refusal…");eq(o2.result,"commentRequired","…needs a comment");
eq(S.decideRequest(alex,draft.id,"approved",jer,{comment:"enjoy your leave"}),true,"director decides (one of the two is enough)");
eq(S.decideRequest(alex,draft.id,"rejected",yann),false,"already decided: no second decision");
eq(notif(alex,"leave.decided.approved"),true,"requester notified of the decision");
eq(notif(enr,"leave.decided.approved.lead"),true,"team lead informed of the outcome");
const lb2=S.withUser(alex,()=>L.balance("2026-12-31"));eq(lb2.taken>0,true,"approved: the balance moves");
// ---- history of every step
const h=req(alex,draft.id).history.map(x=>x.to);eq(h,["pending_lead","lead_favorable","approved"],"every step historised");
S.setCurrentUser(yann);eq(S.auditQuery({action:"leave."}).length>=8,true,"steps in the audit trail");
// ---- 3.0: the team lead and the managers do not request their own leave in the app
S.setCurrentUser(enr);eq(S.addRequest({type:"paid_leave",startDate:"2027-02-01",endDate:"2027-02-05"}),null,"team lead: no own leave request (3.0)");
S.setCurrentUser(yann);eq(S.addRequest({type:"paid_leave",startDate:"2027-04-05",endDate:"2027-04-09"}),null,"manager: no own leave request (3.0)");
// ---- cancel
S.setCurrentUser(dam);const r3=S.addRequest({type:"time_off",startDate:"2027-03-01",endDate:"2027-03-01"});
eq(S.cancelRequest(r3.id),true,"requester cancels before the decision");eq(req(dam,r3.id).status,"cancelled","→ cancelled, kept with its history");
S.setCurrentUser(alex);eq(S.cancelRequest(draft.id),false,"an approved request cannot be cancelled by the requester");
// ---- delegation: a manager grants the final decision temporarily
S.setCurrentUser(dam);const r4=S.addRequest({type:"time_off",startDate:"2027-03-08",endDate:"2027-03-08"});
S.setCurrentUser(enr);S.reviewRequest(dam,r4.id,"favorable","");
S.setCurrentUser(yann);S.grant({userId:enr,permission:"leave.global.approve",kind:"temporary",start:"2026-11-01",end:"2099-12-31",reason:"delegation while Yann and Jeremie are on leave"});
S.setCurrentUser(enr);eq(S.decideRequest(dam,r4.id,"approved",enr),true,"delegated: the team lead decides");
eq(S.decideRequest(alex,"nope","approved",enr),false,"…an unknown request is refused");
// ---- older data: "pending" read as "waiting for the team lead"
{const {M:M2}=load({acp_data_v5:JSON.stringify({version:5,users:[{id:"u1",name:"Alexandre Machado",role:"technician",sectionIds:["sec-sud"]},{id:"u9",name:"Yann Lefloc'h",role:"quality",allSections:true}],
  perUser:{u1:{entries:[],requests:[{id:"q1",type:"paid_leave",startDate:"2026-12-01",endDate:"2026-12-01",status:"pending"}]},u9:{entries:[],requests:[]}}})});
 M2.Store.load();eq(M2.Store.withUser("u1",()=>M2.Store.requests()[0].status),"pending_lead","old 'pending' → waiting for the team lead");}
console.log("OK",ok,"KO",ko);

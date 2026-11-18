/* 3.3 — quick sign-in on this device: 4-digit PIN (rules, 5 tries, reset by a manager)
   and the check of a fingerprint / face signature (WebAuthn assertion, ECDSA P-256 and RSA). Node.js only. */
const load=require("./load");const {webcrypto:wc}=require("crypto");let ok=0,ko=0;
function eq(a,b,m){const s=JSON.stringify(a)===JSON.stringify(b);s?ok++:(ko++,console.log("FAIL",m,"got",JSON.stringify(a),"expected",JSON.stringify(b)));}
(async()=>{
const {M,mem}=load();const {Store:S,Auth:A,QuickUnlock:Q}=M;
const id=n=>S.users().find(u=>u.name.startsWith(n)).id;const alex=id("Alexandre"),jer=id("Jérémie");
eq([Q.checkPin("12a4","12a4"),Q.checkPin("123","123"),Q.checkPin("1111","1111"),Q.checkPin("1234","1234"),Q.checkPin("9876","9876"),Q.checkPin("2580","2581"),Q.checkPin("2580","2580")],
 ["quick.err.format","quick.err.format","quick.err.simple","quick.err.simple","quick.err.simple","quick.err.mismatch",null],"PIN rules: 4 digits, not trivial, confirmed");
await A.setPassword(alex,"123456");
eq(await Q.setPin("wrong","2580","2580"),"quick.err.password","current password asked to set a PIN");
eq(await Q.setPin("123456","2580","2580"),null,"PIN saved");
eq(Q.state(alex),{pin:true,bio:false},"state");
eq(JSON.stringify(JSON.parse(mem.acp_data_v5)).includes("2580"),false,"PIN neither in the business data…");
eq(Object.keys(JSON.parse(mem.acp_quick_unlock)),[alex],"…but in its own device key, hashed");
{const pin=JSON.parse(mem.acp_quick_unlock)[alex].pin;eq(/^[0-9a-f]{64}$/.test(pin)&&!mem.acp_quick_unlock.includes('"2580"'),true,"PIN hashed");}   /* 4.4: a random hash may contain the digits 2580 */
A.signOut();
eq(await Q.signInWithPin(alex,"2580"),"ok","right PIN opens the session");eq(S.currentUserId(),alex,"signed in");A.signOut();
for(let i=1;i<=4;i++) eq(await Q.signInWithPin(alex,"0000"),"wrong","wrong PIN "+i);
eq(await Q.signInWithPin(alex,"2580"),"ok","a right PIN resets the counter");A.signOut();
const r=[];for(let i=0;i<5;i++) r.push(await Q.signInWithPin(alex,"0000"));
eq(r,["wrong","wrong","wrong","wrong","locked"],"5 wrong codes: PIN removed");
eq([Q.state(alex).pin,await Q.signInWithPin(alex,"2580"),S.currentUserId()],[false,"unavailable",""],"then only the password");
// a manager resets the password: no quick sign-in left; a disabled account never opens
await A.signIn(alex,"123456");await Q.setPin("123456","2580","2580");A.signOut();
await A.setPassword(jer,"654321");eq(A.resetPassword(alex),true,"reset by a manager");A.signOut();
eq([Q.state(alex).pin,await Q.signInWithPin(alex,"2580")],[false,"unavailable"],"reset password: PIN removed");
await A.setPassword(alex,"123456");await Q.setPin("123456","2580","2580");A.signOut();
S.updateUser&&0;const db=JSON.parse(mem.acp_data_v5);db.users.find(u=>u.id===alex).accountStatus="disabled";
const {M:M2}=load({acp_data_v5:JSON.stringify(db),acp_quick_unlock:mem.acp_quick_unlock});
eq([M2.QuickUnlock.state(alex).pin,await M2.QuickUnlock.signInWithPin(alex,"2580"),M2.Store.currentUserId()],[false,"unavailable",""],"disabled account: no PIN sign-in");
// ---- fingerprint / face: signature check of an assertion ----
const enc=s=>new TextEncoder().encode(s),b64u=b=>Buffer.from(b).toString("base64url");
const origin="https://mtk.example";const challenge=wc.getRandomValues(new Uint8Array(32));
const authData=flags=>{const a=new Uint8Array(37);a.set(new Uint8Array(32).fill(7));a[32]=flags;a[36]=1;return a;};
const rawToDer=raw=>{const part=b=>{let i=0;while(i<31&&b[i]===0)i++;let v=b.slice(i);if(v[0]&0x80)v=Buffer.concat([Buffer.from([0]),v]);return Buffer.concat([Buffer.from([2,v.length]),v]);};
 const r=part(Buffer.from(raw.slice(0,32))),s=part(Buffer.from(raw.slice(32)));return new Uint8Array(Buffer.concat([Buffer.from([0x30,r.length+s.length]),r,s]));};
async function assertion(kind,opts){
 const o=Object.assign({type:"webauthn.get",challenge:b64u(challenge),origin,flags:0x05},opts||{});
 const kp=kind==="ec"?await wc.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]):
   await wc.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
 const cd=enc(JSON.stringify({type:o.type,challenge:o.challenge,origin:o.origin}));const ad=authData(o.flags);
 const data=new Uint8Array(ad.length+32);data.set(ad);data.set(new Uint8Array(await wc.subtle.digest("SHA-256",cd)),ad.length);
 let sig=new Uint8Array(await wc.subtle.sign(kind==="ec"?{name:"ECDSA",hash:"SHA-256"}:{name:"RSASSA-PKCS1-v1_5"},kp.privateKey,data));
 if(kind==="ec") sig=rawToDer(sig);
 if(o.tamper) sig[sig.length-1]^=1;
 const saved={id:"x",key:Buffer.from(await wc.subtle.exportKey("spki",kp.publicKey)).toString("base64"),alg:kind==="ec"?-7:-257};
 return {saved,a:{response:{clientDataJSON:cd.buffer,authenticatorData:ad.buffer,signature:sig.buffer}}};}
for(const kind of ["ec","rsa"]){const {saved,a}=await assertion(kind);eq(await Q.verify(saved,challenge,a,origin),true,kind+": valid signature accepted");}
const bad=[["tampered signature",{tamper:true}],["other challenge",{challenge:"AAAA"}],["other site",{origin:"https://evil.example"}],["creation, not sign-in",{type:"webauthn.create"}],["person not verified",{flags:0x01}]];
for(const [m,o] of bad){const {saved,a}=await assertion("ec",o);eq(await Q.verify(saved,challenge,a,origin),false,"refused: "+m);}
{const raw=new Uint8Array(64).map((_,i)=>i+1);eq([...Q.derToRaw(rawToDer(raw))],[...raw],"DER → r‖s");
 const hi=new Uint8Array(64).fill(0x90);eq([...Q.derToRaw(rawToDer(hi))],[...hi],"DER with leading zero bytes");}
console.log("OK",ok,"KO",ko);
})().catch(e=>{console.log("EXCEPTION",e&&e.stack);process.exit(1);});

const vm=require("vm"),fs=require("fs");
module.exports=function(preset){
 const mem=Object.assign({},preset||{});const sess={};
 const ctx={console,Date,Math,JSON,Set,Object,Array,String,Number,Promise,setTimeout,Intl,TextEncoder,TextDecoder,atob,btoa,Uint8Array,crypto:require("crypto").webcrypto,
  localStorage:{getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]},
    get length(){return Object.keys(mem).length},key:i=>Object.keys(mem)[i]||null},
  sessionStorage:{getItem:k=>k in sess?sess[k]:null,setItem:(k,v)=>{sess[k]=String(v)},removeItem:k=>{delete sess[k]}},
  navigator:{language:"fr-FR"},alert:m=>{throw new Error("alert:"+m)}};
 ctx.window={addEventListener(){},localStorage:ctx.localStorage,sessionStorage:ctx.sessionStorage};
 vm.createContext(ctx);
 const files=["storage-adapter","i18n","translations","utils","holidays","store","permissions","validation","auth","quick-unlock","hours","segments","leave"];
 for(const f of files){const p=require("path").join(__dirname,"..","js",f+".js");
   if(fs.existsSync(p)) vm.runInContext(fs.readFileSync(p,"utf8"),ctx,{filename:f});
   else if(f==="translations") vm.runInContext("const TRANSLATIONS={};",ctx);}
 vm.runInContext("this.M={I18n,Utils,Holidays,Store,Permissions,Validation,Auth,QuickUnlock,Hours,Segments,Leave,StorageAdapter}",ctx);
 return {M:ctx.M,mem,sess};
};

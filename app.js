(function(){
"use strict";
const $ = id => document.getElementById(id);
const T_ENT = "hetzi_entries", T_SET = "hetzi_settings";
const DEFAULT_CATS = ["ביטוחים","בריאות","חינוך","חוגים","סלולר","פנאי ומתנות","טיפוח וביגוד","קצבאות","אחר"];
const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const nf = new Intl.NumberFormat("he-IL",{minimumFractionDigits:0,maximumFractionDigits:2});
const money = n => "₪" + nf.format(Math.round(Math.abs(n)*100)/100);           // ₪ תמיד משמאל
const signed = n => (n<0?"−":"+") + money(n);
const pad = n => String(n).padStart(2,"0");
const today = () => { const d=new Date(); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); };

const S = { user:null, entries:[], cats:DEFAULT_CATS.slice(), nameA:"אילן", nameB:"קרן", month:today().slice(0,7), who:"all", kind:"all", online:navigator.onLine };

/* ---------- Supabase ---------- */
const cfg = window.HETZI_CONFIG || {};
const configured = cfg.SUPABASE_URL && !/YOUR_/.test(cfg.SUPABASE_URL) && cfg.SUPABASE_ANON_KEY && !/YOUR_/.test(cfg.SUPABASE_ANON_KEY);
const sb = (configured && window.supabase) ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

function show(view){
  $("loadingView").hidden = view!=="loading";
  $("authView").hidden = view!=="auth";
  $("appView").hidden = view!=="app";
}

/* ---------- auth ---------- */
const AUTH_ERR = {
  "Invalid login credentials":"האימייל או הסיסמה שגויים.",
  "User already registered":"האימייל הזה כבר רשום. אפשר להיכנס.",
  "Email not confirmed":"צריך לאשר את האימייל דרך הקישור שנשלח אליך.",
};
const authErr = e => { const m=(e&&e.message)||""; for(const k in AUTH_ERR) if(m.includes(k)) return AUTH_ERR[k];
  if(/Password should be/i.test(m)) return "הסיסמה צריכה להכיל לפחות 6 תווים.";
  if(/rate limit/i.test(m)) return "יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.";
  if(/fetch/i.test(m)) return "אין חיבור לשרת. בדוק את החיבור לאינטרנט.";
  return m || "הפעולה נכשלה."; };
function authMsg(err,ok){ $("aErr").textContent=err||""; $("aMsg").textContent=ok||""; }
const redirectTo = () => location.origin + location.pathname;

$("aLogin").onclick = async()=>{
  const email=$("aEmail").value.trim(), password=$("aPass").value;
  if(!email||!password) return authMsg("יש למלא אימייל וסיסמה.");
  authMsg(); $("aLogin").disabled=true;
  const {error} = await sb.auth.signInWithPassword({email,password});
  $("aLogin").disabled=false;
  if(error) authMsg(authErr(error));
};
$("aSignup").onclick = async()=>{
  const email=$("aEmail").value.trim(), password=$("aPass").value;
  if(!email||!password) return authMsg("יש למלא אימייל וסיסמה כדי להירשם.");
  if(password.length<6) return authMsg("הסיסמה צריכה להכיל לפחות 6 תווים.");
  authMsg(); $("aSignup").disabled=true;
  const {data,error} = await sb.auth.signUp({email,password,options:{emailRedirectTo:redirectTo()}});
  $("aSignup").disabled=false;
  if(error) return authMsg(authErr(error));
  if(!data.session) authMsg("", "נשלח אליך מייל אימות. אחרי לחיצה על הקישור אפשר להיכנס.");
};
$("aForgot").onclick = async()=>{
  const email=$("aEmail").value.trim();
  if(!email) return authMsg("יש להזין את האימייל ואז ללחוץ שוב.");
  const {error} = await sb.auth.resetPasswordForEmail(email,{redirectTo:redirectTo()});
  if(error) authMsg(authErr(error)); else authMsg("","נשלח אליך מייל עם קישור לאיפוס הסיסמה.");
};
$("pwSave").onclick = async()=>{
  const p=$("pwNew").value;
  if(p.length<6){ $("pwErr").textContent="לפחות 6 תווים."; return; }
  const {error}=await sb.auth.updateUser({password:p});
  if(error){ $("pwErr").textContent=authErr(error); return; }
  closeSheets(); toast("הסיסמה עודכנה");
};
$("btnLogout").onclick = async()=>{ closeSheets(); await sb.auth.signOut(); };

function setUser(u){
  const prev = S.user && S.user.id;
  S.user = u;
  if(!u){ S.entries=[]; show("auth"); return; }
  if(prev===u.id) return;
  $("acctEmail").textContent = u.email || "";
  loadCache(); show("app"); render(); loadAll();
}

/* ---------- cache (for offline viewing) ---------- */
const cacheKey = () => "hetzi-cache-" + S.user.id;
function saveCache(){ try{ localStorage.setItem(cacheKey(), JSON.stringify({entries:S.entries,cats:S.cats,nameA:S.nameA,nameB:S.nameB})); }catch(e){} }
function loadCache(){ try{ const c=JSON.parse(localStorage.getItem(cacheKey())||"null"); if(c){ S.entries=c.entries||[]; S.cats=c.cats||S.cats; S.nameA=c.nameA||S.nameA; S.nameB=c.nameB||S.nameB; } }catch(e){} }

/* ---------- data ---------- */
async function loadAll(){
  const [st, en] = await Promise.all([
    sb.from(T_SET).select("*").eq("user_id",S.user.id).maybeSingle(),
    sb.from(T_ENT).select("*").order("date",{ascending:false}).order("created_at",{ascending:false})
  ]);
  if(en.error){ setOnline(false); return; }
  setOnline(true);
  S.entries = en.data;
  if(st.data){
    S.cats = Array.isArray(st.data.categories) && st.data.categories.length ? st.data.categories : DEFAULT_CATS.slice();
    S.nameA = st.data.name_a || "אילן"; S.nameB = st.data.name_b || "קרן";
  } else {
    await saveSettings();
  }
  saveCache(); render();
}
async function saveSettings(){
  const {error} = await sb.from(T_SET).upsert({user_id:S.user.id, categories:S.cats, name_a:S.nameA, name_b:S.nameB, updated_at:new Date().toISOString()});
  if(error) throw error;
  saveCache();
}
async function saveEntry(id,data){
  if(id){
    const {data:row,error} = await sb.from(T_ENT).update(data).eq("id",id).select().single();
    if(error) throw error;
    S.entries = S.entries.map(e=>e.id===id?row:e);
  } else {
    const {data:row,error} = await sb.from(T_ENT).insert(Object.assign({user_id:S.user.id},data)).select().single();
    if(error) throw error;
    S.entries.push(row);
  }
  saveCache(); render();
}
async function deleteEntry(id){
  const {error} = await sb.from(T_ENT).delete().eq("id",id);
  if(error) throw error;
  S.entries = S.entries.filter(e=>e.id!==id); saveCache(); render();
}
function setOnline(v){ S.online=v; $("offlineNote").hidden=v; }
window.addEventListener("online",()=>{ if(S.user) loadAll(); });
window.addEventListener("offline",()=>setOnline(false));

/* ---------- ספטמבר 2026 מתוך הגיליון ---------- */
const SEPT_2026 = [
  ["expense","b",212,"ביטוח בריאות פרטי עלמא","ביטוחים"],
  ["expense","b",14.4,"ביטוח אמבולטורי עלמא","ביטוחים"],
  ["expense","a",145,"ביטוח בריאות פרטי יובל ואיילה","ביטוחים"],
  ["expense","b",60,"ביטוח פלטינום ילדים","ביטוחים"],
  ["expense","b",59,"סים עלמא ויובל","סלולר"],
  ["expense","a",1016,"כישורית","חינוך"],
  ["expense","a",40,"סים איילה","סלולר"],
  ["expense","b",180,"עלמא עגיל","טיפוח וביגוד"],
  ["expense","a",50,"עלמא מוקסו","בריאות"],
  ["expense","b",188,"עלמא תרופות","בריאות"],
  ["expense","a",62,"עלמא תרופות","בריאות"],
  ["expense","a",150,"יובל טיול זמן צפון","פנאי ומתנות"],
  ["expense","a",70,"יובל תספורת","טיפוח וביגוד"],
  ["expense","a",200,"יובל בר מצווה חברים","פנאי ומתנות"],
  ["expense","a",310,"יובל חוג קוסמות","חוגים"],
  ["expense","a",100,"איילה ויובל - תיקון אופניים","אחר"],
  ["expense","a",94,"איילה נשכנים","בריאות"],
  ["expense","a",830,"איילה חוג כדורגל תשלום ציוד","חוגים"],
  ["expense","a",280,"איילה חוג כדורגל","חוגים"],
  ["income","b",381,"קצבת ילדים","קצבאות"],
  ["income","a",1943,"קצבת נכות","קצבאות"],
];
async function importSept(btn){
  btn.disabled=true;
  const t0=Date.now();
  const rows = SEPT_2026.map((r,i)=>({user_id:S.user.id,type:r[0],payer:r[1],amount:r[2],description:r[3],category:r[4],date:"2026-09-01",created_at:new Date(t0+i*1000).toISOString()}));
  const {error} = await sb.from(T_ENT).insert(rows);
  if(error){ btn.disabled=false; toast("הייבוא נכשל. נסה שוב."); return; }
  const missing = [...new Set(SEPT_2026.map(r=>r[4]))].filter(c=>!S.cats.includes(c));
  if(missing.length){ S.cats=S.cats.concat(missing); try{ await saveSettings(); }catch(e){} }
  S.month="2026-09"; toast("ספטמבר יובא"); loadAll();
}

/* ---------- math: positive = B owes A ---------- */
function effect(e){
  const a=+e.amount||0;
  if(e.type==="expense")  return e.payer==="a"? a/2 : -a/2;
  if(e.type==="income")   return e.payer==="a"? -a/2 : a/2;
  if(e.type==="transfer") return e.payer==="a"? a : -a;
  return 0;
}
const nm = p => p==="a"?S.nameA:S.nameB;
function owesText(bal){
  if(Math.abs(bal)<0.005) return null;
  return bal>0 ? S.nameB+" צריכה להעביר ל"+S.nameA : S.nameA+" צריך להעביר ל"+S.nameB;
}
function transferText(e){ return e.payer==="a" ? S.nameA+" העביר ל"+S.nameB : S.nameB+" העבירה ל"+S.nameA; }

/* ---------- render ---------- */
const CAT_HUES=[24,205,145,280,340,48,175,250,0,95,310,190];
function catColor(c){ let i=S.cats.indexOf(c); if(i<0){ i=0; for(const ch of c) i=(i*31+ch.charCodeAt(0))>>>0; } return CAT_HUES[i%CAT_HUES.length]; }
function monthEntries(){ return S.entries.filter(e=>(e.date||"").slice(0,7)===S.month); }
const sumBy=(items,t,p)=>items.filter(e=>e.type===t&&(!p||e.payer===p)).reduce((s,e)=>s+(+e.amount),0);
function fmtDay(d){ return new Date(d+"T12:00").toLocaleDateString("he-IL",{day:"numeric",month:"numeric"}); }

function render(){
  $("whoA").textContent=S.nameA; $("whoB").textContent=S.nameB;
  document.querySelectorAll("[data-name=a]").forEach(n=>n.textContent=S.nameA);
  document.querySelectorAll("[data-name=b]").forEach(n=>n.textContent=S.nameB);

  // hero
  const bal = S.entries.reduce((s,e)=>s+effect(e),0);
  const hero=$("hero"); hero.classList.remove("plus","minus");
  const ow = owesText(bal);
  if(!S.entries.length){ $("heroWho").textContent="עוד אין רישומים"; $("heroAmt").textContent=money(0); $("heroSub").textContent="כל הוצאה או הכנסה שתירשם תתחלק חצי חצי."; $("btnSettle").hidden=true; }
  else if(!ow){ $("heroWho").textContent="אתם מאוזנים"; $("heroAmt").textContent=money(0); $("heroSub").textContent="אף אחד לא צריך להעביר כלום כרגע."; $("btnSettle").hidden=true; }
  else { hero.classList.add(bal>0?"plus":"minus"); $("heroWho").textContent=ow; $("heroAmt").textContent=money(bal); $("heroSub").textContent="יתרה מצטברת על כל הרישומים."; $("btnSettle").hidden=false; }

  // month
  const [y,m]=S.month.split("-").map(Number);
  $("monthTitle").textContent=MONTHS[m-1]+" "+y;
  const items=monthEntries();
  for(const p of ["a","b"]){
    $("pExp"+p).textContent=money(sumBy(items,"expense",p));
    $("pInc"+p).textContent=money(sumBy(items,"income",p));
    $("pc"+p).classList.toggle("dim", S.who!=="all" && S.who!==p);
  }
  setSeg("whoFilter",S.who); setSeg("kindFilter",S.kind);
  const mBal = items.filter(e=>e.type!=="transfer").reduce((s,e)=>s+effect(e),0);
  const res=$("monthRes"); res.innerHTML=""; res.className="result";
  if(items.some(e=>e.type!=="transfer")){
    const mOw=owesText(mBal);
    const l=document.createElement("span"); l.className="rl"; l.textContent="סיכום החודש";
    const t=document.createElement("span"); t.className="rt";
    if(!mOw) t.textContent="מאוזן";
    else { res.classList.add(mBal>0?"plus":"minus"); t.append(mOw+" "); const s=document.createElement("b"); s.className="ltr num"; s.textContent=money(mBal); t.append(s); }
    res.append(l,t);
  } else res.hidden=true;
  if(items.some(e=>e.type!=="transfer")) res.hidden=false;

  // lists
  const box=$("lists"); box.innerHTML="";
  if(!items.length){
    const d=document.createElement("div"); d.className="empty";
    d.textContent="אין רישומים ב"+MONTHS[m-1]+".";
    if(S.month==="2026-09"){
      const b=document.createElement("button"); b.className="settle"; b.textContent="ייבוא ספטמבר מהאקסל";
      b.onclick=()=>importSept(b); d.append(document.createElement("br"), b);
    }
    box.appendChild(d); return;
  }
  const shown=items.filter(e=>S.who==="all"||e.payer===S.who)
    .sort((a,b)=>(b.date||"").localeCompare(a.date||"")||String(a.created_at).localeCompare(String(b.created_at)));
  const SECS=[["expense","הוצאות","exp"],["income","הכנסות והחזרים","inc"],["transfer","העברות ביניכם","tr"]];
  for(const [type,title,cls] of SECS){
    if(S.kind!=="all" && S.kind!==type) continue;
    const rows=shown.filter(e=>e.type===type);
    if(!rows.length && type==="transfer") continue;
    const sec=document.createElement("section"); sec.className="sec "+cls;
    const h=document.createElement("header");
    const h3=document.createElement("h3"); h3.textContent=title;
    const tot=document.createElement("span"); tot.className="stot";
    const c=document.createElement("small"); c.textContent=rows.length+" רישומים";
    const v=document.createElement("b"); v.className="ltr num"; v.textContent=money(rows.reduce((s,e)=>s+(+e.amount),0));
    tot.append(c,v); h.append(h3,tot); sec.appendChild(h);
    if(!rows.length){ const p=document.createElement("p"); p.className="none"; p.textContent= S.who==="all"?"אין רישומים החודש.":"אין רישומים של "+nm(S.who)+" החודש."; sec.appendChild(p); }
    for(const e of rows){
      const r=document.createElement("button"); r.className="item";
      r.innerHTML='<span class="pb"></span><span class="main"><span class="d"></span><span class="meta"></span></span><span class="amt num ltr"></span>';
      const pb=r.querySelector(".pb"); pb.classList.add(e.payer); pb.textContent=nm(e.payer).slice(0,1); pb.title=nm(e.payer);
      r.querySelector(".d").textContent = type==="transfer" ? transferText(e) : (e.description||title);
      const meta=r.querySelector(".meta");
      if(e.category){ const t=document.createElement("span"); t.className="tag"; t.style.setProperty("--h",catColor(e.category)); t.textContent=e.category; meta.appendChild(t); }
      const dt=document.createElement("span"); dt.className="dt"; dt.textContent=fmtDay(e.date)+"  "+(type==="expense"?"שילם/ה ":type==="income"?"קיבל/ה ":"")+(type==="transfer"?"":nm(e.payer)); meta.appendChild(dt);
      r.querySelector(".amt").textContent=money(e.amount);
      r.addEventListener("click",()=>openEntry(e));
      sec.appendChild(r);
    }
    box.appendChild(sec);
  }
}

/* ---------- entry sheet ---------- */
let F={};
function setSeg(segId,val){ document.querySelectorAll("#"+segId+" button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===val?"true":"false")); }
function renderCats(){
  const c=$("catChips"); c.innerHTML="";
  const list = S.cats.slice(); if(F.cat && !list.includes(F.cat)) list.push(F.cat);
  list.forEach(k=>{ const b=document.createElement("button"); b.textContent=k; b.setAttribute("aria-pressed",F.cat===k?"true":"false");
    b.onclick=()=>{ F.cat = F.cat===k?"":k; renderCats(); }; c.appendChild(b); });
  const add=document.createElement("button"); add.className="add"; add.textContent="+ קטגוריה";
  add.onclick=async()=>{
    const n=(prompt("שם הקטגוריה החדשה")||"").trim(); if(!n) return;
    if(!S.cats.includes(n)){ S.cats.push(n); try{ await saveSettings(); }catch(e){ toast("שמירת הקטגוריה נכשלה"); } }
    F.cat=n; renderCats();
  };
  c.appendChild(add);
}
function updateForm(){
  setSeg("typeSeg",F.type); setSeg("whoSeg",F.payer);
  $("whoLbl").textContent = F.type==="expense"?"מי שילם?":F.type==="income"?"מי קיבל את הכסף?":"מי העביר?";
  $("whoA").textContent = F.type==="transfer"? S.nameA+" העביר" : S.nameA;
  $("whoB").textContent = F.type==="transfer"? S.nameB+" העבירה" : S.nameB;
  $("descBlock").hidden = F.type==="transfer";
  const a=parseAmt($("fAmt").value);
  const p=$("fPreview"); p.innerHTML="";
  if(a>0){ const ef=effect({type:F.type,payer:F.payer,amount:a});
    const s=document.createElement("span"); s.className="ltr"; s.textContent=money(ef);
    p.append("היתרה תזוז ב־",s," לטובת "+(ef>0?S.nameA:S.nameB)+"."); }
}
function parseAmt(v){ return parseFloat(String(v).replace(/,/g,"").replace(/[^\d.]/g,""))||0; }
function fillDatalist(){
  const seen=new Map();
  S.entries.forEach(e=>{ if(e.description && !seen.has(e.description)) seen.set(e.description,e); });
  const dl=$("descList"); dl.innerHTML="";
  [...seen.keys()].sort().forEach(k=>{ const o=document.createElement("option"); o.value=k; dl.appendChild(o); });
  return seen;
}
let descMap=new Map();
function openEntry(e, preset){
  descMap=fillDatalist();
  F = e ? {id:e.id,type:e.type,payer:e.payer,cat:e.category||""} : Object.assign({type:"expense",payer:"a",cat:""},preset||{});
  $("entryTitle").textContent = e?"עריכת רישום":(F.type==="transfer"?"רישום התחשבנות":"רישום חדש");
  $("fAmt").value = e? e.amount : (preset&&preset.amount?preset.amount:"");
  $("fDesc").value = e? (e.description||"") : "";
  $("fDate").value = e? e.date : (S.month===today().slice(0,7)? today() : S.month+"-01");
  $("fDel").hidden=!e; $("fErr").textContent="";
  renderCats(); updateForm();
  $("entryScrim").classList.add("open");
  if(!e) setTimeout(()=>$("fAmt").focus(),60);
}
$("fDesc").addEventListener("change",()=>{
  const prev=descMap.get($("fDesc").value.trim());
  if(prev && !F.id){ if(!F.cat && prev.category) F.cat=prev.category; if(prev.type!=="transfer"){ F.type=prev.type; F.payer=prev.payer; } renderCats(); updateForm(); }
});
function closeSheets(){ document.querySelectorAll(".scrim").forEach(s=>s.classList.remove("open")); }
$("typeSeg").addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b) return; F.type=b.dataset.v;
  if(F.type==="income" && !F.cat && S.cats.includes("קצבאות")) F.cat="קצבאות";
  renderCats(); updateForm(); });
$("whoSeg").addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b) return; F.payer=b.dataset.v; updateForm(); });
$("fAmt").addEventListener("input",updateForm);
$("fCancel").onclick=closeSheets;
$("fSave").onclick=async()=>{
  const amount=parseAmt($("fAmt").value), date=$("fDate").value;
  if(!(amount>0)){ $("fErr").textContent="יש להזין סכום גדול מאפס."; return; }
  if(!date){ $("fErr").textContent="יש לבחור תאריך."; return; }
  const data={type:F.type,payer:F.payer,amount:Math.round(amount*100)/100,date,
    description:F.type==="transfer"?"":$("fDesc").value.trim(),category:F.type==="transfer"?"":F.cat};
  $("fSave").disabled=true;
  try{ await saveEntry(F.id,data); S.month=date.slice(0,7); closeSheets(); toast(F.id?"הרישום עודכן":"הרישום נשמר"); render(); }
  catch(e){ $("fErr").textContent = navigator.onLine ? "השמירה נכשלה. נסה שוב." : "אין חיבור לאינטרנט. השמירה תתאפשר כשהחיבור יחזור."; }
  $("fSave").disabled=false;
};
$("fDel").onclick=async()=>{
  if(!confirm("למחוק את הרישום?")) return;
  try{ await deleteEntry(F.id); closeSheets(); toast("הרישום נמחק"); }catch(e){ $("fErr").textContent="המחיקה נכשלה. נסה שוב."; }
};

/* ---------- settings: names + categories ---------- */
let CE=[];
function renderCatEditor(){
  const box=$("catEditor"); box.innerHTML="";
  CE.forEach((c,i)=>{
    const row=document.createElement("div"); row.className="catrow";
    const inp=document.createElement("input"); inp.type="text"; inp.value=c.name; inp.setAttribute("aria-label","שם קטגוריה");
    inp.oninput=()=>{ c.name=inp.value; };
    const del=document.createElement("button"); del.textContent="✕"; del.setAttribute("aria-label","מחיקת "+c.name);
    del.onclick=()=>{ CE.splice(i,1); renderCatEditor(); };
    row.append(inp,del); box.appendChild(row);
  });
}
$("btnSettings").onclick=()=>{
  $("sNameA").value=S.nameA; $("sNameB").value=S.nameB; $("sErr").textContent="";
  CE=S.cats.map(c=>({orig:c,name:c})); renderCatEditor(); $("newCat").value="";
  $("setScrim").classList.add("open");
};
$("addCat").onclick=()=>{ const n=$("newCat").value.trim(); if(!n) return; CE.push({orig:null,name:n}); $("newCat").value=""; renderCatEditor(); };
$("newCat").addEventListener("keydown",e=>{ if(e.key==="Enter") $("addCat").click(); });
$("sCancel").onclick=closeSheets;
$("sSave").onclick=async()=>{
  const names=CE.map(c=>c.name.trim());
  if(names.some(n=>!n)){ $("sErr").textContent="יש קטגוריה בלי שם."; return; }
  if(new Set(names).size!==names.length){ $("sErr").textContent="יש שתי קטגוריות באותו שם."; return; }
  $("sSave").disabled=true;
  try{
    for(const c of CE){
      const n=c.name.trim();
      if(c.orig && n!==c.orig){
        const {error}=await sb.from(T_ENT).update({category:n}).eq("category",c.orig);
        if(error) throw error;
        S.entries.forEach(e=>{ if(e.category===c.orig) e.category=n; });
      }
    }
    S.cats=names;
    S.nameA=$("sNameA").value.trim()||"אילן"; S.nameB=$("sNameB").value.trim()||"קרן";
    await saveSettings(); closeSheets(); toast("ההגדרות נשמרו"); render();
  }catch(e){ $("sErr").textContent="השמירה נכשלה. בדוק את החיבור ונסה שוב."; }
  $("sSave").disabled=false;
};

/* ---------- actions ---------- */
$("btnAdd").onclick=()=>openEntry(null);
$("btnSettle").onclick=()=>{
  const bal=S.entries.reduce((s,e)=>s+effect(e),0);
  openEntry(null,{type:"transfer",payer: bal>0?"b":"a", amount:Math.round(Math.abs(bal)*100)/100});
};
$("prevM").onclick=()=>shiftMonth(-1); $("nextM").onclick=()=>shiftMonth(1);
function shiftMonth(d){ let [y,m]=S.month.split("-").map(Number); m+=d; if(m<1){m=12;y--;} if(m>12){m=1;y++;} S.month=y+"-"+pad(m); render(); }
$("whoFilter").addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b) return; S.who=b.dataset.v; render(); });
$("kindFilter").addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b) return; S.kind=b.dataset.v; render(); });
["a","b"].forEach(p=>$("pc"+p).addEventListener("click",()=>{ S.who = S.who===p?"all":p; render(); }));

function monthItems(){ return monthEntries().sort((a,b)=>a.date.localeCompare(b.date)||String(a.created_at).localeCompare(String(b.created_at))); }
$("btnCopy").onclick=()=>{
  const [y,m]=S.month.split("-").map(Number); const items=monthItems();
  const L=["סיכום הוצאות הילדים – "+MONTHS[m-1]+" "+y,""];
  const block=(title,type)=>{
    const rows=items.filter(e=>e.type===type); if(!rows.length) return;
    L.push(title);
    rows.forEach(e=>L.push("• "+(e.description||title)+": "+money(e.amount)+" ("+nm(e.payer)+")"));
    L.push("");
  };
  block("הוצאות:","expense"); block("הכנסות והחזרים:","income");
  const tr=items.filter(e=>e.type==="transfer");
  if(tr.length){ L.push("העברות:"); tr.forEach(e=>L.push("• "+transferText(e)+" "+money(e.amount))); L.push(""); }
  L.push("הוצאות "+S.nameA+": "+money(sumBy(items,"expense","a"))+" | "+S.nameB+": "+money(sumBy(items,"expense","b")));
  L.push("הכנסות "+S.nameA+": "+money(sumBy(items,"income","a"))+" | "+S.nameB+": "+money(sumBy(items,"income","b")));
  const mBal=items.filter(e=>e.type!=="transfer").reduce((s,e)=>s+effect(e),0);
  const mOw=owesText(mBal); L.push("סיכום החודש: "+(mOw? mOw+" "+money(mBal) : "מאוזן"));
  const bal=S.entries.reduce((s,e)=>s+effect(e),0), ow=owesText(bal);
  L.push("יתרה כוללת: "+(ow? ow+" "+money(bal) : "מאוזנים"));
  if(!items.length) L.splice(2,0,"אין רישומים החודש.","");
  $("sumText").value=L.join("\n");
  $("sumShare").hidden=!navigator.share;
  $("sumScrim").classList.add("open");
};
$("sumClose").onclick=closeSheets;
$("sumCopy").onclick=async()=>{ const t=$("sumText");
  try{ await navigator.clipboard.writeText(t.value); toast("הסיכום הועתק"); } catch(e){ t.focus(); t.select(); toast("סמן והעתק ידנית"); } };
$("sumShare").onclick=async()=>{ try{ await navigator.share({text:$("sumText").value}); }catch(e){} };

/* ---------- Excel export ---------- */
function loadScript(src,test){
  if(test()) return Promise.resolve();
  return new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
}
const loadExcelJS=()=>loadScript("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js",()=>!!window.ExcelJS);
const loadSheetJS=()=>loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",()=>!!window.XLSX);
const X = {
  font:"Arial", money:'"₪"#,##0.00;-"₪"#,##0.00;"₪"0', date:"dd/mm/yyyy",
  navy:"FF1E2940", line:"FFD5DBD3",
  exp:"FFC46A2A", expL:"FFFBEFE4", inc:"FF2A8577", incL:"FFE2F2EF", tr:"FF5B5FA0", trL:"FFE9EAF5",
  zebra:"FFF7F8F6", a:"FF2F6DB5", b:"FFA8458A"
};
const fill = c => ({type:"pattern",pattern:"solid",fgColor:{argb:c}});
const border = () => { const s={style:"thin",color:{argb:X.line}}; return {top:s,bottom:s,left:s,right:s}; };
const toDate = s => { const [y,m,d]=s.split("-").map(Number); return new Date(Date.UTC(y,m-1,d)); };
const colL = n => String.fromCharCode(64+n);

function styleRow(row,keys,{bg,color="FF1E2940",bold=false,size=11,height}={}){
  row.eachCell({includeEmpty:true},(c,col)=>{ if(col>keys.length) return;
    c.font={name:X.font,size,bold,color:{argb:color}};
    if(bg) c.fill=fill(bg);
    c.border=border();
    const k=keys[col-1];
    c.alignment={vertical:"middle",horizontal:(k==="desc"||k==="cat")?"right":"center"};
  });
  if(height) row.height=height;
}
function cellLen(c){
  const v=c.value;
  if(v==null||v==="") return 0;
  if(v instanceof Date) return 10;
  if(typeof v==="number") return money(v).length+3;
  if(typeof v==="object" && "formula" in v) return money(v.result||0).length+4;
  return String(v).length;
}
function autoWidth(ws,ncol,min=7){
  for(let i=1;i<=ncol;i++){
    let w=0;
    ws.getColumn(i).eachCell({includeEmpty:false},c=>{ if(c.isMerged) return; w=Math.max(w,cellLen(c)*(c.font&&c.font.bold?1.15:1.05)); });
    ws.getColumn(i).width=Math.min(48,Math.max(min,Math.ceil(w+2)));
  }
}
function buildMonthSheet(wb, ym, opt){
  const [y,m]=ym.split("-").map(Number);
  const ws=wb.addWorksheet(MONTHS[m-1]+" "+y,{views:[{rightToLeft:true,showGridLines:false}],
    pageSetup:{orientation:"portrait",fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9}});
  const items=S.entries.filter(e=>e.date.slice(0,7)===ym).sort((a,b)=>a.date.localeCompare(b.date)||String(a.created_at).localeCompare(String(b.created_at)));
  const B=S.nameB, A=S.nameA;
  const keys=[]; if(opt.date) keys.push("date"); keys.push("desc"); if(opt.cat) keys.push("cat"); keys.push("b","a");
  const N=keys.length, ci=k=>keys.indexOf(k)+1, L=k=>colL(ci(k)), LAST=colL(N), LBL_END=colL(ci("b")-1);
  const vals=o=>keys.map(k=>o[k]===undefined?"":o[k]);
  const merge=(r,a,b)=>{ if(a!==b) ws.mergeCells(`${a}${r}:${b}${r}`); };
  const rightA=r=>{ ws.getCell("A"+r).alignment={horizontal:"right",vertical:"middle"}; };

  ws.mergeCells(`A1:${LAST}1`);
  ws.getCell("A1").value="סיכום תשלומים לחודש "+MONTHS[m-1]+" "+y;
  styleRow(ws.getRow(1),keys,{bg:X.navy,color:"FFFFFFFF",bold:true,size:16,height:34});
  ws.getCell("A1").alignment={horizontal:"center",vertical:"middle"};
  ws.addRow([]).height=8;

  const section=(type,title,head,headL,totLabel)=>{
    const rows=items.filter(e=>e.type===type);
    const hr=ws.addRow(vals({date:"תאריך",desc:title,cat:"קטגוריה",b:B,a:A}));
    styleRow(hr,keys,{bg:head,color:"FFFFFFFF",bold:true,size:12,height:24});
    const first=hr.number+1;
    rows.forEach((e,i)=>{
      const r=ws.addRow(vals({date:toDate(e.date),desc:type==="transfer"?transferText(e):(e.description||""),cat:e.category||"",
        b:e.payer==="b"?+e.amount:null,a:e.payer==="a"?+e.amount:null}));
      styleRow(r,keys,{bg:i%2?X.zebra:"FFFFFFFF",height:20});
    });
    if(!rows.length){ const r=ws.addRow(vals({desc:"אין רישומים"})); styleRow(r,keys,{color:"FF8A919C",height:20}); }
    const last=ws.lastRow.number;
    const tr=ws.addRow(vals({desc:totLabel,
      b:{formula:`SUM(${L("b")}${first}:${L("b")}${last})`, result:sumBy(rows,type,"b")},
      a:{formula:`SUM(${L("a")}${first}:${L("a")}${last})`, result:sumBy(rows,type,"a")}}));
    styleRow(tr,keys,{bg:headL,bold:true,height:22});
    for(let r=first;r<=tr.number;r++){
      if(opt.date) ws.getCell(L("date")+r).numFmt=X.date;
      for(const p of ["b","a"]){ const c=ws.getCell(L(p)+r); c.numFmt=X.money; c.font=Object.assign({},c.font,{color:{argb:X[p]}}); }
    }
    return tr.number;
  };
  const labelRow=(label,valueCell,style)=>{
    const o={b:valueCell}; const r=ws.addRow(vals(o)); r.getCell(1).value=label;
    merge(r.number,"A",LBL_END); styleRow(r,keys,style); rightA(r.number);
    ws.getCell(L("b")+r.number).numFmt=X.money; return r.number;
  };
  const noteRow=(text,style)=>{ const r=ws.addRow([text]); merge(r.number,"A",LAST); styleRow(r,keys,style); rightA(r.number); return r; };
  const lb=L("b"), la=L("a");

  const eTot=section("expense","סוג הוצאה",X.exp,X.expL,'סה"כ הוצאות');
  const eB=sumBy(items,"expense","b"), eA=sumBy(items,"expense","a");
  const eCalc=labelRow("חישוב הוצאות",{formula:`(${lb}${eTot}-${la}${eTot})/2`,result:(eB-eA)/2},{bg:X.expL,bold:true,height:22});
  ws.addRow([]).height=10;
  const iTot=section("income","סוג הכנסה / החזר",X.inc,X.incL,'סה"כ הכנסות');
  const iB=sumBy(items,"income","b"), iA=sumBy(items,"income","a");
  const iCalc=labelRow("חישוב הכנסות",{formula:`(${la}${iTot}-${lb}${iTot})/2`,result:(iA-iB)/2},{bg:X.incL,bold:true,height:22});
  const parts=[`${lb}${eCalc}`,`${lb}${iCalc}`]; let result=(eB-eA)/2+(iA-iB)/2;
  const hasTr=items.some(e=>e.type==="transfer");
  if(hasTr){
    ws.addRow([]).height=10;
    const tTot=section("transfer","העברות ביניכם",X.tr,X.trL,'סה"כ העברות');
    parts.push(`(${lb}${tTot}-${la}${tTot})`);
    result+=sumBy(items,"transfer","b")-sumBy(items,"transfer","a");
  }
  ws.addRow([]).height=10;
  labelRow("סיכום סופי",{formula:parts.join("+"),result},{bg:X.navy,color:"FFFFFFFF",bold:true,size:13,height:28});
  const ow=owesText(-result);
  noteRow(ow ? ow+" "+money(result)+(hasTr?" (אחרי העברות)":"") : "החודש מאוזן",{bold:true,size:12,height:24,color: result<0?"FF3F7A5A":"FFA94F38"});
  if(opt.notes){
    const cum=Math.round(-100*S.entries.filter(e=>e.date.slice(0,7)<=ym).reduce((s,e)=>s+effect(e),0))/100;
    labelRow("יתרה מצטברת עד סוף החודש",cum,{bg:"FFEFF1EC",bold:true,height:22});
    const cn=owesText(-cum);
    noteRow(cn? cn+" "+money(cum)+" (כולל חודשים קודמים)" : "מאוזנים עד סוף החודש",{color:"FF66707F",height:20});
    ws.addRow([]);
    const leg=ws.addRow(["ערך שלילי בסיכום = "+B+" צריכה להעביר ל"+A+"; ערך חיובי = "+A+" צריך להעביר ל"+B+"."]);
    merge(leg.number,"A",LAST);
    leg.getCell(1).font={name:X.font,size:9,italic:true,color:{argb:"FF8A919C"}};
    leg.getCell(1).alignment={horizontal:"right"};
  }
  autoWidth(ws,N);
  if(opt.date) ws.getColumn(ci("date")).width=Math.max(ws.getColumn(ci("date")).width,12);
  ws.getColumn(ci("desc")).width=Math.max(ws.getColumn(ci("desc")).width,20);
}
function buildAllSheet(wb, months){
  const ws=wb.addWorksheet("כל הרישומים",{views:[{rightToLeft:true,state:"frozen",ySplit:1}]});
  ws.columns=[{header:"תאריך"},{header:"סוג"},{header:"תיאור"},{header:"קטגוריה"},{header:"מי"},{header:"סכום"}];
  const TL={expense:"הוצאה",income:"הכנסה",transfer:"העברה"};
  const head=ws.getRow(1); head.height=24;
  head.eachCell(c=>{ c.font={name:X.font,bold:true,color:{argb:"FFFFFFFF"}}; c.fill=fill(X.navy); c.alignment={horizontal:"center",vertical:"middle"}; });
  S.entries.filter(e=>months.includes(e.date.slice(0,7))).sort((a,b)=>a.date.localeCompare(b.date)).forEach((e,i)=>{
    const r=ws.addRow([toDate(e.date),TL[e.type],e.type==="transfer"?transferText(e):(e.description||""),e.category||"",nm(e.payer),+e.amount]);
    r.eachCell({includeEmpty:true},c=>{ c.font={name:X.font,size:11}; c.border=border(); if(i%2) c.fill=fill(X.zebra); });
    r.getCell(1).numFmt=X.date; r.getCell(6).numFmt=X.money;
    r.getCell(2).font={name:X.font,size:11,bold:true,color:{argb: e.type==="expense"?X.exp:e.type==="income"?X.inc:X.tr}};
    r.getCell(5).font={name:X.font,size:11,color:{argb: e.payer==="a"?X.a:X.b}};
  });
  ws.autoFilter={from:"A1",to:"F1"};
  autoWidth(ws,6,8); ws.getColumn(1).width=12;
}

// export dialog
const allMonths=()=>[...new Set(S.entries.map(e=>e.date.slice(0,7)))].sort().reverse();
$("btnXlsx").onclick=()=>{
  if(!S.entries.length){ toast("אין עדיין נתונים לייצוא"); return; }
  const box=$("xMonths"); box.innerHTML="";
  for(const ym of allMonths()){
    const [y,m]=ym.split("-").map(Number);
    const l=document.createElement("label"); const c=document.createElement("input");
    c.type="checkbox"; c.value=ym; c.checked=true; l.append(c," "+MONTHS[m-1]+" "+y); box.appendChild(l);
  }
  $("xErr").textContent=""; $("xScrim").classList.add("open");
};
$("xAll").onclick=()=>{ const cs=[...document.querySelectorAll("#xMonths input")]; const on=!cs.every(c=>c.checked); cs.forEach(c=>c.checked=on); };
$("xCancel").onclick=closeSheets;
$("xGo").onclick=async()=>{
  const months=[...document.querySelectorAll("#xMonths input:checked")].map(c=>c.value).sort();
  if(!months.length){ $("xErr").textContent="יש לבחור לפחות חודש אחד."; return; }
  const opt={date:$("xDate").checked,cat:$("xCat").checked,notes:$("xNotes").checked};
  const btn=$("xGo"); btn.disabled=true; $("xErr").textContent="";
  try{
    await loadExcelJS();
    const wb=new ExcelJS.Workbook(); wb.creator="חצי חצי";
    months.forEach(ym=>buildMonthSheet(wb,ym,opt));
    if($("xFlat").checked) buildAllSheet(wb,months);
    const idx=Math.max(0,months.indexOf(S.month));
    wb.views=[{activeTab:idx,firstSheet:0,visibility:"visible"}];
    const buf=await wb.xlsx.writeBuffer();
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const [y,m]=months[months.length-1].split("-").map(Number);
    a.download= months.length===1 ? "הוצאות הילדים - "+MONTHS[m-1]+" "+y+".xlsx" : "הוצאות הילדים.xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    closeSheets();
  }catch(e){ $("xErr").textContent=navigator.onLine?"יצירת הקובץ נכשלה.":"צריך חיבור לאינטרנט ליצירת הקובץ."; }
  btn.disabled=false;
};

/* ---------- Excel import ---------- */
const clean = v => String(v==null?"":v).trim();
function findMonth(text){
  for(let i=0;i<12;i++) if(text.includes(MONTHS[i])){ const y=text.match(/20\d\d/); if(y) return y[0]+"-"+pad(i+1); }
  return null;
}
function cellDate(v){
  if(v==null||v==="") return null;
  if(v instanceof Date){ const d=new Date(v.getTime()+12*3600e3); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
  if(typeof v==="number"){ const p=XLSX.SSF.parse_date_code(v); return p? p.y+"-"+pad(p.m)+"-"+pad(p.d) : null; }
  const s=clean(v); let m;
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1]+"-"+pad(m[2])+"-"+pad(m[3]);
  if((m=s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/))){ const y=m[3].length===2?"20"+m[3]:m[3]; return y+"-"+pad(m[2])+"-"+pad(m[1]); }
  return null;
}
const toNum = v => typeof v==="number" ? v : parseFloat(clean(v).replace(/[₪,\s]/g,""));
function parseWorkbook(wb){
  const out=[];
  const TL={"הוצאה":"expense","הכנסה":"income","החזר":"income","העברה":"transfer"};
  for(const name of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:""});
    let month=findMonth(name);
    for(let r=0;r<Math.min(rows.length,4)&&!month;r++) for(const c of rows[r]){ month=findMonth(clean(c)); if(month) break; }

    // flat list (like "כל הרישומים")
    const fh=rows.findIndex(r=>{ const c=r.map(clean); return c.includes("סכום") && c.includes("מי"); });
    if(fh>=0){
      const h=rows[fh].map(clean), I=k=>h.indexOf(k);
      for(const row of rows.slice(fh+1)){
        const amt=toNum(row[I("סכום")]); if(!amt) continue;
        const who=clean(row[I("מי")]); const payer= who===S.nameA?"a": who===S.nameB?"b": null; if(!payer) continue;
        const type=TL[clean(row[I("סוג")])]||"expense";
        out.push({type,payer,amount:Math.round(Math.abs(amt)*100)/100,
          description: type==="transfer"?"":clean(row[I("תיאור")]), category: type==="transfer"?"":clean(row[I("קטגוריה")]),
          date:I("תאריך")>=0?cellDate(row[I("תאריך")]):null, month, sheet:name});
      }
      continue;
    }

    // monthly summary (like the original sheet / this app's export)
    let sec=null;
    for(const row of rows){
      const c=row.map(clean);
      const ib=c.indexOf(S.nameB), ia=c.indexOf(S.nameA);
      if(ib>=0 && ia>=0){
        const j=c.join(" ");
        const type=/העבר/.test(j)?"transfer":/החזר|הכנס|קצב/.test(j)?"income":"expense";
        const id=c.indexOf("תאריך"), ic=c.indexOf("קטגוריה");
        const idesc=c.findIndex((v,i)=>v && ![ib,ia,id,ic].includes(i));
        sec={type,ib,ia,id,ic,idesc:idesc>=0?idesc:0}; continue;
      }
      if(!sec) continue;
      const desc=c[sec.idesc];
      if(/^(סיכום|יתרה)/.test(desc)){ sec=null; continue; }
      if(!desc || /^(סה.?.?כ|חישוב)/.test(desc)) continue;
      for(const [p,i] of [["b",sec.ib],["a",sec.ia]]){
        const n=toNum(row[i]); if(!n||isNaN(n)) continue;
        out.push({type:sec.type,payer:p,amount:Math.round(Math.abs(n)*100)/100,
          description: sec.type==="transfer"?"":desc, category: sec.ic>=0?c[sec.ic]:"",
          date: sec.id>=0?cellDate(row[sec.id]):null, month, sheet:name});
      }
    }
  }
  return out;
}

let IMP=[];
const dupKey=e=>[e.type,e.payer,(+e.amount).toFixed(2),e.date,e.description||""].join("|");
function prepareImport(rows){
  const known=new Map(); S.entries.forEach(e=>{ if(e.description&&e.category&&!known.has(e.description)) known.set(e.description,e.category); });
  const existing=new Set(S.entries.map(dupKey));
  rows.forEach(r=>{
    if(!r.category && r.description && known.has(r.description)) r.category=known.get(r.description);
    r.group = r.date ? r.date.slice(0,7) : (r.month || "?");
    if(!r.date && r.month) r.date=r.month+"-01";
  });
  // the same entries may appear on several sheets (monthly + "all entries"): keep each once
  const added=new Map(), result=[];
  for(const sh of [...new Set(rows.map(r=>r.sheet))]){
    const local=new Map();
    for(const r of rows.filter(x=>x.sheet===sh)){
      const k=dupKey(r), j=(local.get(k)||0)+1; local.set(k,j);
      if(!r.date || j>(added.get(k)||0)) result.push(r);
    }
    for(const [k,j] of local) added.set(k,Math.max(added.get(k)||0,j));
  }
  result.forEach(r=>{ r.dup = !!r.date && existing.has(dupKey(r)); r.on = !r.dup; });
  return result;
}
function renderImport(){
  const body=$("iBody"); body.innerHTML="";
  const groups=[...new Set(IMP.map(r=>r.group))].sort();
  for(const g of groups){
    const rows=IMP.filter(r=>r.group===g);
    const h=document.createElement("div"); h.className="igh";
    if(g==="?"){
      h.append("חודש לא זוהה, בחר חודש: ");
      const inp=document.createElement("input"); inp.type="month"; inp.value=S.month;
      inp.onchange=()=>{ rows.forEach(r=>{ r.date=inp.value+"-01"; }); };
      rows.forEach(r=>{ if(!r.date) r.date=S.month+"-01"; });
      h.appendChild(inp);
    } else { const [y,m]=g.split("-").map(Number); h.textContent=MONTHS[m-1]+" "+y; }
    body.appendChild(h);
    for(const r of rows){
      const l=document.createElement("label"); l.className="irow"+(r.dup?" dup":"");
      const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=r.on; cb.onchange=()=>{ r.on=cb.checked; updImp(); };
      const pb=document.createElement("span"); pb.className="pb sm "+r.payer; pb.textContent=nm(r.payer).slice(0,1);
      const d=document.createElement("span"); d.className="id";
      d.textContent=(r.type==="transfer"?transferText(r):r.description||"")+(r.type==="income"?" (הכנסה)":"")+(r.dup?" · קיים כבר":"");
      const a=document.createElement("span"); a.className="ltr num"; a.textContent=money(r.amount);
      l.append(cb,pb,d,a); body.appendChild(l);
    }
  }
  updImp();
}
function updImp(){
  const n=IMP.filter(r=>r.on).length, d=IMP.filter(r=>r.dup).length;
  $("iSummary").textContent="נמצאו "+IMP.length+" רישומים"+(d?", מתוכם "+d+" כבר קיימים באפליקציה (לא מסומנים)":"")+".";
  $("iGo").textContent="ייבוא "+n+" רישומים"; $("iGo").disabled=!n;
}
$("btnImport").onclick=()=>{ $("impFile").value=""; $("impFile").click(); };
$("impFile").onchange=async()=>{
  const f=$("impFile").files[0]; if(!f) return;
  toast("קורא את הקובץ…");
  try{
    await loadSheetJS();
    const wb=XLSX.read(await f.arrayBuffer(),{type:"array",cellDates:true});
    const rows=parseWorkbook(wb);
    if(!rows.length){ toast("לא נמצאו רישומים. ודא שבכותרות מופיעים השמות "+S.nameB+" ו"+S.nameA+"."); return; }
    IMP=prepareImport(rows); $("iErr").textContent=""; renderImport();
    $("iScrim").classList.add("open");
  }catch(e){ toast(navigator.onLine?"לא הצלחתי לקרוא את הקובץ":"צריך חיבור לאינטרנט לייבוא"); }
};
$("iCancel").onclick=closeSheets;
$("iGo").onclick=async()=>{
  const sel=IMP.filter(r=>r.on); if(!sel.length) return;
  const btn=$("iGo"); btn.disabled=true;
  const t0=Date.now();
  const rows=sel.map((r,i)=>({user_id:S.user.id,type:r.type,payer:r.payer,amount:r.amount,date:r.date,description:r.description||"",category:r.category||"",created_at:new Date(t0+i*1000).toISOString()}));
  const {error}=await sb.from(T_ENT).insert(rows);
  if(error){ $("iErr").textContent="הייבוא נכשל. בדוק את החיבור ונסה שוב."; btn.disabled=false; return; }
  const newCats=[...new Set(sel.map(r=>r.category).filter(c=>c&&!S.cats.includes(c)))];
  if(newCats.length){ S.cats=S.cats.concat(newCats); try{ await saveSettings(); }catch(e){} }
  S.month=rows[rows.length-1].date.slice(0,7);
  closeSheets(); toast(rows.length+" רישומים יובאו"); loadAll();
};

document.querySelectorAll(".scrim").forEach(s=>s.addEventListener("click",ev=>{ if(ev.target===s && s.id!=="pwScrim") closeSheets(); }));
document.addEventListener("keydown",ev=>{ if(ev.key==="Escape") closeSheets(); });
let tt; function toast(msg){ const t=$("toast"); t.textContent=msg; t.style.display="block"; clearTimeout(tt); tt=setTimeout(()=>t.style.display="none",1900); }

/* ---------- boot ---------- */
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
if(!sb){
  show("auth");
  authMsg(configured ? "לא ניתן לטעון את ספריית Supabase. בדוק את החיבור לאינטרנט." : "חסרים פרטי Supabase בקובץ config.js.");
  ["aLogin","aSignup","aForgot"].forEach(id=>$(id).disabled=true);
  return;
}
sb.auth.onAuthStateChange((ev,session)=>{
  if(ev==="PASSWORD_RECOVERY"){ $("pwErr").textContent=""; $("pwScrim").classList.add("open"); }
  setUser(session ? session.user : null);
});
sb.auth.getSession().then(({data})=>setUser(data.session?data.session.user:null)).catch(()=>show("auth"));
})();

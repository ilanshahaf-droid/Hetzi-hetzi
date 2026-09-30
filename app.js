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

const S = { user:null, entries:[], cats:DEFAULT_CATS.slice(), nameA:"אילן", nameB:"קרן", month:today().slice(0,7), online:navigator.onLine };

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
  return bal>0 ? S.nameB+" חייבת ל"+S.nameA : S.nameA+" חייב ל"+S.nameB;
}
function transferText(e){ return e.payer==="a" ? S.nameA+" העביר ל"+S.nameB : S.nameB+" העבירה ל"+S.nameA; }

/* ---------- render ---------- */
function render(){
  $("whoA").textContent=S.nameA; $("whoB").textContent=S.nameB;
  $("thA").textContent=S.nameA; $("thB").textContent=S.nameB;

  const bal = S.entries.reduce((s,e)=>s+effect(e),0);
  const hero=$("hero"); hero.classList.remove("plus","minus");
  const ow = owesText(bal);
  if(!S.entries.length){ $("heroWho").textContent="עוד אין רישומים"; $("heroAmt").textContent=money(0); $("heroSub").textContent="כל הוצאה או הכנסה שתירשם תתחלק חצי חצי."; $("btnSettle").hidden=true; }
  else if(!ow){ $("heroWho").textContent="אתם מאוזנים"; $("heroAmt").textContent=money(0); $("heroSub").textContent="אף אחד לא חייב כלום כרגע."; $("btnSettle").hidden=true; }
  else { hero.classList.add(bal>0?"plus":"minus"); $("heroWho").textContent=ow; $("heroAmt").textContent=money(bal); $("heroSub").textContent="יתרה מצטברת על כל הרישומים."; $("btnSettle").hidden=false; }

  const [y,m]=S.month.split("-").map(Number);
  $("monthTitle").textContent=MONTHS[m-1]+" "+y;
  const items=S.entries.filter(e=>(e.date||"").slice(0,7)===S.month)
    .sort((a,b)=>(b.date||"").localeCompare(a.date||"")||String(a.created_at).localeCompare(String(b.created_at)));
  const sum=(t,p)=>items.filter(e=>e.type===t&&e.payer===p).reduce((s,e)=>s+(+e.amount),0);
  $("expA").textContent=money(sum("expense","a")); $("expB").textContent=money(sum("expense","b"));
  $("incA").textContent=money(sum("income","a"));  $("incB").textContent=money(sum("income","b"));
  const mBal = items.filter(e=>e.type!=="transfer").reduce((s,e)=>s+effect(e),0);
  const mOw = owesText(mBal);
  $("monthRes").innerHTML="";
  if(items.some(e=>e.type!=="transfer")){
    if(!mOw) $("monthRes").textContent="סיכום החודש: מאוזן";
    else { $("monthRes").append("סיכום החודש: "+mOw+" "); const s=document.createElement("span"); s.className="ltr num "+(mBal>0?"plus":"minus"); s.textContent=money(mBal); $("monthRes").append(s); }
  }

  const list=$("list"); list.innerHTML="";
  if(!items.length){
    const d=document.createElement("div"); d.className="empty";
    d.textContent="אין רישומים ב"+MONTHS[m-1]+".";
    if(S.month==="2026-09"){
      const b=document.createElement("button"); b.className="settle"; b.textContent="ייבוא ספטמבר מהאקסל";
      b.onclick=()=>importSept(b); d.append(document.createElement("br"), b);
    }
    list.appendChild(d); return;
  }
  let lastDay=null;
  for(const e of items){
    if(e.date!==lastDay){
      lastDay=e.date; const h=document.createElement("div"); h.className="day";
      h.textContent=new Date(e.date+"T12:00").toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"});
      list.appendChild(h);
    }
    const r=document.createElement("button"); r.className="row"+(e.type==="transfer"?" transfer":"");
    let title, meta;
    if(e.type==="transfer"){ title=transferText(e); meta=e.description||"התחשבנות"; }
    else { title=e.description||(e.type==="expense"?"הוצאה":"הכנסה");
      meta=(e.type==="expense"?"שילם/ה: ":"קיבל/ה: ")+nm(e.payer)+(e.category?", "+e.category:""); }
    const ef=effect(e);
    r.innerHTML='<span class="d"></span><span class="a num ltr"></span><span class="m"></span><span class="e num ltr"></span>';
    r.querySelector(".d").textContent=title;
    r.querySelector(".m").textContent=meta;
    r.querySelector(".a").textContent=(e.type==="income"?"+":"")+money(e.amount);
    const eEl=r.querySelector(".e"); eEl.classList.add(ef>=0?"plus":"minus"); eEl.textContent=signed(ef);
    eEl.title = ef>=0 ? "לטובת "+S.nameA : "לטובת "+S.nameB;
    r.addEventListener("click",()=>openEntry(e));
    list.appendChild(r);
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

function monthItems(){ return S.entries.filter(e=>(e.date||"").slice(0,7)===S.month).sort((a,b)=>a.date.localeCompare(b.date)||String(a.created_at).localeCompare(String(b.created_at))); }
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
  const sum=(t,p)=>items.filter(e=>e.type===t&&e.payer===p).reduce((s,e)=>s+(+e.amount),0);
  L.push("הוצאות "+S.nameA+": "+money(sum("expense","a"))+" | "+S.nameB+": "+money(sum("expense","b")));
  L.push("הכנסות "+S.nameA+": "+money(sum("income","a"))+" | "+S.nameB+": "+money(sum("income","b")));
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

$("btnCsv").onclick=()=>{
  const TL={expense:"הוצאה",income:"הכנסה",transfer:"העברה"};
  const rows=[["תאריך","סוג","תיאור","קטגוריה","מי","סכום","השפעה על היתרה (+ לטובת "+S.nameA+")"]];
  S.entries.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(e=>rows.push([e.date,TL[e.type],e.type==="transfer"?transferText(e):(e.description||""),e.category||"",nm(e.payer),e.amount,Math.round(effect(e)*100)/100]));
  const csv="\uFEFF"+rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(",")).join("\r\n");
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  a.download="hotsaot-yeladim.csv"; document.body.appendChild(a); a.click(); a.remove();
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

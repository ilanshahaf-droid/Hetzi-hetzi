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

const DEFAULT_KIDS=["עלמא","יובל","איילה"];
const S = { user:null, entries:[], rec:[], recOk:false, kids:DEFAULT_KIDS.slice(), kidsOk:false, kid:"all", bkOk:false, backups:[], prefs:{freq:"weekly",remind:"monthly",last_file:null}, bannerHidden:false, cats:DEFAULT_CATS.slice(), nameA:"אילן", nameB:"קרן", month:today().slice(0,7), who:"all", kind:"all", order:(()=>{ try{ return localStorage.getItem("hetzi-order")||"asc"; }catch(e){ return "asc"; } })(), online:navigator.onLine };

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
$("aGoogle").onclick = async()=>{
  authMsg(); $("aGoogle").disabled=true;
  const {error} = await sb.auth.signInWithOAuth({provider:"google",
    options:{redirectTo:redirectTo(), queryParams:{prompt:"select_account"}}});
  if(error){
    $("aGoogle").disabled=false;
    authMsg(/provider is not enabled|Unsupported provider/i.test(error.message||"")
      ? "התחברות עם Google עדיין לא הופעלה בפרויקט Supabase."
      : authErr(error));
  }
};
$("aForgot").onclick = async()=>{
  const email=$("aEmail").value.trim();
  if(!email) return authMsg("יש להזין את האימייל ואז ללחוץ שוב.");
  const {error} = await sb.auth.resetPasswordForEmail(email,{redirectTo:redirectTo()});
  if(error) authMsg(authErr(error)); else authMsg("","נשלח אליך מייל עם קישור לאיפוס הסיסמה.");
};
function openPassword(fromSettings){
  $("pwNew").value=""; $("pwNew2").value=""; $("pwShow").checked=false; pwType();
  $("pwErr").textContent=""; $("pwCancel").hidden=!fromSettings;
  closeSheets(); $("pwScrim").classList.add("open");
  setTimeout(()=>$("pwNew").focus(),60);
}
function pwType(){ const t=$("pwShow").checked?"text":"password"; $("pwNew").type=t; $("pwNew2").type=t; }
$("pwShow").onchange=pwType;
$("pwCancel").onclick=closeSheets;
$("sPassword").onclick=()=>openPassword(true);
$("pwSave").onclick = async()=>{
  const p=$("pwNew").value;
  if(p.length<6){ $("pwErr").textContent="הסיסמה צריכה להכיל לפחות 6 תווים."; return; }
  if(p!==$("pwNew2").value){ $("pwErr").textContent="שתי הסיסמאות לא זהות."; return; }
  $("pwSave").disabled=true;
  const {error}=await sb.auth.updateUser({password:p});
  $("pwSave").disabled=false;
  if(error){
    const m=error.message||"";
    $("pwErr").textContent=/different from the old|same_password/i.test(m)?"זו כבר הסיסמה הנוכחית. בחר סיסמה אחרת."
      :/reauthenticat/i.test(m)?"מטעמי אבטחה צריך לאפס את הסיסמה דרך המייל: התנתק ולחץ \"שכחתי סיסמה\"."
      :authErr(error);
    return;
  }
  closeSheets(); toast("הסיסמה עודכנה");
};
$("btnLogout").onclick = async()=>{ closeSheets(); await sb.auth.signOut(); };

function setUser(u){
  const prev = S.user && S.user.id;
  S.user = u;
  if(!u){ S.entries=[]; S.backups=[]; S.bannerHidden=false; show("auth"); return; }
  if(prev===u.id) return;
  $("acctEmail").textContent = u.email || "";
  loadCache(); show("app"); render(); loadAll();
}

/* ---------- cache (for offline viewing) ---------- */
const cacheKey = () => "hetzi-cache-" + S.user.id;
function saveCache(){ try{ localStorage.setItem(cacheKey(), JSON.stringify({entries:S.entries,cats:S.cats,nameA:S.nameA,nameB:S.nameB,kids:S.kids})); }catch(e){} }
function loadCache(){ try{ const c=JSON.parse(localStorage.getItem(cacheKey())||"null"); if(c){ S.entries=c.entries||[]; S.cats=c.cats||S.cats; S.nameA=c.nameA||S.nameA; S.nameB=c.nameB||S.nameB; if(Array.isArray(c.kids)) S.kids=c.kids; } }catch(e){} }

/* ---------- data ---------- */
async function loadAll(){
  const [st, en, kp] = await Promise.all([
    sb.from(T_SET).select("*").eq("user_id",S.user.id).maybeSingle(),
    sb.from(T_ENT).select("*").order("date",{ascending:false}).order("created_at",{ascending:false}),
    sb.from(T_ENT).select("kids").limit(1)
  ]);
  S.kidsOk = !kp.error;
  if(en.error){ setOnline(false); return; }
  setOnline(true);
  S.entries = en.data;
  if(st.data){
    S.cats = Array.isArray(st.data.categories) && st.data.categories.length ? st.data.categories : DEFAULT_CATS.slice();
    S.nameA = st.data.name_a || "אילן"; S.nameB = st.data.name_b || "קרן";
    if(st.data.prefs) S.prefs = Object.assign({freq:"weekly",remind:"monthly",last_file:null}, st.data.prefs);
    if(S.prefs && Array.isArray(S.prefs.kids)) S.kids=S.prefs.kids.slice();
  } else {
    await saveSettings();
  }
  saveCache(); render();
  if(!S.recBusy){
    S.recBusy=true;
    try{ await loadRecurring(); const n=await runRecurring();
      if(n){ toast(n===1?"נוסף רישום קבוע":"נוספו "+n+" רישומים קבועים");
        const r=await sb.from(T_ENT).select("*"); if(!r.error){ S.entries=r.data; saveCache(); } }
      render();
    }catch(e){}
    S.recBusy=false;
  }
  if(!S.bkBusy){
    S.bkBusy=true;
    try{ await loadBackupState(); await autoBackup(); }catch(e){}
    S.bkBusy=false;
  }
  renderBanner();
  budgetFlush();
  budgetPushRecs();
}
async function saveSettings(){
  const row={user_id:S.user.id, categories:S.cats, name_a:S.nameA, name_b:S.nameB, updated_at:new Date().toISOString()};
  S.prefs.kids=S.kids.slice();
  if(S.bkOk) row.prefs=S.prefs;
  const {error} = await sb.from(T_SET).upsert(row);
  if(error) throw error;
  saveCache();
}
async function saveEntry(id,data){
  if(id){
    const {data:row,error} = await sb.from(T_ENT).update(data).eq("id",id).select().single();
    if(error) throw error;
    S.entries = S.entries.map(e=>e.id===id?row:e);
    syncEntries([row],true);
  } else {
    const {data:row,error} = await sb.from(T_ENT).insert(Object.assign({user_id:S.user.id},data)).select().single();
    if(error) throw error;
    S.entries.push(row);
    syncEntries([row]);
  }
  saveCache(); render();
}
async function deleteEntry(id){
  const {error} = await sb.from(T_ENT).delete().eq("id",id);
  if(error) throw error;
  S.entries = S.entries.filter(e=>e.id!==id); saveCache(); render();
  budgetQueue([budgetItem({id},"delete")]);
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
  const rows = SEPT_2026.map((r,i)=>withKids({user_id:S.user.id,type:r[0],payer:r[1],amount:r[2],description:r[3],category:r[4],date:"2026-09-01",created_at:new Date(t0+i*1000).toISOString()},detectKids(r[3])));
  const {data:ins,error} = await sb.from(T_ENT).insert(rows).select();
  if(error){ btn.disabled=false; toast("הייבוא נכשל. נסה שוב."); return; }
  syncEntries(ins);
  const missing = [...new Set(SEPT_2026.map(r=>r[4]))].filter(c=>!S.cats.includes(c));
  if(missing.length){ S.cats=S.cats.concat(missing); try{ await saveSettings(); }catch(e){} }
  S.month="2026-09"; toast("ספטמבר יובא"); loadAll();
}

/* ---------- children ---------- */
const kidsOf=e=>Array.isArray(e&&e.kids)?e.kids:[];
// names written in the description pick the child; "ילדים" means all of them
function detectKids(text){
  text=String(text||""); if(!S.kids.length) return [];
  if(/ילדים/.test(text)) return S.kids.slice();
  return S.kids.filter(k=>k&&text.includes(k));
}
const KID_HUES=[330,200,38,145,270,12,175];
const kidHue=k=>{ const i=S.kids.indexOf(k); return KID_HUES[(i<0?S.kids.length:i)%KID_HUES.length]; };
const kidsText=arr=>(arr.length>1&&S.kids.length>1&&S.kids.every(k=>arr.includes(k)))?"כל הילדים":arr.join(", ");
const withKids=(o,kids)=>{ if(S.kidsOk) o.kids=(kids||[]).slice(); return o; };
const sameKids=(x,y)=>JSON.stringify([...(x||[])].sort())===JSON.stringify([...(y||[])].sort());
function parseKids(v){
  const s=String(v==null?"":v).trim(); if(!s) return [];
  if(/כל הילדים|ילדים/.test(s)) return S.kids.slice();
  return s.split(/[,،;\/+]|\s+ו(?=\S)/).map(x=>x.trim()).filter(Boolean);
}
// chip picker shared by the entry form and the recurring editor
function renderKidPicker(boxId,getSel,setSel,onChange){
  const box=$(boxId); if(!box) return; box.innerHTML="";
  const sel=getSel();
  const extra=sel.filter(k=>!S.kids.includes(k));
  S.kids.concat(extra).forEach(k=>{
    const b=document.createElement("button"); b.type="button"; b.className="kidc"; b.style.setProperty("--h",kidHue(k));
    b.textContent=k; b.setAttribute("aria-pressed",sel.includes(k)?"true":"false");
    b.onclick=()=>{ const s=getSel(); setSel(s.includes(k)?s.filter(x=>x!==k):s.concat([k])); if(onChange) onChange(); renderKidPicker(boxId,getSel,setSel,onChange); };
    box.appendChild(b);
  });
  if(S.kids.length>1){
    const all=document.createElement("button"); all.type="button"; all.className="kidc all";
    const isAll=S.kids.every(k=>sel.includes(k));
    all.textContent=isAll?"נקה":"כולם"; all.onclick=()=>{ setSel(isAll?[]:S.kids.slice()); if(onChange) onChange(); renderKidPicker(boxId,getSel,setSel,onChange); };
    box.appendChild(all);
  }
}
function kidChip(k){ const s=document.createElement("span"); s.className="kid"; s.style.setProperty("--h",kidHue(k)); s.textContent=k; return s; }

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
  if(!S.entries.length){ $("heroWho").textContent="עוד אין רישומים"; $("heroAmt").textContent=money(0); $("heroSub").textContent="כל הוצאה או הכנסה שתירשם תתחלק חצי חצי."; }
  else if(!ow){ $("heroWho").textContent="אתם מאוזנים"; $("heroAmt").textContent=money(0); $("heroSub").textContent="אף אחד לא צריך להעביר כלום כרגע."; }
  else { hero.classList.add(bal>0?"plus":"minus"); $("heroWho").textContent=ow; $("heroAmt").textContent=money(bal); $("heroSub").textContent="יתרה מצטברת על כל הרישומים."; }

  // month
  const [y,m]=S.month.split("-").map(Number);
  $("monthTitle").textContent=MONTHS[m-1]+" "+y;
  const items=monthEntries();
  for(const p of ["a","b"]){
    $("pExp"+p).textContent=money(sumBy(items,"expense",p));
    $("pInc"+p).textContent=money(sumBy(items,"income",p));
    $("pc"+p).classList.toggle("dim", S.who!=="all" && S.who!==p);
  }
  setSeg("whoFilter",S.who); setSeg("kindFilter",S.kind); setSeg("orderFilter",S.order);
  renderKidUI(items);
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
  const kidOk=e=> S.kid==="all" || (S.kid==="none" ? (e.type!=="transfer"&&!kidsOf(e).length) : kidsOf(e).includes(S.kid));
  const shown=items.filter(e=>(S.who==="all"||e.payer===S.who) && kidOk(e))
    .sort((a,b)=>((a.date||"").localeCompare(b.date||"")||String(a.created_at).localeCompare(String(b.created_at)))*(S.order==="desc"?-1:1));
  const SECS=[["expense","הוצאות","exp"],["income","הכנסות והחזרים","inc"],["transfer","העברות ביניכם","tr"]];
  for(const [type,title,cls] of SECS){
    if(S.kind!=="all" && S.kind!==type) continue;
    const rows=shown.filter(e=>e.type===type);
    if(!rows.length && type==="transfer") continue;
    if(!rows.length && S.kid!=="all" && type!=="expense") continue;
    const sec=document.createElement("section"); sec.className="sec "+cls;
    const h=document.createElement("header");
    const h3=document.createElement("h3"); h3.textContent=title;
    const tot=document.createElement("span"); tot.className="stot";
    const c=document.createElement("small"); c.textContent=rows.length+" רישומים";
    const v=document.createElement("b"); v.className="ltr num"; v.textContent=money(rows.reduce((s,e)=>s+(+e.amount),0));
    tot.append(c,v); h.append(h3,tot); sec.appendChild(h);
    if(!rows.length){ const p=document.createElement("p"); p.className="none"; p.textContent= S.kid!=="all"?"אין רישומים "+(S.kid==="none"?"בלי ילד":"של "+S.kid)+" החודש.":(S.who==="all"?"אין רישומים החודש.":"אין רישומים של "+nm(S.who)+" החודש."); sec.appendChild(p); }
    for(const e of rows){
      const r=document.createElement("button"); r.className="item";
      r.innerHTML='<span class="pb"></span><span class="main"><span class="d"></span><span class="meta"></span></span><span class="amt num ltr"></span>';
      const pb=r.querySelector(".pb"); pb.classList.add(e.payer); pb.textContent=nm(e.payer).slice(0,1); pb.title=nm(e.payer);
      r.querySelector(".d").textContent = type==="transfer" ? transferText(e) : (e.description||title);
      const meta=r.querySelector(".meta");
      if(e.recurring_id){ const rc=document.createElement("span"); rc.className="rec"; rc.textContent="↻ קבוע"; meta.appendChild(rc); }
      kidsOf(e).forEach(k=>meta.appendChild(kidChip(k)));
      if(e.category){ const t=document.createElement("span"); t.className="tag"; t.style.setProperty("--h",catColor(e.category)); t.textContent=e.category; meta.appendChild(t); }
      const dt=document.createElement("span"); dt.className="dt"; dt.textContent=fmtDay(e.date)+"  "+(type==="expense"?"שילם/ה ":type==="income"?"קיבל/ה ":"")+(type==="transfer"?"":nm(e.payer)); meta.appendChild(dt);
      r.querySelector(".amt").textContent=money(e.amount);
      r.addEventListener("click",()=>openEntry(e));
      sec.appendChild(r);
    }
    box.appendChild(sec);
  }
}

// per-child totals for the month (an expense shared by several children is split evenly) + child filter
function renderKidUI(items){
  const on=S.kidsOk && S.kids.length>0;
  $("kidBar").hidden=!on; $("kidSum").hidden=!on;
  if(!on) return;
  const exp=items.filter(e=>e.type==="expense");
  const per=Object.fromEntries(S.kids.map(k=>[k,0])); let none=0;
  exp.forEach(e=>{ const ks=kidsOf(e); if(!ks.length){ none+=+e.amount; return; } ks.forEach(k=>{ per[k]=(per[k]||0)+(+e.amount)/ks.length; }); });
  const sum=$("kidSum"); sum.innerHTML="";
  if(exp.length){
    const t=document.createElement("span"); t.className="ksl"; t.textContent="הוצאות לפי ילד"; sum.appendChild(t);
    const wrap=document.createElement("div"); wrap.className="ksw";
    Object.keys(per).forEach(k=>{
      const b=document.createElement("button"); b.type="button"; b.className="ksc"+(S.kid===k?" on":""); b.style.setProperty("--h",kidHue(k));
      b.innerHTML='<span></span><b class="ltr num"></b>'; b.firstChild.textContent=k; b.lastChild.textContent=money(per[k]);
      b.onclick=()=>{ S.kid=S.kid===k?"all":k; render(); }; wrap.appendChild(b);
    });
    if(none>0.004){
      const b=document.createElement("button"); b.type="button"; b.className="ksc none"+(S.kid==="none"?" on":"");
      b.innerHTML='<span>לא סווג</span><b class="ltr num"></b>'; b.lastChild.textContent=money(none);
      b.onclick=()=>{ S.kid=S.kid==="none"?"all":"none"; render(); }; wrap.appendChild(b);
    }
    sum.appendChild(wrap);
  } else sum.hidden=true;
  const f=$("kidFilter"); f.innerHTML="";
  const opts=[["all","הכול"]].concat(S.kids.map(k=>[k,k]));
  if(items.some(e=>e.type!=="transfer"&&!kidsOf(e).length)||S.kid==="none") opts.push(["none","ללא"]);
  if(S.kid!=="all" && !opts.some(o=>o[0]===S.kid)) S.kid="all";
  opts.forEach(([v,l])=>{ const b=document.createElement("button"); b.dataset.v=v; b.textContent=l; b.setAttribute("aria-pressed",S.kid===v?"true":"false");
    if(v!=="all"&&v!=="none") b.style.setProperty("--h",kidHue(v)); f.appendChild(b); });
}

/* ---------- recurring (קבועות) ---------- */
const T_REC = "hetzi_recurring";
const INT_LABEL = {1:"כל חודש",2:"כל חודשיים",3:"כל 3 חודשים",6:"כל חצי שנה",12:"כל שנה"};
const addMonths=(ym,n)=>{ let [y,m]=ym.split("-").map(Number); m+=n; while(m>12){m-=12;y++;} return y+"-"+pad(m); };
const daysIn=ym=>{ const [y,m]=ym.split("-").map(Number); return new Date(y,m,0).getDate(); };
const recDate=(t,ym)=>ym+"-"+pad(Math.min(t.day,daysIn(ym)));
function nextOccurrence(t){
  let ym = t.last_generated ? addMonths(t.last_generated,t.interval_months) : t.start_month;
  if(t.end_month && ym>t.end_month) return null;
  return recDate(t,ym);
}
async function loadRecurring(){
  const {data,error}=await sb.from(T_REC).select("*").order("created_at");
  S.recOk=!error; S.rec=error?[]:data;
}
async function runRecurring(){
  if(!S.recOk) return 0;
  const td=today(), cur=td.slice(0,7); let added=0;
  for(const t of S.rec){
    if(!t.active) continue;
    const rows=[]; let ym=t.last_generated?addMonths(t.last_generated,t.interval_months):t.start_month, last=t.last_generated;
    while(ym<=cur && (!t.end_month||ym<=t.end_month)){
      const d=recDate(t,ym); if(d>td) break;
      rows.push(withKids({user_id:S.user.id,type:t.type,payer:t.payer,amount:t.amount,description:t.description,category:t.category,date:d,recurring_id:t.id},kidsOf(t)));
      last=ym; ym=addMonths(ym,t.interval_months);
    }
    if(!rows.length) continue;
    // claim the months first, so two devices never create the same entries
    let q=sb.from(T_REC).update({last_generated:last}).eq("id",t.id);
    q = t.last_generated ? q.eq("last_generated",t.last_generated) : q.is("last_generated",null);
    const {data:claimed,error}=await q.select();
    if(error||!claimed||!claimed.length) continue;
    t.last_generated=last;
    const ins=await sb.from(T_ENT).insert(rows).select();
    if(!ins.error){ added+=rows.length; syncEntries(ins.data); }
  }
  return added;
}
function recLabel(t){ return INT_LABEL[t.interval_months]||("כל "+t.interval_months+" חודשים"); }

// management sheet
function openRecList(){
  const box=$("rList"); box.innerHTML="";
  if(!S.recOk){ box.innerHTML='<p class="hint">כדי להשתמש בקבועות צריך להריץ פעם אחת את עדכון ה-SQL (הקובץ update-recurring.sql).</p>'; }
  else if(!S.rec.length){ box.innerHTML='<p class="hint">אין עדיין הוצאות או הכנסות קבועות. כדי להוסיף, סמן "קבועה" כשאתה רושם הוצאה או הכנסה.</p>'; }
  for(const t of S.rec){
    const c=document.createElement("button"); c.className="rcard"+(t.active?"":" paused");
    const nx=t.active?nextOccurrence(t):null;
    c.innerHTML='<span class="pb"></span><span class="main"><span class="d"></span><span class="meta"></span></span><span class="amt num ltr"></span>';
    const pb=c.querySelector(".pb"); pb.classList.add(t.payer); pb.textContent=nm(t.payer).slice(0,1);
    c.querySelector(".d").textContent=t.description||(t.type==="expense"?"הוצאה":"הכנסה");
    const meta=c.querySelector(".meta");
    const k=document.createElement("span"); k.className="kind "+(t.type==="expense"?"exp":"inc"); k.textContent=t.type==="expense"?"הוצאה":"הכנסה"; meta.appendChild(k);
    meta.append(recLabel(t)+" ב־"+t.day+" לחודש"+(t.end_month?", עד "+t.end_month.slice(5)+"/"+t.end_month.slice(0,4):"")
      +(t.active? (nx?", הבא: "+fmtDay(nx):", הסתיימה") : ", מושהית"));
    c.querySelector(".amt").textContent=money(t.amount);
    c.onclick=()=>openRecEdit(t);
    box.appendChild(c);
  }
  closeSheets(); $("rScrim").classList.add("open");
}
let RT=null;
function openRecEdit(t){
  RT=Object.assign({},t);
  $("reTitle").textContent=(t.type==="expense"?"הוצאה":"הכנסה")+" קבועה";
  $("reAmt").value=t.amount; $("reDesc").value=t.description||""; $("reDay").value=t.day;
  $("reInt").value=String(t.interval_months); $("reEnd").value=t.end_month||"";
  const cs=$("reCat"); cs.innerHTML='<option value="">ללא</option>';
  const list=S.cats.slice(); if(t.category&&!list.includes(t.category)) list.push(t.category);
  list.forEach(c=>{ const o=document.createElement("option"); o.value=c; o.textContent=c; if(c===t.category) o.selected=true; cs.appendChild(o); });
  $("rePA").textContent=S.nameA; $("rePB").textContent=S.nameB; setSeg("rePayer",RT.payer);
  RT.kids=kidsOf(t).slice(); $("reKidBlock").hidden=!S.kidsOk||!S.kids.length;
  renderKidPicker("reKids",()=>RT.kids,v=>{ RT.kids=v; });
  $("rePause").textContent=t.active?"השהיה":"חידוש";
  $("reErr").textContent="";
  closeSheets(); $("reScrim").classList.add("open");
}
$("rePayer").addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b) return; RT.payer=b.dataset.v; setSeg("rePayer",RT.payer); });
$("reSave").onclick=async()=>{
  const amount=parseAmt($("reAmt").value), day=parseInt($("reDay").value,10);
  if(!(amount>0)){ $("reErr").textContent="יש להזין סכום גדול מאפס."; return; }
  if(!(day>=1&&day<=31)){ $("reErr").textContent="יום בחודש צריך להיות בין 1 ל־31."; return; }
  const end=$("reEnd").value||null;
  const upd=withKids({amount:Math.round(amount*100)/100,payer:RT.payer,description:$("reDesc").value.trim(),category:$("reCat").value,day,interval_months:+$("reInt").value,end_month:end},RT.kids);
  const {error}=await sb.from(T_REC).update(upd).eq("id",RT.id);
  if(error){ $("reErr").textContent="השמירה נכשלה. נסה שוב."; return; }
  Object.assign(S.rec.find(x=>x.id===RT.id),upd); budgetPushRecs(true);
  toast("נשמר. השינוי חל מהרישום הבא"); openRecList();
};
$("rePause").onclick=async()=>{
  const t=S.rec.find(x=>x.id===RT.id); const active=!t.active; const upd={active};
  // resuming: skip the months that passed while paused
  if(active){ const cur=today().slice(0,7); let ym=nextOccurrence(t); if(ym){ ym=ym.slice(0,7); let last=t.last_generated; while(ym<cur){ last=ym; ym=addMonths(ym,t.interval_months); } upd.last_generated=last; } }
  const {error}=await sb.from(T_REC).update(upd).eq("id",t.id);
  if(error){ $("reErr").textContent="הפעולה נכשלה. נסה שוב."; return; }
  Object.assign(t,upd); budgetPushRecs(true); toast(active?"חודשה":"הושהתה");
  if(active){ const n=await runRecurring(); if(n) await loadAll(); }
  openRecList();
};
$("reDel").onclick=async()=>{
  if(!confirm("למחוק את הקבועה? רישומים שכבר נוצרו יישארו, ולא ייווצרו חדשים.")) return;
  const {error}=await sb.from(T_REC).delete().eq("id",RT.id);
  if(error){ $("reErr").textContent="המחיקה נכשלה. נסה שוב."; return; }
  S.rec=S.rec.filter(x=>x.id!==RT.id); budgetPushRecs(true); toast("הקבועה נמחקה"); openRecList(); render();
};
$("reBack").onclick=openRecList;
$("rClose").onclick=closeSheets;
$("btnRec").onclick=openRecList;

// create a template from an entry being saved
async function createRecurring(entry,interval,end){
  const ym=entry.date.slice(0,7);
  const t=withKids({user_id:S.user.id,type:entry.type,payer:entry.payer,amount:entry.amount,description:entry.description,category:entry.category,
    day:+entry.date.slice(8,10),interval_months:interval,start_month:ym,end_month:end||null,last_generated:ym,active:true},kidsOf(entry));
  const {data,error}=await sb.from(T_REC).insert(t).select().single();
  if(error) throw error;
  S.rec.push(data); budgetPushRecs(true); return data;
}

/* ---------- backup ---------- */
const T_BK = "hetzi_backups", BK_KEEP = 12;
const FREQ_DAYS = {daily:1, weekly:7, monthly:30, off:0};
const BK_KIND = {auto:"אוטומטי", manual:"ידני", "before-restore":"לפני שחזור", "before-import":"לפני ייבוא"};
const ENT_COLS = ["id","type","payer","amount","date","description","category","created_at","recurring_id","kids"];
const REC_COLS = ["kids","id","type","payer","amount","description","category","day","interval_months","start_month","end_month","last_generated","active","created_at"];
const pick=(o,cols)=>{ const r={}; cols.forEach(c=>{ if(o[c]!==undefined) r[c]=o[c]; }); return r; };
const daysSince=iso=> iso ? (Date.now()-new Date(iso).getTime())/864e5 : Infinity;
const fmtDT=iso=>new Date(iso).toLocaleString("he-IL",{day:"numeric",month:"numeric",year:"2-digit",hour:"2-digit",minute:"2-digit"});

async function fetchAllData(){
  const en=await sb.from(T_ENT).select("*"); if(en.error) throw en.error;
  let rec=[]; if(S.recOk){ const r=await sb.from(T_REC).select("*"); if(!r.error) rec=r.data; }
  return {app:"hetzi-hetzi", version:1, created_at:new Date().toISOString(),
    settings:{categories:S.cats,name_a:S.nameA,name_b:S.nameB},
    entries:en.data.map(e=>pick(e,ENT_COLS)), recurring:rec.map(t=>pick(t,REC_COLS))};
}
async function loadBackupState(){
  const {data,error}=await sb.from(T_BK).select("id,created_at,kind,entry_count").order("created_at",{ascending:false});
  S.bkOk=!error; S.backups=error?[]:data;
}
async function makeSnapshot(kind){
  if(!S.bkOk) return false;
  const data=await fetchAllData();
  if(kind==="auto" && !data.entries.length) return false;
  const {data:row,error}=await sb.from(T_BK).insert({user_id:S.user.id,kind,entry_count:data.entries.length,data}).select("id,created_at,kind,entry_count").single();
  if(error) return false;
  S.backups.unshift(row);
  const old=S.backups.slice(BK_KEEP);
  if(old.length){ await sb.from(T_BK).delete().in("id",old.map(b=>b.id)); S.backups=S.backups.slice(0,BK_KEEP); }
  return true;
}
async function autoBackup(){
  if(!S.bkOk) return;
  const days=FREQ_DAYS[S.prefs.freq]; if(!days) return;
  const lastAuto=S.backups.find(b=>b.kind==="auto");
  if(daysSince(lastAuto&&lastAuto.created_at) >= days-0.04) await makeSnapshot("auto");
}

// file backup
function backupFileName(){ return "גיבוי חצי חצי "+today()+".json"; }
async function markFileBackup(){
  S.prefs.last_file=new Date().toISOString(); S.bannerHidden=true; renderBanner();
  try{ await saveSettings(); }catch(e){}
}
// built from what is already loaded, so sharing happens right on the tap (Android requires that)
function buildBackupData(){
  return {app:"hetzi-hetzi", version:1, created_at:new Date().toISOString(),
    settings:{categories:S.cats,name_a:S.nameA,name_b:S.nameB},
    entries:S.entries.map(e=>pick(e,ENT_COLS)), recurring:(S.rec||[]).map(t=>pick(t,REC_COLS))};
}
const backupText=()=>JSON.stringify(buildBackupData(),null,1);
function downloadBackup(){
  try{
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([backupText()],{type:"application/json"}));
    a.download=backupFileName(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    toast("קובץ הגיבוי נשמר בתיקיית ההורדות"); markFileBackup();
  }catch(e){ toast("ההורדה נכשלה"); }
}
function shareBackup(){
  // Android shares only certain file types, so the (JSON) backup is shared as a .txt file
  let file;
  try{ file=new File([backupText()],backupFileName().replace(/\.json$/,".txt"),{type:"text/plain"}); }catch(e){ return downloadBackup(); }
  if(!(navigator.share && navigator.canShare && navigator.canShare({files:[file]}))) return downloadBackup();
  navigator.share({files:[file],title:"גיבוי חצי חצי"})
    .then(()=>{ toast("הגיבוי נשמר"); markFileBackup(); })
    .catch(e=>{ if(e&&e.name==="AbortError") return; toast("השיתוף לא נתמך, הקובץ ירד במקום"); downloadBackup(); });
}
function renderBanner(){
  const b=$("bkBanner"); if(!b) return;
  $("bkBannerShare").hidden=!navigator.share;
  const d=FREQ_DAYS[S.prefs.remind];
  const due = S.user && S.entries.length && d && !S.bannerHidden && daysSince(S.prefs.last_file) >= d;
  b.hidden=!due;
  if(due) $("bkBannerText").textContent = S.prefs.last_file
    ? "עברו "+Math.floor(daysSince(S.prefs.last_file))+" ימים מאז ששמרת גיבוי בטלפון."
    : "עוד לא שמרת גיבוי של הנתונים בטלפון.";
}

// restore
function validBackup(d){ return d && d.app==="hetzi-hetzi" && Array.isArray(d.entries); }
async function restoreData(d){
  if(S.bkOk) await makeSnapshot("before-restore");
  const uid=S.user.id;
  let r=await sb.from(T_ENT).delete().eq("user_id",uid); if(r.error) throw r.error;
  if(S.recOk){
    r=await sb.from(T_REC).delete().eq("user_id",uid); if(r.error) throw r.error;
    const recs=(d.recurring||[]).map(t=>{ const x=Object.assign(pick(t,REC_COLS),{user_id:uid}); if(!S.kidsOk) delete x.kids; return x; });
    if(recs.length){ r=await sb.from(T_REC).insert(recs); if(r.error) throw r.error; }
  }
  const ents=d.entries.map(e=>{ const x=Object.assign(pick(e,ENT_COLS),{user_id:uid}); if(!S.recOk) delete x.recurring_id; if(!S.kidsOk) delete x.kids; return x; });
  for(let i=0;i<ents.length;i+=500){ r=await sb.from(T_ENT).insert(ents.slice(i,i+500)); if(r.error) throw r.error; }
  if(d.settings){
    if(Array.isArray(d.settings.categories)&&d.settings.categories.length) S.cats=d.settings.categories;
    S.nameA=d.settings.name_a||S.nameA; S.nameB=d.settings.name_b||S.nameB;
    await saveSettings();
  }
}
async function confirmAndRestore(d,label){
  const msg="השחזור יחליף את כל הנתונים הנוכחיים ("+S.entries.length+" רישומים) ב־"+d.entries.length+" רישומים מהגיבוי של "+label+"."
    +(S.bkOk?"\nלפני כן יישמר גיבוי של המצב הנוכחי, כך שאפשר לחזור אחורה.":"")+"\n\nלהמשיך?";
  if(!confirm(msg)) return;
  toast("משחזר…");
  try{ await restoreData(d); closeSheets(); toast("השחזור הושלם"); S.rec=[]; await loadAll(); }
  catch(e){ toast("השחזור נכשל. נסה שוב"); try{ await loadAll(); }catch(_){} }
}

// sheet
function openBackup(){
  $("bkFreq").value=S.prefs.freq; $("bkRemind").value=S.prefs.remind;
  $("bkLastFile").textContent = S.prefs.last_file ? "גיבוי אחרון לטלפון: "+fmtDT(S.prefs.last_file) : "עוד לא נשמר גיבוי בטלפון.";
  $("bkShare").hidden=!navigator.share;
  $("bkCloudOff").hidden=S.bkOk; $("bkCloud").hidden=!S.bkOk;
  const list=$("bkList"); list.innerHTML="";
  if(S.bkOk && !S.backups.length){ list.innerHTML='<p class="hint">עוד אין גיבויים בענן.</p>'; }
  for(const b of S.backups){
    const row=document.createElement("div"); row.className="bkrow";
    const t=document.createElement("span"); t.className="bkt";
    t.innerHTML="<b></b><small></small>";
    t.querySelector("b").textContent=fmtDT(b.created_at);
    t.querySelector("small").textContent=(BK_KIND[b.kind]||b.kind)+" · "+b.entry_count+" רישומים";
    const btn=document.createElement("button"); btn.className="link"; btn.textContent="שחזור";
    btn.onclick=async()=>{
      const {data,error}=await sb.from(T_BK).select("data").eq("id",b.id).single();
      if(error||!validBackup(data.data)){ toast("לא הצלחתי לטעון את הגיבוי"); return; }
      confirmAndRestore(data.data,fmtDT(b.created_at));
    };
    row.append(t,btn); list.appendChild(row);
  }
  closeSheets(); $("bkScrim").classList.add("open");
}
async function savePrefs(){ try{ await saveSettings(); }catch(e){ toast("השמירה נכשלה"); } }
$("btnBackup").onclick=openBackup;
$("sBackup").onclick=openBackup;
$("bkClose").onclick=closeSheets;
$("bkFreq").onchange=async()=>{ S.prefs.freq=$("bkFreq").value; await savePrefs(); if(S.prefs.freq!=="off"){ await autoBackup(); openBackup(); } };
$("bkRemind").onchange=async()=>{ S.prefs.remind=$("bkRemind").value; S.bannerHidden=false; await savePrefs(); renderBanner(); };
$("bkNow").onclick=async()=>{ const ok=await makeSnapshot("manual"); toast(ok?"נשמר גיבוי בענן":"הגיבוי נכשל"); openBackup(); };
$("bkDownload").onclick=downloadBackup;
$("bkShare").onclick=shareBackup;
$("bkBannerGo").onclick=downloadBackup;
$("bkBannerShare").onclick=shareBackup;
$("bkBannerLater").onclick=()=>{ S.bannerHidden=true; renderBanner(); };
$("bkRestoreFile").onclick=()=>{ $("bkFile").value=""; $("bkFile").click(); };
$("bkFile").onchange=async()=>{
  const f=$("bkFile").files[0]; if(!f) return;
  let d; try{ d=JSON.parse(await f.text()); }catch(e){ d=null; }
  if(!validBackup(d)){ toast("זה לא קובץ גיבוי של חצי חצי"); return; }
  confirmAndRestore(d, d.created_at?fmtDT(d.created_at):f.name);
};

/* ---------- sync to the budget app (מנהל התקציב) ---------- */
const BUDGET_URL="https://pznpibrlcbjpcoxagxns.supabase.co";
const BUDGET_KEY="sb_publishable_PdsDUQ0Sy5if_s3p5EKbJA_E_HDfTwN";
const OUTBOX_LS="hetzi-budget-outbox";
let sbB=null;
function budgetClient(){
  if(!sbB && window.supabase) sbB=window.supabase.createClient(BUDGET_URL,BUDGET_KEY,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:"hetzi-budget-noauth"}});
  return sbB;
}
const budgetLink=()=> (S.prefs&&S.prefs.budgetLink&&S.prefs.budgetLink.key) || null;
function outboxRead(){ try{ return JSON.parse(localStorage.getItem(OUTBOX_LS)||"{}")||{}; }catch(e){ return {}; } }
function outboxWrite(o){ try{ localStorage.setItem(OUTBOX_LS,JSON.stringify(o)); }catch(e){} }
let bRev=0; const nextRev=()=>{ bRev=Math.max(Date.now(),bRev+1); return bRev; };

function budgetItem(e,op){
  // only one-time expenses/incomes go to the budget: transfers and recurring entries never do
  if(op==="delete" || e.type==="transfer" || e.recurring_id) return {hetzi_id:e.id,op:"delete",rev:nextRev(),payload:{}};
  const full=+e.amount;
  return {hetzi_id:e.id,op:"upsert",rev:nextRev(),payload:{
    date:e.date, type:e.type==="expense"?"Expense":"Income",
    amount:Math.round(full*50)/100, full, payer:nm(e.payer),
    desc:e.description||(e.type==="expense"?"הוצאה":"הכנסה"), category:e.category||""}};
}
// queue first, then send; whatever fails stays queued and is retried later
function budgetQueue(items){
  if(!budgetLink() || !items.length) return;
  const o=outboxRead(); items.forEach(it=>{ o[it.hetzi_id]=it; }); outboxWrite(o);
  budgetFlush();
}
let flushing=false;
async function budgetFlush(){
  const key=budgetLink(); if(!key || flushing) return;
  const o=outboxRead(), items=Object.values(o); if(!items.length) return;
  const c=budgetClient(); if(!c) return;
  flushing=true;
  try{
    for(let i=0;i<items.length;i+=200){
      const part=items.slice(i,i+200);
      const {error}=await c.rpc("hetzi_push",{p_key:key,p_items:part});
      if(error){ if(/unknown key/.test(error.message||"")) S.budgetKeyBad=true; break; }
      const cur=outboxRead(); part.forEach(it=>{ if(cur[it.hetzi_id]&&cur[it.hetzi_id].rev===it.rev) delete cur[it.hetzi_id]; }); outboxWrite(cur);
    }
  }catch(e){}
  flushing=false;
}
// new rows: recurring ones are skipped. edits: a row that became recurring is removed from the budget
// the full list of recurring items goes to the budget app, where they can be linked to its own recurring rules
const REC_SENT_LS="hetzi-budget-recs-sent";
async function budgetPushRecs(force){
  const key=budgetLink(); if(!key || !S.recOk) return;
  const c=budgetClient(); if(!c) return;
  try{
    const {data,error}=await sb.from(T_REC).select("*"); if(error) return;          // fresh, not this device's copy
    const recs=data.map(t=>({id:t.id,type:t.type,payer:t.payer,amount:+t.amount,description:t.description||"",category:t.category||"",
      day:t.day,interval_months:t.interval_months,start_month:t.start_month,end_month:t.end_month||null,last_generated:t.last_generated||null,active:!!t.active}))
      .sort((x,y)=>String(x.id).localeCompare(String(y.id)));
    const sig=JSON.stringify(recs); let last=null; try{ last=JSON.parse(localStorage.getItem(REC_SENT_LS)||"null"); }catch(e){}
    if(!force && last && last.sig===sig && Date.now()-last.at<864e5) return;
    const r=await c.rpc("hetzi_push_recs",{p_key:key,p_recs:recs});
    if(!r.error) try{ localStorage.setItem(REC_SENT_LS,JSON.stringify({sig,at:Date.now()})); }catch(e){}
  }catch(e){}
}
const syncEntries=(rows,isEdit)=>budgetQueue((rows||[]).filter(e=>isEdit||!e.recurring_id).map(e=>budgetItem(e,"upsert")));
window.addEventListener("online",()=>budgetFlush());

// settings sheet
function readSameBrowserLink(){ try{ const v=JSON.parse(localStorage.getItem("hetziBudgetLink")||"null"); return v&&v.key||null; }catch(e){ return null; } }
function openBudgetSync(){
  const linked=!!budgetLink();
  $("bsOff").hidden=linked; $("bsOn").hidden=!linked; $("bsErr").textContent="";
  if(linked){
    const since=S.prefs.budgetLink.since;
    const q=Object.keys(outboxRead()).length;
    $("bsStatus").textContent="✓ מחובר"+(since?" מ־"+fmtDT(since):"")+". כל הוצאה והכנסה חד־פעמית, עריכה ומחיקה נשלחות לאפליקציית התקציב ב־50% מהסכום. רישומים קבועים והעברות ביניכם לא נשלחים."
      +(q?" ממתינים לשליחה: "+q+".":"")+(S.budgetKeyBad?" ⚠ המפתח לא מוכר יותר באפליקציית התקציב; חבר מחדש.":"");
    $("bsMonth").value=S.month;
  }else{
    const auto=readSameBrowserLink();
    $("bsAuto").hidden=!auto; $("bsKey").value="";
  }
  closeSheets(); $("bsScrim").classList.add("open");
}
async function connectBudget(key){
  key=(key||"").trim();
  if(!/^[0-9a-f]{32,}$/i.test(key)){ $("bsErr").textContent="המפתח לא תקין. העתק אותו מאפליקציית התקציב: הגדרות ← חצי חצי."; return; }
  const c=budgetClient(); if(!c){ $("bsErr").textContent="אין חיבור לאינטרנט."; return; }
  const {error}=await c.rpc("hetzi_push",{p_key:key,p_items:[]});
  if(error){ $("bsErr").textContent=/unknown key/.test(error.message||"")?"המפתח לא נמצא. ודא שהעתקת את המפתח העדכני.":"החיבור נכשל: "+error.message; return; }
  S.prefs.budgetLink={key,since:new Date().toISOString()}; S.budgetKeyBad=false; budgetPushRecs(true);
  try{ await saveSettings(); }catch(e){ $("bsErr").textContent="החיבור עבד, אבל שמירת ההגדרה נכשלה. נסה שוב."; return; }
  toast("מחובר לאפליקציית התקציב"); openBudgetSync();
}
$("sBudget").onclick=openBudgetSync;
$("bsClose").onclick=closeSheets;
$("bsAuto").onclick=()=>connectBudget(readSameBrowserLink());
$("bsConnect").onclick=()=>connectBudget($("bsKey").value);
$("bsSend").onclick=async()=>{
  const from=$("bsMonth").value; if(!from){ $("bsErr").textContent="בחר חודש."; return; }
  const rows=S.entries.filter(e=>e.type!=="transfer" && !e.recurring_id && e.date.slice(0,7)>=from);
  if(!rows.length){ $("bsErr").textContent="אין רישומים מהחודש הזה ואילך."; return; }
  const [y,m]=from.split("-").map(Number);
  if(!confirm("לשלוח "+rows.length+" רישומים מ"+MONTHS[m-1]+" "+y+" ואילך? באפליקציית התקציב תוכל לבחור אילו מהם להכניס.")) return;
  syncEntries(rows); await budgetFlush();
  toast(Object.keys(outboxRead()).length?"חלק מהרישומים ממתינים לשליחה":"נשלחו "+rows.length+" רישומים"); openBudgetSync();
};
$("bsUnlink").onclick=async()=>{
  if(!confirm("לנתק? רישומים חדשים לא יישלחו לאפליקציית התקציב. מה שכבר נשלח יישאר שם.")) return;
  delete S.prefs.budgetLink; outboxWrite({});
  try{ await saveSettings(); }catch(e){}
  toast("נותק"); openBudgetSync();
};

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
  $("kidBlock").hidden = !S.kidsOk || !S.kids.length;
  const canRec = F.type!=="transfer" && S.recOk && !F.recId;
  $("recToggle").hidden=!canRec; $("recOpts").hidden=!(canRec && $("fRec").checked);
  $("recNote").hidden=!(F.recId && F.type!=="transfer");
  $("fRecLbl").textContent = (F.type==="income"?"הכנסה קבועה":"הוצאה קבועה")+" (חוזרת)";
  const dd=$("fDate").value; $("fRecDay").textContent = dd ? +dd.slice(8,10) : "";
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
  F.recId = e && e.recurring_id && S.rec.some(t=>t.id===e.recurring_id) ? e.recurring_id : null;
  $("fRec").checked=false; $("fRecInt").value="1"; $("fRecEnd").value="";
  F.kids = e ? kidsOf(e).slice() : []; F.kidsTouched = !!e;
  renderFormKids(); renderCats(); updateForm();
  $("entryScrim").classList.add("open");
  if(!e) setTimeout(()=>$("fAmt").focus(),60);
}
function renderFormKids(){ renderKidPicker("kidChips",()=>F.kids,v=>{ F.kids=v; F.kidsTouched=true; }); }
$("fDesc").addEventListener("input",()=>{ if(!F.kidsTouched){ F.kids=detectKids($("fDesc").value); renderFormKids(); } });
$("fDesc").addEventListener("change",()=>{
  const prev=descMap.get($("fDesc").value.trim());
  if(prev && !F.id){ if(!F.cat && prev.category) F.cat=prev.category; if(prev.type!=="transfer"){ F.type=prev.type; F.payer=prev.payer; }
    if(!F.kidsTouched && kidsOf(prev).length){ F.kids=kidsOf(prev).slice(); renderFormKids(); }
    renderCats(); updateForm(); }
});
function closeSheets(){ document.querySelectorAll(".scrim").forEach(s=>s.classList.remove("open")); }
$("typeSeg").addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b) return; F.type=b.dataset.v;
  if(F.type==="income" && !F.cat && S.cats.includes("קצבאות")) F.cat="קצבאות";
  // a new transfer starts as the full settlement: whole balance, from whoever owes
  if(F.type==="transfer" && !F.id && !parseAmt($("fAmt").value)){
    const bal=S.entries.reduce((s,e)=>s+effect(e),0);
    if(Math.abs(bal)>=0.005){ $("fAmt").value=Math.round(Math.abs(bal)*100)/100; F.payer=bal>0?"b":"a"; }
  }
  renderCats(); updateForm(); });
$("whoSeg").addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b) return; F.payer=b.dataset.v; updateForm(); });
$("fAmt").addEventListener("input",updateForm);
$("fDate").addEventListener("change",updateForm);
$("fRec").addEventListener("change",updateForm);
$("fRecManage").onclick=()=>{ const t=S.rec.find(x=>x.id===F.recId); if(t) openRecEdit(t); };
$("fCancel").onclick=closeSheets;
$("fSave").onclick=async()=>{
  const amount=parseAmt($("fAmt").value), date=$("fDate").value;
  if(!(amount>0)){ $("fErr").textContent="יש להזין סכום גדול מאפס."; return; }
  if(!date){ $("fErr").textContent="יש לבחור תאריך."; return; }
  const data=withKids({type:F.type,payer:F.payer,amount:Math.round(amount*100)/100,date,
    description:F.type==="transfer"?"":$("fDesc").value.trim(),category:F.type==="transfer"?"":F.cat},F.type==="transfer"?[]:F.kids);
  $("fSave").disabled=true;
  const makeRec = !$("recToggle").hidden && $("fRec").checked;
  try{
    if(makeRec){ const t=await createRecurring(data,+$("fRecInt").value,$("fRecEnd").value); data.recurring_id=t.id; }
    await saveEntry(F.id,data); S.month=date.slice(0,7); closeSheets();
    const recUpd = F.id && F.recId ? await offerRecurringUpdate(F.recId,data) : false;
    toast(makeRec?"נשמר כקבוע":recUpd?"הרישום והקבועה עודכנו":(F.id?"הרישום עודכן":"הרישום נשמר")); render(); }
  catch(e){ $("fErr").textContent = navigator.onLine ? "השמירה נכשלה. נסה שוב." : "אין חיבור לאינטרנט. השמירה תתאפשר כשהחיבור יחזור."; }
  $("fSave").disabled=false;
};
// editing one entry of a recurring item: offer to apply the change to the recurring item itself, from the next time on
async function offerRecurringUpdate(recId,d){
  const t=S.rec.find(x=>x.id===recId); if(!t || d.type!==t.type) return false;
  const upd={};
  if(Math.abs(+t.amount-d.amount)>0.004) upd.amount=d.amount;
  if((t.description||"")!==(d.description||"")) upd.description=d.description;
  if((t.category||"")!==(d.category||"")) upd.category=d.category;
  if(t.payer!==d.payer) upd.payer=d.payer;
  if(S.kidsOk && !sameKids(kidsOf(t),kidsOf(d))) upd.kids=kidsOf(d).slice();
  if(!Object.keys(upd).length) return false;
  const kt=x=>kidsOf(x).length?kidsText(kidsOf(x)):null;
  const now=[t.description||(t.type==="expense"?"הוצאה":"הכנסה"),money(t.amount),nm(t.payer),kt(t)].filter(Boolean).join(" · ");
  const next=[d.description||(d.type==="expense"?"הוצאה":"הכנסה"),money(d.amount),nm(d.payer),kt(d)].filter(Boolean).join(" · ");
  if(!confirm("זה רישום של קבועה.\nלעדכן גם את הקבועה, כך שמהפעם הבאה יירשם:\n"+next+"\n(במקום: "+now+")\n\nביטול = השינוי חל רק על הרישום הזה.")) return false;
  const {error}=await sb.from(T_REC).update(upd).eq("id",t.id);
  if(error){ toast("עדכון הקבועה נכשל"); return false; }
  Object.assign(t,upd); budgetPushRecs(true); return true;
}
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
let KE=[];
function renderKidEditor(){
  const box=$("kidEditor"); box.innerHTML="";
  KE.forEach((c,i)=>{
    const row=document.createElement("div"); row.className="catrow";
    const inp=document.createElement("input"); inp.type="text"; inp.value=c.name; inp.setAttribute("aria-label","שם ילד");
    inp.oninput=()=>{ c.name=inp.value; };
    const del=document.createElement("button"); del.textContent="✕"; del.setAttribute("aria-label","הסרת "+c.name);
    del.onclick=()=>{ KE.splice(i,1); renderKidEditor(); };
    row.append(inp,del); box.appendChild(row);
  });
}
$("addKid").onclick=()=>{ const n=$("newKid").value.trim(); if(!n) return; KE.push({orig:null,name:n}); $("newKid").value=""; renderKidEditor(); };
$("newKid").addEventListener("keydown",e=>{ if(e.key==="Enter") $("addKid").click(); });
// one-time: classify existing entries (and recurring items) by the child names in their description
$("sKidsAuto").onclick=async()=>{
  const ents=S.entries.filter(e=>e.type!=="transfer" && !kidsOf(e).length && detectKids(e.description).length);
  const recs=(S.rec||[]).filter(t=>!kidsOf(t).length && detectKids(t.description).length);
  const left=S.entries.filter(e=>e.type!=="transfer" && !kidsOf(e).length).length-ents.length;
  if(!ents.length && !recs.length){ toast(left?"לא נמצאו שמות ילדים בתיאורים שנשארו":"כל הרישומים כבר מסווגים"); return; }
  if(!confirm("נמצאו "+ents.length+" רישומים"+(recs.length?" ו־"+recs.length+" קבועות":"")+" שבתיאור שלהם מופיע שם של ילד (או \"ילדים\").\nלסווג אותם לפי זה?"
    +(left?"\n\n"+(left===1?"רישום אחד":left+" רישומים")+" בלי שם ילד בתיאור "+(left===1?"יישאר לא מסווג":"יישארו לא מסווגים")+", ואפשר לסווג ידנית.":""))) return;
  const btn=$("sKidsAuto"); btn.disabled=true; let n=0, fail=0;
  for(const e of ents){ const k=detectKids(e.description); const {error}=await sb.from(T_ENT).update({kids:k}).eq("id",e.id); if(error) fail++; else { e.kids=k; n++; } }
  for(const t of recs){ const k=detectKids(t.description); const {error}=await sb.from(T_REC).update({kids:k}).eq("id",t.id); if(!error) t.kids=k; }
  btn.disabled=false; saveCache(); render();
  toast(fail?"סווגו "+n+", "+fail+" נכשלו":"סווגו "+n+" רישומים"); if(recs.length) budgetPushRecs(true);
};
$("btnSettings").onclick=()=>{
  $("sNameA").value=S.nameA; $("sNameB").value=S.nameB; $("sErr").textContent="";
  CE=S.cats.map(c=>({orig:c,name:c})); renderCatEditor(); $("newCat").value="";
  KE=S.kids.map(k=>({orig:k,name:k})); renderKidEditor(); $("newKid").value="";
  $("kidSetOff").hidden=S.kidsOk; $("kidSetOn").hidden=!S.kidsOk;
  $("setScrim").classList.add("open");
};
$("addCat").onclick=()=>{ const n=$("newCat").value.trim(); if(!n) return; CE.push({orig:null,name:n}); $("newCat").value=""; renderCatEditor(); };
$("newCat").addEventListener("keydown",e=>{ if(e.key==="Enter") $("addCat").click(); });
$("sCancel").onclick=closeSheets;
$("sSave").onclick=async()=>{
  const names=CE.map(c=>c.name.trim());
  if(names.some(n=>!n)){ $("sErr").textContent="יש קטגוריה בלי שם."; return; }
  if(new Set(names).size!==names.length){ $("sErr").textContent="יש שתי קטגוריות באותו שם."; return; }
  const kidNames=KE.map(c=>c.name.trim());
  if(kidNames.some(n=>!n)){ $("sErr").textContent="יש ילד בלי שם."; return; }
  if(new Set(kidNames).size!==kidNames.length){ $("sErr").textContent="יש שני ילדים באותו שם."; return; }
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
    // renaming a child renames it in every entry and recurring item
    if(S.kidsOk) for(const c of KE){
      const n=c.name.trim(); if(!c.orig || n===c.orig) continue;
      for(const e of S.entries.filter(x=>kidsOf(x).includes(c.orig))){
        const k=kidsOf(e).map(x=>x===c.orig?n:x); const {error}=await sb.from(T_ENT).update({kids:k}).eq("id",e.id); if(error) throw error; e.kids=k; }
      for(const t of (S.rec||[]).filter(x=>kidsOf(x).includes(c.orig))){
        const k=kidsOf(t).map(x=>x===c.orig?n:x); const {error}=await sb.from(T_REC).update({kids:k}).eq("id",t.id); if(error) throw error; t.kids=k; }
      if(S.kid===c.orig) S.kid=n;
    }
    S.kids=kidNames;
    S.cats=names;
    S.nameA=$("sNameA").value.trim()||"אילן"; S.nameB=$("sNameB").value.trim()||"קרן";
    await saveSettings(); closeSheets(); toast("ההגדרות נשמרו"); render();
  }catch(e){ $("sErr").textContent="השמירה נכשלה. בדוק את החיבור ונסה שוב."; }
  $("sSave").disabled=false;
};

/* ---------- actions ---------- */
$("btnAdd").onclick=()=>openEntry(null);
$("prevM").onclick=()=>shiftMonth(-1); $("nextM").onclick=()=>shiftMonth(1);
function shiftMonth(d){ let [y,m]=S.month.split("-").map(Number); m+=d; if(m<1){m=12;y--;} if(m>12){m=1;y++;} S.month=y+"-"+pad(m); render(); }
$("whoFilter").addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b) return; S.who=b.dataset.v; render(); });
$("kindFilter").addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b) return; S.kind=b.dataset.v; render(); });
$("kidFilter").addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b) return; S.kid=b.dataset.v; render(); });
$("orderFilter").addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b) return; S.order=b.dataset.v;
  try{ localStorage.setItem("hetzi-order",S.order); }catch(e){} render(); });
["a","b"].forEach(p=>$("pc"+p).addEventListener("click",()=>{ S.who = S.who===p?"all":p; render(); }));

function monthItems(){ return monthEntries().sort((a,b)=>a.date.localeCompare(b.date)||String(a.created_at).localeCompare(String(b.created_at))); }
$("btnCopy").onclick=()=>{
  const [y,m]=S.month.split("-").map(Number); const items=monthItems();
  const L=["סיכום הוצאות הילדים – "+MONTHS[m-1]+" "+y,""];
  const block=(title,type)=>{
    const rows=items.filter(e=>e.type===type); if(!rows.length) return;
    L.push(title);
    rows.forEach(e=>L.push("• "+(e.description||title)+": "+money(e.amount)+" ("+[nm(e.payer)].concat(kidsOf(e).length?[kidsText(kidsOf(e))]:[]).join(" · ")+")"));
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
    c.alignment={vertical:"middle",horizontal:(k==="desc"||k==="cat"||k==="kid")?"right":"center"};
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
  const keys=[]; if(opt.date) keys.push("date"); keys.push("desc"); if(opt.cat) keys.push("cat"); if(opt.kid) keys.push("kid"); keys.push("b","a");
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
    const hr=ws.addRow(vals({date:"תאריך",desc:title,cat:"קטגוריה",kid:"ילד",b:B,a:A}));
    styleRow(hr,keys,{bg:head,color:"FFFFFFFF",bold:true,size:12,height:24});
    const first=hr.number+1;
    rows.forEach((e,i)=>{
      const r=ws.addRow(vals({date:toDate(e.date),desc:type==="transfer"?transferText(e):(e.description||""),cat:e.category||"",kid:kidsText(kidsOf(e)),
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
  ws.columns=[{header:"תאריך"},{header:"סוג"},{header:"תיאור"},{header:"קטגוריה"},{header:"ילד"},{header:"מי"},{header:"סכום"}];
  const TL={expense:"הוצאה",income:"הכנסה",transfer:"העברה"};
  const head=ws.getRow(1); head.height=24;
  head.eachCell(c=>{ c.font={name:X.font,bold:true,color:{argb:"FFFFFFFF"}}; c.fill=fill(X.navy); c.alignment={horizontal:"center",vertical:"middle"}; });
  S.entries.filter(e=>months.includes(e.date.slice(0,7))).sort((a,b)=>a.date.localeCompare(b.date)||String(a.created_at).localeCompare(String(b.created_at))).forEach((e,i)=>{
    const r=ws.addRow([toDate(e.date),TL[e.type],e.type==="transfer"?transferText(e):(e.description||""),e.category||"",kidsText(kidsOf(e)),nm(e.payer),+e.amount]);
    r.eachCell({includeEmpty:true},c=>{ c.font={name:X.font,size:11}; c.border=border(); if(i%2) c.fill=fill(X.zebra); });
    r.getCell(1).numFmt=X.date; r.getCell(7).numFmt=X.money;
    r.getCell(2).font={name:X.font,size:11,bold:true,color:{argb: e.type==="expense"?X.exp:e.type==="income"?X.inc:X.tr}};
    r.getCell(6).font={name:X.font,size:11,color:{argb: e.payer==="a"?X.a:X.b}};
  });
  ws.autoFilter={from:"A1",to:"G1"};
  autoWidth(ws,7,8); ws.getColumn(1).width=12;
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
  $("xErr").textContent=""; updXFmt(); $("xScrim").classList.add("open");
};
$("xAll").onclick=()=>{ const cs=[...document.querySelectorAll("#xMonths input")]; const on=!cs.every(c=>c.checked); cs.forEach(c=>c.checked=on); };
$("xCancel").onclick=closeSheets;
/* ---------- PDF / JPEG export (drawn on canvas, so Hebrew always renders correctly) ---------- */
const loadJsPDF=()=>loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",()=>!!(window.jspdf&&window.jspdf.jsPDF));
const R = { W:1240, PAGE_H:1754, M:56, FONT:'"Assistant","Segoe UI",Arial,sans-serif',
  navy:"#1E2940", line:"#D5DBD3", ink:"#1E2940", muted:"#66707F", zebra:"#F7F8F6",
  exp:"#C46A2A", expL:"#FBEFE4", inc:"#2A8577", incL:"#E2F2EF", tr:"#5B5FA0", trL:"#E9EAF5",
  a:"#2F6DB5", b:"#A8458A", plus:"#3F7A5A", minus:"#A94F38", sumBg:"#EFF1EC" };
const fnt=(px,w)=>(w||400)+" "+px+"px "+R.FONT;

// rows: {k:"title"|"head"|"row"|"total"|"label"|"note"|"gap", ...}; cols: [{key,title,num,min}]
function layoutCols(ctx,cols,rows){
  const inner=R.W-2*R.M, pad=28;
  const w=cols.map(c=>{
    let m=c.min||70;
    ctx.font=fnt(22,700); m=Math.max(m,ctx.measureText(c.title||"").width+pad);
    if(!c.flex) rows.forEach(r=>{ if(r.cells&&r.cells[c.key]!=null){ ctx.font=fnt(22,r.k==="row"?400:700); m=Math.max(m,ctx.measureText(String(r.cells[c.key])).width+pad); } });
    return m;
  });
  const fixed=w.reduce((s,x,i)=>s+(cols[i].flex?0:x),0);
  cols.forEach((c,i)=>{ if(c.flex) w[i]=Math.max(w[i],inner-fixed); });
  const tot=w.reduce((s,x)=>s+x,0); if(tot>inner){ const f=inner/tot; for(let i=0;i<w.length;i++) w[i]*=f; }
  // RTL: first column is on the right
  let x=R.W-R.M; return cols.map((c,i)=>{ const o={x0:x-w[i],x1:x,w:w[i]}; x-=w[i]; return o; });
}
const rowH=r=>({title:84,head:52,row:46,total:50,label:50,note:44,gap:r.h||20,foot:40})[r.k];
function fitText(ctx,t,max){ t=String(t); if(ctx.measureText(t).width<=max) return t; while(t.length>1&&ctx.measureText(t+"…").width>max) t=t.slice(0,-1); return t+"…"; }
function drawRows(ctx,cols,pos,rows,y){
  const L=R.M, Rt=R.W-R.M;
  const cellText=(txt,p,c,font,color)=>{
    if(txt==null||txt==="") return;
    ctx.font=font; ctx.fillStyle=color; ctx.textBaseline="middle";
    const s=fitText(ctx,txt,p.w-20);
    if(c.num){ ctx.direction="ltr"; ctx.textAlign="center"; ctx.fillText(s,(p.x0+p.x1)/2,y+rowH(cur)/2); }
    else { ctx.direction="rtl"; ctx.textAlign="right"; ctx.fillText(s,p.x1-12,y+rowH(cur)/2); }
  };
  let cur;
  for(const r of rows){
    cur=r; const h=rowH(r);
    if(r.k==="title"){
      ctx.fillStyle=R.navy; ctx.fillRect(L,y,Rt-L,h);
      ctx.fillStyle="#fff"; ctx.font=fnt(34,700); ctx.direction="rtl"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(r.text,R.W/2,y+h/2);
    } else if(r.k==="head"||r.k==="row"||r.k==="total"){
      ctx.fillStyle=r.k==="head"?r.bg:(r.k==="total"?r.bg:(r.zebra?R.zebra:"#fff")); ctx.fillRect(L,y,Rt-L,h);
      cols.forEach((c,i)=>{
        const p=pos[i]; ctx.strokeStyle=R.line; ctx.lineWidth=1; ctx.strokeRect(p.x0+.5,y+.5,p.w,h);
        const color=r.k==="head"?"#fff":(c.color&&r.cells[c.key]!=null&&c.num?c.color:R.ink);
        cellText(r.cells[c.key],p,c,fnt(r.k==="head"?23:22,r.k==="row"?400:700),r.colors&&r.colors[c.key]||color);
      });
    } else if(r.k==="label"){
      ctx.fillStyle=r.bg; ctx.fillRect(L,y,Rt-L,h);
      const vi=cols.findIndex(c=>c.key===r.at), p=pos[vi];
      ctx.strokeStyle=R.line; ctx.strokeRect(L+.5,y+.5,Rt-L,h);
      ctx.font=fnt(r.size||23,700); ctx.fillStyle=r.fg||R.ink; ctx.direction="rtl"; ctx.textAlign="right"; ctx.textBaseline="middle";
      ctx.fillText(r.text,Rt-14,y+h/2);
      ctx.direction="ltr"; ctx.textAlign="center"; ctx.fillText(r.value,(p.x0+p.x1)/2,y+h/2);
    } else if(r.k==="note"||r.k==="foot"){
      ctx.font=fnt(r.k==="foot"?18:(r.size||22),r.bold?700:400); ctx.fillStyle=r.color||R.muted;
      ctx.direction="rtl"; ctx.textAlign="right"; ctx.textBaseline="middle"; ctx.fillText(r.text,Rt-6,y+h/2);
    }
    y+=h;
  }
  return y;
}
function monthReport(ym,opt){
  const [y,m]=ym.split("-").map(Number);
  const items=S.entries.filter(e=>e.date.slice(0,7)===ym).sort((a,b)=>a.date.localeCompare(b.date)||String(a.created_at).localeCompare(String(b.created_at)));
  const cols=[]; if(opt.date) cols.push({key:"date",title:"תאריך",num:true});
  cols.push({key:"desc",title:"",flex:true}); if(opt.cat) cols.push({key:"cat",title:"קטגוריה"}); if(opt.kid) cols.push({key:"kid",title:"ילד"});
  cols.push({key:"b",title:S.nameB,num:true,color:R.b,min:150},{key:"a",title:S.nameA,num:true,color:R.a,min:150});
  const rows=[{k:"title",text:"סיכום תשלומים לחודש "+MONTHS[m-1]+" "+y},{k:"gap",h:18}];
  const dmy=d=>d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4);
  const section=(type,title,bg,bgL,tot)=>{
    const list=items.filter(e=>e.type===type);
    rows.push({k:"head",bg,cells:{date:"תאריך",desc:title,cat:"קטגוריה",kid:"ילד",b:S.nameB,a:S.nameA}});
    list.forEach((e,i)=>rows.push({k:"row",zebra:i%2,cells:{date:dmy(e.date),desc:type==="transfer"?transferText(e):(e.description||""),
      cat:e.category||"",kid:kidsText(kidsOf(e)),b:e.payer==="b"?money(e.amount):null,a:e.payer==="a"?money(e.amount):null}}));
    if(!list.length) rows.push({k:"row",cells:{desc:"אין רישומים"},colors:{desc:R.muted}});
    rows.push({k:"total",bg:bgL,cells:{desc:tot,b:money(sumBy(list,type,"b")),a:money(sumBy(list,type,"a"))}});
  };
  section("expense","סוג הוצאה",R.exp,R.expL,'סה"כ הוצאות');
  const eB=sumBy(items,"expense","b"), eA=sumBy(items,"expense","a"), iB=sumBy(items,"income","b"), iA=sumBy(items,"income","a");
  const sgn=v=>(v<0?"-":"")+money(v);
  rows.push({k:"label",bg:R.expL,text:"חישוב הוצאות",at:"b",value:sgn((eB-eA)/2)},{k:"gap"});
  section("income","סוג הכנסה / החזר",R.inc,R.incL,'סה"כ הכנסות');
  rows.push({k:"label",bg:R.incL,text:"חישוב הכנסות",at:"b",value:sgn((iA-iB)/2)});
  let result=(eB-eA)/2+(iA-iB)/2;
  const hasTr=items.some(e=>e.type==="transfer");
  if(hasTr){ rows.push({k:"gap"}); section("transfer","העברות ביניכם",R.tr,R.trL,'סה"כ העברות'); result+=sumBy(items,"transfer","b")-sumBy(items,"transfer","a"); }
  rows.push({k:"gap"},{k:"label",bg:R.navy,fg:"#fff",size:26,text:"סיכום סופי",at:"b",value:sgn(result)});
  const ow=owesText(-result);
  rows.push({k:"note",bold:true,size:24,color:result<0?R.plus:R.minus,text:ow?ow+" "+money(result)+(hasTr?" (אחרי העברות)":""):"החודש מאוזן"});
  if(opt.notes){
    const cum=Math.round(-100*S.entries.filter(e=>e.date.slice(0,7)<=ym).reduce((s,e)=>s+effect(e),0))/100, cn=owesText(-cum);
    rows.push({k:"label",bg:R.sumBg,text:"יתרה מצטברת עד סוף החודש",at:"b",value:sgn(cum)},
      {k:"note",text:cn?cn+" "+money(cum)+" (כולל חודשים קודמים)":"מאוזנים עד סוף החודש"});
  }
  return {cols,rows,name:MONTHS[m-1]+" "+y};
}
function allReport(months){
  const TL={expense:"הוצאה",income:"הכנסה",transfer:"העברה"};
  const cols=[{key:"date",title:"תאריך",num:true},{key:"type",title:"סוג"},{key:"desc",title:"תיאור",flex:true},{key:"cat",title:"קטגוריה"},{key:"kid",title:"ילד"},{key:"who",title:"מי"},{key:"amt",title:"סכום",num:true,min:150}];
  const rows=[{k:"title",text:"כל הרישומים"},{k:"gap",h:18},{k:"head",bg:R.navy,cells:Object.fromEntries(cols.map(c=>[c.key,c.title]))}];
  S.entries.filter(e=>months.includes(e.date.slice(0,7))).sort((a,b)=>a.date.localeCompare(b.date)||String(a.created_at).localeCompare(String(b.created_at)))
    .forEach((e,i)=>rows.push({k:"row",zebra:i%2,cells:{date:e.date.slice(8,10)+"/"+e.date.slice(5,7)+"/"+e.date.slice(0,4),type:TL[e.type],
      desc:e.type==="transfer"?transferText(e):(e.description||""),cat:e.category||"",kid:kidsText(kidsOf(e)),who:nm(e.payer),amt:money(e.amount)},
      colors:{type:e.type==="expense"?R.exp:e.type==="income"?R.inc:R.tr,who:e.payer==="a"?R.a:R.b}}));
  return {cols,rows,name:"כל הרישומים"};
}
const footRow=()=>({k:"foot",text:"הופק מחצי חצי · "+new Date().toLocaleDateString("he-IL")});
function newCanvas(h){ const c=document.createElement("canvas"); c.width=R.W; c.height=h; const x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,R.W,h); return [c,x]; }
// one tall image
function renderTall(rep){
  const [,m]=newCanvas(1); const pos=layoutCols(m,rep.cols,rep.rows);
  const rows=rep.rows.concat([{k:"gap"},footRow()]);
  const h=R.M+rows.reduce((s,r)=>s+rowH(r),0)+R.M;
  const [c,ctx]=newCanvas(h); drawRows(ctx,rep.cols,pos,rows,R.M); return c;
}
// A4 pages; a long table continues on the next page with its header repeated
function renderPages(rep){
  // a month that is only a bit longer than a page is shrunk to fit on one page instead of spilling a few lines over
  const tall=renderTall(rep);
  if(tall.height<=R.PAGE_H) { const [c,ctx]=newCanvas(R.PAGE_H); ctx.drawImage(tall,0,0); return [c]; }
  if(tall.height<=R.PAGE_H*1.35){
    const [c,ctx]=newCanvas(R.PAGE_H), k=R.PAGE_H/tall.height, w=R.W*k;
    ctx.imageSmoothingQuality="high"; ctx.drawImage(tall,(R.W-w)/2,0,w,R.PAGE_H); return [c];
  }
  const [,m]=newCanvas(1); const pos=layoutCols(m,rep.cols,rep.rows);
  const maxY=R.PAGE_H-R.M-rowH({k:"foot"}), pages=[]; let page=[], y=R.M, lastHead=null;
  const flush=()=>{ const [c,ctx]=newCanvas(R.PAGE_H); drawRows(ctx,rep.cols,pos,page.concat([footRow()]),R.M); pages.push(c); page=[]; y=R.M; };
  rep.rows.forEach((r,i)=>{
    if(r.k==="head") lastHead=r;
    const nextH=r.k==="head"?rowH(r)+rowH({k:"row"}):rowH(r);   // never leave a header alone at the bottom
    if(y+nextH>maxY && page.length){ flush(); if(r.k!=="head"&&lastHead&&(r.k==="row"||r.k==="total")){ page.push(lastHead); y+=rowH(lastHead); } }
    if(!(r.k==="gap"&&!page.length)){ page.push(r); y+=rowH(r); }
  });
  if(page.length) flush();
  return pages;
}
const canvasBlob=(c,q)=>new Promise(res=>c.toBlob(res,"image/jpeg",q||.92));
async function buildImageFiles(months,opt){
  try{ await document.fonts.ready; }catch(e){}
  const files=[];
  for(const ym of months){ const rep=monthReport(ym,opt); files.push(new File([await canvasBlob(renderTall(rep))],"הוצאות הילדים - "+rep.name+".jpg",{type:"image/jpeg"})); }
  return files;
}
async function buildPdfFile(months,opt,flat){
  try{ await document.fonts.ready; }catch(e){}
  await loadJsPDF();
  const doc=new window.jspdf.jsPDF({unit:"mm",format:"a4",compress:true}); let first=true;
  const reps=months.map(ym=>monthReport(ym,opt)); if(flat) reps.push(allReport(months));
  for(const rep of reps) for(const c of renderPages(rep)){
    if(!first) doc.addPage(); first=false;
    doc.addImage(c.toDataURL("image/jpeg",.92),"JPEG",0,0,210,297,undefined,"FAST");
  }
  const [y,m]=months[months.length-1].split("-").map(Number);
  const name=months.length===1?"הוצאות הילדים - "+MONTHS[m-1]+" "+y+".pdf":"הוצאות הילדים.pdf";
  return new File([doc.output("blob")],name,{type:"application/pdf"});
}
function downloadFile(f){
  const a=document.createElement("a"); a.href=URL.createObjectURL(f); a.download=f.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}

const xFmt=()=>(document.querySelector("#xFmt button[aria-pressed=true]")||{dataset:{v:"xlsx"}}).dataset.v;
function updXFmt(){
  const f=xFmt(); setSeg("xFmt",f);
  $("xFlatRow").hidden=f==="jpeg";
  $("xMonthsHint").textContent=f==="xlsx"?"(כל חודש בגיליון נפרד)":f==="pdf"?"(כל חודש בעמוד נפרד)":"(כל חודש בתמונה נפרדת)";
  $("xShare").hidden=!(f!=="xlsx" && navigator.share && navigator.canShare);
  if(f==="pdf") loadJsPDF().catch(()=>{});
}
$("xFmt").addEventListener("click",ev=>{ const b=ev.target.closest("button"); if(!b) return; setSeg("xFmt",b.dataset.v); updXFmt(); });
async function makeExport(){
  const months=[...document.querySelectorAll("#xMonths input:checked")].map(c=>c.value).sort();
  if(!months.length){ $("xErr").textContent="יש לבחור לפחות חודש אחד."; return null; }
  const opt={date:$("xDate").checked,cat:$("xCat").checked,kid:$("xKid").checked&&S.kidsOk,notes:$("xNotes").checked};
  const f=xFmt();
  if(f==="jpeg") return buildImageFiles(months,opt);
  if(f==="pdf") return [await buildPdfFile(months,opt,$("xFlat").checked)];
  await loadExcelJS();
  const wb=new ExcelJS.Workbook(); wb.creator="חצי חצי";
  months.forEach(ym=>buildMonthSheet(wb,ym,opt));
  if($("xFlat").checked) buildAllSheet(wb,months);
  const idx=Math.max(0,months.indexOf(S.month));
  wb.views=[{activeTab:idx,firstSheet:0,visibility:"visible"}];
  const buf=await wb.xlsx.writeBuffer();
  const [y,m]=months[months.length-1].split("-").map(Number);
  return [new File([buf],months.length===1?"הוצאות הילדים - "+MONTHS[m-1]+" "+y+".xlsx":"הוצאות הילדים.xlsx",
    {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})];
}
async function runExport(share){
  const btns=[$("xGo"),$("xShare")]; btns.forEach(b=>b.disabled=true); $("xErr").textContent="";
  try{
    const files=await makeExport();
    if(files){
      if(share && navigator.canShare && navigator.canShare({files})){
        try{ await navigator.share({files,title:"הוצאות הילדים"}); closeSheets(); }
        catch(e){ if(e&&e.name==="AbortError"){} else { files.forEach((f,i)=>setTimeout(()=>downloadFile(f),i*400)); closeSheets(); } }
      } else { files.forEach((f,i)=>setTimeout(()=>downloadFile(f),i*400)); closeSheets(); }
    }
  }catch(e){ $("xErr").textContent=navigator.onLine?"יצירת הקובץ נכשלה.":"צריך חיבור לאינטרנט ליצירת הקובץ."; }
  btns.forEach(b=>b.disabled=false);
}
$("xGo").onclick=()=>runExport(false);
$("xShare").onclick=()=>runExport(true);

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
          kids: type==="transfer"||I("ילד")<0?null:parseKids(row[I("ילד")]),
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
        const id=c.indexOf("תאריך"), ic=c.indexOf("קטגוריה"), ik=c.indexOf("ילד");
        const idesc=c.findIndex((v,i)=>v && ![ib,ia,id,ic,ik].includes(i));
        sec={type,ib,ia,id,ic,ik,idesc:idesc>=0?idesc:0}; continue;
      }
      if(!sec) continue;
      const desc=c[sec.idesc];
      if(/^(סיכום|יתרה)/.test(desc)){ sec=null; continue; }
      if(!desc || /^(סה.?.?כ|חישוב)/.test(desc)) continue;
      for(const [p,i] of [["b",sec.ib],["a",sec.ia]]){
        const n=toNum(row[i]); if(!n||isNaN(n)) continue;
        out.push({type:sec.type,payer:p,amount:Math.round(Math.abs(n)*100)/100,
          description: sec.type==="transfer"?"":desc, category: sec.ic>=0?c[sec.ic]:"",
          kids: sec.type==="transfer"||sec.ik<0?null:parseKids(c[sec.ik]),
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
    if(r.type!=="transfer" && !(r.kids&&r.kids.length)) r.kids=detectKids(r.description);
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
      d.textContent=(r.type==="transfer"?transferText(r):r.description||"")+(r.type==="income"?" (הכנסה)":"")+(S.kidsOk&&r.kids&&r.kids.length?" · "+kidsText(r.kids):"")+(r.dup?" · קיים כבר":"");
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
  try{ await makeSnapshot("before-import"); }catch(e){}
  const t0=Date.now();
  const rows=sel.map((r,i)=>withKids({user_id:S.user.id,type:r.type,payer:r.payer,amount:r.amount,date:r.date,description:r.description||"",category:r.category||"",created_at:new Date(t0+i*1000).toISOString()},r.kids||[]));
  const {data:ins,error}=await sb.from(T_ENT).insert(rows).select();
  if(error){ $("iErr").textContent="הייבוא נכשל. בדוק את החיבור ונסה שוב."; btn.disabled=false; return; }
  syncEntries(ins);
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
  ["aLogin","aSignup","aForgot","aGoogle"].forEach(id=>$(id).disabled=true);
  return;
}
sb.auth.onAuthStateChange((ev,session)=>{
  if(ev==="PASSWORD_RECOVERY") openPassword(false);
  setUser(session ? session.user : null);
});
sb.auth.getSession().then(({data})=>setUser(data.session?data.session.user:null)).catch(()=>show("auth"));
})();

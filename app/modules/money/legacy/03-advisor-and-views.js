/* KP Money Planner, moved over unchanged. Tidied into typed modules later in Milestone 2. */
/* ===================== Advisor ===================== */
const prof = () => byId("settings","profile") || {id:"profile"};
const advCheck = () => byId("settings","advcheck") || {id:"advcheck"};
const ADV_IC=`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.3l5-.7z"/></svg>`;
const ADV_Q=[["Full health check","Do a full financial health check of my situation across every area."],["Prepay a loan or invest?","Should I prepay any of my loans or keep investing? Which loan first, if any?"],["Am I insured enough?","Is my term, health and accident cover enough for my income, dependents and loans?"],["Tax saving this year","How can I save tax this financial year with what I already have? What's still unused?"],["Ready for property payments?","Am I ready for my upcoming property payments and loan? What do I need and when?"],["Retirement on track?","Is my retirement on track for the age and income in my profile?"],["Child education plan","Am I on track for the child education goal? What should I put aside each month?"],["Close loans faster?","How can I close my loans faster without hurting my other goals?"]];
let advBusy=null;
function advButton(){ const c=advCheck(), now=ymOf(today()), ready=c.ym===now && c.quick;
  return `<button type="button" class="advbtn" data-go="advisor"><span class="advic">${ADV_IC}</span><span class="advt"><b>Ask your advisor</b><span>${ready?`${MN[+now.slice(5)-1]} check-up ready · ${esc((c.quick.verdict||"").slice(0,70))}`:"Checks your whole picture: cash, loans, insurance, investments, tax, goals"}</span></span><span class="raa">›</span></button>`; }

/* ---- what the advisor sees ---- */
const scrub = s => String(s||"").replace(/\d{6,}/g,"…").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g,"[email]").replace(/\b[\w.-]+@[a-z]{2,}\b/gi,"[upi]").replace(/\s+/g," ").trim();
function advContext(){
  const P=prof(), now=ymOf(today()), td=today(), r0=n=>Math.round(+n||0), L=[], wc=P.wifeCat;
  const from=addM(now,-23)+"-01";
  L.push(`TODAY ${td}. All amounts in ₹. Only KP's own finances are planned. ${wc?`Income in category "${catName(wc)}" is money KP's wife sends occasionally: treat it as a bonus, never rely on it.`:""}`);
  /* profile */
  const g=(k,l)=>{ const v=P[k]; if(v==null||v===""||(Array.isArray(v)&&!v.length)) return null; return `${l}: ${/^(termCover|termPrem|healthSum|healthPrem|topup|empHealth|accident|groupTerm)$/.test(k)&&+v>0?money(+v):Array.isArray(v)?v.join(", "):v}`; };
  const fam=family(); L.push("Family: "+fam.map(m=>`${m.n}${m.age!=null?` (${m.age})`:""}`).join(", ")+"; health cover includes: "+((P.covered||[]).map(k=>(fam.find(m=>m.k===k)||{}).n).filter(Boolean).join(", ")||"not said"));
  L.push("", "PROFILE (as filled in by KP; blank = unknown, ask if it matters):", ...[g("age","Age"),g("dob","Date of birth"),g("retire","Plans to retire at"),g("deps","Dependents"),g("job","Job stability"),g("risk","Risk appetite"),g("salary","Take-home salary per month"),g("bonus","Bonus"),g("regime","Tax regime"),
    g("termCover","Term cover"),g("termUntil","Term cover until age"),g("termPrem","Term premium"),g("healthSum","Health sum insured"),g("healthType","Health cover type"),g("healthPrem","Health premium a year"),g("topup","Health top-up"),g("empHealth","Employer health cover"),g("parents","Parents have health cover"),g("accident","Personal accident cover"),g("groupTerm","Employer group term"),
    g("assets","Assets outside the app"),g("nominees","Nominees updated"),g("will","Has a will"),g("estateNote","Estate note")].filter(Boolean));
  { const GL=live("goals").slice().sort((a,b)=>(+a.pri||99)-(+b.pri||99)); if(GL.length){ L.push("GOALS (priority order, with the app's own working):"); GL.forEach((x,i)=>{ const r=smartGoal(x); L.push(`${i+1}. ${x.name} [${GOAL_KINDS[x.kind||"custom"]}]: ${r.sub}; ${r.rows.map(([a,b])=>a+" "+b).join(", ")}; ${r.msg}`); }); } }
  L.push(`Emergency fund basis: ${emMonths()} months of average monthly spending (${money(emBase())}, last 12 months, excluding ${[...emExcluded()].map(catLbl).join(", ")||"nothing"}).`);
  const pu=P.propUse||{}; const pl=live("props").map(p=>pu[p.id]?`${p.name}: ${pu[p.id]}`:null).filter(Boolean); if(pl.length) L.push("Property use: "+pl.join("; "));
  /* months */
  L.push("", "MONTHS (income | expenses | invested | set aside for big bills | balance):");
  for(let i=23;i>=0;i--){ const m=addM(now,-i), f=monthFigures(m); L.push(`${m}${m===now?" (part-way: actual + still due)":""}: ${r0(f.income)} | ${r0(f.expense)} | ${r0(f.investment)} | ${r0(f.setAside)} | ${r0(f.balance)}`); }
  const yrs=new Map(); for(const t of live("txns")) if(t.date<from && ["income","expense","investment"].includes(t.type) && !offBook(t)){ const y=t.date.slice(0,4), o=yrs.get(y)||{income:0,expense:0,investment:0}; o[t.type]+=+t.amount||0; yrs.set(y,o); }
  if(yrs.size){ L.push("", "EARLIER YEARS (income | expenses | invested):"); [...yrs.entries()].sort().forEach(([y,o])=>L.push(`${y}: ${r0(o.income)} | ${r0(o.expense)} | ${r0(o.investment)}`)); }
  /* accounts */
  const bal=balances(); L.push("", "ACCOUNTS TODAY:");
  for(const a of live("accounts").filter(a=>!a.hidden)){ if(a.type==="card"){ const c=cardInfo(a); L.push(`${a.name} (credit card): bill due ${r0(c?c.dueLeft:0)}${c&&c.due?` by ${c.due}`:""}, unbilled ${r0(c?c.unbilled:0)}`); } else L.push(`${a.name} (${a.type||"bank"}): ${r0(bal.get(a.id))}${a.main?" · main account":""}${a.reserve?" · holds big-bills reserve + emergency fund":""}${+a.minBal?` · keeps ${r0(a.minBal)}`:""}`); }
  const st=reserveState(); if(st.a) L.push(`Reserve in ${st.a.name}: big bills ${r0(st.held)} of ${r0(st.target)} needed · put aside ${r0(st.monthly)} this month (still to do ${r0(st.setAside)}) · emergency fund ${r0(st.emergency)}${st.emTarget?` (target ${r0(st.emTarget)})`:""}`);
  /* investments */
  L.push("", "INVESTMENTS (type · name · platform: value, invested, gain %):");
  for(const h of live("holdings").filter(h=>!h.closed)){ const x=holdingSum(h); if(!(x.value>0.5||x.inv>0.5)) continue;
    L.push(`${h.type} · ${h.name}${h.platform?` · ${h.platform}`:""}: ${r0(x.value)}, ${r0(x.inv)}, ${x.inv>0?(x.gain/x.inv*100).toFixed(1):"0"}%${x.isUsd?` (US$ ${(+x.usdValue).toFixed(0)} at ₹${h.fx})`:""}${x.asOf?` · as of ${x.asOf}`:""}${h.nps&&h.nps.choice?` · ${h.nps.choice}`:""}`); }
  /* loans */
  L.push("", "LOANS:");
  for(const l of live("loans")){ const x=loanSum(l); if(!(x.out>0.5)) continue; L.push(`${l.name}${l.lender?` (${l.lender})`:""}: owes ${r0(x.out)}, ${x.rateNow?x.rateNow+"%":"interest-free"}${x.emiNow?`, EMI ${r0(x.emiNow)}`:""}${x.end?`, ends ${x.end}`:""}${l.note?` · ${scrub(l.note).slice(0,60)}`:""}`); }
  /* properties */
  for(const p of live("props")){ const c=propCalc(p), nums=Object.entries(c).filter(([k,v])=>typeof v==="number"&&Math.abs(v)>0.5).slice(0,14).map(([k,v])=>`${k} ${r0(v)}`).join(", ");
    L.push("", `PROPERTY ${p.name} (${p.status||""}${p.value?`, agreement value ${r0(p.value)}`:""}): ${nums}`);
    const due=(p.plan||[]).filter(r=>!r.done); if(due.length) L.push("Still to pay: "+due.map(r=>`${r.name} ${r0(r.amt)}${r.when?` (${r.when})`:""}${r.who&&r.who!=="split"?` [${r.who==="bank"?"bank pays":"KP pays"}]`:""}`).join("; "));
    if(p.fund) L.push(`Funding plan: bank lends ${p.fund.ltv}%${p.fund.by?`, KP's share ready by ${p.fund.by}`:""}`); }
  /* plan */
  L.push("", "REGULAR ITEMS (name: amount type freq, next due):");
  for(const r of live("recurring").filter(r=>!r.end||r.end>=now)) L.push(`${r.name}: ${r0(r.amount)} ${r.type}${r.budget?" budget":""} ${r.freq}${r.auto?" auto":""}${(FREQ[r.freq]||1)>=2?`, next ${recNextLbl(r)}`:""}`);
  const R=readiness(45); if(R.length) L.push("", "SHORTFALLS NEXT 45 DAYS: "+R.map(s=>`${s.acc.name} short ${r0(s.need)} on ${s.date} (${s.item.name})`).join("; "));
  /* transactions */
  L.push("", "TRANSACTIONS, last 24 months (date|type|amount|category|account|note):");
  const tx=live("txns").filter(t=>t.date>=from && t.type!=="carry").sort((a,b)=>a.date.localeCompare(b.date));
  for(const t of tx){ const cat=t.type==="transfer"?`→ ${accName(t.toAccountId)}`:t.type==="investment"?(t.instrument||""):catName(t.categoryId);
    L.push(`${t.date}|${t.type}|${r0(t.amount)}|${scrub(cat)}|${accName(t.accountId)}|${scrub(t.note).slice(0,50)}${t.pot==="reserve"?" [from reserve]":""}${t.hist?" [already in balances]":""}`); }
  return L.join("\n");
}
const ADV_RULES = ctx => `You are KP's personal financial planner in India. Think like a careful, independent (fee-only) certified planner and check every angle that matters for the question:
cash flow and readiness for upcoming payments; emergency fund; debt (interest rates, prepay vs invest, family loans that are interest-free); insurance adequacy (term cover vs income, dependents and loans; health cover incl. super top-up and parents; accident); investments (asset mix vs risk appetite and goals, concentration, leveraged ETFs, costs, overlap; US assets need Schedule FA in the ITR and LRS/TCS rules); tax (old vs new regime, 80C, 80D, 80CCD(1B), 24(b), using the ₹1.25 lakh yearly LTCG exemption, capital gains); property commitments; goals (retirement, child education, closing loans); estate (nominees, will).
Rules: use ONLY the data below and say when you assume something (default assumptions unless the profile says otherwise: inflation 6%, equity 11%, debt 7%). If something important is missing, say exactly what and ask at most 2 questions. Show the numbers behind each point. Money from the wife's category is occasional: never rely on it. Don't push new products for their own sake; you may compare fund types and the funds KP already holds. Use Indian formats (₹, lakh, crore). Never mention that you are an AI or add disclaimers.

DATA:
${ctx}`;
const ADV_QUICK = q => `${q}

Answer format: line 1 is the answer as one bold sentence (**...**). Then at most 3 points, each on its own line starting "1. ", "2. ", "3. ", one or two sentences each with specific ₹ figures from the data. No headings, no preamble, under 130 words.`;
const ADV_DEEP = `Go deeper. Give the full analysis: a "## " heading for each area that matters here, the numbers and your workings, trade-offs and risks, and end with "## What to do" as a numbered list in priority order with amounts and dates.`;
const ADV_WHAT = `What would change this advice? List the 3–5 facts or events (with thresholds in ₹ or dates where possible) that would flip or change your recommendation, and what you'd advise then. Same short format: numbered lines, no headings.`;
const ADV_CHECK = `Write my monthly financial check-up for ${mLabel(ymOf(today()))}.
Format exactly:
VERDICT: one short sentence.
Then exactly 3 lines, each starting "OK: " (on track) or "ACT: " (needs action), one sentence each with ₹ figures and dates.
Then a line with only "---".
Then the full check-up: a "## " heading per area (cash flow & readiness, reserve & emergency, loans, insurance, investments, tax, goals, anything else worth flagging), and end with "## This month" as a numbered to-do list.`;
const advFmt = t => esc(t).split("\n").map(l=>{ const b=x=>x.replace(/\*\*(.+?)\*\*/g,"<b>$1</b>");
  if(/^\s*#{2,3}\s+/.test(l)) return `<h4 class="advh">${b(l.replace(/^\s*#{2,3}\s+/,""))}</h4>`;
  let m=l.match(/^\s*(\d+)[.)]\s+(.*)/); if(m) return `<div class="advl"><span class="mk n">${m[1]}</span><span>${b(m[2])}</span></div>`;
  if(/^\s*[-•]\s+/.test(l)) return `<div class="advl"><span class="mk d">•</span><span>${b(l.replace(/^\s*[-•]\s+/,""))}</span></div>`;
  return l.trim()?`<p>${b(l)}</p>`:""; }).join("");
async function advCall(turns, onText, signal){
  const ask=aiFn(); if(!ask) throw {code:"none", message:"The advisor needs the Claude version, or Ask Claude set up in the hosted app."};
  return ask(turns, {cache:false, signal, onText, modelTier:"complex"});
}
async function advAsk(q, label, kind){
  if(advBusy || !aiFn()) return;
  const chat=S.advChat=S.advChat||[];
  while(chat.length && chat[chat.length-1].role!=="assistant") chat.pop();
  const content = chat.length ? q : ADV_RULES(advContext())+"\n\nQUESTION: "+ADV_QUICK(q);
  const turns=[...chat.map(m=>({role:m.role, content:m.content})), {role:"user", content}];
  chat.push({role:"user", content, q:label||q, kind}); advBusy={text:"", ctl:new AbortController()}; render();
  try{ const {text}=await advCall(turns, ({text})=>{ if(!advBusy) return; advBusy.text=text; const el=document.getElementById("advLive"); if(el) el.innerHTML=advFmt(text); }, advBusy.ctl.signal);
    if(String(text||"").trim()) chat.push({role:"assistant", content:text}); else { chat.pop(); toast("No answer came back. Try again."); } }
  catch(e){ const keep=(e&&e.text)||""; if(keep) chat.push({role:"assistant", content:keep}); else chat.pop(); if(!(e&&e.code==="cancelled")) toast((e&&e.message&&e.message!==e.code)?e.message:"Couldn't get an answer ("+((e&&e.code)||"error")+")."); }
  advBusy=null; render();
}
/* monthly check-up: written once a month, the first time the app opens on or after the 1st */
let advCheckRunning=false;
async function advRunCheck(force){
  const now=ymOf(today()), c=advCheck(); if(advCheckRunning || !aiFn() || (!force && c.ym===now)) return;
  if(!force && c.triedOn===today()) return;
  advCheckRunning=true; upsert("settings",{...c, triedOn:today()}); if(S.view==="advisor") render();
  try{ const {text}=await advCall([{role:"user", content:ADV_RULES(advContext())+"\n\nQUESTION: "+ADV_CHECK}], null);
    const [top, ...rest]=String(text||"").split(/\n\s*---\s*\n/), lines=top.split("\n").map(s=>s.trim()).filter(Boolean);
    const verdict=(lines.find(l=>/^VERDICT:/i.test(l))||lines[0]||"").replace(/^VERDICT:\s*/i,"").replace(/\*\*/g,"");
    const pts=lines.filter(l=>/^(OK|ACT):/i.test(l)).slice(0,3).map(l=>({ok:/^OK/i.test(l), t:l.replace(/^(OK|ACT):\s*/i,"").replace(/\*\*/g,"")}));
    if(verdict) upsert("settings",{...advCheck(), ym:now, at:today(), quick:{verdict, pts}, full:rest.join("\n---\n").trim()||text});
  }catch(e){ if(S.view==="advisor") toast("Couldn't write this month's check-up: "+((e&&e.message)||"try again later")); }
  advCheckRunning=false; if(S.view==="advisor"||S.view==="home") render();
}
function advCheckCard(){
  const c=advCheck(), now=ymOf(today()), on=!!aiFn();
  if(c.ym!==now) return `<div class="card advm"><div class="advmh"><span class="chip">Monthly check-up · ${mLabel(now)}</span></div>
    <p class="note" style="margin:6px 0">${advCheckRunning?"Writing this month's check-up…":on?"Not written yet for this month.":"Needs the Claude version, or Ask Claude set up in the hosted app."}</p>
    ${on&&!advCheckRunning?'<button class="btn sm pri" type="button" id="advCk">Write it now</button>':""}</div>`;
  return `<div class="card advm"><div class="advmh"><span class="chip">Monthly check-up · ${mLabel(c.ym)}</span><span class="note" style="margin:0">written ${dLabel(c.at)}</span></div>
    <div class="advq"><b>${esc(c.quick.verdict)}</b></div>
    ${(c.quick.pts||[]).map(p=>`<div class="advl"><span class="mk ${p.ok?"ok":"warn"}">${p.ok?"✓":"!"}</span><span>${esc(p.t)}</span></div>`).join("")}
    <div class="btns" style="margin-top:10px"><button class="btn sm" type="button" id="advFull">Open full check-up ›</button>${on?`<button class="btn sm" type="button" id="advCk">${advCheckRunning?"Writing…":"Write again"}</button>`:""}</div></div>`;
}
function vAdvisor(){
  const on=!!aiFn(), chat=S.advChat||[], P=prof(), last=chat.length?chat[chat.length-1]:null;
  const stale=P.updated && today().slice(5)>="04-01" && P.updated<today().slice(0,4)+"-04-01";
  const thread=chat.map((m,i)=>m.role==="user"?`<div class="advu">${esc(m.q||m.content)}</div>`:`<div class="adva">${chat[i-1]&&!chat[i-1].kind?'<div class="advtag">Quick answer</div>':""}${advFmt(m.content)}</div>`).join("");
  return `<p class="note" style="margin:6px 0 12px">Looks at your last 24 months of transactions, holdings, loans, property plans, insurance and your profile. Not a SEBI-registered adviser; check before acting.</p>
  ${!P.updated?`<div class="rdyal" style="cursor:default;background:var(--warn-soft)"><span class="ra1" style="color:var(--warn)">Fill in your profile for better advice</span><span class="ra2">Age, tax regime, insurance and goals change most answers. <a href="#" data-go="more">Open Settings › My profile</a></span></div>`:stale?`<div class="rdyal" style="cursor:default;background:var(--warn-soft)"><span class="ra1" style="color:var(--warn)">Time for the yearly profile review</span><span class="ra2">Last updated ${dFull(P.updated)}. <a href="#" data-go="more">Review it</a></span></div>`:""}
  ${advCheckCard()}
  <div class="sh"><h3>Ask about</h3></div><div class="pills advpills">${ADV_Q.map(([l],i)=>`<button type="button" data-advq="${i}" ${advBusy||!on?"disabled":""}>${l}</button>`).join("")}</div>
  ${chat.length||advBusy?`<div class="card advchat">${thread}${advBusy?`<div class="adva" id="advLive">${advBusy.text?advFmt(advBusy.text):'<span class="note">Looking through everything…</span>'}</div>`:""}
    ${last&&last.role==="assistant"&&!advBusy?`<div class="btns" style="margin-top:12px"><button class="btn sm pri" type="button" id="advDeep">Go deeper</button><button class="btn sm" type="button" id="advWhat">What would change this?</button></div>`:""}
    ${advBusy?'<div class="btns" style="margin-top:8px"><button class="btn sm" type="button" id="advStop">Stop</button></div>':""}</div>`:""}
  ${on?`<div class="txsearch" style="margin-top:12px"><input type="text" id="advIn" placeholder="${chat.length?"Ask a follow-up":"Or ask anything about your money"}" autocomplete="off" aria-label="Ask your advisor"><button class="btn sm pri" type="button" id="advGo" ${advBusy?"disabled":""}>Ask</button></div>
    ${chat.length&&!advBusy?'<div class="btns" style="margin-top:6px"><button class="btn sm" type="button" id="advNew">New chat</button></div>':""}`
   :`<p class="cnote">The advisor needs the Claude version of the planner, or Ask Claude set up in the hosted app (README › Ask Claude).</p>`}
  <p class="note">${P.updated?`Profile updated ${dFull(P.updated)} · `:""}<a href="#" data-go="more">Edit profile</a>. This chat is cleared when you close the app.</p>`;
}
document.addEventListener("click", e=>{
  const b=e.target.closest("[data-advq],#advGo,#advStop,#advNew,#advDeep,#advWhat,#advCk,#advFull"); if(!b || b.closest("#modal")) return;
  if(b.dataset.advq!==undefined){ const [l,q]=ADV_Q[+b.dataset.advq]; S.advChat=[]; return advAsk(q,l); }
  if(b.id==="advGo"){ const v=($("#advIn")||{}).value; if(v&&v.trim()){ if(!(S.advChat||[]).length) return advAsk(v.trim()); return advAsk(v.trim()+"\n\n(Keep the short format: one bold sentence, then at most 3 numbered points.)", v.trim(), "f"); } return; }
  if(b.id==="advStop"){ if(advBusy) advBusy.ctl.abort(); return; }
  if(b.id==="advNew"){ S.advChat=[]; return render(); }
  if(b.id==="advDeep") return advAsk(ADV_DEEP,"Go deeper","d");
  if(b.id==="advWhat") return advAsk(ADV_WHAT,"What would change this?","w");
  if(b.id==="advCk") return advRunCheck(true);
  if(b.id==="advFull"){ const c=advCheck(); return openSheet(`Check-up · ${mLabel(c.ym)}`, `<div class="adva">${advFmt(c.full||"")}</div><div class="btns"><button class="btn" id="cx" type="button">Close</button></div>`, s=>{ s.querySelector("#cx").onclick=closeModal; }); }
});
document.addEventListener("keydown", e=>{ if(e.key==="Enter" && e.target && e.target.id==="advIn"){ e.preventDefault(); const g=$("#advGo"); if(g) g.click(); } });

/* ---- My profile (Settings) ---- */
const PROF_SECS=[["about","About me"],["income","Income & tax"],["ins","Insurance"],["goals","Goals"],["prop","Property use"],["assets","Assets outside the app"],["estate","Nominees & will"]];
function profSub(k, P){ const j=a=>a.filter(Boolean).join(" · ");
  if(k==="about"){ const F=family(); return j([myAge()!=null&&`Age ${myAge()}`, P.retire&&`retire at ${P.retire}`, F.length>1&&F.slice(1).map(m=>m.n+(m.age!=null?` (${m.age})`:"")).join(", "), P.risk&&`${P.risk} risk`]); }
  if(k==="income") return j([P.salary&&`${money(+P.salary)} a month`, P.regime&&`${P.regime} regime`, P.wifeCat&&`wife: ${catName(P.wifeCat)}`]);
  if(k==="ins") return j([+P.termCover>0&&`term ${shortAmt(+P.termCover)}`, +P.healthSum>0&&`health ${shortAmt(+P.healthSum)}`]);
  if(k==="goals") return live("goals").slice().sort((a,b)=>(+a.pri||99)-(+b.pri||99)).map(g=>g.name).join(" · ")+" › in Plan";
  if(k==="prop") return j(live("props").map(p=>(P.propUse||{})[p.id]&&`${p.name}: ${(P.propUse||{})[p.id]}`));
  if(k==="assets") return (P.assets||"").slice(0,60);
  if(k==="estate") return j([P.nominees&&`nominees ${P.nominees.toLowerCase()}`, P.will&&`will: ${P.will.toLowerCase()}`]);
  return ""; }
function profileSection(){ const P=prof();
  return `<h2>My profile for the advisor<span class="sp"></span>${P.updated?`<span class="chip">Updated ${dLabel(P.updated)}</span>`:""}</h2>
  <div class="list">${PROF_SECS.map(([k,l])=>{ const s=profSub(k,P); return `<div class="row tap" data-prof="${k}" role="button" tabindex="0"><div class="main"><div class="t">${l}</div><div class="s">${esc(s)||'<span class="mut">Not filled in</span>'}</div></div><div class="amt mut">›</div></div>`; }).join("")}</div>
  <p class="note">Used only for advisor answers, never for account numbers, PAN or PRAN. A reminder to review it shows every April.</p>`; }
function profSave(o){ upsert("settings",{...prof(), ...o, updated:today()}); toast("Saved"); }
function profForm(k){
  const P=prof(), sel=(id,l,opts,v,h)=>field([id,l,"select",{value:v||"",options:[["","—"],...opts.map(o=>[o,o])],hint:h}]), txt=(id,l,v,h,ph)=>field([id,l,"text",{value:v||"",hint:h,ph}]);
  const save=(o)=>`<div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`;
  const done=(s,fn)=>{ s.querySelector("#cx").onclick=closeModal; s.querySelector("#sv").onclick=()=>{ const o=fn(); closeModal(); profSave(o); }; };
  if(k==="about"){ const kids=(P.kids||[]).map(c=>({...c, id:c.id||uid()})), dp=P.depends||{};
    const ageL=d=>{ const a=ageOf(d); return a==null?"":`${a} yrs`; };
    const kidRow=(c,i)=>`<div class="fam" data-kid="${i}" data-kidid="${esc(c.id||uid())}"><div class="r">${txt("kn"+i,"Child",c.name,"","e.g. Son")}${field(["kd"+i,"Date of birth","date",{value:c.dob||""}])}<span class="agep" data-agefor="f_kd${i}">${ageL(c.dob)}</span><button type="button" class="famx" data-kidx="${i}" aria-label="Remove this child">×</button></div></div>`;
    return openSheet("About me", `<div class="grid2">${field(["pdob","Your date of birth","date",{value:P.dob||""}])}<div class="f"><label>Age</label><div class="pfv" style="padding:12px 0;font-weight:700" data-agefor="f_pdob">${P.dob?ageL(P.dob):"—"}</div></div></div>
    ${field(["pr","Plan to retire at (age)","number",{value:P.retire||""}])}
    <div class="pfsec" style="padding-left:0">Family</div>
    <div class="fam"><div class="r">${txt("sn","Spouse",(P.spouse||{}).name,"","e.g. Wife")}${field(["sd","Date of birth","date",{value:(P.spouse||{}).dob||""}])}<span class="agep" data-agefor="f_sd">${ageL((P.spouse||{}).dob)}</span></div></div>
    <div id="kidRows">${kids.map(kidRow).join("")}</div>${kids.length?"":'<p class="note" style="margin:4px 0 8px">No children added.</p>'}<button class="btn sm" type="button" id="addKid">+ Add child</button>
    <div class="f" style="margin-top:12px"><label>Others who depend on you</label><div class="chk"><label><input type="checkbox" id="dpf" ${dp.father?"checked":""}> Father</label><label><input type="checkbox" id="dpm" ${dp.mother?"checked":""}> Mother</label><label><input type="checkbox" id="dpo" ${dp.other?"checked":""}> Other</label></div></div>
    ${txt("pd","Anything else about dependents",P.deps,"","e.g. parents depend on me partly")}
    ${sel("pj","Job stability",["Stable","Average","Uncertain"],P.job)}${sel("pk","Risk appetite",["Low","Medium","High"],P.risk,"How big a fall you can sit through without selling: low ≈ 10%, medium ≈ 25%, high ≈ 40%")}${save()}`,
    s=>{ let n=kids.length;
      s.addEventListener("input", e=>{ const t=e.target; if(t.type!=="date") return; const o=s.querySelector(`[data-agefor="${t.id}"]`); if(o) o.textContent=t.value?`${ageOf(t.value)} yrs`:"—"; });
      s.querySelector("#addKid").onclick=()=>{ const d=document.createElement("div"); d.innerHTML=kidRow({},n++); s.querySelector("#kidRows").appendChild(d.firstElementChild); const nn=s.querySelector("#kidRows + .note"); if(nn) nn.remove(); };
      s.addEventListener("click", e=>{ const x=e.target.closest("[data-kidx]"); if(x) x.closest(".fam").remove(); });
      done(s,()=>{ const ks=[]; s.querySelectorAll("#kidRows .fam").forEach(r=>{ const i=r.dataset.kid, nm=val("kn"+i), db=val("kd"+i); if(nm||db) ks.push({id:r.dataset.kidid, name:nm, dob:db}); });
        /* a removed child's education goal goes too */
        const keep=new Set(ks.map(c=>c.id)); for(const g of live("goals")) if(g.kind==="edu" && g.kidId && !keep.has(g.kidId)){ const x=byId("goals",g.id); x.deleted=true; stamp(x); }
        const dob=val("pdob"); return {dob, age:dob?String(ageOf(dob)):P.age, retire:val("pr"), spouse:{name:val("sn"), dob:val("sd")}, kids:ks, depends:{father:s.querySelector("#dpf").checked, mother:s.querySelector("#dpm").checked, other:s.querySelector("#dpo").checked}, deps:val("pd"), job:val("pj"), risk:val("pk")}; }); }); }
  if(k==="income"){ const sal=live("recurring").find(r=>r.type==="income"&&/salary/i.test(r.name)), cats=live("categories").filter(c=>c.kind==="income").sort((a,b)=>catName(a.id).localeCompare(catName(b.id)));
    return openSheet("Income & tax", `${field(["ps","Take-home salary a month (₹)","number",{value:P.salary||(sal?Math.round(sal.amount):""),hint:sal?`Your Salary regular item says ${money(sal.amount)}`:""}])}
    ${txt("pb","Bonus or other income",P.bonus,"","e.g. ₹1.5 lakh, usually in April")}
    ${sel("pg","Tax regime",["Old","New","Not sure"],P.regime,"Decides whether 80C, 80D and home-loan interest help you")}
    ${field(["pw","Money from wife is recorded under","select",{value:P.wifeCat||"__new",options:[["","Not recorded separately"],["__new","+ Create a \"From wife\" income category"],...cats.map(c=>[c.id,catName(c.id)])],hint:"Treated as occasional: the advisor never counts on it"}])}${save()}`,
    s=>done(s,()=>{ let w=val("pw"); if(w==="__new"){ const ex=live("categories").find(c=>c.kind==="income"&&/^from wife$/i.test(c.name)); if(ex) w=ex.id; else { w=uid(); put("categories",{id:w,name:"From wife",kind:"income"}); } } return {salary:val("ps"),bonus:val("pb"),regime:val("pg"),wifeCat:w||""}; })); }
  if(k==="ins"){ const F=family(), cov=new Set(P.covered||[]), num=(id,l,v,h)=>field([id,l,"number",{value:v||"",hint:h}]), sh=v=>+v>0?shortAmt(+v):"";
    return openSheet("Insurance", `<div class="pfsec" style="padding-left:0">Term life</div>
    ${num("it","Cover (₹)",P.termCover)}<div class="grid2">${field(["iu","Until age","number",{value:P.termUntil||""}])}${num("ip","Premium (₹ a year)",P.termPrem)}</div>
    <div class="pfsec" style="padding-left:0">Health</div>
    <div class="grid2">${num("ih","Sum insured (₹)",P.healthSum)}${sel("iy","Type",["Family floater","Individual","Both"],P.healthType)}</div>
    <div class="f"><label>Who's covered</label><div class="chk">${F.map(m=>`<label><input type="checkbox" class="icv" value="${m.k}" ${cov.has(m.k)?"checked":""}> ${esc(m.n)}${m.age!=null?` (${m.age})`:""}</label>`).join("")}</div>${F.length<2?'<div class="hint">Add your family in About me to pick them here.</div>':""}</div>
    <div class="grid2">${num("ihp","Premium (₹ a year)",P.healthPrem)}${num("io","Super top-up (₹)",P.topup,"Leave empty for none")}</div>
    ${num("ie","Employer health cover (₹)",P.empHealth,"Ends if you change jobs")}${sel("iq","Do your parents have their own health cover?",["Yes","No","Not sure"],P.parents)}
    <div class="pfsec" style="padding-left:0">Other</div><div class="grid2">${num("ia","Personal accident (₹)",P.accident)}${num("ig","Employer group term (₹)",P.groupTerm)}</div>${save()}`,
    s=>{
      done(s,()=>({termCover:val("it"),termUntil:val("iu"),termPrem:val("ip"),healthSum:val("ih"),healthType:val("iy"),covered:[...s.querySelectorAll(".icv:checked")].map(x=>x.value),healthPrem:val("ihp"),topup:val("io"),empHealth:val("ie"),parents:val("iq"),accident:val("ia"),groupTerm:val("ig")})); }); }
  if(k==="goals"){ S.planTab="goals"; return go("plan"); }
  if(k==="prop"){ const U=["Living in it","Rented out","Under construction","Vacant","Plan to sell"], ps=live("props");
    return openSheet("Property use", (ps.map(p=>sel("pu_"+p.id,p.name,U,(P.propUse||{})[p.id])).join("")||'<p class="note">No properties yet.</p>')+save(), s=>done(s,()=>({propUse:Object.fromEntries(ps.map(p=>[p.id,val("pu_"+p.id)]))}))); }
  if(k==="assets") return openSheet("Assets outside the app", `${field(["as","What else do you own?","textarea",{value:P.assets||"",hint:"e.g. 20 g physical gold, ₹2 lakh FD in SBI, land in Mysuru, ESOPs"}])}${save()}`, s=>done(s,()=>({assets:val("as")})));
  if(k==="estate") return openSheet("Nominees & will", `${sel("en","Nominees updated on bank, EPF, NPS, PPF, funds, demat, insurance",["All","Some","None","Not sure"],P.nominees)}${sel("ew","Do you have a will?",["Yes","No"],P.will)}${txt("ex","Note",P.estateNote,"","optional")}${save()}`, s=>done(s,()=>({nominees:val("en"),will:val("ew"),estateNote:val("ex")})));
}
document.addEventListener("click", e=>{ const r=e.target.closest("[data-prof]"); if(!r || r.closest("#modal")) return; profForm(r.dataset.prof); });

function vHome(){
  const now=ymOf(today()), cur=forecast(1).months[0], m=mainAcc(), bal=balances();
  const first = !live("txns").length && !live("recurring").length && !live("loans").length;
  /* hero: main account today and where the month ends */
  let hero="";
  if(m){ const on=id=>!id||id===m.id, isIn=r=>r.type==="income" || (r.type==="transfer" && r.toAccountId===m.id), pend=cur.rows.filter(r=>!r.paid && (r.type==="transfer" ? (r.accountId===m.id)!==(r.toAccountId===m.id) && (r.accountId===m.id||r.toAccountId===m.id) : on(r.accountId))), cb=bal.get(m.id)||0;
    /* this month's big-bills set-aside still to move counts as going out of the main account (or coming in, if the main account is the reserve) */
    const ra=reserveAcc(), sa=ra?reserveState().setAside:0, saOut=ra&&ra.id!==m.id?sa:0, saIn=ra&&ra.id===m.id?sa:0;
    const inS=pend.filter(isIn).reduce((x,r)=>x+r.amount,0)+saIn, outS=pend.filter(r=>!isIn(r)).reduce((x,r)=>x+r.amount,0)+saOut, end=cb+inS-outS;
    hero=`<div class="hero"><div class="lbl">${esc(m.name)} balance today</div><div class="big">${money(cb)}</div>
      <div class="hrow"><div><div class="k">Month-end balance</div><div class="hv">${money(end)}</div>${end<-0.5?`<span class="tagx">Short by ${money(-end)}</span>`:`<span class="tagx">On track</span>`}</div>
      <div class="flow">+${money(inS)} coming in<br>−${money(outS)} still due<br><button class="chg" type="button" id="pickMain">Change account</button></div></div></div>`; }
  const need=needsYou(), shown=need.slice(0,4);
  const needs=`<div class="sh"><h3>To confirm &amp; budgets</h3>${need.length>4?`<button class="lnk" type="button" data-go="plan">See all ${need.length} ›</button>`:""}</div>
    <div class="list">${shown.length?shown.map(x=>`<div class="need"><div class="main"><div class="t">${esc(x.t)}</div><div class="s">${esc(x.s)}</div></div><div class="side"><div class="amt">${money(x.a)}</div><div class="acts">${x.act}</div></div></div>`).join(""):'<div class="empty">Nothing needs you right now.</div>'}</div>`;
  const f=monthFigures(now), tree=expenseTree(now).slice(0,4), tot=f.expense||1;
  const snap=`<div class="sh"><h3>${MN[+now.slice(5)-1]} so far + due</h3><button class="lnk" type="button" data-ins="month">Details ›</button></div>
    <button class="snap" type="button" data-ins="month"><div class="g">
      <div><div class="k">Income</div><div class="v in">${money(f.income)}</div></div><div><div class="k">Spent</div><div class="v">${money(f.expense)}</div></div>
      <div><div class="k">Invested</div><div class="v">${money(f.investment)}</div></div><div><div class="k">Balance</div><div class="v ${f.balance<-0.5?"neg":""}">${money(f.balance)}</div></div></div>
      ${tree.length?`<div class="stack">${tree.map(([k,g],i)=>`<i style="flex:${g.total};background:${CC[i%5]}"></i>`).join("")}</div>
      <div class="legend">${tree.map(([k,g],i)=>`<span><i style="background:${CC[i%5]}"></i>${esc(g.name)} ${Math.round(g.total/tot*100)}%</span>`).join("")}</div>`:""}</button>`;
  const rec=live("txns").filter(t=>t.type!=="carry").sort((a,b)=>b.date.localeCompare(a.date)||(b.updatedAt-a.updatedAt)).slice(0,3);
  const recent=`<div class="sh"><h3>Recent</h3><button class="lnk" type="button" data-go="activity">All ›</button></div>
    <div class="list">${rec.length?rec.map(txLine).join(""):'<div class="empty">No transactions yet. Tap Add to record one.</div>'}</div>`;
  return `${first?`<div class="banner" style="margin-top:6px"><b>Start here.</b> Add your bank accounts and cards in Accounts › Banks &amp; cards, your salary, SIPs and bills in Plan › Regular, loans in Accounts › Loans, then record spending with Add.</div>`:""}
  ${advButton()}<div class="cols"><div>${payTueCard()}${shortAlert()}${investCard()}${renewalsSoon()}${hero}${needs}</div><div>${insightCards()}${recent}</div></div>`;
}
/* ---------- investments (holdings) ----------
   One holding per fund / stock / scheme. Invested = amount before you started + every investment entry with the same
   name. Value = units x latest price for market types (units = opening units + units on entries), else the balance you type. */
/* NPS tracked scheme by scheme (units x the official NAV of each); null when the NPS balance is typed in */
const npsLines = h => h.type==="NPS" && h.npsMode==="units" && Array.isArray(h.npsLines) && h.npsLines.length ? h.npsLines : null;
const holdingFor = name => { if(!name) return null; const k=String(name).trim().toLowerCase(); return live("holdings").find(h=>(h.instrument||h.name).trim().toLowerCase()===k) || null; };
function holdingSum(h){
  /* EPF with passbooks loaded: everything comes from the passbook (plus expected months), not from entries */
  if(h.type==="PPF" && h.ppf){ const p=ppfQuick(h); if(p){ const age=0;
    return {inv:p.inv, units:0, value:p.value, gain:p.value-p.inv, pct:p.inv>0?(p.value-p.inv)/p.inv*100:0, byUnits:false, asOf:today(), age, lastBuy:p.lastDep?p.lastDep.d:"", isUsd:false, usdValue:null, fxMissing:false, atCost:0, lines:null, ppf:p}; } }
  if(h.type==="EPF" && h.epf && h.epf.books){ const e=epfQuick(h); if(e){
    const asOf=e.expected.length || h.epf.expected!==false ? today() : e.lastCredit, age=asOf?Math.round((new Date(today()+"T00:00")-new Date(asOf+"T00:00"))/864e5):null;
    return {inv:e.inv, units:0, value:e.value, gain:e.value-e.inv, pct:e.inv>0?(e.value-e.inv)/e.inv*100:0, byUnits:false, asOf, age, lastBuy:e.lastCredit, isUsd:false, usdValue:null, fxMissing:false, atCost:0, lines:null, epf:e}; } }
  const k=(h.instrument||h.name).trim().toLowerCase();
  let inv=+h.openInvested||0, units=+h.openUnits||0, lastBuy="";
  const incl=h.inclTo || (h.history&&h.history[0]&&h.history[0].date) || "";
  const lines=npsLines(h), byUnits=UNIT_TYPES.includes(h.type), ua=(byUnits||lines) && h.unitsAsOf || "";
  /* entries after "units as of" that don't say how many units count at the amount paid, until you next update the units */
  let atCost=0;
  for(const t of live("txns")) if(t.type==="investment" && !isHist(t) && (t.instrument||"").trim().toLowerCase()===k && !(incl && t.date<=incl)){ inv+=invNet(t); units+=+t.units||0; if(t.date>lastBuy) lastBuy=t.date; if(ua && t.date>ua && !(+t.units>0)) atCost+=invNet(t); }
  const isUsd = h.type==="US Stocks" && h.ccy==="USD";
  const usdValue = isUsd ? units*(+h.price||0) : null;
  const linesValue = lines ? lines.reduce((a,l)=>a+(+l.units||0)*(+l.price||0),0) : 0;
  const value = (isUsd ? usdValue*(+h.fx||0) : byUnits ? units*(+h.price||0) : lines ? linesValue : (+h.value||0)) + atCost;
  const asOf = lines ? lines.reduce((m,l)=>!m||(l.priceDate&&l.priceDate<m)?l.priceDate||m:m,"") || null : byUnits ? h.priceDate : h.valueDate;
  const age = asOf ? Math.round((new Date(today()+"T00:00")-new Date(asOf+"T00:00"))/864e5) : null;
  return {inv, units, value, gain:value-inv, pct: inv>0 ? (value-inv)/inv*100 : 0, byUnits, asOf, age, lastBuy, isUsd, usdValue, fxMissing: isUsd && !(+h.fx>0), atCost, lines};
}
const usd = n => "$"+(+n||0).toLocaleString("en-US",{minimumFractionDigits:2, maximumFractionDigits:2});
/* Net worth as at the end of this month: the main account's month-end balance (same figure as on Home), card dues after
   this month's bills are paid, loans after this month's EMIs / repayments, and SIPs still to go counted as investments. */
function netWorth(){
  const bal=balances(), m=mainAcc(), now=ymOf(today()), nx=addM(now,1);
  const rows0=m ? forecast(1).months[0].rows.filter(r=>!r.paid) : [];
  const pend=rows0.filter(r=>r.type==="transfer" ? (r.accountId===m.id)!==(r.toAccountId===m.id) && (r.accountId===m.id||r.toAccountId===m.id) : (!r.accountId || r.accountId===m.id));
  const sum=f=>pend.filter(f).reduce((x,r)=>x+r.amount,0), isIn=r=>r.type==="income" || (r.type==="transfer" && r.toAccountId===m.id);
  const inS=sum(isIn), outS=sum(r=>!isIn(r));
  const bankNow=live("accounts").filter(a=>a.type!=="card" && countsAcc(a)).reduce((x,a)=>x+(bal.get(a.id)||0),0);
  /* other counted bank accounts also move by month-end: money moved to them from the main account, EMIs and bills paid from them */
  const other=id=>{ const a=id&&byId("accounts",id); return !!a && a.type!=="card" && countsAcc(a) && (!m || a.id!==m.id); };
  let otherMove=0; for(const r of rows0){ if(r.type==="transfer"){ if(other(r.toAccountId)) otherMove+=r.amount; if(other(r.accountId)) otherMove-=r.amount; } else if(other(r.accountId)) otherMove += r.type==="income" ? r.amount : -r.amount; }
  const mainNow=m ? (bal.get(m.id)||0) : 0, mainEnd=mainNow+inS-outS, banks=bankNow+mainEnd-mainNow+otherMove;
  const cardsNow=live("accounts").filter(a=>a.type==="card" && countsAcc(a)).reduce((x,a)=>x+Math.max(0,-(bal.get(a.id)||0)),0);
  const counted=r=>!r.accountId || (m && r.accountId===m.id) || other(r.accountId), sumAll=f=>rows0.filter(r=>f(r) && counted(r)).reduce((x,r)=>x+r.amount,0);
  const cards=Math.max(0, cardsNow-sumAll(r=>r.src==="c"));
  let loans=0; for(const l of live("loans")){ const x=loanSum(l); if(!x.out) continue;
    /* by month-end this month's EMI is done (paid by you, or by the relative if missed — that shows up as missed EMIs owed) */
    const bankDrop=x.b ? Math.max(0, bankOut(l,now)-bankOut(l,nx)) : 0;
    const famDrop=sumAll(r=>r.src==="p" && r.id===l.id);
    loans+=Math.max(0, x.out-bankDrop-famDrop); }
  const sipPend=sumAll(r=>r.type==="investment");
  let inv=sipPend, excluded=0, invested=sipPend; for(const h of live("holdings")){ const x=holdingSum(h); if(h.excludeNW) excluded+=x.value; else { inv+=x.value; invested+=x.inv; } }
  const pn=propNw();
  return {banks, mainAcc:m, mainEnd, otherBanks:banks-mainEnd, sipPend, inv, invested, excluded, prop:pn.on, propOff:pn.off, cards, loans, total: banks+inv+pn.on-cards-loans};
}
/* per-type labels on the investment form: schemes you hold only one of (EPF, PPF, NPS…) don't need a name or platform */
const ONE_OF=["EPF","PPF","NPS","Gold","Real estate"];
const HOLD_LBL={
  "EPF":{ph:"EPF", plat:null},
  "PPF":{ph:"PPF", plat:["Bank / post office (optional)","e.g. SBI, India Post"]},
  "NPS":{ph:"NPS", plat:["Provider (optional)","e.g. Protean, KFintech"]},
  "Gold":{ph:"e.g. Gullak gold", plat:["App (optional)","e.g. Gullak"]},
  "Real estate":{ph:"e.g. Plot at Kanakapura Road", plat:null}
};
const unitWord = (type, n) => type==="Gold" ? "g" : type==="US Stocks" ? (n===1?"share":"shares") : (n===1?"unit":"units");
const holdName = (name, type) => (name||"").trim() || (ONE_OF.includes(type) ? type : "");
function holdingForm(h={}){
  const isNew=!h.id; h={type:"Mutual Fund", ...h}; const x=isNew?null:holdingSum(h);
  const body=`
    ${field(["type","Type","select",{value:h.type,options:INV_TYPES.map(t=>[t,t])}])}
    <div class="grid2">${field(["name","Name","text",{value:h.name,ph:"e.g. Navi Nifty 50"}])}${field(["platform","Platform (optional)","text",{value:h.platform,ph:"e.g. Groww, Zerodha, INDmoney"}])}</div>
    ${field(["instrument","Matches entries named","text",{value:h.instrument||h.name||"",list:"instl2",hint:"SIPs and investment entries with this name add to this holding."}])}<datalist id="instl2">${instruments().map(i=>`<option value="${esc(i)}">`).join("")}</datalist>
    <div id="g_epfb"><p class="sect">EPF passbook</p><div class="note" id="epfSt" style="margin-top:0"></div>
      <div class="btns epfbtns"><label class="btn" for="f_epfPdf" tabindex="0" role="button">Load passbook PDFs</label><input type="file" id="f_epfPdf" accept="application/pdf,.pdf" multiple hidden><button type="button" class="btn" id="epfOpen">Open EPF page</button></div>
      <div id="g_epfset"><p class="sect">Projection</p><div class="grid2">${field(["epfRate","Interest rate (%)","number",{value:(h.epf&&h.epf.rate)??8.25,step:"0.01",hint:"8.25% for FY 2025-26"}])}${field(["epfRaise","Yearly raise in contribution (%)","number",{value:(h.epf&&h.epf.raise)??0,step:"0.5"}])}</div>
        <div class="grid2">${field(["epfAge","Retire at age","number",{value:(h.epf&&h.epf.retireAge)??58,step:"1"}])}${field(["epfDob","Date of birth","date",{value:(h.epf&&h.epf.dob)||"",hint:"From your passbook"}])}</div>
        <label class="opt"><input type="checkbox" id="f_epfExp" ${h.epf&&h.epf.expected===false?"":"checked"}><div><b>Add expected months</b><span>Until a newer passbook is loaded, each month adds your usual contribution, marked expected.</span></div></label>
        <button type="button" class="lnk" id="epfClr">Remove passbook data</button></div></div>
    <div id="g_hold"><p class="sect">What you already hold</p>
    <div class="grid2">${field(["openInvested","Amount invested (₹)","number",{value:h.openInvested??"",step:"0.01"}])}<div id="w_ou">${field(["openUnits","Units held","number",{value:h.openUnits??"",step:"any"}])}</div></div>
    <div id="w_uao2">${field(["unitsAsOf","Units as of (optional)","date",{value:h.unitsAsOf||(isNew?today():""),hint:"The date of the statement your units come from. SIPs after this date that don't say how many units are counted at the amount paid until you update the units."}])}</div>
    ${field(["inclTo","These include entries up to","date",{value:h.inclTo||(h.history&&h.history[0]&&h.history[0].date)||today(),hint:"Investment entries on or before this date are already counted above, so they aren't added again."}])}</div>
    <p class="sect" id="s_curv">Current value</p>
    <div id="g_px" ${HOSTED?"":"hidden"}></div>
    <div id="g_units">${field(["price","Latest price / NAV per unit (₹)","number",{value:h.price??"",step:"any",hint:x&&x.byUnits?`${x.units.toLocaleString("en-IN",{maximumFractionDigits:4})} ${h.type==="Gold"?"grams":h.type==="US Stocks"?"shares":"units"} in total`:""}])}
      <div id="g_fx">${field(["fx","Dollar rate (₹ per $1)","number",{value:h.fx??"",step:"any",ph:"e.g. 84.50",hint:"Today's rate, e.g. from INDmoney or Vested. Used to show the value in ₹ for net worth."}])}</div></div>
    <div id="g_nps" ${HOSTED?"":"hidden"}><div class="seg" role="group" aria-label="How to value NPS" id="npsSeg"><button type="button" data-k="value" aria-pressed="${h.npsMode!=="units"}">Type the balance</button><button type="button" data-k="units" aria-pressed="${h.npsMode==="units"}">Scheme units</button></div>
      <div id="g_npsu" hidden><p class="note">Enter the units of each scheme from your NPS statement (Protean, KFintech or CAMS app). The value then updates every day from NPS Trust's official NAVs.</p>
        ${field(["npsPfm","Pension fund","select",{value:"",options:[["","Loading…"]]}])}<div id="npsRows"></div></div></div>
    <div id="g_value">${field(["value","Current balance (₹)","number",{value:h.value??"",step:"0.01",hint:"From your passbook, statement or app."}])}</div>
    <div id="g_epf"><p class="sect">EPF details (optional)</p><div class="grid2">${field(["epfEmp","Your share each month (₹)","number",{value:h.epfEmp??"",step:"1",hint:"12% of basic, from your payslip"}])}${field(["epfEr","Employer's share to EPF (₹)","number",{value:h.epfEr??"",step:"1",hint:"Usually 3.67% of basic"}])}</div>
      <div class="grid2">${field(["joined","Service started","month",{value:h.joined||""}])}${field(["rateE","Interest rate (%)","number",{value:h.type==="EPF"?(h.rate??8.25):8.25,step:"0.01"}])}</div></div>
    <div id="g_ppf"><p class="sect">PPF details (optional)</p><div class="grid2">${field(["opened","Account opened on","date",{value:h.opened||""}])}${field(["yearly","You put in each year (₹)","number",{value:h.yearly??"",step:"500"}])}</div>
      ${field(["rateP","Interest rate (%)","number",{value:h.type==="PPF"?(h.rate??7.1):7.1,step:"0.01"}])}</div>
    ${isNew?"":retirementBlock(h,x)}
    ${isNew?"":tradesBlock(h)}
    <label class="opt" id="w_excl"><input type="checkbox" id="f_excl" ${h.excludeNW||(isNew&&h.type==="Real estate")?"checked":""}><div><b>Leave out of net worth</b><span>Still listed under investments, just not added to the total (e.g. a plot).</span></div></label>
    <div class="note" id="hcalc"></div>
    ${btnRow(isNew,"Add investment")}`;
  openSheet(isNew?"Add investment":`${h.name}`, body, s=>{
    /* automatic price link (hosted app): AMFI code, ISIN or US ticker; NPS: units per scheme */
    let px=h.px||"", pxDrawn=null, npsMode=h.npsMode==="units"?"units":"value", npsDrawn=false;
    const pxDraw=async()=>{
      const ty=val("type"), src=pxKind(ty), g=$("#g_px");
      if(!(src==="mf"||src==="stk"||src==="us")){ g.hidden=true; g.innerHTML=""; return; } g.hidden=false;
      if(px && !px.startsWith(src+":")) px="";
      if(src==="us"){
        g.innerHTML=`<div class="f"><label for="f_pxus">Automatic price: US ticker (optional)</label><input id="f_pxus" value="${esc(pxKey(px))}" placeholder="e.g. AAPL, VOO" autocapitalize="characters" autocomplete="off" spellcheck="false"><div class="hint" id="pxInfo"></div></div>`;
        const inp=$("#f_pxus");
        const info=async()=>{ const t=inp.value.trim().toUpperCase(); px=t?"us:"+t:""; const r=t?await pxPrice("us",t):null, fx=await pxPrice("us","USDINR"); const el=$("#pxInfo"); if(!el) return;
          if(r && px!==h.px){ const f=$("#f_price"); if(f) f.value=r.p; if(fx && $("#f_fx")) $("#f_fx").value=fx.p; calc(); }
          el.textContent=!t?"With a ticker, the price and the dollar rate update every morning (Alpha Vantage).":r?`Latest close $${r.p} on ${dLabel(r.d)}${fx?` · $1 = ₹${fx.p}`:""} (Alpha Vantage)`:"Its price arrives with the next morning update. Or, after saving, tap the prices line on the Investments tab › Update prices now."; };
        inp.addEventListener("input",()=>{ const t=inp.value.trim().toUpperCase(); px=t?"us:"+t:""; }); inp.addEventListener("change",info); info(); return;
      }
      const what=src==="mf"?"fund":"share";
      g.innerHTML=`<div class="f"><label for="f_pxq">Automatic price</label><div class="pxcur" id="pxCur"></div><input id="f_pxq" placeholder="${src==="mf"?"Search AMFI by fund name or scheme code":"Search NSE / BSE by name, symbol or ISIN"}" autocomplete="off" spellcheck="false"><div class="pxres" id="pxRes"></div></div>`;
      const cur=async()=>{ const el=$("#pxCur"); if(!el) return; const key=pxKey(px);
        if(!px){ el.innerHTML=`<span class="mut">Not linked. Find the ${what} below and its price updates every day.</span>`; return; }
        const names=await pxNames(src)||[], n=names.find(x=>x.k===key), r=await pxPrice(src,key); if(!$("#pxCur")) return;
        el.innerHTML=`<span><b>${esc(n?n.n:key)}</b> <span class="mut">${n&&n.s?esc(n.s)+" · ":""}${src==="mf"?"AMFI code":"ISIN"} ${esc(key)}${r?` · ₹${r.p} on ${dLabel(r.d)}`:""}</span></span> <button type="button" class="lnk" id="pxUn">Unlink</button>`;
        $("#pxUn").onclick=()=>{ px=""; cur(); }; };
      cur();
      const q=$("#f_pxq"), res=$("#pxRes"); let tm;
      q.addEventListener("input",()=>{ clearTimeout(tm); tm=setTimeout(async()=>{
        const list=await pxNames(src);
        if(!list){ res.innerHTML='<p class="note">Sign in and sync to search.</p>'; return; }
        if(!list.length){ res.innerHTML='<p class="note">The price list isn\'t ready yet. Deploy the price job, then on the Investments tab tap the prices line › Update prices now.</p>'; return; }
        const hits=pxSearch(list, q.value);
        res.innerHTML=hits.map(x=>`<button type="button" class="pxhit" data-k="${esc(x.k)}"><b>${esc(x.n||x.s||x.k)}</b><span>${src==="mf"?"AMFI code "+esc(x.k):`${esc(x.s||"")} · ${esc(x.x||"")} · ${esc(x.k)}`}</span></button>`).join("") || (q.value.trim().length>1?'<p class="note">No match. Try fewer words.</p>':"");
        res.querySelectorAll(".pxhit").forEach(b=>b.onclick=()=>{ px=src+":"+b.dataset.k; const n=list.find(x=>x.k===b.dataset.k);
          if(n && isNew && !val("name")){ $("#f_name").value=n.n; $("#f_instrument").value=n.n; sync(); }
          q.value=""; res.innerHTML=""; cur();
          pxPrice(src, b.dataset.k).then(r=>{ const f=$("#f_price"); if(r && f){ f.value=r.p; calc(); } }); });
      },250); });
    };
    const NPS_ASSET={E:"equity",C:"corporate bonds",G:"government bonds",A:"alternative assets"};
    const shortScheme = n => { const m=String(n||"").match(/scheme\s+([ECGA])\b/i); if(m) return `Scheme ${m[1].toUpperCase()} · ${NPS_ASSET[m[1].toUpperCase()]}`; const k=String(n||"").match(/scheme\b.*$/i); return k ? k[0] : n; };
    const npsOrder = n => { const m=String(n||"").match(/scheme\s+([ECGA])\b/i); return m ? "ECGA".indexOf(m[1].toUpperCase()) : 9; };
    const npsCollect=()=>[...document.querySelectorAll("#npsRows [data-np]")].map(i=>{ const k=i.dataset.np, u=parseFloat(i.value); if(!(u>0)) return null;
      const old=(h.npsLines||[]).find(y=>pxKey(y.px)===k)||{}, r=P.tables.nps&&P.tables.nps.rows[k], l={...old, px:"nps:"+k, units:u, n:i.dataset.n};
      if(r) pxSet(l, r, "nps"); return l; }).filter(Boolean);
    const npsDraw=async()=>{
      npsDrawn=true; const sel=$("#f_npsPfm"), rows=$("#npsRows");
      const list=await pxNames("nps"); await pxLoadSrc("nps"); if(!$("#npsRows")) return;
      if(!list||!list.length){ sel.innerHTML='<option value="">Not available yet</option>'; rows.innerHTML='<p class="note">The NPS price list isn\'t ready yet. Deploy the price job, then on the Investments tab tap the prices line › Update prices now.</p>'; return; }
      const curL=h.npsLines||[], k0=curL[0]&&pxKey(curL[0].px), curPfm=(list.find(y=>y.k===k0)||{}).f||"";
      const pfms=[...new Set(list.map(x=>x.f).filter(Boolean))].sort();
      sel.innerHTML='<option value="">Pick your pension fund</option>'+pfms.map(f=>`<option value="${esc(f)}" ${f===curPfm?"selected":""}>${esc(f)}</option>`).join("");
      const draw=()=>{ const f=sel.value; if(!f){ rows.innerHTML=""; calc(); return; }
        let sch=list.filter(x=>x.f===f && /\btier\s*-?\s*(i|1)\b/i.test(x.n)); if(!sch.length) sch=list.filter(x=>x.f===f);
        rows.innerHTML=`<div class="npsg">${sch.sort((a,b)=>npsOrder(a.n)-npsOrder(b.n)||a.n.localeCompare(b.n)).map(x=>{ const l=curL.find(y=>pxKey(y.px)===x.k), r=P.tables.nps&&P.tables.nps.rows[x.k];
          return `<div class="f"><label for="np_${esc(x.k)}">${esc(shortScheme(x.n))}</label><input id="np_${esc(x.k)}" data-np="${esc(x.k)}" data-n="${esc(shortScheme(x.n))}" type="number" step="any" inputmode="decimal" value="${l?esc(l.units):""}" placeholder="Units"><div class="hint">${r?`NAV ₹${r.p} on ${dLabel(r.d)}`:"No NAV yet"}</div></div>`; }).join("")}</div><p class="note">Leave a scheme empty if you don't hold it.</p>`;
        rows.querySelectorAll("input").forEach(i=>{ i.addEventListener("input",()=>{ unitsTouched(); calc(); }); }); calc(); };
      sel.onchange=draw; draw();
    };
    /* EPF passbook (read on this device; nothing is uploaded) */
    let ebk=h.epf?JSON.parse(JSON.stringify(h.epf)):null;
    const epfSet=()=>ebk?{...ebk, rate:parseFloat(val("epfRate"))||8.25, raise:parseFloat(val("epfRaise"))||0, retireAge:parseInt(val("epfAge"))||58, dob:val("epfDob")||ebk.dob||"", expected:$("#f_epfExp").checked}:null;
    const epfStatus=()=>{ const el=$("#epfSt"); if(!el) return; const e=ebk?epfCalc({epf:epfSet()},{noProj:true}):null;
      if(!e){ el.innerHTML=`Load your EPF passbooks (one PDF per financial year per member ID, from the EPFO member passbook site) and the balance, contributions, interest, withdrawals and pension are worked out from them. The PDFs are read on this device.`; return; }
      const nb=Object.values(ebk.books).reduce((a,b)=>a+Object.keys(b.fys).length,0);
      el.innerHTML=`<b>${nb} passbook${nb===1?"":"s"} · ${e.accs.length} member ID${e.accs.length===1?"":"s"} · up to ${mLabel(e.lastWm)}</b><br>Balance ${money(e.epfBal)}${e.expected.length?` + ${e.expected.length} expected month${e.expected.length===1?"":"s"} (${money(e.expAmt)})`:""} · invested ${money(e.invested)} · interest ${money(e.interest)}${e.issues.length?`<br><span style="color:var(--warn)">${e.issues.map(esc).join("<br>")}</span>`:""}`; };
    const epfPick=async files=>{ if(!files.length) return; const st=$("#epfSt"); st.textContent=`Reading ${files.length} PDF${files.length===1?"":"s"}…`;
      try{ const {list,bad}=await epfLoadFiles([...files]);
        if(list.length){ const r=epfMerge(ebk||{rate:8.25, raise:0, retireAge:58}, list); ebk=r.E; if(!val("epfDob") && ebk.dob) $("#f_epfDob").value=ebk.dob; }
        epfStatus(); sync(); calc();
        toast(list.length?`${list.length} passbook${list.length===1?"":"s"} read${bad.length?`, ${bad.length} couldn't be read`:""}. Save to keep them.`:"Couldn't read these as EPF passbooks."); }
      catch(e){ console.warn(e); st.textContent="Couldn't open the PDF reader. Check your connection and try again."; } };
    const uao0=val("unitsAsOf"), unitsTouched=()=>{ const f=$("#f_unitsAsOf"); if(f && f.value===uao0) f.value=today(); };
    const sync=()=>{ const ty=val("type"), u=UNIT_TYPES.includes(ty), L=HOLD_LBL[ty], one=ONE_OF.includes(ty), nu=HOSTED && ty==="NPS" && npsMode==="units";
      $("#g_units").hidden=!u; $("#w_ou").hidden=!u; $("#g_value").hidden=u||nu; $("#w_uao2").hidden=!(u||nu);
      $("#g_nps").hidden=!(HOSTED && ty==="NPS"); $("#g_npsu").hidden=!nu;
      const pb=ty==="EPF" && !!ebk; $("#g_epfb").hidden=ty!=="EPF"; $("#g_epfset").hidden=!pb; $("#epfOpen").hidden=!pb||isNew;
      const pp=ty==="PPF" && !!h.ppf;
      $("#g_hold").hidden=pb||pp; $("#s_curv").hidden=pb||pp; $("#w_instrument").hidden=pb; if(pb||pp){ $("#g_value").hidden=true; }
      if(HOSTED && pxDrawn!==ty){ pxDrawn=ty; pxDraw(); }
      const g=ty==="Gold"; $("#w_openUnits label").textContent=g?"Grams held":"Units held"; $("#f_openUnits").placeholder=g?"e.g. 4.2513":"";
      const us=ty==="US Stocks"; $("#g_fx").hidden=!us; $("#g_epf").hidden=ty!=="EPF"||!!ebk; $("#g_ppf").hidden=ty!=="PPF";
      $("#w_price label").textContent=g?"Latest price per gram (₹)":us?"Latest price per share ($)":"Latest price / NAV per unit (₹)";
      if(us){ $("#w_openUnits label").textContent="Shares held"; $("#w_openInvested label").textContent="Amount invested (₹ paid)"; } else $("#w_openInvested label").textContent="Amount invested (₹)";
      $("#w_name label").textContent=one?"Name (optional)":"Name"; $("#f_name").placeholder=L?L.ph:"e.g. Navi Nifty 50";
      const pl=L?L.plat:["Platform (optional)","e.g. Groww, Zerodha, INDmoney"]; $("#w_platform").hidden=!pl; if(pl){ $("#w_platform label").textContent=pl[0]; $("#f_platform").placeholder=pl[1]; }
      if(isNew){ const auto=holdName(val("name"), ty); $("#f_instrument").placeholder=auto||"Same as the name"; } };
    const calc=()=>{ if(isNew) return; const t={...h, type:val("type"), openInvested:parseFloat(val("openInvested"))||0, openUnits:parseFloat(val("openUnits"))||0, inclTo:val("inclTo"), price:parseFloat(val("price"))||0, fx:parseFloat(val("fx"))||0, ccy:val("type")==="US Stocks"?"USD":h.ccy, value:parseFloat(val("value"))||0, instrument:val("instrument")||val("name"), unitsAsOf:val("unitsAsOf"), npsMode:HOSTED&&val("type")==="NPS"?npsMode:undefined, npsLines:HOSTED&&val("type")==="NPS"&&npsMode==="units"?npsCollect():h.npsLines, epf:val("type")==="EPF"?epfSet()||undefined:undefined};
      const y=holdingSum(t); $("#hcalc").textContent=`Invested ${money(y.inv)} · value ${y.isUsd?usd(y.usdValue)+" = ":""}${money(y.value)}${y.atCost>0.5?` (incl. ${money(y.atCost)} of SIPs at cost until you update the units)`:""} · ${y.gain>=0?"gain":"loss"} ${money(Math.abs(y.gain))} (${y.pct.toFixed(1)}%)`; };
    $("#f_type").onchange=()=>{ sync(); if(val("type")==="Real estate") $("#f_excl").checked=true; calc(); };
    s.querySelectorAll("input").forEach(i=>{ i.addEventListener("input",calc); i.addEventListener("change",calc); }); sync(); calc();
    $("#f_openUnits").addEventListener("input", unitsTouched);
    $("#f_epfPdf").onchange=e=>{ epfPick(e.target.files); e.target.value=""; };
    $('label[for="f_epfPdf"]').onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); $("#f_epfPdf").click(); } };
    $("#epfClr").onclick=e=>{ const b=e.currentTarget; if(!b.dataset.arm){ b.dataset.arm=1; b.textContent="Tap again to remove the passbooks (then Save)"; return; } ebk=null; delete b.dataset.arm; b.textContent="Remove passbook data"; epfStatus(); sync(); calc(); };
    $("#epfOpen").onclick=()=>{ closeModal(); S.epfId=h.id; go("epf"); };
    ["epfRate","epfRaise","epfAge","epfDob"].forEach(k=>$("#f_"+k).addEventListener("input",epfStatus)); $("#f_epfExp").addEventListener("change",()=>{ epfStatus(); calc(); });
    epfStatus();
    s.querySelectorAll("#npsSeg button").forEach(b=>b.onclick=()=>{ npsMode=b.dataset.k; s.querySelectorAll("#npsSeg button").forEach(x=>x.setAttribute("aria-pressed", x===b)); sync(); if(npsMode==="units" && !npsDrawn) npsDraw(); calc(); });
    if(HOSTED && h.type==="NPS" && npsMode==="units") npsDraw();
    $("#f_name").addEventListener("input",()=>{ if(isNew){ $("#f_instrument").value=val("name"); sync(); } });
    s.querySelector("#cx").onclick=closeModal;
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>askConfirm(`Remove "${h.name}" from investments? Your investment entries stay.`,"Remove",()=>del("holdings",h.id));
    s.querySelector("#sv").onclick=()=>{
      const name=holdName(val("name"), val("type")); if(!name){ toast("Give it a name, e.g. the fund or stock."); return; }
      const type=val("type"), u=UNIT_TYPES.includes(type), price=parseFloat(val("price")), value=parseFloat(val("value"));
      const o={...h, id:h.id||uid(), type, name, platform:$("#w_platform").hidden?"":val("platform"), instrument:val("instrument")||name, openInvested:parseFloat(val("openInvested"))||0, inclTo:val("inclTo")||today(), excludeNW:$("#f_excl").checked||undefined};
      if(!o.excludeNW) delete o.excludeNW;
      for(const k of ["epfEmp","epfEr","joined","opened","yearly","rate"]) delete o[k];
      if(type==="EPF"){ const a=parseFloat(val("epfEmp")), b=parseFloat(val("epfEr")), r=parseFloat(val("rateE")); if(a>0) o.epfEmp=a; if(b>0) o.epfEr=b; if(val("joined")) o.joined=val("joined"); if(r>0) o.rate=r;
        if(ebk){ o.epf=epfSet(); const e=epfCalc({epf:o.epf},{noProj:true}); if(e){ o.epfEmp=e.mon.emp; o.epfEr=e.mon.er; o.rate=o.epf.rate; } } else delete o.epf; }
      else delete o.epf;
      if(type==="PPF"){ const y=parseFloat(val("yearly")), r=parseFloat(val("rateP")); if(val("opened")) o.opened=val("opened"); if(y>0) o.yearly=y; if(r>0) o.rate=r; }
      if(u){ o.openUnits=parseFloat(val("openUnits"))||0; const us=type==="US Stocks";
        if(us && h.ccy!=="USD"){ o.ccy="USD"; if(price>0){ o.price=price; o.priceDate=today(); } }   /* switching an older ₹-priced holding to $ */
        else if(price>0 && price!==+h.price){ o.price=price; o.priceDate=today(); o.priceManual=true; }
        if(us){ const fx=parseFloat(val("fx")); if(fx>0 && fx!==+h.fx){ o.fx=fx; o.fxDate=today(); o.priceDate=today(); o.fxManual=true; } } else { delete o.fx; delete o.fxDate; delete o.ccy; delete o.fxAuto; delete o.fxManual; }
        delete o.value; delete o.valueDate; }
      else { if(value>=0 && val("value")!=="" && value!==+h.value){ o.value=value; o.valueDate=today(); } delete o.price; delete o.priceDate; delete o.openUnits; }
      /* automatic price link, units date, NPS by scheme */
      delete o.priceJump;
      const pk=pxKind(type);
      if(HOSTED && (pk==="mf"||pk==="stk"||pk==="us") && px){ if(px!==h.px){ o.px=px; delete o.priceAuto; delete o.navHist; delete o.priceManual; delete o.fxAuto; } }
      else if(HOSTED || !(pk==="mf"||pk==="stk"||pk==="us")){ delete o.px; delete o.priceAuto; delete o.priceSrc; delete o.navHist; }
      if(!o.px){ delete o.priceManual; delete o.fxManual; }
      if(HOSTED && type==="NPS"){ if(npsMode==="units"){ const L=npsCollect(); if(!L.length){ toast("Enter the units of at least one scheme, or switch to Type the balance."); return; } o.npsMode="units"; o.npsLines=L; } else delete o.npsMode; }
      else if(type!=="NPS"){ delete o.npsMode; delete o.npsLines; }
      if(u || npsLines(o)){ const d=val("unitsAsOf"); if(d) o.unitsAsOf=d; else delete o.unitsAsOf; } else delete o.unitsAsOf;
      const nv=holdingSum(o).value; o.history=(h.history||[]).filter(p=>p.date!==today()).concat({date:today(), value:Math.round(nv*100)/100}).slice(-60);
      closeModal(); upsert("holdings",o); toast(isNew?"Investment added":"Updated");
      if(HOSTED){ pxApply().then(()=>pxWatch()); }
    };
  });
}
function investSection(){
  const H=live("holdings").map(h=>[h,holdingSum(h)]);
  const head=`<div class="sh"><h3>Investments</h3><button class="lnk" type="button" id="addHold">+ Add ›</button></div>`;
  if(!H.length) return head+`<div class="list"><div class="empty">Add your mutual funds, stocks, PPF, NPS, EPF, gold, US stocks and property to see their value and your net worth.</div></div>`;
  const gl=(g,p)=>`<span class="${g<-0.5?"neg":g>0.5?"in":"mut"}">${g>=0?"+":"−"}${money(Math.abs(g))}${p!==null?` (${p>=0?"+":""}${p.toFixed(1)}%)`:""}</span>`;
  const tot=H.filter(([h])=>!h.excludeNW).reduce((a,[,x])=>({v:a.v+x.value,i:a.i+x.inv}),{v:0,i:0});
  const open=new Set(prefGet("holdOpen",[]));
  const row=([h,x])=>{ const stale=x.fxMissing?"dollar rate not set":x.age===null?"value not set":x.age>7?`${x.byUnits?"price":"value"} ${x.age} days old`:"";
    const auto=(h.px||x.lines) && x.asOf && x.age<=7 ? h.priceManual ? `your price of ${dLabel(x.asOf)}` : `${x.lines?"NAVs":x.byUnits&&h.type!=="Stock"&&h.type!=="US Stocks"?"NAV":"price"} of ${dLabel(x.asOf)}` : "";
    const jump=h.priceJump ? `<span class="pill warn" title="A split or bonus changes the units too">Price ${h.priceJump.to>h.priceJump.from?"+":"−"}${Math.abs(Math.round((h.priceJump.to/h.priceJump.from-1)*100))}%: check units</span>` : "";
    return `<div class="row tap" data-hold="${esc(h.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(h.name)}${h.excludeNW?' <span class="pill">Not in net worth</span>':""}</div>
      <div class="s">${money(x.inv)} invested</div><div class="s s2">${[x.byUnits?`${x.units.toLocaleString("en-IN",{maximumFractionDigits:3})} ${unitWord(h.type,x.units)}`:"", x.isUsd?usd(x.usdValue):"", x.atCost>0.5?`${money(x.atCost)} at cost`:"", auto, stale].filter(Boolean).join(" · ")}</div>${jump}</div>
      <div class="ccamt"><div class="amt">${money(x.value)}</div><div class="hgl">${gl(x.gain, x.inv>0?x.pct:null)}</div>${x.age===null||x.age>31||x.fxMissing?'<span class="pill warn">Update</span>':""}</div></div>`; };
  const groups=INV_TYPES.filter(t=>H.some(([h])=>h.type===t)).map(t=>{ const rows=H.filter(([h])=>h.type===t).sort((a,b)=>b[1].value-a[1].value), v=rows.reduce((a,[,x])=>a+x.value,0), iv=rows.reduce((a,[,x])=>a+x.inv,0), on=open.has(t);
    if(rows.length===1 && ONE_OF.includes(t)){ const [h,x]=rows[0]; const nm=h.name && h.name!==t ? h.name : t;
      const sub = x.epf ? `${x.epf.expected.length?"incl. expected · ":""}${short(x.inv)} invested · ≈ ${short(x.epf.accrued)} interest this year` : h.nps ? `${short(x.inv)} invested · ${npsLines(h)?npsLines(h).map(l=>npsKey(l)).join(" / ")+" schemes":""}` : x.ppf ? `${short(x.inv)} deposited · ≈ ${short(x.ppf.accrued)} interest this year · matures ${mShort(x.ppf.matures.slice(0,7))}` : `${short(x.inv)} invested`;
      return `<div class="hg solo"><button class="hgh" type="button" data-hold="${esc(h.id)}"><span class="hgt"><b>${esc(nm)}</b><span>${sub}</span></span><span class="hgv"><b class="amt">${money(v)}</b>${gl(v-iv, iv>0?(v-iv)/iv*100:null)}</span><span class="chev" aria-hidden="true"></span></button></div>`; }
    const noun=t==="Mutual Fund"?(rows.length===1?"fund":"funds"):t==="Stock"||t==="US Stocks"?(rows.length===1?"stock":"stocks"):(rows.length===1?"holding":"holdings");
    return `<div class="hg ${on?"on":""}"><button class="hgh" type="button" data-hg="${esc(t)}" aria-expanded="${on}"><span class="hgt"><b>${esc(t)}</b><span>${rows.length} ${noun}</span></span><span class="hgv"><b class="amt">${money(v)}</b>${gl(v-iv, iv>0?(v-iv)/iv*100:null)}</span><span class="chev" aria-hidden="true"></span></button>
      ${on?`<div class="hgb">${rows.map(row).join("")}</div>`:""}</div>`; }).join("");
  const nTr=live("trades").length;
  const trLine=`<div class="btns trbtns"><label class="btn sm" for="trFile" tabindex="0" role="button">Import Kite tradebook</label><input type="file" id="trFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple hidden>${nTr?`<span class="note" style="margin:0">${nTr} trades · listed in Transactions under Trades</span>`:""}</div>`;
  return head + `<div class="invt"><b>${money(tot.v)}</b> <span class="mut">worth now ·</span> ${gl(tot.v-tot.i, tot.i>0?(tot.v-tot.i)/tot.i*100:null)} <span class="mut">on ${money(tot.i)} invested</span></div>` + pxLine() + investCharts(H) + `<div class="sh"><h3>Holdings</h3></div><div class="list hgs">${groups}</div>` + trLine;
}
/* Accounts: net worth on top, then one section at a time (Overview · Banks · Cards · Investments · Loans) */
const ACC_TABS=[["overview","Overview"],["banks","Banks<span class=\"lgw\"> &amp; cards</span>"],["invest","Invest<span class=\"lgw\">ments</span>"],["loans","Loans"],["props","Property"]];
const prefGet=(k,d)=>{ try{ const v=localStorage.getItem("kpmp.ui."+k); return v==null?d:JSON.parse(v); }catch(e){ return d; } };
const prefSet=(k,v)=>{ try{ localStorage.setItem("kpmp.ui."+k, JSON.stringify(v)); }catch(e){} };
function vAccounts(){
  if(S.accTab==="cards") S.accTab="banks";
  const t=S.accTab||(S.accTab=prefGet("accTab","overview")==="cards"?"banks":prefGet("accTab","overview"));
  const bal=balances(), nw=netWorth(), own=nw.banks+nw.inv+nw.prop, owe=nw.loans+nw.cards;
  const hero=`<div class="hero nwh">
    <div class="nwg">
      <div><div class="k">You own</div><div class="hv">${money(own)}</div><div class="k2">Banks at month-end ${money(nw.banks)}<br>Investments ${money(nw.inv)}${nw.prop>0.5?`<br>Property ${money(nw.prop)}`:""}</div></div>
      <div><div class="k">You owe</div><div class="hv">${money(owe)}</div><div class="k2">Loans at month-end ${money(nw.loans)}<br>Card bills ${money(nw.cards)}</div></div>
    </div>
    <div class="hrow"><div><div class="lbl">Net worth at the end of ${mLabel(ymOf(today()))}</div><div class="nwv">${nw.total<0?"−":""}${money(Math.abs(nw.total))}</div></div>${nw.excluded+nw.propOff>0.5?`<div class="flow">Not counted<br>${money(nw.excluded+nw.propOff)} property</div>`:""}</div>
  </div>`;
  const seg=`<div class="seg accseg" role="group" aria-label="Accounts sections">${ACC_TABS.map(([k,l])=>`<button type="button" data-acct="${k}" aria-pressed="${t===k}">${l}</button>`).join("")}</div>`;
  const body = t==="banks"||t==="cards" ? accBanks(bal) : t==="invest" ? accInvest() : t==="loans" ? accLoans() : t==="props" ? propsBody() : accOverview(bal, nw);
  return hero + seg + `<div class="accb">${body}</div>`;
}
function accOverview(bal, nw){
  const banks=live("accounts").filter(a=>a.type!=="card" && !a.hidden), bankNow=banks.filter(countsAcc).reduce((x,a)=>x+(bal.get(a.id)||0),0);
  const cards=live("accounts").filter(a=>a.type==="card" && countsAcc(a)).map(a=>{ const c=cardInfo(a); return {a, c, pay:c?c.dueLeft:0, out:Math.max(0,-(bal.get(a.id)||0))}; });
  const cardOut=cards.reduce((x,r)=>x+r.out,0), withDue=cards.filter(r=>r.out>0.5).length;
  const H=live("holdings").map(h=>[h,holdingSum(h)]), inv=H.filter(([h])=>!h.excludeNW).reduce((a,[,x])=>({v:a.v+x.value,i:a.i+x.inv}),{v:0,i:0});
  const loans=live("loans").map(l=>[l,loanSum(l)]).filter(([l,x])=>!isClosed(l,x)), lo=loans.reduce((x,[,y])=>x+y.out,0), emi=loans.reduce((x,[,y])=>x+(+y.emiNow||0),0);
  const gl=inv.v-inv.i, pct=inv.i>0?gl/inv.i*100:0;
  const tile=(k,label,v,sub,cls="")=>`<button class="acct" type="button" data-acct="${k}"><span class="acct-k">${label}</span><span class="acct-v ${cls}">${v}</span><span class="acct-s">${sub}</span></button>`;
  const tiles=`<div class="accts">
    ${tile("banks","Bank balances today",money(bankNow),`Month-end ${money(nw.banks)}`)}
    ${tile("invest","Investments",money(inv.v),H.length?`<span class="${gl<-0.5?"neg":"in"}">${gl>=0?"+":"−"}${money(Math.abs(gl))} (${pct>=0?"+":""}${pct.toFixed(1)}%)</span>`:"Add your holdings")}
    ${tile("banks","Credit cards",money(cardOut),withDue?`${withDue} card${withDue===1?"":"s"} with a balance`:"Nothing due",cardOut>0.5?"neg":"")}
    ${tile("loans",`Loans${loans.length?` · ${loans.length} open`:""}`,short(lo),loans.length?(emi>0.5?`EMIs ${money(emi)}/mo`:"No EMIs"):"No open loans")}
  </div>`;
  /* where the money sits: banks + each investment type */
  const parts=[["Banks",Math.max(0,nw.banks)]]; for(const ty of INV_TYPES){ const v=H.filter(([h])=>h.type===ty && !h.excludeNW).reduce((a,[,x])=>a+x.value,0); if(v>0.5) parts.push([ty,v]); } if(nw.prop>0.5) parts.push(["Property",nw.prop]);
  const tot=parts.reduce((a,[,v])=>a+v,0), COL=[...VC,"var(--vO)","var(--vO)"];
  const alloc = tot>0 ? `<div class="sh"><h3>Where your money is</h3></div><div class="card">
    <div class="stack" style="margin-top:0;height:10px">${parts.map(([n,v],i)=>`<i style="flex:${(v/tot).toFixed(4)};background:${COL[i%COL.length]}" title="${esc(n)}"></i>`).join("")}</div>
    <div class="alloc">${parts.map(([n,v],i)=>`<div><span class="ad" style="background:${COL[i%COL.length]}"></span><span class="an">${esc(n)}</span><span class="ap">${(v/tot*100).toFixed(0)}%</span><span class="av">${money(v)}</span></div>`).join("")}</div></div>` : "";
  /* things to look at */
  const todo=[];
  const stale=H.filter(([h,x])=>x.age===null||x.age>31||x.fxMissing); if(stale.length) todo.push(`<div class="row tap" data-acct="invest" role="button" tabindex="0"><div class="main"><div class="t">Update ${stale.length} investment value${stale.length===1?"":"s"}</div><div class="s">${esc(stale.slice(0,3).map(([h])=>h.name).join(", "))}${stale.length>3?"…":""} · older than a month or not set</div></div><span class="pill warn">Update</span></div>`);
  for(const r of cards) if(r.c && r.pay>0.5){ const days=Math.round((new Date(r.c.due+"T00:00")-new Date(today()+"T00:00"))/864e5); if(days<=7) todo.push(`<div class="row tap" data-card="${esc(r.a.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(r.a.name)} bill due ${days<0?"overdue":days===0?"today":`in ${days} day${days===1?"":"s"}`}</div><div class="s">Due ${fmtD(r.c.due)}</div></div><div class="amt neg">${money(r.pay)}</div></div>`); }
  for(const [l,x] of loans) if(x.missed>0.5) todo.push(`<div class="row tap" data-loan="${esc(l.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(l.name)}: missed EMIs to repay</div><div class="s">Paid by the relative for you</div></div><div class="amt">${money(x.missed)}</div></div>`);
  return tiles + nwChart() + alloc + (todo.length?`<div class="sh"><h3>Needs a look</h3></div><div class="list">${todo.join("")}</div>`:"");
}
/* the reserve account's balance, split into what it's set aside for */
function resvSplit(){ const st=reserveState(); if(!st.a) return "";
  const parts=[`Big bills ${money(st.held)}`, ...st.funds.filter(f=>f.have>0.5).map(f=>`${esc(f.p.name)} fund ${money(f.have)}`), `Emergency ${money(st.emergency)}`];
  return `<div class="s">${parts.join(" · ")}</div>`; }
function accBanks(bal){
  const accs=live("accounts"), banks=accs.filter(a=>a.type!=="card" && !a.hidden), tot=banks.filter(countsAcc).reduce((x,a)=>x+(bal.get(a.id)||0),0);
  const arow=a=>`<div class="row tap" ${a.type==="card"&&!a.hidden?`data-card="${esc(a.id)}"`:`data-acc="${esc(a.id)}"`} role="button" tabindex="0"><div class="main"><div class="t">${esc(a.name)}${a.hidden?' <span class="chip mute">Hidden</span>':a.noTotal?' <span class="chip mute">Not in totals</span>':""}</div><div class="s">${ACC_LBL[a.type]} · started at ${money(a.opening)}${a.type==="card"?(a.stmtDay?` · statement day ${a.stmtDay}${a.dueDay?`, due day ${a.dueDay}`:""}`:" · add statement and due day"):""}</div></div><div class="amt ${(bal.get(a.id)||0)<0?"neg":""}">${money(bal.get(a.id))}</div></div>`;
  return `<div class="btns" style="margin-top:12px"><button class="btn pri" type="button" id="addAcc">+ Add account or card</button></div>
    <div class="sh"><h3>Bank accounts · ${money(tot)}</h3></div>
    <div class="list">${banks.map((a,i)=>{ const v=bal.get(a.id)||0; return `<div class="row tap" data-acc="${esc(a.id)}" role="button" tabindex="0"><span class="cdot" style="background:${CC[i%5]}"></span><div class="main"><div class="t">${esc(a.name)}${a.main?' <span class="chip mute">Main</span>':""}${a.noTotal?' <span class="chip mute">Not in totals</span>':""}${a.reserve?' <span class="chip mute">Reserve</span>':""}</div>${a.reserve?resvSplit():""}</div><div class="amt ${v<-0.5?"neg":""}">${money(v)}</div></div>`; }).join("")||'<div class="empty">No bank accounts yet.</div>'}</div>
    <p class="note">Balances as of today. Net worth uses ${esc((mainAcc()||{}).name||"your main account")}'s month-end balance instead. Tap an account to edit it.</p>
    <div class="sh"><h3>Credit cards</h3></div>${cardTable(bal,true)||'<div class="list"><div class="empty">No credit cards.</div></div>'}
    <p class="note">Each card is its own account with its statement and due day. Log card purchases against the card, and record the bill payment as a transfer from your bank to the card, so spending isn't counted twice.</p>
    <div style="height:8px"></div>${cardCharts(bal)}
  ${accs.some(a=>a.hidden)?`<details class="fm" style="margin-top:14px"><summary><span class="mn">Hidden accounts</span><span class="sub" style="text-align:right">${accs.filter(a=>a.hidden).length}</span></summary><div class="list" style="border-radius:0;box-shadow:none">${accs.filter(a=>a.hidden).map(arow).join("")}</div></details>`:""}`;
}
function accLoans(){
    const loans=live("loans").map(l=>[l,loanSum(l)]).sort((a,b)=>b[1].out-a[1].out);
    return `    <div class="btns" style="margin-top:12px"><button class="btn pri" type="button" id="addLoan">+ Add loan</button></div>
    ${loans.length?`<div class="sumcard" style="margin-top:12px"><div class="sr"><span>Total outstanding</span><b>${money(loans.reduce((x,[,y])=>x+y.out,0))}</b></div><div class="sr"><span>EMIs per month</span><b>${money(loans.reduce((x,[,y])=>x+(y.out>0.5?y.emiNow:0),0))}</b></div></div>`:""}
    ${loanList(loans,"No open loans. Add bank loans, money from family and friends, or a mix of both.")}
    ${payoffPanel()}`;
}
function accInvest(){ return investSection(); }
/* Insights: Month · Year · Forecast */
function vInsights(){
  const t=S.insTab||"month";
  const seg=`<div class="seg" role="group" aria-label="Insights" style="margin-top:4px">${[["month","Month"],["trends","Trends"],["year","Year"],["home",esc(homeTag())]].map(([k,l])=>`<button type="button" data-ins="${k}" aria-pressed="${t===k}">${l}</button>`).join("")}</div>`;
  if(t==="forecast"){ S.insTab="month"; S.planTab="cashflow"; S.view="plan"; return vPlan(); }
  return seg + (t==="year" ? vYear() : t==="home" ? homePanel() : t==="trends" ? trendsPanel() : monthView());
}
/* Home spending: everything tagged Home, month by month, split by who paid */
function homePanel(){
  const y=S.homeYr||today().slice(0,4), tag=homeTag();
  const tx=live("txns").filter(t=>t.type==="expense" && (t.tags||[]).some(isHomeTag));
  const years=[...new Set([...tx.map(t=>t.date.slice(0,4)), today().slice(0,4)])].sort();
  const M=Array.from({length:12},(_,i)=>({ym:`${y}-${pad(i+1)}`, you:0, her:0}));
  const cats=new Map();
  for(const t of tx){ if(t.date.slice(0,4)!==y) continue; const m=M[+t.date.slice(5,7)-1]; bySpouse(t)?m.her+=+t.amount:m.you+=+t.amount; const k=catTop(t.categoryId)||"none"; const c=cats.get(k)||{you:0,her:0}; bySpouse(t)?c.her+=+t.amount:c.you+=+t.amount; cats.set(k,c); }
  const T=M.reduce((a,m)=>({you:a.you+m.you, her:a.her+m.her}),{you:0,her:0}), max=Math.max(1,...M.map(m=>m.you+m.her));
  const yearNav=`<div class="monthbar"><button class="btn sm" type="button" data-hyr="${+y-1}" aria-label="Previous year" ${years[0]>=y?"disabled":""}>‹</button><div class="m">${y}</div><button class="btn sm" type="button" data-hyr="${+y+1}" aria-label="Next year" ${y>=today().slice(0,4)?"disabled":""}>›</button></div>`;
  if(!tx.length) return yearNav+`<div class="list"><div class="empty">Nothing is tagged ${esc(tag)} yet. Tag home expenses ${esc(tag)}, and add the ones your spouse pays with the account set to the person who paid.</div></div>`;
  const rows=M.filter(m=>m.you+m.her>0.5).reverse();
  return `${yearNav}
    <div class="sumcard"><div class="sr"><span>Paid by you</span><b>${money(T.you)}</b></div><div class="sr"><span>Paid by ${esc(othersName())}</span><b>${money(T.her)}</b></div><div class="sr tot"><span>${esc(tag)} in ${y}</span><b>${money(T.you+T.her)}</b></div></div>
    <div style="height:16px"></div>${homeChart(M,y)}
    <div class="sh"><h3>Month by month</h3></div><div class="list">${rows.length?"":`<div class="empty">Nothing tagged ${esc(tag)} in ${y}.</div>`}${rows.map(m=>{ const tot=m.you+m.her; return `<div class="row ${tot>0.5?"tap":""}" ${tot>0.5?`data-homem="${m.ym}" role="button" tabindex="0"`:""}><div class="main"><div class="t">${mLabel(m.ym)}</div>
      ${tot>0.5?`<div class="s">You ${money(m.you)} · ${esc(othersName())} ${money(m.her)}</div>`:'<div class="s">Nothing</div>'}</div><div class="amt">${money(tot)}</div></div>`; }).join("")}</div>
    ${cats.size?`<div class="sh"><h3>By category in ${y}</h3></div><div class="list">${[...cats.entries()].sort((a,b)=>(b[1].you+b[1].her)-(a[1].you+a[1].her)).map(([k,c])=>`<div class="row"><div class="main"><div class="t">${esc(k==="none"?"Uncategorised":catName(k))}</div><div class="s">You ${money(c.you)} · ${esc(othersName())} ${money(c.her)}</div></div><div class="amt">${money(c.you+c.her)}</div></div>`).join("")}</div>`:""}`;
}
function forecastPanel(){
  const fc=forecast(S.fcH), F=fc.months, W=640, H=220, pl=54, pr=14, pt=14, pb=28;
  const vals=F.map(x=>x.bal), lo=Math.min(0,...vals), hi=Math.max(0,fc.start,...vals);
  const span=(hi-lo)||1, step=[1e4,2e4,5e4,1e5,2e5,5e5,1e6,2e6,5e6].find(v=>span/v<=5)||1e7;
  const X=i=>pl+i*(W-pl-pr)/Math.max(1,F.length-1), Y=v=>pt+(hi-v)*(H-pt-pb)/span;
  const ticks=[]; for(let v=Math.ceil(hi/step)*step; v>=lo-1e-6; v-=step) ticks.push(v);
  const L=v=>{ const a=Math.abs(v); return (v<0?"−":"")+(a>=1e7?(a/1e7).toFixed(1)+"Cr":a>=1e5?(a/1e5).toFixed(1)+"L":a>=1e3?Math.round(a/1e3)+"k":Math.round(a)); };
  const pts=vals.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" "), neg=vals[vals.length-1]<0, col=neg?"var(--bad)":"var(--accent)";
  const short=F.filter(m=>m.net<0).length, every=F.length>12?3:F.length>6?2:1;
  return `<div class="seg" role="group" aria-label="Forecast length" style="margin-top:12px">${[6,12,24].map(h=>`<button type="button" data-h="${h}" aria-pressed="${S.fcH===h}">${h} months</button>`).join("")}</div>
  <div style="height:12px"></div>${forecastChart(fc)}
  ${short?`<p class="note">${short} of ${F.length} months spend more than they bring in.${F.every(m=>!m.inc)?" No income is planned yet: add your salary in Plan.":""}</p>`:""}
  <div class="sh"><h3>Month by month</h3><span class="note" style="margin:0">tap a month for its items</span></div>
  ${F.map((m,i)=>`<details class="fm" ${i===0&&S.fcOpen0!==false?"":""}><summary><span class="mn">${mLabel(m.ym)}${i===0?' <span class="chip">unpaid only</span>':""}</span><span class="net ${m.bal<-0.5?"neg":""}">${money(m.bal)}</span>
    <span class="sub">In ${money(m.inc)} · Out ${money(m.out+m.inv)}</span><span class="bal">closing</span></summary>
    <div class="items">${m.rows.length?m.rows.map(r=>plannedRow(r,i===0)).join(""):'<div class="empty">Nothing planned.</div>'}</div></details>`).join("")}`;
}
/* card table: the bill due now and the total owed per card, totals on the header */
function cardTable(bal, fold){
  const cards=live("accounts").filter(a=>a.type==="card" && !a.hidden); if(!cards.length) return "";
  const all=cards.map(a=>{ const c=cardInfo(a), out=Math.max(0,-(bal.get(a.id)||0)); return {a, c, pay:c?c.dueLeft:0, out}; });
  const quiet=all.filter(r=>r.pay<=0.5 && r.out<=0.5 && r.c), showAll=!fold || S.allCards || quiet.length<2;
  const rows=showAll ? all : all.filter(r=>!quiet.includes(r)), tp=all.filter(r=>countsAcc(r.a)).reduce((x,r)=>x+r.pay,0), tu=all.filter(r=>countsAcc(r.a)).reduce((x,r)=>x+(r.c?r.c.unbilled:r.out),0), to=all.filter(r=>countsAcc(r.a)).reduce((x,r)=>x+r.out,0);
  return `<div class="cct">
    <div class="cchd"><div class="cn">Credit cards</div><div class="cv"><div class="cl">Bill due</div><div class="${tp>0.5?"neg":""}">${money(tp)}</div></div><div class="cv"><div class="cl">Unbilled</div><div>${money(tu)}</div></div></div>
    ${rows.map(({a,c,pay,out})=>`<div class="ccr tap" data-card="${esc(a.id)}" role="button" tabindex="0"><div class="cn"><div class="t">${esc(a.name)}</div>${!c?'<div class="s">Add statement and due day</div>':pay>0.5?`<div class="s">${dueText(c)}</div>`:""}</div><div class="cv amt ${pay>0.5?"neg":""}">${money(pay)}</div><div class="cv amt mut">${money(c?c.unbilled:out)}</div></div>`).join("")}
    <div class="ccfoot">Total owed on cards <b class="${to>0.5?"neg":""}">${money(to)}</b> <span class="mut">· bill due + unbilled</span></div>
    ${fold && quiet.length>=2 ? `<button class="ccmore" type="button" id="moreCards">${S.allCards?"Hide cards with nothing due":`${quiet.length} more cards with nothing due ›`}</button>`:""}
  </div>`;
}
function homeAccounts(bal){
  const banks=live("accounts").filter(a=>a.type!=="card" && countsAcc(a)), cards=live("accounts").filter(a=>a.type==="card" && countsAcc(a));
  const assets=banks.reduce((s,a)=>s+(bal.get(a.id)||0),0), liab=cards.reduce((s,a)=>s+Math.max(0,-(bal.get(a.id)||0)),0);
  return `
  <h2>Accounts <span class="sp"></span><button class="btn sm" type="button" data-go="accounts">Manage</button></h2>
  <div class="sumbar" style="margin-top:0">
    <div><div class="k">Assets</div><div class="v in">${money(assets)}</div></div>
    <div><div class="k">Liabilities</div><div class="v ${liab>0.5?"neg":""}">${money(liab)}</div></div>
    <div><div class="k">Total</div><div class="v">${money(assets-liab)}</div></div>
  </div>
  <p class="note" style="margin-top:12px">Bank accounts</p>
  <div class="list">${banks.map(a=>{const v=bal.get(a.id)||0; return `<div class="row"><div class="main"><div class="t">${esc(a.name)}</div></div><div class="amt ${v<0?"neg":""}">${money(v)}</div></div>`;}).join("")||'<div class="empty">No bank accounts yet.</div>'}</div>
  <div style="height:12px"></div>
  ${cardTable(bal)}`;
}
function vCard(){
  const a=byId("accounts",S.cardId); if(!a || a.deleted || a.type!=="card"){ S.view="more"; return vMore(); }
  const bal=balances().get(a.id)||0, c=cardInfo(a), k=S.cyc||0, tab=S.cardTab||"billed";
  const tile=(t,v,sub="",cls="")=>`<div class="tile"><div class="k">${t}</div><div class="v ${cls}">${v}</div>${sub?`<div class="s" style="font-size:12px;color:var(--muted)">${sub}</div>`:""}</div>`;
  const txRow=t=>{ const e=cardEff(a,t), pay=e>0;
    const title = t.type==="transfer" ? (pay?`Payment from ${accName(t.accountId)}`:`Transfer to ${accName(t.toAccountId)}`) : t.type==="investment" ? (t.instrument||"Investment") : (t.note||catName(t.categoryId));
    const sub = t.type==="expense"||t.type==="income" ? catName(t.categoryId) : t.type==="transfer" ? "Transfer" : ACT_LBL[t.act]||"";
    return `<div class="row tap" data-tx="${esc(t.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div></div><div class="amt ${pay?"in":""}">${pay?"+":""}${money(Math.abs(e))}</div></div>`; };
  /* transactions grouped by day, newest first, with each day's spends and payments (Money Manager daily view) */
  const byDay=(list, lead="")=>{
    if(!list.length && !lead) return '<div class="list"><div class="empty">No transactions in this period.</div></div>';
    const g=new Map(); for(const t of list){ if(!g.has(t.date)) g.set(t.date,[]); g.get(t.date).push(t); }
    return [...g.entries()].map(([d,ts])=>{ const dt=new Date(d+"T00:00"), sp=ts.reduce((x,t)=>x+Math.max(0,-cardEff(a,t)),0), pd=ts.reduce((x,t)=>x+Math.max(0,cardEff(a,t)),0);
      return `<div class="dayhd"><span class="dd">${dt.getDate()}</span><span class="dw">${dt.toLocaleDateString("en-IN",{weekday:"short"})}</span><span class="dm">${MN[dt.getMonth()]} ${dt.getFullYear()}</span><span class="sp"></span>${pd?`<span class="amt in">+${money(pd)}</span>`:""}${sp?`<span class="amt">${money(sp)}</span>`:""}</div><div class="list">${ts.map(txRow).join("")}</div>`; }).join("") + lead;
  };
  const head = `
  <div class="monthbar"><button class="btn sm" type="button" data-go="accounts" aria-label="Back to Accounts">‹</button><div class="m" style="text-align:left">${esc(a.name)}</div><span class="chip">Credit card</span></div>`;
  const acts = `<div class="btns" style="margin-top:12px"><button class="btn sm pri" type="button" data-ca="pay">Pay bill</button><button class="btn sm" type="button" data-ca="spend">Add spend</button><button class="btn sm" type="button" data-ca="edit">Edit card</button></div>`;
  if(!c) return `${head}<div class="sumbar"><div><div class="k">Outstanding</div><div class="v neg">${money(Math.max(0,-bal))}</div></div></div>
    <div class="banner">Add the card's statement day and due day to see the payable amount and due date.</div>${acts}${cardDetails(a,bal)}
    <h2>Transactions</h2>${byDay(cardTx(a,"0000"))}`;
  const cc=cardInfo(a,k), first=!live("txns").some(t=>!isHist(t) && t.date<=cc.prev && cardEff(a,t)!==0);
  const billedTx=cardTx(a, cc.prev, cc.stmt), unb=cardTx(a, c.stmt, null);
  const payTx=cardTx(a, cc.stmt, k===0?null:cc.next).filter(t=>cardEff(a,t)>0);
  const spendUnb=unb.reduce((s,t)=>s+Math.max(0,-cardEff(a,t)),0);
  const od=openDateOf(a), opRow=lbl=>`<div class="dayhd"><span class="dm">${lbl}</span></div><div class="list"><div class="row"><div class="main"><div class="t">Opening balance</div><div class="s">Carried in from Money Manager</div></div><div class="amt">${money(Math.abs(+a.opening))}</div></div></div>`;
  const opening = !+a.opening ? "" : od ? (od>cc.prev && od<=cc.stmt ? opRow(`From ${fmtD(od)}`) : "") : (first ? opRow(`Before ${fmtD(addDay(cc.prev))}`) : "");
  const openingUnb = +a.opening && od && od>c.stmt ? opRow(`From ${fmtD(od)}`) : "";
  return `${head}
  <div class="sumbar">
    <div><div class="k">Payable</div><div class="v ${c.dueLeft>0.5?"neg":""}">${money(c.dueLeft)}</div></div>
    <div><div class="k">Outstanding</div><div class="v">${money(c.owed)}</div></div>
    <div><div class="k">Due</div><div class="v sm">${c.due?fmtD(c.due):"—"}</div></div>
  </div>
  <p class="note" style="text-align:center">${dueText(c)}</p>
  <p class="note" style="text-align:center;margin-top:-4px">Bill ${money(c.billed)} on ${fmtD(c.stmt)} · paid ${money(c.paid)} · unbilled ${money(c.unbilled)}</p>
  ${acts}${cardDetails(a,bal)}
  <div class="seg" role="group" aria-label="Card view" style="margin-top:16px">${[["billed",`Billed · ${money(c.dueLeft)}`],["unbilled",`Unbilled · ${money(c.unbilled)}`]].map(([v,l])=>`<button type="button" data-ct="${v}" aria-pressed="${tab===v}">${l}</button>`).join("")}</div>
  ${tab==="billed" ? `
  <div class="monthbar"><button class="btn sm" type="button" data-cyc="1" aria-label="Earlier statement">‹</button><div class="m" style="font-size:14px">${fmtD(addDay(cc.prev))} – ${fmtD(cc.stmt)}<div class="note" style="margin:0;font-weight:400">Bill ${money(cc.billed)} · paid ${money(cc.paid)} · ${cc.dueLeft>0.5?`left ${money(cc.dueLeft)}`:"settled"}${cc.due?` · due ${fmtD(cc.due)}`:""}</div></div><button class="btn sm" type="button" data-cyc="-1" aria-label="Later statement" ${k===0?"disabled":""}>›</button></div>
  ${byDay(billedTx, opening)}
  ${payTx.length?`<h2>Payments toward this bill</h2>${byDay(payTx)}`:""}`
  : `
  <p class="note" style="text-align:center;margin-top:12px">${money(c.unbilled)} unbilled since ${fmtD(c.stmt)}${openingUnb?" (includes the opening balance)":""} · goes into the ${fmtD(c.next)} statement</p>
  ${byDay(unb, openingUnb)}`}`;
}
const addDay = d => { const x=new Date(d+"T00:00"); x.setDate(x.getDate()+1); return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`; };
/* ---------- Transactions: every entry, filterable ---------- */
/* tags: free labels on transactions (Home, Office, Trip...) for filtering; a transaction can have several */
const allTags = () => { const m=new Map(); for(const t of live("txns")) for(const g of (t.tags||[])) m.set(g,(m.get(g)||0)+1); return [...m.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([g])=>g); };
/* note suggestions from every earlier note: words you start typing match first, then anywhere in the note */
function noteSuggest(sheet){
  const inp=sheet.querySelector("#f_note"); if(!inp) return;
  const stats=new Map();
  for(const t of live("txns")){ if(!["expense","income","transfer","investment"].includes(t.type)) continue; const n=(t.note||"").trim(); if(!n) continue; const k=n.toLowerCase(), e=stats.get(k)||{text:n,count:0,last:""}; e.count++; if(t.date>e.last){ e.last=t.date; e.text=n; } stats.set(k,e); }
  const all=[...stats.values()];
  inp.setAttribute("autocomplete","off"); inp.setAttribute("role","combobox"); inp.setAttribute("aria-autocomplete","list"); inp.setAttribute("aria-expanded","false");
  const box=document.createElement("div"); box.className="sugg"; box.id="noteSugg"; box.setAttribute("role","listbox"); box.hidden=true;
  inp.parentNode.style.position="relative"; inp.insertAdjacentElement("afterend", box);
  let items=[], hi=-1;
  const close=()=>{ box.hidden=true; inp.setAttribute("aria-expanded","false"); hi=-1; };
  const pick=v=>{ inp.value=v; close(); inp.dispatchEvent(new Event("input",{bubbles:true})); };
  const draw=()=>{
    const q=inp.value.trim().toLowerCase(); if(!q){ close(); return; }
    const score=e=>{ const k=e.text.toLowerCase(); return k===q?-1:k.startsWith(q)?0:k.split(/\s+/).some(w=>w.startsWith(q))?1:k.includes(q)?2:9; };
    items=all.map(e=>[e,score(e)]).filter(([,sc])=>sc>=0&&sc<9).sort((a,b)=>a[1]-b[1]||b[0].count-a[0].count||b[0].last.localeCompare(a[0].last)).slice(0,6).map(([e])=>e);
    if(!items.length){ close(); return; }
    box.innerHTML=items.map((e,i)=>`<button type="button" role="option" class="sopt ${i===hi?"on":""}" data-i="${i}" aria-selected="${i===hi}"><span>${esc(e.text)}</span><span class="sc">${e.count}×</span></button>`).join("");
    box.hidden=false; inp.setAttribute("aria-expanded","true");
  };
  inp.addEventListener("input", e=>{ if(e.isTrusted!==false) { hi=-1; draw(); } });
  inp.addEventListener("focus", draw);
  inp.addEventListener("keydown", e=>{
    if(box.hidden) return;
    if(e.key==="ArrowDown"){ e.preventDefault(); hi=Math.min(items.length-1,hi+1); draw(); }
    else if(e.key==="ArrowUp"){ e.preventDefault(); hi=Math.max(0,hi-1); draw(); }
    else if(e.key==="Enter" && hi>=0){ e.preventDefault(); pick(items[hi].text); }
    else if(e.key==="Escape"){ e.stopPropagation(); close(); }
  });
  box.addEventListener("pointerdown", e=>{ const b=e.target.closest("[data-i]"); if(!b) return; e.preventDefault(); pick(items[+b.dataset.i].text); });
  inp.addEventListener("blur", ()=>setTimeout(close,120));
}
function tagPicker(sheet, initial){
  const sel=new Set(initial||[]), host=sheet.querySelector("#w_tags .tagbox");
  const draw=()=>{ const tags=[...new Set([...allTags(), ...sel])];
    host.innerHTML = tags.map(g=>`<button type="button" class="tagchip ${sel.has(g)?"on":""}" data-tg="${esc(g)}" aria-pressed="${sel.has(g)}">${esc(g)}</button>`).join("")
      + `<span class="tagnew"><input type="text" id="tagNew" placeholder="New tag" maxlength="30" aria-label="New tag"><button type="button" class="btn sm" id="tagAdd">Add</button></span>`;
    host.querySelectorAll("[data-tg]").forEach(b=>b.onclick=e=>{ e.stopPropagation(); const g=b.dataset.tg; sel.has(g)?sel.delete(g):sel.add(g); draw(); });
    const inp=host.querySelector("#tagNew"), add=()=>{ const g=inp.value.trim().replace(/\s+/g," "); if(!g) return; const ex=[...sel,...allTags()].find(x=>x.toLowerCase()===g.toLowerCase()); sel.add(ex||g); draw(); host.querySelector("#tagNew").focus(); };
    host.querySelector("#tagAdd").onclick=e=>{ e.stopPropagation(); add(); };
    inp.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); add(); } };
  };
  draw();
  return ()=>{ const pending=sheet.querySelector("#tagNew")?.value.trim(); if(pending){ const ex=allTags().find(x=>x.toLowerCase()===pending.toLowerCase()); sel.add(ex||pending); } return [...sel]; };
}
/* "Paid by spouse": Home expenses she pays from her own account. They have no account here, so they never touch
   balances, budgets, card bills or net worth, and stay out of your income/expense totals — they only add to the Home view. */
const SPOUSE="@spouse", SPOUSE_LBL="Spouse";
/* "No balance kept": Spouse (her money, Home only), Cash and Pluxee (yours, but no balance tracked).
   These entries never change a balance and stay out of your Spent / Month / Year totals — cash is counted once,
   when you withdraw it — but they show in the transaction list, tag views (Home) and Excel. */
/* payers are set up in Settings › "Paid without a balance". own:true = your money (cash, meal card), own:false = someone
   else's (spouse). tag = tag added automatically. Defaults are seeded once with fixed ids and an old timestamp, so any
   synced edit always wins over them. */
const PAYER_DEFAULTS=[{id:"spouse",name:"Spouse",own:false,tag:"Home"},{id:"cash",name:"Cash",own:true,tag:""},{id:"pluxee",name:"Pluxee",own:true,tag:""}];
function ensurePayers(){ if(!S.data) return; S.data.payers=S.data.payers||[]; if(S.data.payers.length) return; for(const d of PAYER_DEFAULTS) S.data.payers.push({...d, updatedAt:1}); }
const PAYERS_ALL = () => (S.data && S.data.payers) || [];
const payers = () => live("payers").sort((a,b)=>(a.own===b.own?0:a.own?1:-1)||a.name.localeCompare(b.name));
const payerOf = t => t.paidBy ? (PAYERS_ALL().find(p=>p.id===t.paidBy) || {id:t.paidBy, name:t.paidBy, own:true}) : null;
const payerLbl = t => (payerOf(t)||{}).name || "";
const offBook = t => !!t.paidBy;
const othersPaid = t => { const p=payerOf(t); return !!p && !p.own; };
const payerNote = p => p.own
  ? `No ${p.name} balance is kept and it isn't added to your totals (for cash, record the ATM withdrawal as the spending). It shows in the list and under its tags.`
  : `Paid by ${p.name} with their own money. It isn't in your balances or totals; it shows in the list and under its tags${p.tag?`, tagged ${p.tag} automatically`:""}.`;
const othersName = () => { const o=payers().filter(p=>!p.own); return o.length===1 ? o[0].name : "others"; };
const homeTag = () => allTags().find(g=>/^home$/i.test(g)) || "Home";
const isHomeTag = g => !!g && /^home$/i.test(g);
const bySpouse = othersPaid;
const TX_TYPES=[["all","All"],["expense","Expense"],["income","Income"],["transfer","Transfer"],["investment","Investment"],["loan","Loan"],["epf","EPF & PPF"],["trade","Trades"]];
const PERIODS=[["month","Month"],["3m","Last 3 months"],["year","This year"],["all","All time"],["custom","Custom range"]];
const txFilter = () => (S.f = S.f || {type:"all", cat:"", acc:"", tag:"", period:"month", from:"", to:"", q:""});
function txMatches(t, f){
  if(f.type!=="all" && t.type!==f.type && !(f.type==="income" && t.type==="carry" && t.dir==="in")) return false;
  if(f.cat){ const c=byId("categories",t.categoryId); if(!c || (c.id!==f.cat && c.parentId!==f.cat)) return false; }
  if(f.acc){ if(f.acc.startsWith("@")){ if(t.paidBy!==f.acc.slice(1)) return false; } else if(t.accountId!==f.acc && t.toAccountId!==f.acc) return false; }
  if(f.min && +t.amount < +f.min) return false;
  if(f.max && +t.amount > +f.max) return false;
  if(f.hist==="only" && !t.hist) return false;
  if(f.hist==="none" && t.hist) return false;
  if(f.uncat && !((t.type==="expense"||t.type==="income") && !byId("categories",t.categoryId))) return false;
  const d=t.date, now=today();
  if(f.period==="month" && ymOf(d)!==S.month) return false;
  if(f.period==="3m" && d < addM(ymOf(now),-2)+"-01") return false;
  if(f.period==="year" && d.slice(0,4)!==now.slice(0,4)) return false;
  if(f.period==="custom" && ((f.from && d<f.from) || (f.to && d>f.to))) return false;
  if(f.tag && !(t.tags||[]).includes(f.tag)) return false;
  if(f.q){ const q=f.q.toLowerCase(), ln=t.loanId?byId("loans",t.loanId):null;
    const hay=[...(t.tags||[]), t.note, t.instrument, t.categoryId&&catName(t.categoryId), accName(t.accountId), t.toAccountId&&accName(t.toAccountId), ln&&ln.name, String(t.amount)].filter(Boolean).join(" ").toLowerCase();
    if(!hay.includes(q)) return false; }
  return true;
}
/* effect of a txn on one account's balance */
function accEff(id,t){
  const amt=+t.amount;
  if(t.type==="carry") return t.accountId===id ? (t.dir==="in" ? +t.carry : -t.carry) : 0;
  if(t.type==="transfer") return t.toAccountId===id ? amt : t.accountId===id ? -amt : 0;
  if(t.accountId!==id) return 0;
  if(t.type==="income") return amt;
  if(t.type==="loan") return t.act==="borrow" ? amt : -amt;
  return -amt;
}
/* ---------- presentation: icon tile for a transaction row (no effect on data) ---------- */
const ICO={
  food:'<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v6a2 2 0 0 1-2 2M7 3v6M16 3c-1.7 1.2-2.5 3-2.5 5.5 0 2 1 3 2.5 3.2V21"/>',
  cart:'<path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.3h8.6a1.5 1.5 0 0 0 1.5-1.2L20 8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  home:'<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
  car:'<path d="M5 16v2.5M19 16v2.5M4 16h16v-4l-1.8-4.6A2 2 0 0 0 16.3 6H7.7a2 2 0 0 0-1.9 1.4L4 12z"/><path d="M4 12h16"/><circle cx="7.5" cy="14" r=".6"/><circle cx="16.5" cy="14" r=".6"/>',
  plane:'<path d="M10.5 13.5 4 11l1.5-1.5 6.5 1L16.5 6a2 2 0 0 1 2.8 2.8L15 13.3l1 6.5-1.5 1.5-2.5-6.5L9 17.5V20l-1.5 1L6 17.5 3 16l1-1.5h2.5z"/>',
  heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M8 11.5h2l1-2 2 4 1-2h2"/>',
  bag:'<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  bolt:'<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  wifi:'<path d="M4.5 9.5a11 11 0 0 1 15 0M7.5 12.8a6.5 6.5 0 0 1 9 0M10.5 16a2 2 0 0 1 3 0"/><circle cx="12" cy="18.6" r=".6"/>',
  play:'<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>',
  book:'<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z"/>',
  gift:'<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9S10.5 4 8 5s1 4 4 4c3 0 5.5-3 4-4s-4 4-4 4"/>',
  lamp:'<path d="M12 3c1.5 2 2.5 3.2 2.5 4.7a2.5 2.5 0 0 1-5 0C9.5 6.2 10.5 5 12 3z"/><path d="M5 14h14l-2 4H7zM9 21h6M12 10.5V14"/>',
  receipt:'<path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  shield:'<path d="M12 3 5 6v5.5c0 4.3 3 7.7 7 9.5 4-1.8 7-5.2 7-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  wallet:'<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M16 13.5h1.5"/>',
  trend:'<path d="M3 17 9.5 10.5l4 4L21 7"/><path d="M15 7h6v6"/>',
  bank:'<path d="M3.5 9 12 4l8.5 5zM5 9v8M9.5 9v8M14.5 9v8M19 9v8M3.5 20h17"/>',
  swap:'<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  cash:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>',
  spark:'<path d="M12 3.5 13.8 9 19.5 10.5 13.8 12 12 17.5 10.2 12 4.5 10.5 10.2 9z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  repeat:'<path d="M17 3l3 3-3 3"/><path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M7 21l-3-3 3-3"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4"/>',
  people:'<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.8a3 3 0 0 1 0 5.4M17.5 14.2A5.5 5.5 0 0 1 20.5 19"/>',
  tag:'<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.3 6.3a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.3"/>',
  carry:'<path d="M4 12h13M13 7l5 5-5 5"/><path d="M20 5v14"/>'
};
const ICO_RULES=[
  [/salary|freelance|income|reimburse|splitwise|refund/i,"wallet","green"],[/cashback|reward|dividend|interest &|^interest/i,"spark","green"],
  [/emi|loan/i,"bank","violet"],[/invest|sip|mutual|stock|ppf|nps|gold/i,"trend","teal"],
  [/grocer|household/i,"cart","green"],[/food|eat|restaurant|swiggy|zomato|dining|snack|delivery/i,"food","amber"],
  [/fuel|transport|cab|uber|ola|auto|metro|parking|toll/i,"car","blue"],[/travel|trip|flight|hotel/i,"plane","blue"],
  [/health|medic|doctor|pharm|hospital|gym|fitness/i,"heart","rose"],[/apparel|shopping|cloth|amazon|flipkart/i,"bag","coral"],
  [/electric|power|utilit|gas|water/i,"bolt","amber"],[/broadband|mobile|internet|recharge|phone/i,"wifi","blue"],
  [/subscri|netflix|youtube|prime|spotify/i,"repeat","violet"],[/entertain|movie|film/i,"play","violet"],
  [/educat|school|course|book|tuition/i,"book","blue"],[/gift|social/i,"gift","rose"],
  [/pooja|temple|spirit|donat|vaastu|vastu/i,"lamp","amber"],[/fee|charge|tax|legal/i,"receipt","sand"],
  [/insur/i,"shield","teal"],[/rent|maint|housing|home|furniture|property/i,"home","sand"],
  [/beauty|groom|personal|salon/i,"spark","rose"],[/family|support/i,"people","coral"],[/cash/i,"cash","green"]
];
function txIcon(t){
  let k="tag", h="sand";
  if(t.type==="carry"){ k="carry"; h="teal"; }
  else if(t.type==="transfer"){ k="swap"; h="sand"; }
  else if(t.type==="investment"){ k="trend"; h="teal"; }
  else if(t.type==="loan"){ k="bank"; h="violet"; }
  else { const hay=[catName(t.categoryId)||"", t.type==="income"?"income":""].join(" "); const r=ICO_RULES.find(([re])=>re.test(hay)); if(r){ k=r[1]; h=r[2]; } else if(t.type==="income"){ k="wallet"; h="green"; } }
  return `<span class="ico ${h}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICO[k]}</svg></span>`;
}
function txLine(t){
  let title, sub, cls="out", sign="";
  if(t.type==="trade") return `<div class="row tap epftx" data-tx="${esc(t.id)}" role="button" tabindex="0">${txIcon({type:"investment"})}<div class="main"><div class="t">${esc(t.title)}</div><div class="s">${esc(t.sub)}</div></div><div class="amt ${t.out?"in":"mute"}">${t.out?"+":""}${t.ccy==="USD"?usd(t.amount):moneyP(t.amount)}</div></div>`;
  if(t.type==="epf") return `<div class="row tap epftx" data-tx="${esc(t.id)}" role="button" tabindex="0">${txIcon({type:"investment"})}<div class="main"><div class="t">${esc(t.title)}</div><div class="s">${esc(t.sub)}</div></div><div class="amt ${t.out?"out":"mute"}">${t.out?"−":"+"}${moneyP(t.amount)}</div></div>`;
  if(t.type==="carry"){ const v=t.dir==="in"?+t.carry:-t.carry;
    return `<div class="row tap" data-tx="${esc(t.id)}" role="button" tabindex="0">${txIcon(t)}<div class="main"><div class="t">${t.dir==="in"?"Last month balance":"Carried to next month"}</div><div class="s">${t.dir==="in"?`From ${mLabel(t.ym)}`:`Into ${mLabel(addM(t.ym,1))}`} · ${esc(accName(t.accountId))}</div></div><div class="amt ${v>=0?"in":""}">${v>=0?"+":"−"}${moneyP(Math.abs(v))}</div></div>`; }
  if(t.type==="transfer"){ title=`${accName(t.accountId)} → ${accName(t.toAccountId)}`; sub=t.note?`Transfer · ${t.note}`:"Transfer"; cls="mute"; }
  else if(t.type==="investment"){ title=t.instrument||"Investment"; sub=`Investment · ${accName(t.accountId)}${invChg(t)?` · ${moneyP(invNet(t))} invested + ${moneyP(invChg(t))} charges`:""}`; }
  else if(t.type==="loan"){ const ln=byId("loans",t.loanId); title=`${ln?ln.name:"Loan"} · ${ACT_LBL[t.act]}${t.act==="missed"?" "+mShort(t.ym):""}`; sub=t.act==="missed"?`Paid to the bank by ${ln?.lender||"relative"} · now owed to them`:`Loan${t.part==="bank"&&t.act==="borrow"?" (bank part)":""} · ${t.accountId?accName(t.accountId):"No account"}`; if(t.act==="borrow"){cls="in";sign="+";} if(t.act==="missed") cls="mute"; }
  else { title=t.note||catName(t.categoryId); sub=`${t.note?catName(t.categoryId)+" · ":""}${t.paidBy?(othersPaid(t)?"Paid by "+payerLbl(t):payerLbl(t))+" · not in totals":t.fromLoan?fromLoanName(t):accName(t.accountId)+(fundsOf(t).length&&!t.fromLoan?` · ${fundNames(fundsOf(t))} money`:"")}`; if(t.type==="income"){cls="in";sign="+";} if(t.paidBy) cls="mute"; }
  if(t.budgetId && byId("recurring",t.budgetId)) sub+=` · ${byId("recurring",t.budgetId).name} budget`;
  if(t.splitOf) sub+=" · split";
  if(t.hist && t.date>="2026-11-01") sub+=" · already in balances";
  const selC = S.selOn && S.view==="activity" ? ` selon ${SEL().has(t.id)?"picked":""}` : "";
  return `<div class="row tap${selC}" data-tx="${esc(t.id)}" role="button" tabindex="0" ${selC?`aria-pressed="${SEL().has(t.id)}"`:""}>${txIcon(t)}<div class="main"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div>${(t.tags||[]).length?`<div class="tagrow">${t.tags.map(g=>`<span class="tagmini">${esc(g)}</span>`).join("")}</div>`:""}</div><div class="amt ${cls}">${sign}${moneyP(t.amount)}</div></div>`;
}
function vActivity(){
  const f=txFilter();
  const tx=live("txns").filter(t=>txMatches(t,f)).sort((a,b)=>b.date.localeCompare(a.date)||(b.updatedAt-a.updatedAt));
  const homeF=!!f.tag;
  const tot={income:0, expense:0, investment:0}, sp={n:0, v:0}, ob={n:0, v:0, who:new Set()}; for(const t of tx){ if(t.paidBy){ ob.n++; ob.v+=+t.amount; ob.who.add(payerLbl(t)); if(bySpouse(t)){ sp.n++; sp.v+=+t.amount; } continue; } if(tot[t.type]!==undefined) tot[t.type]+=+t.amount; else if(t.type==="carry" && t.dir==="in") tot.income+=+t.carry; }
  const acc=f.acc?byId("accounts",f.acc):null;
  let ain=0, aout=0; if(acc) for(const t of tx){ const e=accEff(acc.id,t); if(e>0) ain+=e; else aout-=e; }
  const byCat=new Map(); for(const t of tx) if(t.type==="expense" && (homeF || !offBook(t))){ const k=f.cat?t.categoryId:catTop(t.categoryId); byCat.set(k,(byCat.get(k)||0)+ +t.amount); }
  const cats=[...byCat.entries()].sort((a,b)=>b[1]-a[1]); const max=cats[0]?.[1]||1;
  /* EPF passbook entries: listed for reference, never counted in the totals above */
  const etx = (f.cat||f.acc||f.tag||f.uncat||f.hist==="only"||S.selOn) ? [] : epfTxItems().concat(ppfTxItems(), tradeTxItems()).filter(t=>txMatches(t,f));
  const all = etx.length ? tx.concat(etx).sort((a,b)=>b.date.localeCompare(a.date)||(b.updatedAt-a.updatedAt)) : tx;
  const shown=all.slice(0, S.txLimit||300), more=all.length-shown.length;
  const g2=new Map(); for(const t of shown){ if(!g2.has(t.date)) g2.set(t.date,[]); g2.get(t.date).push(t); }
  const chip=(k,label)=>`<button type="button" class="chip fchip" data-fclear="${k}" aria-label="Remove filter ${esc(label)}">${esc(label)} ✕</button>`;
  const pyF=f.acc&&f.acc.startsWith("@")?PAYERS_ALL().find(p=>"@"+p.id===f.acc):null;
  const actChips=[f.tag&&chip("tag",`Tag: ${f.tag}`), f.cat&&chip("cat",catName(f.cat)), acc&&chip("acc",acc.name), pyF&&chip("acc",`Paid by ${pyF.name}`), (f.min||f.max)&&chip("amt",f.min&&f.max?`₹${f.min} – ₹${f.max}`:f.min?`From ₹${f.min}`:`Up to ₹${f.max}`), f.hist&&chip("hist",f.hist==="only"?"Only history":"No history"), f.uncat&&chip("uncat","Uncategorised"), f.period!=="month"&&chip("period", f.period==="custom"?`${f.from?fmtD(f.from):"…"} – ${f.to?fmtD(f.to):"…"}`:PERIODS.find(p=>p[0]===f.period)[1]), f.q&&chip("q",`"${f.q}"`)].filter(Boolean);
  const dayTot=ts=>{ let i=0,o=0; for(const t of ts){ if(acc){ const e=accEff(acc.id,t); if(e>0) i+=e; else o-=e; } else if(t.type==="income") i+=+t.amount; else if(t.type==="expense" && (homeF || !offBook(t))) o+=+t.amount; else if(t.type==="carry"){ const v=t.dir==="in"?+t.carry:-t.carry; if(v>0) i+=v; else o-=v; } } return `${i?`<span class="amt in">+${money(i)}</span>`:""}${o?`<span class="amt">${money(o)}</span>`:""}`; };
  const tiles = acc
    ? `<div class="sr"><span>Money in</span><b class="in">${money(ain)}</b></div><div class="sr"><span>Money out</span><b>${money(aout)}</b></div><div class="sr tot"><span>Net</span><b class="${ain-aout<0?"neg":""}">${money(ain-aout)}</b></div>`
    : homeF
    ? `<div class="sr"><span>Paid by you</span><b>${money(tot.expense+ob.v-sp.v)}</b></div>${sp.v>0.5?`<div class="sr"><span>Paid by ${esc(othersName())}</span><b>${money(sp.v)}</b></div>`:""}<div class="sr tot"><span>Total ${esc(f.tag)}</span><b>${money(tot.expense+ob.v)}</b></div>`
    : `<div class="sr"><span>Spent (recorded)</span><b>${money(tot.expense)}</b></div><div class="sr"><span>Income</span><b class="in">${money(tot.income)}</b></div><div class="sr"><span>Invested</span><b>${money(tot.investment)}</b></div>${ob.n?`<div class="sr cnt"><span>Not counted: ${money(ob.v)} paid by ${[...ob.who].join(", ")} (no balance kept)</span></div>`:""}`;
  return `
  <div class="cols tx"><div>
  <div class="txsearch"><input type="search" id="txq" placeholder="Search notes, categories, accounts, amounts" value="${esc(f.q)}" autocomplete="off" aria-label="Search transactions"><button class="btn sm" type="button" id="txFilters">Filters${actChips.length?` (${actChips.length})`:""}</button></div>
  ${viewChips()}
  <div class="btns" style="margin-top:8px"><button class="btn sm" type="button" id="txSel">${S.selOn?"Selecting…":"Select"}</button><button class="btn sm" type="button" id="txClean">Clean up</button></div>
  ${allTags().length?`<div class="typechips" role="group" aria-label="Tags">${allTags().map(g=>`<button type="button" class="tagchip ${f.tag===g?"on":""}" data-ftag="${esc(g)}" aria-pressed="${f.tag===g}">${esc(g)}</button>`).join("")}</div>`:""}
  <div class="typechips" role="group" aria-label="Type">${TX_TYPES.map(([k,l])=>`<button type="button" class="chip ${f.type===k?"":"mute"} fchip" data-ftype="${k}" aria-pressed="${f.type===k}">${l}</button>`).join("")}</div>
  ${actChips.length?`<div class="typechips">${actChips.join("")}<button type="button" class="chip mute fchip" data-fclear="all">Clear all</button></div>`:""}
  ${f.period==="month"?`<div class="monthbar"><button class="btn sm" type="button" data-m="-1" aria-label="Previous month">‹</button><div class="m"><label class="pick">${mLabel(S.month)}<input type="month" id="mpick" value="${S.month}" aria-label="Pick a month"></label></div><button class="btn sm" type="button" data-m="1" aria-label="Next month">›</button></div>`:""}
  <div class="sumcard">${tiles}<div class="sr cnt"><span>${tx.length} transaction${tx.length===1?"":"s"}${acc?` touching ${esc(acc.name)}`:""}${etx.length?` + ${etx.length} EPF / trade entr${etx.length===1?"y":"ies"} (not counted)`:""}</span></div></div>
  ${(()=>{ const m=mainAcc(); if(!m || f.period!=="month" || f.cat || f.acc || f.tag || f.q || f.type!=="all") return "";
    const net=monthNet(m.id,S.month), co=live("txns").find(t=>t.type==="carry"&&t.dir==="out"&&t.ym===S.month&&t.accountId===m.id);
    return `<div class="list" style="margin-bottom:8px"><div class="row ${co?"tap":""}" ${co?`data-tx="${esc(co.id)}" role="button" tabindex="0"`:""}><div class="main"><div class="t">${esc(m.name)}: money in − out this month</div><div class="s">${co?`${money(co.carry)} carried to ${mLabel(addM(S.month,1))} · tap to edit`:S.month<ymOf(today())?"Nothing to carry":"Entries recorded so far · carries to next month on the 1st"}</div></div><div class="amt ${net<0?"neg":""}">${money(net)}</div></div></div>`; })()}
  ${cats.length>1 && (f.type==="all"||f.type==="expense")?`<details class="fm"><summary><span class="mn">Spending by ${f.cat?"subcategory":"category"}</span><span class="sub" style="text-align:right">${cats.length}</span></summary><div class="list" style="border:0;border-top:1px solid var(--line);border-radius:0">${cats.map(([c,v])=>`<div class="row tap" data-fcat="${esc(f.cat?c:c)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(f.cat?catName(c):catName(c))}</div><div class="bar"><i style="width:${(v/max*100).toFixed(1)}%"></i></div></div><div class="amt">${money(v)}</div></div>`).join("")}</div></details>`:""}
  </div><div>
  ${g2.size?[...g2.entries()].map(([d,ts])=>{ const dt=new Date(d+"T00:00"); return `<div class="dayhd"><span class="dd">${dt.getDate()}</span><span class="dw">${dt.toLocaleDateString("en-IN",{weekday:"short"})}</span><span class="dm">${MN[dt.getMonth()]} ${dt.getFullYear()}</span><span class="sp"></span>${dayTot(ts)}</div><div class="list">${ts.map(txLine).join("")}</div>`; }).join(""):`<div class="list"><div class="empty">${live("txns").length?"No transactions match these filters.":"No transactions yet. Tap + to add one."}</div></div>`}
  ${more>0?`<div class="btns" style="margin-top:12px;justify-content:center"><button class="btn" type="button" id="txMore">Show ${Math.min(more,300)} more</button></div>`:""}
  ${S.selOn?'<div style="height:72px"></div>':""}</div></div>${bulkBar()}`;
}
function tagSheet(g){
  const n=live("txns").filter(t=>(t.tags||[]).includes(g)).length;
  openSheet(`Tag: ${g}`, `${field(["name","Name","text",{value:g}])}<p class="note">Used on ${n} transaction${n===1?"":"s"}. Renaming updates all of them; removing takes the tag off them (the transactions stay).</p>
    <div class="btns"><button class="btn pri" id="sv" type="button">Rename</button><button class="btn danger" id="dl" type="button">Remove tag</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    const apply=fn=>{ for(const t of live("txns")) if((t.tags||[]).includes(g)){ const nt=fn(t.tags); if(nt.length) t.tags=nt; else delete t.tags; stamp(t); } const f=txFilter(); if(f.tag===g) f.tag=""; closeModal(); changed(); };
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#sv").onclick=()=>{ const nn=val("name").replace(/\s+/g," "); if(!nn){ toast("Enter a name."); return; } if(nn===g){ closeModal(); return; } apply(tags=>[...new Set(tags.map(x=>x===g?nn:x))]); toast(`Renamed to ${nn}`); };
    s.querySelector("#dl").onclick=()=>askConfirm(`Remove the tag "${g}" from ${n} transaction${n===1?"":"s"}?`,"Remove",()=>{ apply(tags=>tags.filter(x=>x!==g)); toast("Tag removed"); });
  });
}
function txFilterSheet(){
  const f=txFilter();
  openSheet("Filter transactions", `
    ${field(["categoryId","Category (includes its subcategories)","select",{value:f.cat,options:[["","All categories"],...catOpts()]}])}
    ${field(["accountId","Account, card or paid by","select",{value:f.acc,options:[["","All accounts"],...live("accounts").filter(a=>!a.hidden || a.id===f.acc).map(a=>[a.id,a.name]),...payers().map(p=>["@"+p.id,"Paid by "+p.name])]}])}
    <div class="grid2">${field(["min","Amount from (₹)","number",{value:f.min||"",step:"1"}])}${field(["max","Amount up to (₹)","number",{value:f.max||"",step:"1"}])}</div>
    ${field(["hist","Money Manager history","select",{value:f.hist||"",options:[["","Include"],["none","Leave out"],["only","Only history"]]}])}
    <label class="opt"><input type="checkbox" id="f_uncat" ${f.uncat?"checked":""}><div><b>Only uncategorised</b><span>Expenses and income with no category.</span></div></label>
    ${allTags().length?field(["tag","Tag","select",{value:f.tag||"",options:[["","Any tag"],...allTags().map(g=>[g,g])]}]):""}
    ${field(["period","Period","select",{value:f.period,options:PERIODS}])}
    <div class="grid2" id="w_range">${field(["from","From","date",{value:f.from}])}${field(["to","To","date",{value:f.to}])}</div>
    <div class="btns"><button class="btn pri" id="sv" type="button">Apply</button><button class="btn" id="rs" type="button">Reset</button><button class="btn" id="cx" type="button">Cancel</button></div>
    <p class="sect">Saved views</p>
    <div class="grid2" style="align-items:end">${field(["vname","Save these filters as","text",{ph:"e.g. Big spends, Trip 2026"}])}<div class="f"><button class="btn" id="vsave" type="button" style="width:100%">Save view</button></div></div>
    ${live("views").length?`<div class="list">${live("views").map(v=>`<div class="row"><div class="main"><div class="t">★ ${esc(v.name)}</div></div><button class="btn sm danger" type="button" data-vdel="${esc(v.id)}">Remove</button></div>`).join("")}</div>`:'<p class="note">Saved views show as chips at the top of Transactions and sync to all your devices.</p>'}`, s=>{
    const sync=()=>{ $("#w_range").hidden = val("period")!=="custom"; }; $("#f_period").onchange=sync; sync();
    const read=()=>({tag:val("tag"), cat:val("categoryId"), acc:val("accountId"), period:val("period"), from:val("from"), to:val("to"), min:val("min"), max:val("max"), hist:val("hist"), uncat:$("#f_uncat").checked});
    s.querySelector("#vsave").onclick=()=>{ const n=val("vname"); if(!n){ toast("Name the view."); return; } Object.assign(f, read()); S.txLimit=0; const ex=live("views").find(v=>v.name.toLowerCase()===n.toLowerCase()); closeModal(); upsert("views",{...(ex||{}), id:ex?ex.id:uid(), name:n, f:viewOf(f)}); toast(`Saved "${n}"`); };
    s.querySelectorAll("[data-vdel]").forEach(b=>b.onclick=()=>{ closeModal(); del("views",b.dataset.vdel); toast("View removed"); });
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#rs").onclick=()=>{ S.f={type:f.type, cat:"", acc:"", tag:"", period:"month", from:"", to:"", q:""}; S.txLimit=0; closeModal(); render(); };
    s.querySelector("#sv").onclick=()=>{ Object.assign(f, read()); S.txLimit=0; closeModal(); render(); };
  });
}
/* Plan has three jobs, one per tab:
   This month = a checklist of what's due (tick things off); Regular items = the repeating things you set up once; Loans */
function vPlan(){
  if(S.planTab==="ready") S.planTab="cashflow";
  if(S.planTab==="loans"){ S.planTab="month"; S.accTab="loans"; S.view="accounts"; return vAccounts(); }
  const now=ymOf(today()), tab=S.planTab||"month", rec=live("recurring");
  const active=rec.filter(r=>!r.end || r.end>=now), past=rec.filter(r=>r.end && r.end<now);
  const monthly=r=>r.freq==="once"?0:+r.amount/(FREQ[r.freq]||1);
  const seg=`<div class="seg accseg planseg" role="group" aria-label="Plan" style="margin-top:4px">${[["month","Month"],["regular","Regular"],["cashflow","Cash flow"],["calendar","Calendar"],["goals","Goals"]].map(([k,l])=>`<button type="button" data-pt="${k}" aria-pressed="${tab===k}">${l}</button>`).join("")}</div>`;
  if(tab==="month"){
    const cur=forecast(1).months[0], out=cur.rows.filter(r=>r.type!=="income"), inc=cur.rows.filter(r=>r.type==="income");
    const amt=r=>r.src==="b"?r.budget:r.amount;
    const todo=out.filter(r=>!r.paid && !(r.src==="b" && r.spent>=r.budget-0.5)), done=out.filter(r=>r.paid || (r.src==="b" && r.spent>=r.budget-0.5));
    const total=out.reduce((x,r)=>x+amt(r),0), left=todo.reduce((x,r)=>x+r.amount,0), pct=total?Math.round((total-left)/total*100):0;
    const incTodo=inc.filter(r=>!r.paid), incDone=inc.filter(r=>r.paid);
    return `${seg}
    <div class="sumcard" style="margin-top:12px">
      <div class="sr"><span>Planned going out in ${MN[+now.slice(5)-1]}</span><b>${money(total)}</b></div>
      <div class="sr"><span>Done</span><b class="in">${money(total-left)}</b></div>
      <div class="sr tot"><span>Still to go</span><b>${money(left)}</b></div>
      <div style="padding:2px 0 12px"><div class="bar" style="margin:0"><i style="width:${pct}%"></i></div><div class="note" style="margin:6px 0 0">${pct}% done · ${done.length} of ${out.length} items</div></div>
    </div>
    <div class="sh"><h3>To do</h3><span class="note" style="margin:0">tap Paid when it goes out</span></div>
    <div class="list">${todo.length?todo.map(r=>plannedRow(r,true)).join(""):'<div class="empty">All done for this month.</div>'}</div>
    ${incTodo.length?`<div class="sh"><h3>Coming in</h3></div><div class="list">${incTodo.map(r=>plannedRow(r,true)).join("")}</div>`:""}
    ${done.length+incDone.length?`<details class="fm" style="margin-top:20px"><summary><span class="mn">Done this month</span><span class="sub" style="text-align:right">${done.length+incDone.length} items</span></summary><div class="list" style="border-radius:0">${[...done,...incDone].map(r=>plannedRow(r,true)).join("")}</div></details>`:""}
    <p class="note" style="margin-top:14px">This list comes from your regular items, loans and card bills. To change what appears here, edit them in Regular, or the loan in Accounts › Loans.</p>`;
  }
  if(tab==="calendar") return seg+`<div style="height:12px"></div>`+billsCalendar();
  if(tab==="cashflow") return seg+`<div style="height:4px"></div>`+readyTab();
  if(tab==="goals") return seg+goalsTab();
  const rline=r=>`<div class="row tap" data-rec="${esc(r.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(r.name)}</div><div class="s">${r.freq==="once"?`Once · ${mLabel(r.start)}`:`${FREQ_LBL[r.freq]}${(FREQ[r.freq]||1)>=2?` · next ${recNextLbl(r)}`:r.day?` on the ${r.day}${[11,12,13].includes(r.day)?"th":({1:"st",2:"nd",3:"rd"}[r.day%10]||"th")}`:""}${r.end?` · until ${mShort(r.end)}`:""}`}${r.type==="investment"&&r.invType?` · ${esc(r.invType)}`:""}${r.accountId?` · ${esc(accName(r.accountId))}`:""}</div></div><div class="amt ${r.type==="income"?"in":""}">${money(r.amount)}</div></div>`;
  const groups=[
    ["Income","Salary and other money coming in", active.filter(r=>r.type==="income")],
    ["Bills & payments","Fixed amounts you pay", active.filter(r=>r.type==="expense" && !r.budget)],
    ["Budgets","Amounts set aside; spends you tag reduce them", active.filter(r=>r.type==="expense" && r.budget)],
    ["SIPs & investments","Money you invest on a schedule", active.filter(r=>r.type==="investment")]
  ];
  return `${seg}
  <div class="btns" style="margin-top:12px"><button class="btn pri" type="button" id="addRec">+ Add regular item</button></div><input class="lsearch" type="search" data-lsearch placeholder="Search by name" aria-label="Search this list" autocomplete="off">
  <p class="note">Set these up once. Each one appears in Plan › Month on its schedule, in Cash flow, and in Insights.</p>
  ${repeatsSection()}
  ${groups.map(([ttl,hint,list])=>`<div class="sh"><h3>${ttl}</h3>${list.reduce((x,r)=>x+monthly(r),0)>0.5?`<span class="note" style="margin:0">${money(list.reduce((x,r)=>x+monthly(r),0))} a month</span>`:""}</div>
    <div class="list">${list.length?list.sort((a,b)=>b.amount-a.amount).map(rline).join(""):`<div class="empty" style="padding:12px 14px">${hint}. None yet.</div>`}</div>`).join("")}
  ${past.length?`<details class="fm" style="margin-top:20px"><summary><span class="mn">Ended</span><span class="sub" style="text-align:right">${past.length}</span></summary><div class="list" style="border-radius:0">${past.map(rline).join("")}</div></details>`:""}`;
}
const isClosed = (l,x) => !!l.closedOn || (x.out<=0.5 && (x.k==="family" ? x.own.borrowed>0 : true) && !(x.s && x.s.rows.some(r=>r.ym>=ymOf(today()))));
/* open loans as rows; closed ones folded into a "Closed loans" section */
function loanList(loans, emptyMsg){
  const open=loans.filter(([l,x])=>!isClosed(l,x)), closed=loans.filter(([l,x])=>isClosed(l,x));
  return `<div class="list" style="margin-top:12px">${open.length?open.map(([l,x])=>loanLine(l,x)).join(""):`<div class="empty">${emptyMsg}</div>`}</div>
    ${closed.length?`<details class="fm" style="margin-top:14px"><summary><span class="mn">Closed loans</span><span class="sub" style="text-align:right">${closed.length}</span></summary><div class="list" style="border-radius:0">${closed.map(([l,x])=>loanLine(l,x)).join("")}</div></details>`:""}`;
}
function loanLine(l,x){
  const b=x.b, base = isEmiLike(x.k) ? (+b.principal||0) : x.k==="family" ? x.own.borrowed : (+b.principal||0)+x.own.borrowed;
  const pct = base>0 ? Math.min(100, Math.max(0, (1-x.out/base)*100)) : 0;
  const closed = isClosed(l,x);
  const sub = closed ? (l.closedOn ? `Closed in ${mLabel(l.closedOn)}` : "Fully repaid") : x.k==="cardemi" ? `${money(x.emiNow)}/month + GST on ${esc(accName(l.accountId))} · ends ${x.end?mShort(x.end):"—"}` : x.k==="emi" ? (x.s ? `${money(x.emiNow)}/month · ${rateTxt(x.rateNow)}% · ends ${mShort(x.end)}` : `No fixed schedule${b.rate?` · ${rateTxt(b.rate)}%`:""}`)
    : x.k==="family" ? (x.own.borrowed ? `Interest-free · borrowed ${short(x.own.borrowed)} · repaid ${short(x.own.repaid)}` : "Interest-free · nothing borrowed yet")
    : `Bank ${short(x.bank)} + own ${short(x.own.out)}${x.missed>0.5?` + missed EMIs ${short(x.missed)}`:""} · EMI ${money(x.emiNow)} · ${rateTxt(x.rateNow)}%`;
  return `<div class="row tap" data-loan="${esc(l.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(l.name)} <span class="chip mute">${KIND_LBL[x.k]}</span> ${closed?'<span class="chip good">Closed</span>':""}</div>
    <div class="s">${sub}${l.lender?` · ${esc(l.lender)}`:""}</div>
    ${base>0&&pct>=0.5?`<div class="bar" title="${pct.toFixed(0)}% repaid"><i style="width:${pct.toFixed(1)}%"></i></div>`:""}</div><div class="amt">${short(x.out)}<div class="s">left</div></div></div>`;
}
function vLoan(){
  const l=byId("loans",S.loanId); if(!l || l.deleted){ S.view="plan"; return vPlan(); }
  const x=loanSum(l), now=ymOf(today()), k=x.k, s=x.s, b=x.b;
  const tile=(t,v,c="")=>`<div class="tile"><div class="k">${t}</div><div class="v ${c}">${v}</div></div>`;
  const tiles = isEmiLike(k) ? [tile("Outstanding",short(x.bank)), tile(k==="cardemi"?"EMI (before GST)":"EMI",s?short(x.emiNow):"—"), tile("Ends",x.end?mShort(x.end):"—")]
    : k==="family" ? [tile("You owe",short(x.own.out)), tile("Borrowed",short(x.own.borrowed)), tile("Repaid",short(x.own.repaid),"in")]
    : [tile("Total owed",short(x.out)), tile("Bank part",short(x.bank)), tile("Own money part",short(x.own.out)), ...(x.missed>0.5?[tile("Missed EMIs owed",short(x.missed),"neg")]:[])];
  const act=(a,t,pri)=>`<button class="btn sm ${pri?"pri":""}" type="button" data-la="${a}">${t}</button>`;
  const acts = (l.closedOn ? [act("reopen","Reopen loan",1)] : k==="cardemi" ? [act("close","Foreclosed / closed")] : k==="emi" ? [act("prepay","Part payment",1), s?act("rate","Rate change"):"", s?act("sync","Match bank statement"):"", act("close","Mark as closed")]
    : k==="family" ? [act("borrow","Borrowed",1), act("repay","Repaid",1), act("plan","Plan repayment"), act("close","Mark as closed")]
    : [act("borrow","Borrowed",1), act("repay","Repaid",1), act("prepay","Part payment"), act("rate","Rate change"), s?act("sync","Match bank statement"):"", act("plan","Plan repayment"), act("close","Mark as closed")]).concat(act("edit","Edit"));
  const tbl=rows=>`<div class="list" style="overflow-x:auto"><table class="sched"><thead><tr><th>Month</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Balance</th></tr></thead><tbody>${rows.map(r=>`<tr class="${r.ym===now?"cur":""}"><td>${mShort(r.ym)}</td><td>${money(r.emi)}</td><td>${money(r.prin)}</td><td>${money(r.int)}</td><td>${money(r.bal)}</td></tr>`).join("")}</tbody></table></div>`;
  const hist=(k==="cardemi" ? live("txns").filter(t=>t.cemi===l.id) : loanTx(l.id)).sort((p,q)=>q.date.localeCompare(p.date)||(q.updatedAt-p.updatedAt));
  const hline=t=>{ const lbl = t.act==="borrow" ? (t.part==="bank" ? "Borrowed · bank-loan money" : (k==="hybrid"?"Borrowed · their own money":"Borrowed")) : t.act==="repay" ? "Repaid" : t.act==="missed" ? `Missed EMI · ${mShort(t.ym)}` : t.act==="catchup" ? `Paid missed EMI${(t.covers||[]).length>1?"s":""}` : `Part payment · ${t.mode==="emi"?"reduced EMI":t.mode==="tenure"?"reduced tenure":"principal"}`;
    const sub = t.act==="missed" ? `${esc(l.lender||"Relative")} paid the bank · you owe it to them` : `${new Date(t.date+"T00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})} · ${t.accountId?esc(accName(t.accountId)):"No account"}${t.hist?" · already in balances":""}`;
    return `<div class="row tap" data-tx="${esc(t.id)}" role="button" tabindex="0"><div class="main"><div class="t">${lbl}</div><div class="s">${sub}${t.note?` · ${esc(t.note)}`:""}</div></div><div class="amt ${t.act==="borrow"||t.act==="missed"?"in":""}">${t.act==="borrow"||t.act==="missed"?"+":"−"}${money(t.amount)}</div></div>`; };
  const mi=x.mi, paidM=paidMap();
  const unmarked = (k==="hybrid" && s) ? s.rows.filter(r=>r.ym<=now && !paidM.has(`l:${l.id}|${r.ym}`)) : [];
  const urow=r=>plannedRow({key:`l:${l.id}|${r.ym}`, src:"u", type:"expense", name:`${mLabel(r.ym)} EMI`, amount:r.emi, canMiss:true, sub:r.ym===now?"This month":"Not marked yet"}, true);
  const missedSec = k==="hybrid" ? `
  <h2>EMIs to mark<span class="sp"></span>${unmarked.length?`<span class="chip ${unmarked.some(r=>r.ym<now)?"bad":"mute"}">${unmarked.length}</span>`:""}</h2>
  <div class="list">${unmarked.length?unmarked.slice(-6).reverse().map(urow).join(""):'<div class="empty">All EMIs up to this month are marked paid or missed.</div>'}</div>
  ${unmarked.length>6?`<p class="note">Showing the latest 6 of ${unmarked.length} unmarked EMIs. Older ones are from ${mShort(unmarked[0].ym)} on.</p>`:""}
  <h2>Missed EMIs<span class="sp"></span>${mi.owed>0.5?`<button class="btn sm pri" type="button" data-la="catchup">Pay missed EMIs</button>`:""}</h2>
  <div class="list">${mi.list.length?mi.list.slice().reverse().map(m=>`<div class="row tap" data-tx="${esc(m.t.id)}" role="button" tabindex="0"><div class="main"><div class="t">${mLabel(m.ym)} EMI ${m.by?'<span class="chip good">Paid back</span>':'<span class="chip bad">Owed</span>'}</div><div class="s">${m.by?`Paid back on ${dLabel(m.by.date)} ${m.by.date.slice(0,4)}`:`${esc(l.lender||"Relative")} paid the bank`}</div></div><div class="amt">${money(m.amount)}</div></div>`).join(""):`<div class="empty">None. If you miss an EMI, tap Missed on it and ${esc(l.lender||"your relative")}'s payment to the bank is recorded as owed to them.</div>`}</div>
  ${mi.owed>0.5?`<p class="note">You owe ${esc(l.lender||"them")} ${money(mi.owed)} for ${mi.list.filter(m=>!m.by).length} missed EMI${mi.list.filter(m=>!m.by).length>1?"s":""}, interest-free.</p>`:""}` : "";
  const rates=(b && b.rates)||[];
  const fp=famPlan(l).filter(p=>p.ym>=now), unpaidPlan=fp.filter(p=>!paidMap().has(p.key)), planSum=unpaidPlan.reduce((a,p)=>a+p.amount,0);
  const upcoming = s ? s.rows.filter(r=>r.ym>=now).slice(0,6) : [];
  const LT=[["overview","Overview"], ...(s?[["schedule","Schedule"]]:[]), ["history","History"]];
  const lt=LT.some(([v])=>v===S.loanTab) ? S.loanTab : "overview";
  return `
  <div class="monthbar"><button class="btn sm" type="button" data-go="plan" aria-label="Back to Plan">‹</button><div class="m" style="text-align:left">${esc(l.name)}</div><span class="chip">${KIND_LBL[k]}</span></div>
  <p class="note">${esc(l.lender||"")}${k==="hybrid"&&b.lender?` · bank loan with ${esc(b.lender)}`:""}${k==="cardemi"?` · purchase category ${esc(catName(l.categoryId))}${+l.fee?` · processing fee ${money(+l.fee)} + GST`:""} · GST ${rateTxt(l.gstRate??18)}% on interest`:""}${!isEmiLike(k)?`${l.lender?" · ":""}Their own money is interest-free`:""}</p>
  <div class="tiles">${tiles.join("")}</div>
  ${b && s ? `<div class="card" style="margin-top:8px"><div class="s" style="font-size:13.5px">${k==="hybrid"?`Bank part: EMI ${money(x.emiNow)} · ends ${mShort(x.end)} · `:""}Rate ${rateTxt(x.rateNow)}%${rates.length?" (floating)":""}</div>
    <div class="note" style="margin:4px 0 0">Interest paid so far ${money(x.paidInt)} · still to pay ${money(x.totalInt-x.paidInt)} · total ${money(x.totalInt)}</div>
    <div class="bar"><i style="width:${(+b.principal? Math.min(100,(1-x.bank/(+b.principal))*100):0).toFixed(1)}%"></i></div></div>` : ""}
  <div class="btns" style="margin-top:12px">${acts.join("")}</div>
  <div class="seg" role="group" aria-label="Loan sections" style="margin-top:16px">${LT.map(([v,lb])=>`<button type="button" data-lt="${v}" aria-pressed="${lt===v}">${lb}</button>`).join("")}</div>
  ${lt==="overview" && s ? loanCharts(l,x) : ""}
  ${lt==="overview" ? `${missedSec}` : ""}
  ${lt==="schedule" && upcoming.length?`<h2>Upcoming EMIs</h2>${tbl(upcoming)}
    <details class="fm" style="margin-top:8px"><summary><span class="mn">Full schedule</span><span class="sub" style="text-align:right">${s.rows.length} EMIs</span></summary>${tbl(s.rows)}</details>`:""}
  ${lt==="overview" && b && s && k!=="cardemi" ? `<h2>Rate changes</h2><div class="list"><div class="row"><div class="main"><div class="t">${rateTxt(b.rate)}%</div><div class="s">Starting rate from ${mShort(b.start)}</div></div></div>${rates.map(r=>`<div class="row tap" data-rc="${esc(r.id)}" role="button" tabindex="0"><div class="main"><div class="t">${rateTxt(r.rate)}%</div><div class="s">From ${mShort(r.ym)} · ${r.mode==="emi"?"kept tenure, EMI changed":"kept EMI, tenure changed"}</div></div></div>`).join("")}</div>` : ""}
  ${lt==="overview" && !isEmiLike(k) ? `<h2>Planned repayments</h2><div class="list">${(l.plans||[]).length?(l.plans||[]).map(p=>`<div class="row tap" data-pl="${esc(p.id)}" role="button" tabindex="0"><div class="main"><div class="t">${p.freq==="monthly"?"Monthly":"One time"}</div><div class="s">${p.freq==="monthly"?`From ${mShort(p.start)}${p.end?` to ${mShort(p.end)}`:" until repaid"}`:mLabel(p.start)}${p.accountId?` · ${esc(accName(p.accountId))}`:""}</div></div><div class="amt">${money(p.amount)}</div></div>`).join(""):'<div class="empty">No repayments planned. Plan one to see it in the forecast.</div>'}</div>
    ${unpaidPlan.length?`<p class="note">${money(planSum)} planned from ${mShort(unpaidPlan[0].ym)}${planSum+0.5>=x.own.out?` · cleared by ${mShort(unpaidPlan[unpaidPlan.length-1].ym)}`:` · ${money(x.own.out-planSum)} still unplanned`}.</p>`:""}` : ""}
  ${lt==="history" ? `<h2>History<span class="sp"></span>${hist.length?`<span class="chip mute">${hist.length}</span>`:""}</h2>
  <div class="list">${hist.length?hist.map(k==="cardemi"?txLine:hline).join(""):`<div class="empty">${k==="cardemi"?"EMIs are added to the card on each statement date and appear here once posted.":k==="emi"?"No part payments yet. EMIs you mark as paid appear under Transactions.":"No entries yet. Add each borrowing and repayment with its date."}</div>`}</div>${loanSpends(l)}` : ""}
  ${lt==="overview" && isEmiLike(k) && !(b&&s) ? '<p class="note">Add a tenure and first EMI month (Edit) to see the schedule.</p>' : ""}`;
}
/* ---------- Year view (like the sheet's Dashboard + Expenses tabs) ----------
   past months = actual entries; this month = actual so far + planned items not yet paid; future months = plan */
/* Option B: with a reserve account, big bills are a monthly cost. What you put aside counts as "Set aside" each month,
   and the bill itself (paid with the reserve tick, or still planned) isn't counted again as an expense. */
const resvOn = () => !!reserveAcc();
const resvPaid = t => t.type==="expense" && t.pot==="reserve" && resvOn();
const resvPlanned = it => it.type==="expense" && resvOn() && isBigItem(it);
function setAsideOf(ym){ const a=reserveAcc(); if(!a) return 0; const now=ymOf(today());
  const got=live("txns").filter(t=>t.pot==="reserve" && t.type==="transfer" && t.toAccountId===a.id && ymOf(t.date)===ym).reduce((s,t)=>s+(+t.amount||0),0);
  if(ym<now) return got; const st=reserveState(); return ym===now ? got+st.setAside : st.monthly; }
function monthFigures(ym){
  const now=ymOf(today()), r={income:0, expense:0, investment:0, kind: ym<now?"actual":ym===now?"projected":"plan", byCat:new Map(), byInc:new Map(), sub:new Map(), byInv:new Map()};
  const addS=(top,id,v)=>{ if(!r.sub.has(top)) r.sub.set(top,new Map()); const m=r.sub.get(top); m.set(id,(m.get(id)||0)+v); };
  const addC=(m,k,v)=>m.set(k,(m.get(k)||0)+v);
  {
    for(const t of live("txns")) if((t.type==="expense" ? expMonth(t) : ymOf(t.date))===ym){
      if(offBook(t) || histCovered(t) || resvPaid(t)) continue;
      if(t.type==="expense"){ r.expense+=+t.amount; addC(r.byCat, catTop(t.categoryId)||"none", +t.amount); addS(catTop(t.categoryId)||"none", t.categoryId||"none", +t.amount); }
      else if(t.type==="income"){ r.income+=+t.amount; addC(r.byInc, catTop(t.categoryId)||"none", +t.amount); addS(catTop(t.categoryId)||"none", t.categoryId||"none", +t.amount); }
      else if(t.type==="investment"){ r.investment+=invNet(t); addC(r.byInv, t.instrument||"Investment", invNet(t)); const c=invChg(t); if(c){ const f=feeCat(), top=catTop(f)||"none"; r.expense+=c; addC(r.byCat, top, c); addS(top, f||"none", c); } }
      else if(t.type==="carry" && t.dir==="in"){ r.income+=+t.carry; addC(r.byInc, "carry", +t.carry); }
    }
    /* balances brought in from Money Manager are owed for past card spends: count them in the bill they fall into */
    for(const a of live("accounts")) if(a.type==="card" && countsAcc(a) && +a.stmtDay>=1 && +a.opening<0 && openDateOf(a) && ymOf(dueOf(a, stmtFor(a, openDateOf(a))))===ym){ r.expense+=-a.opening; addC(r.byCat,"cardopen",-a.opening); }
  }
  if(ym>=now){
    const paid=paidMap();
    for(const it of planFor(ym)){
      if(it.src==="c" || it.type==="transfer" || (it._m===now && paid.has(it.key)) || resvPlanned(it)) continue;
      const v=+it.amount||0; if(!v) continue;
      if(it.type==="income"){ r.income+=v; addC(r.byInc, catTop(it.categoryId)||"none", v); addS(catTop(it.categoryId)||"none", it.categoryId||"none", v); }
      else if(it.type==="investment"){ const c=Math.min(v, it.chg||0); r.investment+=v-c; addC(r.byInv, (byId("recurring",it.id)||{}).instrument||it.name, v-c); if(c){ const f=feeCat(), top=catTop(f)||"none"; r.expense+=c; addC(r.byCat, top, c); addS(top, f||"none", c); } }
      else { const top=it.src==="p" ? "repay" : (catTop(it.categoryId)||"none"); r.expense+=v; addC(r.byCat, top, v); addS(top, it.src==="p"?"repay":(it.categoryId||"none"), v); }
    }
    for(const e of cemiDue(ym)){ const top=catTop(e.cat)||"none"; r.expense+=e.v; addC(r.byCat, top, e.v); addS(top, e.cat||"none", e.v); }
  }
  r.setAside=setAsideOf(ym);
  r.balance=r.income-r.expense-r.investment-r.setAside;
  return r;
}
/* month expenses grouped by who paid: each card / bank account -> category -> subcategory,
   plus EMIs (-> each loan), loan repayments, and budgets' unspent remainder. Totals match monthFigures(ym).expense. */
function expenseTree(ym){
  const now=ymOf(today()), G=new Map();
  const grp=(k,name,order)=>{ if(!G.has(k)) G.set(k,{name,order,total:0,cats:new Map()}); return G.get(k); };
  const add=(g,top,sub,v)=>{ g.total+=v; if(!g.cats.has(top)) g.cats.set(top,{total:0,subs:new Map()}); const c=g.cats.get(top); c.total+=v; if(sub!=null) c.subs.set(sub,(c.subs.get(sub)||0)+v); };
  const accGrp=id=>{ const a=id&&byId("accounts",id); return a ? grp("a:"+a.id, a.name, a.type==="card"?1:0) : grp("a:none","No account",2); };
  for(const t of live("txns")) if(t.type==="expense" && !offBook(t) && !histCovered(t) && !resvPaid(t) && expMonth(t)===ym){
    const v=+t.amount;
    if(t.link && t.link.startsWith("l:")){ const l=byId("loans",t.link.slice(2).split("|")[0]); add(grp("emi","EMIs",3), l?`${l.name} EMI`:"EMI", null, v); continue; }
    if(t.link && t.link.startsWith("p:")){ const l=byId("loans",t.link.slice(2).split(":")[0]); add(grp("repay","Loan repayments",4), l?`Repay ${l.lender||l.name}`:"Repayment", null, v); continue; }
    const top=catTop(t.categoryId)||"none"; add(accGrp(t.accountId), top, t.categoryId||"none", v);
  }
  for(const t of live("txns")) if(t.type==="investment" && invChg(t) && ymOf(t.date)===ym){ const f=feeCat(); add(accGrp(t.accountId), catTop(f)||"none", f||"none", invChg(t)); }
  for(const a of live("accounts")) if(a.type==="card" && countsAcc(a) && +a.stmtDay>=1 && +a.opening<0 && openDateOf(a) && ymOf(dueOf(a, stmtFor(a, openDateOf(a))))===ym) add(accGrp(a.id), "cardopen", null, -a.opening);
  if(ym>=now){
    const paid=paidMap();
    for(const it of planFor(ym)){
      if(it.type==="investment" && it.chg && !(it._m===now && paid.has(it.key))){ const f=feeCat(); add(accGrp(it.accountId), catTop(f)||"none", f||"none", Math.min(+it.amount||0, it.chg)); continue; }
      if(it.type!=="expense" || it.src==="c" || (it._m===now && paid.has(it.key)) || resvPlanned(it)) continue;
      const v=+it.amount||0; if(!v) continue;
      if(it.src==="l") add(grp("emi","EMIs",3), it.name, null, v);
      else if(it.src==="p") add(grp("repay","Loan repayments",4), it.name, null, v);
      else if(it.src==="b") add(grp("budget","Budgets left",5), it.name, null, v);
      else { const top=catTop(it.categoryId)||"none"; add(accGrp(it.accountId), top, it.categoryId||"none", v); }
    }
    for(const e of cemiDue(ym)) add(accGrp(e.card), catTop(e.cat)||"none", e.cat||"none", e.v);
  }
  return [...G.entries()].sort((a,b)=>b[1].total-a[1].total);
}
function investTree(ym){
  const now=ymOf(today()), G=new Map();
  const add=(type,name,v)=>{ const k=type||"Unassigned"; if(!G.has(k)) G.set(k,{total:0,items:new Map()}); const g=G.get(k); g.total+=v; g.items.set(name,(g.items.get(name)||0)+v); };
  for(const t of live("txns")) if(t.type==="investment" && ymOf(t.date)===ym) add(invTypeOf(t), t.instrument||"Investment", invNet(t));
  if(ym>=now){ const paid=paidMap();
    for(const it of planned(ym)) if(it.type==="investment" && !(ym===now && paid.has(it.key))){ const r=byId("recurring",it.id)||{}; add(r.invType, r.instrument||it.name, (+it.amount||0)-Math.min(+it.amount||0,it.chg||0)); } }
  return [...G.entries()].sort((a,b)=>b[1].total-a[1].total);
}
/* Home month view: the Year view's figures for one month, with a category -> subcategory breakdown */
function monthView(){
  const now=ymOf(today()), ym=S.hm||now, f=monthFigures(ym), tab=S.hmTab||"expense";
  const kind = f.kind==="actual" ? "Actual" : f.kind==="projected" ? "So far + still due" : "Planned";
  const nm=k=>k==="none"?"Uncategorised":k==="cardopen"?"Card balances from Money Manager":k==="repay"?"Loan repayments":k==="carry"?"Last month balance":catName(k);
  const subNm=(top,id)=>id===top?`${nm(top)} (general)`:id==="none"?"Uncategorised":id==="repay"?"Loan repayments":byId("categories",id)?.name||nm(id);
  const list = [...f.byInc.entries()];
  list.sort((a,b)=>b[1]-a[1]); const max=list[0]?.[1]||1, total=tab==="income"?f.income:tab==="invest"?f.investment:f.expense;
  const open=S.hmOpen||"", open2=S.hmOpen2||"";
  const pct=v=>`<div class="cclbl">${total?Math.round(v/total*100):0}%</div>`;
  const lvl=(d)=>`padding-left:${14+d*16}px;${d?"background:var(--bg);min-height:42px":""}`;
  const arrow=(on)=>` <span class="cpm">${on?"▾":"›"}</span>`;
  const nameSub=(top,id)=>subNm(top,id);
  let rows;
  if(tab==="expense"){
    const T=expenseTree(ym), gmax=T[0]?.[1].total||1;
    rows=T.map(([gk,g])=>{
      const gOpen=open===gk, cats=[...g.cats.entries()].sort((a,b)=>b[1].total-a[1].total);
      return `<div class="row tap" data-hmo="${esc(gk)}" role="button" tabindex="0" aria-expanded="${gOpen}"><div class="main"><div class="t">${esc(g.name)}${arrow(gOpen)}</div><div class="bar"><i style="width:${(g.total/gmax*100).toFixed(1)}%"></i></div></div><div class="ccamt"><div class="amt">${money(g.total)}</div>${pct(g.total)}</div></div>
      ${gOpen?cats.map(([ck,c])=>{ const subs=[...c.subs.entries()].sort((a,b)=>b[1]-a[1]), many=subs.length>1||(subs.length===1&&subs[0][0]!==ck), cOpen=open2===ck, label=(gk==="emi"||gk==="repay"||gk==="budget")?ck:nm(ck);
        return `<div class="row ${many?"tap":""}" ${many?`data-hmo2="${esc(ck)}" role="button" tabindex="0" aria-expanded="${cOpen}"`:""} style="${lvl(1)}"><div class="main"><div class="t" style="font-size:14px">${esc(label)}${many?arrow(cOpen):""}</div></div><div class="amt" style="font-size:13.5px">${money(c.total)}</div></div>
        ${many&&cOpen?subs.map(([sid,sv])=>`<div class="row" style="${lvl(2)}"><div class="main"><div class="s" style="font-size:13px;color:var(--ink)">${esc(nameSub(ck,sid))}</div></div><div class="amt" style="font-size:13px">${money(sv)}</div></div>`).join(""):""}`; }).join(""):""}`;
    }).join("");
  } else if(tab==="invest"){
    const T=investTree(ym), gmax=T[0]?.[1].total||1;
    rows=T.map(([type,g])=>{ const gOpen=open===type;
      return `<div class="row tap" data-hmo="${esc(type)}" role="button" tabindex="0" aria-expanded="${gOpen}"><div class="main"><div class="t">${esc(type)}${arrow(gOpen)}</div><div class="bar"><i style="width:${(g.total/gmax*100).toFixed(1)}%"></i></div></div><div class="ccamt"><div class="amt">${money(g.total)}</div>${pct(g.total)}</div></div>
      ${gOpen?[...g.items.entries()].sort((a,b)=>b[1]-a[1]).map(([n,v])=>`<div class="row" style="${lvl(1)}"><div class="main"><div class="t" style="font-size:14px">${esc(n)}</div></div><div class="amt" style="font-size:13.5px">${money(v)}</div></div>`).join(""):""}
      ${gOpen&&type==="Unassigned"?`<div class="row" style="${lvl(1)}"><div class="main"><div class="s">Set the type on these SIPs (Plan) or investment entries (Transactions).</div></div></div>`:""}`; }).join("");
  } else rows=list.map(([k,v])=>{
    const subs=tab==="invest"?null:f.sub.get(k), many=subs && (subs.size>1 || (subs.size===1 && !subs.has(k)));
    return `<div class="row ${many?"tap":""}" ${many?`data-hmo="${esc(k)}" role="button" tabindex="0" aria-expanded="${open===k}"`:""}><div class="main"><div class="t">${esc(tab==="invest"?k:nm(k))}${many?` <span class="cpm">${open===k?"▾":"›"}</span>`:""}</div><div class="bar"><i style="width:${(v/max*100).toFixed(1)}%"></i></div></div><div class="ccamt"><div class="amt">${money(v)}</div><div class="cclbl">${total?Math.round(v/total*100):0}%</div></div></div>
      ${many&&open===k?[...subs.entries()].sort((a,b)=>b[1]-a[1]).map(([id,sv])=>`<div class="row" style="padding-left:30px;min-height:40px;background:var(--bg)"><div class="main"><div class="s" style="font-size:13.5px;color:var(--ink)">${esc(subNm(k,id))}</div></div><div class="amt" style="font-size:13px">${money(sv)}</div></div>`).join(""):""}`;
  }).join("");
  return `
  <div class="monthbar"><button class="btn sm" type="button" data-hm="-1" aria-label="Previous month">‹</button><div class="m">${mLabel(ym)}<div class="note" style="margin:0;font-weight:400;font-size:12px">${kind}</div></div><button class="btn sm" type="button" data-hm="1" aria-label="Next month">›</button></div>
  <div class="cols wide-left"><div>
  <div class="kp4">
    <div><div class="k">Income</div><div class="v in">${money(f.income)}</div></div>
    <div><div class="k">Expenses</div><div class="v">${money(f.expense)}</div></div>
    <div><div class="k">Invested</div><div class="v">${money(f.investment)}</div></div>
    ${f.setAside>0.5||resvOn()?`<div><div class="k">Set aside</div><div class="v">${money(f.setAside)}</div></div>`:""}
    <div class="${f.setAside>0.5||resvOn()?"kpw":""}"><div class="k">Balance</div><div class="v ${f.balance<-0.5?"neg":""}">${money(f.balance)}</div></div>
  </div>
  <div class="btns" style="margin-top:10px"><button class="btn sm" type="button" data-ym="${ym}">See ${MN[+ym.slice(5)-1]} transactions ›</button></div>
  ${resvMonthCard(ym)}
  </div><div>
  <div class="seg" role="group" aria-label="Breakdown" style="margin-top:10px">${[["expense","Expenses"],["income","Income"],["invest","Investments"]].map(([k,l])=>`<button type="button" data-hmt="${k}" aria-pressed="${tab===k}">${l}</button>`).join("")}</div>
  <div class="list" style="margin-top:8px">${rows||`<div class="empty">No ${tab==="invest"?"investments":tab==="income"?"income":"expenses"} ${f.kind==="plan"?"planned":"recorded"} for ${mLabel(ym)}.</div>`}</div>
  </div></div>
  ${limitsSection(ym)}
  ${dailyHeat(ym)}
  ${monthItems(ym)}`;
}
/* everything planned for one month, by type; tap a regular item to change or skip it for that month only */
function monthItems(ym){
  const now=ymOf(today()), items=planned(ym), paid=paidMap();
  const skipped=live("recurring").filter(r=>recurs(r,ym) && r.ov && +r.ov[ym]===0 && r.ov[ym]!==undefined);
  const amtOf=it=>it.src==="b"?it.budget:it.amount;
  const row=it=>{ const p=paid.get(it.key), tapRec=it.src==="r"||it.src==="b";
    const st = p ? (p.act==="missed"?'<span class="pill bad">Missed</span>':'<span class="pill" style="background:var(--good-soft);color:var(--good)">Paid</span>') : it.paidC ? '<span class="pill" style="background:var(--good-soft);color:var(--good)">Paid</span>' : "";
    const kind = it.src==="l"?"EMI":it.src==="c"?"Card bill":it.src==="p"?"Repayment":it.src==="b"?"Budget":"";
    const attrs = tapRec ? `data-mi="${esc(it.id)}|${ym}" role="button" tabindex="0"` : it.src==="c" ? `data-card="${esc(it.id)}" role="button" tabindex="0"` : (it.src==="l"||it.src==="p") ? `data-loan="${esc(it.id)}" role="button" tabindex="0"` : "";
    return `<div class="row tap" ${attrs}><div class="main"><div class="t">${esc(it.name)} ${kind?`<span class="chip mute">${kind}</span>`:""} ${it.changed?'<span class="pill warn">Changed</span>':""}</div><div class="s">${it.day&&it.src!=="c"?`Day ${it.day} · `:""}${esc(it.src==="c"?it.sub:it.src==="b"?`Spent ${money(it.spent)}`:it.sub||(it.type==="investment"?((byId("recurring",it.id)||{}).invType||"Investment"):catName(it.categoryId)))}</div></div><div class="amt ${it.type==="income"?"in":""}">${money(amtOf(it))}${st?`<div>${st}</div>`:""}</div></div>`;
  };
  const grp=(ttl,list)=>list.length?`<div class="sh"><h3>${ttl}</h3><span class="note" style="margin:0">${money(list.reduce((x,it)=>x+amtOf(it),0))}</span></div><div class="list">${list.map(row).join("")}</div>`:"";
  const inc=items.filter(i=>i.type==="income"), exp=items.filter(i=>i.type==="expense"), inv=items.filter(i=>i.type==="investment");
  return `<div class="sh" style="margin-top:28px"><h3>Everything planned for ${mLabel(ym)}</h3></div>
    <p class="note" style="margin-top:0">Tap a regular item to change its amount or skip it for ${MN[+ym.slice(5)-1]} only. EMIs and card bills open their loan or card.${ym<now?" For what actually happened, see the month's transactions.":""}</p>
    ${grp("Income",inc)}${grp("Expenses",exp)}${grp("Investments",inv)}
    ${!items.length?'<div class="list"><div class="empty">Nothing planned for this month.</div></div>':""}
    ${skipped.length?`<div class="sh"><h3>Skipped this month</h3></div><div class="list">${skipped.map(r=>`<div class="row tap" data-mi="${esc(r.id)}|${ym}" role="button" tabindex="0"><div class="main"><div class="t" style="color:var(--muted);text-decoration:line-through">${esc(r.name)}</div><div class="s">Usually ${money(r.amount)} · tap to restore</div></div><div class="amt mut">${money(0)}</div></div>`).join("")}</div>`:""}`;
}
function monthItemSheet(id, ym){
  const r=byId("recurring",id); if(!r) return;
  const ov=r.ov && r.ov[ym]!==undefined ? +r.ov[ym] : null, mon=mLabel(ym), M=MN[+ym.slice(5)-1];
  const what = r.type==="income" ? "income" : r.type==="investment" ? "investment" : r.budget ? "budget" : "payment";
  openSheet(`${r.name} · ${mon}`, `
    <p class="note" style="margin-top:0">Usually ${money(r.amount)} ${FREQ_LBL[r.freq].toLowerCase()}. ${ov===0?`Skipped for ${M}.`:ov!==null?`Changed to ${money(ov)} for ${M}.`:""}</p>
    ${field(["amt",`Amount for ${mon} only (₹)`,"number",{value:ov!==null&&ov!==0?ov:r.amount,step:"0.01",hint:`Other months keep ${money(r.amount)}.`}])}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save for ${M} only</button>
      ${ov===0?"":`<button class="btn" id="sk" type="button">Skip ${M}</button>`}
      ${ov!==null?`<button class="btn" id="rs" type="button">Back to usual</button>`:""}</div>
    <div class="btns" style="margin-top:14px"><button class="btn" id="all" type="button">Edit for all months</button><button class="btn" id="cx" type="button">Close</button></div>`, s=>{
    const setOv=v=>{ const o={...r, ov:{...(r.ov||{})}}; if(v===undefined) delete o.ov[ym]; else o.ov[ym]=v; if(!Object.keys(o.ov).length) delete o.ov; closeModal(); upsert("recurring",o); };
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#all").onclick=()=>{ closeModal(); recForm({...r}); };
    s.querySelector("#sv").onclick=()=>{ const v=parseFloat(val("amt")); if(!(v>0)){ toast(`Enter an amount above zero, or use Skip ${M}.`); return; }
      if(Math.abs(v-r.amount)<0.005){ setOv(undefined); toast(`${M} uses the usual amount.`); } else { setOv(Math.round(v*100)/100); toast(`${r.name}: ${money(v)} for ${M} only.`); } };
    const sk=s.querySelector("#sk"); if(sk) sk.onclick=()=>{ setOv(0); toast(`${r.name} skipped for ${M}.`); };
    const rs=s.querySelector("#rs"); if(rs) rs.onclick=()=>{ setOv(undefined); toast(`${M} back to ${money(r.amount)}.`); };
  });
}
/* ---- big-bills reserve history (Insights) ---- */
function resvHist(y){ const a=reserveAcc(); if(!a) return null;
  const tx=live("txns").filter(t=>t.pot==="reserve");
  const inM=ym=>tx.filter(t=>t.type==="transfer"&&t.toAccountId===a.id&&ymOf(t.date)===ym).reduce((s,t)=>s+(+t.amount||0),0);
  const outL=ym=>tx.filter(t=>ymOf(t.date)===ym&&(t.type==="expense"||(t.type==="transfer"&&t.accountId===a.id)));
  const before=ym=>{ let h=+a.reserveStart||0; for(const t of tx){ if(ymOf(t.date)>=ym) continue; if(t.type==="transfer"){ if(t.toAccountId===a.id) h+=+t.amount; if(t.accountId===a.id) h-=+t.amount; } else if(t.type==="expense") h-=+t.amount; } return h; };
  return {a, inM, outL, before}; }
function resvMonthCard(ym){ const H=resvHist(); if(!H) return "";
  const now=ymOf(today()), put=H.inM(ym), outs=H.outL(ym), paid=outs.reduce((s,t)=>s+(+t.amount||0),0), end=H.before(addM(ym,1)), st=reserveState();
  if(!put && !paid && ym!==now) return "";
  return `<div class="sh"><h3>Big-bills reserve</h3><span class="note" style="margin:0">in ${esc(H.a.name)}</span></div>
  <div class="card"><div class="kv" style="margin-top:0">
    <span>Put aside</span><b>${money(put)}${ym===now?` <span class="mut" style="font-weight:400">of ${money(st.monthly)} asked</span> ${put>=st.monthly-0.5?'<span class="okc">✓</span>':""}`:""}</b>
    <span>Paid from it</span><b>${money(paid)}</b>
    <span class="tot">${ym===now?"Reserve holds today":"Reserve held at month-end"}</span><b class="tot">${money(ym===now?reserveHeld():end)}${ym===now?` <span class="mut" style="font-weight:400">of ${money(st.target)} needed</span>`:""}</b></div>
  ${outs.length?`<div class="list" style="margin-top:10px;box-shadow:none;background:var(--bg)">${outs.map(t=>`<div class="row tap" data-tx="${esc(t.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(t.note||catName(t.categoryId))}</div><div class="s">${fmtD(t.date)} · ${esc(accName(t.accountId))}</div></div><div class="amt">${money(t.amount)}</div></div>`).join("")}</div>`:""}
  </div>`; }
function resvYear(y){ const H=resvHist(); if(!H) return `<div class="list" style="margin-top:12px"><div class="empty">Mark an account as the reserve to see this.</div></div>`;
  const now=ymOf(today()), months=Array.from({length:12},(_,i)=>`${y}-${pad(i+1)}`).filter(m=>m<=now);
  const first=months.findIndex(m=>H.inM(m)||H.outL(m).length); if(first>0) months.splice(0,first);
  const R=months.map(m=>({m, put:H.inM(m), out:H.outL(m).reduce((s,t)=>s+(+t.amount||0),0), end:m===now?reserveHeld():H.before(addM(m,1))}));
  const tp=R.reduce((s,r)=>s+r.put,0), to=R.reduce((s,r)=>s+r.out,0), nb=v=>Math.abs(v)<0.5?'<span class="mut">—</span>':money(v).replace("₹","");
  const W=340,Hh=120,P=8, mx=Math.max(1,...R.map(r=>r.end)), X=i=>P+i*(W-2*P)/Math.max(1,R.length-1), Y=v=>Hh-P-(Math.max(0,v)/mx)*(Hh-2*P-14);
  const pts=R.map((r,i)=>`${X(i).toFixed(1)},${Y(r.end).toFixed(1)}`).join(" ");
  const chart=`<div class="card" style="padding:12px 14px"><div class="kv" style="margin:0 0 6px"><span>Reserve held at month-end</span><b>${money(R[R.length-1].end)} now</b></div>
    <svg viewBox="0 0 ${W} ${Hh+16}" width="100%" role="img" aria-label="Reserve held at each month-end"><line x1="${P}" x2="${W-P}" y1="${Hh-P}" y2="${Hh-P}" stroke="var(--line)"/>
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
    ${R.map((r,i)=>`<circle cx="${X(i)}" cy="${Y(r.end)}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/><text x="${X(i)}" y="${Hh+12}" font-size="10" text-anchor="${i===0?"start":i===R.length-1?"end":"middle"}" fill="var(--muted)">${MN[+r.m.slice(5)-1]}</text>`).join("")}
</svg></div>`;
  return `<div style="height:12px"></div>${chart}
  <div class="ywrap" style="margin-top:12px"><table class="ytab ysum"><thead><tr><th>Month</th><th>Put aside ₹</th><th>Paid out ₹</th><th>Holds ₹</th></tr></thead><tbody>
  ${R.map(r=>`<tr class="${r.m===now?"cur":""}"><td>${MN[+r.m.slice(5)-1]}</td><td class="in">${nb(r.put)}</td><td>${nb(r.out)}</td><td>${nb(r.end)}</td></tr>`).join("")}
  <tr class="tot"><td>Total</td><td class="in">${nb(tp)}</td><td>${nb(to)}</td><td>${nb(R.length?R[R.length-1].end:0)}</td></tr></tbody></table></div>
  <p class="note">Put aside = transfers into ${esc(H.a.name)} marked for big bills. Paid out = big bills paid with "Paid from the big-bills reserve" ticked. What's still to put aside is in Plan › Cash flow.</p>`; }
function vYear(){
  const y=S.year||+today().slice(0,4), tab=S.yearTab||"summary", now=ymOf(today());
  const months=Array.from({length:12},(_,i)=>`${y}-${pad(i+1)}`), F=months.map(monthFigures);
  const T=F.reduce((a,f)=>({income:a.income+f.income, expense:a.expense+f.expense, investment:a.investment+f.investment, setAside:a.setAside+(f.setAside||0), balance:a.balance+f.balance}),{income:0,expense:0,investment:0,setAside:0,balance:0}), SA=T.setAside>0.5;
  const nb=v=>Math.abs(v)<0.005?'<span class="mut">—</span>':money(v).replace("₹","");
  const kindTag=f=>f.kind==="actual"?"":f.kind==="projected"?'<span class="ykind">so far + due</span>':'<span class="ykind">plan</span>';
  const nm=(k,inc)=>k==="none"?"Uncategorised":k==="cardopen"?"Card balances from Money Manager":k==="repay"?"Loan repayments":k==="carry"?"Last month balance":catName(k);
  const catTable=(key,inc)=>{
    const keys=new Map(); F.forEach(f=>f[key].forEach((v,k)=>keys.set(k,(keys.get(k)||0)+v)));
    const rows=[...keys.entries()].sort((a,b)=>b[1]-a[1]);
    if(!rows.length) return '<div class="list"><div class="empty">Nothing recorded or planned this year.</div></div>';
    return `<div class="ywrap"><table class="ytab"><thead><tr><th>${inc?"Income":"Expense"}</th>${months.map((m,i)=>`<th class="${m===now?"cur":""} ${F[i].kind==="plan"?"pl":""}">${mShort(m)}</th>`).join("")}<th>Total</th></tr></thead><tbody>
      ${rows.map(([k,tot])=>`<tr><td>${esc(nm(k,inc))}</td>${F.map((f,i)=>{ const v=f[key].get(k)||0; return `<td class="${months[i]===now?"cur":""} ${f.kind==="plan"?"pl":""}">${v?money(v).replace("₹",""):""}</td>`; }).join("")}<td><b>${money(tot).replace("₹","")}</b></td></tr>`).join("")}
      <tr class="tot"><td>Total</td>${F.map((f,i)=>`<td class="${months[i]===now?"cur":""}">${money(inc?f.income:f.expense).replace("₹","")}</td>`).join("")}<td>${money(inc?T.income:T.expense).replace("₹","")}</td></tr>
    </tbody></table></div>`;
  };
  return `
  <div class="monthbar"><button class="btn sm" type="button" data-yr="-1" aria-label="Previous year">‹</button><div class="m">${y}</div><button class="btn sm" type="button" data-yr="1" aria-label="Next year">›</button></div>
  <div class="seg" role="group" aria-label="Year view" style="margin-top:10px">${[["summary","Summary"],["expense","Expenses"],["income","Income"],["reserve","Reserve"],["tax","Tax"]].map(([k,l])=>`<button type="button" data-ytab="${k}" aria-pressed="${tab===k}">${l}</button>`).join("")}</div>
  ${tab==="tax"?taxPanel():tab==="reserve"?resvYear(y):tab==="summary"?`
  <div class="btns" style="margin-top:12px"><button class="btn sm" type="button" id="yrReview">Year in review ›</button></div>
  <div class="ywrap" style="margin-top:12px"><table class="ytab ysum ${SA?"y5":""}"><thead><tr><th>Month</th><th>Income ₹</th><th>Expenses ₹</th><th>Invest ₹</th>${SA?"<th>Aside ₹</th>":""}<th>Balance ₹</th></tr></thead><tbody>
    ${F.map((f,i)=>`<tr class="tap ${months[i]===now?"cur":""} ${f.kind==="plan"?"pl":""}" data-ym="${months[i]}" role="button" tabindex="0"><td>${MN[i]} ${kindTag(f)}</td><td class="in">${nb(f.income)}</td><td>${nb(f.expense)}</td><td>${nb(f.investment)}</td>${SA?`<td>${nb(f.setAside||0)}</td>`:""}<td class="${f.balance<-0.5?"neg":""}">${nb(f.balance)}</td></tr>`).join("")}
    <tr class="tot"><td>Total</td><td class="in">${nb(T.income)}</td><td>${nb(T.expense)}</td><td>${nb(T.investment)}</td>${SA?`<td>${nb(T.setAside)}</td>`:""}<td class="${T.balance<-0.5?"neg":""}">${nb(T.balance)}</td></tr>
  </tbody></table></div>
  <p class="note">Balance = income − expenses − investments${SA?" − set aside for big bills":""} for that month. Past months use your entries; ${mLabel(now)} adds what's still due; later months show the plan (EMIs, SIPs, budgets, salary). Tap a month to see its transactions. Card spends count in the month their bill is due, under their own categories.</p>`
  : `<div style="height:12px"></div>${catTable(tab==="income"?"byInc":"byCat", tab==="income")}
  <p class="note">Main categories; subcategories are added into their main category. Shaded columns are planned, not yet spent.</p>`}`;
}
function vForecast(){
  const fc=forecast(S.fcH);
  const neg=fc.months.filter(m=>m.net<0);
  return `
  <div class="seg" role="group" aria-label="Forecast length" style="margin-top:14px">${[6,12,24].map(h=>`<button type="button" data-h="${h}" aria-pressed="${S.fcH===h}">${h} months</button>`).join("")}</div>
  <div class="banner ${neg.length?"bad":""}">${neg.length?`<b>${neg.length} month${neg.length>1?"s":""} short.</b> Planned outflow beats planned income in ${neg.map(m=>mShort(m.ym)).join(", ")}.`:`<b>No short months.</b> Planned income covers everything planned for the next ${S.fcH} months.`} Running balance starts from your current account total of ${money(fc.start)}.</div>
  <div style="height:12px"></div>
  ${fc.months.map((m,i)=>`<details class="fm ${m.net<0?"negm":""}" ${i===0?"open":""}>
    <summary><span class="mn">${mLabel(m.ym)}${i===0?' <span class="chip">This month · balance counts unpaid only</span>':""}</span><span class="net ${m.net<0?"neg":m.net>0?"in":""}">${m.net>0?"+":""}${money(m.net)}</span>
    <span class="sub">In ${short(m.inc)} · Out ${short(m.out)}${m.emi?` (EMI ${short(m.emi)})`:""}${m.inv?` · Invest ${short(m.inv)}`:""}${m.ending.length?` · ${m.ending.length} ending`:""}</span><span class="bal">Bal ${short(m.bal)}</span></summary>
    <div class="items">${m.rows.length?m.rows.map(r=>plannedRow(r,i===0)).join(""):'<div class="empty">Nothing planned.</div>'}</div></details>`).join("")}`;
}
function hostedCardOld(){
  const u=H.user;
  return `<h2>Cloud sync &amp; security</h2>
  <div class="card"><p style="margin:0 0 8px">${u?`Signed in as <b>${esc(u.email||u.uid)}</b>.`:"Not signed in: changes stay on this device until you sign in."} Everything is encrypted with your passphrase before it leaves this device; the cloud only ever holds scrambled data.</p>
  <p class="note" style="margin:0 0 12px">This device: <b>${MODE_LBL[H.mode]||"—"}</b>${lastSync?` · last synced ${lastSync.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}`:""}</p>
  <div class="btns"><button class="btn pri" type="button" id="syncNow">${u?"Sync now":"Sign in with Google"}</button><button class="btn" type="button" id="hMode">Change unlock</button><button class="btn" type="button" id="hPass">Change passphrase</button>${H.mode!=="remember"?'<button class="btn" type="button" id="hLock">Lock now</button>':""}<button class="btn danger" type="button" id="hOut">Sign out of this device</button></div></div>`;
}
/* what's not set up yet, each with a tap to fix it */
function setupChecks(){
  const out=[], td=today(), R=live("recurring").filter(r=>!r.end || r.end>=ymOf(td));
  for(const r of R.filter(r=>r.type==="investment" && !r.accountId)) out.push({t:`${r.name}: no account to pay from`, s:"Needed for the readiness check and Invest day", at:`data-rec="${esc(r.id)}"`});
  for(const r of R.filter(r=>(r.type==="expense"||r.type==="investment") && !r.budget && !r.day && r.freq!=="once")) out.push({t:`${r.name}: no due day`, s:"Without a day it can't go on Pay by Tuesday or the calendar", at:`data-rec="${esc(r.id)}"`});
  for(const a of live("accounts").filter(a=>a.type==="card" && !a.hidden && !cardInfo(a))) out.push({t:`${a.name}: statement and due day missing`, s:"Needed to work out each bill", at:`data-acc="${esc(a.id)}"`});
  if(!reserveAcc() && bigBills().length) out.push({t:"No account holds the big-bills reserve", s:"Edit the account (e.g. Slice) and tick the reserve option", at:'data-ptgo="cashflow"'});
  for(const p of propList()) if((p.plan||[]).some(r=>!r.done) && !(p.fund&&p.fund.by)) out.push({t:`${p.name}: no "ready by" date for its fund`, s:"Set it in the property's Expected tab › Fund settings", at:`data-prop="${esc(p.id)}"`});
  const ny=String(+td.slice(0,4)+1); if(td.slice(5,7)==="12" && ![...NSE_HOL,...(appSet().holidays||[])].some(d=>d.startsWith(ny)) && R.some(r=>r.shift==="trading")) out.push({t:`Add ${ny}'s market holidays`, s:"NSE publishes them in December; Plan › Cash flow › Market holidays", at:'data-holi="1"'});
  return out;
}
function vMore(){
  const bal=balances();
  const crow=c=>`<div class="row tap" data-cat="${esc(c.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(c.name)}</div>${+c.limit>0?`<div class="s">Limit ${money(c.limit)} a month</div>`:""}</div></div>`;
  const tree=k=>catTree(k).map(({c,subs})=>`${crow(c)}${subs.length?`<div class="row" style="padding-left:28px;min-height:0;border-top:0;padding-top:0"><div class="main"><div class="s">${subs.map(s=>`<button class="chip mute" type="button" data-cat="${esc(s.id)}" style="border:0;cursor:pointer;margin:2px 4px 2px 0">${esc(s.name)}</button>`).join("")}</div></div></div>`:""}`).join("");
  const accs=live("accounts"), banks=accs.filter(a=>a.type!=="card"), cards=accs.filter(a=>a.type==="card");
  const arow=a=>`<div class="row tap" ${a.type==="card"&&!a.hidden?`data-card="${esc(a.id)}"`:`data-acc="${esc(a.id)}"`} role="button" tabindex="0"><div class="main"><div class="t">${esc(a.name)}${a.hidden?' <span class="chip mute">Hidden</span>':a.noTotal?' <span class="chip mute">Not in totals</span>':""}</div><div class="s">${ACC_LBL[a.type]} · started at ${money(a.opening)}${a.type==="card"?(a.stmtDay?` · statement day ${a.stmtDay}${a.dueDay?`, due day ${a.dueDay}`:""}`:" · add statement and due day"):""}</div></div><div class="amt ${(bal.get(a.id)||0)<0?"neg":""}">${money(bal.get(a.id))}</div></div>`;
  const CK=setupChecks();
  return `
  <h2>Setup checklist<span class="sp"></span>${CK.length?`<span class="chip warn">${CK.length} to do</span>`:'<span class="chip">All set ✓</span>'}</h2>
  ${CK.length?`<div class="list">${CK.map(x=>`<div class="row tap" ${x.at} role="button" tabindex="0"><div class="main"><div class="t">${esc(x.t)}</div><div class="s">${esc(x.s)}</div></div><span class="mut" aria-hidden="true" style="font-size:18px">›</span></div>`).join("")}</div>`:'<p class="note">Everything the planner needs is set up.</p>'}
  ${profileSection()}
  <h2>People &amp; other payers<span class="sp"></span><button class="btn sm" type="button" id="addPayer">Add</button></h2>
  <p class="note">For money you don't track a balance for, like cash, a meal card or your spouse paying. Entries never change a balance and stay out of your totals, but show in Transactions and under their tags.</p>
  <div class="list">${payers().map(p=>{ const n=live("txns").filter(t=>t.paidBy===p.id).length; return `<div class="row tap" data-payer="${esc(p.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(p.name)}</div><div class="s">${p.own?"Your money":"Someone else's money"}${p.tag?` · tagged ${esc(p.tag)}`:""}</div></div><div class="amt mut" style="font-size:13px">${n} entr${n===1?"y":"ies"}</div></div>`; }).join("")||'<div class="empty">None yet.</div>'}</div>
  ${remindersCard()}
  <h2>Tags</h2>
  <div class="list">${allTags().length?allTags().map(g=>{ const n=live("txns").filter(t=>(t.tags||[]).includes(g)).length; return `<div class="row tap" data-tagedit="${esc(g)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(g)}</div></div><div class="amt mut" style="font-size:13px">${n} transaction${n===1?"":"s"}</div></div>`; }).join(""):'<div class="empty">No tags yet. Add one when you record a transaction.</div>'}</div>
  <h2>Expense categories<span class="sp"></span><button class="btn sm" type="button" id="addCat">Add</button></h2>
  <details class="fm"><summary><span class="mn">${catTree("expense").length} expense categories</span><span class="sub" style="text-align:right">tap to show</span></summary><div class="list" style="border-radius:0">${tree("expense")}</div></details>
  <h2>Income categories</h2>
  <details class="fm"><summary><span class="mn">${catTree("income").length} income categories</span><span class="sub" style="text-align:right">tap to show</span></summary><div class="list" style="border-radius:0">${tree("income")}</div></details>
  ${HOSTED?hostedCard():`<h2>Google Drive</h2>
  <div class="card"><p style="margin:0 0 10px">Data is saved to the <b>KP Money Planner</b> folder in your Google Drive as <span class="num">${FILE}.gz</span> (compressed), and on this device for offline use. Each save replaces the previous file; older copies go to Drive's trash.</p>
  <div class="btns"><button class="btn pri" type="button" id="syncNow">Sync now</button><a class="btn" href="https://drive.google.com/drive/folders/${FOLDER_ID}" target="_blank" rel="noopener">Open folder</a></div>
  <p class="note" style="margin-bottom:0">${mcp?"Connected through your Google Drive connector.":"Drive sync works when you open this app inside Claude. Here, data stays on this device until then."}</p></div>`}
  ${HOSTED||mmImported()?"":`<h2>Money Manager</h2><div class="card"><p style="margin:0 0 10px">Bring in your setup from the Money Manager backup of 10 Nov 2026: 5 bank accounts and 9 credit cards with today's balances, each card's statement and due day, and all your categories and subcategories. HDFC, already here, gets its balance updated. No past transactions are copied.</p><button class="btn pri" type="button" id="impMM">Import Money Manager setup</button></div>`}
  ${HOSTED||imported()||live("txns").length>100?"":`<h2>Import</h2><div class="card"><p style="margin:0 0 10px">Bring in Jan–Dec 2025 from your <b>Yearly Expenses</b> sheet: 347 entries of income, expenses and investments, dated the 1st of each month, under a new account called "2025 sheet import".</p><button class="btn pri" type="button" id="imp25">Import 2025 data</button></div>`}
  <h2>Backup</h2>
  ${HOSTED&&!EMBED?`<div class="card"><p style="margin:0 0 10px"><b>Automatic backups</b>: an encrypted copy is saved in your Firebase every day (last 14 days, plus one a month for a year).</p><div class="btns"><button class="btn pri" type="button" id="snaps">Backups &amp; restore</button></div></div>`:""}
  <div class="card"><div class="btns"><button class="btn pri" type="button" id="xlsx">Download Excel (readable)</button>${HOSTED&&!EMBED?'<button class="btn" type="button" id="encBackup">Download encrypted backup</button>':'<button class="btn" type="button" id="copyJson">Copy data as JSON</button>'}<button class="btn" type="button" id="dlJson">Download data (.json)</button><button class="btn" type="button" id="restore">Restore from backup</button></div>
  <p class="note">To copy everything to your other KP Money Planner (Claude version ↔ Firebase app): Download data here, then Restore from backup there and choose the file. Restore normally merges (the newer copy of each entry wins, deletions carry across); tick <b>Replace everything</b> to make the other copy an exact copy of this one. The file is readable, so keep it somewhere safe.</p>
  <p class="note">${HOSTED&&!EMBED?"The Excel file is not encrypted: keep it somewhere safe. The encrypted backup opens only with your passphrase.":"The Excel file has every transaction, month totals, accounts, regular items, loans, investments and net worth."}</p>
  <p class="note" style="margin-bottom:0">${live("txns").length} transactions · ${live("recurring").length} regular items · ${live("loans").length} loans · ${live("accounts").length} accounts</p></div>`;
}

const imported = () => live("txns").some(t=>t.import==="yearly-expenses-2025");
const mmImported = () => live("categories").some(c=>String(c.id).startsWith("mmc-"));
/* Money Manager setup: active accounts with today's balance, card statement/due days, categories as-is.
   Accounts already here with the same name are updated in place, so their ids (and loans pointing at them) stay. */
async function importMM(){
  if(mmImported()){ toast("Money Manager setup is already imported."); return; }
  let j; try{ const r=await fetch("mm-setup.json"); if(!r.ok) throw 0; j=await r.json(); }catch(e){ toast("Couldn't load the Money Manager file. Try again in a moment."); return; }
  const cur=balances(); let added=0, updated=0;
  for(const m of j.accounts){
    const ex=live("accounts").find(a=>a.name.trim().toLowerCase()===m.name.toLowerCase() && a.type===m.type);
    const base=ex || {id:m.id};
    const o={...base, name:m.name, type:m.type, group:m.group};
    o.opening = Math.round((m.balance - (ex ? (cur.get(ex.id)||0) - (+ex.opening||0) : 0))*100)/100;
    if(m.type==="card"){ o.stmtDay=m.stmtDay; o.dueDay=m.dueDay; o.openingDate=today(); }
    put("accounts",o); ex ? updated++ : added++;
  }
  for(const c of j.categories) if(!byId("categories",c.id)) put("categories",{...c});
  const used=new Set([...live("txns"),...live("recurring")].map(x=>x.categoryId).filter(Boolean)); let removed=0;
  for(const c of live("categories")) if(!String(c.id).startsWith("mmc-") && !used.has(c.id)){ c.deleted=true; stamp(c); removed++; }
  closeModal(); changed();
  toast(`Money Manager setup imported: ${added} accounts added, ${updated} updated, ${j.categories.length} categories. ${removed} unused old categories removed.`);
}
function confirmMM(){
  askConfirm("Import Money Manager's 14 active accounts and cards with today's balances, card statement and due days, and its 200 categories? Old categories that nothing uses will be removed.","Import",importMM);
}
async function import2025(){
  if(imported()){ toast("2025 data is already imported."); return; }
  try{
    const r = await fetch("import-2025.json"); if(!r.ok) throw new Error(r.status);
    const j = await r.json();
    S.data = merge(S.data, j); changed();
    S.month = "2025-01"; toast("Imported 347 entries from 2025. Open Activity to browse them.");
  }catch(e){ toast("Couldn't load the import file. Try again in a moment."); }
}
/* ---------- render & events ---------- */

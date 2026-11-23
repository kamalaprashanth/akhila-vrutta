/* KP Money Planner, moved over unchanged. Tidied into typed modules later in Milestone 2. */
/* ==========================================================================
   Ready for every payment
   - Pay by Tuesday: what you pay yourself before the following Tuesday, money to move, the monthly set-aside
   - Readiness check: each account's balance day by day for 45 days, against its (optional) minimum
   - Big-bills reserve and emergency fund: two pots inside the account you mark as the reserve (e.g. Slice)
   - Big months: the next 12 months going out
   - Expected property payments (builder demands, loan charges, registration) with or without a date
   ========================================================================== */
const addDays = (d,n) => { const x=new Date(d+"T00:00"); x.setDate(x.getDate()+n); return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`; };
const dayDiff = (a,b) => Math.round((new Date(b+"T00:00")-new Date(a+"T00:00"))/864e5);
const wd = d => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(d+"T00:00").getDay()];
const dShort = d => `${wd(d)} ${dLabel(d)}`;
const dFull = d => `${+d.slice(8,10)} ${MN[+d.slice(5,7)-1]} ${d.slice(0,4)}`;   /* 30 Jun 2028 */
const dYr = d => d.slice(0,4)===today().slice(0,4) ? dLabel(d) : dFull(d);
const payTue = () => { const t=today(), g=new Date(t+"T00:00").getDay(); return addDays(t, (2-g+7)%7); };   /* today if Tuesday */
const reserveAcc = () => live("accounts").find(a=>a.reserve && !a.hidden) || null;

/* is this planned item paid for you (auto-debit, or charged to a card whose bill you pay instead)? */
function isAutoItem(it){
  if(it.src==="l"){ const l=byId("loans",it.id); return !!l && kindOf(l)!=="hybrid" && l.manualEmi!==true; }
  if(it.src==="r"){ const r=byId("recurring",it.id); if(!r) return false; if(r.auto) return true; const a=r.accountId&&byId("accounts",r.accountId); return !!(a && a.type==="card"); }
  return false;
}
const isBigItem = it => it.src==="r" && (FREQ[(byId("recurring",it.id)||{}).freq]||1)>=2;
const itemDate = (it, ym) => it.day ? dayIn(+ym.slice(0,4), +ym.slice(5), it.day) : null;
/* the account a planned item takes money from (or puts it into) */
function itemAcc(it){
  if(it.src==="c"){ const c=byId("accounts",it.id); return (c&&c.payFrom) || (mainAcc()||{}).id || ""; }
  return it.accountId || "";
}

/* everything still to pay or receive from the start of this month to `days` ahead, with a date */
function obligations(days=60){ return memo("obl:"+days, ()=>{
  const td=today(), end=addDays(td,days), now=ymOf(td), out=[];
  const fc=forecast(Math.max(2, diffM(now, ymOf(end))+1));
  for(const m of fc.months) for(const r of m.rows){
    if(r.paid || r.missed || !(r.amount>0.5)) continue;
    let date=itemDate(r, m.ym), anyDay=false; if(!date){ date=m.ym===now ? lastDay(now) : `${m.ym}-01`; anyDay=true; }
    if(date>end) continue;
    out.push({...r, ym:m.ym, date, anyDay, auto:r.src==="b"||isAutoItem(r), budget:r.src==="b", big:isBigItem(r), acc:itemAcc(r)});
  }
  for(const p of propList()) for(const x of propPlanDue(p)) if(x.date<=end) out.push(x);
  return out.sort((a,b)=>a.date.localeCompare(b.date)); }); }

/* ---------- readiness: day-by-day balance of each account ---------- */
function readiness(days=45){ return memo("rdy:"+days, ()=>{
  const td=today(), bal=balances(), O=obligations(days), accs=live("accounts").filter(a=>a.type!=="card" && countsAcc(a) && !a.hidden);
  const res=reserveAcc(), held=res?reserveHeld():0, short=[], spare=new Map(), lows=[];
  for(const a of accs){
    const ev=[]; for(const o of O){ if(o.date<td && !o.anyDay) { /* overdue: assume it still goes out today */ }
      const d=o.date<td?td:o.date;
      if(o.type==="income"){ if(o.acc===a.id) ev.push([d,+o.amount,o]); continue; }
      if(o.type==="transfer"){ if(o.accountId===a.id) ev.push([d,-o.amount,o]); if(o.toAccountId===a.id) ev.push([d,+o.amount,o]); continue; }
      if(o.acc===a.id) ev.push([d,-o.amount,o]); }
    /* this month's big-bills set-aside: from the main account into the reserve, due by the payment Tuesday */
    if(res){ const sa=reserveState().setAside, m=mainAcc(), src=m&&m.id!==res.id?m.id:null;
      if(sa>0.5 && src){ const d=payTue()<td?td:payTue(), o={name:"Big-bills reserve", amount:sa, date:d, type:"transfer", accountId:src, toAccountId:res.id, key:"aside:reserve"};
        if(a.id===src) ev.push([d,-sa,o]); if(a.id===res.id) ev.push([d,sa,o]); } }
    ev.sort((x,y)=>x[0].localeCompare(y[0])||x[1]-y[1]);
    let b=bal.get(a.id)||0, low=b, lowD=td, first=null; const min=+a.minBal||0;
    let gap=null, open=false, inShort=false; const eps=[];   /* each dip below the minimum: how far it goes before money next comes in */
    const close=()=>{ if(first){ eps.push({...first, gap}); first=null; } };
    for(const [d,v,o] of ev){ b+=v; if(b<low){ low=b; lowD=d; }
      if(b<min-0.5 && !inShort && v<0){ close(); first={date:d, item:o, bal:b}; gap=b; open=true; inShort=true; }
      else if(open){ if(v>0) open=false; else if(b<gap) gap=b; }
      if(v>0 && b>=min-0.5) inShort=false; }
    close();
    const protect = a.id===(res&&res.id) ? Math.max(0,(bal.get(a.id)||0)-held) : 0;   /* the emergency pot is never offered for moving */
    /* the reserve account (big bills + emergency) is never offered as a source for routine moves */
    spare.set(a.id, a.id===(res&&res.id) ? 0 : Math.max(0, low-min-protect)); lows.push({acc:a, low, lowD, min});
    for(const e of eps) short.push({acc:a, date:e.date, item:e.item, need:Math.ceil(min-e.gap), bal:e.bal});
  }
  for(const s of short){ const src=[...spare.entries()].filter(([id,v])=>id!==s.acc.id && v>=s.need).sort((x,y)=>y[1]-x[1])[0];
    s.from=src?byId("accounts",src[0]):null; if(src) spare.set(src[0], src[1]-s.need);
    const back=(new Date(s.date+"T00:00").getDay()-2+7)%7, tue=addDays(s.date,-back); s.by=tue<td?td:tue; }
  const r=short.sort((a,b)=>a.date.localeCompare(b.date)); r.lows=lows.sort((a,b)=>a.low-b.low); return r; }); }

/* ---------- big-bills reserve and emergency fund ---------- */
/* next due of a repeating item, e.g. "30 Jun 2028" (or "Jun 2028" with no day) */
function recNextLbl(r){ const now=ymOf(today()), step=FREQ[r.freq]||1; if(!r.start) return "";
  let n=r.start>=now ? r.start : addM(r.start, Math.ceil(diffM(r.start,now)/step)*step);
  if(n===now && paidMap().has(`r:${r.id}|${now}`)) n=addM(n,step);
  return r.day ? dFull(itemDate({day:r.day}, n)) : mLabel(n); }
function bigBills(){
  const now=ymOf(today());
  return live("recurring").filter(r=>!r.budget && r.type==="expense" && (FREQ[r.freq]||1)>=2 && (!r.end || r.end>=now)).map(r=>{
    const step=FREQ[r.freq]; let next=r.start>=now ? r.start : addM(r.start, Math.ceil(diffM(r.start,now)/step)*step);
    const paidThis = next===now && paidMap().has(`r:${r.id}|${now}`); if(paidThis) next=addM(next,step);
    const left=Math.max(0,diffM(now,next)), amt=+r.amount||0;
    /* months you can still put money aside: this month up to the month before it's due (at least 1) */
    return {r, step, next, left, amt, months:Math.max(1,left)}; }).sort((a,b)=>a.next.localeCompare(b.next));
}
/* money in the reserve pot: what you set aside into it, less big bills paid from it */
function reserveHeld(){ return memo("rheld", ()=>{ const a=reserveAcc(); if(!a) return 0; let h=+a.reserveStart||0;
  for(const t of live("txns")){ if(t.pot!=="reserve") continue;
    if(t.type==="transfer"){ if(t.toAccountId===a.id) h+=+t.amount; if(t.accountId===a.id) h-=+t.amount; }
    else if(t.type==="expense") h-=+t.amount; }
  return h; }); }
function propFundHeld(p){ const a=reserveAcc(); if(!a) return 0; let h=+(p.fund||{}).start||0;
  for(const t of live("txns")) if(t.pot==="prop:"+p.id && t.type==="transfer"){ if(t.toAccountId===a.id) h+=+t.amount; if(t.accountId===a.id) h-=+t.amount; }
  return h; }
function reserveState(){ return memo("rstate", ()=>{
  const B=bigBills(), a=reserveAcc(), held=reserveHeld(), now=ymOf(today()), target=B.reduce((s,x)=>s+x.amt,0);
  /* what went into the reserve this month (Done and extra money alike) */
  const thisIn=a?live("txns").filter(t=>t.pot==="reserve" && t.type==="transfer" && t.toAccountId===a.id && ymOf(t.date)===now).reduce((s,t)=>s+(+t.amount||0),0):0;
  /* this month's ask is worked out from what the reserve held when the month began, so it doesn't move as you add money.
     That money is shared out to the bills due soonest first; what each still needs is spread over its months left.
     A skipped month just spreads the gap over the months that remain; extra money lowers the later months. */
  let pool=Math.max(0,held-thisIn), pool2=Math.max(0,held);
  for(const x of B){ x.have=Math.min(x.amt,pool2); pool2-=x.have; const st=Math.min(x.amt,pool); pool-=st; x.ask=Math.ceil(Math.max(0,x.amt-st)/x.months); }
  const monthly=B.reduce((s,x)=>s+x.ask,0), setAsideFull=Math.max(0,Math.ceil(monthly-thisIn)), doneThis=setAsideFull<=0.5, behind=0;
  /* only ask for what the main account can spare this month: its lowest point up to month-end, above its minimum, without the set-aside.
     Whatever it can't spare is spread over the next months automatically. */
  const m=mainAcc(), src=a&&m&&m.id!==a.id?m:null; let spare=Infinity;
  if(src && setAsideFull>0.5){ const td=today(), end=lastDay(now), ev=[];
    for(const o of obligations(Math.max(1,dayDiff(td,end)+1))){ const d=o.date<td?td:o.date; if(d>end) continue;
      if(o.type==="income"){ if(o.acc===src.id) ev.push([d,+o.amount]); continue; }
      if(o.type==="transfer"){ if(o.accountId===src.id) ev.push([d,-o.amount]); if(o.toAccountId===src.id) ev.push([d,+o.amount]); continue; }
      if(o.acc===src.id) ev.push([d,-o.amount]); }
    ev.sort((x,y)=>x[0].localeCompare(y[0])||x[1]-y[1]); let b=balances().get(src.id)||0, low=b; for(const [,v] of ev){ b+=v; if(b<low) low=b; }
    spare=Math.max(0,Math.floor(low-(+src.minBal||0))); }
  const setAside=Math.min(setAsideFull, spare), capped=setAside<setAsideFull-0.5;
  /* emergency: 6 months of what you must pay every month — regular bills, EMIs, repayments and budgets in next month's plan
     (one-off and big bills, investing and property payments left out) */
  let nx=forecast(2).months[1], avg=nx ? nx.rows.filter(r=>r.type==="expense" && !isBigItem(r) && !(byId("recurring",r.id)||{}).freq?.startsWith?.("once") && (byId("recurring",r.id)||{}).freq!=="once").reduce((s,r)=>s+(r.src==="b"?r.budget:r.amount),0) : 0;
  const avgPlan=avg; avg=emBase(); const emSuggest=Math.round(avg*emMonths()/1000)*1000, emTarget=a&&+a.emTarget>0?+a.emTarget:emSuggest, bal=a?(balances().get(a.id)||0):0;
  const funds=propList().filter(p=>p.fund&&p.fund.by).map(p=>{ const need=propFundNeed(p), have=propFundHeld(p), months=Math.max(1,diffM(now,p.fund.by)), m=Math.ceil(Math.max(0,need-have)/months);
    const done=live("txns").some(t=>t.pot==="prop:"+p.id && t.type==="transfer" && ymOf(t.date)===now); return {p, need, have, by:p.fund.by, monthly:m, done}; });
  const emergency=bal-held-funds.reduce((s,f)=>s+f.have,0);
  return {B, a, held, target, monthly, thisIn, behind, setAside, setAsideFull, capped, spareFrom:src, doneThis, avg, emSuggest, emTarget, emergency, bal, funds}; }); }

/* ---------- Home: Pay by Tuesday ---------- */
/* Home: accounts that run short before the end of this month, other than what this week's Tuesday card already shows */
function shortAlert(){
  const td=today(), endNext=lastDay(ymOf(td)), R=readiness(Math.max(1,dayDiff(td,endNext))), wk=addDays(payTue(),6);
  const L=R.filter(s=>s.date<=endNext && !(s.from && s.by<=wk)); if(!L.length) return "";
  return `<button type="button" class="rdyal" data-ptgo="cashflow">${L.map(s=>`<span class="ra1">⚠ ${esc(s.acc.name)} runs short by ${money(s.need)} on ${dShort(s.date)} · ${esc(s.item.name)}</span>
    <span class="ra2">${s.from?`Move ${money(s.need)} from ${esc(s.from.name)} by ${dShort(s.by)}`:`Add money to ${esc(s.acc.name)} before then`}${+s.acc.minBal?` · keeps ${money(s.acc.minBal)}`:""}</span>`).join("")}<span class="raa" aria-hidden="true">›</span></button>`;
}
function payTueCard(){
  const td=today(), T=payTue(), isTue=T===td, end=addDays(T,6), O=obligations(21), R=readiness(45), st=reserveState(), dd=dayDiff(td,T);
  const bill=o=>o.type!=="income" && o.type!=="investment" && !o.budget;
  const pay=O.filter(o=>!o.auto && bill(o) && o.date<=end), auto=O.filter(o=>o.auto && bill(o) && o.date>=td && o.date<=end);
  const next=O.filter(o=>!o.auto && bill(o) && o.date>end && o.date<=addDays(end,7)), nextT=addDays(T,7), nextSum=next.reduce((x,o)=>x+o.amount,0);
  const moves=R.filter(s=>s.from && s.by<=end);
  const asides=[]; if(st.a && st.B.length && !st.doneThis && st.setAside>0.5) asides.push({k:"reserve", name:"Big-bills reserve", amt:st.setAside, wrap:st.capped, sub:st.capped?`${money(st.setAsideFull)} due · ${st.spareFrom.name} can spare ${money(st.setAside)} · the rest is spread over the next months`:`${st.B.length} big bill${st.B.length===1?"":"s"} · into ${st.a.name}`});
  for(const f of st.funds) if(!f.done && f.monthly>0.5) asides.push({k:"prop:"+f.p.id, name:`${f.p.name} fund`, amt:f.monthly, sub:`${short(f.need)} by ${mShort(f.by)}`});
  if(!pay.length && !moves.length && !asides.length && !auto.length && !next.length) return "";
  const nextLine=next.length?`<button type="button" class="ptnext" data-ptnext="1" aria-expanded="${!!S.ptNext}"><span>Next Tue ${dLabel(nextT)} · ${next.length} to pay · ${rs0(nextSum)}</span><span aria-hidden="true">${S.ptNext?"▴":"›"}</span></button>
    ${S.ptNext?`<div class="ptnl">${next.map(o=>`<div><span>${esc(o.name)}</span><b>${rs0(o.amount)}</b></div>`).join("")}</div>`:""}`:"";
  /* nothing to do before Tuesday: one line, so the balance stays near the top */
  if(!pay.length && !moves.length && !asides.length)
    return `<div class="ptcard done slim"><div class="ptone">✓ Nothing to pay till Tue ${dLabel(isTue?nextT:T)}</div>${nextLine}</div>`;
  const tot=pay.reduce((x,o)=>x+o.amount,0), n=pay.length;
  const split=o=>{ const i=o.name.indexOf(" · "); return o.src==="pp"&&i>0 ? [o.name.slice(i+3), o.name.slice(0,i)] : [o.name, ""]; };
  const when=o=>{ if(o.date<td) return `<span class="ccbad">was due ${dShort(o.date)}</span>`; if(o.anyDay) return `any day in ${MN[+o.ym.slice(5)-1]}`; if(!isTue && o.date<T) return `<span class="ccbad">due ${dShort(o.date)} · before Tue</span>`; return `due ${dLabel(o.date)}`; };
  const row=(main, sub, amt, btn)=>`<div class="ptrow"><div class="main"><div class="t">${main}</div><div class="s">${sub}</div></div><div class="amt">${amt}</div>${btn}</div>`;
  const payRows=pay.map(o=>{ const [m,pre]=split(o); return row(`${o.date<td?"⚠ ":""}${esc(m)}`, `${pre?esc(pre)+" · ":""}${when(o)}`, rs0(o.amount), `<button class="btn sm pri" type="button" data-ptpay="${esc(o.key)}">Pay</button>`); }).join("");
  const moveRows=moves.map(s=>row(`${esc(s.from.name)} → ${esc(s.acc.name)}`, `for ${esc(s.item.name)} · ${dShort(s.date)}`, rs0(s.need), `<button class="btn sm pri" type="button" data-ptmove="${esc(s.acc.id)}|${esc(s.from.id)}|${s.need}|${esc(s.item.name)}">Move</button>`)).join("");
  const asideRows=asides.map(x=>row(esc(x.name), x.wrap?`<span class="swrap">${esc(x.sub)}</span>`:esc(x.sub), rs0(x.amt), `<button class="btn sm pri" type="button" data-ptaside="${esc(x.k)}|${Math.round(x.amt)}">Done</button>`)).join("");
  const autoLine=auto.length?`<div class="ptauto">Auto · ${auto.map(o=>{ const sh=R.find(x=>x.item.key===o.key); return `${esc(o.name)} ${rs0(o.amount)} ${wd(o.date)} ${+o.date.slice(8)} ${sh?'<span class="ccbad">short</span>':"✓"}`; }).join(" · ")}</div>`:"";
  return `<div class="ptcard">
    <div class="pth"><div><button type="button" class="ptt" data-ptgo="cashflow">${isTue?"Pay today":"Pay by Tuesday"} <span aria-hidden="true">›</span></button><div class="pts">${dLabel(T)} · ${isTue?"today":dd===1?"tomorrow":`in ${dd} days`}</div></div>
      ${n?`<div class="ptr"><b>${rs0(tot)}</b><span>${n} to pay</span></div>`:""}</div>
    ${n?`<div class="ptsec">Pay</div>${payRows}`:`<div class="ptnone">✓ No bills to pay till Tue ${dLabel(nextT)}</div>`}
    ${moves.length?`<div class="ptsec">Move money</div>${moveRows}`:""}
    ${asides.length?`<div class="ptsec">Set aside</div>${asideRows}`:""}
    ${autoLine||nextLine?`<div class="ptbot">${autoLine}${nextLine}</div>`:""}</div>`;
}
/* ---------- Home: Invest day (investments you buy yourself, from the 1st until they're done) ---------- */
function investCard(){
  const now=ymOf(today()), td=today(), m=forecast(1).months[0], inv=m.rows.filter(r=>r.type==="investment" && r.amount>0.5);
  const todo=inv.filter(r=>!r.paid && !isAutoItem(r)), auto=inv.filter(r=>isAutoItem(r)); if(!todo.length) return "";
  const dt=r=>itemDate(r, now)||td, day=todo.map(dt).sort()[0], tot=todo.reduce((s,r)=>s+r.amount,0), first=todo.find(r=>r.moved);
  const late=day<td, dd=dayDiff(td,day);
  return `<div class="ptcard inv"><div class="pth"><div><div class="ptt" style="cursor:default">Invest day</div><div class="pts">${dShort(day)} · ${late?`<span class="ccbad">${-dd} day${dd===-1?"":"s"} ago</span>`:dd===0?"today":dd===1?"tomorrow":`in ${dd} days`}${first?(()=>{ const od=dayIn(+now.slice(0,4),+now.slice(5),first.moved), g=new Date(od+"T00:00").getDay(); return ` · ${dLabel(od)} is a ${g===0?"Sunday":g===6?"Saturday":"market holiday"}`; })():""}</div></div>
      <div class="ptr"><b>${rs0(tot)}</b><span>${todo.length} to buy</span></div></div>
    ${todo.map(r=>`<div class="ptrow"><div class="main"><div class="t">${esc(r.name)}</div><div class="s">${esc(accName(r.accountId)||"no account set")} · ${dLabel(dt(r))}</div></div><div class="amt">${rs0(r.amount)}</div><button class="btn sm pri" type="button" data-invpay="${esc(r.key)}">Invest</button></div>`).join("")}
    ${todo.length>1?`<div class="btns" style="padding:4px 16px 4px;justify-content:flex-end"><button class="btn sm" type="button" data-invall="1">Invest all · ${rs0(tot)}</button></div>`:""}
    ${auto.length?`<div class="ptbot"><div class="ptauto" style="padding-bottom:10px">Auto · ${auto.map(r=>`${esc(r.name.replace(/ - Direct Plan - Growth$/i,""))} ${rs0(r.amount)} ${r.paid?"✓":dLabel(dt(r))}`).join(" · ")}</div></div>`:""}</div>`;
}
function investAll(){
  const now=ymOf(today()), todo=forecast(1).months[0].rows.filter(r=>r.type==="investment" && r.amount>0.5 && !r.paid && !isAutoItem(r));
  askConfirm(`Record ${todo.length} investments today for ${rs0(todo.reduce((s,r)=>s+r.amount,0))}? You can add units and price to each later.`, "Record all", ()=>{
    for(const r of todo){ const rc=byId("recurring",r.id)||{}; put("txns",{id:uid(), type:"investment", amount:Math.round(r.amount*100)/100, date:today(), accountId:r.accountId||(mainAcc()||{}).id, instrument:rc.instrument||r.name, invType:rc.invType, ...(r.chg?{charges:r.chg}:{}), note:r.name, link:r.key}); }
    changed(); toast(`${todo.length} investments recorded`); });
}
function holidaySheet(){
  const mine=[...(appSet().holidays||[])].sort(), yr=today().slice(0,4), built=[...NSE_HOL].filter(d=>d>=today()).sort();
  openSheet("Market holidays", `<p class="note" style="margin-top:0">Built in: NSE's ${[...new Set([...NSE_HOL].map(d=>d.slice(0,4)))].join(", ")} list. Add next year's holidays when NSE publishes them (usually in December).</p>
    ${built.length?`<div class="note">Coming up: ${built.map(d=>`${dShort(d)}`).join(" · ")}</div>`:""}
    <div class="list">${mine.map(d=>`<div class="row"><div class="main"><div class="t">${dShort(d)} ${d.slice(0,4)}</div></div><button class="btn sm" type="button" data-hdel="${d}">Remove</button></div>`).join("")||'<div class="empty">No holidays added by you.</div>'}</div>
    <div class="grid2" style="margin-top:12px">${field(["hd","Add a holiday","date",{value:""}])}<div class="f" style="align-self:end"><button class="btn" id="hadd" type="button">Add</button></div></div>
    <div class="btns"><button class="btn" id="cx" type="button">Done</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#hadd").onclick=()=>{ const d=val("hd"); if(!d) return; const a=appSet(); upsert("settings",{...a, holidays:[...new Set([...(a.holidays||[]), d])].sort()}); closeModal(); holidaySheet(); };
    s.querySelectorAll("[data-hdel]").forEach(b=>b.onclick=()=>{ const a=appSet(); upsert("settings",{...a, holidays:(a.holidays||[]).filter(x=>x!==b.dataset.hdel)}); closeModal(); holidaySheet(); });
  });
}
/* what tapping a Pay row offers */
function ptPaySheet(key){
  const o=obligations(21).find(x=>x.key===key); if(!o) return;
  if(o.src==="pp"){ const p=byId("props",o.prop), row=(p.plan||[]).find(r=>r.id===o.rowId); return propPlanPay(p,row,o); }
  openSheet(o.name, `<div class="kv" style="margin-top:0"><span>Amount</span><b>${money(o.amount)}</b><span>Due</span><b>${o.anyDay?`any day in ${mLabel(o.ym)}`:fmtD(o.date)}</b><span>From</span><b>${esc(accName(o.acc)||"—")}</b></div>
    <div class="btns" style="flex-direction:column;align-items:stretch"><button class="btn pri" id="pp_rec" type="button">Record the payment</button>
    <button class="btn" id="pp_link" type="button">It's already in Transactions</button>${o.src==="r"?'<button class="btn" id="pp_skip" type="button">No bill this month (skip)</button>':""}<button class="btn" id="cx" type="button">Cancel</button></div>
    <p class="note">Record the payment opens the entry filled in for you: check the amount and account, then save.</p>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#pp_rec").onclick=()=>{ closeModal(); if(o.src==="c") return payCard(o.id, o.key); markPaid(o); };
    s.querySelector("#pp_link").onclick=()=>{ closeModal(); ptLinkSheet(o); };
    const sk=s.querySelector("#pp_skip"); if(sk) sk.onclick=()=>{ closeModal(); const r=byId("recurring",o.id); upsert("recurring",{...r, ov:{...(r.ov||{}), [o.ym]:0}}); toast(`${o.name} skipped for ${mLabel(o.ym)}`); };
  });
}
function ptLinkSheet(o){
  const lo=addDays(o.date,-20), hi=addDays(today(),1), used=new Set(live("txns").map(t=>t.link).filter(Boolean));
  const C=live("txns").filter(t=>t.date>=lo && t.date<=hi && !t.link && t.type!=="income" && Math.abs(+t.amount-o.amount)<=Math.max(1,o.amount*0.25)).sort((a,b)=>Math.abs(a.amount-o.amount)-Math.abs(b.amount-o.amount)).slice(0,12);
  openSheet(`Which entry was ${o.name}?`, `<div class="list">${C.map(t=>`<button type="button" class="row tap" data-lk="${esc(t.id)}" style="width:100%;text-align:left;border:0;background:none"><div class="main"><div class="t">${esc(t.note||catName(t.categoryId)||TYPE_LBL[t.type])}</div><div class="s">${fmtD(t.date)} · ${esc(accName(t.accountId))}</div></div><div class="amt">${money(t.amount)}</div></button>`).join("")||'<div class="empty">No entries with a similar amount in the last few weeks.</div>'}</div>
    <div class="btns"><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelectorAll("[data-lk]").forEach(b=>b.onclick=()=>{ const t=byId("txns",b.dataset.lk); closeModal(); put("txns",{...t, link:o.key}); changed(); toast(`Marked ${o.name} as paid`); });
  });
}
function ptMove(acc, from, amt, why){
  txnForm({}, {type:"transfer", amount:+amt, accountId:from, toAccountId:acc, note:`For ${why}`});
}
function ptAside(k, amt){
  const a=reserveAcc(), m=mainAcc(); if(!a){ toast("Mark an account as the reserve first (edit the account)."); return; }
  const extra=amt==="extra";
  const pre={type:"transfer", amount:extra?"":+amt, accountId:(m&&m.id!==a.id)?m.id:"", toAccountId:a.id, pot:k, note:k==="reserve"?(extra?"Big-bills reserve · extra":"Big-bills reserve"):`${(byId("props",k.slice(5))||{}).name||"Property"} fund`};
  txnForm({}, pre);
}

/* ---------- Plan › Cash flow ---------- */
function readyTab(){
  const R=readiness(45), st=reserveState(), now=ymOf(today());
  const rd=`<div class="sh"><h3>Readiness · next 45 days</h3></div>
    <div class="list">${R.length?R.map(s=>`<div class="row"><div class="main"><div class="t">⚠ ${esc(s.acc.name)} runs short on ${dShort(s.date)}</div><div class="s">${esc(s.item.name)} ${money(s.item.amount)} · it would have ${money(s.bal)}${+s.acc.minBal?` (minimum ${money(s.acc.minBal)})`:""}${s.from?` · move ${money(s.need)} from ${esc(s.from.name)} by ${dShort(s.by)}`:" · no account has enough spare"}</div></div>${s.from?`<button class="btn sm pri" type="button" data-ptmove="${esc(s.acc.id)}|${esc(s.from.id)}|${s.need}|${esc(s.item.name)}">Move</button>`:""}</div>`).join("")
      :`<div class="row"><div class="main"><div class="t">✓ Every account has enough for the next 45 days</div><div class="s">Lowest points: ${R.lows.filter(x=>Math.abs(x.low)>0.5||x.acc.id===(mainAcc()||{}).id).slice(0,4).map(x=>`${esc(x.acc.name)} ${money(x.low)} on ${dLabel(x.lowD)}`).join(" · ")}</div></div></div>`}</div>
    <p class="note">Looks at each account's balance today, then adds what's coming in (salary on the 1st) and takes off bills, EMIs, SIPs and card bills on their dates. Set an optional minimum to keep in an account by editing it.</p>`;
  let rs;
  if(!st.a) rs=`<div class="sh"><h3>Big-bills reserve</h3></div><div class="list"><div class="empty">Choose the account that holds your reserve and emergency fund: edit the account (for example Slice) and tick "Holds my big-bills reserve and emergency fund".</div></div>`;
  else { const pct=st.target>0?Math.min(100,st.held/st.target*100):100;
    rs=`<div class="sh"><h3>Big-bills reserve · in ${esc(st.a.name)}</h3></div>
    <div class="card"><div class="kv" style="margin-top:0"><span>Put aside this month</span><b>${money(st.monthly)}</b>
      ${st.thisIn>0.5?`<span>Added this month</span><b>${money(st.thisIn)}</b>`:""}
      <span class="tot">${st.doneThis?"This month":"Still to put aside"}</span><b class="tot">${st.doneThis?"✓ Done":money(st.setAside)}</b>
      <span>Reserve holds</span><b>${money(st.held)} of ${money(st.target)}</b></div>
      ${st.capped?`<p class="cnote">${money(st.setAsideFull)} is due this month, but ${esc(st.spareFrom.name)} can only spare ${money(st.setAside)} before month-end without going short. The other ${money(st.setAsideFull-st.setAside)} is spread over the next months automatically.</p>`:""}
      <div class="pmini" aria-hidden="true"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="btns" style="margin-top:12px">${st.doneThis||st.setAside<=0.5?"":`<button class="btn pri" type="button" data-ptaside="reserve|${Math.round(st.setAside)}">Put aside ${money(st.setAside)}</button>`}<button class="btn" type="button" data-ptaside="reserve|extra">Add extra money</button></div></div>
    <div class="list" style="margin-top:12px">${st.B.map(x=>`<div class="row tap" data-rec="${esc(x.r.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(x.r.name)}${x.r.provider?` <span class="chip mute">${esc(x.r.provider)}</span>`:""}</div><div class="s">${money(x.amt)} due ${dFull(itemDate({day:x.r.day||1},x.next))} · ${x.have>=x.amt-0.5?"fully set aside ✓":`${money(x.have)} set aside`}${x.ask>0.5?` · ${x.months} month${x.months===1?"":"s"} to go`:""}</div></div><div class="amt">${x.ask>0.5?`${money(x.ask)}<div class="s mut" style="font-size:12px;font-weight:400">a month</div>`:"✓"}</div></div>`).join("")||'<div class="empty">No bills every 3 months or longer yet. Add them in Regular, with how often they come.</div>'}</div>
    <p class="note">Each bill's amount is spread over the months left before it's due, counting from when you start. If you skip a month, the gap is spread over the months that remain. Extra money goes to the bills due soonest and lowers what's asked in later months. Pay big bills from ${esc(st.a.name)} with "Paid from the big-bills reserve" ticked.</p>
    ${st.funds.map(f=>`<div class="sh"><h3>${esc(f.p.name)} fund</h3></div><div class="card"><div class="kv" style="margin-top:0"><span>Needed by ${mLabel(f.by)}</span><b>${money(f.need)}</b><span>Set aside so far</span><b>${money(f.have)}</b><span class="tot">Each month</span><b class="tot">${money(f.monthly)}</b></div><p class="cnote">Your share of the price still to pay, the TDS, loan charges and registration costs from the property's Expected tab. Change the date in the property's Expected tab.</p></div>`).join("")}
    <div class="sh"><h3>Emergency fund · in ${esc(st.a.name)}</h3></div>
    <div class="card"><div class="kv" style="margin-top:0"><span>${esc(st.a.name)} balance</span><b>${money(st.bal)}</b><span>Less the reserve${st.funds.length?" and funds":""}</span><b>−${money(st.bal-st.emergency)}</b><span class="tot">Emergency fund</span><b class="tot ${st.emergency<0?"neg":""}">${money(st.emergency)}</b>
      <span>Target${+st.a.emTarget>0?" (yours)":` (${emMonths()} months)`}</span><b>${money(st.emTarget)}</b></div>
      <div class="pmini" aria-hidden="true"><i style="width:${st.emTarget>0?Math.max(0,Math.min(100,st.emergency/st.emTarget*100)).toFixed(1):0}%"></i></div>
      <p class="cnote">${+st.a.emTarget>0?`You set your own target. The suggestion is ${money(st.emSuggest)}: `:""}${emMonths()} months of your average monthly spending over the last 12 months (${money(st.avg)}), across every category except the ones crossed out. Tap a category to include it or leave it out.${st.bal>500000?" Deposits are insured up to ₹5 lakh per bank: consider keeping part of it in another bank.":""}</p>
      <table class="emtab">${(()=>{ const ex=emExcluded(); return [...spendByCat()].filter(([k,v])=>v>=1).sort((x,y)=>y[1]-x[1]).map(([k,v])=>`<tr class="tap ${ex.has(k)?"off":""}" data-emcat="${esc(k)}"><td>${esc(catLbl(k))}</td><td>${money(v)}</td></tr>`).join(""); })()}<tr><td><b>Monthly spending counted</b></td><td><b>${money(st.avg)}</b></td></tr></table>
      <div class="btns" style="margin-top:10px"><button class="btn sm" type="button" id="emSet">Months to cover or own target ›</button></div></div>`; }
  return rd+rs+renewalsList()+bigMonths()+`<div style="height:6px"></div>`+forecastPanel()+`<p class="note" style="margin-top:16px">Items set to "move to the next trading day" skip weekends and NSE holidays. <button class="lnk" type="button" data-holi="1">Market holidays ›</button></p>`;
}
function bigMonths(){
  const now=ymOf(today()), fc=forecast(12), M=fc.months.map(m=>m.ym);
  const big=fc.months.map(m=>m.rows.filter(r=>r.type!=="income" && r.type!=="transfer" && isBigItem(r)).reduce((s,r)=>s+r.amount,0));
  const pp=M.map(ym=>propList().reduce((s,p)=>s+(p.plan||[]).filter(r=>!r.done && r.when && r.when.slice(0,7)===ym).reduce((a,r)=>a+propRowYou(p,r),0),0));
  const reg=fc.months.map((m,i)=>m.out+m.inv-big[i]);
  const ser=[{name:"Regular",color:"var(--v2)",values:reg},{name:"Big bills",color:"var(--v3)",values:big},{name:"Property",color:"var(--v5)",values:pp}].filter(s=>s.values.some(v=>v>0.5));
  const top=M.map((ym,i)=>({ym,i,t:reg[i]+big[i]+pp[i]})).sort((a,b)=>b.t-a.t).slice(0,3).filter(x=>big[x.i]+pp[x.i]>0.5);
  const names=ym=>[...fc.months.find(m=>m.ym===ym).rows.filter(r=>isBigItem(r)).map(r=>`${r.name} ${short(r.amount)}`), ...propList().flatMap(p=>(p.plan||[]).filter(r=>!r.done&&r.when&&r.when.slice(0,7)===ym).map(r=>`${p.name}: ${r.name}`))].join(", ");
  return `<div class="sh"><h3>Big months · next 12</h3></div>`+chartCard("Going out each month","",
    barChart({labels:M.map(mShort), ticks:M.map(mTick), full:M.map(mLabel), series:ser, stack:true, h:200, aria:"Money going out each month for the next 12 months", foot:i=>`Total ${money(reg[i]+big[i]+pp[i])}`}),
    legendHtml(ser)+(top.length?`<p class="cnote">${top.map(x=>`<b>${mLabel(x.ym)}</b> ${money(x.t)}: ${esc(names(x.ym))}`).join("<br>")}</p>`:"")+`<p class="cnote">Regular is everything monthly (bills, EMIs, SIPs, card bills). Property counts only payments with a month set, your share.</p>`);
}
function renewalsList(){
  const B=bigBills(); if(!B.length) return "";
  const yr=B.reduce((s,x)=>s+x.amt*12/x.step,0);
  return `<div class="sh"><h3>Renewals</h3><span class="note" style="margin:0">${money(yr)} a year · ${money(yr/12)} a month</span></div><div class="list">${B.map(x=>{ const days=dayDiff(today(), itemDate({day:x.r.day||1}, x.next)), rem=+x.r.remind||0;
    return `<div class="row tap" data-rec="${esc(x.r.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(x.r.name)}${x.r.auto?' <span class="chip mute">Auto</span>':""}${rem&&days<=rem&&days>=0?' <span class="chip warn">Soon</span>':""}</div><div class="s">${x.r.day?`${x.r.day} `:""}${mLabel(x.next)} · ${FREQ_LBL[x.r.freq]}${x.r.provider?` · ${esc(x.r.provider)}`:""}${rem?` · remind ${rem} days before`:""}</div></div><div class="amt">${money(x.amt)}</div></div>`; }).join("")}</div>`;
}
/* Home: renewals inside their reminder window */
function renewalsSoon(){
  const td=today(), L=bigBills().map(x=>({x, d:itemDate({day:x.r.day||1}, x.next)})).filter(({x,d})=>+x.r.remind>0 && dayDiff(td,d)>=0 && dayDiff(td,d)<=+x.r.remind);
  if(!L.length) return "";
  return `<div class="note rnsoon">🔔 Coming renewals: ${L.map(({x,d})=>`<b>${esc(x.r.name)}</b> ${money(x.amt)} due ${dYr(d)} · in ${dayDiff(td,d)} days`).join(" · ")}</div>`;
}

/* ---------- property: expected payments (builder demands, loan charges, registration) ---------- */
const PLAN_WHO={split:"Bank loan, or you until your share is paid", bank:"Bank loan", you:"You"};
/* your share of one expected row: instalments are split by the loan-to-value; everything else is yours */
function propRowYou(p, r){ const t=(+r.amt||0)+(+r.gst||0); if(r.who==="you") return t+(r.tds?t*0.01:0); if(r.who==="bank") return r.tds?t*0.01:0;
  const ltv=((p.fund||{}).ltv??75)/100; return t*(1-ltv)+(r.tds?t*0.01:0); }
/* what the fund has to cover: your remaining share of the price (by the loan-to-value), plus everything else that's yours */
function propFundNeed(p){
  const ltv=((p.fund||{}).ltv??75)/100, c=propCalc(p), rows=(p.plan||[]).filter(r=>!r.done);
  const inst=rows.filter(r=>r.who==="split"), instT=inst.reduce((s,r)=>s+(+r.amt||0)+(+r.gst||0),0);
  const ownLeft=Math.max(0, Math.min(instT, (1-ltv)*(+p.value||0) - c.price));
  return ownLeft + rows.filter(r=>r.who!=="split").reduce((s,r)=>s+(r.who==="you"?(+r.amt||0)+(+r.gst||0):0),0) + rows.filter(r=>r.tds).reduce((s,r)=>s+((+r.amt||0)+(+r.gst||0))*0.01,0);
}
/* dated expected rows (and the TDS that follows a paid demand) as things to pay */
function propPlanDue(p){
  const out=[];
  for(const r of (p.plan||[])){
    if(!r.done && r.when && r.when.length===10 && r.who!=="bank"){ const you=r.who==="you" ? (+r.amt||0)+(+r.gst||0) : +r.youAmt||0;
      if(you>0.5) out.push({key:`pp:${p.id}|${r.id}`, src:"pp", prop:p.id, rowId:r.id, name:`${p.name} · ${r.name}`, type:"expense", amount:you, date:r.when, ym:r.when.slice(0,7), anyDay:false, auto:false, big:true, acc:r.accountId||(mainAcc()||{}).id||""}); }
    if(r.tds && r.paidOn && !r.tdsDone){ const t=((+r.amt||0)+(+r.gst||0))*0.01, due=addDays(lastDay(ymOf(r.paidOn)),30);
      out.push({key:`pt:${p.id}|${r.id}`, src:"pp", tds:true, prop:p.id, rowId:r.id, name:`${p.name} · TDS (26QB) for ${r.name}`, type:"expense", amount:Math.round(t), date:due, ym:due.slice(0,7), anyDay:false, auto:false, big:false, acc:(mainAcc()||{}).id||""}); }
  }
  return out;
}
function propPlanTab(p){
  const rows=(p.plan||[]), c=propCalc(p), f=p.fund||{}, need=propFundNeed(p);
  const grp=[["Dated",rows.filter(r=>!r.done&&r.when&&r.when.length===10)],["Expected around a month",rows.filter(r=>!r.done&&r.when&&r.when.length===7)],["Not dated yet",rows.filter(r=>!r.done&&!r.when)],["Done",rows.filter(r=>r.done)]].filter(([,L])=>L.length);
  const line=r=>{ const t=(+r.amt||0)+(+r.gst||0), you=propRowYou(p,r);
    return `<div class="row tap" data-pplan="${esc(r.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(r.name)} ${r.status==="estimate"?'<span class="pill">estimate</span>':""}${r.done?'<span class="pill good">paid</span>':""}</div>
      <div class="s">${r.when?(r.when.length===10?fmtD(r.when):`around ${mLabel(r.when)}`):"not dated"}${+r.gst?` · incl. GST ${money(r.gst)}`:""}${r.tds?` · +1% TDS ${money(t*0.01)}`:""} · ${r.who==="bank"?"bank pays":r.who==="you"?"you pay":"bank / you"}</div></div><div class="amt">${money(t)}</div></div>`; };
  return `<div class="card"><b>What's still to come</b><div class="kv" style="margin-top:8px">
      <span>Still to pay in all</span><b>${money(rows.filter(r=>!r.done).reduce((s,r)=>s+(+r.amt||0)+(+r.gst||0),0))}</b>
      <span>Your share (bank lends ${f.ltv??75}%)</span><b>${money(need)}</b>
      <span>Fund: have it ready by</span><b>${f.by?mLabel(f.by):"not set"}</b>${f.by?`<span>Put aside each month</span><b>${money(Math.ceil(Math.max(0,need-propFundHeld(p))/Math.max(1,diffM(ymOf(today()),f.by))))}</b>`:""}</div>
      <div class="btns" style="margin-top:12px"><button class="btn sm pri" type="button" data-pact="planadd">+ Expected payment</button><button class="btn sm" type="button" data-pact="planpdf">Load payment plan (PDF)</button><button class="btn sm" type="button" data-pact="planest">Add usual costs</button><button class="btn sm" type="button" data-pact="planfund">Fund settings</button></div>
      <input type="file" id="planPdf" accept="application/pdf,.pdf" hidden></div>
    <input class="lsearch" type="search" data-lsearch placeholder="Search expected payments" aria-label="Search this list" autocomplete="off">
    ${grp.map(([h,L])=>`<div class="sh"><h3>${h}</h3><span class="note" style="margin:0">${money(L.reduce((s,r)=>s+(+r.amt||0)+(+r.gst||0),0))}</span></div><div class="list">${L.map(line).join("")}</div>`).join("")||'<div class="list"><div class="empty">Nothing expected yet. Load the payment plan from your agreement, or add payments one by one.</div></div>'}
    <p class="note">When a builder demand arrives, tap its row and choose "Demand received": give the date and how much the bank pays. Your share goes on Pay by Tuesday, and the 1% TDS (Form 26QB, due within 30 days after the month you pay) is added for you once it's paid.</p>`;
}
function propPlanForm(p, r){
  const isNew=!r; r=r||{id:uid(), name:"", amt:"", gst:"", when:"", who:"you", status:"estimate", tds:false};
  const wk=r.when?(r.when.length===10?"date":"month"):"none";
  openSheet(isNew?"Expected payment":r.name, `
    ${field(["xn","What","text",{value:r.name,ph:"e.g. 6th floor slab, MODT stamp duty"}])}
    <div class="grid2">${field(["xa","Amount (₹)","number",{value:r.amt,step:"1"}])}${field(["xg","GST (₹)","number",{value:r.gst,step:"1",hint:"If not in the amount"}])}</div>
    <div class="seg" role="group" aria-label="When" id="xw" style="margin-bottom:10px">${[["date","On a date"],["month","Around a month"],["none","Not dated"]].map(([k,l])=>`<button type="button" data-k="${k}" aria-pressed="${wk===k}">${l}</button>`).join("")}</div>
    <div id="w_xd">${field(["xd","Date","date",{value:r.when&&r.when.length===10?r.when:""}])}</div><div id="w_xm">${field(["xm","Month","month",{value:r.when?r.when.slice(0,7):""}])}</div>
    ${field(["xwho","Who pays","select",{value:r.who,options:Object.entries(PLAN_WHO)}])}
    ${field(["xs","Amount is","select",{value:r.status,options:[["estimate","An estimate"],["confirmed","Confirmed"]]}])}
    <label class="opt"><input type="checkbox" id="f_xt" ${r.tds?"checked":""}><div><b>1% TDS applies</b><span>For payments to the builder. You deposit it yourself with Form 26QB, even when the bank pays the builder.</span></div></label>
    <div class="btns" style="margin-top:12px"><button class="btn pri" id="sv" type="button">Save</button>${isNew?"":'<button class="btn" id="dm" type="button">Demand received</button><button class="btn danger" id="dl" type="button">Delete</button>'}<button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    let w=wk; const sync=()=>{ s.querySelectorAll("#xw button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.k===w)); $("#w_xd").hidden=w!=="date"; $("#w_xm").hidden=w!=="month"; };
    s.querySelectorAll("#xw button").forEach(b=>b.onclick=()=>{ w=b.dataset.k; sync(); }); sync();
    s.querySelector("#cx").onclick=closeModal;
    const save=o=>{ const P=byId("props",p.id), plan=[...(P.plan||[])], i=plan.findIndex(x=>x.id===o.id); if(i>=0) plan[i]=o; else plan.push(o); upsert("props",{...P, plan}); };
    const dl=s.querySelector("#dl"); if(dl) dl.onclick=()=>{ closeModal(); const P=byId("props",p.id); upsert("props",{...P, plan:(P.plan||[]).filter(x=>x.id!==r.id)}); toast("Removed"); };
    const dm=s.querySelector("#dm"); if(dm) dm.onclick=()=>{ closeModal(); propDemandForm(p, r); };
    s.querySelector("#sv").onclick=()=>{ const name=val("xn"), amt=parseFloat(val("xa")); if(!name || !(amt>0)){ toast("Enter what it is and the amount."); return; }
      const when=w==="date"?val("xd"):w==="month"?val("xm"):""; if(w!=="none" && !when){ toast("Pick the date or month."); return; }
      closeModal(); save({...r, name, amt, gst:parseFloat(val("xg"))||0, when, who:val("xwho"), status:val("xs"), tds:$("#f_xt").checked}); toast("Saved"); };
  });
}
/* a builder demand: when it's due and how much the bank pays */
function propDemandForm(p, r){
  const t=(+r.amt||0)+(+r.gst||0);
  openSheet(`Demand · ${r.name}`, `
    <div class="grid2">${field(["dA","Amount demanded (₹)","number",{value:t,step:"1",hint:"Instalment plus GST"}])}${field(["dD","Pay by","date",{value:r.when&&r.when.length===10?r.when:addDays(today(),15)}])}</div>
    ${field(["dB","Paid by the bank (₹)","number",{value:r.who==="you"?0:r.who==="bank"?t:"",step:"1",hint:"Leave 0 if you pay all of it"}])}
    <p class="note">Your share goes on Pay by Tuesday for that date. When it's paid, the 1% TDS is added with its 26QB due date.</p>
    <div class="btns"><button class="btn pri" id="sv" type="button">Save demand</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#sv").onclick=()=>{ const A=parseFloat(val("dA")), D=val("dD"), Bk=Math.min(A, parseFloat(val("dB"))||0); if(!(A>0)||!D){ toast("Enter the amount and date."); return; }
      const P=byId("props",p.id), plan=(P.plan||[]).map(x=>x.id===r.id?{...x, when:D, status:"confirmed", amt:A-(+x.gst||0)>0?A-(+x.gst||0):A, gst:A-(+x.gst||0)>0?(+x.gst||0):0, who:Bk>=A-0.5?"bank":Bk<0.5?"you":"split", youAmt:A-Bk, bankAmt:Bk}:x);
      closeModal(); upsert("props",{...P, plan}); toast("Demand saved"); };
  });
}
/* paying a dated expected row (or its TDS) from Pay by Tuesday */
function propPlanPay(p, r, o){
  const markDone=(extra)=>{ const P=byId("props",p.id); upsert("props",{...P, plan:(P.plan||[]).map(x=>x.id===r.id?{...x, ...extra}:x)}); };
  if(o.tds){ txnForm({}, {type:"expense", amount:o.amount, accountId:o.acc, categoryId:propTxnCat("tds"), note:`${p.name} · TDS (Form 26QB) for ${r.name}`, link:o.key}); markDone({tdsDone:true}); return; }
  propItemForm(p, null, {cat:/slab|floor|basement|possession|flooring|agreement|booking/i.test(r.name)?"inst":"legoth", amt:o.amount, date:today(), note:r.name, onSaved:()=>markDone({done:true, paidOn:today()})});
}
/* read the builder's payment plan from the agreement PDF: "On Completion of 6th Floor Slab | 6.0% | 1217655 | 60883" */
function propPlanParse(lines){
  const out=[]; let pend=null; const num=s=>parseFloat(String(s).replace(/[,\/\-‐]/g,""))||0;
  let k=lines.findIndex(l=>/^\s*PAYMENT PLAN\s*$/i.test(l)); if(k<0) k=lines.findIndex(l=>/^\s*On Booking\b/i.test(l)); const L=k>=0?lines.slice(k, k+60):lines;
  for(const l of L){ const p=l.split(" | ").map(x=>x.trim());
    if(/^Total\b/i.test(p[0]) || /^Grand Total/i.test(p[0])) { if(/^Grand/i.test(p[0])) break; continue; }
    const nums=p.filter(x=>/^\d{3,}$/.test(x)).map(num);
    const text=p.filter(x=>!/^\d{3,}$/.test(x) && !/^[\d.]+%$/.test(x)).join(" ").trim();
    const nm=t=>{ t=t.replace(/\s+/g," ").trim(); return /^Advance Maintenance/i.test(t)?"Advance maintenance (first year)":t.replace(/^On Completion of /i,"").replace(/^On /i,"").replace(/\(\s*/g,"(").replace(/\s*\)/g,")"); };
    if(nums.length && text){ out.push({name:nm(text), amt:nums[0], gst:nums[1]||0}); pend=null; }
    else if(nums.length && pend){ out.push({name:nm(pend), amt:nums[0], gst:nums[1]||0}); pend=null; }
    else if(text && /maintenance|corpus/i.test(text)) pend=text.replace(/\s+/g," "); }
  if(!out.length) throw new Error("no payment plan found");
  return out;
}
async function propPlanLoad(p, file){
  let rows; try{ rows=propPlanParse(await epfPdfLines(file)); }catch(e){ console.warn("payment plan",e); toast("Couldn't find a payment plan table in that PDF."); return; }
  const paidNames=/^booking|^agreement/i;
  openSheet("Payment plan found", `<p class="note" style="margin-top:0">${rows.length} payments. Booking and agreement are marked as done, since you've already paid them; untick any that aren't.</p>
    <div class="list">${rows.map((r,i)=>`<label class="row" style="cursor:pointer"><input type="checkbox" data-i="${i}" ${paidNames.test(r.name)?"checked":""} style="flex:none"><div class="main"><div class="t">${esc(r.name)}</div><div class="s">${money(r.amt)}${r.gst?` + GST ${money(r.gst)}`:""}</div></div><div class="amt">${money(r.amt+r.gst)}</div></label>`).join("")}</div>
    <p class="note">Ticked = already paid. Construction stages get no date for now; the bank pays them, or you until your share (${(p.fund||{}).ltv??75}%) is met.</p>
    <div class="btns"><button class="btn pri" id="sv" type="button">Add to Expected</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#sv").onclick=()=>{ const done=new Set([...s.querySelectorAll("input:checked")].map(x=>+x.dataset.i)), P=byId("props",p.id), have=new Set((P.plan||[]).map(x=>x.name.toLowerCase()));
      const add=rows.filter(r=>!have.has(r.name.toLowerCase())).map((r,i)=>({id:uid(), name:r.name, amt:r.amt, gst:r.gst, when:"", status:"confirmed", who:/maintenance|corpus/i.test(r.name)?"you":"split", tds:!/maintenance|corpus/i.test(r.name), done:done.has(rows.indexOf(r))}));
      closeModal(); upsert("props",{...P, plan:[...(P.plan||[]), ...add]}); toast(`${add.length} expected payments added`); };
  });
}
/* the usual extra costs, estimated from the agreement value (edit each once you know the real figure) */
function propPlanEstimates(p){
  const v=+p.value||0, ltv=((p.fund||{}).ltv??75)/100, loan=Math.round(v*ltv), base=Math.round(v/1.05);
  const E=[["Loan processing fee (about 0.5% + GST)", Math.round(loan*0.005*1.18), "you"],["Bank legal & valuation fees", 10000, "you"],["MODT stamp duty (0.5% of the loan)", Math.round(loan*0.005), "you"],
    ["Stamp duty at registration (about 5%)", Math.round(base*0.05), "you"],["Registration fee (about 1%)", Math.round(base*0.01), "you"],["Corpus fund", 79200, "you"]];
  const P=byId("props",p.id), have=new Set((P.plan||[]).map(x=>x.name.toLowerCase()));
  const add=E.filter(([n])=>!have.has(n.toLowerCase())).map(([name,amt,who])=>({id:uid(), name, amt, gst:0, when:"", status:"estimate", who, tds:false}));
  upsert("props",{...P, plan:[...(P.plan||[]), ...add]}); toast(add.length?`${add.length} estimated costs added: edit each when you know the real figure`:"Already added");
}
function propFundForm(p){
  const f=p.fund||{};
  openSheet(`${p.name} · fund`, `${field(["fb","Have my share ready by","month",{value:f.by||"",hint:"Roughly when you expect the loan and the bigger payments to start"}])}
    ${field(["fl","Bank lends (% of the price)","number",{value:f.ltv??75,step:"1",hint:"Usually up to 75% for loans above ₹75 lakh"}])}
    ${field(["fs","Already set aside for it (₹)","number",{value:f.start??"",step:"1"}])}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#sv").onclick=()=>{ const by=val("fb"), ltv=parseFloat(val("fl")); closeModal(); upsert("props",{...byId("props",p.id), fund:{by:by||null, ltv:ltv>=0&&ltv<=100?ltv:75, start:parseFloat(val("fs"))||0}}); toast("Saved"); };
  });
}

function payCard(id, key){ const a=byId("accounts",id); if(!a) return; const c=cardInfo(a), amt=c ? (c.dueLeft>0.5?c.dueLeft:c.owed) : Math.max(0,-(balances().get(a.id)||0));
  txnForm({}, {type:"transfer", amount:Math.round(amt*100)/100||undefined, accountId:a.payFrom||(mainAcc()||{}).id, toAccountId:a.id, note:`${a.name} bill`}); }

const VIEWS={advisor:vAdvisor, insights:vInsights, accounts:vAccounts, home:vHome, activity:vActivity, plan:vPlan, forecast:vForecast, more:vMore, loan:vLoan, card:vCard, epf:vEpf, ppf:vPpf, nps:vNps, props:vProps, prop:vProp};
const TITLES={advisor:"Advisor", insights:"Insights", accounts:"Accounts", home:"Home", activity:"Transactions", plan:"Plan", forecast:"Forecast", more:"Settings", loan:"Loan", card:"Credit card", epf:"EPF", ppf:"PPF", nps:"NPS", props:"Properties", prop:"Properties"};
function render(){
  if(!S.data) return;
  ensurePayers();
  MEMO=new Map(); for(const k in CH) delete CH[k]; chSeq=0; { const t=$("#ctip"); if(t) t.hidden=true; }
  if(carryReady && (ensureCarry() | ensureCardEmi() | ensureSnap())){ MEMO=new Map(); S.dirty=true; saveLocal(); scheduleSync(); }
  if(!VIEWS[S.view]) S.view="home";
  /* paise in a lighter, smaller style wherever an amount appears in text (never inside tags or attributes) */
  const KEYS="[data-tx],[data-hold],[data-rec],[data-loan],[data-acc],[data-card]", keyOf=e=>e.getAttribute("data-tx")||e.getAttribute("data-hold")||e.getAttribute("data-rec")||e.getAttribute("data-loan")||e.getAttribute("data-acc")||e.getAttribute("data-card");
  const before = RV.view===S.view ? new Set([...$("#view").querySelectorAll(KEYS)].map(keyOf)) : null;
  $("#view").innerHTML = VIEWS[S.view]().replace(/>([^<]+)</g, (m0,txt)=>">"+txt.replace(/(₹[\d,]+)\.(\d{2})(?![\dLCk])/g,'$1<span class="p">.$2</span>').replace(/₹/g,'<span class="cur">₹</span>')+"<");
  if(before && before.size) $("#view").querySelectorAll(KEYS).forEach(e=>{ if(!before.has(keyOf(e))) e.classList.add("enter"); });
  if(RV.view!==S.view){ const v=$("#view"); v.classList.remove("swap"); void v.offsetWidth; v.classList.add("swap"); clearTimeout(RV.t); RV.t=setTimeout(()=>v.classList.remove("swap"),600); }
  RV.view=S.view;
  if((S.view==="home"||S.view==="advisor") && !S.advAuto && aiFn()){ S.advAuto=true; setTimeout(()=>advRunCheck(false),2500); }
  if(carryReady) maybeNotify();
  $("#ttl").textContent = TITLES[S.view];
  const tabV = S.view==="loan" ? "plan" : S.view==="card"||S.view==="epf"||S.view==="ppf"||S.view==="nps"||S.view==="props"||S.view==="prop" ? "accounts" : S.view;
  document.querySelectorAll(".ywrap").forEach(w=>{ const c=w.querySelector("th.cur"); if(c) w.scrollLeft=Math.max(0, c.offsetLeft-w.querySelector("th").offsetWidth-c.offsetWidth); });
  document.querySelectorAll(".tab").forEach(b=>{ if(b.dataset.v===tabV) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
}
const hashOf = v => v==="prop" ? `prop:${S.propId}` : v==="loan" ? `loan:${S.loanId}` : v==="card" ? `card:${S.cardId}` : v;
function readHash(){ const h=location.hash.slice(1); if(h.startsWith("prop:")){ S.propId=h.slice(5); return "prop"; } if(h.startsWith("loan:")){ S.loanId=h.slice(5); return "loan"; } if(h.startsWith("card:")){ S.cardId=h.slice(5); return "card"; } return h; }
function go(v){ if(v==="forecast"){ S.planTab="cashflow"; v="plan"; } if(v==="year"){ S.insTab=v; v="insights"; } S.view=v; const h=hashOf(v); if(location.hash!=="#"+h){ try{ history.replaceState(null,"","#"+h); }catch(e){ location.hash=h; } } render(); window.scrollTo(0,0); }
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>go(b.dataset.v));
document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>txnForm({}, {accountId: (mainAcc()||live("accounts")[0]||{}).id}));
document.addEventListener("input",e=>{ const inp=e.target.closest&&e.target.closest("[data-lsearch]"); if(!inp) return;
  const q=inp.value.trim().toLowerCase(), root=$("#view")||document;
  root.querySelectorAll(".list").forEach(L=>{ if(!(inp.compareDocumentPosition(L)&Node.DOCUMENT_POSITION_FOLLOWING)) return;
    let any=false; L.querySelectorAll(":scope > .row").forEach(r=>{ const ok=!q||r.textContent.toLowerCase().includes(q); r.hidden=!ok; if(ok) any=true; });
    L.hidden=!any && !!q; const h=L.previousElementSibling; if(h&&h.classList.contains("sh")) h.hidden=L.hidden; });
});
$("#syncBtn").onclick=()=>{ const t=($("#syncTxt").textContent||"Sync").trim(); toast(t+(syncing?"":" · checking for changes now")); syncNow(); };
function activate(e){
  const el=e.target.closest("[data-insopen],[data-invpay],[data-invall],[data-holi],[data-ptnext],[data-pplan],[data-ptpay],[data-ptmove],[data-ptaside],[data-prop],[data-ptab],[data-pact],[data-pitem],[data-go],[data-payer],[data-hold],[data-acct],[data-hg],[data-hyr],[data-homem],[data-ins],[data-lt],[data-pt],[data-mi],[data-hm],[data-hmt],[data-hmo],[data-hmo2],[data-cpay],[data-yr],[data-ytab],[data-ym],[data-pay],[data-miss],[data-undo],[data-ftype],[data-ftag],[data-tagedit],[data-fclear],[data-fcat],[data-tx],[data-rec],[data-loan],[data-card],[data-ca],[data-et],[data-efy],[data-epfm],[data-ea],[data-pt2],[data-pfy],[data-ppfm],[data-pa],[data-nt],[data-na],[data-ct],[data-cyc],[data-la],[data-rc],[data-pl],[data-acc],[data-cat],[data-m],[data-h],#addRec,#addLoan,#addAcc,#addCat,#syncNow,#copyJson,#restore,#imp25,#impMM,#pickMain,#txFilters,#txMore,#addHold,#moreCards,#xlsx,#dlJson,#encBackup,#hMode,#hPass,#hLock,#hOut,#addPayer,#pxStatus,#snaps");
  if(!el) return;
  const d=el.dataset;
  if(d.go) return go(d.go);
  if(d.prop){ S.propId=d.prop; S.propTab="overview"; return go("prop"); }
  if(d.ptab){ S.propTab=d.ptab; return render(); }
  if(d.pact){ const pp=byId("props",S.propId);
    if(d.pact==="newprop") return propForm();
    if(d.pact==="cats") return propCatsSheet();
    if(!pp) return;
    if(d.pact==="edit") return propForm({...pp});
    if(d.pact==="add") return propItemForm(pp);
    if(d.pact==="pick") return propPickForm(pp);
    if(d.pact==="planadd") return propPlanForm(pp);
    if(d.pact==="planest") return propPlanEstimates(pp);
    if(d.pact==="planfund") return propFundForm(pp);
    if(d.pact==="planpdf"){ const inp=$("#planPdf"); if(inp){ inp.onchange=ev=>{ const f=ev.target.files[0]; ev.target.value=""; if(f) propPlanLoad(pp,f); }; inp.click(); } return; }
    if(d.pact==="stmt"){ const inp=$("#propStmt"); if(inp){ inp.onchange=ev=>{ const f=ev.target.files[0]; ev.target.value=""; if(f) propStmtLoad(pp,f); }; inp.click(); } return; } }
  if(d.pplan){ const pp=byId("props",S.propId), r=pp&&(pp.plan||[]).find(x=>x.id===d.pplan); if(r) return propPlanForm(pp,{...r}); return; }
  if(d.ptnext){ S.ptNext=!S.ptNext; return render(); }
  if(d.insopen){ S.insOpen=!S.insOpen; return render(); }
  if(d.invpay){ const r=forecast(1).months[0].rows.find(x=>x.key===d.invpay); if(r) return markPaid(r); return; }
  if(d.invall) return investAll();
  if(d.holi) return holidaySheet();
  if(d.ptpay) return ptPaySheet(d.ptpay);
  if(d.ptmove){ const [a,f,n,w]=d.ptmove.split("|"); return ptMove(a,f,n,w); }
  if(d.ptaside){ const [k,n]=d.ptaside.split("|"); return ptAside(k,n); }
  if(d.pitem){ const it=byId("propItems",d.pitem), pp=it&&byId("props",it.prop); if(pp) return propItemForm(pp,{...it}); return; }
  if(d.lt){ S.loanTab=d.lt; return render(); }
  if(d.pt){ S.planTab=d.pt; return render(); }
  if(d.mi){ const [rid,ym]=d.mi.split("|"); return monthItemSheet(rid, ym); }
  if(d.hold){ const hh=byId("holdings",d.hold); if(hh && hh.type==="PPF" && hh.ppf){ S.ppfId=hh.id; return go("ppf"); } if(hh && hh.type==="NPS" && hh.nps){ S.npsId=hh.id; return go("nps"); } if(hh && hh.type==="EPF" && hh.epf){ S.epfId=hh.id; S.epfTab=S.epfTab||"overview"; return go("epf"); } return holdingForm({...hh}); }
  if(d.et){ S.epfTab=d.et; return render(); }
  if(d.pt2){ S.ppfTab=d.pt2; return render(); }
  if(d.nt){ S.npsTab=d.nt; return render(); }
  if(d.na){ const hh=npsHold(); if(!hh) return; if(d.na==="add") return npsContribForm(hh); if(d.na==="units") return npsUnitsForm(hh); if(d.na==="edit") return holdingForm({...hh}); }
  if(d.pfy){ S.ppfFy=+d.pfy; return render(); }
  if(d.ppfm){ const hh=ppfHold(); const m=hh&&(hh.ppf.manual||[]).find(x=>x.id===d.ppfm); if(m) return ppfEntryForm(hh,{...m}); return; }
  if(d.pa){ const hh=ppfHold(); if(!hh) return; if(d.pa==="add") return ppfEntryForm(hh); if(d.pa==="edit") return holdingForm({...hh}); }
  if(d.efy){ S.epfFy=+d.efy; return render(); }
  if(d.epfm){ const hh=epfHold(); const m=hh&&(hh.epf.manual||[]).find(x=>x.id===d.epfm); if(m) return epfEntryForm(hh,{...m}); return; }
  if(d.ea){ const hh=epfHold(); if(!hh) return; if(d.ea==="add") return epfEntryForm(hh); if(d.ea==="edit") return holdingForm({...hh}); if(d.ea==="pdf"){ const inp=$("#epfPdfV"); if(inp){ inp.onchange=ev=>{ epfPdfToHolding(hh, ev.target.files); ev.target.value=""; }; inp.click(); } return; } }
  if(d.acct){ S.accTab=d.acct; prefSet("accTab",d.acct); if(S.view!=="accounts") return go("accounts"); render(); const sg=$(".accseg"); if(sg && sg.getBoundingClientRect().top<0) sg.scrollIntoView({block:"start"}); return; }
  if(d.payer){ const p=byId("payers",d.payer); if(p) return payerForm({...p}); }
  if(d.hyr){ S.homeYr=String(d.hyr); return render(); }
  if(d.homem){ const f=txFilter(); Object.assign(f,{type:"all", cat:"", acc:"", tag:homeTag(), period:"month", from:"", to:"", q:""}); S.month=d.homem; return go("activity"); }
  if(d.hg){ const o=new Set(prefGet("holdOpen",[])); o.has(d.hg)?o.delete(d.hg):o.add(d.hg); prefSet("holdOpen",[...o]); return render(); }
  if(d.ins==="forecast"){ S.planTab="cashflow"; return go("plan"); }
  if(d.ins){ S.insTab=d.ins; return S.view==="insights" ? render() : go("insights"); }
  if(d.pay){ const [k,ym]=[d.pay, d.pay.split("|")[1]]; const it=planned(ym).find(x=>x.key===k); if(it) markPaid(it); return; }
  if(d.miss) return markMissed(d.miss);
  if(d.tagedit) return tagSheet(d.tagedit);
  if(d.ftag){ const f=txFilter(); f.tag = f.tag===d.ftag ? "" : d.ftag; S.txLimit=0; return render(); }
  if(d.ftype){ txFilter().type=d.ftype; S.txLimit=0; return render(); }
  if(d.fcat){ txFilter().cat=d.fcat; S.txLimit=0; return render(); }
  if(d.fclear){ const f=txFilter(); if(d.fclear==="all") S.f={type:f.type,cat:"",acc:"",tag:"",period:"month",from:"",to:"",q:""}; else if(d.fclear==="period"){ f.period="month"; f.from=f.to=""; } else if(d.fclear==="amt"){ f.min=f.max=""; } else if(d.fclear==="uncat"){ f.uncat=false; } else f[d.fclear]=""; S.txLimit=0; return render(); }
  if(d.undo) return undoMark(d.undo);
  if(d.tx && d.tx.startsWith("trd:")){ const tr=byId("trades",d.tx.slice(4)); const hh=tr && live("holdings").find(h=>h.px==="stk:"+tr.isin || (h.type==="Stock" && (h.name||"").split(" ")[0].toUpperCase()===tr.sym.replace(/-\w+$/,""))); if(hh) return holdingForm({...hh}); toast(tr?`You no longer hold ${tr.sym}.`:"Trade not found."); return; }
  if(d.tx && d.tx.startsWith("ppf:")){ const it=ppfTxItems().find(x=>x.id===d.tx); if(!it) return; S.ppfId=it.ppfHid; const hh=byId("holdings",it.ppfHid);
    if(it.ppfMid && hh){ const m=(hh.ppf.manual||[]).find(x=>x.id===it.ppfMid); if(m) return ppfEntryForm(hh,{...m}); }
    S.ppfTab="statement"; S.ppfFy=fyOf(it.date); return go("ppf"); }
  if(d.tx && d.tx.startsWith("epf:")){ const [,hid,k,,]=d.tx.split(":"); const it=epfTxItems().find(x=>x.id===d.tx); S.epfId=hid; const hh=byId("holdings",hid);
    if(it && it.epfMid && hh){ const m=(hh.epf.manual||[]).find(x=>x.id===it.epfMid); if(m) return epfEntryForm(hh,{...m}); }
    S.epfTab="passbook"; if(it) S.epfFy=it.epfFy; return go("epf"); }
  if(d.tx){ const t=byId("txns",d.tx); if(t && t.type==="carry") return carrySheet(t); if(t && t.type==="loan"){ const l=byId("loans",t.loanId); if(l){ if(t.act==="missed") return missedSheet(l,t); if(t.act==="catchup") return catchupForm(l,{...t}); return entryForm(l,t.act,{...t}); } } return txnForm({...t}); }
  if(d.rec) return recForm({...byId("recurring",d.rec)});
  if(d.loan){ S.loanId=d.loan; S.loanTab="overview"; return go("loan"); }
  if(d.la || d.rc || d.pl){ const l=byId("loans",S.loanId); if(!l) return;
    if(d.rc) return rateForm(l, {...(bankOf(l).rates||[]).find(r=>r.id===d.rc)});
    if(d.pl) return planForm(l, {...(l.plans||[]).find(p=>p.id===d.pl)});
    if(d.la==="edit") return loanForm({...l});
    if(d.la==="close") return closeLoanSheet(l);
    if(d.la==="reopen") return askConfirm(`Reopen "${l.name}"? Its EMIs and balance come back from ${mLabel(addM(l.closedOn,1))}.`,"Reopen",()=>{ const o={...l}; delete o.closedOn; upsert("loans",o); toast("Loan reopened"); });
    if(d.la==="rate") return rateForm(l);
    if(d.la==="sync") return syncForm(l);
    if(d.la==="plan") return planForm(l);
    if(d.la==="catchup") return catchupForm(l);
    return entryForm(l, d.la, {}, {accountId: d.la==="prepay" ? (bankOf(l)?.accountId||"") : ""});
  }
  if(d.acc) return accForm({...byId("accounts",d.acc)});
  if(d.card){ S.cardId=d.card; S.cyc=0; S.cardTab="billed"; return go("card"); }
  if(d.ct){ S.cardTab=d.ct; return render(); }
  if(d.cyc){ S.cyc=Math.max(0,(S.cyc||0)+ +d.cyc); return render(); }
  if(d.cpay){ S.cardId=d.cpay; d.ca="pay"; }
  if(d.ca){ const a=byId("accounts",S.cardId); if(!a) return;
    if(d.ca==="edit") return accForm({...a});
    if(d.ca==="spend") return txnForm({}, {type:"expense", accountId:a.id});
    const c=cardInfo(a), amt=c ? (c.dueLeft>0.5?c.dueLeft:c.owed) : Math.max(0,-(balances().get(a.id)||0));
    const from=a.payFrom || (live("accounts").find(x=>x.type==="bank")||{}).id;
    return txnForm({}, {type:"transfer", amount:Math.round(amt*100)/100||undefined, accountId:from, toAccountId:a.id, note:`${a.name} bill`});
  }
  if(d.cat) return catForm({...byId("categories",d.cat)});
  if(d.m){ S.month=addM(S.month,+d.m); return render(); }
  if(d.h){ S.fcH=+d.h; return render(); }
  if(d.hm){ S.hm=addM(S.hm||ymOf(today()), +d.hm); S.hmOpen=""; return render(); }
  if(d.hmt){ S.hmTab=d.hmt; S.hmOpen=""; S.hmOpen2=""; return render(); }
  if(d.hmo){ S.hmOpen = S.hmOpen===d.hmo ? "" : d.hmo; S.hmOpen2=""; return render(); }
  if(d.hmo2){ S.hmOpen2 = S.hmOpen2===d.hmo2 ? "" : d.hmo2; return render(); }
  if(d.yr){ S.year=(S.year||+today().slice(0,4))+ +d.yr; return render(); }
  if(d.ytab){ S.yearTab=d.ytab; return render(); }
  if(d.ym){ S.month=d.ym; const f=txFilter(); Object.assign(f,{period:"month", cat:"", acc:"", q:"", type:"all"}); return go("activity"); }
  switch(el.id){
    case "addRec": return recForm();
    case "addLoan": return loanForm();
    case "addAcc": return accForm();
    case "addCat": return catForm();
    case "syncNow": return syncNow();
    case "imp25": return import2025();
    case "impMM": return confirmMM();
    case "pickMain": return pickMainSheet();
    case "txFilters": return txFilterSheet();
    case "addHold": return holdingForm();
    case "pxStatus": return pxStatusSheet();
    case "snaps": return hSnapSheet();
    case "moreCards": S.allCards=!S.allCards; return render();
    case "xlsx": return exportExcel();
    case "dlJson": return saveFile(`KP_Money_Planner_data_${today()}.json`, JSON.stringify({app:"KP Money Planner", exported:new Date().toISOString(), data:S.data}), "application/json");
    case "addPayer": return payerForm();
    case "encBackup": return hBackup();
    case "hMode": return hModeSheet();
    case "hPass": return hChangePass();
    case "hLock": return location.reload();
    case "hOut": return hSignOut();
    case "txMore": S.txLimit=(S.txLimit||300)+300; return render();
    case "copyJson": { const j=JSON.stringify(S.data,null,1); (navigator.clipboard?navigator.clipboard.writeText(j):Promise.reject()).then(()=>toast("Copied. Paste it into a note to keep a backup."),()=>openSheet("Your data",`<div class="f"><label for="f_dump">Select all and copy</label><textarea id="f_dump" readonly>${esc(j)}</textarea></div><button class="btn" id="cx" type="button">Close</button>`,s=>s.querySelector("#cx").onclick=closeModal)); return; }
    case "restore": return openSheet("Restore from backup", `${field(["json","Paste backup JSON","textarea"])}<div class="f"><label for="f_file">Or choose a backup file (.json)</label><input id="f_file" type="file" accept=".json,application/json"></div><p class="note">Restoring merges the backup with what's here; for each record the newer copy wins.</p>
      <label class="opt"><input type="checkbox" id="f_repl"><div><b>Replace everything here with this backup</b><span>A hard reset: this copy becomes exactly the backup. Anything that isn't in the backup is deleted, here and on your other devices when they sync. Download a backup of this copy first.</span></div></label>
      <div class="btns"><button class="btn pri" id="sv" type="button">Restore</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
        s.querySelector("#cx").onclick=closeModal;
        s.querySelector("#f_file").onchange=async ev=>{ const f=ev.target.files[0]; if(f) $("#f_json").value=await f.text(); };
        s.querySelector("#sv").onclick=async()=>{ try{ let j=JSON.parse($("#f_json").value);
            if(j && j.kpvault){ if(!HOSTED) throw new Error("Encrypted backups open in the hosted app."); j=await hOpenBackup(j); }
            if(j && j.data && typeof j.data==="object" && !COLS.some(c=>Array.isArray(j[c]))) j=j.data;   /* a "Download data" file */
            if(!COLS.some(c=>Array.isArray(j[c]))) throw 0;
            if($("#f_repl").checked){ const b=$("#sv"); if(!b.dataset.arm){ b.dataset.arm=1; b.textContent="Tap again to replace everything"; b.classList.add("danger"); return; }
              S.data=replaceWith(S.data, j); MEMO=new Map(); closeModal(); changed(); toast("Replaced with the backup"); return; }
            if((j.categories||[]).length){ for(const c of ["accounts","categories"]) for(const x of (S.data[c]||[])) if(x.seed && !x.deleted){ x.deleted=true; delete x.seed; stamp(x); } } S.data=merge(S.data,j); closeModal(); changed(); toast("Restored"); }
          catch(e){ toast(e && e.message ? "Couldn't restore: "+e.message : "That isn't a valid backup. Paste the JSON copied from this app."); } };
      });
  }
}
document.addEventListener("click", activate);
document.addEventListener("keydown", e=>{ if((e.key==="Enter"||e.key===" ") && e.target.matches('[role="button"]')){ e.preventDefault(); activate(e); } if(e.key==="Escape") closeModal(); });
let txqT=null;
document.addEventListener("input", e=>{ if(e.target.id!=="txq") return; const v=e.target.value; clearTimeout(txqT);
  txqT=setTimeout(()=>{ txFilter().q=v.trim(); S.txLimit=0; render(); const el=$("#txq"); if(el){ el.focus({preventScroll:true}); el.setSelectionRange(el.value.length, el.value.length); } }, 250); });
document.addEventListener("change", e=>{ if(e.target.id==="trFile"){ importTradebooks([...e.target.files]); e.target.value=""; } });
document.addEventListener("keydown", e=>{ if((e.key==="Enter"||e.key===" ") && e.target.matches && e.target.matches('label[for="trFile"]')){ e.preventDefault(); $("#trFile").click(); } });
document.addEventListener("change", e=>{ if(e.target.id==="mpick" && /^\d{4}-\d{2}$/.test(e.target.value)){ S.month=e.target.value; render(); } });
window.addEventListener("hashchange", ()=>{ const v=readHash(); if(VIEWS[v] && (v!==S.view || v==="loan" || v==="card")){ S.view=v; render(); } });


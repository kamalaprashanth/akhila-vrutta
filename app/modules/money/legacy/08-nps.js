/* KP Money Planner, moved over unchanged. Tidied into typed modules later in Milestone 2. */
/* ==========================================================================
   NPS page: three schemes (E, C, G) tracked by units × NAV
   ========================================================================== */
const NPS_RET = {E:10, C:8, G:7.5, A:8};                 /* assumed yearly returns for the projection (editable) */
const NPS_LBL = {E:"Equity (E)", C:"Corporate bonds (C)", G:"Government bonds (G)", A:"Alternative (A)"};
const npsHold = () => byId("holdings",S.npsId) || live("holdings").find(h=>h.type==="NPS" && h.nps);
const npsKey = l => l.k || ((String(l.nm||l.n||"").match(/scheme\s+([ECGA])\b/i)||[])[1]||"").toUpperCase();
function npsCalc(h){
  const x=holdingSum(h), N=h.nps||{}, L=npsLines(h)||[], now=today();
  const lines=L.map(l=>({...l, key:npsKey(l), value:(+l.units||0)*(+l.price||0)}));
  const tot=lines.reduce((a,l)=>a+l.value,0)||1;
  lines.forEach(l=>l.pct=l.value/tot*100);
  const inst=(h.instrument||"NPS").trim().toLowerCase();
  const entries=live("txns").filter(t=>t.type==="investment" && (t.instrument||"").trim().toLowerCase()===inst).sort((a,b)=>b.date.localeCompare(a.date));
  const alloc=N.alloc||{E:75,C:10,G:15};
  const dob=N.dob || (live("holdings").find(e=>e.type==="EPF" && e.epf && e.epf.dob)||{epf:{}}).epf.dob || "";
  const at=+N.retireAge||60, retYm=dob?addM(dob.slice(0,7), at*12):null;
  const rec=live("recurring").find(r=>r.type==="investment" && (r.instrument||"").trim().toLowerCase()===inst && (!r.end || r.end>=ymOf(now)));
  const yearly = +h.yearly>0 ? +h.yearly : rec ? +rec.amount*({monthly:12,quarterly:4,yearly:1}[rec.freq]||12) : 0;
  const ret=Object.entries(alloc).reduce((a,[k,p])=>a+(+p/100)*((N.ret&&N.ret[k])??NPS_RET[k]??8),0)/100;
  let corpus=null; const proj=[];
  if(retYm && retYm>ymOf(now)){ let b=x.value, ym=ymOf(now); const per=yearly/12;
    while(ym<retYm){ b=b*(1+ret/12)+per; if(ym.endsWith("-03")) proj.push([+ym.slice(0,4)-1, b]); ym=addM(ym,1); } corpus=b; }
  const fyNow=fyOf(now), fyIn=entries.filter(t=>fyOf(t.date)===fyNow).reduce((a,t)=>a+invNet(t),0);
  return {x, N, lines, entries, alloc, dob, at, retYm, yearly, ret, corpus, proj, lump:corpus!=null?corpus*.6:null, annuity:corpus!=null?corpus*.4:null, pension:corpus!=null?corpus*.4*.06/12:null, fyIn, unitsAsOf:h.unitsAsOf||N.stmtDate||""};
}
function vNps(){
  const h=npsHold(); if(!h){ S.view="accounts"; return vAccounts(); } S.npsId=h.id;
  const n=npsCalc(h), x=n.x, N=n.N, tab=S.npsTab||"overview";
  const head=`<div class="monthbar"><button class="btn sm" type="button" data-go="accounts" aria-label="Back to Accounts">‹</button><div class="m" style="text-align:left">NPS</div><span class="chip">Tier I</span></div>`;
  const acts=`<div class="btns epfacts"><button class="btn sm pri" type="button" data-na="add">Add contribution</button><button class="btn sm" type="button" data-na="units">Update from statement</button><button class="btn sm" type="button" data-na="edit">Assumptions</button></div>`;
  const hero=`<div class="hero epfh"><div class="lbl">NPS value</div><div class="big">${rs0(x.value)}</div>
    <div class="epfsub">${esc(N.pfm||"")}${N.choice?` · ${esc(N.choice)}`:""}${N.pran?` · PRAN ${esc(N.pran)}`:""}</div>
    <div class="hrow epfsplit">${n.lines.map(l=>`<div><div class="k">${esc(NPS_LBL[l.key]||l.key)}</div><div class="hv">${shortR(l.value)}</div></div>`).join("")}</div></div>`;
  const tile=(k,v,s="")=>`<div class="tile"><div class="k">${k}</div><div class="v">${v}</div>${s?`<div class="ts">${s}</div>`:""}</div>`;
  const tiles=`<div class="tiles t4 epft">${tile("Invested", shortR(x.inv), `${rs0(n.fyIn)} this year`)}${tile("Gain", (x.gain>=0?"+":"")+shortR(x.gain), `${x.pct.toFixed(1)}% on invested`)}${tile("Return (XIRR)", N.xirr?N.xirr+"%":"—", N.stmtDate?`per statement, ${fmtD(N.stmtDate)}`:"")}${tile(`At ${n.at}`, n.corpus?"≈ "+shortR(n.corpus):"—", n.retYm?mLabel(n.retYm):"add date of birth")}</div>`;
  const TABS=[["overview","Schemes"],["entries","Contributions"],["projection","Projection"]];
  const seg=`<div class="seg" role="group" aria-label="NPS sections" style="margin-top:16px">${TABS.map(([k,l])=>`<button type="button" data-nt="${k}" aria-pressed="${tab===k}">${l}</button>`).join("")}</div>`;
  let body="";
  if(tab==="overview"){
    const col={E:"var(--v1)",C:"var(--v2)",G:"var(--v3)",A:"var(--v4)"};
    body=`<div class="card"><b>How it's split</b>
      <div class="stack" aria-hidden="true">${n.lines.map(l=>`<i style="flex:${l.value};background:${col[l.key]||"var(--v5)"}"></i>`).join("")}</div>
      <div class="kv" style="margin-top:12px">${n.lines.map(l=>`<span><i class="dot" style="background:${col[l.key]||"var(--v5)"}"></i>${esc(NPS_LBL[l.key]||l.key)}</span><b>${l.pct.toFixed(1)}% <span class="mut">· target ${n.alloc[l.key]??"—"}%</span></b>`).join("")}</div>
      <p class="cnote">${N.choice?`${esc(N.choice)}: `:""}new money goes ${Object.entries(n.alloc).map(([k,p])=>`${p}% to ${k}`).join(", ")}. With life-cycle choice the equity share steps down as you get older.</p></div>
      <h2>Schemes</h2><div class="list">${n.lines.map(l=>`<div class="row"><div class="main"><div class="t">${esc(NPS_LBL[l.key]||l.nm)}</div><div class="s">${(+l.units).toLocaleString("en-IN",{maximumFractionDigits:4})} units × ₹${(+l.price).toFixed(4)} NAV${l.priceDate?` · ${fmtD(l.priceDate)}`:""}${l.priceSrc?` · ${esc(l.priceSrc)}`:""}</div></div><div class="amt">${rs0(l.value)}</div></div>`).join("")}
        ${x.atCost>0.5?`<div class="row"><div class="main"><div class="t">Contributions since the statement</div><div class="s">Counted at the amount paid until you update the units</div></div><div class="amt">${rs0(x.atCost)}</div></div>`:""}</div>
      <p class="note">${HOSTED?"NAVs update every day from NPS Trust once the price job is deployed.":"Update the units and NAVs from your next statement with Update from statement."} Units as of ${n.unitsAsOf?fmtD(n.unitsAsOf):"—"}.${N.charges?` Charges taken as units so far: ${rs0(N.charges)}.`:""}</p>`;
  }
  if(tab==="entries"){
    const g=new Map(); for(const t of n.entries){ const y=fyOf(t.date); if(!g.has(y)) g.set(y,[]); g.get(y).push(t); }
    body=n.entries.length?[...g.entries()].map(([y,ts])=>`<h2>FY ${fyLbl(y)}<span class="sp"></span><span class="chip mute">${rs0(ts.reduce((a,t)=>a+invNet(t),0))}</span></h2><div class="list">${ts.map(t=>`<div class="row tap" data-tx="${esc(t.id)}" role="button" tabindex="0"><div class="main"><div class="t">Contribution</div><div class="s">${fmtD(t.date)} · ${esc(accName(t.accountId))}</div></div><div class="amt">${rs0(invNet(t))}</div></div>`).join("")}</div>`).join("")
      +`<p class="note">Your NPS entries in Transactions. The statement says ${N.contrib?rs0(N.contrib):"—"} went in up to ${N.stmtDate?fmtD(N.stmtDate):"—"}; that is the invested figure used here.</p>`
      :`<div class="list"><div class="empty">No NPS entries yet.</div></div>`;
  }
  if(tab==="projection"){
    const nowFy=fyOf(today()), ys=[nowFy, ...n.proj.map(p=>p[0])], v=[x.value, ...n.proj.map(p=>p[1])];
    const ser=[{name:"Projected",color:"var(--v2)",values:v,dash:true}];
    body=n.corpus?`<div class="card epfcorp"><div class="k">Tentative NPS at ${n.at} · ${mLabel(n.retYm)}</div><div class="big">≈ ${shortR(n.corpus)}</div><div class="s">${rs0(n.yearly)} a year, ${(n.ret*100).toFixed(1)}% a year blended return</div></div>
      ${chartCard("Value by year","", lineChart({labels:ys.map(fyShort), ticks:ys.map(fyShort), full:ys.map(y=>`FY ${fyLbl(y)}`), series:ser, h:200, fmt:shortR, aria:"Projected NPS value to retirement"}),"")}
      <div class="card"><b>At ${n.at}</b><div class="kv"><span>Take as a lump sum (60%, tax-free)</span><b>≈ ${shortR(n.lump)}</b><span>Buy an annuity (at least 40%)</span><b>≈ ${shortR(n.annuity)}</b><span>Pension from the annuity (≈6% a year)</span><b>≈ ${rs0(n.pension)}/month</b></div>
        <p class="cnote">A tentative figure. Returns assumed: E ${NPS_RET.E}%, C ${NPS_RET.C}%, G ${NPS_RET.G}% a year, weighted by your ${Object.entries(n.alloc).map(([k,p])=>`${p}% ${k}`).join(" / ")} split; the life-cycle shift to bonds later isn't modelled. Annuity rates vary.</p></div>`
      :`<div class="list"><div class="empty">Add your date of birth under Assumptions to see the projection.</div></div>`;
  }
  return head+hero+tiles+acts+seg+`<div class="epfb">${body}</div>`;
}
/* update the three schemes from a statement: units, NAV, date, total contributed, XIRR */
function npsUnitsForm(h){
  const N=h.nps||{}, L=npsLines(h)||[];
  openSheet("Update from statement", `<p class="note" style="margin-top:0">From the "Scheme Wise Summary" of your NPS statement (Protean, KFintech or CAMS).</p>
    ${L.map((l,i)=>`<p class="sect">${esc(NPS_LBL[npsKey(l)]||l.nm)}</p><div class="grid2">${field([`u${i}`,"Units","number",{value:l.units??"",step:"any"}])}${field([`p${i}`,"NAV (₹)","number",{value:l.price??"",step:"any"}])}</div>`).join("")}
    <p class="sect">Statement</p><div class="grid2">${field(["sd","Statement date","date",{value:N.stmtDate||today()}])}${field(["ct","Total contribution (₹)","number",{value:N.contrib??"",step:"0.01"}])}</div>
    ${field(["xr","Return (XIRR, %)","number",{value:N.xirr??"",step:"0.01"}])}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#sv").onclick=()=>{ const sd=val("sd"); if(!sd){ toast("Pick the statement date."); return; }
      const lines=L.map((l,i)=>{ const u=parseFloat(val(`u${i}`)), p=parseFloat(val(`p${i}`)); const o={...l}; if(u>=0) o.units=u; if(p>0 && (p!==+l.price || sd>(l.priceDate||""))){ o.price=p; o.priceDate=sd; o.priceManual=true; delete o.priceSrc; } return o; });
      const ct=parseFloat(val("ct")), xr=parseFloat(val("xr"));
      const o={...h, npsLines:lines, unitsAsOf:sd, nps:{...N, stmtDate:sd, ...(ct>0?{contrib:ct}:{}), ...(xr?{xirr:xr}:{})}};
      if(ct>0){ o.openInvested=ct; o.inclTo=sd; }
      closeModal(); upsert("holdings", o); toast("NPS updated"); };
  });
}
function npsContribForm(h){
  const banks=live("accounts").filter(a=>a.type!=="card" && !a.hidden), inst=h.instrument||"NPS";
  const last=live("txns").filter(t=>t.type==="investment" && (t.instrument||"").trim().toLowerCase()===inst.toLowerCase()).sort((a,b)=>b.date.localeCompare(a.date))[0]||{};
  openSheet("Add NPS contribution", `<div class="grid2">${field(["amt","Amount (₹)","number",{value:last.amount||"",step:"1"}])}${field(["d","Date","date",{value:today()}])}</div>
    ${field(["acc","Paid from","select",{value:last.accountId||(mainAcc()&&mainAcc().id)||"",options:banks.map(a=>[a.id,a.name])}])}
    <p class="note">Saved as an NPS investment entry from this account, so it shows in Transactions and comes off that account. It counts at the amount paid until you update the units from your next statement.</p>
    <div class="btns"><button class="btn pri" id="sv" type="button">Add contribution</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#sv").onclick=()=>{ const a=parseFloat(val("amt")), d=val("d"); if(!(a>0)||!d){ toast("Enter the amount and date."); return; }
      closeModal(); upsert("txns",{id:uid(), type:"investment", amount:a, date:d, accountId:val("acc"), instrument:inst, invType:"NPS"}); toast("Contribution added"); };
  });
}
/* EPF in Transactions: shown alongside your entries, never counted in balances or spending */
function epfTxItems(){
  const out=[];
  for(const h of live("holdings")) if(h.type==="EPF" && h.epf){ const e=epfQuick(h); if(!e) continue;
    const add=(r,i)=>{ if(!r.d) return; const k=r.k; if(k==="tout"||(k==="tin"&&r.internal)) return;
      const title = k==="int" ? `EPF interest · FY ${fyLbl(r.fy)}` : k==="cont"||k==="exp" ? `EPF · ${mLabel(r.wm)} contribution` : k==="wd" ? "EPF withdrawal" : k==="ipr" ? "EPF back-period credit" : "EPF transfer in";
      const sub = `You ${rs0(r.emp)} · Employer ${rs0(r.er)}${r.eps?` · EPS ${rs0(r.eps)}`:""}${k==="exp"?" · expected":""}${r.manual?" · added by you":""} · not from a bank account`;
      out.push({id:`epf:${h.id}:${k}:${r.d}:${i}`, type:"epf", epfK:k, epfFy:r.fy??fyOf(r.d), epfMid:r.mid, date:r.d, amount:r.emp+r.er, note:`${title} ${sub}`, title, sub, out:k==="wd", updatedAt:0}); };
    e.rows.forEach(add); e.ints.forEach((r,i)=>add({...r,k:"int"},"i"+i)); e.expected.forEach((r,i)=>add({...r,fy:fyOf(r.d)},"x"+i)); }
  return out;
}
function retirementBlock(h, x){
  if(h.type==="EPF" && x && x.epf){ const e=epfCalc(h);
    return `<div class="card" style="margin-top:12px"><b>EPF</b><div class="kv">
      ${e.corpus?`<span>At ${e.age} (${mLabel(e.retYm)})</span><b>≈ ${short(e.corpus)}</b>`:""}
      <span>Interest building up this year</span><b>≈ ${money(e.accrued)}</b>
      <span>You can withdraw now (75%)</span><b>up to ${money(e.partial)}</b>
      ${e.pension?`<span>Pension from ${e.age}</span><b>≈ ${money(e.pension)}/month</b>`:""}</div>
      <p class="cnote">From your passbooks. Open <b>EPF</b> on the Investments tab for the passbook, projection and pension.</p></div>`; }
  if(h.type==="EPF"){ const e=epfInfo(h,x);
    return `<div class="card" style="margin-top:12px"><b>EPF</b><div class="kv">
      <span>Interest this year at ${(e.r*100).toFixed(2)}%</span><b>≈ ${money(e.int)}</b>
      ${e.mon?`<span>Going in each month</span><b>${money(e.mon)}</b><span>In 5 years</span><b>≈ ${short(e.p5)}</b><span>In 10 years</span><b>≈ ${short(e.p10)}</b>`:""}
      <span>You can withdraw now</span><b>${e.can===false?"Not yet":`up to ${money(e.wd)}`}</b></div>
      <p class="cnote">Under EPFO's rules from October 2025, after 12 months of service you can take out up to 75% of your balance (employee and employer share; 25% must stay) for illness, education, marriage, housing, or special circumstances. ${e.can===false?`You'll have 12 months of service in ${mShort(addM(h.joined,12))}.`:e.can==null?"Add when you joined to check the 12 months.":""} Interest for FY 2025-26 is 8.25%. Check the EPFO portal before you apply.</p></div>`; }
  if(h.type==="PPF"){ const p=ppfInfo(h,x); if(p.fy0==null) return `<p class="note">Add the date the PPF account was opened to see its maturity and what you can withdraw.</p>`;
    return `<div class="card" style="margin-top:12px"><b>PPF</b><div class="kv">
      <span>Year of the account</span><b>${p.idx} of 15</b><span>Matures</span><b>${fmtD(p.matures)}</b>
      <span>Value at maturity at ${(p.r*100).toFixed(1)}%${+h.yearly?` with ${money(+h.yearly)}/year`:""}</span><b>≈ ${short(p.mv)}</b>
      <span>Partial withdrawal</span><b>${p.wdOk?`up to ≈ ${money(p.w)}`:`from FY ${p.wdFrom}`}</b>
      ${p.loanOk?`<span>Loan against PPF</span><b>up to ≈ ${money(p.ln)}</b>`:""}</div>
      <p class="cnote">From the 7th financial year you can withdraw once a year, up to half of the balance at the end of the 4th year before, or of last year, whichever is lower. In years 3 to 6 you can take a loan of up to 25% of the balance two years before. ${p.haveDeps?"Past balances are worked back from your PPF deposits, so check your passbook.":"Past balances are estimated; record PPF deposits as investment entries to sharpen them."} Interest is 7.1% for Oct–Dec 2026.</p></div>`; }
  return "";
}
/* ---------- credit card: limit, charges, rewards ---------- */
const CHARGE_RX=/interest|finance charge|service charge|late|fee|gst|charges|penal/i;
const isCharge = t => { const c=byId("categories",t.categoryId); return CHARGE_RX.test(c?c.name:"") || CHARGE_RX.test((catParent(c)||{}).name||"") || /\b(interest|late fee|annual fee|finance charge)\b/i.test(t.note||""); };
function cardDetails(a, bal){
  const y=today().slice(0,4), tx=live("txns").filter(t=>t.type==="expense" && t.accountId===a.id && t.date.slice(0,4)===y);
  const charges=tx.filter(isCharge), spend=tx.filter(t=>!isCharge(t)&&!t.cemi).reduce((s,t)=>s+ +t.amount,0), ch=charges.reduce((s,t)=>s+ +t.amount,0);
  const owed=Math.max(0,-(bal||0)), lim=+a.limit||0, p=lim?owed/lim*100:0, rw=+a.reward||0;
  const st=p>=75?"bad":p>=30?"warn":"";
  return `<div class="card" style="margin-top:12px">
    ${lim?`<div class="gt" style="display:flex;justify-content:space-between"><b>Credit used</b><b>${p.toFixed(0)}%</b></div><div class="pbar ${st}"><i style="width:${Math.min(100,p).toFixed(1)}%"></i><span class="mk" style="left:30%"></span></div><div class="note" style="margin:6px 0 0">${money(owed)} of ${money(lim)} · ${money(Math.max(0,lim-owed))} available</div>`:`<div class="note" style="margin:0">Add the credit limit (Edit card) to see how much you're using.</div>`}
    <div class="kv"><span>Spent in ${y}</span><b>${money(spend)}</b>
      ${rw?`<span>Rewards earned (≈ ${rw}%)</span><b class="in">≈ ${money(spend*rw/100)}</b>`:""}
      <span>Interest, fees and GST in ${y}</span><b class="${ch>0.5?"neg":""}">${money(ch)}</b>
      ${+a.apr?`<span>Interest if a bill isn't paid in full</span><b>${rateTxt(a.apr)}% a month (${rateTxt(+a.apr*12)}% a year)</b>`:""}
      ${+a.fee?`<span>Annual fee</span><b>${money(+a.fee)}${+a.feeWaive?` · waived at ${short(+a.feeWaive)}`:""}</b>`:""}</div>
    ${+a.feeWaive?`<div class="pbar" style="margin-top:10px"><i style="width:${Math.min(100,spend/(+a.feeWaive)*100).toFixed(1)}%"></i></div><div class="note" style="margin:6px 0 0">${spend>=+a.feeWaive?"✓ Spend target for the fee waiver reached":`${money(+a.feeWaive-spend)} more this year to get the fee waived`}</div>`:""}
    ${charges.length?`<details class="ctab"><summary>${charges.length} charge${charges.length===1?"":"s"} this year</summary><div class="tw"><table><tbody>${charges.sort((p,q)=>q.date.localeCompare(p.date)).map(t=>`<tr><td>${fmtD(t.date)} · ${esc(t.note||catName(t.categoryId))}</td><td>${money(t.amount)}</td></tr>`).join("")}</tbody></table></div></details>`:""}
    ${a.rewardNote?`<p class="cnote">${esc(a.rewardNote)}</p>`:""}</div>`;
}
/* ---------- tax-saving tracker (old regime deductions; renumbered under the Income-tax Act 2025) ---------- */
function taxPanel(){
  const fy=S.taxFy||fyOf(today()), from=`${fy}-04-01`, to=`${fy+1}-03-31`, inFy=d=>d>=from && d<=to, nowYm=ymOf(today());
  const inv=live("txns").filter(t=>t.type==="investment" && inFy(t.date));
  const by=k=>inv.filter(t=>k(t)).reduce((s,t)=>s+invNet(t),0);
  const ppf=by(t=>invTypeOf(t)==="PPF"), elss=by(t=>/elss|tax ?saver/i.test(t.instrument||"")), nps=by(t=>invTypeOf(t)==="NPS");
  const plannedSip=k=>{ let v=0; for(let ym=nowYm>`${fy}-03`?nowYm:`${fy}-04`; ym<=`${fy+1}-03`; ym=addM(ym,1)) for(const it of planned(ym)) if(it.type==="investment" && !paidMap().has(it.key)){ const r=byId("recurring",it.id)||{}; if(k(r)) v+=+it.amount; } return v; };
  const ppfP=plannedSip(r=>r.invType==="PPF"), elssP=plannedSip(r=>/elss|tax ?saver/i.test(r.instrument||"")), npsP=plannedSip(r=>r.invType==="NPS");
  let epf=0; for(const h of live("holdings")) if(h.type==="EPF" && h.epf && h.epf.books){ const e=epfQuick(h); if(e) epf+=e.rows.concat(e.expected).filter(r=>(r.k==="cont"||r.k==="exp") && r.d && fyOf(r.d)===fy).reduce((a,r)=>a+r.emp,0); }
  else if(h.type==="EPF" && +h.epfEmp>0){ const end=nowYm<`${fy+1}-03`?nowYm:`${fy+1}-03`, n=Math.max(0,diffM(`${fy}-04`, end)+1); epf+=+h.epfEmp*Math.min(12,n); }
  const exp=live("txns").filter(t=>t.type==="expense" && inFy(t.date)), txt=t=>`${catName(t.categoryId)} ${t.note||""}`;
  const life=exp.filter(t=>/life insurance|\blic\b|term (plan|insurance)|term life/i.test(txt(t))).reduce((s,t)=>s+ +t.amount,0);
  const tuition=exp.filter(t=>/tuition|school fee/i.test(txt(t))).reduce((s,t)=>s+ +t.amount,0);
  const health=exp.filter(t=>/health insurance|mediclaim|medical insurance|star health|niva bupa|care health/i.test(txt(t))).reduce((s,t)=>s+ +t.amount,0);
  let hlP=0, hlI=0; const hl=live("loans").filter(l=>l.taxHome);
  for(const l of hl){ const s=schedule(l); if(!s) continue; for(const r of s.rows) if(r.ym>=`${fy}-04` && r.ym<=`${fy+1}-03`){ hlP+=r.prin; hlI+=r.int; } }
  const npsB=Math.min(50000, nps+npsP), npsTo80c=Math.max(0, nps+npsP-50000);
  const c80=[["EPF (your share)",epf],["PPF",ppf+ppfP],["ELSS funds",elss+elssP],["Home loan principal",hlP],["Life insurance",life],["Tuition fees",tuition],["NPS beyond ₹50,000",npsTo80c]].filter(([,v])=>v>0.5);
  const sec=(name, old, lim, parts, note)=>{ const v=parts.reduce((s,[,x])=>s+x,0), p=Math.min(100,v/lim*100);
    return `<div class="card taxs" style="margin-top:12px"><div class="tl"><b>${name} <span class="note" style="margin:0;font-weight:600">(was ${old})</span></b><b>${money(Math.min(v,lim))}</b></div>
      <div class="pbar ${v>=lim?"":""}"><i style="width:${p.toFixed(1)}%"></i></div><div class="ts">${v>=lim?`✓ Full ${money(lim)} used`:`${money(lim-v)} more can be claimed`} · limit ${money(lim)}</div>
      ${parts.length?`<div class="tparts">${parts.map(([n,x])=>`<div><span>${esc(n)}</span><b>${money(x)}</b></div>`).join("")}</div>`:""}${note?`<p class="cnote">${note}</p>`:""}</div>`; };
  const fyNav=`<div class="monthbar"><button class="btn sm" type="button" data-taxfy="-1" aria-label="Previous year">‹</button><div class="m">FY ${fyLbl(fy)}<div class="note" style="margin:0;font-weight:400;font-size:12px">1 Apr ${fy} – 31 Mar ${fy+1}</div></div><button class="btn sm" type="button" data-taxfy="1" aria-label="Next year">›</button></div>`;
  return `${fyNav}
  <div class="banner" style="margin-top:12px"><b>Old tax regime only.</b> The new regime (the default) doesn't allow these, except your employer's NPS contribution. From 1 April 2026 the Income-tax Act 2025 renumbers them; the limits are the same. Amounts are found from your entries${fy>=fyOf(today())?" plus SIPs still planned this year":""}, so check them before you file.</div>
  ${sec("Section 123","80C",150000,c80, c80.length?"":"Nothing found yet. PPF, ELSS (fund name with ELSS or Tax Saver), EPF (add your monthly share on the EPF holding), life insurance premiums, tuition fees and home loan principal count here.")}
  ${sec("Section 124","80CCD(1B)",50000,nps+npsP>0.5?[["NPS (your own contributions)",npsB]]:[], "Extra ₹50,000 for your own NPS contributions, over the Section 123 limit.")}
  ${sec("Section 126","80D",25000,health>0.5?[["Health insurance",health]]:[], "₹25,000 for yourself, spouse and children (₹50,000 if a senior citizen), plus up to ₹25,000 more for parents. Entries with health insurance or mediclaim in the category or note are counted.")}
  ${sec("Home loan interest","Sec 24(b)",200000,hlI>0.5?[["Interest",hlI]]:[], hl.length?`From ${esc(hl.map(l=>l.name).join(", "))}.`:"")}
  <div class="sh"><h3>Which loans are home loans?</h3></div>
  <div class="list">${live("loans").filter(l=>isEmiLike(kindOf(l))||kindOf(l)==="hybrid").map(l=>`<label class="row" style="cursor:pointer"><div class="main"><div class="t">${esc(l.name)}</div><div class="s">${esc(l.lender||KIND_LBL[kindOf(l)])}</div></div><input type="checkbox" data-taxhome="${esc(l.id)}" ${l.taxHome?"checked":""} aria-label="${esc(l.name)} is a home loan"></label>`).join("")||'<div class="empty">No bank loans.</div>'}</div>
  <p class="note">Tick a loan to count its principal under Section 123 and its interest under home loan interest, for a self-occupied home.</p>`;
}

/* ---------- year in review: a standalone page to keep or print as PDF ---------- */
function yearReview(y){
  S.cwFixed=640; try{ return yearReviewBuild(y); } finally{ S.cwFixed=0; }
}
function yearReviewBuild(y){
  const M=Array.from({length:12},(_,i)=>`${y}-${pad(i+1)}`), now=ymOf(today()), F=M.map(mfig), upto=M.filter(m=>m<=now);
  const inc=F.map(incOf), exp=F.map(f=>f.expense), inv=F.map(f=>f.investment), T=k=>k.reduce((a,b)=>a+b,0);
  const ti=T(inc), te=T(exp), tv=T(inv), rate=ti>0?(ti-te)/ti*100:0;
  const cats=new Map(); F.forEach(f=>f.byCat.forEach((v,k)=>cats.set(k,(cats.get(k)||0)+v)));
  const top=topN([...cats.entries()],6), items=top.map(([k,v],i)=>({name:catLbl(k), value:v, color:k==="__other"?"var(--vO)":VC[i]}));
  const big=live("txns").filter(t=>t.type==="expense" && !offBook(t) && t.date.slice(0,4)===String(y)).sort((a,b)=>b.amount-a.amount).slice(0,8);
  const nh=nwHistory(), n0=nh.find(p=>p.ym>=`${y}-01`) , n1=[...nh].reverse().find(p=>p.ym<=`${y}-12`);
  const home=live("txns").filter(t=>t.type==="expense" && t.date.slice(0,4)===String(y) && (t.tags||[]).some(isHomeTag)).reduce((a,t)=>a+ +t.amount,0);
  const ser=[{name:"Income",color:"var(--v1)",values:inc},{name:"Spent",color:"var(--v3)",values:exp},{name:"Invested",color:"var(--v2)",values:inv}];
  const busiest=F.map((f,i)=>[i,f.expense]).sort((a,b)=>b[1]-a[1])[0];
  const css=`:root{--v1:#14946c;--v2:#2a78d6;--v3:#eb6834;--v4:#6250d6;--v5:#eda100;--v6:#e87ba4;--vO:#a8a499;--ink:#1c1f1b;--muted:#6a6d65;--line:#ece8df;--line2:#e2ddd2;--surface:#fff;--sunk:#f1eee7;--display:Georgia,"Times New Roman",serif;--body:system-ui,-apple-system,"Segoe UI",sans-serif}
    *{box-sizing:border-box} body{margin:0;background:#f6f4ef;color:var(--ink);font:14px/1.5 var(--body)} main{max-width:860px;margin:0 auto;padding:32px 20px 48px}
    h1{font:500 34px var(--display);margin:0} h2{font:500 20px var(--display);margin:32px 0 10px} .sub{color:var(--muted)}
    .k4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:20px} .k4 div{background:#fff;border-radius:14px;padding:14px} .k4 span{font-size:12px;color:var(--muted);font-weight:600} .k4 b{display:block;font-size:19px;margin-top:4px}
    .box{background:#fff;border-radius:14px;padding:16px} svg{width:100%;height:auto;display:block} svg text{font-size:11px;fill:var(--muted);font-family:var(--body)} .gl{stroke:var(--line)} .z{stroke:var(--line2)} .hit{fill:transparent}
    .legend{display:flex;gap:14px;font-size:12px;color:var(--muted);margin-top:8px} .legend i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px}
    table{width:100%;border-collapse:collapse;font-size:13px} td,th{padding:7px 6px;border-top:1px solid var(--line);text-align:right} td:first-child,th:first-child{text-align:left} th{color:var(--muted);font-weight:600}
    .two{display:grid;grid-template-columns:220px 1fr;gap:20px;align-items:center} .pbtn{position:fixed;right:20px;top:20px;border:0;border-radius:12px;padding:10px 14px;background:#0e5e4c;color:#fff;font:700 13px var(--body);cursor:pointer}
    .dlist .di{display:grid;grid-template-columns:10px 1fr auto auto;gap:10px;padding:7px 0;border-top:1px solid var(--line);font-size:13px}.dlist .di:first-child{border:0}.dlist i{width:10px;height:10px;border-radius:3px;margin-top:4px}
    @media (max-width:640px){.k4{grid-template-columns:1fr 1fr}.two{grid-template-columns:1fr}}
    @media print{body{background:#fff}.pbtn{display:none}.box,.k4 div{border:1px solid var(--line)} h2{break-after:avoid}.box{break-inside:avoid}}`;
  const tbl=`<table><thead><tr><th>Month</th><th>Income</th><th>Spent</th><th>Invested</th><th>Left over</th></tr></thead><tbody>${M.map((m,i)=>`<tr><td>${mLabel(m)}${m===now?" (so far + due)":m>now?" (plan)":""}</td><td>${money(inc[i])}</td><td>${money(exp[i])}</td><td>${money(inv[i])}</td><td>${money(inc[i]-exp[i]-inv[i])}</td></tr>`).join("")}<tr><th>Total</th><th>${money(ti)}</th><th>${money(te)}</th><th>${money(tv)}</th><th>${money(ti-te-tv)}</th></tr></tbody></table>`;
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${y} in review · KP Money Planner</title><style>${css}</style></head><body>
  <button class="pbtn" onclick="window.print()">Print / Save as PDF</button><main>
  <h1>${y} in review</h1><div class="sub">KP Money Planner · made ${fmtD(today())} ${today().slice(0,4)}${upto.length<12?` · ${MN[upto.length-1]||"Jan"} ${y} includes what's still due; later months are the plan`:""}</div>
  <div class="k4"><div><span>Income</span><b>${money(ti)}</b></div><div><span>Spent</span><b>${money(te)}</b></div><div><span>Invested</span><b>${money(tv)}</b></div><div><span>Savings rate</span><b>${rate.toFixed(0)}%</b></div></div>
  <h2>Month by month</h2><div class="box">${barChart({labels:MN, series:ser, h:230})}<div class="legend">${ser.map(s=>`<span><i style="background:${s.color}"></i>${s.name}</span>`).join("")}</div></div>
  <h2>Where the money went</h2><div class="box two">${donutChart({items, center:[short(te).replace("₹",""),"spent"]})}<div class="dlist">${items.map(x=>`<div class="di"><i style="background:${x.color}"></i><span>${esc(x.name)}</span><span class="sub">${(x.value/(te||1)*100).toFixed(0)}%</span><b>${money(x.value)}</b></div>`).join("")}</div></div>
  <h2>Highlights</h2><div class="box"><table><tbody>
    ${busiest&&busiest[1]>0?`<tr><td>Biggest month for spending</td><td>${MN[busiest[0]]} · ${money(busiest[1])}</td></tr>`:""}
    ${n0&&n1?`<tr><td>Net worth</td><td>${money(n0.total)} → ${money(n1.total)}${n0.est?" (start estimated)":""}</td></tr>`:""}
    ${home>0.5?`<tr><td>${esc(homeTag())} spending (you and ${esc(othersName())})</td><td>${money(home)}</td></tr>`:""}
    <tr><td>Average spend per month</td><td>${money(te/12)}</td></tr></tbody></table></div>
  ${big.length?`<h2>Largest spends</h2><div class="box"><table><tbody>${big.map(t=>`<tr><td>${fmtD(t.date)} · ${esc(t.note||catName(t.categoryId))}</td><td>${money(t.amount)}</td></tr>`).join("")}</tbody></table></div>`:""}
  <h2>All months</h2><div class="box">${tbl}</div>
  <p class="sub" style="margin-top:24px">Card spends count in the month their bill is due. "Last month balance" carry-overs aren't counted as income. Investing counts as saving in the savings rate.</p>
  </main></body></html>`;
  saveFile(`KP ${y} in review.html`, html, "text/html");
}
/* ---------- reminders: Google Calendar for phone reminders; in the installed app, a notification when you open it ---------- */
const nextDate = (day, step=1) => { const td=today(); let ym=ymOf(td); const [y,m]=ym.split("-").map(Number); let d=dayIn(y,m,day); if(d<td){ ym=addM(ym,1); const [y2,m2]=ym.split("-").map(Number); d=dayIn(y2,m2,day); } return d; };
function reminderItems(){
  const now=ymOf(today()), out=[];
  for(const r of live("recurring")) if((!r.end || r.end>=now) && r.day && r.freq!=="once"){ const st=FREQ[r.freq]||1; out.push({t:`${r.name}${r.type==="income"?"":" due"}`, d:nextDate(+r.day), rr:`FREQ=MONTHLY;INTERVAL=${st};BYMONTHDAY=${+r.day}${r.end?`;UNTIL=${lastDay(r.end).replace(/-/g,"")}`:""}`, s:`${money(r.amount)} · ${FREQ_LBL[r.freq]}`}); }
  for(const a of live("accounts")) if(a.type==="card" && countsAcc(a) && +a.dueDay) out.push({t:`${a.name} bill due`, d:nextDate(+a.dueDay), rr:`FREQ=MONTHLY;BYMONTHDAY=${+a.dueDay}`, s:"Credit card · every month"});
  for(const l of live("loans")){ const b=bankOf(l), s=schedule(l); if(!b || !s || !+b.day || kindOf(l)==="cardemi" || l.closedOn || !s.end || s.end<now) continue; out.push({t:`${l.name} EMI`, d:nextDate(+b.day), rr:`FREQ=MONTHLY;BYMONTHDAY=${+b.day};UNTIL=${lastDay(s.end).replace(/-/g,"")}`, s:`${money(loanSum(l).emiNow)} · until ${mShort(s.end)}`}); }
  return out.sort((a,b)=>a.d.localeCompare(b.d));
}
function remindersCard(){
  const R=reminderItems(), nOn=prefGet("notify",false);
  return `<h2>Reminders</h2>
  <div class="card"><p style="margin:0 0 8px">For reminders on your phone, add your bills to Google Calendar once; each one repeats on its due day.</p>
  ${R.length?`<details class="fm" style="box-shadow:none;background:var(--sunk)"><summary><span class="mn">${R.length} bills, EMIs and SIPs with a due day</span><span class="sub" style="text-align:right">tap to show</span></summary><div class="list" style="box-shadow:none;border-radius:0">${R.map(x=>`<div class="row"><div class="main"><div class="t">${esc(x.t)}</div><div class="s">${esc(x.s)} · next ${fmtD(x.d)}</div></div>${gcalLink(x.t, x.d, `${x.s}. From KP Money Planner.`, x.rr, "Add")}</div>`).join("")}</div></details>`:'<p class="note">Add a due day to your regular items, cards and loans to set reminders.</p>'}
  ${HOSTED?`<div class="btns" style="margin-top:12px">${R.length?'<button class="btn" type="button" id="icsAll">Download all as a calendar file</button>':""}<button class="btn" type="button" id="notifOn">${nOn?"Turn off notifications":"Notify me on this device"}</button></div>
  <p class="note">Notifications show when you open the app and something is overdue or due within 3 days. Reminders while the app is closed need Google Calendar (or a paid Firebase plan).</p>`:""}</div>`;
}
function icsAll(){
  const R=reminderItems(), st=new Date().toISOString().replace(/[-:]/g,"").slice(0,15)+"Z";
  const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//KP Money Planner//EN", ...R.flatMap((x,i)=>["BEGIN:VEVENT",`UID:kpmp-${i}-${x.d}@kp`,`DTSTAMP:${st}`,`DTSTART;VALUE=DATE:${x.d.replace(/-/g,"")}`,`SUMMARY:${x.t.replace(/[,;]/g," ")}`,`DESCRIPTION:${x.s.replace(/[,;]/g," ")}`,`RRULE:${x.rr}`,"BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:Reminder","TRIGGER:-P1D","END:VALARM","END:VEVENT"]),"END:VCALENDAR"].join("\r\n");
  saveFile("KP bills.ics", ics, "text/calendar");
}
async function notifyToggle(){
  if(prefGet("notify",false)){ prefSet("notify",false); toast("Notifications off on this device"); return render(); }
  if(!("Notification" in window)){ toast("This browser can't show notifications."); return; }
  const p=await Notification.requestPermission(); if(p!=="granted"){ toast("Notifications weren't allowed."); return; }
  prefSet("notify",true); prefSet("notifDay",""); render(); maybeNotify(true);
}
async function maybeNotify(force){
  if(!HOSTED || !prefGet("notify",false) || !("Notification" in window) || Notification.permission!=="granted") return;
  if(!force && prefGet("notifDay","")===today()) return; prefSet("notifDay", today());
  const n=needsYou().filter(x=>x.w<=1); if(!n.length){ if(force) toast("Nothing due in the next few days."); return; }
  const body=n.slice(0,4).map(x=>`${x.t} · ${money(x.a)}`).join("\n")+(n.length>4?`\n+${n.length-4} more`:"");
  try{ const reg=navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if(reg && reg.showNotification) await reg.showNotification(`${n.length} thing${n.length===1?"":"s"} need you`, {body, icon:"icons/icon-192.png", tag:"kpmp-due"}); else new Notification(`${n.length} thing${n.length===1?"":"s"} need you`, {body}); }catch(e){}
}

/* ---------- clicks, changes and selection for the parts above ---------- */
function activateX(e){
  const el=e.target.closest("[data-trn],[data-trp],[data-trd],[data-ymc],[data-day],[data-nwn],[data-hgo],[data-repadd],[data-repign],[data-view],[data-bulk],[data-bcm],[data-bcd],[data-goal],[data-ptgo],[data-taxfy],[data-spm],#addGoal,#txSel,#txClean,#yrReview,#icsAll,#notifOn,#spGo,#spClr");
  if(!el || el.closest("#modal")) return;
  const d=el.dataset, now=ymOf(today());
  if(d.trn){ S.trN=+d.trn; return render(); }
  if(d.trp){ S.trP=d.trp; S.trD=""; return render(); }
  if(d.trd!==undefined){ S.trD=d.trd; return render(); }
  if(d.ymc){ const [ym,c]=d.ymc.split("|"); S.month=ym; S.f={type:"expense", cat:byId("categories",c)?c:"", acc:"", tag:"", period:"month", from:"", to:"", q:""}; S.txLimit=0; return go("activity"); }
  if(d.day){ S.f={type:"expense", cat:"", acc:"", tag:"", period:"custom", from:d.day, to:d.day, q:""}; S.txLimit=0; return go("activity"); }
  if(d.nwn){ S.nwN=d.nwn==="all"?"all":+d.nwn; return render(); }
  if(d.hgo){ const o=new Set(prefGet("holdOpen",[])); o.add(d.hgo); prefSet("holdOpen",[...o]); S.accTab="invest"; prefSet("accTab","invest"); render(); const g=document.querySelector(`[data-hg="${CSS.escape(d.hgo)}"]`); if(g) g.scrollIntoView({block:"center", behavior:"smooth"}); return; }
  if(d.repadd){ const r=findRepeats().find(x=>x.key===d.repadd); if(r) return recForm({type:"expense", name:r.name, amount:Math.round(r.amount*100)/100, freq:r.freq, day:r.day, categoryId:r.categoryId, accountId:r.accountId, start:addM(ymOf(r.last),FREQ[r.freq]||1)}); return; }
  if(d.repign){ const a=prefGet("repIgnore",[]); a.push(d.repign); prefSet("repIgnore",a.slice(-300)); MEMO=new Map(); toast("Won't suggest that one again"); return render(); }
  if(d.view){ const v=byId("views",d.view); if(v){ S.f={type:"all", cat:"", acc:"", tag:"", period:"month", from:"", to:"", q:"", ...v.f}; S.txLimit=0; return render(); } return; }
  if(d.bulk) return bulkAct(d.bulk);
  if(d.bcm){ S.bcM=addM(S.bcM||now, +d.bcm); S.bcD=""; return render(); }
  if(d.bcd!==undefined){ S.bcD = S.bcD===d.bcd ? "" : d.bcd; return render(); }
  if(d.goal) return goalForm({...byId("goals",d.goal)});
  if(d.ptgo){ S.planTab=d.ptgo; return S.view==="plan" ? render() : go("plan"); }
  if(d.taxfy){ S.taxFy=(S.taxFy||fyOf(today()))+ +d.taxfy; return render(); }
  if(d.spm){ S.lsim={...(S.lsim||{}), ...simRead(), mode:d.spm, id:S.loanId}; return render(); }
  switch(el.id){
    case "addGoal": return goalForm();
    case "txSel": S.selOn=true; SEL().clear(); return render();
    case "txClean": return cleanupSheet();
    case "yrReview": return yearReview(S.year||+today().slice(0,4));
    case "icsAll": return icsAll();
    case "notifOn": return notifyToggle();
    case "spGo": { const v=simRead(); if(!(v.amt>0) && !(v.extra>0)){ toast("Enter a part payment or an extra monthly amount."); return; } S.lsim={...v, mode:(S.lsim&&S.lsim.id===S.loanId&&S.lsim.mode)||"tenure", id:S.loanId}; return render(); }
    case "spClr": S.lsim=null; return render();
  }
}
const simRead = () => ({amt:parseFloat(val("spAmt"))||0, ym:val("spYm")||addM(ymOf(today()),1), extra:parseFloat(val("spEx"))||0});
document.addEventListener("click", activateX);
/* phone number keypads often have no minus key: this button flips the sign of the amount typed */
document.addEventListener("click", e=>{ const b=e.target.closest("[data-neg]"); if(!b) return; const i=document.getElementById(b.dataset.neg); if(!i) return;
  const v=parseFloat(i.value.replace(/,/g,"")); if(isNaN(v) || v===0){ toast("Type the amount first, then tap − / +."); i.focus(); return; }
  i.value=String(Math.round(-v*100)/100); i.dispatchEvent(new Event("input",{bubbles:true})); });
{ let rw=innerWidth, rt; addEventListener("resize", ()=>{ clearTimeout(rt); rt=setTimeout(()=>{ if(Math.abs(innerWidth-rw)>40 && document.querySelector("#view svg[data-ch]")){ rw=innerWidth; render(); } }, 250); }); }
document.addEventListener("keydown", e=>{ if((e.key==="Enter"||e.key===" ") && e.target.matches('[role="button"]')) activateX(e); });
/* selection mode on Transactions: a tap picks the row instead of opening it */
document.addEventListener("click", e=>{
  if(!S.selOn || S.view!=="activity") return;
  const r=e.target.closest("#view [data-tx]"); if(!r) return;
  e.stopPropagation(); e.preventDefault(); const id=r.dataset.tx, t=byId("txns",id); if(!t || t.type==="carry") return;
  SEL().has(id)?SEL().delete(id):SEL().add(id); render();
}, true);
document.addEventListener("change", e=>{
  const t=e.target;
  if(t.id==="trCat"){ S.trC=t.value; return render(); }
  if(t.id==="fcMin"){ prefSet("fcMin", Math.max(0,parseFloat(t.value)||0)); return render(); }
  if(t.dataset && t.dataset.taxhome){ const l=byId("loans",t.dataset.taxhome); if(l){ const o={...l}; if(t.checked) o.taxHome=true; else delete o.taxHome; upsert("loans",o); } }
});

/* ---------- payoff plan: extra money goes to one loan at a time; a cleared loan's EMI rolls into the next ---------- */
function payoffLoans(){
  const out=[];
  for(const l of live("loans")){ const x=loanSum(l); if(isClosed(l,x) || x.out<=0.5) continue; const k=x.k;
    if(isEmiLike(k) || k==="hybrid"){ if(x.bank>0.5) out.push({id:l.id+":b", loan:l, name:k==="hybrid"?`${l.name} (bank part)`:l.name, bal:x.bank, rate:x.rateNow||0, min:x.emiNow||0}); }
    if(!isEmiLike(k)){ const own=x.own.out+(x.missed||0); if(own>0.5){ const mp=(l.plans||[]).filter(p=>p.freq==="monthly" && (!p.end || p.end>=ymOf(today()))).reduce((a,p)=>a+ +p.amount,0);
      out.push({id:l.id+":o", loan:l, name:k==="hybrid"?`${l.name} (own money${x.missed>0.5?" + missed EMIs":""})`:l.name, bal:own, rate:0, min:mp}); } }
  }
  return out;
}
function runPayoff(L, extra, lump, order){
  const now=ymOf(today()), A=L.map(x=>({...x, b:x.bal, int:0, end:null})), tl=[];
  const pri = order==="snow" ? [...A].sort((p,q)=>p.b-q.b||q.rate-p.rate) : [...A].sort((p,q)=>q.rate-p.rate||p.b-q.b);
  let freed=0, oneOff=lump||0;
  for(let i=0;i<480;i++){
    const ym=addM(now,i+1); let pool=(order==="none"?0:extra+freed)+oneOff; oneOff=0;
    for(const a of A){ if(a.b<=0.5) continue; const it=a.b*a.rate/1200; a.int+=it; a.b+=it; const p=Math.min(a.min,a.b); a.b-=p; }
    for(const a of pri){ if(pool<=0.5) break; if(a.b<=0.5) continue; const p=Math.min(pool,a.b); a.b-=p; pool-=p; }
    for(const a of A) if(a.b<=0.5 && !a.end){ a.end=ym; a.b=0; if(order!=="none") freed+=a.min; }
    tl.push({ym, tot:A.reduce((s,a)=>s+a.b,0)});
    if(A.every(a=>a.b<=0.5)) break;
  }
  return {A, tl, end:A.every(a=>a.end)?A.reduce((m,a)=>a.end>m?a.end:m,""):null, int:A.reduce((s,a)=>s+a.int,0)};
}
function payoffPanel(){
  const L=payoffLoans(); if(!L.length) return "";
  const extra=+prefGet("poExtra",0)||0, lump=+prefGet("poLump",0)||0, order=prefGet("poOrder","aval");
  const base=runPayoff(L,0,0,"none"), plan=runPayoff(L,extra,lump,order);
  const endTxt=a=>a.end?mShort(a.end):"not planned";
  const bankBase=base.A.filter(a=>a.rate>0), bankPlan=plan.A.filter(a=>a.rate>0);
  const lastBank=r=>r.filter(a=>a.rate>0).reduce((m,a)=>!a.end||!m?null:a.end>m?a.end:m, r.find(a=>a.rate>0)?.end||null);
  const seq=[...plan.A].sort((p,q)=>(p.end||"9999").localeCompare(q.end||"9999"));
  const span=Math.min(plan.tl.length, 360), labels=plan.tl.slice(0,span).map(t=>t.ym);
  const ser=[{name:"Your plan",color:"var(--v1)",values:plan.tl.slice(0,span).map(t=>t.tot),width:2.5},{name:"EMIs only",color:"var(--vLast)",values:labels.map((_,i)=>base.tl[i]?base.tl[i].tot:null),dash:true}];
  const zeroLoans=L.filter(a=>a.rate===0 && !(a.min>0));
  return `<div class="sh"><h3>Payoff plan</h3><span class="note" style="margin:0">${plan.end?`debt-free ${mLabel(plan.end)}`:""}</span></div>
  <div class="card">
    <div class="grid2">${field(["poExtra","Extra each month (₹)","number",{value:extra||"",step:"1000",ph:"e.g. 20000"}])}${field(["poLump","One-time amount now (₹)","number",{value:lump||"",step:"10000",ph:"e.g. 100000"}])}</div>
    <div class="seg" role="group" aria-label="Which loan first">${[["aval","Highest interest first"],["snow","Smallest first"]].map(([k,t])=>`<button type="button" data-po="${k}" aria-pressed="${order===k}">${t}</button>`).join("")}</div>
    <p class="cnote">${order==="aval"?"Saves the most interest: extra goes to the dearest loan; interest-free loans come last.":"Clears loans one by one fastest, which some find motivating; usually costs more interest."} When a loan is cleared, its EMI moves to the next one.</p>
    <div class="simout"><div><div class="k">Interest saved</div><div class="v in">${money(Math.max(0,base.int-plan.int))}</div></div><div><div class="k">Bank loans cleared</div><div class="v">${lastBank(plan.A)?mShort(lastBank(plan.A)):"—"}</div></div>
      <div><div class="k">Interest still to pay</div><div class="v">${money(plan.int)}</div></div><div><div class="k">With EMIs only</div><div class="v">${lastBank(base.A)?mShort(lastBank(base.A)):"—"}</div></div></div>
  </div>
  <div class="list" style="margin-top:12px">${seq.map((a,i)=>{ const b=base.A.find(z=>z.id===a.id); return `<div class="row tap" data-loan="${esc(a.loan.id)}" role="button" tabindex="0"><div class="main"><div class="t">${i+1}. ${esc(a.name)}</div><div class="s">${money(a.bal)} · ${a.rate?rateTxt(a.rate)+"%":"interest-free"}${a.min?` · ${money(a.min)}/month now`:""}</div></div><div class="ccamt"><div class="amt">${endTxt(a)}</div><div class="cclbl">${b&&b.end!==a.end?`was ${endTxt(b)}`:"same"}</div></div></div>`; }).join("")}</div>
  ${span>1?`<div style="height:12px"></div>`+chartCard("Total owed", "", lineChart({labels:labels.map(mShort), ticks:mTicks(labels), full:labels.map(mLabel), series:ser, area:0, h:190, aria:"Total owed by month, with your plan and with EMIs only"}), legendHtml(ser)):""}
  <p class="note">Uses today's rates and the EMIs in your loans${zeroLoans.length?`; ${esc(zeroLoans.map(a=>a.name).join(", "))} ${zeroLoans.length===1?"has":"have"} no monthly repayment planned, so ${zeroLoans.length===1?"it":"they"} only shrink${zeroLoans.length===1?"s":""} from your extra`:""}. Doesn't change your forecast: to commit, add the extra as a regular item or record part payments on the loan.</p>`;
}

/* ---------- Ask Claude about your money (Claude version: live answers; hosted app: copy a summary to paste into Claude) ---------- */
let aiSample, aiBusy=null;
(async()=>{ try{ aiSample = (window.claude && typeof window.claude.use==="function") ? await window.claude.use("sample") : null; }catch(e){ aiSample=null; } if(S.view==="insights" && S.insTab==="trends") render(); })();
/* hosted app: the same call goes to your own Cloud Function (askClaude), which holds the API key */
const hostedAI = () => { try{ return HOSTED && !!H.cfg.ai; }catch(e){ return false; } };
async function hostedAsk(turns, {signal}={}){
  if(!H.appI || !H.user) throw {code:"not_signed_in", message:"Sign in first."};
  const fx=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js");
  const fn=fx.httpsCallable(fx.getFunctions(H.appI, H.cfg.aiRegion||"asia-south1"), "askClaude", {timeout:300000});
  const stop=new Promise((_,rej)=>{ if(signal) signal.addEventListener("abort",()=>rej({code:"cancelled"}),{once:true}); });
  try{ const r=await Promise.race([fn({messages:turns.map(m=>({role:m.role, content:m.content}))}), stop]); return {text:(r.data&&r.data.text)||"", truncated:!!(r.data&&r.data.truncated)}; }
  catch(e){ if(e && e.code==="cancelled") throw e; throw {code:String((e&&e.code)||"error").replace(/^functions\//,""), message:(e&&e.message)||"Couldn't get an answer."}; }
}
const aiFn = () => aiSample || (hostedAI() ? hostedAsk : null);
function moneySummary(){
  const now=ymOf(today()), M=lastMonths(7), F=M.map(mfig), r0=n=>Math.round(n);
  const L=[`Today: ${today()}. Amounts in Indian rupees. ${mLabel(now)} is part-way: actual so far plus what's still due.`, "", "MONTHS (income excl. carry-over | spent | invested):"];
  M.forEach((m,i)=>L.push(`${mLabel(m)}: ${r0(incOf(F[i]))} | ${r0(F[i].expense)} | ${r0(F[i].investment)}`));
  const tot=new Map(); F.slice(0,6).forEach(f=>f.byCat.forEach((v,k)=>tot.set(k,(tot.get(k)||0)+v)));
  L.push("", "CATEGORIES by month (oldest→newest, last = this month) and 6-month average:");
  for(const [k] of [...tot.entries()].sort((a,b)=>b[1]-a[1]).slice(0,14)){ const v=F.map(f=>r0(f.byCat.get(k)||0)); L.push(`${catLbl(k)}: ${v.join(", ")} (avg ${r0(v.slice(0,6).reduce((a,b)=>a+b,0)/6)})${(byId("categories",k)||{}).limit?` limit ${(byId("categories",k)).limit}`:""}`); }
  const since=addM(now,-2)+"-01", notes=new Map();
  for(const t of live("txns")) if(t.type==="expense" && !offBook(t) && t.date>=since){ const n=(t.note||catName(t.categoryId)).trim().slice(0,40); const x=notes.get(n)||{v:0,c:0}; x.v+=+t.amount; x.c++; notes.set(n,x); }
  L.push("", "TOP SPENDS BY NOTE, last 3 months (total, count):"); for(const [n,x] of [...notes.entries()].sort((a,b)=>b[1].v-a[1].v).slice(0,18)) L.push(`${n}: ${r0(x.v)} (${x.c}x)`);
  L.push("", "REGULAR ITEMS (monthly unless said):"); for(const r of live("recurring").filter(r=>!r.end||r.end>=now)) L.push(`${r.name}: ${r0(r.amount)} ${r.type}${r.budget?" budget":""} ${r.freq!=="monthly"?r.freq:""}`.trim());
  L.push("", "LOANS:"); for(const l of live("loans")){ const x=loanSum(l); if(x.out>0.5) L.push(`${l.name}: owes ${r0(x.out)}, ${x.rateNow?x.rateNow+"%":"interest-free"}${x.emiNow?`, EMI ${r0(x.emiNow)}`:""}${x.end?`, ends ${x.end}`:""}`); }
  const R=findRepeats(); if(R.length){ L.push("", "REPEAT PAYMENTS NOT IN PLAN:"); R.slice(0,8).forEach(r=>L.push(`${r.name}: about ${r0(r.amount)} ${r.freq}`)); }
  const nw=netWorth(); L.push("", `NET WORTH at month-end: ${r0(nw.total)} (banks ${r0(nw.banks)}, investments ${r0(nw.inv)}${nw.prop>0.5?`, property ${r0(nw.prop)}`:""}, cards ${r0(nw.cards)}, loans ${r0(nw.loans)}).`);
  return L.join("\n");
}
const AI_RULES = summary => `You are the money assistant inside KP's personal money planner (India, ₹; use lakhs/k for big numbers). Use ONLY the figures below; don't invent any. Be specific: name categories, amounts and months. Separate one-off spikes from regular spending. When suggesting cuts, give 3–5 concrete ones with an estimated ₹ saving per month, easiest first. No investment product recommendations. Keep it under 220 words, plain text: short lines, "- " bullets, **bold** for key numbers. Card spends are counted in the month their bill is due.\n\nDATA:\n${summary}`;
const AI_Q = [["What changed this month?","What changed in my spending this month compared with the last few months, and why?"],["Where can I cut down?","Where can I realistically cut down? Give concrete cuts with monthly savings."],["Am I on track?","Am I on track this month and for the year? Anything to worry about?"]];
const aiFmt = t => esc(t).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").split("\n").map(l=>/^\s*[-•]\s+/.test(l)?`<div style="display:flex;gap:8px;margin:3px 0"><span>•</span><span>${l.replace(/^\s*[-•]\s+/,"")}</span></div>`:l.trim()?`<p style="margin:6px 0">${l}</p>`:"").join("");
function aiCard(){
  const chat=S.aiChat||[], on=!!aiFn();
  const thread=chat.map((m,i)=>m.role==="user"?`<div class="note" style="margin:12px 0 4px;font-weight:700;color:var(--ink)">${esc(m.q||m.content)}</div>`:`<div class="aiA" style="font-size:13.5px;line-height:1.5">${aiFmt(m.content)}</div>`).join("");
  return chartCard("Ask Claude", on?"about your spending":"", `
    <div class="pills" style="margin:4px 0 10px">${AI_Q.map(([l],i)=>`<button type="button" data-aiq="${i}" ${aiBusy?"disabled":""}>${l}</button>`).join("")}</div>
    ${thread}${aiBusy?`<div class="aiA" id="aiLive" style="font-size:13.5px;line-height:1.5">${aiBusy.text?aiFmt(aiBusy.text):'<span class="note">Thinking…</span>'}</div>`:""}
    ${on?`<div class="txsearch" style="margin-top:10px"><input type="text" id="aiIn" placeholder="${chat.length?"Ask a follow-up":"Or ask anything about your money"}" autocomplete="off" aria-label="Ask Claude"><button class="btn sm pri" type="button" id="aiGo" ${aiBusy?"disabled":""}>Ask</button></div>
      <div class="btns" style="margin-top:6px">${aiBusy?'<button class="btn sm" type="button" id="aiStop">Stop</button>':""}${chat.length&&!aiBusy?'<button class="btn sm" type="button" id="aiClr">New chat</button>':""}</div>`
     :`<p class="cnote">Answers here need the Claude version of the planner. In this app, copy a summary of your figures and paste it into Claude.</p><div class="btns"><button class="btn sm pri" type="button" id="aiCopy">Copy summary for Claude</button><a class="btn sm" href="https://claude.ai/new" target="_blank" rel="noopener">Open Claude</a></div>`}`,
    `<p class="cnote">Claude sees totals by month and category, your top spends by note, regular items and loans, not account numbers. ${aiSample?"Answers use your Claude usage":hostedAI()?"Answers come through your own Cloud Function and use your API credits":"Nothing is sent from here"}; check them before acting.</p>`);
}
async function aiAsk(q, label){
  const ask=aiFn(); if(!ask || aiBusy) return;
  const chat=S.aiChat=S.aiChat||[];
  while(chat.length && (chat[chat.length-1].role!=="assistant" || !String(chat[chat.length-1].content||"").trim())) chat.pop();   /* drop a half-finished turn */
  if(chat.some(m=>!String(m.content||"").trim())) chat.length=0;
  const turns = chat.length ? [...chat.map(m=>({role:m.role, content:m.content})), {role:"user", content:q}] : [{role:"user", content:AI_RULES(moneySummary())+"\n\nQUESTION: "+q}];
  chat.push({role:"user", content:turns[turns.length-1].content, q:label||q});
  aiBusy={text:"", ctl:new AbortController()}; render();
  try{
    const {text}=await ask(turns, {cache:false, signal:aiBusy.ctl.signal, onText:({text})=>{ if(!aiBusy) return; aiBusy.text=text; const el=document.getElementById("aiLive"); if(el) el.innerHTML=aiFmt(text); }});
    if(String(text||"").trim()) chat.push({role:"assistant", content:text}); else { chat.pop(); toast("Claude didn't return an answer. Try again."); }
  }catch(e){
    const keep=(e&&e.text)||"";
    if(keep) chat.push({role:"assistant", content:keep}); else chat.pop();
    if(e && e.code==="not_granted"){ aiSample=null; toast("Claude wasn't allowed for this page."); }
    else if(e && e.code==="rate_limited") toast("Too many questions at once. Try again in a moment.");
    else if(e && ["resource-exhausted","failed-precondition","permission-denied","unavailable","invalid-argument","not_signed_in"].includes(e.code)) toast(e.message);
    else if(e && e.code==="internal" && hostedAI() && (!e.message || e.message==="internal")) toast("Couldn't reach the askClaude function. Check that it's deployed in asia-south1 and allows public access (see README › Troubleshooting).");
    else if(!(e && e.code==="cancelled")) toast(e && e.message && e.message!==e.code ? e.message : "Couldn't get an answer ("+((e&&e.code)||"error")+").");
  }
  aiBusy=null; render();
}
document.addEventListener("click", e=>{
  const b=e.target.closest("[data-aiq],#aiGo,#aiStop,#aiClr,#aiCopy,[data-po]"); if(!b || b.closest("#modal")) return;
  if(b.dataset.aiq!==undefined){ const [l,q]=AI_Q[+b.dataset.aiq]; return aiAsk(q,l); }
  if(b.dataset.po){ prefSet("poOrder",b.dataset.po); return render(); }
  if(b.id==="aiGo"){ const v=val("aiIn")||($("#aiIn")||{}).value; if(v && v.trim()) aiAsk(v.trim()); return; }
  if(b.id==="aiStop"){ if(aiBusy) aiBusy.ctl.abort(); return; }
  if(b.id==="aiClr"){ S.aiChat=[]; return render(); }
  if(b.id==="aiCopy"){ const t=AI_RULES(moneySummary())+"\n\nQUESTION: Where can I cut down, and what changed this month?";
    (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast("Copied. Paste it into a new Claude chat."),()=>openSheet("Summary for Claude",`<div class="f"><label for="f_dump">Select all and copy</label><textarea id="f_dump" readonly style="min-height:240px">${esc(t)}</textarea></div><button class="btn" id="cx" type="button">Close</button>`,s=>s.querySelector("#cx").onclick=closeModal)); }
});
document.addEventListener("keydown", e=>{ if(e.key==="Enter" && e.target.id==="aiIn"){ e.preventDefault(); const v=e.target.value.trim(); if(v) aiAsk(v); } });
document.addEventListener("change", e=>{ const t=e.target; if(t.id==="f_poExtra"||t.id==="f_poLump"){ prefSet(t.id==="f_poExtra"?"poExtra":"poLump", Math.max(0,parseFloat(t.value)||0)); render(); } });


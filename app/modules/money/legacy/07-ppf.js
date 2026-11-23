/* KP Money Planner, moved over unchanged. Tidied into typed modules later in Milestone 2. */
/* ==========================================================================
   PPF from the bank statement: balance, deposits, interest, maturity
   ========================================================================== */
const PPF_MEMO=new WeakMap();
function ppfQuick(h){ const k=today()+"|"+(h.updatedAt||"")+"|"+(S.data.txns||[]).length; const m=PPF_MEMO.get(h); if(m && m.k===k) return m.v; const v=ppfCalc(h); PPF_MEMO.set(h,{k,v}); return v; }
function ppfCalc(h, opt={}){
  const P=h && h.ppf; if(!P) return null;
  const now=opt.today||today(), rate=(+h.rate||7.1)/100, sd=P.stmtDate||"";
  const inst=(h.instrument||h.name||"PPF").trim().toLowerCase();
  const rows=(P.rows||[]).map(r=>({...r, src:"stmt"}))
    .concat((P.manual||[]).map(m=>({...m, src:"manual"})))
    .concat(live("txns").filter(t=>t.type==="investment" && (t.instrument||"").trim().toLowerCase()===inst && t.date>sd).map(t=>({k:"dep", d:t.date, amt:invNet(t), src:"txn", tid:t.id})))
    .filter(r=>r.src!=="manual" || r.d>sd || r.k!=="dep")
    .sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:0);
  const sg=r=>r.k==="wd"?-1:1, sum=k=>rows.filter(r=>r.k===k).reduce((a,r)=>a+r.amt,0);
  const bal=rows.reduce((a,r)=>a+sg(r)*r.amt,0), dep=sum("dep"), int=sum("int"), wd=sum("wd");
  const fyOfD=d=>{ const y=+d.slice(0,4), m=+d.slice(5,7); return m>=4?y:y-1; };
  const fy0=fyOfD(P.opened||rows[0]?.d||now), fyNow=fyOfD(now), idx=fyNow-fy0+1, matures=`${fy0+16}-04-01`;
  const balOn=d=>rows.filter(r=>r.d<=d).reduce((a,r)=>a+sg(r)*r.amt,0);
  const fyEnd=new Map(); for(let y=fy0; y<fyNow; y++) fyEnd.set(y, balOn(`${y+1}-03-31`));
  /* interest: each month on the lowest balance between the 5th and the month end, credited on 31 March */
  const monthInt=(ym,startBal)=>{ const inM=rows.filter(r=>r.d.slice(0,7)===ym && r.k!=="int"); const low=startBal+inM.filter(r=>r.k==="dep"&&+r.d.slice(8,10)<=5).reduce((a,r)=>a+r.amt,0)-inM.filter(r=>r.k==="wd").reduce((a,r)=>a+r.amt,0); return Math.max(0,low)*rate/12; };
  let accrued=0; { let ym=`${fyNow}-04`; const nowYm=now.slice(0,7); while(ym<nowYm){ accrued+=monthInt(ym, balOn(`${ym}-00`)); ym=addM(ym,1); } }
  const fyDep=y=>rows.filter(r=>r.k==="dep" && fyOfD(r.d)===y).reduce((a,r)=>a+r.amt,0);
  const yearly = +h.yearly>0 ? +h.yearly : rows.filter(r=>r.k==="dep" && r.d>addM(now.slice(0,7),-12)+"-31").reduce((a,r)=>a+r.amt,0);
  /* projection to maturity: the same yearly amount, paid monthly on the 3rd (counts that month), interest at today's rate */
  const proj=[]; let mv=null;
  if(now<matures){ const nowYm=now.slice(0,7), per=yearly/12, depNow=rows.some(r=>r.k==="dep" && r.d.slice(0,7)===nowYm);
    let b=bal, intY=accrued, ym=nowYm;
    while(ym<matures.slice(0,7)){ if(ym!==nowYm || !depNow) b+=per; intY+=b*rate/12; if(ym.endsWith("-03")){ b+=intY; intY=0; proj.push([+ym.slice(0,4)-1, b]); } ym=addM(ym,1); }
    mv=b+intY; }
  /* partial withdrawal from the 7th year: half of the lower of the balance 4 years ago and last year (FY ends) */
  const wdOk=idx>=7, wdMax=wdOk?Math.min(fyEnd.get(fyNow-4)??0, fyEnd.get(fyNow-1)??0)*.5:0;
  const loanOk=idx>=3&&idx<=6, loanMax=loanOk?(fyEnd.get(fyNow-2)??0)*.25:0;
  return {rows, bal, dep, int, wd, inv:dep-wd, value:bal, accrued, rate, fy0, fyNow, idx, matures, fyEnd, fyDepNow:fyDep(fyNow), yearly, proj, mv, wdOk, wdMax, loanOk, loanMax, sd,
    lastDep:rows.filter(r=>r.k==="dep").slice(-1)[0], fyOfD};
}
const ppfHold = () => byId("holdings",S.ppfId) || live("holdings").find(h=>h.type==="PPF" && h.ppf);
function ppfRowHtml(r){
  const out=r.k==="wd";
  const title = r.k==="int" ? `Interest for FY ${fyLbl(fyOf(r.d))}` : r.k==="dep" ? "Deposit" : "Withdrawal";
  const via = r.src==="txn" ? "your entry" : r.src==="manual" ? "added by you" : (r.via||"statement");
  const chip = r.src==="manual" ? '<span class="chip">Added by you</span>' : r.src==="txn" ? '<span class="chip mute">Your entry</span>' : "";
  const tap = r.src==="manual" ? ` tap" data-ppfm="${esc(r.id)}" role="button" tabindex="0` : r.src==="txn" ? ` tap" data-tx="${esc(r.tid)}" role="button" tabindex="0` : "";
  return `<div class="row epr${tap}"><div class="main"><div class="t">${esc(title)} ${chip}</div><div class="s">${fmtD(r.d)}${r.via&&r.src==="stmt"?` · ${esc(r.via)}`:""}</div></div><div class="amt ${out?"":"in"}">${out?"−":"+"}${rs0(r.amt)}</div></div>`;
}
function vPpf(){
  const h=ppfHold(); if(!h){ S.view="accounts"; return vAccounts(); } S.ppfId=h.id;
  const p=ppfCalc(h), P=h.ppf, tab=S.ppfTab||"overview";
  const head=`<div class="monthbar"><button class="btn sm" type="button" data-go="accounts" aria-label="Back to Accounts">‹</button><div class="m" style="text-align:left">PPF</div><span class="chip">Public Provident Fund</span></div>`;
  const acts=`<div class="btns epfacts"><button class="btn sm pri" type="button" data-pa="add">Add entry</button><button class="btn sm" type="button" data-pa="edit">Assumptions</button></div>`;
  const hero=`<div class="hero epfh"><div class="lbl">PPF balance</div><div class="big">${rs0(p.bal)}</div>
    <div class="epfsub">${esc(P.bank||"")}${P.acct?` · account ${esc(P.acct)}`:""} · statement to ${fmtD(p.sd)}${p.rows.some(r=>r.src!=="stmt")?" + your entries":""}</div>
    <div class="hrow epfsplit"><div><div class="k">Year ${Math.min(p.idx,15)} of 15</div><div class="hv">${p.idx>15?"Extended":"Running"}</div></div><div><div class="k">Matures</div><div class="hv">${fmtD(p.matures)}</div></div><div><div class="k">Rate</div><div class="hv">${(p.rate*100).toFixed(2)}%</div></div></div></div>`;
  const tile=(k,v,s="")=>`<div class="tile"><div class="k">${k}</div><div class="v">${v}</div>${s?`<div class="ts">${s}</div>`:""}</div>`;
  const tiles=`<div class="tiles t4 epft">${tile("Deposited", shortR(p.inv), `${rs0(p.fyDepNow)} this year (limit ₹1.5L)`)}${tile("Interest earned", shortR(p.int), `${p.inv>0?(p.int/p.inv*100).toFixed(1):"0"}% on deposits`)}${tile("This year's interest", "≈ "+shortR(p.accrued), "credited on 31 Mar")}${tile("At maturity", p.mv?"≈ "+shortR(p.mv):"—", p.mv?`${rs0(p.yearly)} a year`:"")}</div>`;
  const TABS=[["overview","Overview"],["statement","Statement"],["projection","Projection"]];
  const seg=`<div class="seg" role="group" aria-label="PPF sections" style="margin-top:16px">${TABS.map(([k,l])=>`<button type="button" data-pt2="${k}" aria-pressed="${tab===k}">${l}</button>`).join("")}</div>`;
  let body="";
  const fys=[]; for(let y=p.fy0; y<=p.fyNow; y++) fys.push(y);
  if(tab==="overview"){
    const parts=[["Deposits",p.dep,"var(--v1)"],["Interest",p.int,"var(--v3)"]], tot=p.dep+p.int||1;
    const depv=fys.map(y=>p.rows.filter(r=>r.k==="dep"&&p.fyOfD(r.d)===y).reduce((a,r)=>a+r.amt,0)), intv=fys.map(y=>p.rows.filter(r=>r.k==="int"&&p.fyOfD(r.d)===y).reduce((a,r)=>a+r.amt,0));
    const ser=[{name:"Deposits",color:"var(--v1)",values:depv},{name:"Interest",color:"var(--v3)",values:intv}];
    body=`<div class="card"><b>Where the balance came from</b><div class="stack" aria-hidden="true">${parts.map(([,v,c])=>`<i style="flex:${v/tot};background:${c}"></i>`).join("")}</div>
      <div class="kv" style="margin-top:12px">${parts.map(([l,v,c])=>`<span><i class="dot" style="background:${c}"></i>${l}</span><b>${rs0(v)}</b>`).join("")}${p.wd?`<span>Withdrawn</span><b>${rs0(-p.wd)}</b>`:""}<span class="tot">Balance</span><b class="tot">${rs0(p.bal)}</b></div></div>
      ${chartCard("Added each year", `${shortR(p.dep)} deposited · ${shortR(p.int)} interest`, barChart({labels:fys.map(fyShort), ticks:fys.map(fyShort), full:fys.map(y=>`FY ${fyLbl(y)}`), series:ser, stack:true, h:200, aria:"PPF deposits and interest in each financial year", foot:i=>`Total ${rs0(depv[i]+intv[i])}`}), legendHtml(ser)+tableHtml(fys.map(y=>"FY "+fyLbl(y)), ser, fmtMoney, true))}
      <div class="card"><b>Rules that apply now</b><div class="kv">
        <span>Deposit this year</span><b>${rs0(p.fyDepNow)} of ₹1,50,000</b>
        <span>Minimum to keep it active</span><b>₹500 a year ${p.fyDepNow>=500?"✓":"· still due"}</b>
        <span>Partial withdrawal (year ${p.idx})</span><b>${p.wdOk?`up to ${rs0(p.wdMax)}`:`from FY ${fyLbl(p.fy0+6)}`}</b>
        ${p.loanOk?`<span>Loan against PPF</span><b>up to ${rs0(p.loanMax)}</b>`:""}
        <span>Matures</span><b>${fmtD(p.matures)}</b></div>
        <p class="cnote">From the 7th financial year you can withdraw once a year, up to half of the lower of the balance at the end of the 4th year before and of last year. Deposits up to ₹1.5 lakh a year count under 80C, and interest and maturity are tax-free. At maturity you can take it all, or extend in 5-year blocks with or without deposits.</p></div>`;
  }
  if(tab==="statement"){
    const fy=fys.includes(S.ppfFy)?S.ppfFy:p.fyNow, rs=p.rows.filter(r=>p.fyOfD(r.d)===fy).slice().reverse();
    const open=fy===p.fy0?0:(p.fyEnd.get(fy-1)??null), d=rs.filter(r=>r.k==="dep").reduce((a,r)=>a+r.amt,0), i=rs.filter(r=>r.k==="int").reduce((a,r)=>a+r.amt,0), close=fy===p.fyNow?p.bal:p.fyEnd.get(fy);
    body=`<div class="fychips" role="group" aria-label="Financial year">${fys.slice().reverse().map(y=>`<button type="button" class="chip fchip ${y===fy?"":"mute"}" data-pfy="${y}" aria-pressed="${y===fy}">FY ${fyLbl(y)}</button>`).join("")}</div>
      <div class="kp3 epfk"><div class="tile"><div class="k">Opening</div><div class="v">${open!=null?shortR(open):"—"}</div></div><div class="tile"><div class="k">Deposited</div><div class="v">${shortR(d)}</div></div><div class="tile"><div class="k">${fy===p.fyNow?"Interest so far ≈":"Interest"}</div><div class="v">${shortR(fy===p.fyNow&&!i?p.accrued:i)}</div></div><div class="tile"><div class="k">${fy===p.fyNow?"Balance now":"Closing"}</div><div class="v">${close!=null?shortR(close):"—"}</div></div></div>
      <div class="list" style="margin-top:12px">${rs.length?rs.map(ppfRowHtml).join(""):'<div class="empty">No entries this year.</div>'}</div>
      <p class="note">From your SBI statement up to ${fmtD(p.sd)}. Deposits after that come from your PPF entries in Transactions; interest and withdrawals you add here.</p>`;
  }
  if(tab==="projection"){
    const projAt=new Map(p.proj), last=p.proj.length?p.proj[p.proj.length-1][0]:p.fyNow, all=[]; for(let y=p.fy0;y<=Math.max(last,p.fyNow);y++) all.push(y);
    const act=all.map(y=>y<p.fyNow?(p.fyEnd.get(y)??null):y===p.fyNow?p.bal:null), prj=all.map(y=>y===p.fyNow?p.bal:y>p.fyNow?(projAt.get(y)??null):null);
    const ser=[{name:"Statement",color:"var(--v1)",values:act},{name:"Projected",color:"var(--v2)",values:prj,dash:true}];
    const alt=(yr,rt)=>{ const c=ppfCalc({...h, yearly:yr, rate:rt}); return c&&c.mv; };
    body=p.mv?`<div class="card epfcorp"><div class="k">Tentative PPF at maturity · ${fmtD(p.matures)}</div><div class="big">≈ ${shortR(p.mv)}</div><div class="s">with ${rs0(p.yearly)} a year and ${(p.rate*100).toFixed(2)}% interest · tax-free</div></div>
      ${chartCard("Balance by year","", lineChart({labels:all.map(fyShort), ticks:all.map(fyShort), full:all.map(y=>`FY ${fyLbl(y)}`), series:ser, h:210, mark:all.indexOf(p.fyNow), markLabel:"Now", fmt:shortR, aria:"PPF balance at the end of each financial year, from your statement and projected to maturity"}), legendHtml(ser))}
      <div class="card"><b>What if</b><div class="kv"><span>₹1,50,000 a year (the maximum)</span><b>≈ ${shortR(alt(150000,p.rate*100))}</b><span>₹50,000 a year</span><b>≈ ${shortR(alt(50000,p.rate*100))}</b><span>Rate falls to 6.5%</span><b>≈ ${shortR(alt(p.yearly,6.5))}</b></div></div>
      <div class="card"><b>Assumptions</b><div class="kv"><span>Deposits</span><b>${rs0(p.yearly)} a year${+h.yearly>0?"":" (last 12 months)"}</b><span>Interest</span><b>${(p.rate*100).toFixed(2)}% (today's rate, every year)</b></div><div class="btns" style="margin-top:8px"><button class="btn sm" type="button" data-pa="edit">Change</button></div></div>`
      :`<div class="list"><div class="empty">The account has matured. You can extend it in 5-year blocks.</div></div>`;
  }
  return head+hero+tiles+acts+seg+`<div class="epfb">${body}</div>`;
}
/* add by hand: a deposit (a normal investment entry from your bank), or interest / a withdrawal (kept on the PPF) */
function ppfEntryForm(h, m){
  const isNew=!m; m=m||{k:"dep", d:today(), amt:""};
  const banks=live("accounts").filter(a=>a.type!=="card" && !a.hidden);
  const lastAcc=(live("txns").filter(t=>t.type==="investment" && (t.instrument||"").trim().toLowerCase()===(h.instrument||"PPF").toLowerCase()).sort((a,b)=>b.date.localeCompare(a.date))[0]||{}).accountId;
  openSheet(isNew?"Add PPF entry":"PPF entry", `
    ${isNew?`<div class="seg" role="group" aria-label="Kind of entry" id="pkSeg">${[["dep","Deposit"],["int","Interest"],["wd","Withdrawal"]].map(([k,l])=>`<button type="button" data-k="${k}" aria-pressed="${m.k===k}">${l}</button>`).join("")}</div>`:""}
    <div class="grid2" style="margin-top:12px">${field(["amt","Amount (₹)","number",{value:m.amt??"",step:"1"}])}${field(["d","Date","date",{value:m.d||today()}])}</div>
    <div id="pk_acc">${field(["acc","Paid from","select",{value:lastAcc||(mainAcc()&&mainAcc().id)||"",options:banks.map(a=>[a.id,a.name])}])}</div>
    <p class="note" id="pk_note"></p>
    ${btnRow(isNew,"Add entry")}`, s=>{
    let k=m.k;
    const sync=()=>{ $("#pk_acc").hidden=k!=="dep"; $("#pk_note").textContent = k==="dep" ? "Saved as a PPF investment entry from this account, like your monthly deposit, so it shows in Transactions and comes off that account's balance." : k==="int" ? "Interest is credited on 31 March. It's kept on the PPF and listed in Transactions, but doesn't touch any bank balance." : "Kept on the PPF and listed in Transactions. If the money reached a bank account, add it there as income too."; if(k==="int" && isNew && !$("#f_d").dataset.t){ $("#f_d").value=`${fyOf(today())+(today().slice(5)>="03-31"?1:0)}-03-31`; } };
    s.querySelectorAll("#pkSeg button").forEach(b=>b.onclick=()=>{ k=b.dataset.k; s.querySelectorAll("#pkSeg button").forEach(x=>x.setAttribute("aria-pressed",x===b)); sync(); });
    $("#f_d").addEventListener("input",()=>{ $("#f_d").dataset.t=1; });
    sync(); s.querySelector("#cx").onclick=closeModal;
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>{ const o={...h, ppf:{...h.ppf, manual:(h.ppf.manual||[]).filter(x=>x.id!==m.id)}}; closeModal(); upsert("holdings",o); toast("Entry removed"); };
    s.querySelector("#sv").onclick=()=>{
      const amt=parseFloat(val("amt")), dt=val("d"); if(!(amt>0) || !dt){ toast("Enter the amount and date."); return; }
      if(k==="dep"){ closeModal(); upsert("txns",{id:uid(), type:"investment", amount:amt, date:dt, accountId:val("acc"), instrument:h.instrument||"PPF", invType:"PPF"}); toast("Deposit added"); return; }
      const o={id:m.id||uid(), k, d:dt, amt}, list=(h.ppf.manual||[]).filter(x=>x.id!==o.id).concat(o);
      closeModal(); upsert("holdings",{...h, ppf:{...h.ppf, manual:list}}); toast(isNew?"Entry added":"Entry updated");
    };
  });
}
/* PPF in Transactions: interest, withdrawals and any statement deposit you didn't record; your own deposit entries are already listed */
function ppfTxItems(){
  const out=[];
  for(const h of live("holdings")) if(h.type==="PPF" && h.ppf){ const p=ppfQuick(h); if(!p) continue;
    const inst=(h.instrument||"PPF").trim().toLowerCase(), mine=live("txns").filter(t=>t.type==="investment" && (t.instrument||"").trim().toLowerCase()===inst);
    p.rows.forEach((r,i)=>{ if(r.src==="txn") return;
      if(r.k==="dep" && mine.some(t=>Math.abs(+t.amount-r.amt)<1 && Math.abs(new Date(t.date)-new Date(r.d))<=4*864e5)) return;
      const title = r.k==="int" ? `PPF interest · FY ${fyLbl(fyOf(r.d))}` : r.k==="wd" ? "PPF withdrawal" : "PPF deposit (from statement)";
      out.push({id:`ppf:${h.id}:${r.k}:${r.d}:${i}`, type:"epf", epfK:r.k, ppfHid:h.id, ppfMid:r.src==="manual"?r.id:null, date:r.d, amount:r.amt, note:`${title} PPF`, title, sub:`${r.src==="manual"?"Added by you":"SBI statement"} · not from a bank account`, out:r.k==="wd", updatedAt:0}); }); }
  return out;
}

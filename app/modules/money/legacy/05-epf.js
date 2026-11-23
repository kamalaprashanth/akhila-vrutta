/* KP Money Planner, moved over unchanged. Tidied into typed modules later in Milestone 2. */
/* ==========================================================================
   EPF page: one place for the balance, passbook, projection and pension
   ========================================================================== */
const rs0 = v => (v<0?"−":"")+"₹"+Math.abs(Math.round(+v||0)).toLocaleString("en-IN");
const epfHold = () => byId("holdings",S.epfId) || live("holdings").find(h=>h.type==="EPF" && h.epf);
const EPF_KIND = {cont:"Contribution", ipr:"Back-period credit", tin:"Transfer in", tout:"Moved to new account", wd:"Withdrawal", exp:"Expected", int:"Interest"};
function epfEntryRows(e, fy){
  const nowFy=e.fyNow;
  return e.rows.filter(r=>r.fy===fy).concat(fy===nowFy?e.expected.map(r=>({...r, fy})):[]).concat(e.ints.filter(x=>x.fy===fy).map(x=>({...x, k:"int"})))
    .sort((a,b)=>(b.d||"").localeCompare(a.d||"") || (a.k==="int"?-1:1));
}
function epfRowHtml(r, h){
  const out=r.k==="wd"||r.k==="tout", amt=r.emp+r.er;
  const title = r.k==="int" ? `Interest for FY ${fyLbl(r.fy)}` : r.k==="cont"||r.k==="exp" ? `${mLabel(r.wm)} contribution` : r.k==="tin" ? `Transfer in${r.from?` from …${r.from.slice(-5)}`:""}` : r.k==="tout" ? "Moved to your new account" : r.k==="wd" ? "Withdrawal" : EPF_KIND[r.k]||"Entry";
  const parts=[r.d?(r.k==="exp"?`Due around ${dLabel(r.d)}`:`Credited ${fmtD(r.d)}`):"", `You ${rs0(r.emp)}`, `Employer ${rs0(r.er)}`, r.eps?`EPS ${rs0(r.eps)}`:""].filter(Boolean);
  const chip = r.k==="exp" ? '<span class="chip mute">Expected</span>' : r.manual ? '<span class="chip">Added by you</span>' : r.k==="wd" ? `<span class="chip bad">${esc(r.note||"Claim")}</span>` : r.k==="tin"&&r.internal ? '<span class="chip mute">Same money</span>' : "";
  const tap = r.manual ? ` tap" data-epfm="${esc(r.mid)}" role="button" tabindex="0` : "";
  return `<div class="row epr${r.k==="exp"?" exp":""}${tap}"><div class="main"><div class="t">${esc(title)} ${chip}</div><div class="s">${parts.map(esc).join(" · ")}</div></div><div class="amt ${out?"":"in"}">${out?"−":"+"}${rs0(amt).replace("₹","₹")}</div></div>`;
}
function vEpf(){
  const h=epfHold(); if(!h){ S.view="accounts"; return vAccounts(); }
  S.epfId=h.id;
  const e=epfCalc(h), tab=S.epfTab||"overview";
  const head=`<div class="monthbar"><button class="btn sm" type="button" data-go="accounts" aria-label="Back to Accounts">‹</button><div class="m" style="text-align:left">EPF</div><span class="chip">Provident fund</span></div>`;
  const acts=`<div class="btns epfacts"><button class="btn sm pri" type="button" data-ea="add">Add entry</button><button class="btn sm" type="button" data-ea="pdf">Load passbooks</button><button class="btn sm" type="button" data-ea="edit">Assumptions</button><input type="file" id="epfPdfV" accept="application/pdf,.pdf" multiple hidden></div>`;
  if(!e) return head+`<div class="list"><div class="empty">Load your EPF passbooks (PDFs from the EPFO member passbook site) or add entries by hand to see your EPF here.</div></div>`+acts;
  const E=h.epf, acc=e.accs[e.accs.length-1], gain=e.value-e.inv;
  const hero=`<div class="hero epfh">
    <div class="lbl">EPF balance</div>
    <div class="big">${rs0(e.value)}</div>
    <div class="epfsub">${e.expected.length?`Includes ${e.expected.length} expected month${e.expected.length>1?"s":""} · `:""}last credit ${e.lastWm?mLabel(e.lastWm):"—"}${acc?` · ${esc(titleCase(acc.est.split(" ").slice(0,3).join(" ")))}`:""}</div>
    <div class="hrow epfsplit">
      <div><div class="k">Your share</div><div class="hv">${shortR(e.accs.reduce((a,x)=>a+x.emp,0)+e.manual.reduce((a,r)=>a+(r.k==="wd"?-1:1)*r.emp,0)+e.expected.reduce((a,r)=>a+r.emp,0))}</div></div>
      <div><div class="k">Employer's share</div><div class="hv">${shortR(e.accs.reduce((a,x)=>a+x.er,0)+e.manual.reduce((a,r)=>a+(r.k==="wd"?-1:1)*r.er,0)+e.expected.reduce((a,r)=>a+r.er,0))}</div></div>
      <div><div class="k">Pension (EPS)</div><div class="hv">${shortR(e.epsBal+e.expEps)}</div></div>
    </div></div>`;
  const tile=(k,v,s="")=>`<div class="tile"><div class="k">${k}</div><div class="v">${v}</div>${s?`<div class="ts">${s}</div>`:""}</div>`;
  const tiles=`<div class="tiles t4 epft">${tile("Invested", shortR(e.inv), "you + employer − withdrawals")}${tile("Interest earned", shortR(e.interest), `${e.inv>0?((gain/e.inv)*100).toFixed(1):"0"}% on invested`)}${tile("This year's interest", "≈ "+shortR(e.accrued), "credited after 31 Mar")}${tile(`At ${e.age}`, e.corpus?"≈ "+shortR(e.corpus):"—", e.retYm?mLabel(e.retYm):"add date of birth")}</div>`;
  const TABS=[["overview","Overview"],["passbook","Passbook"],["projection","Projection"],["pension","Pension"]];
  const seg=`<div class="seg" role="group" aria-label="EPF sections" style="margin-top:16px">${TABS.map(([k,l])=>`<button type="button" data-et="${k}" aria-pressed="${tab===k}">${l}</button>`).join("")}</div>`;
  let body="";
  if(tab==="overview"){
    const parts=[["Your contributions",e.contEmp,"var(--v1)"],["Employer's contributions",e.contEr,"var(--v2)"],["Interest",e.interest,"var(--v3)"]];
    const tot=parts.reduce((a,p)=>a+p[1],0)||1;
    const comp=`<div class="card"><b>Where the balance came from</b>
      <div class="stack" aria-hidden="true">${parts.map(([,v,c])=>`<i style="flex:${Math.max(v,0)/tot};background:${c}"></i>`).join("")}</div>
      <div class="kv" style="margin-top:12px">${parts.map(([l,v,c])=>`<span><i class="dot" style="background:${c}"></i>${l}</span><b>${rs0(v)}</b>`).join("")}
      ${e.tinExt?`<span>Moved in from accounts not loaded</span><b>${rs0(e.tinExt)}</b>`:""}
      ${e.wd?`<span>Withdrawn</span><b>${rs0(-e.wd)}</b>`:""}
      ${e.expAmt?`<span>Expected months</span><b>${rs0(e.expAmt)}</b>`:""}
      <span class="tot">Balance</span><b class="tot">${rs0(e.value)}</b></div></div>`;
    const pfys=[...new Set([...e.rows.map(r=>r.fy), ...e.ints.map(x=>x.fy)])].sort((a,b)=>a-b);
    const by=(f,k)=>pfys.map(y=>e.rows.filter(r=>r.fy===y && f(r)).reduce((a,r)=>a+r[k],0));
    const isC=r=>r.k==="cont"||r.k==="ipr"||(r.k==="tin"&&!r.internal);
    const you=by(isC,"emp"), er=by(isC,"er"), intr=pfys.map(y=>e.ints.filter(x=>x.fy===y).reduce((a,x)=>a+x.emp+x.er,0)), wdv=pfys.map((y,i)=>-(by(r=>r.k==="wd","emp")[i]+by(r=>r.k==="wd","er")[i]));
    const ser=[{name:"Your share",color:"var(--v1)",values:you},{name:"Employer",color:"var(--v2)",values:er},{name:"Interest",color:"var(--v3)",values:intr}];
    if(wdv.some(v=>v<0)) ser.push({name:"Withdrawn",color:"var(--v4)",values:wdv});
    const chart=chartCard("Added each year", `${shortR(e.contEmp+e.contEr)} paid in · ${shortR(e.interest)} interest`, barChart({labels:pfys.map(fyShort), ticks:pfys.map(fyShort), full:pfys.map(y=>`FY ${fyLbl(y)}`), series:ser, stack:true, h:210, aria:"Contributions, interest and withdrawals in each financial year", foot:i=>`Net ${rs0(you[i]+er[i]+intr[i]+wdv[i])}`}), legendHtml(ser)+tableHtml(pfys.map(y=>"FY "+fyLbl(y)), ser, fmtMoney, true));
    const accts=`<h2>Member IDs</h2><div class="list">${e.accs.map(a=>`<div class="row"><div class="main"><div class="t">${esc(titleCase(a.est))}</div><div class="s">${esc(a.acc)} · FY ${fyLbl(a.first).slice(0,4)}–${String(a.last+1)}${a.emp+a.er>0.5?"":" · moved to the next account"}</div></div><div class="amt">${rs0(a.emp+a.er)}</div></div>`).join("")}</div>`;
    const wds=e.rows.filter(r=>r.k==="wd");
    body=comp+chart+(wds.length?`<h2>Withdrawals</h2><div class="list">${wds.map(r=>epfRowHtml(r,h)).join("")}</div>`:"")+accts
      +(e.issues.length?`<div class="banner">${e.issues.map(esc).join("<br>")}</div>`:`<p class="note">Every loaded passbook adds up to its closing balance.</p>`);
  }
  if(tab==="passbook"){
    const fys=[...new Set([...e.rows.map(r=>r.fy), ...e.ints.map(x=>x.fy), e.fyNow])].sort((a,b)=>b-a);
    const fy=fys.includes(S.epfFy)?S.epfFy:fys[0];
    const rows=epfEntryRows(e, fy), open=e.fyEnd.get(fy-1)??null;
    const paidIn=rows.filter(r=>r.k==="cont"||r.k==="ipr"||r.k==="exp").reduce((a,r)=>a+r.emp+r.er,0), intr=rows.filter(r=>r.k==="int").reduce((a,r)=>a+r.emp+r.er,0), wd=rows.filter(r=>r.k==="wd").reduce((a,r)=>a+r.emp+r.er,0);
    const close = fy===e.fyNow ? e.value : e.fyEnd.get(fy);
    body=`<div class="fychips" role="group" aria-label="Financial year">${fys.map(y=>`<button type="button" class="chip fchip ${y===fy?"":"mute"}" data-efy="${y}" aria-pressed="${y===fy}">FY ${fyLbl(y)}</button>`).join("")}</div>
      <div class="kp3 epfk"><div class="tile"><div class="k">Opening</div><div class="v">${open!=null?shortR(open):"—"}</div></div><div class="tile"><div class="k">Paid in</div><div class="v">${shortR(paidIn)}</div></div><div class="tile"><div class="k">${fy===e.fyNow?"Interest so far ≈":"Interest"}</div><div class="v">${shortR(fy===e.fyNow&&!intr?e.accrued:intr)}</div></div><div class="tile"><div class="k">${fy===e.fyNow?"Balance now":"Closing"}</div><div class="v">${close!=null?shortR(close):"—"}</div></div></div>
      ${wd?`<p class="note">Withdrawn this year: ${rs0(wd)}.</p>`:""}
      <div class="list" style="margin-top:12px">${rows.length?rows.map(r=>epfRowHtml(r,h)).join(""):'<div class="empty">No entries for this year.</div>'}</div>
      <p class="note">${fy===e.fyNow?"Interest for this year is credited after 31 March. ":""}Expected months are replaced when a newer passbook is loaded or you add the month yourself. Entries you added can be tapped to change.</p>`;
  }
  if(tab==="projection"){
    const nowFy=e.fyNow, firstFy=Math.min(...(e.fyEnd.size?e.fyEnd.keys():[nowFy]));
    const projAt=new Map(e.proj.map(([d,v])=>{ const y=+d.slice(0,4), m=+d.slice(5,7); return [m>=4?y:y-1, v]; }));
    const lastFy=Math.max(nowFy, ...projAt.keys()), fys=[]; for(let y=firstFy;y<=lastFy;y++) fys.push(y);
    const act=fys.map(y=>y<nowFy?(e.fyEnd.get(y)??null):y===nowFy?e.value:null), prj=fys.map(y=>y===nowFy?e.value:y>nowFy?(projAt.get(y)??null):null);
    const ser=[{name:"Passbook",color:"var(--v1)",values:act},{name:"Projected",color:"var(--v2)",values:prj,dash:true}];
    const alt=o=>{ const c=epfCalc({epf:{...E, ...o}}); return c&&c.corpus; };
    const sc=[["Interest falls to 7.5%", alt({rate:7.5})], [`Contribution grows ${(+E.raise||0)+5}% a year`, alt({raise:(+E.raise||0)+5})], [`Retire at ${(+E.retireAge||58)-3}`, alt({retireAge:(+E.retireAge||58)-3})]].filter(([,v])=>v);
    const yrs=e.retYm?diffM(ymOf(today()), e.retYm)/12:0;
    body=e.corpus?`<div class="card epfcorp"><div class="k">Tentative EPF at ${e.age} · ${mLabel(e.retYm)}</div><div class="big">≈ ${shortR(e.corpus)}</div><div class="s">≈ ${shortR(e.corpus/Math.pow(1.06,yrs))} in today's money (6% inflation) · ${yrs.toFixed(0)} years away</div></div>
      ${chartCard("Balance by year", "", lineChart({labels:fys.map(fyShort), ticks:fys.map(fyShort), full:fys.map(y=>`FY ${fyLbl(y)}`), series:ser, h:220, mark:fys.indexOf(nowFy), markLabel:"Now", fmt:short, aria:"EPF balance at the end of each financial year, from your passbooks and projected to retirement"}), legendHtml(ser))}
      <div class="card"><b>What if</b><div class="kv">${sc.map(([l,v])=>`<span>${esc(l)}</span><b>≈ ${shortR(v)}</b>`).join("")}</div></div>
      <div class="card"><b>Assumptions</b><div class="kv"><span>Interest rate</span><b>${(e.rate*100).toFixed(2)}% a year</b><span>Going in each month</span><b>${rs0(e.mon.emp+e.mon.er)}${E.raise?`, +${E.raise}% a year`:", no raises"}</b><span>Retire at</span><b>${e.age}</b></div>
        <p class="cnote">No withdrawals or job gaps. Interest is worked out the way EPFO does it: on each month's opening balance, credited every 31 March.</p>
        <div class="btns" style="margin-top:8px"><button class="btn sm" type="button" data-ea="edit">Change assumptions</button></div></div>
      <div class="card"><b>Taking money out</b><div class="kv"><span>Partial withdrawal now (75%)</span><b>up to ${rs0(e.partial)}</b><span>After leaving a job: at once</span><b>up to ${rs0(e.epfBal*.75)}</b><span>…the rest after 12 months without work</span><b>${rs0(e.epfBal*.25)}</b><span>At ${e.age}</span><b>all of it, tax-free</b></div>
        <p class="cnote">EPFO's rules from October 2025: with 12 months of service you can take out up to 75% of the balance; 25% stays. Tax-free because your service has been continuous for more than 5 years. Check the EPFO portal before you apply.</p></div>`
      :`<div class="list"><div class="empty">Add your date of birth under Assumptions to see the projection.</div></div>`;
  }
  if(tab==="pension"){
    const p=e.pension;
    body=`<div class="card epfcorp"><div class="k">Tentative pension from ${e.age}</div><div class="big">${p?`≈ ${rs0(p)}<small>/month</small>`:"Needs 10 years"}</div><div class="s">${p&&e.sal>15000?`≈ ${rs0(e.pensionLow)}/month if the old ₹15,000 cap applies to your earlier service`:""}</div></div>
      <div class="tiles t4 epft">${tile("Pension balance", shortR(e.epsBal+e.expEps), "not in net worth")}${tile("Service so far", svcTxt(e.svcNow), "months with EPS")}${tile(`Service at ${e.age}`, svcTxt(e.svcAt58), e.bonus?"+ 2 bonus years":"")}${tile("Salary for pension", rs0(e.sal), "EPS ceiling")}</div>
      ${e.epsLeft.length?`<div class="banner" style="margin-top:12px">${e.epsLeft.map(a=>`${rs0(a.eps)} of pension money is still in your old account (${esc(titleCase(a.est.split(" ").slice(0,3).join(" ")))}, ${esc(a.acc)}). It wasn't moved when the EPF was transferred.`).join(" ")} Ask EPFO or your employer to transfer it so the service counts together.</div>`:""}
      <h2>Pension balance by account</h2><div class="list">${e.accs.map(a=>`<div class="row"><div class="main"><div class="t">${esc(titleCase(a.est))}</div><div class="s">${esc(a.acc)}</div></div><div class="amt">${rs0(a.eps)}</div></div>`).join("")}</div>
      <p class="note">Estimate: average pensionable salary of the last 60 months × years of service ÷ 70, with service capped at 35 years (2 bonus years after 20). Only months with a pension contribution count. The ₹25,000 ceiling started on 17 Sep 2026; how it applies to earlier service isn't settled yet.</p>`;
  }
  return head+hero+tiles+acts+seg+`<div class="epfb">${body}</div>`;
}
function titleCase(s){ return String(s||"").split(/\s+/).map(w=>/^[A-Z]{2,3}$/.test(w)&&!/^(OF|AND|THE|FOR)$/.test(w) ? w : w.charAt(0)+w.slice(1).toLowerCase()).join(" ").replace(/\b(Of|And|The|For)\b/g, w=>w.toLowerCase()).replace(/^./, c=>c.toUpperCase()); }
const shortR = v => Math.abs(v)>=1e5 ? short(v) : rs0(v);
/* add or change an entry by hand: a month's contribution, a year's interest, or a withdrawal */
function epfEntryForm(h, m){
  const e=epfCalc(h)||{mon:{emp:0,er:0,eps:0,epsw:0}, lastWm:"", fyNow:fyOf(today())}, isNew=!m;
  const nextWm=e.lastWm?addM(e.lastWm,1):addM(ymOf(today()),-1);
  m=m||{k:"cont", wm:nextWm, d:`${addM(nextWm,1)}-08`, emp:e.mon.emp, er:e.mon.er, eps:e.mon.eps, epsw:e.mon.epsw, fy:e.fyNow-1};
  openSheet(isNew?"Add EPF entry":"EPF entry", `
    <div class="seg" role="group" aria-label="Kind of entry" id="ekSeg">${[["cont","Monthly contribution"],["int","Interest"],["wd","Withdrawal"]].map(([k,l])=>`<button type="button" data-k="${k}" aria-pressed="${m.k===k}">${l}</button>`).join("")}</div>
    <div id="ek_cont" class="grid2" style="margin-top:12px">${field(["wm","Wage month","month",{value:m.wm||nextWm}])}${field(["d","Credited on","date",{value:m.k!=="int"?m.d||"":""}])}</div>
    <div id="ek_int" style="margin-top:12px">${field(["fy","Financial year","select",{value:String(m.fy??e.fyNow-1),options:Array.from({length:6},(_,i)=>{ const y=e.fyNow-i; return [String(y),"FY "+fyLbl(y)]; })}])}</div>
    <div class="grid2">${field(["emp","Your share (₹)","number",{value:m.emp??"",step:"1"}])}${field(["er","Employer's share (₹)","number",{value:m.er??"",step:"1"}])}</div>
    <div id="ek_eps">${field(["eps","Pension (EPS) (₹)","number",{value:m.eps??"",step:"1",hint:"From your passbook or payslip. Not part of the EPF balance."}])}</div>
    <div id="ek_note">${field(["note","Note (optional)","text",{value:m.note||"",ph:"e.g. Claim for housing"}])}</div>
    <p class="note">When you later load a passbook that covers this month or year, the passbook's figures replace this entry.</p>
    ${btnRow(isNew,"Add entry")}`, s=>{
    let k=m.k;
    const sync=()=>{ $("#ek_cont").hidden=k==="int"; $("#ek_int").hidden=k!=="int"; $("#ek_eps").hidden=k!=="cont"; $("#ek_note").hidden=k!=="wd"; $("#w_wm").hidden=k!=="cont";
      $("#w_d label").textContent=k==="wd"?"Paid out on":"Credited on"; $("#w_emp label").textContent=k==="wd"?"From your share (₹)":k==="int"?"Interest on your share (₹)":"Your share (₹)"; $("#w_er label").textContent=k==="wd"?"From employer's share (₹)":k==="int"?"Interest on employer's share (₹)":"Employer's share (₹)"; };
    s.querySelectorAll("#ekSeg button").forEach(b=>b.onclick=()=>{ k=b.dataset.k; s.querySelectorAll("#ekSeg button").forEach(x=>x.setAttribute("aria-pressed",x===b)); if(k!=="cont" && isNew){ $("#f_emp").value=""; $("#f_er").value=""; } sync(); });
    $("#f_wm").addEventListener("change",()=>{ if(isNew && val("wm")) $("#f_d").value=`${addM(val("wm"),1)}-08`; });
    sync();
    s.querySelector("#cx").onclick=closeModal;
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>{ const o={...h, epf:{...h.epf, manual:(h.epf.manual||[]).filter(x=>x.id!==m.id)}}; closeModal(); upsert("holdings",o); toast("Entry removed"); };
    s.querySelector("#sv").onclick=()=>{
      const emp=parseFloat(val("emp"))||0, er=parseFloat(val("er"))||0;
      if(emp+er<=0){ toast("Enter the amount."); return; }
      const o={id:m.id||uid(), k, emp, er};
      if(k==="cont"){ if(!val("wm")||!val("d")){ toast("Pick the wage month and the date it was credited."); return; } o.wm=val("wm"); o.d=val("d"); o.eps=parseFloat(val("eps"))||0; o.epsw=m.epsw||e.mon.epsw||0; }
      if(k==="int"){ o.fy=+val("fy"); }
      if(k==="wd"){ if(!val("d")){ toast("Pick the date it was paid out."); return; } o.d=val("d"); o.note=val("note"); }
      const list=(h.epf&&h.epf.manual||[]).filter(x=>x.id!==o.id).concat(o);
      const nh={...h, epf:{...(h.epf||{rate:8.25, raise:0, retireAge:58, books:{}}), manual:list}};
      closeModal(); upsert("holdings",nh); toast(isNew?"Entry added":"Entry updated");
    };
  });
}
async function epfPdfToHolding(h, files){
  if(!files || !files.length) return; toast(`Reading ${files.length} PDF${files.length>1?"s":""}…`);
  try{ const {list,bad}=await epfLoadFiles([...files]);
    if(!list.length){ toast("Couldn't read these as EPF passbooks."); return; }
    const r=epfMerge(h.epf||{rate:8.25, raise:0, retireAge:58}, list), cur=byId("holdings",h.id)||h;
    upsert("holdings", {...cur, epf:{...r.E, manual:(cur.epf&&cur.epf.manual)||[]}});
    toast(`${list.length} passbook${list.length>1?"s":""} loaded${bad.length?`, ${bad.length} couldn't be read`:""}`); }
  catch(e){ console.warn(e); toast("Couldn't open the PDF reader. Try again."); }
}

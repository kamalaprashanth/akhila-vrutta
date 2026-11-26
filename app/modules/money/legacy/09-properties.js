/* KP Money Planner, moved over unchanged. Tidied into typed modules later in Milestone 2. */
/* ==========================================================================
   Properties: what each property has cost you. Kept out of net worth.
   props      {id, name, kind, status, place, since, value, loanId, note,
               stmt:{asOf, through, int, pemi, chg, prin, out, acct, bank}}   (stmt = the bank's own totals from a loan statement)
              plus one settings record {id:"propcats", rec:"cats", custom:[{k,g,name}], hide:[k], names:{k:name}}
   propItems  {id, prop, cat, amt, date, note, accountId, txnId}   a linked transaction's amount and date are read from the transaction
   Interest: the statement's totals up to its last EMI, then each later EMI split from the loan schedule (shown as an estimate
   until the next statement replaces it).
   ========================================================================== */
const PG=[["price","Price of the property","cost"],["govt","Government & registration","cost"],["legal","Legal & documents","cost"],["loan","Loan & bank","cost"],
  ["broker","Brokerage & agents","cost"],["builder","Builder extras","cost"],["util","Utilities","cost"],["setup","Set-up & move-in","sep"],["off","Off-record","off"],["run","Running costs","sep"]];
const PG_TAG={cost:"in cost", sep:"separate", off:"separate · not for tax", int:"interest"};
const PC0=[
  ["token","price","Token / booking advance"],["agree","price","Agreement-time payment"],["inst","price","Instalment (construction-linked)"],["final","price","Final payment at registration"],
  ["bank","price","Paid by bank loan (disbursement)","bank"],["tds","price","TDS 1% paid for seller (Form 26QB)"],["plc","price","Floor rise / PLC (preferred location)"],["park","price","Car parking"],
  ["club","price","Clubhouse / amenities"],["gst","price","GST on the flat (under construction)"],
  ["stamp","govt","Stamp duty"],["regfee","govt","Registration fee"],["cess","govt","Cess & surcharge on stamp duty"],["estamp","govt","E-stamp / franking charges"],["sro","govt","Scanning & sub-registrar fees"],
  ["ec","govt","Encumbrance certificate (EC)"],["ccopy","govt","Certified copies of deed"],["khata","govt","Khata transfer / e-khata"],["better","govt","Betterment charges"],["taxarr","govt","Property tax arrears cleared"],
  ["dc","govt","DC conversion / land use (plots)"],["survey","govt","Survey / phodi / boundary sketch (plots)"],
  ["lawyer","legal","Lawyer's fees"],["title","legal","Title verification"],["agdraft","legal","Agreement drafting"],["sddraft","legal","Sale deed drafting"],["docw","legal","Document writer"],
  ["notary","legal","Notary / affidavit"],["poa","legal","Power of attorney"],["legoth","legal","Courier, travel & other"],
  ["proc","loan","Processing fee"],["admin","loan","Admin / login charges"],["cersai","loan","CERSAI fee"],["val","loan","Bank legal & technical valuation"],["motd","loan","MOTD stamp duty (title deed deposit)"],
  ["lstamp","loan","Loan agreement stamp / franking"],["lins","loan","Loan / property insurance"],["pemi","loan","Pre-EMI interest","int"],["emiint","loan","EMI interest","int"],["prepchg","loan","Prepayment / foreclosure charges"],["lprepay","loan","Prepayment of the property's loan (principal)","prin"],
  ["brok","broker","Broker commission"],["brokgst","broker","GST on brokerage"],["liaison","broker","Liaison / facilitation agent"],
  ["corpus","builder","Corpus / sinking fund"],["advmnt","builder","Advance maintenance"],["assoc","builder","Association membership / share certificate"],["bldleg","builder","Legal charges collected by builder"],
  ["infra","builder","Infrastructure / development charges"],["dg","builder","Generator / DG backup"],
  ["bescom","util","BESCOM deposit & meter"],["bwssb","util","BWSSB water & sanitary connection"],["gas","util","Gas pipeline connection"],["bore","util","Borewell / sump (plots)"],
  ["interior","setup","Interiors / modular kitchen"],["furn","setup","Furniture & appliances"],["fence","setup","Compound wall / fencing (plots)"],["puja","setup","Griha pravesha / puja"],["movers","setup","Packers & movers"],
  ["cash","off","Cash component of price"],["unoff","off","Unofficial payments (speed money)"],["offoth","off","Other cash, not on receipt"],
  ["maint","run","Maintenance"],["ptax","run","Property tax"],["hins","run","Home insurance"],["repair","run","Repairs"]];
const PROP_KIND={plot:"Plot",flat:"Flat",house:"House / villa",land:"Land",other:"Other"};
const PROP_ST={booked:"Booked",agreement:"Agreement",construction:"Under construction",registered:"Registered",possession:"Possession"};
const propCfg = () => byId("props","propcats") || {id:"propcats", rec:"cats", custom:[], hide:[], names:{}};
const propList = () => live("props").filter(p=>p.rec!=="cats").sort((a,b)=>(a.since||"").localeCompare(b.since||"")||a.name.localeCompare(b.name));
/* every category (built-in + yours), with your names; hidden ones are kept for old entries but left out of the picker */
function propCats(){ return memo("pcats",()=>{ const c=propCfg(), hide=new Set(c.hide||[]);
  return [...PC0.map(([k,g,name,f])=>({k,g,name:(c.names||{})[k]||name,base:name,f:f||"",mine:false})), ...(c.custom||[]).map(x=>({k:x.k,g:x.g,name:(c.names||{})[x.k]||x.name,base:x.name,f:"",mine:true}))]
    .map(x=>({...x, hidden:hide.has(x.k)})); }); }
const pcOf = k => propCats().find(c=>c.k===k) || {k, g:"legal", name:k||"Other", f:""};
const pgOf = g => PG.find(x=>x[0]===g) || PG[2];
const pcHow = c => c.f==="int" ? "int" : c.f==="prin" ? "prin" : pgOf(c.g)[2];
/* items of one property, with linked transactions read live (a refund or cashback counts as minus) */
function propItems(p){ return memo("pi:"+p.id, ()=>live("propItems").filter(i=>i.prop===p.id).map(i=>{
  if(i.txnId){ const t=byId("txns",i.txnId); if(!t || t.deleted) return {...i, gone:true, amt:0};
    const fs=fundsOf(t); return {...i, amt:(t.type==="income"?-1:1)*(+t.amount||0), date:t.date, accountId:t.accountId, funds:fs, fund:t.fromLoan||"", fundAmt:fs.reduce((a,f)=>a+f.amt,0), tnote:t.note||""}; }
  const fs=(i.funds||[]).length ? fundsOf({type:"expense", amount:i.amt, funds:i.funds}) : i.loanId ? [{loan:i.loanId, amt:Math.min(+i.loanAmt||+i.amt, +i.amt), part:""}] : [];
  return {...i, amt:+i.amt||0, funds:fs, fund:!i.accountId&&i.loanId||"", fundAmt:fs.reduce((a,f)=>a+f.amt,0)}; }).sort((a,b)=>b.date.localeCompare(a.date))); }
/* interest worked out from the loan for EMIs after the statement (or from the start, with no statement) */
function propInt(p){ return memo("pint:"+p.id, ()=>{
  const l=p.loanId && byId("loans",p.loanId), st=p.stmt||null, now=today(), nowYm=ymOf(now);
  const out={l:l&&!l.deleted?l:null, st, stInt:st?(+st.int||0)+(+st.pemi||0):0, est:[], estInt:0, estPrin:0, prepay:0, next:null, toCome:0, out:0};
  if(!out.l) return out;
  const s=schedule(out.l), b=bankOf(out.l), day=+(b&&b.day)||10, from=st&&st.through||"";
  if(s) for(const r of s.rows){ if(from && r.ym<=from) continue;
    const due=`${r.ym}-${pad(Math.min(day,28))}`;
    if(due<=now){ out.est.push({...r, date:due}); out.estInt+=r.int; out.estPrin+=r.prin; }
    else { if(!out.next) out.next={...r, date:due}; out.toCome+=r.int; } }
  out.prepay=loanTx(out.l.id).filter(t=>t.act==="prepay" && (!st || t.date>st.asOf)).reduce((a,t)=>a+ +t.amount,0);
  out.out=loanSum(out.l).out;
  return out; }); }
function propCalc(p){ return memo("pc:"+p.id, ()=>{
  const items=propItems(p), I=propInt(p), by={}, grp={}, fund=new Map(), fpart=new Map(); let cost=0, intItems=0, sep=0, off=0, bankPaid=0, mine=0, price=0;
  let prinFunded=0; const prepFund=new Map();
  for(const i of items){ if(i.gone) continue; const c=pcOf(i.cat), how=pcHow(c);
    /* a prepayment of the property's own loan isn't extra cost (the loan already paid the price); it only matters when another loan funded it */
    const ext=(i.funds||[]).filter(f=>f.loan!==p.loanId), extAmt=ext.reduce((a,f)=>a+f.amt,0);
    const addF=(f,prep)=>{ fund.set(f.loan,(fund.get(f.loan)||0)+f.amt); const k=f.part==="bank"?"b":f.part==="own"?"o":"u"; const m=fpart.get(f.loan)||{b:0,o:0,u:0}; m[k]+=f.amt; fpart.set(f.loan,m); if(prep) prepFund.set(f.loan,(prepFund.get(f.loan)||0)+f.amt); };
    if(how==="prin"){ by[i.cat]=(by[i.cat]||0)+i.amt; ext.forEach(f=>addF(f,true)); prinFunded+=extAmt; continue; }
    by[i.cat]=(by[i.cat]||0)+i.amt; grp[c.g]=(grp[c.g]||0)+i.amt;
    if(how==="cost") cost+=i.amt; else if(how==="int") intItems+=i.amt; else if(how==="off") off+=i.amt; else sep+=i.amt;
    if(c.g==="price") price+=i.amt;
    const viaOwn=(i.funds||[]).some(f=>f.loan===p.loanId);
    if(c.f==="bank" || (viaOwn && !ext.length && i.fundAmt>=i.amt-0.5)) bankPaid+=i.amt; else { ext.forEach(f=>addF(f,false)); mine+=i.amt-Math.min(i.amt,extAmt); } }
  /* other loans that paid part of it: the property carries their interest, and your repayments count as your money, in proportion
     to how much of the loan it used (option A) */
  const loans=[]; let lInt=0, lPaid=0, lOwed=0, lCome=0;
  for(const [id,amt] of fund){ const l=byId("loans",id); if(!l || l.deleted){ mine+=amt; continue; }
    const x=loanSum(l), b=bankOf(l), bp=b?(+b.principal||0):0, borrowed=(x.own.borrowed||0)+bp, share=borrowed>0?Math.min(1,amt/borrowed):1;
    /* interest: for a loan with an interest-free part and a bank part, only money from the bank part carries the bank's interest */
    const m=fpart.get(id)||{b:0,o:0,u:amt}, iShare = kindOf(l)==="hybrid" ? (bp>0 ? Math.min(1,(m.b + m.u*(bp/(borrowed||1)))/bp) : 0) : share;
    const paid=Math.max(0, borrowed+x.paidInt-x.out), o={l, amt, prep:prepFund.get(id)||0, share, iShare, int:iShare*x.paidInt, paid:share*paid, owed:share*x.out, come:iShare*Math.max(0,x.totalInt-x.paidInt)};
    loans.push(o); lInt+=o.int; lPaid+=o.paid; lOwed+=o.owed; lCome+=o.come; }
  const interest=intItems+I.stInt+I.estInt+lInt, prin=(I.st?(+I.st.prin||0):0)+I.estPrin+I.prepay;
  const loanPaid=loans.reduce((a,o)=>a+o.amt,0);
  const isBankLoan = l => { const k=kindOf(l); return k!=="family" && k!=="hybrid"; };
  const owedBy=[]; if(I.l && I.out>0.5) owedBy.push({name:I.l.lender||I.l.name, amt:I.out, bank:isBankLoan(I.l)});
  for(const o of loans) if(o.owed>0.5) owedBy.push({name:o.l.lender||o.l.name, amt:o.owed, bank:isBankLoan(o.l)});
  const owedBank=owedBy.filter(x=>x.bank).reduce((a,x)=>a+x.amt,0), owedFam=owedBy.filter(x=>!x.bank).reduce((a,x)=>a+x.amt,0);
  const paidBank=bankPaid+loans.filter(o=>isBankLoan(o.l)).reduce((a,o)=>a+o.amt-o.prep,0), paidFam=loans.filter(o=>!isBankLoan(o.l)).reduce((a,o)=>a+o.amt-o.prep,0);
  return {items, I, by, grp, cost, interest, withInt:cost+interest, sep, off, bankPaid, loanPaid, loans, lInt, lPaid, mine, price,
    own: mine + I.stInt + I.estInt + prin - prinFunded + lPaid, prin, prinFunded, owed:I.out+lOwed, owedBy, owedBank, owedFam, paidBank, paidFam, toCome:I.toCome+lCome, everything:cost+interest+sep+off}; }); }

/* ---------- pages ---------- */
const propRegd = p => p.status==="registered" || p.status==="possession";
/* what a property adds to net worth on a date: once registered, its current value (or the agreement value, or what it cost);
   before that, only what you've paid towards the price, so the unpaid price isn't counted as yours */
function propNwAt(p, end){ if(!p.nw) return 0; const at=end||today(), c=propCalc(p);
  if(propRegd(p) && (!p.since || p.since<=at)) return +p.cur>0 && (!p.curDate || p.curDate<=at) ? +p.cur : +p.value>0 ? +p.value : c.cost;
  return c.items.filter(i=>!i.gone && pcOf(i.cat).g==="price" && i.date<=at).reduce((a,i)=>a+i.amt,0); }
const propNwWhy = p => propRegd(p) ? (+p.cur>0 ? `current value${p.curDate?` of ${fmtD(p.curDate)}`:""}` : +p.value>0 ? "agreement value" : "cost (no value set)") : "price paid so far";
function propNw(){ return memo("pnw",()=>{ let on=0, off=0; for(const p of propList()){ if(p.nw) on+=propNwAt(p); else off+=propNwAt({...p, nw:true}); } return {on, off}; }); }
function vProps(){ S.accTab="props"; S.view="accounts"; return vAccounts(); }
function propsBody(){
  const C=propList().map(p=>[p,propCalc(p)]), own=C.reduce((a,[,c])=>a+c.own,0), oB=C.reduce((a,[,c])=>a+c.owedBank,0), oF=C.reduce((a,[,c])=>a+c.owedFam,0), pn=propNw();
  const cell=(k,v)=>`<div><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const rows=C.map(([p,c])=>{ const reg=propRegd(p), pct=p.value>0?Math.min(1,c.price/p.value):0;
    const owedTxt=c.owedBy.map(x=>`${esc(x.name)} ${shortR(x.amt)}`).join(" · "), toPay=!reg&&p.value>0&&p.value-c.price>0.5 ? p.value-c.price : 0;
    return `<div class="pcard tap" data-prop="${esc(p.id)}" role="button" tabindex="0">
      <div class="t">${esc(p.name)} <span class="pill">${esc(PROP_ST[p.status]||"")}</span>${p.nw?' <span class="pill good">In net worth</span>':""}</div>
      ${p.value>0?`<div class="s"><b>Agreement ${rs0(p.value)}</b>${!reg?` · ${pct*100<1?(pct*100).toFixed(1):Math.round(pct*100)}% paid`:""}</div>${!reg?`<div class="pmini" aria-hidden="true"><i style="width:${(pct*100).toFixed(2)}%"></i></div>`:""}`:""}
      <div class="p3c">${cell(reg||!(p.value>0)?(c.interest>0.5?"Cost with interest":"Cost"):"Paid so far", shortR(reg||!(p.value>0)?c.withInt:c.cost))}${cell("Your money in",shortR(c.own))}${cell("Still owed",c.owed>0.5?shortR(c.owed):"—")}</div>
      ${owedTxt?`<div class="s">Owed: ${owedTxt}</div>`:""}${toPay?`<div class="s">Price still to pay to the builder: ${shortR(toPay)}</div>`:""}</div>`; }).join("");
  return `<div class="sh"><h3>Properties</h3><button class="lnk" type="button" data-pact="cats">Categories ›</button></div>
    ${C.length?`<div class="card"><div class="kv" style="margin-top:0"><span>Your money in</span><b>${rs0(own)}</b><span>Still owed: banks</span><b>${rs0(oB)}</b><span>Still owed: family</span><b>${rs0(oF)}</b><span>In net worth</span><b>${rs0(pn.on)}</b></div></div><div style="height:12px"></div>`:""}
    ${rows||'<div class="list"><div class="empty">No properties yet. Add one to track what it has cost you, with loan interest.</div></div>'}
    <div class="btns" style="margin-top:12px"><button class="btn pri" type="button" data-pact="newprop">+ Add a property</button></div>
    <p class="note"><b>Your money in</b> is what has come out of your own pocket so far: payments you made, loan EMIs and interest, and repayments to family. Money that family or banks paid for you shows under <b>Still owed</b> until you repay it. To add a property to net worth, open it, tap Edit and tick "Count in net worth".</p>`;
}
function vProp(){
  const p=byId("props",S.propId); if(!p || p.deleted){ S.view="props"; return vProps(); }
  const c=propCalc(p), I=c.I, tab=S.propTab||"overview";
  const head=`<div class="monthbar"><button class="btn sm" type="button" data-acct="props" aria-label="Back to Properties">‹</button><div class="m" style="text-align:left">${esc(p.name)}</div><span class="chip">${esc(PROP_ST[p.status]||"")}</span></div>`;
  const where=[PROP_KIND[p.kind], p.place, p.since?`${p.status==="registered"||p.status==="possession"?"registered":"since"} ${fmtD(p.since)}`:""].filter(Boolean).join(" · ");
  const seg=`<div class="seg" role="group" aria-label="Property sections" style="margin-top:16px">${[["overview","Overview"],["payments","Payments"],["expected","Expected"],["loan","Loan"]].map(([k,l])=>`<button type="button" data-ptab="${k}" aria-pressed="${tab===k}">${l}</button>`).join("")}</div>`;
  const acts=`<div class="btns epfacts"><button class="btn sm pri" type="button" data-pact="add">+ Add payment</button><button class="btn sm" type="button" data-pact="pick">Pick from Transactions</button><button class="btn sm" type="button" data-pact="edit">Edit</button></div>`;
  let body="";
  if(tab==="overview"){
    const col=(k,v)=>`<div><div class="k">${k}</div><div class="hv">${v}</div></div>`;
    const nwChip=`<span class="nwchip">${p.nw?`In net worth · ${short(propNwAt(p))}`:"Not in net worth"}</span>`;
    const top=lbl=>`<div class="phead"><div class="lbl">${lbl}</div>${nwChip}</div>`;
    const pct=p.value>0?Math.min(1,c.price/p.value):0;
    const hero = c.interest>0.5 || I.l
      ? `<div class="hero epfh">${top("Cost with interest")}<div class="big">${rs0(c.withInt)}</div><div class="epfsub">${esc(where)}</div>
          <div class="hrow epfsplit">${p.value>0?col("Agreement value",rs0(p.value)):""}${col("Cost without interest",rs0(c.cost))}${col("Interest so far",rs0(c.interest))}</div></div>`
      : `<div class="hero epfh">${top(p.value>0?"Paid towards the price":"Cost so far")}<div class="big">${rs0(p.value>0?c.price:c.cost)}</div>
          ${p.value>0?`<div class="ppbar" role="img" aria-label="${(pct*100).toFixed(1)}% of the price paid"><i style="width:${(pct*100).toFixed(2)}%"></i></div><div class="epfsub">${pct*100<1?(pct*100).toFixed(1):Math.round(pct*100)}% of the agreement value paid</div>`:""}
          <div class="epfsub">${esc(where)}</div>
          <div class="hrow epfsplit">${p.value>0?col("Agreement value",rs0(p.value))+col("Price still to pay",rs0(Math.max(0,p.value-c.price))):""}${col("Total cost so far",rs0(c.cost))}</div></div>`;
    const tile=(k,v,s="")=>`<div class="tile"><div class="k">${k}</div><div class="v">${v}</div>${s?`<div class="ts">${s}</div>`:""}</div>`;
    const tiles=`<div class="tiles t4 epft">${tile("Your money in",shortR(c.own),I.l?"incl. principal repaid":"")}${tile("Paid by loans",shortR(c.paidBank+c.paidFam),[c.paidBank>0.5&&`Bank ${shortR(c.paidBank)}`,c.paidFam>0.5&&`Family ${shortR(c.paidFam)}`].filter(Boolean).join(" · "))}${tile("Still owed",c.owed>0.5?shortR(c.owed):"—",c.owedBy.length?c.owedBy.map(x=>`${esc(x.name)} ${shortR(x.amt)}`).join(" · "):"no loan")}${tile("Interest to come",I.l||c.loans.some(o=>o.come>0.5)?shortR(c.toCome):"—",I.l?"if you prepay nothing more":"")}</div>`;
    const COL={price:"var(--v1)",govt:"var(--v2)",legal:"var(--v4)",loan:"var(--v5)",broker:"var(--v6)",builder:"var(--v3)",util:"var(--v2)",setup:"var(--v4)",off:"#8a6d3b",run:"var(--vO)"};
    const lines=[]; for(const [g,lbl,how] of PG){ const cats=propCats().filter(x=>x.g===g && Math.abs(c.by[x.k]||0)>0.004 && pcHow(x)!=="int" && pcHow(x)!=="prin"); if(!cats.length) continue;
      lines.push(`<span class="tot" style="border:0;padding-top:6px"><i class="dot" style="background:${COL[g]}"></i>${esc(lbl)} <span class="pill">${PG_TAG[how]}</span></span><b class="tot" style="border:0;padding-top:6px">${rs0(cats.reduce((a,x)=>a+c.by[x.k],0))}</b>`);
      for(const x of cats) lines.push(`<span style="padding-left:16px">${esc(x.name)}</span><b>${rs0(c.by[x.k])}</b>`); }
    if(c.interest>0.5) lines.push(`<span class="tot" style="border:0;padding-top:6px"><i class="dot" style="background:var(--v3)"></i>Interest &amp; Pre-EMI <span class="pill">interest</span></span><b class="tot" style="border:0;padding-top:6px">${rs0(c.interest)}</b>`);
    const stk=[["cost",c.cost,"var(--v1)"],["int",c.interest,"var(--v3)"]].filter(x=>x[1]>0.5), tot=stk.reduce((a,x)=>a+x[1],0)||1;
    const who=[[`Your own money`, c.mine, ""]];
    if(I.l || c.bankPaid>0.5) who.push([`${I.l?esc(I.l.name):"Bank loan"}${I.l&&I.l.lender?` · ${esc(I.l.lender)}`:""}`, c.bankPaid, I.l?`still owed ${rs0(I.out)}`:""]);
    for(const o of c.loans) who.push([`${esc(o.l.name)}${o.l.lender?` · ${esc(o.l.lender)}`:""}`, o.amt, `${o.prep>0.5?`${o.prep<o.amt-0.5?`${rs0(o.prep)} of it `:""}prepaid ${I.l?esc(I.l.name):"the loan"} · `:""}${o.share<0.995?`${Math.round(o.share*100)}% of the loan · `:""}still owed ${rs0(o.owed)}${o.paid>0.5?` · repaid ${rs0(o.paid)}`:""}`]);
    const whoTot=who.reduce((a,w)=>a+w[1],0)-c.prinFunded;
    const whoCard = who.length>1 ? `<div class="card"><b>Who paid</b><div class="kv" style="margin-top:8px">${who.map(([n,v,sub])=>`<span>${n}${sub?`<br><small class="mut">${sub}</small>`:""}</span><b>${rs0(v)}</b>`).join("")}<span class="tot">Total paid for the property</span><b class="tot">${rs0(whoTot)}</b></div>
      ${c.prinFunded>0.5?`<p class="cnote">Prepayments of ${I.l?esc(I.l.name):"the property's loan"} made with other loans (${rs0(c.prinFunded)}) replace part of that loan, so they aren't added to the total again.</p>`:""}
      <p class="cnote">As you repay a loan, that repayment counts as your money in. A loan used only partly for this property counts in proportion.</p></div>` : "";
    body=`${hero}${tiles}${acts}${seg}<div class="epfb">${whoCard}<div class="card"><b>Where the money went</b>${stk.length?`<div class="stack" aria-hidden="true">${stk.map(([,v,col])=>`<i style="flex:${(v/tot).toFixed(4)};background:${col}"></i>`).join("")}</div>`:""}
      <div class="kv" style="margin-top:12px">${lines.join("")||'<span>Nothing added yet</span><b></b>'}
      <span class="tot">Cost without interest</span><b class="tot">${rs0(c.cost)}</b>${p.value>0?`<span>Agreement value</span><b>${rs0(p.value)}</b>`:""}${c.interest>0.5?`<span>Cost with interest</span><b>${rs0(c.withInt)}</b>`:""}
      ${c.off>0.5?`<span>Off-record (not in the cost)</span><b>${rs0(c.off)}</b>`:""}${c.sep>0.5?`<span>Set-up &amp; running (not in the cost)</span><b>${rs0(c.sep)}</b>`:""}
      ${c.off+c.sep>0.5?`<span class="tot">Everything spent</span><b class="tot">${rs0(c.everything)}</b>`:""}</div>
      <p class="cnote">"In cost" items make up the property's cost. Interest is added on top in "cost with interest". Set-up, running and off-record amounts are listed separately. Off-record cash isn't part of the cost you can show for tax.</p></div>
      ${p.note?`<div class="card"><b>Notes</b><p class="cnote" style="white-space:pre-wrap">${esc(p.note)}</p></div>`:""}</div>`;
    return head+body;
  }
  if(tab==="expected") return head+`${acts}${seg}<div class="epfb">${propPlanTab(p)}</div>`;
  if(tab==="payments"){
    const rows=[];
    if(I.next) rows.push({date:I.next.date, html:`<div class="row"><div class="main"><div class="t">Interest · ${mLabel(I.next.ym)} EMI <span class="pill">next · estimate</span></div><div class="s">${fmtD(I.next.date)} · ${rs0(I.next.emi)} EMI = ${rs0(I.next.int)} interest + ${rs0(I.next.prin)} principal</div></div><div class="amt mut">${rs0(I.next.int)}</div></div>`});
    for(const r of I.est) rows.push({date:r.date, html:`<div class="row"><div class="main"><div class="t">Interest · ${mLabel(r.ym)} EMI <span class="pill auto">auto</span></div><div class="s">${fmtD(r.date)} · worked out from the loan · ${rateTxt(r.rate)}%</div></div><div class="amt">${rs0(r.int)}</div></div>`});
    if(I.st){ const d=`${I.st.through}-10`;
      if(+I.st.int) rows.push({date:d, html:`<div class="row"><div class="main"><div class="t">EMI interest to ${mLabel(I.st.through)} <span class="pill auto">statement</span></div><div class="s">${esc(I.st.bank||"Bank")} loan statement of ${fmtD(I.st.asOf)}</div></div><div class="amt">${rs0(I.st.int)}</div></div>`});
      if(+I.st.pemi) rows.push({date:d, html:`<div class="row"><div class="main"><div class="t">Pre-EMI interest <span class="pill auto">statement</span></div><div class="s">${esc(I.st.bank||"Bank")} loan statement of ${fmtD(I.st.asOf)}</div></div><div class="amt">${rs0(I.st.pemi)}</div></div>`}); }
    for(const i of c.items){ const x=pcOf(i.cat), how=pcHow(x), ef=(i.funds||[]).filter(f=>f.loan!==p.loanId&&byId("loans",f.loan)), fl=ef.length, tag=i.gone?"transaction deleted":fl?ef.map(f=>`${byId("loans",f.loan).name} ${short(f.amt)}`).join(" · "):x.f==="bank"?"bank":how==="prin"?"principal":how==="off"?"off-record":how==="sep"?"separate":"yours";
      rows.push({date:i.date, html:`<div class="row tap" data-pitem="${esc(i.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(x.name)} <span class="pill">${tag}</span></div><div class="s">${fmtD(i.date)} · ${i.fund&&!i.accountId&&byId("loans",i.fund)?`from ${esc(byId("loans",i.fund).name)} (loan)${i.txnId?" · linked":""}`:i.txnId?`${esc(accName(i.accountId))} · linked`:i.accountId?esc(accName(i.accountId)):"not from an account"}${i.note||i.tnote?` · ${esc(i.note||i.tnote)}`:""}</div></div><div class="amt ${i.amt<0?"in":""}">${i.amt<0?"−":""}${rs0(Math.abs(i.amt))}</div></div>`}); }
    for(const o of c.loans) if(o.int>0.5) rows.push({date:today(), html:`<div class="row"><div class="main"><div class="t">Interest · ${esc(o.l.name)} <span class="pill auto">auto</span></div><div class="s">${Math.round(o.iShare*100)}% of the loan's interest so far</div></div><div class="amt">${rs0(o.int)}</div></div>`});
    rows.sort((a,b)=>b.date.localeCompare(a.date));
    body=`${acts}${seg}<div class="epfb"><div class="list">${rows.map(r=>r.html).join("")||'<div class="empty">No payments yet. Add one, or pick it from Transactions.</div>'}</div>
      <p class="note"><b>auto</b> is interest worked out from the loan until the next statement replaces it · <b>statement</b> is the bank's own total · <b>yours</b> is a payment you made · <b>bank</b> was paid by the loan. Tap a payment to change or unlink it.</p></div>`;
    return head+body;
  }
  /* loan */
  const l=I.l;
  if(!l){ body=`${acts}${seg}<div class="epfb"><div class="list"><div class="empty">No loan linked. If this property has a loan, add it in Plan, then pick it here.</div></div><div class="btns" style="margin-top:12px"><button class="btn sm pri" type="button" data-pact="edit">Link a loan</button></div></div>`; return head+body; }
  const x=loanSum(l), st=I.st;
  const chgItems=propCats().filter(k=>k.g==="loan" && pcHow(k)==="cost").reduce((a,k)=>a+(c.by[k.k]||0),0);
  body=`${acts}${seg}<div class="epfb"><div class="card"><b>${esc(l.name)} · ${esc(l.lender||"")}</b><div class="kv">
      <span>Still owed</span><b>${rs0(x.out)}</b><span>EMI now</span><b>${x.emiNow?rs0(x.emiNow):"—"}</b><span>Rate now</span><b>${rateTxt(x.rateNow)}%</b><span>Ends</span><b>${x.end?mLabel(x.end):"—"}</b>
      <span class="tot">Interest so far</span><b class="tot">${rs0(c.interest)}</b><span>Principal repaid so far</span><b>${rs0(c.prin)}</b><span>Interest still to come</span><b>${rs0(I.toCome)}</b></div>
      <div class="btns" style="margin-top:12px"><button class="btn sm" type="button" data-loan="${esc(l.id)}">Open the loan</button><button class="btn sm" type="button" data-pact="stmt">Load loan statement (PDF)</button></div>
      <input type="file" id="propStmt" accept="application/pdf,.pdf" hidden></div>
    ${st?`<div class="card"><b>From the ${esc(st.bank||"bank")} statement of ${fmtD(st.asOf)}</b><div class="kv">
      <span>EMI interest to ${mLabel(st.through)}</span><b>${rs0(st.int)}</b><span>Pre-EMI interest</span><b>${rs0(st.pemi)}</b><span>Principal repaid</span><b>${rs0(st.prin)}</b>
      <span>Charges (processing, admin, CERSAI)</span><b>${rs0(st.chg)}</b><span>Principal outstanding</span><b>${rs0(st.out)}</b></div>
      ${Math.abs(chgItems-(+st.chg||0))>1?`<p class="cnote">Bank charges you've added here come to ${rs0(chgItems)}; the statement shows ${rs0(st.chg)}. Check the Loan &amp; bank payments.</p>`:""}
      ${Math.abs(x.out-(+st.out||0))>1 && !I.est.length?`<p class="cnote">The app's loan shows ${rs0(x.out)} owed; the statement shows ${rs0(st.out)}. Use "Match bank statement" on the loan to line them up.</p>`:""}</div>`
      :`<div class="card"><p class="cnote" style="margin:0">No statement loaded. Interest is worked out from the loan's rate and EMIs. Load the bank's loan statement to use the bank's exact figures.</p></div>`}
    ${I.est.length?`<p class="note">After the statement: ${I.est.length} EMI${I.est.length===1?"":"s"} split by the app (${rs0(I.estInt)} interest). They're replaced when you load a newer statement.</p>`:""}</div>`;
  return head+body;
}

/* ---------- forms ---------- */
function propForm(p){
  const isNew=!p || !p.id; p=p||{kind:"plot", status:"registered"};
  const loans=live("loans").filter(l=>bankOf(l));
  openSheet(isNew?"Add a property":"Edit property", `
    ${field(["pn","Name","text",{value:p.name||"",ph:"e.g. Green Meadows flat"}])}
    <div class="grid2">${field(["pk","Type","select",{value:p.kind,options:Object.entries(PROP_KIND)}])}${field(["ps","Status","select",{value:p.status,options:Object.entries(PROP_ST)}])}</div>
    ${field(["pp","Where","text",{value:p.place||"",ph:"e.g. Plot 21, Chunchaguppe"}])}
    <div class="grid2">${field(["pd","Booked / registered on","date",{value:p.since||""}])}${field(["pv","Agreement value (₹)","text",{value:p.value?(+p.value).toLocaleString("en-IN"):"",ph:"e.g. 2,14,02,419",hint:"Optional · shows how much of the price is paid"}])}</div>
    <label class="chk" style="display:flex;gap:10px;align-items:flex-start;margin:4px 0 12px"><input type="checkbox" id="f_pnw" ${p.nw?"checked":""} style="margin-top:3px"><span><b>Count in net worth</b><br><span class="mut" style="font-size:12.5px">Once registered: the current value below, or else the agreement value. Before that: only the price paid so far.</span></span></label>
    <div class="grid2">${field(["pcur","Current value (₹)","text",{value:p.cur?(+p.cur).toLocaleString("en-IN"):"",ph:"Optional",hint:"e.g. guidance value or an estimate"}])}${field(["pcd","Value as of","date",{value:p.curDate||""}])}</div>
    ${field(["pl","Loan for this property","select",{value:p.loanId||"",options:[["","No loan"],...loans.map(l=>[l.id,`${l.name}${l.lender?` · ${l.lender}`:""}`])],hint:"Its interest is added to the property by itself"}])}
    ${field(["pnote","Notes","textarea",{value:p.note||""}])}
    ${btnRow(isNew,"Add property")}`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    const pc=$("#f_pcur"); pc.setAttribute("inputmode","numeric"); pc.addEventListener("input",()=>{ const raw=pc.value.replace(/[^\d]/g,""); pc.value=raw?(+raw).toLocaleString("en-IN"):""; if(raw && !$("#f_pcd").value) $("#f_pcd").value=today(); });
    const pv=$("#f_pv"); pv.setAttribute("inputmode","numeric");
    const pvHint=()=>{ const n=parseFloat(pv.value.replace(/[^\d.]/g,""))||0; pv.parentNode.querySelector(".hint").textContent = n>0 ? `${rs0(n)} · ${n>=1e7?(n/1e7).toFixed(2)+" crore":n>=1e5?(n/1e5).toFixed(2)+" lakh":"Optional"}` : "Optional · shows how much of the price is paid"; };
    pv.addEventListener("input",()=>{ const raw=pv.value.replace(/[^\d]/g,""), at=pv.value.length-pv.selectionStart; pv.value=raw?(+raw).toLocaleString("en-IN"):""; const c=Math.max(0,pv.value.length-at); try{ pv.setSelectionRange(c,c); }catch(e){} pvHint(); }); pvHint();
    const dl=s.querySelector("#dl"); if(dl) dl.onclick=()=>askConfirm(`Delete "${p.name}"? Its payment list goes too; your transactions stay as they are.`,"Delete",()=>{ for(const i of live("propItems").filter(i=>i.prop===p.id)){ i.deleted=true; stamp(i); } del("props",p.id); S.accTab="props"; go("accounts"); toast("Property deleted"); });
    s.querySelector("#sv").onclick=()=>{ const name=val("pn"); if(!name){ toast("Give the property a name."); return; }
      const o={...p, id:p.id||uid(), name, kind:val("pk"), status:val("ps"), place:val("pp"), since:val("pd"), value:parseFloat(val("pv").replace(/[^\d.]/g,""))||0, loanId:val("pl"), nw:$("#f_pnw").checked, cur:parseFloat(val("pcur").replace(/[^\d.]/g,""))||0, curDate:val("pcd"), note:$("#f_pnote").value.trim()};
      if(o.loanId!==p.loanId) delete o.stmt;
      closeModal(); upsert("props",o); if(isNew){ S.propId=o.id; S.propTab="overview"; go("prop"); } toast(isNew?"Property added":"Saved"); };
  });
}
const pcOpts = (g, keep) => propCats().filter(c=>c.g===g && (!c.hidden || c.k===keep)).map(c=>[c.k,c.name]);
function propCatField(cat){
  const g=pcOf(cat||"token").g;
  return `<div class="f"><label>Group</label><div class="fychips" role="group" aria-label="Group" id="pgChips" style="margin:0;flex-wrap:wrap;overflow:visible;gap:6px">${PG.map(([k,l])=>`<button type="button" class="chip fchip ${k===g?"":"mute"}" data-g="${k}" aria-pressed="${k===g}">${esc(l)}</button>`).join("")}</div></div>
    ${field(["pc","What for","select",{value:cat||"",options:pcOpts(g,cat)}])}<p class="note" id="pc_how" style="margin-top:-4px"></p>`;
}
function propCatMount(s){
  const how=()=>{ const c=pcOf(val("pc")), h=pcHow(c); $("#pc_how").textContent = h==="prin" ? "Not added to the cost (the loan already paid the price). Pick the loan it came from in Paid from, to show who really paid." : c.f==="bank" ? "Counts in the cost, as paid by the bank, not from your money." : h==="int" ? "Counts as interest: in 'cost with interest', not in the cost." : h==="off" ? "Listed separately as off-record; not part of the cost for tax." : h==="sep" ? "Listed separately; not part of the property's cost." : "Counts in the property's cost."; };
  s.querySelectorAll("#pgChips button").forEach(b=>b.onclick=()=>{ s.querySelectorAll("#pgChips button").forEach(x=>{ const on=x===b; x.setAttribute("aria-pressed",on); x.classList.toggle("mute",!on); });
    $("#f_pc").innerHTML=pcOpts(b.dataset.g).map(([k,l])=>`<option value="${esc(k)}">${esc(l)}</option>`).join(""); how(); });
  $("#f_pc").onchange=how; how();
}
/* the transaction category that best fits a property category (Property › Legal, Property › Stamp Duty, ...) */
function propTxnCat(k){
  const C=live("categories").filter(c=>c.kind==="expense"), top=C.find(c=>!c.parentId && /^property$/i.test(c.name)), subs=top?C.filter(c=>c.parentId===top.id):[];
  const c=pcOf(k);
  if(k==="lprepay"){ const e=C.find(x=>!x.parentId && /^loan emi$/i.test(x.name)), h=e && C.find(x=>x.parentId===e.id && /home loan/i.test(x.name)); if(h||e) return (h||e).id; }
  const want = k==="motd"?/moe|motd|bank/i : k==="legoth"?/porter|courier|legal/i : c.g==="legal"?/legal/i : k==="stamp"||k==="regfee"||k==="cess"||k==="estamp"?/stamp|regist/i : c.g==="loan"?/bank|loan/i : c.g==="price"?/plot|flat|price/i : k==="khata"?/khata|plot/i : null;
  const s=want && subs.find(x=>want.test(x.name)); return (s||top||{}).id || "";
}
function propItemForm(p, it, pre){
  const isNew=!it; it=it||{cat:"token", date:today(), ...(pre||{})};
  const linked=!!it.txnId, t=linked && byId("txns",it.txnId), live1=t&&!t.deleted;
  const banks=live("accounts").filter(a=>!a.hidden);
  /* where the loan money is recorded: on the transaction when linked, else on the payment */
  const f0 = linked ? (live1 && t.type==="expense" && !t.fromLoan ? fundsOf(t) : null) : ((it.funds||[]).length ? it.funds : it.loanId && it.accountId ? [{loan:it.loanId, amt:it.loanAmt??""}] : []);
  const legacy = linked ? (live1 && t.fromLoan) : (it.loanId && !it.accountId && !isNew);
  openSheet(isNew?"Add payment":"Payment", `
    ${linked?`<div class="card" style="margin:0 0 12px"><div class="kv" style="margin:0"><span>Linked transaction</span><b>${live1?`${rs0(t.amount)} · ${fmtD(t.date)}`:"deleted"}</b>${live1?`<span>${esc(t.fromLoan?fromLoanName(t):accName(t.accountId))}</span><b>${esc(catName(t.categoryId))}</b>`:""}</div><p class="cnote">Amount, date and account come from the transaction. Change them there.</p></div>`:""}
    ${field(["pprop","Property","select",{value:p.id,options:propList().map(x=>[x.id,x.name])}])}
    ${propCatField(it.cat)}
    ${linked?"":`<div class="grid2">${field(["pa","Amount (₹)","number",{value:it.amt??"",step:"0.01"}])}${field(["pdt","Date","date",{value:it.date||today()}])}</div>
    ${field(["pacc","Paid from","select",{value:legacy?"~"+it.loanId:(it.accountId??((mainAcc()||{}).id||"")),options:[["","Not from an account (cash in hand, paid by someone else)"],...banks.map(a=>[a.id,a.name]),...(legacy?legacyLoanOpt(it.loanId):[])]}])}`}
    ${f0?fundsBox():""}
    ${field(["pnt","Note","text",{value:it.note||"",ph:"Optional"}])}
    ${isNew?`<label class="chk" style="display:flex;gap:10px;align-items:flex-start;margin:4px 0 8px"><input type="checkbox" id="f_ptx" checked style="margin-top:3px"><span>Also add it to Transactions, so it counts in your spending and comes off the account's balance</span></label>
      <div id="ptxCat">${field(["categoryId","Transaction category","select",{value:propTxnCat(it.cat),options:live("categories").filter(c=>c.kind==="expense").map(c=>[c.id,catName(c.id)])}])}
      <label class="opt" style="margin-bottom:12px"><input type="checkbox" id="f_phist"><div><b>Already in my balances</b><span>For a past payment your account balance already includes, so it isn't taken off again.</span></div></label></div>`:""}
    <div class="btns"><button class="btn pri" id="sv" type="button">${isNew?"Add payment":"Save"}</button>${isNew?"":`<button class="btn danger" id="dl" type="button">${linked?"Unlink":"Delete"}</button>`}${linked&&live1?'<button class="btn" id="otx" type="button">Open transaction</button>':""}<button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    propCatMount(s);
    s.querySelector("#cx").onclick=closeModal;
    if(s.querySelector("#f_categoryId")){ const fit=()=>{ const v=propTxnCat(val("pc")), sel=$("#f_categoryId"); if(v && sel.value!==v){ sel.value=v; sel.dispatchEvent(new Event("change",{bubbles:true})); } };
      $("#f_pc").addEventListener("change",fit); s.querySelectorAll("#pgChips button").forEach(b=>b.addEventListener("click",fit)); }
    const FU = f0 ? fundsUI($("#w_funds"), f0, ()=>linked ? +t.amount : (parseFloat(val("pa"))||0)) : null;
    if(FU && $("#f_pa")) $("#f_pa").addEventListener("input", ()=>FU.refresh());
    const ptx=s.querySelector("#f_ptx"); if(ptx){ const sync=()=>{ $("#ptxCat").hidden=!ptx.checked || !val("pacc"); }; ptx.onchange=sync; $("#f_pacc").addEventListener("change",sync); sync(); }
    const ot=s.querySelector("#otx"); if(ot) ot.onclick=()=>{ closeModal(); txnForm({...t}); };
    const dl=s.querySelector("#dl"); if(dl) dl.onclick=()=>{ closeModal(); del("propItems",it.id); toast(linked?"Unlinked. The transaction is still in Transactions.":"Payment deleted"); };
    s.querySelector("#sv").onclick=()=>{
      const cat=val("pc"), prop=val("pprop"), note=val("pnt"); if(!cat){ toast("Pick what the payment was for."); return; }
      let fs=[]; if(FU){ try{ fs=FU.get(); }catch(e){ toast(e.message); return; } }
      if(linked){ closeModal();
        if(FU){ const tx={...t}; delete tx.fundLoan; delete tx.fundAmt; if(fs.length) tx.funds=fs; else delete tx.funds; if(JSON.stringify(tx.funds||[])!==JSON.stringify(t.funds||[]) || t.fundLoan) put("txns",tx); }
        upsert("propItems",{...byId("propItems",it.id), prop, cat, note}); toast("Saved"); return; }
      const amt=parseFloat(val("pa")), date=val("pdt"), acc=val("pacc"); if(!amt || !date){ toast("Enter the amount and date."); return; }
      if(isNew && ptx && ptx.checked && acc){
        const tx={id:uid(), type:"expense", amount:Math.abs(amt), date, accountId:acc, categoryId:val("categoryId"), note:`${byId("props",prop).name} · ${pcOf(cat).name}${note?` · ${note}`:""}`,
          ...(fs.length?{funds:fs}:{}), ...($("#f_phist").checked?{hist:true}:{})};
        put("txns",tx); closeModal(); upsert("propItems",{id:uid(), prop, cat, txnId:tx.id, note, amt:tx.amount, date}); if(pre&&pre.onSaved) pre.onSaved(); toast("Payment added, and in Transactions"); return; }
      const leg=acc.startsWith("~");
      closeModal(); upsert("propItems",{...(isNew?{}:byId("propItems",it.id)), id:it.id||uid(), prop, cat, amt, date, accountId:leg?"":acc, loanId:leg?acc.slice(1):"", loanAmt:null, funds:leg?[]:fs, note}); if(isNew&&pre&&pre.onSaved) pre.onSaved(); toast(isNew?"Payment added":"Saved");
    };
  });
}
/* link payments that are already in Transactions */
function propPickForm(p){
  const used=new Set(live("propItems").map(i=>i.txnId).filter(Boolean));
  const pool=live("txns").filter(t=>(t.type==="expense"||t.type==="income"||t.type==="transfer"||t.type==="loan") && !used.has(t.id)).sort((a,b)=>b.date.localeCompare(a.date));
  const word=t=>[t.note, catName(t.categoryId), accName(t.accountId)].join(" ").toLowerCase();
  openSheet(`Pick from Transactions · ${p.name}`, `
    ${field(["pq","Search","text",{ph:"Word, amount or year, e.g. legal, 183659, 2024"}])}
    <div class="list" id="pkList" style="max-height:44vh;overflow:auto"></div>
    <p class="note" id="pkCount"></p>
    ${propCatField("lawyer")}
    <div class="btns"><button class="btn pri" id="sv" type="button">Link ticked</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    propCatMount(s); const sel=new Set();
    const draw=()=>{ const q=val("pq").toLowerCase().replace(/,/g,""), n=parseFloat(q);
      const hit=pool.filter(t=>!q || word(t).includes(q) || t.date.includes(q) || (n>0 && Math.abs(+t.amount-n)<1)).slice(0,80);
      $("#pkList").innerHTML=hit.map(t=>`<label class="row" style="cursor:pointer"><input type="checkbox" data-id="${esc(t.id)}" ${sel.has(t.id)?"checked":""} style="flex:none"><div class="main"><div class="t">${esc(t.note||catName(t.categoryId))}</div><div class="s">${fmtD(t.date)} · ${esc(t.fromLoan?fromLoanName(t):accName(t.accountId))} · ${esc(catName(t.categoryId))}</div></div><div class="amt ${t.type==="income"?"in":""}">${t.type==="income"?"−":""}${rs0(t.amount)}</div></label>`).join("")||'<div class="empty">Nothing matches.</div>';
      $("#pkList").querySelectorAll("input").forEach(c=>c.onchange=()=>{ c.checked?sel.add(c.dataset.id):sel.delete(c.dataset.id); cnt(); }); cnt(); };
    const cnt=()=>{ $("#pkCount").textContent = sel.size ? `${sel.size} ticked. They all get the category below; you can change each one later. Cashback or refunds count as minus.` : "Tick the transactions that belong to this property."; };
    $("#f_pq").addEventListener("input",draw); draw();
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#sv").onclick=()=>{ if(!sel.size){ toast("Tick at least one transaction."); return; } const cat=val("pc");
      for(const id of sel){ const t=byId("txns",id); put("propItems",{id:uid(), prop:p.id, cat, txnId:id, amt:+t.amount, date:t.date}); }
      closeModal(); S.propTab="payments"; changed(); toast(`${sel.size} payment${sel.size===1?"":"s"} linked`); };
  });
}
/* rename, hide or add categories */
function propCatsSheet(){
  const cfg=propCfg(), C=propCats();
  openSheet("Property categories", `${PG.map(([g,l,how])=>`<div class="sh" style="margin-top:12px"><h3>${esc(l)} <span class="pill">${PG_TAG[how]}</span></h3></div>
    <div class="list">${C.filter(c=>c.g===g).map(c=>`<div class="row"><div class="main"><input type="text" data-nm="${esc(c.k)}" value="${esc(c.name)}" aria-label="Name" style="width:100%;border:0;background:transparent;font:inherit;color:inherit;padding:0">${c.f==="int"?'<div class="s">Counts as interest</div>':c.f==="bank"?'<div class="s">Paid by the bank loan</div>':""}</div>
      <label class="s" style="display:flex;gap:6px;align-items:center;white-space:nowrap"><input type="checkbox" data-hd="${esc(c.k)}" ${c.hidden?"":"checked"}>Show</label></div>`).join("")}
      <div class="row"><input type="text" data-new="${g}" placeholder="+ Add a category here" aria-label="New category in ${esc(l)}" style="flex:1;border:0;background:transparent;font:inherit;color:inherit;padding:0"></div></div>`).join("")}
    <div class="btns" style="margin-top:12px"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#sv").onclick=()=>{ const names={}, hide=[], custom=[...(cfg.custom||[])];
      s.querySelectorAll("[data-nm]").forEach(i=>{ const c=C.find(x=>x.k===i.dataset.nm), v=i.value.trim(); if(v && v!==c.base) names[c.k]=v; });
      s.querySelectorAll("[data-hd]").forEach(i=>{ if(!i.checked) hide.push(i.dataset.hd); });
      s.querySelectorAll("[data-new]").forEach(i=>{ const v=i.value.trim(); if(v) custom.push({k:"c"+uid(), g:i.dataset.new, name:v}); });
      closeModal(); upsert("props",{...cfg, names, hide, custom}); toast("Categories saved"); };
  });
}
/* ---------- loan statement (ICICI-style PDF): the bank's totals of interest, Pre-EMI, principal and charges ---------- */
function propStmtParse(lines){
  const MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const dt=s=>{ const m=String(s).match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/); if(!m) return ""; const y=m[3].length===2?2000+ +m[3]:+m[3]; return `${y}-${pad(MON[m[2].toLowerCase()])}-${pad(+m[1])}`; };
  const num=s=>parseFloat(String(s).replace(/[(),]/g,""))||0, parts=l=>l.split(" | ").map(x=>x.trim());
  const isNum=x=>/^\(?[\d,]+\.\d{2}\)?$/.test(x);
  const st={bank:/icici/i.test(lines.slice(0,5).join(" "))?"ICICI":""};
  for(const l of lines){ let m;
    if(!st.asOf && (m=l.match(/Loan Account Details As on (\d{1,2}-\w{3}-\d{2,4})/i))) st.asOf=dt(m[1]);
    if(!st.acct && (m=l.match(/Statement for ([A-Z0-9]+)/i))) st.acct="…"+m[1].slice(-4);
    if(/^Debits \|/.test(l)){ const p=parts(l).slice(1).filter(isNum).map(num); if(p.length>=7){ st.prin=p[0]; st.int=p[1]; st.pemi=p[2]; st.chg=p[5]; } }
    if((m=l.match(/^(\d{1,2}-\w{3}-\d{2,4}) \| [^|]+ \| (EMI|Pre-EMI) \| Due for/))){ const d=dt(m[1]); if(!st.through || ymOf(d)>st.through) st.through=ymOf(d); } }
  const k=lines.findIndex(l=>/^Current OS/.test(l));
  if(k>=0) for(const l of lines.slice(k+1,k+8)){ const p=parts(l); if(p.length>=8 && p.every(isNum)){ st.out=num(p[6]); break; } }
  if(!st.asOf || st.int==null || !st.through) throw new Error("not a loan statement");
  return st;
}
async function propStmtLoad(p, file){
  let st; try{ st=propStmtParse(await epfPdfLines(file)); } catch(e){ console.warn("loan statement", e); toast("Couldn't read that PDF as a loan statement."); return; }
  const old=p.stmt;
  openSheet("Loan statement", `<div class="kv" style="margin-top:0"><span>Statement date</span><b>${fmtD(st.asOf)}</b><span>Loan account</span><b>${esc(st.acct||"—")}</b><span>Last EMI in it</span><b>${mLabel(st.through)}</b>
    <span>EMI interest</span><b>${rs0(st.int)}</b><span>Pre-EMI interest</span><b>${rs0(st.pemi)}</b><span>Principal repaid</span><b>${rs0(st.prin)}</b><span>Charges</span><b>${rs0(st.chg)}</b><span>Principal outstanding</span><b>${st.out!=null?rs0(st.out):"—"}</b></div>
    <p class="note">${old?`Replaces the statement of ${fmtD(old.asOf)}. `:""}Interest up to ${mLabel(st.through)} will use these figures; later EMIs are worked out from the loan.</p>
    <div class="btns"><button class="btn pri" id="sv" type="button">Use these figures</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#sv").onclick=()=>{ if(old && old.asOf>st.asOf){ toast("That statement is older than the one already loaded."); return; } closeModal(); upsert("props",{...byId("props",p.id), stmt:st}); toast("Statement figures saved"); };
  });
}


/* KP Money Planner, moved over unchanged. Tidied into typed modules later in Milestone 2. */
/* ==========================================================================
   Automatic prices (hosted app only). A daily job on your Firebase saves the official price lists:
   AMFI (mutual funds), NPS Trust (NPS schemes), NSE with BSE as backup (Indian shares) and Alpha Vantage (US shares, $ rate).
   This device reads them, picks out your linked holdings and updates their price. Your holdings never leave the
   encrypted vault, except the list of US tickers (names only), which the job needs to look them up.
   A price you type yourself is kept until a newer official price arrives.
   ========================================================================== */
const PX_SRC = {mf:"AMFI", nps:"NPS Trust", stk:"NSE / BSE", us:"Alpha Vantage"};
const PX_WHAT = {mf:"Mutual funds", nps:"NPS", stk:"Indian shares", us:"US shares"};
const pxKind = type => type==="Mutual Fund" ? "mf" : type==="Stock" ? "stk" : type==="US Stocks" ? "us" : type==="NPS" ? "nps" : null;
const pxOn = () => HOSTED && !!(H.fb && H.user && H.key);
const P = {tables:{}, names:{}, status:null, at:0, busy:null, watch:null};
const PX_HIST_MAX = 1300;      /* about five years of trading days, per holding */
const PX_JUMP = 0.2;           /* a change bigger than 20% from the last official price is flagged (a split, bonus or wrong price) */
function pxRows(text){ const o={}; for(const l of String(text||"").split("\n")){ const [k,p,d]=l.split("\t"); if(k && +p>0) o[k]={p:+p, d}; } return o; }
const pxUnzip = async b64 => b64 ? await gunzip(fromB64(b64)) : "";
async function pxDoc(...path){ const {fs}=H.fb; const s=await fs.getDoc(fs.doc(H.db, ...path)); return s.exists() ? s.data() : null; }
/* which sources this data needs: only those with a linked holding */
function pxNeeded(){ const need=new Set(); for(const h of live("holdings")){ const k=pxKind(h.type); if(k==="nps"){ if(npsLines(h)) need.add("nps"); } else if(k && (h.px || (k==="mf" && h.isin))) need.add(k); } return need; }
async function pxLoad(force){
  if(!pxOn()) return false;
  if(!force && Date.now()-P.at < 3*3600e3) return true;
  if(P.busy) return P.busy;
  P.busy=(async()=>{
    try{
      P.status=await pxDoc("priceStatus","last");
      for(const src of pxNeeded()){
        const d=await pxDoc("prices",src); if(!d) continue;
        const t={date:d.date, at:d.at, from:d.from, n:d.n, rows:pxRows(await pxUnzip(d.gz))};
        if(src==="us" && d.hist) t.hist=await pxUnzip(d.hist);
        P.tables[src]=t;
      }
      P.at=Date.now(); return true;
    }catch(e){ console.warn("prices", e); return false; }
    finally{ P.busy=null; }
  })();
  return P.busy;
}
/* earlier days (up to 30) from the saved day files, so a holding's price history has no gaps when the app wasn't opened */
async function pxBackfill(src, after){
  try{ const {fs}=H.fb; const q=fs.query(fs.collection(H.db,"prices",src,"days"), fs.where("date",">",after), fs.orderBy("date"));
    const out=[]; const qs=await fs.getDocs(q); for(const d of qs.docs){ const x=d.data(); out.push([x.date, pxRows(await pxUnzip(x.gz))]); } return out; }
  catch(e){ console.warn("price history", e); return []; }
}
const pxKey = px => String(px||"").split(":").slice(1).join(":");
function pxMergeHist(old, add){ const m=new Map((old||[]).map(([d,p])=>[d,p])); for(const [d,p] of add) if(d && p>0) m.set(d,p); return [...m.entries()].sort((a,b)=>a[0]<b[0]?-1:1).slice(-PX_HIST_MAX); }
/* one price onto one record (a holding, or one NPS scheme line); returns true if it changed */
function pxSet(o, r, src){
  if(!r) return false;
  if(o.priceManual && o.priceDate && o.priceDate>=r.d) return false;             /* your own price is newer: keep it */
  if(o.priceAuto===r.d && +o.price===r.p) return false;
  if(o.priceAuto && o.priceAuto>r.d) return false;                                /* never go back to an older price */
  const prev=+o.price||0;
  if(o.priceAuto && prev>0 && Math.abs(r.p/prev-1)>PX_JUMP) o.priceJump={from:prev, to:r.p, d:r.d}; else if(o.priceJump && o.priceJump.d!==r.d) delete o.priceJump;
  o.price=r.p; o.priceDate=r.d; o.priceAuto=r.d; o.priceSrc=PX_SRC[src]; delete o.priceManual;
  return true;
}
async function pxApply(){
  if(!pxOn() || !Object.keys(P.tables).length) return 0;
  /* mutual funds added from a CAS carry the ISIN; link them to AMFI's scheme code once */
  const mfNeed=live("holdings").filter(h=>h.type==="Mutual Fund" && !h.px && h.isin);
  if(mfNeed.length){ const names=await pxNames("mf")||[];
    for(const h0 of mfNeed){ const hit=names.find(x=>String(x.isin||"").split(",").includes(h0.isin)); if(hit) put("holdings", {...h0, px:"mf:"+hit.k}); } }
  /* NPS schemes added from a statement carry the scheme name; link them to NPS Trust's scheme id once */
  const npsNeed=live("holdings").filter(h=>h.type==="NPS" && npsLines(h) && h.npsLines.some(l=>!l.px && l.nm));
  if(npsNeed.length){ const names=await pxNames("nps")||[], norm=s=>String(s||"").toUpperCase().replace(/\s+POP$/,"").replace(/\s+/g," ").trim();
    for(const h0 of npsNeed){ const h=JSON.parse(JSON.stringify(h0)); let ch=false;
      for(const l of h.npsLines) if(!l.px && l.nm){ const w=norm(l.nm), hit=names.find(x=>norm(x.n)===w) || names.find(x=>norm(x.n).includes(w)||w.includes(norm(x.n))); if(hit){ l.px="nps:"+hit.k; ch=true; } }
      if(ch) put("holdings", h); } }
  let n=0; const back={};
  for(const h0 of live("holdings")){
    const src=pxKind(h0.type); if(!src) continue;
    const lines=src==="nps" ? npsLines(h0) : null; if(src!=="nps" && !h0.px) continue; if(src==="nps" && !lines) continue;
    const t=P.tables[src]; if(!t) continue;
    const h=JSON.parse(JSON.stringify(h0)); let ch=false;
    if(lines){ for(const l of h.npsLines){ const r=t.rows[pxKey(l.px)]; if(r){ if(pxSet(l, r, src)) ch=true; l.hist=pxMergeHist(l.hist, [[r.d,r.p]]); } } }
    else {
      const r=t.rows[pxKey(h.px)];
      if(r && pxSet(h, r, src)) ch=true;
      if(src==="us"){ const fx=t.rows.USDINR; if(fx && h.ccy==="USD" && (h.fxAuto!==fx.d || +h.fx!==fx.p) && !(h.fxManual && h.fxDate>=fx.d)){ h.fx=fx.p; h.fxDate=fx.d; h.fxAuto=fx.d; delete h.fxManual; ch=true; } }
      if(r){ const before=(h.navHist||[]).length, last=before?h.navHist[before-1][0]:""; let add=[[r.d,r.p]];
        if(src==="us" && t.hist && (!last || last<r.d)){ const k=pxKey(h.px)+"\t"; add=add.concat(t.hist.split("\n").filter(l=>l.startsWith(k)).map(l=>{ const [,p,d]=l.split("\t"); return [d,+p]; }).filter(([d])=>!last||d>last)); }
        else if(src!=="us" && (!last || last<r.d)){ (back[src]=back[src]||[]).push([h, last||"2000-01-01"]); }
        h.navHist=pxMergeHist(h.navHist, add); if(h.navHist.length!==before) ch=true; }
    }
    if(ch){ const v=holdingSum(h).value; h.history=(h.history||[]).filter(p=>p.date!==today()).concat({date:today(), value:Math.round(v*100)/100}).slice(-60); put("holdings", h); n++; }
  }
  /* fill gaps in price history from the day files */
  for(const [src, list] of Object.entries(back)){
    const after=list.reduce((m,[,d])=>d<m?d:m, list[0][1]); const days=await pxBackfill(src, after); if(!days.length) continue;
    for(const [h0] of list){ const h=byId("holdings",h0.id); if(!h) continue; const k=pxKey(h.px), add=days.map(([d,rows])=>rows[k]?[d,rows[k].p]:null).filter(Boolean);
      if(add.length){ const before=(h.navHist||[]).length; h.navHist=pxMergeHist(h.navHist, add); if(h.navHist.length!==before) put("holdings", h); } }
  }
  if(n) changed();
  return n;
}
/* the job needs the US tickers you hold (names only, no amounts) */
async function pxWatch(){
  if(!pxOn()) return;
  const us=[...new Set(live("holdings").filter(h=>h.type==="US Stocks" && /^us:/.test(h.px||"")).map(h=>pxKey(h.px)))].sort();
  try{ if(P.watch===null){ const d=await pxDoc("priceWatch",H.user.uid); P.watch=(d&&d.us||[]).slice().sort().join(","); }
    if(P.watch===us.join(",")) return;
    const {fs}=H.fb; await fs.setDoc(fs.doc(H.db,"priceWatch",H.user.uid), {us, at:new Date().toISOString()}); P.watch=us.join(",");
  }catch(e){ console.warn("price watch", e); }
}
async function hPrices(force){ if(!pxOn()) return; const ok=await pxLoad(force); if(ok) await pxApply(); pxWatch(); if(S.view==="accounts") render(); }
async function pxNames(src){
  if(P.names[src]) return P.names[src];
  if(!pxOn()) return null;
  const d=await pxDoc("priceNames",src); if(!d) return (P.names[src]=[]);
  const txt=await pxUnzip(d.gz);
  return (P.names[src]=txt.split("\n").filter(Boolean).map(l=>{ const [k,n,a,b]=l.split("\t"); return src==="mf"?{k,n,isin:a}:src==="nps"?{k,n,f:a}:{k,n,s:a,x:b}; }));
}
async function pxPrice(src, key){ await pxLoadSrc(src); const t=P.tables[src]; return t ? t.rows[key]||null : null; }
async function pxLoadSrc(src){ if(P.tables[src] || !pxOn()) return; try{ const d=await pxDoc("prices",src); if(d) P.tables[src]={date:d.date, at:d.at, from:d.from, n:d.n, rows:pxRows(await pxUnzip(d.gz)), hist:src==="us"&&d.hist?await pxUnzip(d.hist):null}; }catch(e){} }
function pxSearch(list, q){
  q=q.trim().toLowerCase(); if(q.length<2) return [];
  const toks=q.split(/\s+/), exact=list.filter(x=>x.k.toLowerCase()===q || (x.s||"").toLowerCase()===q || (x.isin||"").toLowerCase().includes(q));
  const hits=list.filter(x=>{ const t=`${x.n} ${x.s||""} ${x.k}`.toLowerCase(); return toks.every(w=>t.includes(w)); });
  return [...new Set([...exact, ...hits])].slice(0, 30);
}
const pxWhen = iso => { if(!iso) return ""; const d=new Date(iso); return isNaN(d) ? "" : `${dLabel(new Date(d.getTime()+5.5*3600e3).toISOString().slice(0,10))}, ${d.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit",timeZone:"Asia/Kolkata"})}`; };
/* a short line on the Investments tab, and the status sheet behind it */
function pxLine(){
  if(!HOSTED) return "";
  const need=[...pxNeeded()];
  const st=P.status && P.status.runs || {};
  const bad=need.filter(s=>st[s] && !st[s].ok);
  const old=need.filter(s=>{ const t=P.tables[s]; return t && t.date && Math.round((new Date(today()+"T00:00")-new Date(t.date+"T00:00"))/864e5)>4; });
  const txt = !need.length ? "Automatic prices: link a fund, share or NPS scheme to update it daily"
    : bad.length||old.length ? `Prices: ${[...new Set([...bad,...old])].map(s=>PX_WHAT[s]).join(", ")} not updating` : `Prices updated ${pxWhen(P.status&&P.status.at)||"daily"}`;
  return `<button class="pxline ${bad.length||old.length?"warn":""}" type="button" id="pxStatus"><span>${esc(txt)}</span><span class="chev" aria-hidden="true"></span></button>`;
}
function pxStatusSheet(){
  const st=P.status && P.status.runs || {};
  const row=src=>{ const r=st[src], t=P.tables[src];
    const state = !r ? '<span class="pill">Not run yet</span>' : r.ok ? '<span class="pill">OK</span>' : '<span class="pill bad">Failed</span>';
    return `<div class="row"><div class="main"><div class="t">${PX_WHAT[src]} ${state}</div><div class="s">${esc(PX_SRC[src])}${r&&r.date?` · prices of ${dLabel(r.date)}`:t&&t.date?` · prices of ${dLabel(t.date)}`:""}</div>${r?`<div class="s s2">${esc(r.msg||"")}${r.at?` · ${esc(pxWhen(r.at))}`:""}</div>`:""}</div></div>`; };
  openSheet("Automatic prices", `
    <p class="note" style="margin-top:0">Official prices are fetched every day at about 9:20 am and 11:20 pm. Mutual funds: AMFI. NPS: NPS Trust. Indian shares: NSE, with BSE as backup. US shares and the dollar rate: Alpha Vantage (morning only). If a source fails or looks wrong, the last good price is kept.</p>
    <div class="list">${["mf","nps","stk","us"].map(row).join("")}</div>
    <p class="note">To link a holding, open it and use <b>Automatic price</b>. A price you type is kept until a newer official price arrives.</p>
    <div class="btns"><button class="btn pri" type="button" id="pxNow" data-lbl="Update prices now">Update prices now</button><button class="btn" type="button" id="cx">Close</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    const b=s.querySelector("#pxNow");
    b.onclick=async()=>{ if(!pxOn()){ toast("Sign in and sync first."); return; } b.disabled=true; b.textContent="Updating… (up to a few minutes)";
      try{ const fx=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js");
        const fn=fx.httpsCallable(fx.getFunctions(H.appI, H.cfg.aiRegion||"asia-south1"), "refreshPricesNow", {timeout:560000});
        await fn({}); P.tables={}; await hPrices(true); closeModal(); pxStatusSheet(); toast("Prices updated"); }
      catch(e){ b.disabled=false; b.textContent=b.dataset.lbl; const m=String(e.message||e.code||"error"); toast(/not-found|internal/i.test(m)?"Couldn't reach the price job. Deploy the functions first (README › Automatic prices).":"Couldn't update: "+m); } };
  });
}


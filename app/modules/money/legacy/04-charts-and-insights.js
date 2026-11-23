/* KP Money Planner, moved over unchanged. Tidied into typed modules later in Milestone 2. */
/* ==========================================================================
   Charts. Small SVG helpers drawn from the validated palette (--v1..--v6, --vO other, --vLast last year).
   One axis per chart, thin marks with rounded data ends on the baseline, 2px gaps, legend for 2+ series,
   hover/tap tooltip on every mark, and a "Show as table" fallback. Axis text never carries ₹ (render() rewrites ₹ in text).
   ========================================================================== */
const CH={}; let chSeq=0;
/* drawing width follows the screen so 11px axis text stays 11px on a phone */
const CW = half => { if(S.cwFixed) return S.cwFixed; const v=document.getElementById("view"), vw=(v&&v.clientWidth)||(window.innerWidth-32), two=half && window.innerWidth>=900;
  return Math.round(Math.max(280, Math.min(1100, two ? (vw-16)/2-24 : vw-24))); };
const VC=["var(--v1)","var(--v2)","var(--v3)","var(--v4)","var(--v5)","var(--v6)"];
const AX = v => { const a=Math.abs(v), s=v<0?"−":""; if(a>=1e7) return s+(+(a/1e7).toFixed(a>=1e8?0:1))+"Cr"; if(a>=1e5) return s+(+(a/1e5).toFixed(a>=1e6?0:1))+"L"; if(a>=1e3) return s+(+(a/1e3).toFixed(a>=1e4?0:1))+"k"; return s+Math.round(a); };
function niceTicks(lo, hi, n=4){
  if(!(hi>lo)) hi=lo+1;
  const raw=(hi-lo)/n, mag=Math.pow(10,Math.floor(Math.log10(raw))), f=raw/mag, step=(f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*mag;
  const t=[]; for(let v=Math.floor(lo/step+1e-9)*step; v<=Math.ceil(hi/step-1e-9)*step+step*1e-6; v+=step) t.push(Math.round(v/step)*step);
  return t.length>1 ? t : [t[0], t[0]+step];
}
const rtop=(x,y,w,h,r)=>{ if(h<=0) return ""; r=Math.min(r,w/2,h); return `M${x.toFixed(1)},${(y+h).toFixed(1)}V${(y+r).toFixed(1)}Q${x.toFixed(1)},${y.toFixed(1)} ${(x+r).toFixed(1)},${y.toFixed(1)}H${(x+w-r).toFixed(1)}Q${(x+w).toFixed(1)},${y.toFixed(1)} ${(x+w).toFixed(1)},${(y+r).toFixed(1)}V${(y+h).toFixed(1)}Z`; };
const rbot=(x,y,w,h,r)=>{ if(h<=0) return ""; r=Math.min(r,w/2,h); return `M${x.toFixed(1)},${y.toFixed(1)}V${(y+h-r).toFixed(1)}Q${x.toFixed(1)},${(y+h).toFixed(1)} ${(x+r).toFixed(1)},${(y+h).toFixed(1)}H${(x+w-r).toFixed(1)}Q${(x+w).toFixed(1)},${(y+h).toFixed(1)} ${(x+w).toFixed(1)},${(y+h-r).toFixed(1)}V${y.toFixed(1)}Z`; };
const legendHtml = series => series.length<2 ? "" : `<div class="legend">${series.map(s=>`<span><i class="${s.dash?"dash":""}" style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`;
const fmtMoney = v => money(v);
function tableHtml(labels, series, fmt=fmtMoney, total){
  return `<details class="ctab"><summary>Show as table</summary><div class="tw"><table><thead><tr><th></th>${series.map(s=>`<th>${esc(s.name)}</th>`).join("")}${total?"<th>Total</th>":""}</tr></thead><tbody>
    ${labels.map((l,i)=>`<tr><td>${esc(l)}</td>${series.map(s=>`<td>${s.values[i]==null?"—":fmt(s.values[i])}</td>`).join("")}${total?`<td>${fmt(series.reduce((a,s)=>a+(+s.values[i]||0),0))}</td>`:""}</tr>`).join("")}</tbody></table></div></details>`;
}
function tipRows(rows, title, foot){ return `<div class="tt">${esc(title)}</div>${rows.map(r=>`<div class="tr"><span>${r.c?`<i style="background:${r.c}"></i>`:""}${esc(r.n)}</span><b>${r.v}</b></div>`).join("")}${foot?`<div class="tf">${foot}</div>`:""}`; }
/* x labels: at most ~7 shown; January carries its year */
const xLabelEvery = n => n<=8 ? 1 : n<=14 ? 2 : n<=26 ? 4 : Math.ceil(n/(innerWidth<600?4.5:7));
const mTick = ym => { const m=+ym.slice(5); return m===1 ? `${MN[0]} ’${ym.slice(2,4)}` : MN[m-1]; };
const mTicks = M => M.length>24 ? M.map(ym=>`${MN[+ym.slice(5)-1]} ’${ym.slice(2,4)}`) : M.map(mTick);

/* bars: o = {labels, ticks (x labels), series:[{name,color,values}], stack, h, fmt, avg:{v,label}, attrs:i=>"data-…", tip:i=>html, foot:i=>text, dim:i=>bool} */
function barChart(o){
  const id="c"+(++chSeq), W=CW(o.half), H=o.h||210, pl=40, pr=8, pt=14, pb=24, n=o.labels.length, k=o.series.length;
  const pos=i=>o.series.reduce((s,x)=>s+Math.max(0,+x.values[i]||0),0), neg=i=>o.series.reduce((s,x)=>s+Math.min(0,+x.values[i]||0),0);
  const vals=o.series.flatMap(s=>s.values.map(v=>+v||0));
  let hi=Math.max(o.stack?Math.max(0,...o.labels.map((_,i)=>pos(i))):Math.max(0,...vals), o.avg?o.avg.v:0, 1), lo=Math.min(0, ...(o.stack?o.labels.map((_,i)=>neg(i)):vals));
  const tk=niceTicks(lo,hi); lo=tk[0]; hi=tk[tk.length-1];
  const Y=v=>pt+(hi-v)*(H-pt-pb)/(hi-lo), bw=(W-pl-pr)/n, every=xLabelEvery(n);
  const gw=Math.min(o.stack?26:Math.max(6,Math.min(15,(bw*.74-(k-1)*2)/k))*k+(k-1)*2, bw*.78), barW=o.stack?gw:(gw-(k-1)*2)/k;
  let marks="";
  for(let i=0;i<n;i++){
    const x0=pl+i*bw+(bw-gw)/2, op=o.dim&&o.dim(i)?' opacity=".55"':"";
    if(o.stack){
      let up=0, down=0; const segs=o.series.map((s,j)=>({j,v:+s.values[i]||0})).filter(x=>Math.abs(x.v)>0.005);
      const lastPos=segs.filter(x=>x.v>0).pop();
      for(const g of segs){
        if(g.v>0){ const y1=Y(up+g.v), y0=Y(up), h=Math.max(0,y0-y1-(up>0?2:0)); marks+=g===lastPos?`<path d="${rtop(x0,y1,barW,h,4)}" fill="${o.series[g.j].color}"${op}/>`:`<rect x="${x0.toFixed(1)}" y="${y1.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${o.series[g.j].color}"${op}/>`; up+=g.v; }
        else { const y0=Y(down), y1=Y(down+g.v); marks+=`<path d="${rbot(x0,y0,barW,Math.max(0,y1-y0),4)}" fill="${o.series[g.j].color}"${op}/>`; down+=g.v; }
      }
    } else o.series.forEach((s,j)=>{ const v=+s.values[i]||0, x=x0+j*(barW+2); if(v>0){ const y=Y(v); marks+=`<path d="${rtop(x,y,barW,Y(0)-y,4)}" fill="${s.color}"${op}/>`; } else if(v<0) marks+=`<path d="${rbot(x,Y(0),barW,Y(v)-Y(0),4)}" fill="${s.color}"${op}/>`; });
  }
  const grid=tk.map(v=>`<line class="${v===0?"z":"gl"}" x1="${pl}" x2="${W-pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${pl-6}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end">${(o.axFmt||AX)(v)}</text>`).join("");
  const xl=o.labels.map((l,i)=>i%every===0||i===n-1&&n<=8?`<text x="${(pl+i*bw+bw/2).toFixed(1)}" y="${H-6}" text-anchor="middle">${esc((o.ticks||o.labels)[i])}</text>`:"").join("");
  const avg=o.avg?`<line x1="${pl}" x2="${W-pr}" y1="${Y(o.avg.v).toFixed(1)}" y2="${Y(o.avg.v).toFixed(1)}" stroke="var(--ink)" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W-pr}" y="${(Y(o.avg.v)-5).toFixed(1)}" text-anchor="end" style="fill:var(--ink);font-weight:700">${esc(o.avg.label)}</text>`:"";
  const hits=o.labels.map((l,i)=>`<rect class="hit" data-ci="${i}" x="${(pl+i*bw).toFixed(1)}" y="${pt}" width="${bw.toFixed(1)}" height="${H-pt-pb}" ${o.attrs?o.attrs(i):""}/>`).join("");
  CH[id]={tip:i=>o.tip?o.tip(i):tipRows(o.series.map(s=>({n:s.name,c:k>1?s.color:"",v:(o.fmt||fmtMoney)(+s.values[i]||0)})), (o.full||o.labels)[i], o.foot?o.foot(i):"")};
  return `<svg viewBox="0 0 ${W} ${H}" data-ch="${id}" role="img" aria-label="${esc(o.aria||"Bar chart")}">${grid}${marks}${avg}${xl}${hits}</svg>`;
}
/* lines: o = {labels, ticks, series:[{name,color,values,dash,dashTo,width}], area (index of series to fill), band:{v,label} (zone below v), h, fmt, tip, zero:true} */
function lineChart(o){
  const id="c"+(++chSeq), W=CW(o.half), H=o.h||210, pl=44, pr=10, pt=14, pb=24, n=o.labels.length;
  const vals=o.series.flatMap(s=>s.values.filter(v=>v!=null).map(Number));
  let lo=Math.min(...vals, o.band?o.band.v:Infinity, o.zero===false?Infinity:0), hi=Math.max(...vals, o.band?o.band.v:-Infinity, o.zero===false?-Infinity:0);
  if(!isFinite(lo)) lo=0; if(!isFinite(hi)) hi=1;
  if(o.zero===false){ const pad=(hi-lo)*.12||Math.abs(hi)*.1||1; lo-=pad; hi+=pad; }
  const tk=niceTicks(lo,hi); lo=tk[0]; hi=tk[tk.length-1];
  const X=i=>pl+(n<=1?(W-pl-pr)/2:i*(W-pl-pr)/(n-1)), Y=v=>pt+(hi-v)*(H-pt-pb)/(hi-lo), every=xLabelEvery(n);
  const grid=tk.map(v=>`<line class="${v===0?"z":"gl"}" x1="${pl}" x2="${W-pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${pl-6}" y="${(Y(v)+4).toFixed(1)}" text-anchor="end">${(o.axFmt||AX)(v)}</text>`).join("");
  const band=o.band?`<rect x="${pl}" y="${Y(o.band.v).toFixed(1)}" width="${W-pl-pr}" height="${Math.max(0,Y(lo)-Y(o.band.v)).toFixed(1)}" fill="var(--bad)" fill-opacity=".08"/><line x1="${pl}" x2="${W-pr}" y1="${Y(o.band.v).toFixed(1)}" y2="${Y(o.band.v).toFixed(1)}" stroke="var(--bad)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${pl+6}" y="${(Y(o.band.v)+14).toFixed(1)}" style="fill:var(--bad);font-weight:700">${esc(o.band.label)}</text>`:"";
  let lines="", dots="";
  o.series.forEach((s,j)=>{
    const pts=s.values.map((v,i)=>v==null?null:[X(i),Y(+v)]);
    const path=(from,to)=>{ let d="", on=false; for(let i=from;i<=to;i++){ const p=pts[i]; if(!p){ on=false; continue; } d+=(on?"L":"M")+p[0].toFixed(1)+","+p[1].toFixed(1); on=true; } return d; };
    if(o.area===j){ const ix=pts.map((p,i)=>p?i:-1).filter(i=>i>=0); if(ix.length>1) lines+=`<path d="${path(ix[0],ix[ix.length-1])}L${pts[ix[ix.length-1]][0].toFixed(1)},${Y(Math.min(hi,Math.max(lo,0))).toFixed(1)}L${pts[ix[0]][0].toFixed(1)},${Y(Math.min(hi,Math.max(lo,0))).toFixed(1)}Z" fill="${s.color}" fill-opacity=".10"/>`; }
    const w=s.width||2;
    if(s.dashTo!=null && s.dashTo>0){ lines+=`<path d="${path(0,Math.min(s.dashTo,n-1))}" fill="none" stroke="${s.color}" stroke-width="${w}" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round"/>`; if(s.dashTo<n-1) lines+=`<path d="${path(s.dashTo,n-1)}" fill="none" stroke="${s.color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`; }
    else lines+=`<path d="${path(0,n-1)}" fill="none" stroke="${s.color}" stroke-width="${w}" ${s.dash?'stroke-dasharray="5 4"':""} stroke-linejoin="round" stroke-linecap="round"/>`;
    const last=pts.map((p,i)=>p?i:-1).filter(i=>i>=0).pop();
    if(last!=null && !s.noDot) dots+=`<circle cx="${pts[last][0].toFixed(1)}" cy="${pts[last][1].toFixed(1)}" r="4.5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`;
    if(o.dots) pts.forEach((p,i)=>{ if(p && i!==last) dots+=`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${s.color}" stroke="var(--surface)" stroke-width="1.5"/>`; });
  });
  const mark=o.mark!=null?`<line x1="${X(o.mark).toFixed(1)}" x2="${X(o.mark).toFixed(1)}" y1="${pt}" y2="${H-pb}" stroke="var(--muted)" stroke-dasharray="2 3"/><text x="${(X(o.mark)+4).toFixed(1)}" y="${pt+8}" style="font-weight:700">${esc(o.markLabel||"Today")}</text>`:"";
  const xl=o.labels.map((l,i)=>i%every===0?`<text x="${X(i).toFixed(1)}" y="${H-6}" text-anchor="${i===0&&n>1?"start":"middle"}">${esc((o.ticks||o.labels)[i])}</text>`:"").join("");
  const step=n>1?(W-pl-pr)/(n-1):(W-pl-pr);
  const hits=o.labels.map((l,i)=>`<rect class="hit" data-ci="${i}" x="${Math.max(pl-4,X(i)-step/2).toFixed(1)}" y="${pt}" width="${step.toFixed(1)}" height="${H-pt-pb}" ${o.attrs?o.attrs(i):""}/>`).join("");
  CH[id]={tip:i=>o.tip?o.tip(i):tipRows(o.series.filter(s=>s.values[i]!=null).map(s=>({n:s.name,c:o.series.length>1?s.color:"",v:(o.fmt||fmtMoney)(+s.values[i])})), (o.full||o.labels)[i], o.foot?o.foot(i):"")};
  return `<svg viewBox="0 0 ${W} ${H}" data-ch="${id}" role="img" aria-label="${esc(o.aria||"Line chart")}">${band}${grid}${lines}${mark}${dots}${xl}${hits}</svg>`;
}
/* donut: o = {items:[{name,value,color,attrs}], center:[big,small], fmt} — 2px gaps between segments */
function donutChart(o){
  const id="c"+(++chSeq), S2=200, R=80, T=26, C=2*Math.PI*R, tot=o.items.reduce((a,x)=>a+Math.max(0,x.value),0)||1;
  let off=0; const gap=o.items.length>1?2.2:0;
  const segs=o.items.map((x,i)=>{ const len=Math.max(0,x.value)/tot*C, d=`<circle class="dn" data-ci="${i}" cx="100" cy="100" r="${R}" fill="none" stroke="${x.color}" stroke-width="${T}" stroke-dasharray="${Math.max(.01,len-gap).toFixed(2)} ${(C-Math.max(.01,len-gap)).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 100 100)" ${x.attrs||""}/>`; off+=len; return d; }).join("");
  CH[id]={tip:i=>{ const x=o.items[i]; return tipRows([{n:x.name,c:x.color,v:(o.fmt||fmtMoney)(x.value)}], x.name, `${(x.value/tot*100).toFixed(1)}% of ${(o.fmt||fmtMoney)(tot)}${x.attrs&&/data-trd/.test(x.attrs)?" · tap to open":""}`); }};
  return `<svg viewBox="0 0 ${S2} ${S2}" data-ch="${id}" role="img" aria-label="${esc(o.aria||"Donut chart")}" style="max-width:220px;margin:0 auto">
    <circle cx="100" cy="100" r="${R}" fill="none" stroke="var(--sunk)" stroke-width="${T}"/>${segs}
    <text x="100" y="98" text-anchor="middle" style="font:500 21px var(--display);fill:var(--ink)">${esc(o.center[0])}</text><text x="100" y="118" text-anchor="middle" style="font-size:11px">${esc(o.center[1])}</text></svg>`;
}
const chartCard = (title, sub, body, extra="") => `<div class="chart">${title||sub?`<div class="chd"><b>${title}</b><span>${sub||""}</span></div>`:""}${body}${extra}</div>`;
/* top-N + "Other" for part-to-whole: colors follow the entity's rank in this chart, fixed order, never cycled */
function topN(entries, n=6){ const s=[...entries].filter(e=>e[1]>0.005).sort((a,b)=>b[1]-a[1]); if(s.length<=n) return s; const rest=s.slice(n-1).reduce((a,e)=>a+e[1],0); return [...s.slice(0,n-1), ["__other", rest]]; }

/* tooltip: pointer over any [data-ci] inside an svg[data-ch]; on touch the first tap shows it, the second acts */
let chPtr="mouse", chArmed=null;
const tipEl = () => $("#ctip") || (()=>{ const d=document.createElement("div"); d.id="ctip"; d.className="ctip"; d.hidden=true; d.setAttribute("role","status"); document.body.appendChild(d); return d; })();
function chartTip(e){
  const h=e.target && e.target.closest ? e.target.closest("[data-ci]") : null, t=tipEl();
  if(!h){ if(!t.hidden) t.hidden=true; document.querySelectorAll(".hit.on").forEach(x=>x.classList.remove("on")); return; }
  const svg=h.closest("[data-ch]"), c=svg&&CH[svg.dataset.ch]; if(!c) return;
  t.innerHTML=c.tip(+h.dataset.ci); t.hidden=false;
  document.querySelectorAll(".hit.on").forEach(x=>x!==h&&x.classList.remove("on")); if(h.classList.contains("hit")) h.classList.add("on");
  const r=t.getBoundingClientRect(), vw=innerWidth, vh=innerHeight; let x=e.clientX+14, y=e.clientY-r.height-12;
  if(x+r.width>vw-8) x=e.clientX-r.width-14; if(x<8) x=8; if(y<8) y=e.clientY+18; if(y+r.height>vh-8) y=vh-r.height-8;
  t.style.left=x+"px"; t.style.top=y+"px";
}
document.addEventListener("pointermove", e=>{ chPtr=e.pointerType||"mouse"; if(chPtr==="mouse") chartTip(e); }, {passive:true});
document.addEventListener("pointerdown", e=>{ chPtr=e.pointerType||"mouse"; chartTip(e); }, {passive:true});
document.addEventListener("scroll", ()=>{ const t=$("#ctip"); if(t) t.hidden=true; chArmed=null; }, {passive:true, capture:true});
document.addEventListener("click", e=>{
  const h=e.target.closest && e.target.closest("[data-ci]");
  if(!h || chPtr==="mouse") { chArmed=null; return; }
  if(chArmed!==h){ chArmed=h; e.stopPropagation(); e.preventDefault(); }   /* first tap: tooltip only */
  else chArmed=null;
}, true);

/* ---------- figures used by charts (memoised per render) ---------- */
const mfig = ym => memo("mf:"+ym, ()=>monthFigures(ym));
const lastMonths = (n, end=ymOf(today())) => Array.from({length:n},(_,i)=>addM(end,i-n+1));
const catLbl = k => k==="none"?"Uncategorised":k==="cardopen"?"Card balances from Money Manager":k==="repay"?"Loan repayments":k==="carry"?"Last month balance":k==="__other"?"Other":catName(k);
const incOf = f => f.income-(f.byInc.get("carry")||0);
const pctS = v => (v>=0?"+":"−")+Math.abs(v).toFixed(0)+"%";

/* ---------- Insights › Trends ---------- */
function trendsPanel(){
  const N=S.trN||12, now=ymOf(today()), M=lastMonths(N), F=M.map(mfig);
  const lbl=M.map(mShort), tick=M.map(mTick);
  const inc=F.map(incOf), exp=F.map(f=>f.expense), inv=F.map(f=>f.investment);
  const dimCur=i=>M[i]===now;
  const nSel=`<div class="seg" role="group" aria-label="Range" style="margin-top:12px">${[[6,"6 months"],[12,"12 months"],[24,"24 months"]].map(([v,l])=>`<button type="button" data-trn="${v}" aria-pressed="${N===v}">${l}</button>`).join("")}</div>`;
  /* 1 — income, spent, invested */
  const ser=[{name:"Income",color:"var(--v1)",values:inc},{name:"Spent",color:"var(--v3)",values:exp},{name:"Invested",color:"var(--v2)",values:inv}];
  const done=F.map((f,i)=>i).filter(i=>M[i]<now), avg=a=>done.length?done.reduce((s,i)=>s+a[i],0)/done.length:0;
  const c1=chartCard("Money in and out", `avg spend ${money(avg(exp))}/month`,
    barChart({half:1, labels:lbl, ticks:tick, full:M.map(mLabel), series:ser, h:220, dim:dimCur, aria:`Income, spending and investing for the last ${N} months`, attrs:i=>`data-ym="${M[i]}"`,
      foot:i=>`${M[i]===now?"So far + still due · ":""}Left over ${money(inc[i]-exp[i]-inv[i])} · tap to see entries`}),
    legendHtml(ser)+`<p class="cnote">${mLabel(now)} includes what's still due this month. Card spends count in the month their bill is due. "Last month balance" isn't counted as income.</p>`+tableHtml(M.map(mLabel), ser));
  /* 2 — savings rate */
  const rate=inc.map((v,i)=>v>0.5?(v-exp[i])/v*100:null), rd=done.filter(i=>rate[i]!=null), ravg=rd.length?rd.reduce((s,i)=>s+rate[i],0)/rd.length:null;
  const pf=v=>v==null?"—":v.toFixed(1)+"%";
  const c2=chartCard("Savings rate", ravg!=null?`average ${ravg.toFixed(0)}%`:"",
    lineChart({half:1, labels:lbl, ticks:tick, full:M.map(mLabel), series:[{name:"Savings rate",color:"var(--v1)",values:rate}], h:170, dots:true, fmt:pf, axFmt:v=>Math.round(v)+"%", aria:"Share of income not spent, by month",
      foot:i=>inc[i]>0.5?`Income ${money(inc[i])} − spent ${money(exp[i])}. Investing counts as saving.`:"No income recorded"}),
    `<p class="cnote">Share of income you didn't spend (investments count as saved).</p>`+tableHtml(M.map(mLabel), [{name:"Savings rate",values:rate}], pf));
  return nSel + `<div class="cgrid two">${c1}${c2}</div>` + `<div class="cgrid two">${wherePanel()}${catTrendPanel(M,F)}</div>` + `<div class="cgrid">${yoyPanel()}</div>`;
}
/* 3 — where the money went, with drill-down into subcategories */
const TRP=[["month","This month"],["last","Last month"],["3m","3 months"],["ytd","This year"],["12m","12 months"]];
function wherePanel(){
  const p=S.trP||"month", now=ymOf(today()), drill=S.trD||"";
  const ms = p==="month"?[now] : p==="last"?[addM(now,-1)] : p==="3m"?lastMonths(3,addM(now,-1)) : p==="ytd"?Array.from({length:+now.slice(5)},(_,i)=>`${now.slice(0,4)}-${pad(i+1)}`) : lastMonths(12,addM(now,-1));
  const agg=new Map(); for(const ym of ms){ const f=mfig(ym); if(drill){ const sub=f.sub.get(drill); if(sub) for(const [k,v] of sub) agg.set(k,(agg.get(k)||0)+v); } else for(const [k,v] of f.byCat) agg.set(k,(agg.get(k)||0)+v); }
  const top=topN([...agg.entries()], 6), tot=top.reduce((a,[,v])=>a+v,0);
  const color=(k,i)=>k==="__other"?"var(--vO)":VC[i];
  const name=k=>drill ? (k===drill?`${catLbl(drill)} (general)`:catLbl(k).replace(/^.*› /,"")) : catLbl(k);
  const canDrill=k=>!drill && k!=="__other" && (()=>{ let n=0; for(const ym of ms){ const s=mfig(ym).sub.get(k); if(s && (s.size>1 || !s.has(k))) n++; } return n>0; })();
  const items=top.map(([k,v],i)=>({name:name(k), value:v, color:color(k,i), attrs:canDrill(k)?`data-trd="${esc(k)}"`:""}));
  const range=ms.length===1?mLabel(ms[0]):`${mShort(ms[0])} – ${mShort(ms[ms.length-1])}`;
  const pills=`<div class="chsel"><div class="pills" role="group" aria-label="Period">${TRP.map(([k,l])=>`<button type="button" data-trp="${k}" aria-pressed="${p===k}">${l}</button>`).join("")}</div></div>`;
  const back=drill?`<div class="chsel"><button class="btn sm" type="button" data-trd="">‹ All categories</button><span class="note" style="margin:0">${esc(catLbl(drill))}</span></div>`:"";
  if(!tot) return chartCard("Where the money went", range, pills+back+`<div class="empty" style="padding:20px 8px">No spending in this period.</div>`);
  const list=`<div class="dlist">${items.map((x,i)=>{ const tag=x.attrs?"button":"div"; return `<${tag} class="di" ${x.attrs?`type="button" ${x.attrs}`:""}><i style="background:${x.color}"></i><span class="dn2">${esc(x.name)}${x.attrs?" ›":""}</span><span class="dp">${(x.value/tot*100).toFixed(0)}%</span><span class="dv">${money(x.value)}</span></${tag}>`; }).join("")}</div>`;
  return chartCard("Where the money went", range, pills+back+`<div class="dwrap">${donutChart({items, center:[short(tot).replace("₹",""), drill?"in this category":"spent"], aria:`Spending by ${drill?"subcategory":"category"}, ${range}`})}${list}</div>`,
    `<p class="cnote">${drill?"Subcategories of "+esc(catLbl(drill))+".":"Tap a category to see its subcategories."} ${p==="month"?"This month includes what's still due.":""}</p>`);
}
/* 4 — one category over time with its average */
function catTrendPanel(M, F){
  const now=ymOf(today()), totals=new Map(); for(const f of F) for(const [k,v] of f.byCat) totals.set(k,(totals.get(k)||0)+v);
  const opts=[...totals.entries()].filter(([k])=>k!=="cardopen").sort((a,b)=>b[1]-a[1]);
  if(!opts.length) return chartCard("Category over time","", `<div class="empty" style="padding:20px 8px">No spending yet.</div>`);
  const c=opts.some(([k])=>k===S.trC)?S.trC:opts[0][0], vals=F.map(f=>f.byCat.get(c)||0);
  const di=M.map((m,i)=>i).filter(i=>M[i]<now), av=di.length?di.reduce((s,i)=>s+vals[i],0)/di.length:0;
  const sel=`<div class="chsel"><select id="trCat" aria-label="Category">${opts.map(([k])=>`<option value="${esc(k)}" ${k===c?"selected":""}>${esc(catLbl(k))}</option>`).join("")}</select></div>`;
  return chartCard("Category over time", `avg ${money(av)}/month`, sel+barChart({half:1, labels:M.map(mShort), ticks:M.map(mTick), full:M.map(mLabel), series:[{name:catLbl(c),color:"var(--v2)",values:vals}], h:190, avg:{v:av,label:"avg "+AX(av)}, dim:i=>M[i]===now,
      attrs:i=>`data-ymc="${M[i]}|${esc(c)}"`, foot:i=>`${av>0.5?`${pctS((vals[i]-av)/av*100)} vs average · `:""}tap to see entries`, aria:`${catLbl(c)} spending by month`}),
    `<p class="cnote">Dashed line: average of the full months shown.</p>`+tableHtml(M.map(mLabel),[{name:catLbl(c),values:vals}]));
}
/* 5 — this year vs last year, running total of spending */
function yoyPanel(){
  const now=ymOf(today()), y=+now.slice(0,4), m=+now.slice(5);
  const cum=(yr,upto)=>{ let s=0; return Array.from({length:12},(_,i)=>{ if(i>=upto) return null; s+=mfig(`${yr}-${pad(i+1)}`).expense; return s; }); };
  const a=cum(y,m), b=cum(y-1,12);
  if(!b.some(v=>v>0.5)) return "";
  const ser=[{name:String(y),color:"var(--v1)",values:a,width:2.5},{name:String(y-1),color:"var(--vLast)",values:b}];
  const diff=a[m-1]-b[m-1];
  return chartCard("This year vs last year", `${MN[m-1]}: ${diff>=0?"+":"−"}${money(Math.abs(diff))} vs ${y-1}`,
    lineChart({labels:MN, ticks:MN, full:MN.map(x=>x), series:ser, h:200, aria:`Running total of spending, ${y} against ${y-1}`,
      tip:i=>tipRows([{n:String(y),c:"var(--v1)",v:a[i]==null?"—":money(a[i])},{n:String(y-1),c:"var(--vLast)",v:money(b[i]||0)}], `Spent by end of ${MN[i]}`, a[i]!=null&&b[i]?`${pctS((a[i]-b[i])/b[i]*100)} vs ${y-1}`:"")}),
    legendHtml(ser)+`<p class="cnote">Running total of spending from January. ${MN[m-1]} ${y} includes what's still due.</p>`+tableHtml(MN.map(x=>x), ser));
}
/* 6 — daily spending calendar for one month (actual spend dates, not bill dates) */
function dailyHeat(ym){
  const days=new Map(); for(const t of live("txns")) if(t.type==="expense" && !offBook(t) && ymOf(t.date)===ym) days.set(+t.date.slice(8),(days.get(+t.date.slice(8))||0)+ +t.amount);
  const [y,m]=ym.split("-").map(Number), nd=new Date(y,m,0).getDate(), lead=(new Date(y,m-1,1).getDay()+6)%7, td=today();
  const vals=[...days.values()].sort((a,b)=>a-b); if(!vals.length) return "";
  const q=p=>vals[Math.min(vals.length-1,Math.floor(p*vals.length))], cut=[q(.2),q(.4),q(.6),q(.8)];
  const lvl=v=>!v?0:v<=cut[0]?1:v<=cut[1]?2:v<=cut[2]?3:v<=cut[3]?4:5;
  let cells=["M","T","W","T","F","S","S"].map(d=>`<div class="hw">${d}</div>`).join("")+Array.from({length:lead},()=>'<div class="hc x"></div>').join("");
  for(let d=1; d<=nd; d++){ const v=days.get(d)||0, ds=`${ym}-${pad(d)}`, l=lvl(v);
    cells+= v ? `<button class="hc l${l} ${ds===td?"td":""}" type="button" data-day="${ds}" title="${dLabel(ds)}: ${money(v)}" aria-label="${dLabel(ds)}: ${money(v)} spent"><b>${d}</b>${AX(v)}</button>` : `<div class="hc ${ds===td?"td":""}" aria-label="${dLabel(ds)}: nothing spent">${d}</div>`; }
  const big=[...days.entries()].sort((a,b)=>b[1]-a[1])[0], tot=vals.reduce((a,b)=>a+b,0), active=vals.length;
  return `<div class="sh"><h3>Daily spending</h3><span class="note" style="margin:0">${active} day${active===1?"":"s"} with spends</span></div>
    ${chartCard("", "", `<div class="heat">${cells}</div><div class="hkey">Less <i style="background:var(--h1)"></i><i style="background:var(--h2)"></i><i style="background:var(--h3)"></i><i style="background:var(--h4)"></i><i style="background:var(--h5)"></i> More</div>`,
      `<p class="cnote">Biggest day ${dLabel(`${ym}-${pad(big[0])}`)} (${money(big[1])}) · ${money(tot/nd)} a day on average. Uses the date you spent, so card spends show here even if their bill is due later. Tap a day to see its entries.</p>`)}`;
}

/* ---------- net worth over time ----------
   A snapshot is saved once a day for the current month (the last one in a month stays as that month's figure).
   Months before the first snapshot are estimated: balances worked back from today through every later entry
   (Money Manager history included), loans from their schedules and ledgers, investments scaled from what was
   invested then. Estimates are drawn dashed. */
function ensureSnap(){
  if(!S.data || Date.now()-(S.snapT||0)<36e5) return false; S.snapT=Date.now();
  if(!live("accounts").length) return false;
  const td=today(), ym=ymOf(td), id="nw-"+ym, x=byId("snaps",id), n=netWorth();
  const o={id, ym, day:td, total:r2(n.total), banks:r2(n.banks), inv:r2(n.inv), prop:r2(n.prop), cards:r2(n.cards), loans:r2(n.loans)};
  if(x && !x.deleted && ["total","inv","prop","loans","banks","cards"].every(k=>Math.abs((+x[k]||0)-o[k])<1)) return false;
  put("snaps", o); return true;
}
function nwHistory(){
  return memo("nwh", ()=>{
    const now=ymOf(today()), snaps=new Map(live("snaps").map(s=>[s.ym,s]));
    const tx=live("txns").filter(t=>!t.paidBy && t.type!=="carry").sort((a,b)=>b.date.localeCompare(a.date));
    const first=tx.length ? ymOf(tx[tx.length-1].date) : now, start=[first, addM(now,-60)].sort()[1];
    const accs=live("accounts").filter(countsAcc), bal=balances(), cur=new Map(accs.map(a=>[a.id, bal.get(a.id)||0]));
    const H=live("holdings").filter(h=>!h.excludeNW).map(h=>({h, x:holdingSum(h), k:(h.instrument||h.name).trim().toLowerCase(), inv:0}));
    for(const z of H) z.inv=z.x.inv;
    const out=[]; let j=0; const nw=netWorth();
    out.push({ym:now, total:nw.total, banks:nw.banks, inv:nw.inv, prop:nw.prop, cards:nw.cards, loans:nw.loans, est:false, live:true});
    for(let ym=addM(now,-1); ym>=start; ym=addM(ym,-1)){
      const end=lastDay(ym);
      while(j<tx.length && tx[j].date>end){ const t=tx[j++];
        for(const a of accs){ const e=accEff(a.id,t); if(e) cur.set(a.id, cur.get(a.id)-e); }
        if(t.type==="investment"){ const k=(t.instrument||"").trim().toLowerCase(); for(const z of H) if(z.k===k) z.inv-=invNet(t); } }
      const s=snaps.get(ym);
      if(s){ out.push({ym, total:s.total, banks:s.banks, inv:s.inv, prop:+s.prop||0, cards:s.cards, loans:s.loans, est:false}); continue; }
      let banks=0, cards=0; for(const a of accs){ const v=cur.get(a.id); if(a.type==="card") cards+=Math.max(0,-v); else banks+=v; }
      let inv=0; for(const z of H){ const hp=(z.h.history||[]).filter(p=>p.date<=end).pop(); inv += hp ? +hp.value : z.x.inv>0 ? Math.max(0,z.inv)*(z.x.value/z.x.inv) : z.x.value; }
      let loans=0; for(const l of live("loans")){ if(l.closedOn && l.closedOn<=ym) continue; const b=bankOf(l), sc=schedule(l), nx=addM(ym,1);
        if(b && sc) loans+=bankOut(l,nx);   /* before the schedule starts: what was owed when you added it */
        if(!isEmiLike(kindOf(l))){ const lt=loanTx(l.id).filter(t=>t.part!=="bank"), f0=lt.map(t=>t.date).sort()[0], upto=f0&&end<f0?f0:end; let o2=0;
          for(const t of lt) if(t.date<=upto){ if(t.act==="borrow") o2+=+t.amount; else if(t.act==="repay") o2-=+t.amount; } loans+=Math.max(0,o2); } }
      const prop=propList().reduce((a,p)=>a+propNwAt(p,end),0);
      out.push({ym, total:banks+inv+prop-cards-loans, banks, inv, prop, cards, loans, est:true});
    }
    return out.reverse();
  });
}
function nwChart(){
  const all=nwHistory(); if(all.length<2) return "";
  const N=S.nwN||24, P=N==="all"?all:all.slice(-N), lbl=P.map(p=>mShort(p.ym)), last=P[P.length-1], prev=P[P.length-2];
  const firstReal=P.findIndex(p=>!p.est), dashTo=firstReal<0?P.length-1:firstReal;
  const ch=prev?last.total-prev.total:0;
  const tip=i=>{ const p=P[i]; return tipRows([{n:"Banks",v:money(p.banks)},{n:"Investments",v:money(p.inv)},...(p.prop>0.5?[{n:"Property",v:money(p.prop)}]:[]),{n:"Card bills",v:"−"+money(p.cards)},{n:"Loans",v:"−"+money(p.loans)},{n:"Net worth",v:`<span style="font-weight:800">${money(p.total)}</span>`}], mLabel(p.ym)+(p.live?" (month-end)":""), p.est?"Estimated from your entries":p.live?"Live: this month's projected month-end":"Saved snapshot"); };
  const sel=`<div class="chsel"><div class="pills" role="group" aria-label="Range">${[[12,"1 year"],[24,"2 years"],["all","All"]].map(([v,l])=>`<button type="button" data-nwn="${v}" aria-pressed="${N===v}">${l}</button>`).join("")}</div></div>`;
  const ser=[{name:"Net worth",color:"var(--v1)",values:P.map(p=>p.total),dashTo:dashTo>0?dashTo:null,width:2.5}];
  return `<div class="sh"><h3>Net worth over time</h3><span class="note" style="margin:0">${prev?`${ch>=0?"+":"−"}${money(Math.abs(ch))} vs ${MN[+prev.ym.slice(5)-1]}`:""}</span></div>`+
    chartCard("","", sel+lineChart({labels:lbl, ticks:mTicks(P.map(p=>p.ym)), series:ser, area:0, h:200, zero:false, tip, aria:`Net worth by month, now ${money(last.total)}`}),
      `${dashTo>0?`<div class="legend"><span><i class="dash"></i>Estimated</span><span><i style="background:var(--v1)"></i>Saved each month from now on</span></div>`:""}<p class="cnote">Saved automatically once a day; each month keeps its last figure. Earlier months are worked back from your entries: bank and card balances exactly, investments roughly (scaled from what you'd invested then), and loans from their schedules or as owed when you added them. Treat them as a guide.</p>`+
      tableHtml(P.map(p=>mLabel(p.ym)+(p.est?" (est.)":"")), [{name:"Banks",values:P.map(p=>p.banks)},{name:"Investments",values:P.map(p=>p.inv)},...(P.some(p=>p.prop>0.5)?[{name:"Property",values:P.map(p=>p.prop||0)}]:[]),{name:"Card bills",values:P.map(p=>p.cards)},{name:"Loans",values:P.map(p=>p.loans)},{name:"Net worth",values:P.map(p=>p.total)}]));
}
/* ---------- investments: allocation + money put in each month ---------- */
function investCharts(H){
  const by=new Map(); for(const [h,x] of H) if(!h.excludeNW && x.value>0.5) by.set(h.type,(by.get(h.type)||0)+x.value);
  const top=topN([...by.entries()],6), tot=top.reduce((a,[,v])=>a+v,0); if(!tot) return "";
  const items=top.map(([k,v],i)=>({name:k==="__other"?"Other types":k, value:v, color:k==="__other"?"var(--vO)":VC[i], attrs:k==="__other"?"":`data-hgo="${esc(k)}"`}));
  const list=`<div class="dlist">${items.map(x=>`<${x.attrs?"button":"div"} class="di" ${x.attrs?`type="button" ${x.attrs}`:""}><i style="background:${x.color}"></i><span class="dn2">${esc(x.name)}</span><span class="dp">${(x.value/tot*100).toFixed(0)}%</span><span class="dv">${money(x.value)}</span></${x.attrs?"button":"div"}>`).join("")}</div>`;
  const M=lastMonths(12), now=ymOf(today()), v=M.map(ym=>mfig(ym).investment), done=M.filter(m=>m<now).length, av=done?v.slice(0,-1).reduce((a,b)=>a+b,0)/done:0;
  return `<div class="cgrid two">${chartCard("Allocation", `${top.length} type${top.length===1?"":"s"}`, `<div class="dwrap">${donutChart({items, center:[short(tot).replace("₹",""),"invested value"], aria:"Investment value by type"})}${list}</div>`)}
    ${chartCard("Put in each month", `avg ${money(av)}`, barChart({half:1, labels:M.map(mShort), ticks:M.map(mTick), full:M.map(mLabel), series:[{name:"Invested",color:"var(--v2)",values:v}], h:190, avg:{v:av,label:"avg "+AX(av)}, dim:i=>M[i]===now, attrs:i=>`data-ym="${M[i]}"`, aria:"Money invested each month", foot:i=>M[i]===now?"So far + SIPs still due":""}),
      `<p class="cnote">SIPs and investment entries, Money Manager history included.</p>`+tableHtml(M.map(mLabel),[{name:"Invested",values:v}]))}</div>`;
}
/* ---------- cards: spend by card by month + utilisation ---------- */
function cardCharts(bal){
  const cards=live("accounts").filter(a=>a.type==="card" && !a.hidden); if(!cards.length) return "";
  const M=lastMonths(6), idx=new Map(M.map((m,i)=>[m,i])), per=new Map(cards.map(a=>[a.id, M.map(()=>0)]));
  for(const t of live("txns")) if(t.type==="expense" && per.has(t.accountId)){ const i=idx.get(ymOf(t.date)); if(i!=null) per.get(t.accountId)[i]+=+t.amount; }
  const ranked=cards.map(a=>[a, per.get(a.id).reduce((x,y)=>x+y,0)]).filter(([,v])=>v>0.5).sort((a,b)=>b[1]-a[1]);
  let ser=ranked.slice(0,5).map(([a],i)=>({name:a.name, color:VC[i], values:per.get(a.id)}));
  if(ranked.length>5){ const rest=ranked.slice(5); ser.push({name:"Other cards", color:"var(--vO)", values:M.map((_,i)=>rest.reduce((s,[a])=>s+per.get(a.id)[i],0))}); }
  const spend = ser.length ? chartCard("Card spending by month", "by spend date", barChart({labels:M.map(mShort), ticks:M.map(mTick), full:M.map(mLabel), series:ser, stack:true, h:200, aria:"Spending on each card by month",
      tip:i=>tipRows(ser.filter(s=>s.values[i]>0.5).map(s=>({n:s.name,c:s.color,v:money(s.values[i])})), mLabel(M[i]), `Total ${money(ser.reduce((a,s)=>a+s.values[i],0))}`)}), legendHtml(ser)+tableHtml(M.map(mLabel), ser, fmtMoney, true)) : "";
  const lim=cards.filter(a=>+a.limit>0).map(a=>{ const o=Math.max(0,-(bal.get(a.id)||0)); return {a, o, l:+a.limit, p:o/(+a.limit)*100}; }).sort((x,y)=>y.p-x.p);
  const tl=lim.reduce((s,x)=>s+x.l,0), to=lim.reduce((s,x)=>s+x.o,0);
  const util = lim.length ? `<div class="sh"><h3>Credit used</h3><span class="note" style="margin:0">${(to/tl*100).toFixed(0)}% of ${short(tl)} across ${lim.length} card${lim.length===1?"":"s"}</span></div>
    <div class="list">${lim.map(x=>{ const st=x.p>=75?"bad":x.p>=30?"warn":""; return `<div class="row tap" data-card="${esc(x.a.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(x.a.name)}</div><div class="s">${money(x.o)} of ${money(x.l)} · ${money(Math.max(0,x.l-x.o))} available${st==="bad"?" · high":""}</div><div class="pbar ${st}"><i style="width:${Math.min(100,x.p).toFixed(1)}%"></i><span class="mk" style="left:30%" title="30%"></span></div></div><div class="amt">${x.p.toFixed(0)}%</div></div>`; }).join("")}</div>
    <p class="note">Keeping each card under 30% (the mark on each bar) is generally better for your credit score.</p>` : `<p class="note">Add each card's credit limit (Edit card) to see how much of it you're using.</p>`;
  return spend + util;
}
/* ---------- forecast with a keep-at-least line ---------- */
function forecastChart(fc){
  const F=fc.months, min=+prefGet("fcMin",0)||0, vals=F.map(m=>m.bal), below=F.filter(m=>m.bal<min-0.5);
  const tip=i=>{ const m=F[i]; return tipRows([{n:"Coming in",v:money(m.inc)},{n:"Going out",v:money(m.out)},{n:"Investing",v:money(m.inv)},{n:"Closing balance",v:`<span style="font-weight:800">${money(m.bal)}</span>`}], mLabel(m.ym), m.bal<min-0.5?`Below your ₹${AX(min)} line`:""); };
  return chartCard("Closing balance", `from ${money(fc.start)} today`,
    lineChart({labels:F.map(m=>mShort(m.ym)), ticks:F.map(m=>mTick(m.ym)), series:[{name:"Closing balance",color:vals[vals.length-1]<0?"var(--bad)":"var(--v1)",values:vals,width:2.5}], area:0, dots:F.length<=12, band:min>0||vals.some(v=>v<0)?{v:min,label:min>0?`keep ≥ ${AX(min)}`:"below zero"}:null, h:220, tip, aria:`Projected closing balance for the next ${F.length} months`}),
    `<div class="chsel" style="margin-top:10px"><label class="note" for="fcMin" style="margin:0">Keep at least ₹</label><input id="fcMin" type="number" inputmode="decimal" step="1000" value="${min||""}" placeholder="0" style="width:120px;font:600 13px var(--body);padding:6px 10px;border-radius:10px;border:1px solid var(--line2);background:var(--raised);color:var(--ink)"></div>
     ${below.length?`<p class="cnote"><b style="color:var(--bad)">⚠ ${below.length} month${below.length===1?"":"s"} below ${money(min)}:</b> ${below.map(m=>mShort(m.ym)).join(", ")}.</p>`:min>0?`<p class="cnote">✓ Stays above ${money(min)} every month.</p>`:""}`+
    tableHtml(F.map(m=>mLabel(m.ym)), [{name:"In",values:F.map(m=>m.inc)},{name:"Out",values:F.map(m=>m.out)},{name:"Invest",values:F.map(m=>m.inv)},{name:"Closing",values:vals}]));
}
/* ---------- Home tag: you vs spouse ---------- */
function homeChart(M, y){
  const ser=[{name:"You",color:"var(--v1)",values:M.map(m=>m.you)},{name:othersName(),color:"var(--v2)",values:M.map(m=>m.her)}];
  return chartCard("", "", barChart({labels:M.map(m=>MN[+m.ym.slice(5)-1]), series:ser, stack:true, h:190, aria:`${homeTag()} spending by month in ${y}, you and ${othersName()}`, attrs:i=>M[i].you+M[i].her>0.5?`data-homem="${M[i].ym}"`:"",
    tip:i=>tipRows(ser.map(s=>({n:s.name,c:s.color,v:money(s.values[i])})), mLabel(M[i].ym), `Total ${money(M[i].you+M[i].her)}`)}), legendHtml(ser)+tableHtml(M.map(m=>mLabel(m.ym)), ser, fmtMoney, true));
}
/* ---------- loans: outstanding over time + part-payment simulator ---------- */
function simLoan(l, sim){
  const s=schedule(l); if(!s || !sim || !(+sim.amt>0 || +sim.extra>0)) return null;
  const from=sim.ym && sim.ym>ymOf(today()) ? sim.ym : addM(ymOf(today()),1), base=s.rows.filter(r=>r.ym>=from); if(!base.length) return null;
  const r0=base[0], r=r0.rate/1200; let bal=Math.max(0, r0.open-(+sim.amt||0)), left=base.length, emi=sim.mode==="emi"?pmt(bal,r,left):r0.emi, ym=from, int=0; const rows=[];
  for(let i=0;i<720 && bal>0.5;i++){ const it=bal*r, pay=Math.min(emi+(+sim.extra||0), bal+it); bal=Math.max(0, bal-(pay-it)); int+=it; rows.push({ym, bal, emi:pay}); ym=addM(ym,1); }
  const baseInt=base.reduce((a,x)=>a+x.int,0);
  return {from, rows, int, baseInt, saved:baseInt-int, months:base.length-rows.length, end:rows.length?rows[rows.length-1].ym:from, newEmi:sim.mode==="emi"?emi:null, oldEmi:r0.emi, baseEnd:s.end};
}
function loanCharts(l, x){
  const s=x.s; if(!s || !s.rows.length) return "";
  const now=ymOf(today()), sim=S.lsim&&S.lsim.id===l.id?S.lsim:null, R=simLoan(l, sim);
  const rows=s.rows, M=rows.map(r=>r.ym), base=rows.map(r=>r.bal);
  const ser=[{name:"As planned",color:"var(--v2)",values:base}];
  if(R){ const m=new Map(R.rows.map(q=>[q.ym,q.bal])); ser.push({name:"With part payment",color:"var(--v1)",values:M.map(ym=>ym<R.from?null:m.has(ym)?m.get(ym):0),dash:false,width:2.5}); ser[0].dash=true; }
  const mi=M.indexOf(now);
  const chart=chartCard("Outstanding over time", x.end?`clears ${mShort(R?R.end:x.end)}`:"", lineChart({labels:M.map(mShort), ticks:mTicks(M), full:M.map(mLabel), series:ser, area:R?1:0, h:200, mark:mi>=0?mi:null, aria:`${l.name} outstanding balance by month`,
    tip:i=>tipRows(ser.filter(z=>z.values[i]!=null).map(z=>({n:z.name,c:ser.length>1?z.color:"",v:money(z.values[i])})), mLabel(M[i]), `EMI ${money(rows[i].emi)} · interest ${money(rows[i].int)}`)}), legendHtml(ser));
  if(kindOf(l)==="cardemi" || l.closedOn) return chart;
  const v=sim||{amt:"", ym:addM(now,1), mode:"tenure", extra:""};
  const form=`<div class="card" style="margin-top:12px"><div style="font-weight:700">What if I pay extra?</div>
    <div class="grid2" style="margin-top:10px">${field(["spAmt","One-time part payment (₹)","number",{value:v.amt,step:"1000",ph:"e.g. 200000"}])}${field(["spYm","In","month",{value:v.ym}])}</div>
    ${field(["spEx","Extra every month (₹, optional)","number",{value:v.extra,step:"500",ph:"e.g. 5000"}])}
    <div class="seg" role="group" aria-label="After the part payment" id="spMode">${[["tenure","Keep EMI, end sooner"],["emi","Keep end date, lower EMI"]].map(([k,t])=>`<button type="button" data-spm="${k}" aria-pressed="${v.mode===k}">${t}</button>`).join("")}</div>
    <div class="btns" style="margin-top:12px"><button class="btn pri sm" type="button" id="spGo">Work it out</button>${sim?'<button class="btn sm" type="button" id="spClr">Clear</button>':""}</div>
    ${R?`<div class="simout"><div><div class="k">Interest saved</div><div class="v in">${money(R.saved)}</div></div><div><div class="k">${R.newEmi?"New EMI":"Ends"}</div><div class="v">${R.newEmi?money(R.newEmi):`${mShort(R.end)}`}</div></div>
      <div><div class="k">${R.newEmi?"EMI was":"Months saved"}</div><div class="v">${R.newEmi?money(R.oldEmi):R.months}</div></div><div><div class="k">Interest still to pay</div><div class="v">${money(R.int)}</div></div></div>
      <p class="cnote">Assumes today's rate of ${rateTxt(rows.find(r=>r.ym>=R.from)?.rate||0)}% stays the same. Your bank may charge a fee or ask you to choose how the payment is applied. To record a real one, use Part payment.</p>`:""}</div>`;
  return chart+form;
}

/* ---------- category limits (a monthly cap on a main expense category; doesn't change the forecast) ---------- */
function limitRows(ym){
  const f=mfig(ym);
  return live("categories").filter(c=>c.kind==="expense" && +c.limit>0 && !c.parentId).map(c=>{ const sp=f.byCat.get(c.id)||0; return {c, sp, lim:+c.limit, p:sp/(+c.limit)*100}; }).sort((a,b)=>b.p-a.p);
}
function limitsSection(ym){
  const L=limitRows(ym); if(!L.length) return `<p class="note" style="margin-top:12px">Tip: give a category a monthly limit (Settings › Categories) to track it here.</p>`;
  const now=ymOf(today()), dayFrac=ym===now?(+today().slice(8))/new Date(+ym.slice(0,4),+ym.slice(5),0).getDate():1;
  return `<div class="sh"><h3>Category limits</h3><span class="note" style="margin:0">${L.filter(x=>x.p>100).length?`${L.filter(x=>x.p>100).length} over`:"all within"}</span></div>
  <div class="list">${L.map(x=>{ const st=x.p>100?"bad":x.p>=80?"warn":""; return `<div class="row tap" data-cat="${esc(x.c.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(x.c.name)} ${st==="bad"?'<span class="pill bad">Over</span>':st==="warn"?'<span class="pill warn">Close</span>':""}</div>
    <div class="s">${money(x.sp)} of ${money(x.lim)}${x.p>100?` · over by ${money(x.sp-x.lim)}`:` · ${money(x.lim-x.sp)} left`}</div>
    <div class="pbar ${st}"><i style="width:${Math.min(100,x.p).toFixed(1)}%"></i>${ym===now&&dayFrac<1?`<span class="mk" style="left:${(dayFrac*100).toFixed(1)}%" title="Today"></span>`:""}</div></div><div class="amt">${x.p.toFixed(0)}%</div></div>`; }).join("")}</div>
  ${ym===now?'<p class="note">The mark on each bar is how far through the month we are. Includes what\'s still due this month.</p>':""}`;
}
/* ---------- repeat payments not in the plan (subscriptions, bills you pay by hand) ---------- */
const normNote = s => String(s||"").toLowerCase().replace(/\d+/g," ").replace(/[^a-zऀ-ॿ ]+/g," ").replace(/\b(the|and|for|of|to|payment|bill|paid|monthly|month|renewal|recharge)\b/g," ").replace(/\s+/g," ").trim().split(" ").slice(0,3).join(" ");
function findRepeats(){
  return memo("rep", ()=>{
    const now=ymOf(today()), since=addM(now,-12)+"-01", G=new Map(), ign=new Set(prefGet("repIgnore",[]));
    for(const t of live("txns")) if(t.type==="expense" && !t.link && !t.cemi && !t.splitOf && t.date>=since){ const k=normNote(t.note); if(k.length<3) continue; const key=k+"|"+(t.accountId||("@"+t.paidBy)); if(!G.has(key)) G.set(key,[]); G.get(key).push(t); }
    const rec=live("recurring"), out=[];
    for(const [key,ts] of G){
      if(ign.has(key)) continue;
      const months=[...new Set(ts.map(t=>ymOf(t.date)))].sort(); if(months.length<3) continue;
      const amts=ts.map(t=>+t.amount).sort((a,b)=>a-b), med=amts[Math.floor(amts.length/2)];
      if(amts.filter(a=>Math.abs(a-med)<=Math.max(10,med*.15)).length < amts.length*.75) continue;
      if(ts.length > months.length*1.5) continue;           /* several a month: everyday spending, not a bill */
      const gaps=months.slice(1).map((m,i)=>diffM(months[i],m)).sort((a,b)=>a-b), g=gaps[Math.floor(gaps.length/2)];
      const freq=g<=1?"monthly":g===3?"quarterly":null; if(!freq || med<100) continue;
      if(gaps.filter(x=>freq==="monthly"?x<=2:Math.abs(x-3)<=1).length < gaps.length*.75) continue;   /* has to keep to its schedule */
      if(freq==="monthly" && months.length<4) continue;
      if(diffM(months[months.length-1], now) > (FREQ[freq]||1)+1) continue;   /* stopped */
      const last=ts.slice().sort((a,b)=>b.date.localeCompare(a.date))[0], words=new Set(normNote(last.note).split(" "));
      const inPlan=rec.some(r=>r.type==="expense" && (!r.end || r.end>=now) && (normNote(r.name).split(" ").some(w=>w.length>2 && words.has(w)) || (r.categoryId===last.categoryId && Math.abs(+r.amount-med)<=med*.1)));
      if(inPlan || live("loans").some(l=>!l.closedOn && normNote(l.name).split(" ").some(w=>w.length>2 && words.has(w)))) continue;   /* EMIs come from the loan */
      const days=ts.map(t=>+t.date.slice(8)).sort((a,b)=>a-b);
      out.push({key, name:last.note.trim(), amount:med, freq, day:days[Math.floor(days.length/2)], categoryId:last.categoryId, accountId:last.accountId||"", n:ts.length, last:last.date, monthly:med/(FREQ[freq]||1)});
    }
    return out.sort((a,b)=>b.monthly-a.monthly);
  });
}
function repeatsSection(){
  const R=findRepeats(); if(!R.length) return "";
  return `<div class="sh"><h3>Repeat payments found</h3><span class="note" style="margin:0">${R.length} not in your plan</span></div>
  <div class="list">${R.slice(0,12).map(r=>`<div class="row"><div class="main"><div class="t">${esc(r.name)}</div><div class="s">${FREQ_LBL[r.freq]} · about ${money(r.amount)} · seen ${r.n} times, last ${fmtD(r.last)}${r.accountId?` · ${esc(accName(r.accountId))}`:""}</div></div>
    <span class="btns" style="flex-wrap:nowrap;gap:6px"><button class="btn sm" type="button" data-repign="${esc(r.key)}">Not regular</button><button class="btn sm pri" type="button" data-repadd="${esc(r.key)}">Add</button></span></div>`).join("")}</div>
  <p class="note">Found in the last 12 months: the same note on the same account, a similar amount, on a schedule. Adding one puts it in your forecast.</p>`;
}
/* ---------- smart insights on Home ---------- */
const IC={
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l5-5 4 4 7-7"/><path d="M15 8h5v5"/></svg>',
  down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8l5 5 4-4 7 7"/><path d="M15 16h5v-5"/></svg>',
  alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/></svg>',
  repeat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l3 3-3 3"/><path d="M4 12V9a3 3 0 013-3h13M7 21l-3-3 3-3"/><path d="M20 12v3a3 3 0 01-3 3H4"/></svg>',
  piggy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11a7 6 0 0113-2h2v4l-2 1v3h-3v-2H9v2H6v-3a6 6 0 01-1-3z"/><path d="M15 10v.01"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12v.01"/></svg>'
};
/* the Home insight cards leave out property payments (plot or flat price, stamp duty, loan prepayments...): one-off,
   often loan-funded amounts that would swamp the usual-spending comparisons. They still count everywhere else. */
const propTxSet = () => memo("ptx", ()=>new Set(live("propItems").filter(i=>i.txnId && !i.deleted).map(i=>i.txnId)));
const mfigI = ym => memo("mfi:"+ym, ()=>{ const f=mfig(ym), P=propTxSet(); if(!P.size) return f; let ex=0; const bc=new Map(f.byCat);
  for(const t of live("txns")) if(t.type==="expense" && P.has(t.id) && expMonth(t)===ym && !offBook(t) && !histCovered(t)){ ex+=+t.amount; const k=catTop(t.categoryId)||"none"; bc.set(k,(bc.get(k)||0)-t.amount); }
  return ex ? {...f, expense:f.expense-ex, byCat:bc, propEx:ex} : f; });
function smartInsights(){
  const now=ymOf(today()), out=[], f=mfigI(now), past=lastMonths(6,addM(now,-1)).map(mfigI).filter(x=>x.expense>0.5);
  const med=v=>{ const a=[...v].sort((x,y)=>x-y), n=a.length; return n? (n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2) : 0; };
  const avg=med(past.map(x=>x.expense));   /* the typical month: one-off months (a loan closed, a big purchase) don't skew it */
  if(avg>0 && f.expense>0){ const d=(f.expense-avg)/avg*100;
    out.push(Math.abs(d)<8 ? {cls:"", ic:"piggy", tag:"On track", t:`${MN[+now.slice(5)-1]} heads for ${money(f.expense)}`, s:`About the same as a typical month (${money(avg)}, the middle of the last ${past.length}).`, at:'data-ins="trends"'}
      : {cls:d>0?"bad":"good", ic:d>0?"up":"down", tag:d>0?"Higher":"Lower", t:`Spending ${Math.abs(d).toFixed(0)}% ${d>0?"above":"below"} usual`, s:`${MN[+now.slice(5)-1]} heads for ${money(f.expense)} (so far + still due); a typical month is ${money(avg)}. Property payments are left out.`, at:'data-ins="trends"'}); }
  /* the category that jumped most against its last 3 months */
  { const p3=lastMonths(3,addM(now,-1)).map(mfigI); let best=null;
    for(const [k,v] of f.byCat){ if(k==="cardopen"||k==="repay"||k==="none") continue; const a=p3.reduce((s,x)=>s+(x.byCat.get(k)||0),0)/3, d=v-a; if(d>Math.max(2000,a*.3) && (!best||d>best.d)) best={k,v,a,d}; }
    if(best) out.push({cls:"warn", ic:"up", tag:"Category jump", t:`${catLbl(best.k)}: ${money(best.v)}`, s:best.a<1 ? `New this month: nothing in this category in the last 3 months.` : `${money(best.d)} more than your 3-month average of ${money(best.a)}.`, at:'data-ins="trends"'}); }
  for(const x of limitRows(now).filter(x=>x.p>=80).slice(0,2)) out.push({cls:x.p>100?"bad":"warn", ic:"alert", tag:x.p>100?"Over limit":"Near limit", t:`${x.c.name}: ${x.p.toFixed(0)}% of limit`, s:`${money(x.sp)} of ${money(x.lim)} this month${x.p>100?`, over by ${money(x.sp-x.lim)}`:""}.`, at:'data-ins="month"'});
  { const h=nwHistory(); if(h.length>=2){ const a=h[h.length-2], b=h[h.length-1], d=b.total-a.total; if(Math.abs(d)>1000) out.push({cls:d>=0?"good":"bad", ic:d>=0?"up":"down", tag:"Net worth", t:`${d>=0?"Up":"Down"} ${money(Math.abs(d))} since ${MN[+a.ym.slice(5)-1]}`, s:`Heading for ${money(b.total)} at month-end${a.est?" (last month is estimated)":""}.`, at:'data-acct="overview"'}); } }
  { const lm=mfigI(addM(now,-1)), li=incOf(lm); if(li>0.5){ const r=(li-lm.expense)/li*100; out.push({cls:r>=20?"good":r<0?"bad":"", ic:"piggy", tag:"Savings rate", t:`You kept ${r.toFixed(0)}% of ${MN[+addM(now,-1).slice(5)-1]}'s income`, s:`Income ${money(li)}, spent ${money(lm.expense)}. Investing counts as saving.`, at:'data-ins="trends"'}); } }
  { const R=findRepeats(); if(R.length) out.push({cls:"", ic:"repeat", tag:"Repeat payments", t:`${R.length} regular payment${R.length===1?"":"s"} not in your plan`, s:`${esc(R.slice(0,2).map(r=>r.name).join(", "))}${R.length>2?"…":""} · about ${money(R.reduce((a,r)=>a+r.monthly,0))} a month.`, at:'data-ptgo="regular"'}); }
  for(const g of live("goals")){ const x=goalSum(g); if(x.need>0.5 && x.monthsLeft>0){ out.push({cls:"", ic:"target", tag:"Goal", t:`${g.name}: ${x.pct.toFixed(0)}% there`, s:`Put aside ${money(x.need)} a month to reach ${money(+g.target)} by ${mShort(g.by)}.`, at:'data-ptgo="goals"'}); break; } }
  return out.slice(0,5);
}
function insightCards(){
  const I=smartInsights(); if(!I.length) return "";
  if(!S.insOpen) return `<button type="button" class="insfold" data-insopen="1"><span><b>Insights</b> · ${I.length}</span><span class="mut">${esc(I.map(x=>x.tag).slice(0,3).join(" · "))} ›</span></button>`;
  return `<div class="sh"><h3>Insights</h3><button class="lnk" type="button" data-insopen="1">Hide</button><button class="lnk" type="button" data-go="advisor">Ask your advisor ›</button></div><div class="icards">${I.map(x=>`<button class="icard ${x.cls}" type="button" ${x.at}><span class="ii">${IC[x.ic]}</span><span><span class="itag">${x.tag}</span><div class="it">${x.t}</div><div class="is">${x.s}</div></span></button>`).join("")}</div>`;
}
/* ---------- savings goals ---------- */
function goalSum(g){
  const linked=(g.holdings||[]).map(id=>byId("holdings",id)).filter(h=>h&&!h.deleted), fromH=linked.reduce((a,h)=>a+holdingSum(h).value,0);
  const have=(+g.saved||0)+fromH, target=+g.target||0, now=ymOf(today()), monthsLeft=g.by?Math.max(0,diffM(now,g.by)):0;
  const gap=Math.max(0,target-have);
  return {have, fromH, linked, target, pct:target>0?Math.min(100,have/target*100):0, gap, monthsLeft, need:monthsLeft>0?gap/monthsLeft:gap};
}
/* ---------- bills calendar ---------- */
const gcalUrl = (title, date, details, rrule) => { const d=date.replace(/-/g,""), n=addDay(date).replace(/-/g,"");
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${d}/${n}&details=${encodeURIComponent(details||"")}${rrule?`&recur=${encodeURIComponent("RRULE:"+rrule)}`:""}`; };
const gcalLink = (title, date, details, rrule, lbl="Add to Google Calendar") => `<a class="gcal" href="${esc(gcalUrl(title,date,details,rrule))}" target="_blank" rel="noopener">${lbl}</a>`;
function itemDay(it, ym){
  if(it.src==="c"){ const a=byId("accounts",it.id); return a&&+a.dueDay?+a.dueDay:null; }
  return it.day||null;
}
function billsCalendar(){
  const now=ymOf(today()), ym=S.bcM||now, [y,m]=ym.split("-").map(Number), nd=new Date(y,m,0).getDate(), lead=(new Date(y,m-1,1).getDay()+6)%7, td=today(), paid=paidMap();
  const items=planned(ym).map(it=>({...it, paid:!!paid.get(it.key)||!!it.paidC, dd:Math.min(nd, itemDay(it,ym)||0)}));
  const by=new Map(); for(const it of items){ if(!it.dd) continue; if(!by.has(it.dd)) by.set(it.dd,[]); by.get(it.dd).push(it); }
  const col=it=>it.type==="income"?"var(--v1)":it.type==="investment"?"var(--v2)":it.type==="transfer"?"var(--vO)":"var(--v3)";
  const selD=S.bcD && S.bcD.startsWith(ym) ? +S.bcD.slice(8) : null;
  let cells=["M","T","W","T","F","S","S"].map(d=>`<div class="hw">${d}</div>`).join("")+Array.from({length:lead},()=>'<div class="bd x"></div>').join("");
  for(let d=1; d<=nd; d++){ const L=by.get(d)||[], ds=`${ym}-${pad(d)}`, out=L.filter(i=>i.type!=="income"&&i.type!=="transfer").reduce((a,i)=>a+(i.src==="b"?i.budget:i.amount),0);
    cells+=`<button type="button" class="bd ${ds===td?"td":""} ${ds<td?"past":""}" data-bcd="${ds}" aria-pressed="${selD===d}" aria-label="${dLabel(ds)}: ${L.length} item${L.length===1?"":"s"}"><span class="n">${d}</span>${L.length?`<span class="dots">${L.slice(0,4).map(i=>`<i style="background:${col(i)};${i.paid?"opacity:.35":""}"></i>`).join("")}</span>${out>0.5?`<span class="a">${AX(out)}</span>`:""}`:""}</button>`; }
  const dayList = selD ? (by.get(selD)||[]) : items.filter(i=>!i.paid && i.dd && `${ym}-${pad(i.dd)}`>=td).sort((a,b)=>a.dd-b.dd).slice(0,8);
  const noDay=items.filter(i=>!i.dd);
  return `<div class="monthbar"><button class="btn sm" type="button" data-bcm="-1" aria-label="Previous month">‹</button><div class="m">${mLabel(ym)}</div><button class="btn sm" type="button" data-bcm="1" aria-label="Next month">›</button></div>
  <div class="bcal">${cells}</div>
  <div class="legend" style="margin:8px 4px 0"><span><i style="background:var(--v3)"></i>Bills &amp; EMIs</span><span><i style="background:var(--v2)"></i>SIPs</span><span><i style="background:var(--v1)"></i>Income</span><span><i style="background:var(--v3);opacity:.35"></i>Paid</span></div>
  <div class="sh"><h3>${selD?dLabel(`${ym}-${pad(selD)}`):"Coming up"}</h3>${selD?`<button class="lnk" type="button" data-bcd="">Show coming up ›</button>`:""}</div>
  <div class="list">${dayList.length?dayList.map(it=>plannedRow(it, ym===now)).join(""):`<div class="empty">${selD?"Nothing due on this day.":"Nothing else due this month."}</div>`}</div>
  ${noDay.length?`<div class="sh"><h3>Any day this month</h3></div><div class="list">${noDay.map(it=>plannedRow(it, ym===now)).join("")}</div>`:""}
  <p class="note">Add a due day to regular items (Plan › Regular) to place them on the calendar. For phone reminders, add your bills to Google Calendar from Settings › Reminders.</p>`;
}

/* ---------- saved views (synced) ---------- */
const VIEW_KEYS=["type","cat","acc","tag","period","from","to","q","min","max","hist","uncat"];
const viewOf = f => { const o={}; for(const k of VIEW_KEYS) if(f[k]!==undefined && f[k]!=="" && f[k]!==false) o[k]=f[k]; return o; };
const sameView = (a,b) => JSON.stringify(viewOf(a))===JSON.stringify(viewOf({type:"all",period:"month",...b}));
function viewChips(){
  const V=live("views").sort((a,b)=>a.name.localeCompare(b.name)); if(!V.length) return "";
  const f=txFilter();
  return `<div class="vchips" role="group" aria-label="Saved views">${V.map(v=>`<button type="button" class="vc ${sameView(f,v.f)?"on":""}" data-view="${esc(v.id)}">★ ${esc(v.name)}</button>`).join("")}</div>`;
}
/* ---------- bulk edit ---------- */
const SEL = () => (S.sel = S.sel || new Set());
function bulkBar(){
  if(!S.selOn) return "";
  const n=SEL().size;
  return `<div class="bulkbar" role="toolbar" aria-label="Selected transactions"><b>${n} selected</b><button type="button" data-bulk="all">Select all shown</button>${n?`<button type="button" data-bulk="cat">Category</button><button type="button" data-bulk="tag">Add tag</button><button type="button" class="del" data-bulk="del">Delete</button>`:""}<button type="button" data-bulk="done">Done</button></div>`;
}
function bulkAct(k){
  const ids=[...SEL()], tx=ids.map(id=>byId("txns",id)).filter(t=>t&&!t.deleted);
  if(k==="done"){ S.selOn=false; SEL().clear(); return render(); }
  if(k==="all"){ const f=txFilter(); for(const t of live("txns")) if(txMatches(t,f) && t.type!=="carry") SEL().add(t.id); return render(); }
  if(!tx.length) return;
  if(k==="del") return askConfirm(`Delete ${tx.length} transaction${tx.length===1?"":"s"}? This can't be undone.`,"Delete",()=>{ for(const t of tx){ t.deleted=true; stamp(t); } SEL().clear(); changed(); toast(`Deleted ${tx.length}`); });
  if(k==="tag") return openSheet(`Tag ${tx.length} transaction${tx.length===1?"":"s"}`, `${field(["tag","Tag","text",{list:"btags",ph:"e.g. Home, Trip"}])}<datalist id="btags">${allTags().map(g=>`<option value="${esc(g)}">`).join("")}</datalist>
    <div class="btns"><button class="btn pri" id="sv" type="button">Add tag</button><button class="btn" id="rm" type="button">Remove this tag</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
      s.querySelector("#cx").onclick=closeModal;
      const go=add=>{ const g=val("tag").replace(/\s+/g," ").trim(); if(!g){ toast("Type a tag."); return; } const g2=allTags().find(x=>x.toLowerCase()===g.toLowerCase())||g;
        for(const t of tx){ const tg=(t.tags||[]).filter(x=>x!==g2); if(add) tg.push(g2); if(tg.length) t.tags=tg; else delete t.tags; stamp(t); } closeModal(); changed(); toast(add?`Tagged ${tx.length}`:`Tag removed from ${tx.length}`); };
      s.querySelector("#sv").onclick=()=>go(true); s.querySelector("#rm").onclick=()=>go(false); });
  if(k==="cat"){ const ex=tx.filter(t=>t.type==="expense"), inc=tx.filter(t=>t.type==="income");
    if(!ex.length && !inc.length){ toast("Only expenses and income have categories."); return; }
    return openSheet(`Set category`, `${ex.length?field(["ce",`Category for ${ex.length} expense${ex.length===1?"":"s"}`,"select",{options:[["","Leave as is"],...catOpts("expense")]}]):""}${inc.length?field(["ci",`Category for ${inc.length} income entr${inc.length===1?"y":"ies"}`,"select",{options:[["","Leave as is"],...catOpts("income")]}]):""}
      ${tx.length>ex.length+inc.length?`<p class="note">${tx.length-ex.length-inc.length} transfers, investments or loan entries are left alone.</p>`:""}<div class="btns"><button class="btn pri" id="sv" type="button">Apply</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
      s.querySelector("#cx").onclick=closeModal;
      s.querySelector("#sv").onclick=()=>{ const ce=val("ce"), ci=val("ci"); let n=0; for(const t of ex) if(ce){ t.categoryId=ce; stamp(t); n++; } for(const t of inc) if(ci){ t.categoryId=ci; stamp(t); n++; } closeModal(); if(n){ changed(); toast(`Updated ${n}`); } }; }); }
}
/* ---------- clean-up: uncategorised entries and possible duplicates ---------- */
function dupPairs(){
  const ign=new Set(prefGet("dupIgnore",[])), G=new Map();
  for(const t of live("txns")){ if(t.type==="carry"||t.type==="loan"||t.link||t.cemi||t.splitOf) continue; const nn=String(t.note||"").toLowerCase().replace(/\(history\)/g,"").replace(/[^a-z0-9]+/g," ").trim(), k=[t.type,t.accountId||"@"+t.paidBy,t.toAccountId||"",(+t.amount).toFixed(2),t.date,nn||t.categoryId||""].join("|"); if(!G.has(k)) G.set(k,[]); G.get(k).push(t); }
  const out=[]; for(const [k,ts] of G) if(ts.length>1 && !ign.has(k)) out.push({k, ts}); return out.sort((a,b)=>b.ts[0].date.localeCompare(a.ts[0].date));
}
function cleanupSheet(){
  const unc=live("txns").filter(t=>(t.type==="expense"||t.type==="income") && !byId("categories",t.categoryId)), D=dupPairs();
  openSheet("Clean up", `
    <div class="list"><div class="row ${unc.length?"tap":""}" ${unc.length?'id="cuUnc" role="button" tabindex="0"':""}><div class="main"><div class="t">Uncategorised</div><div class="s">${unc.length?`${unc.length} expense and income entries with no category`:"Everything has a category"}</div></div>${unc.length?'<span class="pill warn">Show</span>':'<span class="pill">✓</span>'}</div></div>
    <p class="sect">Possible duplicates · ${D.length}</p>
    <div class="list">${D.length?D.slice(0,40).map(p=>`<div class="row"><div class="main"><div class="t">${money(p.ts[0].amount)} · ${fmtD(p.ts[0].date)}</div><div class="s">${esc(p.ts.map(t=>(t.note||catName(t.categoryId)||TYPE_LBL[t.type]||"")+(t.hist?" (history)":"")).join("  ·  "))} · ${esc(accName(p.ts[0].accountId))}</div></div>
      <span class="btns" style="flex-wrap:nowrap;gap:6px"><button class="btn sm" type="button" data-dupok="${esc(p.k)}">Not duplicates</button><button class="btn sm danger" type="button" data-dupdel="${esc(p.ts[p.ts.length-1].id)}">Delete one</button></span></div>`).join(""):'<div class="empty">No duplicates found.</div>'}</div>
    <p class="note">Duplicates are entries of the same type, amount, account and date. Use Select on the Transactions page to change many entries at once.</p>
    <div class="btns"><button class="btn" id="cx" type="button">Close</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    const u=s.querySelector("#cuUnc"); if(u) u.onclick=()=>{ S.f={type:"all",cat:"",acc:"",tag:"",period:"all",from:"",to:"",q:"",uncat:true}; S.txLimit=0; closeModal(); go("activity"); };
    s.querySelectorAll("[data-dupok]").forEach(b=>b.onclick=e=>{ e.stopPropagation(); const a=prefGet("dupIgnore",[]); a.push(b.dataset.dupok); prefSet("dupIgnore",a.slice(-500)); cleanupSheet(); });
    s.querySelectorAll("[data-dupdel]").forEach(b=>b.onclick=e=>{ e.stopPropagation(); const t=byId("txns",b.dataset.dupdel); if(t){ t.deleted=true; stamp(t); MEMO=new Map(); S.dirty=true; saveLocal(); scheduleSync(); render(); toast("Deleted"); } cleanupSheet(); });
  });
}
/* ---------- split one spend across categories ---------- */
function splitSheet(base){
  const rows=[{c:base.categoryId||"", a:+base.amount||0},{c:"",a:""}], total=+base.amount||0;
  const draw=()=>{ const left=total-rows.reduce((s,r)=>s+(+r.a||0),0);
    $("#splitRows").innerHTML=rows.map((r,i)=>`<div class="grid2" style="align-items:end">${field(["sc"+i,i===0?"Category":"","select",{value:r.c,options:[["","Choose"],...catOpts("expense")]}])}${field(["sa"+i,i===0?"Amount (₹)":"","number",{value:r.a,step:"0.01"}])}</div>`).join("");
    $("#splitLeft").textContent = Math.abs(left)<0.005 ? "✓ Adds up" : left>0 ? `${money(left)} still to assign` : `${money(-left)} too much`;
    rows.forEach((r,i)=>{ $("#f_sc"+i).onchange=e=>{ r.c=e.target.value; }; $("#f_sa"+i).oninput=e=>{ r.a=e.target.value.replace(/,/g,""); const l=total-rows.reduce((s,x)=>s+(+x.a||0),0); $("#splitLeft").textContent=Math.abs(l)<0.005?"✓ Adds up":l>0?`${money(l)} still to assign`:`${money(-l)} too much`; }; }); };
  openSheet(`Split ${money(total)}`, `<p class="note">${esc(base.note||"This spend")} · ${fmtD(base.date)} · ${esc(base.paidBy?payerLbl(base):accName(base.accountId))}. Each part becomes its own entry with the same date, account, note and tags.</p>
    <div id="splitRows"></div><p class="note" id="splitLeft" style="font-weight:700"></p>
    <div class="btns"><button class="btn sm" id="addRow" type="button">+ Add a part</button></div>
    <div class="btns"><button class="btn pri" id="sv" type="button">Save split</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    draw();
    s.querySelector("#addRow").onclick=()=>{ rows.push({c:"",a:""}); draw(); };
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#sv").onclick=()=>{ const parts=rows.filter(r=>+r.a>0); if(parts.length<2){ toast("Add at least two parts."); return; }
      if(parts.some(r=>!r.c)){ toast("Pick a category for each part."); return; }
      if(Math.abs(parts.reduce((x,r)=>x+ +r.a,0)-total)>0.005){ toast("The parts must add up to "+money(total)+"."); return; }
      const gid=base.id||uid(); parts.forEach((r,i)=>{ const o={...base, id:i===0?gid:uid(), type:"expense", amount:Math.round(+r.a*100)/100, categoryId:r.c, splitOf:gid}; delete o.budgetId; if(i===0 && base.budgetId) o.budgetId=base.budgetId; put("txns", o); });
      closeModal(); changed(); toast(`Split into ${parts.length}`); };
  });
}
/* ---------- EPF passbook: reading EPFO's member passbook PDFs ---------- */
const EPF_MON={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
const epfN = s => +String(s).replace(/,/g,"") || 0;
/* lines of one passbook (one financial year of one member ID) → {acc, est, fy, ob, int, close, rows} */
function epfParse(lines){
  const L=lines.map(l=>String(l).replace(/\s*\|\s*/g,"  ").replace(/\s+$/,""));
  const B={acc:"", est:"", fy:null, dob:"", ob:null, int:null, close:null, rows:[]};
  const three = s => { const m=s.match(/(-?[\d,]+)\s+(-?[\d,]+)\s+(-?[\d,]+)\s*$/); return m?[epfN(m[1]),epfN(m[2]),epfN(m[3])]:null; };
  for(let i=0;i<L.length;i++){
    const l=L[i]; let m;
    if(!B.acc && /Member ID/i.test(l) && (m=l.match(/\b([A-Z]{5}\d{10,17})\b/))) B.acc=m[1];
    if(!B.est && (m=l.match(/\b[A-Z]{5}\d{7,10}\s*\/\s*(.+)$/)) && !/Member/i.test(l)) B.est=m[1].trim();
    if(!B.dob && /Date of Birth/i.test(l) && (m=l.match(/(\d\d)-(\d\d)-(\d{4})/))) B.dob=`${m[3]}-${m[2]}-${m[1]}`;
    if(B.fy==null && (m=l.match(/Financial Year\s*-\s*(\d{4})\s*-\s*\d{4}/))) B.fy=+m[1];
    if(/OB Int\. Updated/i.test(l)) B.ob=three(l);
    else if(/^\s*Int\. Updated upto/i.test(l)) B.int=three(l);
    else if(/Closing Balance/i.test(l)) B.close=three(l);
    else if(/IPR\s*\(Back Period\).*Contribution only/i.test(l)){ const v=three(l); if(v && (v[0]||v[1]||v[2])) B.rows.push({k:"ipr", wm:null, d:null, emp:v[0], er:v[1], eps:v[2], note:"Back-period credit (IPR)"}); }
    else if((m=l.match(/^\s*([A-Z][a-z]{2})-(\d{4})\s+(\d\d)-(\d\d)-(\d{4})\s+(CR|DR)\b(.*)$/)) && EPF_MON[m[1]]){
      const nums=(m[7].match(/(?:^|\s)-?[\d,]+(?=\s|$)/g)||[]).map(x=>x.trim()).filter(x=>!/^\d{6}$/.test(x));
      if(nums.length<5) continue;
      const [wage,epsw,emp,er,eps]=nums.slice(-5).map(epfN);
      const ctx=L.slice(Math.max(0,i-4), i+3).join(" ");
      const r={k:m[6]==="DR"?"dr":"cont", wm:`${m[2]}-${String(EPF_MON[m[1]]).padStart(2,"0")}`, d:`${m[5]}-${m[4]}-${m[3]}`, wage, epsw, emp, er, eps};
      if(r.k==="cont" && /TRANSFER IN/i.test(ctx) && !wage){ r.k="tin"; const f=ctx.match(/Old Member[\s\S]*?:\s*([A-Z]{5}\d{10,17})/i); if(f) r.from=f[1]; r.note="Transfer in"+(/INTEREST/i.test(ctx)?" (interest)":""); }
      if(r.k==="dr"){ const p=m[7].match(/PARA\s*[\d()a-z.]+/i); r.note=p?"Claim "+p[0].replace(/\s+/g," "):"Withdrawal"; }
      B.rows.push(r);
    }
  }
  if(B.fy!=null) B.rows.forEach(r=>{ if(r.k==="ipr") r.d=`${B.fy}-04-01`; });
  return B;
}
/* ---------- EPF: everything worked out from the loaded passbooks ---------- */
const EPF_RETIRE=58;
const epfKey = r => [r.k, r.wm||"", r.d||"", r.emp, r.er, r.eps].join("|");
function epfCalc(h, opt={}){
  const E=h && h.epf, books=(E && E.books)||{}; if(!E || (!Object.keys(books).length && !(E.manual||[]).length)) return null;
  const now=opt.today||today(), rate=(+E.rate||8.25)/100, raise=(+E.raise||0)/100, age=+E.retireAge||EPF_RETIRE;
  const rows=[], ints=[], accs=[], issues=[]; let epfBal=0, epsBal=0;
  for(const [acc,b] of Object.entries(books)){
    const fys=Object.keys(b.fys||{}).map(Number).sort((a,b)=>a-b); if(!fys.length) continue;
    for(let i=1;i<fys.length;i++) if(fys[i]!==fys[i-1]+1) issues.push(`${acc}: passbook for FY ${fys[i-1]+1}-${String((fys[i-1]+2)%100).padStart(2,"0")} is missing`);
    for(const fy of fys){ const Y=b.fys[fy]; Y.rows.forEach(r=>rows.push({...r, acc, fy}));
      if(Y.int && (Y.int[0]||Y.int[1]||Y.int[2])) ints.push({k:"int", acc, fy, d:`${fy+1}-03-31`, emp:Y.int[0], er:Y.int[1], eps:Y.int[2]}); }
    const lastFy=fys[fys.length-1], Y=b.fys[lastFy], v=[...(Y.ob||[0,0,0])];
    for(const r of Y.rows){ const s=r.k==="dr"?-1:1; v[0]+=s*r.emp; v[1]+=s*r.er; v[2]+=s*r.eps; }
    if(Y.int){ v[0]+=Y.int[0]; v[1]+=Y.int[1]; v[2]+=Y.int[2]; }
    if(Y.close && (Y.close[0]!==v[0] || Y.close[1]!==v[1])) issues.push(`${acc}: FY ${lastFy} doesn't add up to the passbook's closing balance`);
    accs.push({acc, est:b.est||"", first:fys[0], last:lastFy, emp:v[0], er:v[1], eps:v[2]});
    epfBal+=v[0]+v[1]; epsBal+=v[2];
  }
  accs.sort((a,b)=>a.first-b.first);
  /* entries you added by hand: used until a passbook covering them is loaded */
  const fyOfD = d => { const y=+d.slice(0,4), m=+d.slice(5,7); return m>=4?y:y-1; };
  const pbWm=new Set(rows.filter(r=>r.k==="cont"&&r.wm).map(r=>r.wm)), pbIntFy=new Set(ints.map(x=>x.fy));
  const manual=[], manualOld=[];
  for(const m of (E.manual||[])){
    const fy=m.k==="int" ? +m.fy : fyOfD(m.d);
    const sup = m.k==="cont" ? pbWm.has(m.wm) : m.k==="int" ? pbIntFy.has(fy) : rows.some(r=>r.k==="dr" && r.d===m.d && r.emp===+m.emp && r.er===+m.er);
    if(sup){ manualOld.push(m); continue; }
    const r={k:m.k==="wd"?"wd":m.k, wm:m.wm||null, d:m.k==="int"?`${fy+1}-03-31`:m.d, wage:0, epsw:+m.epsw||0, emp:+m.emp||0, er:+m.er||0, eps:+m.eps||0, note:m.note||"", acc:"manual", fy, manual:true, mid:m.id};
    if(m.k==="int") ints.push(r); else rows.push(r);
    const sg=m.k==="wd"?-1:1; epfBal+=sg*(r.emp+r.er); epsBal+=sg*r.eps; manual.push(r);
  }
  /* a DR in an account that was moved into another loaded account is that transfer, not a withdrawal */
  const tins=rows.filter(r=>r.k==="tin");
  for(const r of rows) if(r.k==="dr"){ const t=tins.filter(x=>x.from===r.acc).reduce((a,x)=>a+x.emp+x.er,0); r.k = t && Math.abs(t-(r.emp+r.er))<=Math.max(10,(r.emp+r.er)*.02) ? "tout" : "wd"; }
  for(const r of rows) if(r.k==="tin") r.internal=!!(r.from && books[r.from]);
  rows.sort((a,b)=>(a.d||"")<(b.d||"")?-1:(a.d||"")>(b.d||"")?1:0);
  const sum=(f,k)=>rows.filter(f).reduce((a,r)=>a+r[k],0);
  const isC=r=>r.k==="cont"||r.k==="ipr", isW=r=>r.k==="wd", isX=r=>r.k==="tin"&&!r.internal;
  const contEmp=sum(isC,"emp"), contEr=sum(isC,"er"), contEps=sum(isC,"eps"), wd=sum(isW,"emp")+sum(isW,"er"), tinExt=sum(isX,"emp")+sum(isX,"er");
  const interest=ints.reduce((a,x)=>a+x.emp+x.er,0), invested=contEmp+contEr+tinExt-wd;
  /* months you haven't loaded a passbook for yet: the usual contribution, marked expected */
  const conts=rows.filter(r=>r.k==="cont"&&r.wm), lastWm=conts.reduce((m,r)=>r.wm>m?r.wm:m,"");
  const lastRow=conts.filter(r=>r.wm===lastWm).sort((a,b)=>a.d<b.d?1:-1)[0];
  const mon=lastRow?{emp:lastRow.emp, er:lastRow.er, eps:lastRow.eps, epsw:lastRow.epsw, wage:lastRow.wage}:{emp:0,er:0,eps:0,epsw:0,wage:0};
  const dNow=new Date(now+"T00:00"); dNow.setDate(dNow.getDate()-15);
  const upTo=addM(`${dNow.getFullYear()}-${String(dNow.getMonth()+1).padStart(2,"0")}`,-1);
  const expected=[]; if(lastWm && E.expected!==false) for(let wm=addM(lastWm,1); wm<=upTo; wm=addM(wm,1)) expected.push({k:"exp", wm, d:`${addM(wm,1)}-15`, ...mon});
  const expAmt=expected.reduce((a,r)=>a+r.emp+r.er,0), expEps=expected.reduce((a,r)=>a+r.eps,0);
  /* interest builds up month by month on the balance at the start of each month and is credited each 31 March */
  const fyOfYm = ym => { const [y,m]=ym.split("-").map(Number); return m>=4?y:y-1; };
  const nowYm=now.slice(0,7), fyNow=fyOfYm(nowYm);
  let start=0; for(const a of accs){ const Y=books[a.acc].fys[fyNow]; if(Y) start+=(Y.ob?Y.ob[0]+Y.ob[1]:0); else if(a.last<fyNow) start+=a.emp+a.er; }
  for(const r of manual) if(r.fy<fyNow) start+=(r.k==="wd"?-1:1)*(r.emp+r.er);
  const credit=new Map(); const addC=(ym,v)=>credit.set(ym,(credit.get(ym)||0)+v);
  for(const r of rows) if(r.d && fyOfYm(r.d.slice(0,7))===fyNow && (isC(r)||isX(r))) addC(r.d.slice(0,7), r.emp+r.er);
  const debit=new Map(); for(const r of rows) if(isW(r) && r.d && fyOfYm(r.d.slice(0,7))===fyNow) debit.set(r.d.slice(0,7),(debit.get(r.d.slice(0,7))||0)+r.emp+r.er);
  for(const r of expected) if(fyOfYm(r.d.slice(0,7))===fyNow) addC(r.d.slice(0,7), r.emp+r.er);
  let b=start, accrued=0;
  for(let ym=`${fyNow}-04`; ym<nowYm; ym=addM(ym,1)){ b-=debit.get(ym)||0; accrued+=b*rate/12; b+=credit.get(ym)||0; }
  /* projection to retirement: same contribution every month (plus any yearly raise), interest at the rate you set */
  const dob=E.dob||"", retYm=dob?addM(dob.slice(0,7), age*12):null;
  const proj=[]; let corpus=null, svcFuture=0;
  if(retYm && retYm>nowYm && !opt.noProj){
    let bal=start, intY=0, m={...mon}, ym=`${fyNow}-04`;
    const futureCredit=new Map(credit);            /* this FY so far: actual + expected */
    let lastCreditedWm=expected.length?expected[expected.length-1].wm:lastWm;
    for(;;){
      if(ym>=nowYm){ /* from now on, the next wage month is credited each month */
        if(ym.endsWith("-04") && ym>nowYm && raise) m={...m, emp:m.emp*(1+raise), er:m.er*(1+raise)};
        const wm=addM(ym,-1); if(wm>lastCreditedWm && wm<retYm){ futureCredit.set(ym,(futureCredit.get(ym)||0)+m.emp+m.er); lastCreditedWm=wm; if(m.eps>0) svcFuture++; }
      }
      bal-=debit.get(ym)||0; intY+=bal*rate/12; bal+=futureCredit.get(ym)||0;
      if(ym.endsWith("-03")){ bal+=intY; intY=0; proj.push([`${ym.slice(0,4)}-03-31`, bal]); }
      if(ym===retYm){ bal+=intY; corpus=bal; proj.push([`${ym}-01`, bal]); break; }
      ym=addM(ym,1);
    }
  }
  /* pension (EPS): service = months with a pension contribution */
  const epsMonths=new Set(conts.filter(r=>r.eps>0).map(r=>r.wm)); expected.forEach(r=>{ if(r.eps>0) epsMonths.add(r.wm); });
  const svcNow=epsMonths.size, svcAt58=svcNow+svcFuture, yrs=m=>Math.floor(m/12)+(m%12>=6?1:0);
  const svcYrs=yrs(svcAt58), bonus=svcYrs>=20?2:0;
  const pYrs=Math.min(35, svcYrs+bonus);   /* pensionable service is capped at 35 years */
  const sal=mon.epsw||15000, pension=svcAt58>=120 ? Math.max(1000, Math.round(sal*pYrs/70)) : null, pensionLow=svcAt58>=120 ? Math.max(1000, Math.round(Math.min(sal,15000)*pYrs/70)) : null;
  const epsLeft=accs.filter((a,i)=>a.eps>0 && i<accs.length-1);
  /* FY-end balances from the passbooks (EPF only, both shares) */
  const fyEnd=new Map(); for(const [acc,bk] of Object.entries(books)) for(const [fy,Y] of Object.entries(bk.fys||{})){ if(!Y.close) continue; fyEnd.set(+fy,(fyEnd.get(+fy)||0)+Y.close[0]+Y.close[1]); }
  return {accs, rows, ints, issues, manual, manualOld, epfBal, epsBal, contEmp, contEr, contEps, wd, tinExt, interest, invested, expected, expAmt, expEps, mon, lastWm, value:epfBal+expAmt, inv:invested+expAmt,
    accrued, rate, raise, fyNow, retYm, age, corpus, proj, svcNow, svcAt58, svcYrs, bonus, pYrs, sal, pension, pensionLow, epsLeft, fyEnd, dob,
    lastCredit:rows.filter(r=>r.d).reduce((m,r)=>r.d>m?r.d:m,""), partial:epfBal*.75};
}
/* merge freshly read passbooks into the holding: one passbook replaces the same member ID and financial year */
function epfMerge(E, list){
  E={...(E||{}), books:{...((E&&E.books)||{})}}; let n=0;
  for(const B of list){ if(!B.acc || B.fy==null) continue;
    const bk=E.books[B.acc]={...(E.books[B.acc]||{fys:{}})}; bk.fys={...bk.fys}; if(B.est) bk.est=B.est;
    bk.fys[B.fy]={ob:B.ob, int:B.int, close:B.close, rows:B.rows}; n++;
    if(B.dob && !E.dob) E.dob=B.dob; }
  return {E, n};
}

/* holdingSum needs only the balance: worked out once per holding version and day */
const EPF_MEMO=new WeakMap();
function epfQuick(h){ const k=today()+"|"+(h.updatedAt||""); const m=EPF_MEMO.get(h); if(m && m.k===k) return m.v; const v=epfCalc(h,{noProj:true}); EPF_MEMO.set(h,{k,v}); return v; }
/* reading the PDF text with pdf.js (bundled with the app in vendor/pdfjs) */
async function epfPdfLines(file){
  const base=new URL("vendor/pdfjs/", location.href).href;
  const pdfjs=await import(base+"pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc=base+"pdf.worker.min.mjs";
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()), verbosity:0, isEvalSupported:false}), doc=await task.promise, out=[];
  for(let p=1;p<=doc.numPages;p++){ const tc=await (await doc.getPage(p)).getTextContent(), rows=[];
    for(const it of tc.items){ if(!it.str || !it.str.trim()) continue; const y=it.transform[5]; let r=rows.find(r=>Math.abs(r.y-y)<=2); if(!r){ r={y, its:[]}; rows.push(r); } r.its.push([it.transform[4], it.str]); }
    rows.sort((a,b)=>b.y-a.y).forEach(r=>out.push(r.its.sort((a,b)=>a[0]-b[0]).map(x=>x[1].trim()).join(" | "))); }
  try{ await task.destroy(); }catch(e){} return out;
}
async function epfLoadFiles(files){
  const list=[], bad=[];
  for(const f of files){ try{ const B=epfParse(await epfPdfLines(f)); if(!B.acc || B.fy==null || !B.ob) throw new Error("not an EPF passbook"); list.push(B); } catch(e){ console.warn("passbook", f.name, e); bad.push(f.name); } }
  return {list, bad};
}
/* ---------- EPF / PPF details ---------- */
const fyOf = d => { const y=+d.slice(0,4), m=+d.slice(5,7); return m>=4?y:y-1; };   /* FY start year */
const fyLbl = y => `${y}-${String((y+1)%100).padStart(2,"0")}`;
function epfInfo(h, x){
  const r=(+h.rate||8.25)/100, mon=(+h.epfEmp||0)+(+h.epfEr||0), bal=x.value, now=ymOf(today());
  const svc=h.joined?diffM(h.joined, now):null, can=svc==null?null:svc>=12;
  const proj=n=>{ let b=bal; for(let i=0;i<n;i++) b=b*(1+r)+mon*12*(1+r*.46); return b; };
  return {r, mon, bal, svc, can, wd:bal*.75, int:bal*r, p5:proj(5), p10:proj(10)};
}
function ppfInfo(h, x){
  const r=(+h.rate||7.1)/100, bal=x.value, td=today(), fy0=h.opened?fyOf(h.opened):null, fyNow=fyOf(td);
  if(fy0==null) return {r, bal};
  const idx=fyNow-fy0+1, matures=`${fy0+16}-04-01`, yrsLeft=Math.max(0,(fy0+16)-(fyNow+1));
  /* past FY-end balances, worked back from today with your PPF deposits */
  const dep=new Map(); for(const t of live("txns")) if(t.type==="investment" && (invTypeOf(t)==="PPF" || (t.instrument||"").trim().toLowerCase()===(h.instrument||h.name).trim().toLowerCase())) dep.set(fyOf(t.date),(dep.get(fyOf(t.date))||0)+ +t.amount);
  const endOf=fy=>{ let b=bal-(dep.get(fyNow)||0); for(let y=fyNow-1; y>fy; y--) b=b/(1+r)-(dep.get(y)||0); return Math.max(0,b); };
  const wdOk=idx>=7, w=wdOk?Math.min(endOf(fyNow-4), endOf(fyNow-1))*.5:0, loanOk=idx>=3 && idx<=6, ln=loanOk?endOf(fyNow-2)*.25:0;
  let mv=bal; for(let i=0;i<yrsLeft;i++) mv=mv*(1+r)+(+h.yearly||0)*(1+r);
  return {r, bal, fy0, idx, matures, yrsLeft, wdOk, w, wdFrom:fyLbl(fy0+6), loanOk, ln, mv, haveDeps:dep.size>0};
}
/* ---------- EPF: passbook, projection and pension in one sheet ---------- */
const fyShort = fy => `FY${String(fy+1).slice(2)}`;
const svcTxt = m => { const y=Math.floor(m/12), r=m%12; return `${y} yr${y===1?"":"s"}${r?` ${r} mo`:""}`; };
function epfSheet(h, back){
  const e=epfCalc(h); if(!e){ toast("Load your passbooks first."); return; }
  const E=h.epf, nowFy=e.fyNow, rs0=v=>(v<0?"−":"")+"₹"+Math.abs(Math.round(v)).toLocaleString("en-IN");
  /* balance by year: passbook FY-end balances, then the projection (dashed) */
  const firstFy=Math.min(...e.fyEnd.keys()), lastProjFy=e.proj.length ? (()=>{ const [d]=e.proj[e.proj.length-1]; const y=+d.slice(0,4), m=+d.slice(5,7); return m>=4?y:y-1; })() : nowFy;
  const fys=[]; for(let y=firstFy; y<=Math.max(nowFy,lastProjFy); y++) fys.push(y);
  const projAt=new Map(e.proj.map(([d,v])=>{ const y=+d.slice(0,4), m=+d.slice(5,7); return [m>=4?y:y-1, v]; }));
  const curVal=e.value;
  const act=fys.map(y=>y<nowFy ? (e.fyEnd.get(y)??null) : y===nowFy ? curVal : null);
  const prj=fys.map(y=>y===nowFy ? curVal : y>nowFy ? (projAt.get(y)??null) : null);
  const balSer=[{name:"Balance (passbook)", color:"var(--v1)", values:act},{name:"Projected", color:"var(--v2)", values:prj, dash:true}];
  const iNow=fys.indexOf(nowFy);
  const balChart=chartCard("EPF balance by year", e.corpus?`≈ ${short(e.corpus)} at ${e.age}`:"", lineChart({labels:fys.map(fyShort), ticks:fys.map(fyShort), full:fys.map(y=>`FY ${fyLbl(y)}`), series:balSer, h:210, mark:iNow, markLabel:"Now", fmt:short, aria:"EPF balance at the end of each financial year, from your passbooks and projected to retirement"}),
    legendHtml(balSer)+`<p class="cnote">Your share and the employer's share together. ${E.raise?`Contributions grow ${E.raise}% a year`:"Contributions stay at today's amount"}, interest at ${(e.rate*100).toFixed(2)}% a year, to ${mLabel(e.retYm||nowFy+"-03")}.</p>`);
  /* what went in each year */
  const pfys=[...new Set([...e.rows.map(r=>r.fy), ...e.ints.map(x=>x.fy)])].sort((a,b)=>a-b);
  const by=(f,k)=>pfys.map(y=>e.rows.filter(r=>r.fy===y && f(r)).reduce((a,r)=>a+r[k],0));
  const isC=r=>r.k==="cont"||r.k==="ipr"||(r.k==="tin"&&!r.internal);
  const you=by(isC,"emp"), er=by(isC,"er"), intr=pfys.map(y=>e.ints.filter(x=>x.fy===y).reduce((a,x)=>a+x.emp+x.er,0)), wdv=pfys.map((y,i)=>-(by(r=>r.k==="wd","emp")[i]+by(r=>r.k==="wd","er")[i]));
  const inSer=[{name:"Your share",color:"var(--v1)",values:you},{name:"Employer",color:"var(--v2)",values:er},{name:"Interest",color:"var(--v3)",values:intr}];
  if(wdv.some(v=>v<0)) inSer.push({name:"Withdrawn",color:"var(--v4)",values:wdv});
  const inChart=chartCard("Added each year", `${rs0(e.contEmp+e.contEr)} paid in · ${rs0(e.interest)} interest`, barChart({labels:pfys.map(fyShort), ticks:pfys.map(fyShort), full:pfys.map(y=>`FY ${fyLbl(y)}`), series:inSer, stack:true, h:210, aria:"Contributions, interest and withdrawals in each financial year",
    foot:i=>`Total ${rs0(you[i]+er[i]+intr[i]+wdv[i])}`}), legendHtml(inSer)+tableHtml(pfys.map(y=>"FY "+fyLbl(y)), inSer, fmtMoney, true));
  /* scenarios */
  const alt=o=>{ const c=epfCalc({epf:{...E, ...o}}); return c&&c.corpus; };
  const sc=[[`At 7.5% interest`, alt({rate:7.5})], [`With ${E.raise?E.raise+3:5}% yearly raises`, alt({raise:(+E.raise||0)+(E.raise?3:5)})], [`Retiring at ${(+E.retireAge||58)-3}`, alt({retireAge:(+E.retireAge||58)-3})]].filter(([,v])=>v);
  const inv=e.contEmp+e.contEr;
  /* passbook, newest year first */
  const fysDesc=[...new Set([...e.rows.map(r=>r.fy), nowFy])].sort((a,b)=>b-a);
  const kLbl={cont:"", ipr:"Back-period credit", tin:"Transfer in", tout:"Moved to new account", wd:"Withdrawal", exp:"Expected"};
  const fmt0=v=>v?rs0(v):"—";
  const book=fysDesc.map(fy=>{
    const rs=e.rows.filter(r=>r.fy===fy).concat(fy===nowFy?e.expected.map(r=>({...r, fy})):[]).sort((a,b)=>(a.d||"")<(b.d||"")?-1:1);
    const it=e.ints.filter(x=>x.fy===fy), itot=it.reduce((a,x)=>a+x.emp+x.er,0), close=e.fyEnd.get(fy);
    const ctot=rs.filter(r=>r.k==="cont"||r.k==="ipr"||r.k==="exp").reduce((a,r)=>a+r.emp+r.er,0);
    const accN=new Set(rs.map(r=>r.acc).filter(Boolean)).size>1;
    return `<details class="ctab epfy"${fy===nowFy?" open":""}><summary>FY ${fyLbl(fy)} · in ${rs0(ctot)}${itot?` · interest ${rs0(itot)}`:fy===nowFy?` · interest ≈ ${rs0(e.accrued)} so far`:""}</summary><div class="tw"><table><thead><tr><th>Month</th><th>Credited</th><th>You</th><th>Employer</th><th>EPS</th></tr></thead><tbody>
      ${rs.map(r=>{ const out=r.k==="wd"||r.k==="tout", sg=out?"−":""; const lbl=[kLbl[r.k], r.note&&r.k!=="tin"?r.note:"", accN&&r.acc?`ID …${r.acc.slice(-5)}`:""].filter(Boolean).join(" · ");
        return `<tr class="${r.k==="exp"?"exp":""}"><td>${r.wm?mShort(r.wm):"—"}${lbl?`<div class="s">${esc(lbl)}</div>`:""}</td><td>${r.d?dLabel(r.d):""}</td><td>${sg}${fmt0(r.emp)}</td><td>${sg}${fmt0(r.er)}</td><td>${sg}${fmt0(r.eps)}</td></tr>`; }).join("")}
      ${it.map(x=>`<tr class="int"><td>Interest</td><td>31 Mar ${fy+1}</td><td>${rs0(x.emp)}</td><td>${rs0(x.er)}</td><td>${fmt0(x.eps)}</td></tr>`).join("")}
      ${close!=null?`<tr class="tot"><td>${it.length?"Closing":"So far"}</td><td></td><td colspan="2">${rs0(close)}</td><td></td></tr>`:""}</tbody></table></div></details>`; }).join("");
  const p=e.pension;
  openSheet("EPF", `
    <div class="card"><div class="kv">
      <span>Balance (your share + employer)</span><b>${rs0(e.value)}</b>
      ${e.expected.length?`<span>of which expected (${e.expected.map(r=>mShort(r.wm)).join(", ")})</span><b>${rs0(e.expAmt)}</b>`:""}
      <span>Paid in (you ${short(e.contEmp)}, employer ${short(e.contEr)})</span><b>${rs0(inv)}</b>
      ${e.wd?`<span>Withdrawn</span><b>${rs0(-e.wd)}</b>`:""}
      ${e.tinExt?`<span>Moved in from accounts not loaded</span><b>${rs0(e.tinExt)}</b>`:""}
      <span>Interest credited so far</span><b>${rs0(e.interest)}</b>
      <span>Interest building up this year (credited after 31 Mar)</span><b>≈ ${rs0(e.accrued)}</b>
      <span>Going in each month</span><b>${rs0(e.mon.emp+e.mon.er)}</b></div>
      <p class="cnote">Last passbook entry: ${e.lastWm?mLabel(e.lastWm):"—"} contribution, credited ${e.lastCredit?fmtD(e.lastCredit):"—"}. ${e.issues.length?`<span style="color:var(--warn)">${e.issues.map(esc).join(". ")}.</span>`:"Every passbook adds up to its closing balance."}</p></div>
    ${e.corpus?`<div class="card" style="margin-top:12px"><b>At retirement</b><div class="kv">
      <span>EPF at ${e.age} (${mLabel(e.retYm)})</span><b>≈ ${short(e.corpus)}</b>
      <span>…in today's money (6% inflation)</span><b>≈ ${short(e.corpus/Math.pow(1.06, diffM(today().slice(0,7), e.retYm)/12))}</b>
      ${sc.map(([l,v])=>`<span>${esc(l)}</span><b>≈ ${short(v)}</b>`).join("")}</div>
      <p class="cnote">A tentative figure: today's contribution${E.raise?` growing ${E.raise}% a year`:""}, ${(e.rate*100).toFixed(2)}% interest every year, no withdrawals or job gaps. Change these on the EPF holding.</p></div>`:`<p class="note">Add your date of birth on the EPF holding to see the corpus at retirement.</p>`}
    ${balChart}${inChart}
    <div class="card" style="margin-top:12px"><b>Taking money out</b><div class="kv">
      <span>Partial withdrawal now (75% of the balance)</span><b>up to ${rs0(e.partial)}</b>
      <span>If you leave a job: straight away</span><b>up to ${rs0(e.epfBal*.75)}</b>
      <span>…the rest after 12 months without a job</span><b>${rs0(e.epfBal*.25)}</b>
      ${e.corpus?`<span>At ${e.age}: all of it</span><b>≈ ${short(e.corpus)}</b>`:""}</div>
      ${e.rows.filter(r=>r.k==="wd").map(r=>`<p class="cnote">Withdrawn ${rs0(r.emp+r.er)} on ${fmtD(r.d)} (${esc(r.note||"claim")}).</p>`).join("")}
      <p class="cnote">EPFO's rules from October 2025: with 12 months of service you can take out up to 75% of the balance (both shares and interest); 25% has to stay. After leaving a job, 75% can be taken at once and the rest after 12 months without work. With more than 5 years of continuous service (yours runs from ${e.accs[0]?fyLbl(e.accs[0].first).slice(0,4):"—"}), withdrawals are tax-free. Check the EPFO portal before you apply.</p></div>
    <div class="card" style="margin-top:12px"><b>Pension (EPS)</b><div class="kv">
      ${e.accs.map(a=>`<span>Pension balance, ${esc(a.est.split(" ").slice(0,2).join(" ")||a.acc)}</span><b>${rs0(a.eps)}</b>`).join("")}
      <span>Pension service so far</span><b>${svcTxt(e.svcNow)}</b>
      ${e.retYm?`<span>Service at ${e.age}</span><b>${svcTxt(e.svcAt58)}${e.bonus?" + 2 yrs bonus":""}</b>`:""}
      ${p?`<span>Pension from ${e.age} (${e.sal>15000?`on ₹${e.sal.toLocaleString("en-IN")} salary`:"on ₹15,000"})</span><b>≈ ${rs0(p)}/month</b>${e.sal>15000?`<span>…if the old ₹15,000 cap applied</span><b>≈ ${rs0(e.pensionLow)}/month</b>`:""}`:`<span>Pension</span><b>needs 10 years of service</b>`}</div>
      ${e.epsLeft.length?`<p class="cnote" style="color:var(--warn)">${e.epsLeft.map(a=>`The pension part of your old account (${esc(a.acc)}, ${rs0(a.eps)}) wasn't moved when the EPF was transferred.`).join(" ")} Ask your employer or EPFO to transfer it so the service counts together.</p>`:""}
      <p class="cnote">A tentative estimate: pension = average pensionable salary of the last 60 months × years of service ÷ 70, with service capped at 35 years (2 bonus years after 20 years). It counts only months with a pension contribution (${svcTxt(e.svcNow)} so far). The ₹25,000 ceiling started on 17 Sep 2026, and how it applies to earlier service isn't settled, so both figures are shown. The pension balance isn't counted in net worth.</p></div>
    <p class="sect">Passbook</p>${book}
    <div class="btns"><button class="btn" type="button" id="cx">${back?"Back":"Close"}</button></div>`, s=>{
      s.querySelector("#cx").onclick=()=>{ closeModal(); if(back) back(); };
  });
}

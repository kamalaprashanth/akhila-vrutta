/* KP Money Planner, moved over unchanged. Tidied into typed modules later in Milestone 2. */
/* ===================== Family, smart goals, emergency fund ===================== */
const ageOf = dob => { if(!dob) return null; const t=today(), y=+t.slice(0,4)-+dob.slice(0,4); return t.slice(5)>=dob.slice(5)?y:y-1; };
const myAge = () => { const P=prof(); return ageOf(P.dob) ?? (P.age?+P.age:null); };
function family(){ const P=prof(), F=[{k:"me", n:"You", dob:P.dob, age:myAge()}];
  if(P.spouse&&(P.spouse.name||P.spouse.dob)) F.push({k:"sp", n:P.spouse.name||"Spouse", dob:P.spouse.dob, age:ageOf(P.spouse.dob)});
  (P.kids||[]).forEach((c,i)=>{ if(c&&(c.name||c.dob)) F.push({k:"k"+i, n:c.name||`Child ${i+1}`, dob:c.dob, age:ageOf(c.dob), kid:i}); });
  const d=P.depends||{}; if(d.father) F.push({k:"father", n:"Father"}); if(d.mother) F.push({k:"mother", n:"Mother"}); return F; }
/* the word joiner after ₹ keeps the "paise" styling off figures like ₹1.39 crore */
const shortAmt = v => { v=+v||0; return v>=1e7?`₹\u2060${(v/1e7).toFixed(2).replace(/\.?0+$/,"")} crore`:v>=1e5?`₹\u2060${(v/1e5).toFixed(1).replace(/\.0$/,"")} lakh`:money(v); };
const fv = (pv,r,n) => pv*Math.pow(1+r,n);
const sipFor = (target, annual, months) => { if(months<=0) return target; const i=annual/12; return target*i/(Math.pow(1+i,months)-1); };
const sipFv = (sip, annual, months) => { const i=annual/12; return months>0 ? sip*(Math.pow(1+i,months)-1)/i : 0; };
/* average monthly spending by category over the last 12 full months */
function spendByCat(){ return memo("sbc", ()=>{ const now=ymOf(today()), cat=new Map(); for(let i=1;i<=12;i++){ const f=monthFigures(addM(now,-i)); for(const [k,v] of f.byCat) cat.set(k,(cat.get(k)||0)+v/12); } return cat; }); }
const catNamed = (k,re) => re.test(catLbl(k));
const EM_OFF_DEFAULT = /^(property|investments?|loan given)$/i;
function emExcluded(){ const s=appSet(); if(Array.isArray(s.emEx)) return new Set(s.emEx); return new Set([...spendByCat().keys()].filter(k=>catNamed(k,EM_OFF_DEFAULT))); }
function emBase(){ const ex=emExcluded(); let t=0; for(const [k,v] of spendByCat()) if(!ex.has(k)) t+=v; return t; }
const emMonths = () => +appSet().emMonths || 6;
/* retirement: usual spending without loan EMIs and the non-living categories */
function retireBase(){ let t=0; for(const [k,v] of spendByCat()) if(!catNamed(k,/^(property|investments?|loan given|loan emi|loan repayments?)$/i) && k!=="repay") t+=v; return t; }

const GOAL_KINDS={loans:"Close loans", edu:"Child education", retire:"Retirement", custom:"Savings goal"};
const EDU_DEF={school:160000, ug:2000000, pg:2500000, inf:10, ret:11};
const RET_DEF={inf:6, pre:11, post:7, life:85};
function smartGoal(g){
  const now=ymOf(today()), P=prof();
  if(g.kind==="loans"){ const L=(g.loans||[]).map(id=>byId("loans",id)).filter(l=>l&&!l.deleted); let left=0, repaid=0;
    for(const l of L){ const x=loanSum(l); left+=x.out; repaid+=(x.own&&x.own.repaid)||0; }
    const by=g.by||`${+now.slice(0,4)+1}-12`, m=Math.max(1,diffM(now,by)), need=left/m, pct=left+repaid>0?repaid/(left+repaid)*100:100;
    return {pct, done:left<0.5, sub:`${L.map(l=>l.name).join(", ")||"No loans picked"} · by ${mLabel(by)}`, rows:[["Left to repay",money(left)],["Months left",String(m)],["Repaid so far",repaid>0.5?money(repaid):"—"],["Needed each month",money(need)]], ok:left<0.5, msg:left<0.5?"All repaid ✓":`Repay about ${money(need)} a month to close them by ${mLabel(by)}.`}; }
  if(g.kind==="edu"){ const c=(g.kidId?(P.kids||[]).find(k=>k.id===g.kidId):(P.kids||[])[g.kid||0])||{}, a=ageOf(c.dob), name=c.name||"Child";
    if(a==null) return {pct:0, sub:`${name} · add the date of birth in Settings › My profile › About me`, rows:[], ok:false, msg:"Needs the child's date of birth."};
    const inf=(+g.inf||EDU_DEF.inf)/100, r=(+g.ret||EDU_DEF.ret)/100, school=+g.school||EDU_DEF.school, ug=+g.ug||EDU_DEF.ug, pg=+g.pg||EDU_DEF.pg;
    const yUG=Math.max(0,18-a), yPG=Math.max(0,22-a), fUG=a<18?fv(ug,inf,yUG):0, fPG=a<22?fv(pg,inf,yPG):0;
    const linked=(g.holdings||[]).map(id=>byId("holdings",id)).filter(h=>h&&!h.deleted), have=linked.reduce((s,h)=>s+holdingSum(h).value,0);
    /* what's linked grows towards graduation first, then post-graduation */
    let hUG=Math.min(fUG, fv(have,r,yUG)), rest=Math.max(0,fv(have,r,yUG)-fUG);
    const needUG=Math.max(0,fUG-hUG), needPG=Math.max(0,fPG-fv(rest,r,yPG-yUG));
    const sip=(yUG>0?sipFor(needUG,r,yUG*12):needUG)+(yPG>0?sipFor(needPG,r,yPG*12):needPG);
    const schoolNow=a>=3&&a<18?school:0, schoolLast=a<18?fv(school,inf,Math.max(0,17-a)):0;
    let schoolTot=0; for(let y=0;y<Math.max(0,18-Math.max(a,3));y++) schoolTot+=fv(school,inf,y);
    const tot=fUG+fPG, pct=tot>0?Math.min(100,fv(have,r,yUG)/tot*100):100;
    return {pct, sub:`${name} (${a}) · school ${shortAmt(school)} a year · graduation at 18: ${shortAmt(ug)} · post-grad at 22: ${shortAmt(pg)} (today's money, rising ${(inf*100).toFixed(0)}% a year)`,
      rows:[[a<3?`School from ${+today().slice(0,4)+3-a}`:"School this year",schoolNow?money(schoolNow):a<3?shortAmt(fv(school,inf,3-a))+" a year":"—"],["School fee in class 12",schoolLast?shortAmt(schoolLast):"—"],[`Graduation in ${+today().slice(0,4)+yUG}`,fUG?shortAmt(fUG):"—"],[`Post-grad in ${+today().slice(0,4)+yPG}`,fPG?shortAmt(fPG):"—"],["Linked so far",money(have)],["SIP needed",`${money(sip)} a month`]],
      ok:sip<0.5, msg:`${linked.length?"":"No investments linked yet. "}Put about ${money(sip)} a month into growth funds for graduation and post-grad. School fees (about ${shortAmt(schoolTot)} over the remaining years) are paid from income each year: add them in Regular as a yearly bill so the reserve saves for them.`}; }
  if(g.kind==="retire"){ const a=myAge(), ra=+P.retire||60, life=+g.life||RET_DEF.life, inf=(+g.inf||RET_DEF.inf)/100, pre=(+g.pre||RET_DEF.pre)/100, post=(+g.post||RET_DEF.post)/100;
    if(a==null) return {pct:0, sub:"Add your date of birth and retirement age in Settings › My profile › About me", rows:[], ok:false, msg:"Needs your date of birth."};
    const yrs=Math.max(0,ra-a), base=+g.spend||retireBase(), atR=fv(base,inf,yrs), rr=(1+post)/(1+inf)-1, n=Math.max(1,life-ra);
    const corpus=atR*12*(rr?(1-Math.pow(1+rr,-n))/rr*(1+rr):n);
    const H=live("holdings").filter(h=>!h.closed && (["EPF","PPF","NPS"].includes(h.type) || (g.holdings||[]).includes(h.id))), have=H.reduce((s,h)=>s+holdingSum(h).value,0), fvHave=fv(have,pre,yrs);
    const sipNow=live("recurring").filter(r=>r.type==="investment"&&(!r.end||r.end>=ymOf(today()))&&(FREQ[r.freq]||1)===1).reduce((s,r)=>s+(+r.amount||0),0);
    const gap=Math.max(0,corpus-fvHave), sip=sipFor(gap,pre,yrs*12), extra=Math.max(0,sip-sipNow);
    let alt=null; if(extra>0.5) for(let k=1;k<=10;k++){ const y2=yrs+k, c2=fv(base,inf,y2)*12*(rr?(1-Math.pow(1+rr,-Math.max(1,life-ra-k)))/rr*(1+rr):1); if(fv(have,pre,y2)+sipFv(sipNow,pre,y2*12)>=c2){ alt=ra+k; break; } }
    const pct=corpus>0?Math.min(100,(fvHave+sipFv(sipNow,pre,yrs*12))/corpus*100):100;
    return {pct, sub:`${money(base)} a month in today's money (your usual spending without EMIs) · from ${ra} to ${life} · ${(inf*100).toFixed(0)}% inflation, ${(pre*100).toFixed(0)}% before / ${(post*100).toFixed(0)}% after`,
      rows:[[`Needed at ${ra}`,shortAmt(corpus)],["EPF + PPF + NPS"+((g.holdings||[]).length?" + linked":"")+" now",shortAmt(have)],[`Grows to (${(pre*100).toFixed(0)}%)`,shortAmt(fvHave)],["SIP needed",`${money(sip)} a month`]],
      ok:extra<0.5, msg:extra<0.5?`On track: your ${money(sipNow)} a month of SIPs covers it.`:`You invest ${money(sipNow)} a month now. ${money(extra)} more a month${alt?`, or retiring at ${alt},`:""} closes the gap.`}; }
  const x=goalSum(g), done=x.gap<0.5;
  return {pct:x.pct, sub:`${g.by?`by ${mLabel(g.by)}`:""}`, rows:[["Target",money(x.target)],["Have",money(x.have)],["Gap",money(x.gap)],["Each month",x.monthsLeft>0?money(x.need):"—"]], ok:done, msg:done?"Reached ✓":x.monthsLeft>0?`Put aside ${money(x.need)} a month.`:"Target month reached."};
}
/* create the three goals from the profile, once */
function ensureSmartGoals(){ const P=prof(), G=live("goals"), A=appSet(), seen=new Set(A.goalKids||[]); let ch=false, pri=G.reduce((m,g)=>Math.max(m,+g.pri||0),0)+1;
  if(!A.goalsSeeded){ const fam=live("loans").filter(l=>["family","hybrid"].includes(kindOf(l)) && loanSum(l).out>0.5).map(l=>l.id);
    if(fam.length && !G.some(g=>g.kind==="loans")) put("goals",{id:uid(), kind:"loans", name:"Close family loans", loans:fam, by:`${+today().slice(0,4)+1}-12`, pri:pri++});
    if(!G.some(g=>g.kind==="retire")) put("goals",{id:uid(), kind:"retire", name:"Retirement", pri:pri++}); ch=true; }
  /* each child gets an education goal once, as soon as their date of birth is added (a goal you remove isn't re-created) */
  (P.kids||[]).forEach((c,i)=>{ const key=(c.name||"")+"|"+(c.dob||""); if(c&&c.dob && !seen.has(key) && !G.some(g=>g.kind==="edu"&&(c.id?g.kidId===c.id:g.kid===i))){ put("goals",{id:uid(), kind:"edu", kid:i, kidId:c.id, name:`${c.name||"Child"}'s education`, pri:pri++}); seen.add(key); ch=true; } });
  if(ch) upsert("settings",{...appSet(), goalsSeeded:true, goalKids:[...seen]}); }
function goalsTab(){
  ensureSmartGoals();
  const G=live("goals").slice().sort((a,b)=>(+a.pri||99)-(+b.pri||99));
  const card=g=>{ const x=smartGoal(g); return `<div class="card gcard tap" data-goal="${esc(g.id)}" role="button" tabindex="0"><div class="gtop"><b>${esc(g.name)}</b><span class="gk">${g.pri?g.pri+" · ":""}${GOAL_KINDS[g.kind||"custom"]}</span></div>
    <div class="note" style="margin:2px 0 0">${esc(x.sub)}</div>${x.rows.length?`<div class="gnum">${x.rows.map(([l,v])=>`<div><i class="gl">${esc(l)}</i><b>${v}</b></div>`).join("")}</div>`:""}
    <div class="pbar" style="margin-top:10px"><i style="width:${Math.max(0,Math.min(100,x.pct)).toFixed(1)}%"></i></div><div class="gst ${x.ok?"ok":"no"}">${esc(x.msg)}</div></div>`; };
  return `<div class="btns" style="margin-top:12px"><button class="btn pri" type="button" id="addGoal">+ Add goal</button></div>
  <p class="note">Worked out from your profile (Settings › My profile) and your spending. Tap a goal to change its assumptions. Goals don't move money; add the monthly amount as a SIP or regular item.</p>
  ${G.map(card).join("")||'<div class="list" style="margin-top:12px"><div class="empty">No goals yet.</div></div>'}`;
}
function goalForm(g={}){
  const isNew=!g.id, kind=g.kind||"custom", H=live("holdings").filter(h=>!h.closed), sel=new Set(g.holdings||[]);
  const hpick=lbl=>H.length?`<div class="f"><label>${lbl}</label>${H.map(h=>`<label class="opt" style="margin-top:6px"><input type="checkbox" class="gh" value="${esc(h.id)}" ${sel.has(h.id)?"checked":""}><div><b>${esc(h.name)}</b><span>${money(holdingSum(h).value)}</span></div></label>`).join("")}</div>`:"";
  const pri=field(["gp","Priority","number",{value:g.pri||"",hint:"1 = most important"}]);
  let body="";
  if(isNew) body+=field(["gk","Kind","select",{value:kind,options:Object.entries(GOAL_KINDS)}]);
  if(kind==="loans") body+=`${field(["name","Goal","text",{value:g.name}])}<div class="f"><label>Loans to close</label>${live("loans").filter(l=>loanSum(l).out>0.5).map(l=>`<label class="opt" style="margin-top:6px"><input type="checkbox" class="gl" value="${esc(l.id)}" ${(g.loans||[]).includes(l.id)?"checked":""}><div><b>${esc(l.name)}</b><span>${money(loanSum(l).out)} left</span></div></label>`).join("")}</div>${field(["by","Close by","month",{value:g.by||`${+today().slice(0,4)+1}-12`}])}${pri}`;
  else if(kind==="edu") body+=`${field(["name","Goal","text",{value:g.name}])}${field(["ekid","Child","select",{value:g.kidId||g.kid||0,options:(prof().kids||[]).map((c,i)=>[c.id||i,`${c.name||"Child "+(i+1)}${c.dob?` (${ageOf(c.dob)})`:""}`])}])}
    ${field(["es","School, a year in today's money (₹)","number",{value:g.school||EDU_DEF.school,hint:"Bangalore CBSE/ICSE: ₹60k budget · ₹1.2–1.6 lakh mid to premium · ₹5 lakh+ international, plus books and transport"}])}
    ${field(["eu","Graduation, total in today's money (₹)","number",{value:g.ug||EDU_DEF.ug,hint:"Private engineering in Bangalore about ₹16 lakh tuition plus living; government seat ₹5–6 lakh; abroad ₹60 lakh+"}])}
    ${field(["ep","Post-graduation, total in today's money (₹)","number",{value:g.pg||EDU_DEF.pg,hint:"MBA at IIM/ISB level about ₹25 lakh; MTech/MS in India ₹5–10 lakh"}])}
    <div class="grid2">${field(["ei","Education costs rise (% a year)","number",{value:g.inf||EDU_DEF.inf,step:"0.5"}])}${field(["er","Return on savings (% a year)","number",{value:g.ret||EDU_DEF.ret,step:"0.5"}])}</div>${hpick("Investments set aside for it")}${pri}`;
  else if(kind==="retire") body+=`${field(["name","Goal","text",{value:g.name||"Retirement"}])}
    ${field(["rs","Monthly spending in today's money (₹)","number",{value:g.spend||"",hint:`Leave empty to use your usual spending without EMIs: ${money(retireBase())} a month (last 12 months)`}])}
    <div class="grid2">${field(["ri","Inflation (%)","number",{value:g.inf||RET_DEF.inf,step:"0.5"}])}${field(["rl","Money should last to age","number",{value:g.life||RET_DEF.life}])}</div>
    <div class="grid2">${field(["rp","Return before retiring (%)","number",{value:g.pre||RET_DEF.pre,step:"0.5"}])}${field(["ro","Return after retiring (%)","number",{value:g.post||RET_DEF.post,step:"0.5"}])}</div>
    <p class="note">Retirement age comes from Settings › My profile (now ${prof().retire||"not set"}). EPF, PPF and NPS count automatically.</p>${hpick("Other investments for retirement")}${pri}`;
  else body+=`${field(["name","Goal","text",{value:g.name,ph:"e.g. New car"}])}<div class="grid2">${field(["target","Target (₹)","number",{value:g.target??"",step:"1000"}])}${field(["by","By","month",{value:g.by||addM(ymOf(today()),12)}])}</div>
    ${field(["saved","Already saved outside investments (₹)","number",{value:g.saved??"",step:"0.01"}])}${hpick("Count these investments towards it")}${pri}`;
  openSheet(isNew?"Add goal":g.name, body+btnRow(isNew,"Add goal"), s=>{
    s.querySelector("#cx").onclick=closeModal;
    const k=s.querySelector("#f_gk"); if(k) k.onchange=()=>{ closeModal(); goalForm({kind:k.value}); };
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>askConfirm(`Remove the goal "${g.name}"?`,"Remove",()=>del("goals",g.id));
    s.querySelector("#sv").onclick=()=>{ const name=val("name")||GOAL_KINDS[kind], n=x=>{ const v=parseFloat(val(x)); return v>0?v:undefined; };
      const o={...g, id:g.id||uid(), kind, name, pri:n("gp"), holdings:[...s.querySelectorAll(".gh:checked")].map(x=>x.value)};
      if(kind==="loans"){ o.loans=[...s.querySelectorAll(".gl:checked")].map(x=>x.value); o.by=val("by")||null; }
      else if(kind==="edu"){ const kv=val("ekid"), ki=(prof().kids||[]).findIndex(c=>c.id===kv); if(ki>=0){ o.kidId=kv; o.kid=ki; } else o.kid=+kv||0; Object.assign(o,{school:n("es"),ug:n("eu"),pg:n("ep"),inf:n("ei"),ret:n("er")}); }
      else if(kind==="retire") Object.assign(o,{spend:n("rs"),inf:n("ri"),life:n("rl"),pre:n("rp"),post:n("ro")});
      else { const t=parseFloat(val("target")); if(!(t>0)){ toast("Give the goal a target."); return; } Object.assign(o,{target:t, by:val("by")||null, saved:parseFloat(val("saved"))||0}); }
      closeModal(); upsert("goals",o); toast(isNew?"Goal added":"Saved"); };
  });
}
/* emergency fund settings: tap a category to include it or leave it out */
function emToggle(k){ const s=appSet(), ex=emExcluded(); ex.has(k)?ex.delete(k):ex.add(k); upsert("settings",{...s, emEx:[...ex]}); }
function emSheet(){ const st=reserveState(), a=st.a;
  openSheet("Emergency fund target", `${field(["em","Months of spending to cover","select",{value:String(emMonths()),options:[["3","3 months"],["6","6 months"],["9","9 months"],["12","12 months"]]}])}
    ${field(["emt","Or your own target (₹)","number",{value:a&&a.emTarget||"",hint:"Leave empty to use the months above"}])}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#sv").onclick=()=>{ const m=+val("em")||6, t=parseFloat(val("emt")); closeModal(); upsert("settings",{...appSet(), emMonths:m}); if(a){ const o={...a}; if(t>0) o.emTarget=t; else delete o.emTarget; upsert("accounts",o); } toast("Saved"); };
  }); }
document.addEventListener("click", e=>{ const t=e.target.closest("[data-emcat],#emSet"); if(!t || t.closest("#modal")) return; if(t.id==="emSet") return emSheet(); emToggle(t.dataset.emcat); });


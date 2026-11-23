/* KP Money Planner, moved over unchanged. Tidied into typed modules later in Milestone 2. */

/* ---------- constants ---------- */
const DRIVE = "Google Drive";
const FOLDER_ID = "1xWHXrGkKfNUdNse87ynF0cLaNIOjVPV2";
const FILE = "kp-money-planner-data.json";
const LS = "kpmp.v1";
const COLS = ["accounts","categories","txns","recurring","loans","holdings","payers","snaps","goals","views","trades","props","propItems","settings"];
const FREQ = {monthly:1, quarterly:3, halfyearly:6, yearly:12, biennial:24, triennial:36, once:0};
const FREQ_LBL = {monthly:"Monthly", quarterly:"Every 3 months", halfyearly:"Every 6 months", yearly:"Yearly", biennial:"Every 2 years", triennial:"Every 3 years", once:"One time"};
const TYPE_LBL = {expense:"Expense", income:"Income", investment:"Investment", transfer:"Transfer"};
/* investment charges: the part of what you paid that didn't go into the investment (stamp duty, platform or broker charges).
   It counts as Fees & Charges spending; the rest is what you invested. Mutual funds: 0.005% stamp duty is filled in. */
const stampDuty = amt => Math.round((+amt||0)*0.00005*100)/100;
const invChg = t => Math.max(0, +t.charges||0);
const invNet = t => (+t.amount||0) - invChg(t);
const sipChg = (r, amt) => r && r.charges!=null && r.charges!=="" ? Math.max(0,+r.charges||0) : (r && r.invType==="Mutual Fund" ? stampDuty(amt) : 0);
const feeCat = () => { const c=live("categories").find(c=>c.kind==="expense" && !c.parentId && /fees|charges/i.test(c.name)); return c ? c.id : null; };
const ACC_LBL = {bank:"Bank", card:"Credit card", cash:"Cash", wallet:"Wallet", invest:"Investment account", loan:"Loan / person"};
/* account visibility: hidden accounts leave the Accounts tab and the pickers (history stays); hidden or "not in totals"
   accounts are left out of bank totals, card dues, forecast and net worth */
const countsAcc = a => !!a && !a.hidden && !a.noTotal;
/* imported Money Manager history (hist:true) shows in lists, reports and insights, but never moves today's balances,
   card bills, carry-overs or budgets: the opening balances taken on 10 Nov 2026 already include it */
const isHist = t => !!t.hist;

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const inr = new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",minimumFractionDigits:2,maximumFractionDigits:2});
const r2 = n => { const v=Math.round((+n||0)*100)/100; return v===0 ? 0 : v; };
const inr0 = new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",minimumFractionDigits:0,maximumFractionDigits:0});
/* summaries in whole rupees; individual entries keep paise (moneyP) */
const money = n => { const v=Math.round(+n||0); return inr0.format(v===0?0:v); };
const moneyP = n => inr.format(r2(n));
/* compact form only for lakhs and crores; anything smaller is shown in full, always with 2 decimals */
const short = n => { const v=r2(n), a=Math.abs(v), s=v<0?"-":""; if(a>=1e7) return s+"₹"+(a/1e7).toFixed(2)+"Cr"; if(a>=1e5) return s+"₹"+(a/1e5).toFixed(2)+"L"; return money(v); };
const pad = n => String(n).padStart(2,"0");
const today = () => { const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const ymOf = d => d.slice(0,7);
const addM = (ym,n) => { let [y,m]=ym.split("-").map(Number); m+=n; y+=Math.floor((m-1)/12); m=((m-1)%12+12)%12+1; return `${y}-${pad(m)}`; };
const diffM = (a,b) => { const [y1,m1]=a.split("-").map(Number),[y2,m2]=b.split("-").map(Number); return (y2-y1)*12+(m2-m1); };
const MN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const mLabel = ym => { const [y,m]=ym.split("-"); return `${MN[+m-1]} ${y}`; };
const mShort = ym => { const [y,m]=ym.split("-"); return `${MN[+m-1]} '${y.slice(2)}`; };
const dLabel = d => { const [y,m,dd]=d.split("-"); return `${+dd} ${MN[+m-1]}`; };

/* ---------- data ---------- */
function stamp(o){ o.updatedAt = Date.now(); return o; }
function blank(){
  const t = Date.now();
  const ex = ["Rent & maintenance","Utilities (power, gas, water)","Broadband & mobile","Subscriptions","Insurance","Groceries","Food & eating out","Travel & trips","Transport & fuel","Health","Pooja & donation","Gifts","Family support","Shopping","Personal care","Home & furniture","Property","Fees, legal & tax","Cash withdrawal","Loan EMI","Other"];
  const inc = ["Salary","Reimbursement","Interest & dividend","Gift received","Other income"];
  return { schema:1, accounts:[{id:uid(),name:"Cash",type:"cash",opening:0,updatedAt:t,seed:true}],
    categories:[...ex.map(n=>({id:uid(),name:n,kind:"expense",updatedAt:t,seed:true})), ...inc.map(n=>({id:uid(),name:n,kind:"income",updatedAt:t,seed:true}))],
    txns:[], recurring:[], loans:[], holdings:[], payers:[], snaps:[], goals:[], views:[] };
}
const S = { data:null, view:"home", month: ymOf(today()), fcH:12, dirty:false };
const live = c => (S.data[c]||[]).filter(x=>!x.deleted);
const byId = (c,id) => (S.data[c]||[]).find(x=>x.id===id);
/* categories can have one level of subcategories via parentId (Money Manager style) */
const catParent = c => c && c.parentId ? byId("categories",c.parentId) : null;
const catTop = id => { const c=byId("categories",id), p=catParent(c); return p && !p.deleted ? p.id : id; };
const catName = id => { const c=byId("categories",id); if(!c) return "Uncategorised"; const p=catParent(c); return p && !p.deleted ? `${p.name} › ${c.name}` : c.name; };
const accName = id => byId("accounts",id)?.name || "—";

function loadLocal(){ if(HOSTED) return null; try{ const j=localStorage.getItem(LS); if(j) return JSON.parse(j); }catch(e){} return null; }
function saveLocal(){ if(HOSTED){ hSaveLocal(); return; } try{ localStorage.setItem(LS, JSON.stringify({data:S.data, dirty:S.dirty})); }catch(e){} }

function put(col, item){
  stamp(item); delete item.seed;
  const arr = (S.data[col] = S.data[col] || []); const i = arr.findIndex(x=>x.id===item.id);
  if(i>=0) arr[i]=item; else arr.push(item);
}
function upsert(col, item){ put(col,item); changed(); }
function del(col,id){ const x=byId(col,id); if(x){ x.deleted=true; delete x.seed; stamp(x); RV.fade=true; changed(); } }
/* render bookkeeping for animations only */
const RV={view:null,t:0,fade:false};
function changed(){ MEMO=new Map(); S.dirty=true; saveLocal();
  const fade=RV.fade && document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches; RV.fade=false;
  if(fade){ try{ document.startViewTransition(()=>render()); }catch(e){ render(); } } else render();
  scheduleSync(); }

/* merge two docs record-by-record, newest updatedAt wins, tombstones kept */
function merge(a,b){
  const out = {schema:1};
  for(const c of COLS){
    const m = new Map();
    for(const x of [...(a?.[c]||[]), ...(b?.[c]||[])]){ const p=m.get(x.id); if(!p || (x.updatedAt||0) > (p.updatedAt||0)) m.set(x.id,x); }
    out[c] = [...m.values()];
  }
  return out;
}
/* hard reset: the backup's records win everywhere (stamped now); records not in it are marked deleted so every device drops them */
function replaceWith(cur, j){
  const now=Date.now(), out={schema:1};
  for(const c of COLS){ const m=new Map((j[c]||[]).map(x=>[x.id,{...x, updatedAt:now}]));
    for(const x of (cur?.[c]||[])) if(!m.has(x.id)) m.set(x.id, x.deleted ? x : {...x, deleted:true, updatedAt:now});
    out[c]=[...m.values()]; }
  return out;
}
const sig = d => COLS.map(c => (d?.[c]||[]).map(x=>x.id+":"+(x.updatedAt||0)).sort().join(",")).join("|");

/* ---------- money maths ---------- */
const pmt = (P,r,n) => { if(n<=0) return P; if(!r) return P/n; const f=Math.pow(1+r,n); return P*r*f/(f-1); };
const nper = (P,r,E) => { if(!(E>0)) return Infinity; if(!r) return Math.ceil(P/E-1e-9); if(E<=P*r) return Infinity; return Math.ceil(-Math.log(1-P*r/E)/Math.log(1+r)-1e-9); };
function emiOf(l){ if(+l.emi) return +l.emi; return (+l.principal && +l.tenure) ? pmt(+l.principal,(+l.rate||0)/1200,+l.tenure) : 0; }
function loanEnd(l){ return l.tenure ? addM(l.start, +l.tenure-1) : null; }
const rateTxt = r => String(Math.round((+r||0)*100)/100);

/* ---------- loans ----------
   kind "emi"    : bank loan with an EMI schedule; floating-rate changes live in l.rates, part payments are txns.
   kind "family" : interest-free running ledger with one person; borrowings and repayments are txns.
   kind "hybrid" : family loan where l.bank holds the interest-bearing part (relative's bank loan, you pay the EMI)
                   and the rest is their own money, tracked like a family ledger.
   Loan txns: {type:"loan", loanId, act:"borrow"|"repay"|"prepay", part:"own"|"bank", mode:"emi"|"tenure" (prepay)} */
const KIND_LBL = {emi:"Bank loan", family:"Family & friends", hybrid:"Hybrid", cardemi:"Card EMI"};
const isEmiLike = k => k==="emi" || k==="cardemi";
const ACT_LBL = {borrow:"Borrowed", repay:"Repaid", prepay:"Part payment", missed:"Missed EMI", catchup:"Paid missed EMIs"};
/* hybrid only: an EMI you missed is paid to the bank by the relative and becomes an interest-free amount you owe them.
   Missed: {act:"missed", part:"bank", ym, amount, link:"l:<loan>|<ym>"}; paying back: {act:"catchup", part:"missed", covers:[missed txn ids]} */
function missedInfo(l){
  if(kindOf(l)!=="hybrid") return {list:[], owed:0};
  const tx=loanTx(l.id), by=new Map();
  for(const t of tx) if(t.act==="catchup") for(const id of (t.covers||[])) by.set(id,t);
  const list=tx.filter(t=>t.act==="missed").map(t=>({t, ym:t.ym, amount:+t.amount, by:by.get(t.id)||null})).sort((a,b)=>a.ym.localeCompare(b.ym));
  return {list, owed:list.filter(m=>!m.by).reduce((a,m)=>a+m.amount,0)};
}
const kindOf = l => l.kind || "emi";
const bankOf = l => { const k=kindOf(l); return isEmiLike(k) ? l : k==="hybrid" ? (l.bank||null) : null; };
const loanTx = id => live("txns").filter(t=>t.type==="loan" && t.loanId===id);
let MEMO = new Map();
const memo = (k,f) => { if(!MEMO.has(k)) MEMO.set(k,f()); return MEMO.get(k); };

/* month-by-month amortisation of the EMI part, applying rate changes and part payments in the month they happen */
function schedule(l, skipTxn){
  const b=bankOf(l); if(!b || !(+b.principal>0) || !(+b.tenure>0) || !b.start) return null;
  const run=()=>{
    const pre=new Map(), rates=new Map(), add=(m,k,v)=>{ if(!m.has(k)) m.set(k,[]); m.get(k).push(v); };
    for(const t of loanTx(l.id)) if(t.act==="prepay" && t.id!==skipTxn) add(pre, ymOf(t.date)<b.start?b.start:ymOf(t.date), t);
    for(const rc of (b.rates||[])) add(rates, rc.ym<b.start?b.start:rc.ym, rc);
    const syncs=new Map(); for(const x of (b.syncs||[])) add(syncs, x.ym<b.start?b.start:x.ym, x);
    for(const v of pre.values()) v.sort((x,y)=>x.date.localeCompare(y.date));
    let bal=+b.principal, r=(+b.rate||0)/1200, left=+b.tenure, emi=+b.emi||pmt(bal,r,left), ym=b.start, totalInt=0, closed=null;
    const rows=[];
    for(let i=0;i<720;i++){
      for(const rc of rates.get(ym)||[]){
        r=(+rc.rate||0)/1200;
        if(rc.mode==="emi") emi=pmt(bal,r,left);
        else { const n=nper(bal,r,emi); if(isFinite(n)) left=n; else emi=pmt(bal,r,left); }
      }
      for(const p of pre.get(ym)||[]){
        bal=Math.max(0, bal-(+p.amount||0)); if(bal<=0.5) break;
        if(p.mode==="emi") emi=pmt(bal,r,left); else { const n=nper(bal,r,emi); if(isFinite(n)) left=n; }
      }
      /* matched to a bank statement: the bank's figure replaces ours from this month on */
      for(const x of syncs.get(ym)||[]){
        bal=Math.max(0, +x.bal||0); if(bal<=0.5) break;
        if(x.mode==="emi") emi=pmt(bal,r,left); else { const n=nper(bal,r,emi); if(isFinite(n)) left=n; }
      }
      if(bal<=0.5){ closed=ym; break; }
      const open=bal, int=bal*r, pay=left<=1 ? bal+int : Math.min(emi, bal+int), prin=pay-int;
      bal=Math.max(0, bal-prin); left--; totalInt+=int;
      rows.push({ym, open, emi:pay, int, prin, bal, rate:r*1200, k:rows.length+1});
      if(bal<=0.5) break;
      ym=addM(ym,1);
    }
    /* a loan you closed yourself stops after its closing month: no more EMIs, nothing outstanding */
    if(l.closedOn){ while(rows.length && rows[rows.length-1].ym>l.closedOn) rows.pop(); totalInt=rows.reduce((a,r)=>a+r.int,0); }
    return {rows, end: rows.length ? rows[rows.length-1].ym : null, closed, totalInt, start:b.start, principal:+b.principal};
  };
  return skipTxn ? run() : memo("s:"+l.id, run);
}
/* what's owed on the EMI part at the start of month ym (after that month's part payments, before its EMI) */
function bankOut(l, ym){
  const b=bankOf(l); if(!b) return 0;
  const s=schedule(l);
  if(!s) return Math.max(0, (+b.principal||0) - loanTx(l.id).filter(t=>t.act==="prepay").reduce((a,t)=>a + +t.amount, 0));
  if(ym < s.start) return s.principal;
  const row=s.rows.find(r=>r.ym===ym); return row ? row.open : 0;
}
function ownTotals(l){ let borrowed=0, repaid=0; for(const t of loanTx(l.id)) if(t.part!=="bank"){ if(t.act==="borrow") borrowed+=+t.amount; else if(t.act==="repay") repaid+=+t.amount; } return {borrowed, repaid, out:Math.max(0, borrowed-repaid)}; }
function loanSum(l){
  return memo("x:"+l.id, ()=>{
    const now=ymOf(today()), k=kindOf(l), b=bankOf(l), s=schedule(l), own=isEmiLike(k) ? {borrowed:0,repaid:0,out:0} : ownTotals(l);
    const bank=b ? bankOut(l, now) : 0;
    const row=s && (s.rows.find(r=>r.ym===now) || s.rows.find(r=>r.ym>now));
    const last=s && s.rows.filter(r=>r.ym<=now).pop();
    const paidInt=s ? s.rows.filter(r=>r.ym<now).reduce((a,r)=>a+r.int, 0) : 0;
    const mi=missedInfo(l);
    if(l.closedOn && now>=l.closedOn) return {k, b, s, bank:0, own:{...own,out:0}, missed:0, mi, out:0, emiNow:0, rateNow:(last?last.rate:(+b?.rate||0)), end:l.closedOn, totalInt:s?s.totalInt:0, paidInt, closedByYou:true};
    return {k, b, s, bank, own, missed:mi.owed, mi, out:bank+own.out+mi.owed, emiNow: row ? row.emi : 0, rateNow: (row||last) ? (row||last).rate : (+b?.rate||0), end:s ? s.end : null, totalInt:s ? s.totalInt : 0, paidInt};
  });
}
/* planned interest-free repayments, capped so they stop once the own-money part is cleared */
function famPlan(l){
  if(isEmiLike(kindOf(l)) || !(l.plans||[]).length || l.closedOn) return [];
  return memo("p:"+l.id, ()=>{
    const now=ymOf(today()), paid=paidMap(), out=[]; let rem=ownTotals(l).out;
    for(let i=0;i<120;i++){ const ym=addM(now,i);
      for(const p of l.plans){
        const hit = p.freq==="monthly" ? (ym>=p.start && (!p.end || ym<=p.end)) : ym===p.start; if(!hit) continue;
        const key=`p:${l.id}:${p.id}|${ym}`;
        if(paid.has(key)){ out.push({ym, key, amount:+paid.get(key).amount, plan:p}); continue; }
        if(rem<=0.5) continue;
        const amt=Math.min(+p.amount, rem); rem-=amt; out.push({ym, key, amount:amt, plan:p});
      }
      if(rem<=0.5 && !l.plans.some(p=>p.freq==="monthly" && (!p.end || p.end>ym))) break;
    }
    return out;
  });
}
function recurs(r, ym){
  if(ym < r.start) return false;
  if(r.end && ym > r.end) return false;
  const step = FREQ[r.freq];
  if(!step) return ym===r.start;
  return diffM(r.start, ym) % step === 0;
}
/* market holidays (NSE equity, weekdays) — the year's official list, plus any you add in Plan › Cash flow */
const NSE_HOL = new Set(["2026-01-15","2026-01-26","2026-03-03","2026-03-26","2026-03-31","2026-04-03","2026-04-14","2026-05-01","2026-05-28","2026-06-26","2026-09-14","2026-10-02","2026-10-20","2026-11-10","2026-11-24","2026-12-25"]);
const appSet = () => byId("settings","app") || {id:"app"};
const isHoliday = d => NSE_HOL.has(d) || (appSet().holidays||[]).includes(d);
const isTradingDay = d => { const g=new Date(d+"T00:00").getDay(); return g!==0 && g!==6 && !isHoliday(d); };
function nextTrading(d){ let x=d, n=0; while(!isTradingDay(x) && n++<10){ const y=new Date(x+"T00:00"); y.setDate(y.getDate()+1); x=`${y.getFullYear()}-${pad(y.getMonth()+1)}-${pad(y.getDate())}`; } return x; }
/* the day a regular item falls on in a month, moved to the next trading day when it asks for that */
function recDay(r, ym){ if(!r.day) return null; if(r.shift!=="trading") return r.day; const d=nextTrading(dayIn(+ym.slice(0,4), +ym.slice(5), r.day)); return d.slice(0,7)===ym ? +d.slice(8) : r.day; }
/* planned items for one month */
/* spends (expenses, or withdrawals for a cash budget) tagged to a budget in month ym */
function budgetSpent(id, ym){ return memo(`b:${id}|${ym}`, ()=>live("txns").filter(t=>t.budgetId===id && ymOf(t.date)===ym && (t.type==="expense"||t.type==="transfer")).reduce((s,t)=>s + +t.amount, 0)); }
const activeBudgets = ym => live("recurring").filter(r=>r.budget && r.type==="expense" && recurs(r,ym));
function planned(ym){
  const items=[];
  const now=ymOf(today());
  for(const r of live("recurring")) if(recurs(r,ym)){
    const ends = r.end===ym && r.freq!=="once";
    /* per-month change: r.ov[ym] = a different amount for that month only, or 0 to skip that month */
    const ov = r.ov && r.ov[ym]!==undefined ? +r.ov[ym] : null;
    if(ov===0) continue;
    const base = ov!==null ? ov : +r.amount;
    if(r.budget && r.type==="expense"){
      /* budget (placeholder): spends tagged to it are already in the accounts, so only what's left is still to go out.
         Past months are done; the current month counts the remainder; future months count the full budget. */
      const spent=budgetSpent(r.id, ym), left=Math.max(0, base-spent);
      items.push({key:`r:${r.id}|${ym}`, src:"b", id:r.id, name:r.name, type:"expense", amount: ym<now ? 0 : ym===now ? left : base, budget:base, changed:ov!==null, spent, categoryId:r.categoryId, accountId:r.accountId, day:r.day, ends});
      continue;
    }
    items.push({key:`r:${r.id}|${ym}`, src:"r", id:r.id, name:r.name, type:r.type, amount:base, changed:ov!==null, categoryId:r.categoryId, accountId:r.accountId, ...(r.shift==="trading"&&r.day&&recDay(r,ym)!==r.day?{moved:r.day}:{}), ...(r.type==="investment"?{chg:sipChg(r,base)}:{}), ...(r.type==="transfer"?{toAccountId:r.toAccountId, sub:`${accName(r.accountId)} → ${accName(r.toAccountId)}`}:{}), day:recDay(r,ym), ends});
  }
  const emiCat=(live("categories").find(c=>c.name==="Loan EMI")||{}).id;
  for(const l of live("loans")){
    if(kindOf(l)==="cardemi") continue; /* card EMIs reach the plan through the card's bill */
    const s=schedule(l), b=bankOf(l), row=s && s.rows.find(r=>r.ym===ym);
    if(row) items.push({key:`l:${l.id}|${ym}`, src:"l", id:l.id, name:`${l.name} EMI`, type:"expense", amount:row.emi, categoryId:emiCat, accountId:b.accountId, day:b.day, ends: ym===s.end, canMiss:kindOf(l)==="hybrid", sub:`EMI ${row.k} of ${s.rows.length} · ${rateTxt(row.rate)}%`});
    for(const p of famPlan(l)) if(p.ym===ym)
      items.push({key:p.key, src:"p", id:l.id, name:`Repay ${l.lender||l.name}`, type:"expense", amount:p.amount, accountId:p.plan.accountId, day:null, ends:false, sub:"Planned repayment · interest-free"});
  }
  items.push(...cardBills(ym));
  return items.sort((a,b)=>(a.day||99)-(b.day||99));
}
/* planned items as Insights counts them in month ym: a planned spend on a card counts in the month its bill is due,
   the same as card transactions (e.g. a subscription charged on 18 Nov to a card billed on 6 Dec counts in December) */
function planFor(ym){
  const now=ymOf(today()), out=[];
  for(let k=2;k>=0;k--){ const m=addM(ym,-k); if(m<now) continue;
    for(const it of planned(m)){
      const a=it.type==="expense" && it.src!=="c" && it.accountId && byId("accounts",it.accountId);
      const card=a && a.type==="card" && +a.stmtDay>=1;
      const bm = card ? ymOf(dueOf(a, stmtFor(a, dayIn(+m.slice(0,4), +m.slice(5), it.day||1)))) : m;
      if(bm===ym) out.push({...it, _m:m});
    } }
  return out;
}
const paidMap = () => { const m=new Map(); for(const t of live("txns")) if(t.link) m.set(t.link,t); return m; };
function monthActuals(ym){
  const a={income:0, expense:0, investment:0};
  for(const t of live("txns")) if(ymOf(t.date)===ym){ if(a[t.type]!==undefined) a[t.type]+=+t.amount; else if(t.type==="carry" && t.dir==="in") a.income+=+t.carry; }
  return a;
}
/* ---------- month-end carry-over (like the sheet's "Last Month Balance") ----------
   On the 1st, the main account's net for the month just ended is carried as a pair of entries:
   "Carried to next month" on the old month's last day and "Last month balance" on the new month's 1st.
   The pair nets to zero on the real balance; the old month closes at 0 and the new month shows it as income.
   Ids are fixed per account+month so two devices never create duplicates; a deleted pair is never recreated. */
let carryReady=false;
const lastDay = ym => { const [y,m]=ym.split("-").map(Number); return `${ym}-${pad(new Date(y,m,0).getDate())}`; };
function monthNet(accId, ym, skipCarryOut){
  let n=0; for(const t of live("txns")) if(!isHist(t) && ymOf(t.date)===ym){ if(skipCarryOut && t.type==="carry" && t.dir==="out") continue; n+=accEff(accId,t); } return Math.round(n*100)/100;
}
function ensureCarry(){
  const m=mainAcc(); if(!m) return false;
  const now=ymOf(today()), all=S.data.txns, touched=live("txns").filter(t=>!isHist(t) && accEff(m.id,t)!==0 && !(t.type==="carry")).map(t=>ymOf(t.date)).sort();
  if(!touched.length) return false;
  let ym = touched[0] < addM(now,-12) ? addM(now,-12) : touched[0], made=false;
  for(; ym<now; ym=addM(ym,1)){
    const oid=`carry-out-${m.id}-${ym}`;
    if(all.some(t=>t.id===oid)) continue;
    const net=monthNet(m.id, ym, true); if(Math.abs(net)<0.005) continue;
    const nx=addM(ym,1);
    put("txns",{id:oid, type:"carry", dir:"out", accountId:m.id, ym, carry:net, amount:Math.abs(net), date:lastDay(ym), note:""});
    put("txns",{id:`carry-in-${m.id}-${ym}`, type:"carry", dir:"in", accountId:m.id, ym, carry:net, amount:Math.abs(net), date:nx+"-01", note:""});
    made=true;
  }
  return made;
}
function carrySheet(t){
  const pair=[`carry-out-${t.accountId}-${t.ym}`,`carry-in-${t.accountId}-${t.ym}`].map(id=>byId("txns",id)).filter(x=>x&&!x.deleted);
  const calc=monthNet(t.accountId, t.ym, true);
  openSheet(`${mLabel(t.ym)} balance carried`, `
    <p class="note">${esc(accName(t.accountId))}'s balance for ${mLabel(t.ym)} is carried to ${mLabel(addM(t.ym,1))} as "Last month balance" income, and ${mLabel(t.ym)} closes at ₹0.00. Your bank balance isn't changed by this.</p>
    ${field(["carry","Amount carried (₹)","number",{value:t.carry,step:"0.01",neg:1,hint:`Calculated from your entries: ${money(calc)}. A negative amount carries a shortfall: type the amount, then tap − / +.`}])}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="rc" type="button">Use calculated</button><button class="btn danger" id="dl" type="button">Remove</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#rc").onclick=()=>{ $("#f_carry").value=calc; };
    s.querySelector("#dl").onclick=()=>askConfirm(`Remove the ${mLabel(t.ym)} carry-over? It won't be added again automatically.`,"Remove",()=>{ for(const x of pair){ x.deleted=true; stamp(x); } changed(); });
    s.querySelector("#sv").onclick=()=>{ const v=parseFloat(val("carry")); if(isNaN(v)){ toast("Enter an amount."); return; }
      for(const x of pair){ x.carry=Math.round(v*100)/100; x.amount=Math.abs(x.carry); stamp(x); } closeModal(); changed(); toast("Carry-over updated"); };
  });
}
/* the day an account's starting balance applies from. Cards imported from Money Manager on 10 Nov 2026 carry
   balances that Money Manager shows as outstanding, not payable, so they belong to the cycle after that day. */
/* a history card spend whose bill was still unpaid on the opening date is already inside the card's opening balance,
   which is counted in that bill's month — so it isn't counted again */
const histCovered = t => { if(!t.hist || t.type!=="expense") return false; const a=byId("accounts",t.accountId); if(!a || a.type!=="card" || !(+a.stmtDay>=1) || !(+a.opening<0)) return false;
  const od=openDateOf(a); return !!od && expMonth(t) >= ymOf(dueOf(a, stmtFor(a, od))); };
const openDateOf = a => a.openingDate || (a.type==="card" && String(a.id).startsWith("mm-") ? "2026-11-10" : null);
function balances(upto){
  const b=new Map(live("accounts").map(a=>{ const od=openDateOf(a); return [a.id, (!upto || !od || upto>=od) ? (+a.opening||0) : 0]; }));
  for(const t of live("txns")){
    if(upto && t.date>upto) continue;
    if(t.paidBy || t.hist) continue;   /* no-balance payers, and imported history already in the opening balances */
    const amt=+t.amount;
    if(t.type==="income") b.set(t.accountId,(b.get(t.accountId)||0)+amt);
    else if(t.type==="transfer"){ b.set(t.accountId,(b.get(t.accountId)||0)-amt); b.set(t.toAccountId,(b.get(t.toAccountId)||0)+amt); }
    else if(t.type==="loan"){ if(t.accountId && b.has(t.accountId)) b.set(t.accountId, b.get(t.accountId) + (t.act==="borrow" ? amt : -amt)); }
    else if(t.type==="carry"){ if(b.has(t.accountId)) b.set(t.accountId, b.get(t.accountId) + (t.dir==="in" ? +t.carry : -t.carry)); }
    else b.set(t.accountId,(b.get(t.accountId)||0)-amt);
  }
  return b;
}
/* credit card cycle: last statement date, what that statement left to pay, unbilled spend since, due date */
const dayIn = (y,m,d) => `${y}-${pad(m)}-${pad(Math.min(d, new Date(y,m,0).getDate()))}`;
/* statement k cycles back (k=0 = latest statement on or before today) */
/* the statement a spend on date d falls into, and the month that bill is due */
function stmtFor(a, d){
  let [y,m]=d.split("-").map(Number); const st=dayIn(y,m,+a.stmtDay);
  if(d>st){ m++; if(m>12){ m=1; y++; } }
  return dayIn(y,m,+a.stmtDay);
}
function dueOf(a, stmt){
  if(!+a.dueDay) return stmt;
  let [y,m]=stmt.split("-").map(Number); if(+a.dueDay<=+a.stmtDay){ m++; if(m>12){ m=1; y++; } }
  return dayIn(y,m,+a.dueDay);
}
/* month a transaction counts as an expense in: card spends count when their bill is due */
function expMonth(t){
  const a=t.accountId && byId("accounts",t.accountId);
  if(t.type==="expense" && a && a.type==="card" && +a.stmtDay>=1) return ymOf(dueOf(a, stmtFor(a, t.date)));
  return ymOf(t.date);
}
/* card bills due in month ym, for the forecast, Home and the HDFC month-end:
   bills already generated show what's left to pay; the next statement shows what's been spent toward it so far */
/* ---------- card EMIs ----------
   A purchase converted to EMI on a card. Each statement gets: principal (purchase category) and interest + GST
   (Interest Charges); the first one also gets the processing fee + GST (Service Charges). Entries are posted on
   the statement date with fixed ids, so they are never duplicated and an edited month is never overwritten. */
const catByName = (...names) => { for(const n of names){ const c=live("categories").find(c=>c.kind==="expense" && c.name.toLowerCase()===n.toLowerCase()); if(c) return c.id; } return null; };
function cemiParts(l){
  const a=byId("accounts",l.accountId), sd=+(a&&a.stmtDay)||1, s=schedule(l), g=(l.gstRate??18)/100; if(!s) return [];
  return s.rows.map(r=>{ const [y,m]=r.ym.split("-").map(Number); return {ym:r.ym, stmt:dayIn(y,m,sd), k:r.k, n:s.rows.length,
    prin:Math.round(r.prin*100)/100, intg:Math.round(r.int*(1+g)*100)/100, fee: r.k===1 ? Math.round((+l.fee||0)*(1+g)*100)/100 : 0}; });
}
function ensureCardEmi(){
  const td=today(), all=S.data.txns, intCat=catByName("Interest Charges","Fees & Charges","Fees, legal & tax"), feeCat=catByName("Service Charges","Fees & Charges","Fees, legal & tax");
  let made=false;
  for(const l of live("loans")) if(kindOf(l)==="cardemi" && l.accountId) for(const p of cemiParts(l)){
    if(p.stmt>td) break;
    if(l.postFrom && p.stmt<l.postFrom) continue; /* statements before you added it are already in the card's balance */
    const base=`cemi-${l.id}-${p.ym}`, mk=(sfx,amount,cat,note)=>{ if(amount<0.005 || all.some(t=>t.id===base+sfx)) return; put("txns",{id:base+sfx, type:"expense", amount, date:p.stmt, accountId:l.accountId, categoryId:cat||l.categoryId||null, note, cemi:l.id}); made=true; };
    mk("-p", p.prin, l.categoryId, `${l.name} EMI ${p.k}/${p.n}`);
    mk("-i", p.intg, intCat, `${l.name} interest + GST ${p.k}/${p.n}`);
    mk("-f", p.fee, feeCat, `${l.name} processing fee + GST`);
  }
  return made;
}
/* card EMI amounts not yet posted whose bill is due in month ym: [{l, card, cat, v}] */
function cemiDue(ym){
  const out=[], td=today(), intCat=catByName("Interest Charges","Fees & Charges","Fees, legal & tax"), feeCat=catByName("Service Charges","Fees & Charges","Fees, legal & tax");
  for(const l of live("loans")) if(kindOf(l)==="cardemi" && l.accountId){ const a=byId("accounts",l.accountId); if(!a) continue;
    for(const p of cemiParts(l)) if(p.stmt>td && ymOf(dueOf(a,p.stmt))===ym){
      out.push({l, card:a.id, cat:l.categoryId, v:p.prin}); if(p.intg>0.005) out.push({l, card:a.id, cat:intCat, v:p.intg}); if(p.fee>0.005) out.push({l, card:a.id, cat:feeCat, v:p.fee}); } }
  return out;
}
/* EMI amounts still to be posted on a card for statement date st */
function cemiFuture(cardId, st){ let v=0; for(const l of live("loans")) if(kindOf(l)==="cardemi" && l.accountId===cardId) for(const p of cemiParts(l)) if(p.stmt===st && p.stmt>today()) v+=p.prin+p.intg+p.fee; return v; }
function cardBills(ym){
  const td=today(), out=[];
  for(const a of live("accounts")){
    if(a.type!=="card" || !(+a.stmtDay>=1) || !countsAcc(a)) continue;
    let [y,m]=ym.split("-").map(Number); if(+a.dueDay && +a.dueDay<=+a.stmtDay){ m--; if(m<1){ m=12; y--; } }
    const c=cardInfo(a);
    /* in the current month, also carry an unpaid bill whose due date has already passed */
    const sts=[dayIn(y,m,+a.stmtDay)]; if(ym===ymOf(td)){ let py=y, pm=m-1; if(pm<1){ pm=12; py--; } sts.unshift(dayIn(py,pm,+a.stmtDay)); }
    for(const st of sts){
    const due=dueOf(a,st), key=`c:${a.id}|${st}`, overdue=st!==sts[sts.length-1];
    if(st<=td){
      const billed=Math.max(0,-(balances(st).get(a.id)||0)); if(billed<0.5) continue;
      let paid=0; for(const x of cardTx(a, st, td)){ const e=cardEff(a,x); if(e>0) paid+=e; }
      const left=Math.max(0,billed-paid);
      if(overdue && left<0.5) continue;
      out.push({key, src:"c", id:a.id, name:`${a.name} bill`, type:"expense", amount:left>0.5?left:billed, accountId:a.payFrom||null, day:overdue?1:(+a.dueDay||null), ends:false, paidC:left<0.5, sub:`Statement ${fmtD(st)} · ${overdue?"overdue since":"due"} ${fmtD(due)}`});
    } else {
      const sofar = c && st===c.next ? c.unbilled : 0, emis = cemiFuture(a.id, st), amt = sofar+emis;
      if(amt>0.5) out.push({key, src:"c", id:a.id, name:`${a.name} bill`, type:"expense", amount:amt, accountId:a.payFrom||null, day:+a.dueDay||null, ends:false, sub:`Statement ${fmtD(st)} · ${sofar>0.5?"spent so far":""}${sofar>0.5&&emis>0.5?" + ":""}${emis>0.5?"card EMIs":""} · due ${fmtD(due)}`});
    }
    }
  }
  return out;
}
function cardCycle(a, k=0){
  const t=new Date(); let y=t.getFullYear(), m=t.getMonth()+1;
  if(t.getDate() < +a.stmtDay) m--;
  m-=k; while(m<1){ m+=12; y--; }
  const at=(yy,mm)=>{ while(mm<1){ mm+=12; yy--; } while(mm>12){ mm-=12; yy++; } return dayIn(yy,mm,+a.stmtDay); };
  const stmt=at(y,m), prev=at(y,m-1), next=at(y,m+1);
  let due=null; if(+a.dueDay){ let dm=m+(+a.dueDay<=+a.stmtDay?1:0), dy=y; while(dm>12){ dm-=12; dy++; } due=dayIn(dy,dm,+a.dueDay); }
  return {stmt, prev, next, due};
}
/* each txn's effect on the card's balance (negative = more owed) */
function cardEff(a,t){
  const amt=+t.amount;
  if(t.type==="transfer") return t.toAccountId===a.id ? amt : t.accountId===a.id ? -amt : 0;
  if(t.accountId!==a.id) return 0;
  if(t.type==="income") return amt;
  if(t.type==="loan") return t.act==="borrow" ? amt : -amt;
  return -amt;
}
const cardTx = (a,from,to) => live("txns").filter(t=>!isHist(t) && t.date>from && (!to || t.date<=to) && cardEff(a,t)!==0).sort((p,q)=>q.date.localeCompare(p.date)||(q.updatedAt-p.updatedAt));
function cardInfo(a, k=0){
  if(a.type!=="card" || !(+a.stmtDay>=1)) return null;
  const td=today(), cy=cardCycle(a,k), until = k===0 ? td : cy.next;
  const atStmt=balances(cy.stmt).get(a.id)||0, now=balances().get(a.id)||0;
  let paid=0; for(const x of cardTx(a, cy.stmt, until)){ const e=cardEff(a,x); if(e>0) paid+=e; }
  const billed=Math.max(0,-atStmt), dueLeft=Math.max(0, billed-paid), owed=Math.max(0,-now), unbilled=Math.max(0, owed-dueLeft);
  const days = cy.due ? Math.round((new Date(cy.due+"T00:00")-new Date(td+"T00:00"))/864e5) : null;
  return {...cy, billed, paid, dueLeft, owed, unbilled, days};
}
const fmtD = d => `${dLabel(d)}${d.slice(0,4)!==today().slice(0,4)?" "+d.slice(0,4):""}`;
/* Money Manager-style card row: name + due status on the left, balance payable on the right */
function dueText(c){
  if(c.billed<0.5) return `<span class="ccmut">No bill this cycle · next statement ${fmtD(c.next)}</span>`;
  if(c.dueLeft<0.5) return `<span class="ccok">Paid</span> · next statement ${fmtD(c.next)}`;
  if(!c.due) return `Statement ${fmtD(c.stmt)}`;
  if(c.days<0) return `<span class="ccbad">Overdue by ${-c.days} day${c.days===-1?"":"s"}</span> · was due ${fmtD(c.due)}`;
  if(c.days===0) return `<span class="ccbad">Due today</span>`;
  return `Due ${fmtD(c.due)} · <span class="${c.days<=5?"ccbad":"ccsoon"}">${c.days} day${c.days===1?"":"s"} left</span>`;
}
function cardLine(a, tap){
  const c=cardInfo(a), attrs=tap?`data-card="${esc(a.id)}" role="button" tabindex="0"`:"";
  if(!c){ const v=balances().get(a.id)||0;
    return `<div class="row ${tap?"tap":""}" ${attrs}><div class="main"><div class="t">${esc(a.name)}</div><div class="s">Add statement and due day</div></div><div class="ccamt"><div class="cclbl">Outstanding</div><div class="amt ${v<0?"neg":""}">${money(Math.max(0,-v))}</div></div></div>`; }
  return `<div class="row ${tap?"tap":""}" ${attrs}><div class="main"><div class="t">${esc(a.name)}</div><div class="s">${dueText(c)}</div></div>
    <div class="ccamt"><div class="cclbl">Payable</div><div class="amt ${c.dueLeft>0.5?"neg":""}">${money(c.dueLeft)}</div></div></div>`;
}
function forecast(h){
  const now=ymOf(today()), paid=paidMap(), bal=balances();
  const startBal=live("accounts").filter(countsAcc).reduce((s,a)=>s+(bal.get(a.id)||0),0); let run=startBal;
  const months=[];
  for(let i=0;i<h;i++){
    const ym=addM(now,i), items=planned(ym);
    let inc=0,out=0,inv=0,emi=0;
    const rows=items.map(it=>{ const p=paid.get(it.key); return {...it, paid:!!p || !!it.paidC, missed:!!(p && p.act==="missed")}; });
    for(const it of rows){ if(i===0 && it.paid) continue;
      if(it.type==="transfer"){ const fa=byId("accounts",it.accountId), ta=byId("accounts",it.toAccountId); run += ((ta&&countsAcc(ta))?it.amount:0) - ((fa&&countsAcc(fa))?it.amount:0); continue; }
      if(it.type==="income") inc+=it.amount; else if(it.type==="investment") inv+=it.amount; else { out+=it.amount; if(it.src==="l") emi+=it.amount; } }
    run += inc-out-inv;
    months.push({ym, rows, inc, out, inv, emi, net:inc-out-inv, bal:run, ending:rows.filter(r=>r.ends)});
  }
  return {months, start:startBal};
}

/* ---------- Drive sync ---------- */
let mcp=null, syncTimer=null, syncing=false, lastSync=null;
function setSync(state, txt){ $("#syncDot").className="dot "+(state||""); $("#syncTxt").textContent=txt; }
function norm(r){
  if(r && typeof r==="object" && "payload" in r) r=r.payload;
  if(r && r.structuredContent) r=r.structuredContent;
  if(r && Array.isArray(r.content) && r.content[0] && typeof r.content[0].text==="string"){ try{ r=JSON.parse(r.content[0].text); }catch(e){ r=r.content[0].text; } }
  if(typeof r==="string"){ try{ r=JSON.parse(r); }catch(e){} }
  return r;
}
async function call(tool,input){
  if(typeof mcp.server==="function"){ const s=await mcp.server(DRIVE); if(s && typeof s[tool]==="function") return norm(await s[tool](input)); }
  return norm(await mcp.callTool(DRIVE, tool, input));
}
function b64bytes(b64){ const bin=atob(String(b64).replace(/\s/g,"")); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; }
function b64utf8(b64){ return new TextDecoder().decode(b64bytes(b64)); }
function bytesB64(u){ let s=""; for(let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null, u.subarray(i,i+0x8000)); return btoa(s); }
const canGzip = typeof CompressionStream==="function" && typeof DecompressionStream==="function";
async function gz(text){ return new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer()); }
async function gunzip(u){ return await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).text(); }
/* Drive copy: gzipped (about 7× smaller, so large histories fit through the connector); plain JSON files are still read */
async function driveText(content){ const u=b64bytes(content); return (u[0]===0x1f && u[1]===0x8b) ? await gunzip(u) : new TextDecoder().decode(u); }
async function initDrive(){
  try{ mcp = (window.claude && typeof window.claude.use==="function") ? await window.claude.use("mcp") : null; }catch(e){ mcp=null; }
  if(!mcp){ setSync("","Device only"); carryReady=true; render(); return; }
  await syncNow();
}
function scheduleSync(){ if(!mcp && !(HOSTED && H.key && H.user)) return; if(HOSTED){ clearTimeout(syncTimer); setSync("busy","Saving…"); syncTimer=setTimeout(()=>hSync(), 2500); return; } clearTimeout(syncTimer); setSync("busy","Saving…"); syncTimer=setTimeout(syncNow, 2500); }
async function syncNow(){
  if(HOSTED){ if(!H.key) return; if(!H.user){ try{ const u=await hSignIn(); if(u) return hSync(); }catch(e){ toast("Sign-in didn't finish ("+(e.code||e.message)+")."); } return; } return hSync(); }
  if(!mcp){ toast("Google Drive isn't connected in this view. Your data is saved on this device."); return; }
  if(syncing){ scheduleSync(); return; }
  syncing=true; setSync("busy","Syncing…");
  try{
    const res = await call("search_files",{query:`title contains 'kp-money-planner-data' and parentId = '${FOLDER_ID}'`, orderBy:"modifiedTime desc", excludeContentSnippets:true, pageSize:20});
    const files=(res && res.files)||[];
    let remote=null;
    if(files.length){
      const dl = await call("download_file_content",{fileId:files[0].id});
      try{ remote = JSON.parse(await driveText(dl.content)); }catch(e){ remote=null; }
    }
    const before = sig(S.data);
    /* a fresh device seeds default categories; drop them if Drive already has this user's set */
    if(remote && (remote.categories||[]).length){ for(const c of ["accounts","categories"]) S.data[c]=S.data[c].filter(x=>!x.seed || x.deleted); }
    const merged = merge(S.data, remote);
    const needPush = !remote || sig(merged)!==sig(remote) || files.length>1;
    S.data = merged;
    if(needPush){
      const text=JSON.stringify({...merged, savedAt:new Date().toISOString()});
      const made = canGzip
        ? await call("create_file",{title:FILE+".gz", parentId:FOLDER_ID, base64Content:bytesB64(await gz(text)), contentMimeType:"application/gzip", disableConversionToGoogleType:true})
        : await call("create_file",{title:FILE, parentId:FOLDER_ID, textContent:text, contentMimeType:"application/json", disableConversionToGoogleType:true});
      const newId = made && (made.id || (made.file && made.file.id));
      if(!newId) throw new Error("Drive did not return the new file");
      for(const f of files) if(f.id!==newId){ try{ await call("trash_file",{fileId:f.id}); }catch(e){} }
    }
    S.dirty=false; saveLocal();
    lastSync=new Date(); setSync("ok","Synced "+lastSync.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"}));
    if(!carryReady){ carryReady=true; render(); }
    if(sig(S.data)!==before) render();
  }catch(e){
    const msg = (e && (e.code||e.message)) || "error";
    setSync("err","Sync failed");
    toast("Couldn't reach Google Drive ("+msg+"). Changes are kept on this device; tap the sync button to retry.");
  }finally{ syncing=false; }
}

/* ---------- UI: modal & toast ---------- */
function toast(t){ const d=document.createElement("div"); d.className="toast"; d.setAttribute("role","status"); d.textContent=t; document.body.appendChild(d); setTimeout(()=>d.remove(), 3800); }
function closeModal(){ $("#modal").innerHTML=""; }
function openSheet(title, bodyHtml, onMount){
  $("#modal").innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3>${bodyHtml}</div></div>`;
  $("#scrim").addEventListener("click", e=>{ if(e.target.id==="scrim") closeModal(); });
  onMount && onMount($("#modal .sheet"));
  if($("#modal #f_categoryId")) attachCatPicker($("#modal .sheet"));
  for(const id of ["f_accountId","f_toAccountId","f_payFrom","f_ownAcc"]){ const el=$("#modal #"+id); if(el && el.tagName==="SELECT") attachAccPicker($("#modal .sheet"), el); }
  const f=$("#modal input, #modal select"); f && f.focus({preventScroll:true});
}
function askConfirm(msg, yesLbl, fn){
  openSheet("Are you sure?", `<p>${esc(msg)}</p><div class="btns"><button class="btn danger" id="cy" type="button">${esc(yesLbl)}</button><button class="btn" id="cn" type="button">Cancel</button></div>`,
    s=>{ s.querySelector("#cy").onclick=()=>{ closeModal(); fn(); }; s.querySelector("#cn").onclick=closeModal; });
}
/* Money Manager-style category picker over the hidden #f_categoryId select:
   main categories as tiles -> tap one to see its subcategories; search across all; recently used on top */
function attachCatPicker(sheet){
  const sel=sheet.querySelector("#f_categoryId"); sel.hidden=true;
  sel.insertAdjacentHTML("afterend", `<button type="button" class="cpbtn" id="cp_btn" aria-expanded="false"><span id="cp_lbl"></span><span aria-hidden="true">▾</span></button>
    <div class="cppanel" id="cp_panel" hidden><input type="search" id="cp_q" placeholder="Search categories" autocomplete="off"><div id="cp_body"></div></div>`);
  const btn=sheet.querySelector("#cp_btn"), panel=sheet.querySelector("#cp_panel"), q=sheet.querySelector("#cp_q"), body=sheet.querySelector("#cp_body");
  let parent=null;
  const ids=()=>new Set([...sel.options].map(o=>o.value));
  const label=()=>{ sheet.querySelector("#cp_lbl").textContent = sel.value ? catName(sel.value) : (sel.selectedOptions[0]?.textContent || "Choose a category"); };
  const allOpt=[...sel.options].find(o=>o.value==="" && o.textContent!=="Choose a category");
  const tree=()=>{ const ok=ids(); return catTree().filter(({c})=>ok.has(c.id)).map(({c,subs})=>({c, subs:subs.filter(x=>ok.has(x.id))})); };
  const recent=()=>{ const ok=ids(), out=[]; for(const t of live("txns").slice().sort((a,b)=>b.date.localeCompare(a.date)||(b.updatedAt-a.updatedAt))){ if(t.categoryId && ok.has(t.categoryId) && !out.includes(t.categoryId)) out.push(t.categoryId); if(out.length>=6) break; } return out; };
  const item=(id,txt,more)=>`<button type="button" class="cpi ${id===sel.value?"on":""}" data-cpick="${esc(id)}" ${more?`data-cpar="${esc(id)}"`:""}>${esc(txt)}${more?' <span class="cpm">›</span>':""}</button>`;
  const draw=()=>{
    const term=q.value.trim().toLowerCase();
    if(term){
      const hits=[]; for(const {c,subs} of tree()){ if(c.name.toLowerCase().includes(term)) hits.push([c.id,c.name]); for(const x of subs) if(x.name.toLowerCase().includes(term) || c.name.toLowerCase().includes(term)) hits.push([x.id,`${c.name} › ${x.name}`]); }
      body.innerHTML = hits.length ? `<div class="cplist">${hits.slice(0,40).map(([id,t])=>`<button type="button" class="cprow" data-cpick="${esc(id)}">${esc(t)}</button>`).join("")}</div>` : '<p class="note">No category matches. Add one under Setup.</p>';
      return;
    }
    if(parent){
      const p=tree().find(x=>x.c.id===parent);
      if(!p){ parent=null; return draw(); }
      body.innerHTML = `<button type="button" class="btn sm" data-cpback="1" style="margin-bottom:8px">‹ All categories</button>
        <div class="cpgrid">${item(p.c.id, `${p.c.name} (general)`)}${p.subs.map(x=>item(x.id,x.name)).join("")}</div>`;
      return;
    }
    const rec=recent();
    body.innerHTML = `${rec.length?`<p class="cphd">Recent</p><div class="cpchips">${rec.map(id=>`<button type="button" class="chip mute" data-cpick="${esc(id)}" style="border:0;cursor:pointer">${esc(catName(id))}</button>`).join("")}</div>`:""}
      ${allOpt?`<div class="cpchips"><button type="button" class="chip ${sel.value?"mute":""}" data-cpick="" style="border:0;cursor:pointer">${esc(allOpt.textContent)}</button></div>`:""}
      <p class="cphd">All categories</p><div class="cpgrid">${tree().map(({c,subs})=>item(c.id,c.name,subs.length>0)).join("")}</div>`;
  };
  const open=v=>{ panel.hidden=!v; btn.setAttribute("aria-expanded",v); if(v){ parent=null; q.value=""; draw(); q.focus({preventScroll:true}); panel.scrollIntoView({block:"nearest"}); } };
  btn.onclick=()=>open(panel.hidden);
  q.oninput=draw;
  q.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); const f=body.querySelector("[data-cpick]"); if(f) f.click(); } if(e.key==="Escape"){ e.stopPropagation(); open(false); btn.focus(); } };
  body.onclick=e=>{
    const b=e.target.closest("button"); if(!b) return; e.stopPropagation();
    if(b.dataset.cpback){ parent=null; return draw(); }
    if(b.dataset.cpar){ parent=b.dataset.cpar; return draw(); }
    if("cpick" in b.dataset){ sel.value=b.dataset.cpick; label(); open(false); }
  };
  new MutationObserver(()=>{ label(); if(!panel.hidden) draw(); }).observe(sel,{childList:true});
  label();
}
/* account picker over a hidden account <select>: bank accounts and cards in groups, balances, search, recent */
function attachAccPicker(sheet, sel){
  const k=sel.id; sel.hidden=true;
  sel.insertAdjacentHTML("afterend", `<button type="button" class="cpbtn" id="ap_btn_${k}" aria-expanded="false"><span class="aplbl"></span><span aria-hidden="true">▾</span></button>
    <div class="cppanel" hidden><input type="search" placeholder="Search accounts" autocomplete="off"><div class="apbody"></div></div>`);
  const btn=sheet.querySelector("#ap_btn_"+k), panel=btn.nextElementSibling, q=panel.querySelector("input"), body=panel.querySelector(".apbody");
  panel.dataset.for=btn.id; panel.style.marginBottom="12px";
  const host=sel.closest(".grid2"); if(host) host.insertAdjacentElement("afterend", panel);
  const bal=balances();
  const opts=()=>[...sel.options].map(o=>({v:o.value, a:o.value?byId("accounts",o.value):null, t:o.textContent}));
  const nameOf=o=>o.a ? o.a.name : o.t;
  const label=()=>{ const o=opts().find(x=>x.v===sel.value); btn.querySelector(".aplbl").innerHTML = o ? (o.a ? `${esc(o.a.name)} <span class="apsub">${o.a.type==="card"?"Card":ACC_LBL[o.a.type]} · ${money(bal.get(o.a.id)||0)}</span>` : esc(o.t)) : "Choose an account"; };
  const recent=()=>{ const ok=new Set(opts().filter(o=>o.a).map(o=>o.v)), out=[];
    for(const t of live("txns").slice().sort((a,b)=>b.date.localeCompare(a.date)||(b.updatedAt-a.updatedAt))){ for(const id of [t.accountId,t.toAccountId]) if(id && ok.has(id) && !out.includes(id)) out.push(id); if(out.length>=4) break; }
    return out.slice(0,4); };
  const row=o=>{ const v=o.a ? bal.get(o.a.id)||0 : null;
    return `<button type="button" class="aprow ${o.v===sel.value?"on":""}" data-apick="${esc(o.v)}"><span>${esc(nameOf(o))}</span>${o.a?`<span class="amt ${v<0?"neg":""}">${money(v)}</span>`:""}</button>`; };
  const draw=()=>{
    const term=q.value.trim().toLowerCase(), all=opts();
    if(term){ const hits=all.filter(o=>nameOf(o).toLowerCase().includes(term)); body.innerHTML = hits.length ? `<div class="aplist">${hits.map(row).join("")}</div>` : '<p class="note">No account matches.</p>'; return; }
    const none=all.filter(o=>!o.a && !o.v.startsWith("@")), sp=all.filter(o=>o.v.startsWith("@")), banks=all.filter(o=>o.a && o.a.type!=="card"), cards=all.filter(o=>o.a && o.a.type==="card"), rec=recent();
    const sec=(h,list)=>list.length?`<p class="cphd">${h}</p><div class="aplist">${list.map(row).join("")}</div>`:"";
    body.innerHTML = `${rec.length && all.length>6 ? `<p class="cphd">Recent</p><div class="cpchips">${rec.map(id=>`<button type="button" class="chip mute" data-apick="${esc(id)}" style="border:0;cursor:pointer">${esc(byId("accounts",id).name)}</button>`).join("")}</div>`:""}
      ${sec("",none)}${sec("Bank accounts",banks)}${sec("Credit cards",cards)}${sec("No balance kept",sp)}`;
  };
  const open=v=>{ for(const pn of sheet.querySelectorAll(".cppanel")) if(pn!==panel && !pn.hidden){ pn.hidden=true; sheet.querySelector("#"+(pn.dataset.for||"cp_btn"))?.setAttribute("aria-expanded",false); }
    panel.hidden=!v; btn.setAttribute("aria-expanded",v); if(v){ q.value=""; draw(); if(opts().length>8) q.focus({preventScroll:true}); panel.scrollIntoView({block:"nearest"}); } };
  btn.onclick=()=>open(panel.hidden);
  q.oninput=draw;
  q.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); const f=body.querySelector("[data-apick]"); if(f) f.click(); } if(e.key==="Escape"){ e.stopPropagation(); open(false); btn.focus(); } };
  body.onclick=e=>{ const b=e.target.closest("[data-apick]"); if(!b) return; e.stopPropagation(); sel.value=b.dataset.apick; sel.dispatchEvent(new Event("change",{bubbles:true})); label(); open(false); };
  new MutationObserver(label).observe(sel,{childList:true});
  label();
}
/* field builder: [id,label,kind,opts] */
/* money boxes: Indian commas as you type (14,16,872), with lakh / crore under big amounts */
const isInrField = (id,label,kind) => kind==="number" && (/₹/.test(label) && !/per \$1|per unit/i.test(label) || /^(sa\d+)$/.test(id));
const inrFmt = raw => { let s=String(raw??"").replace(/[^\d.\-]/g,""); if(!s) return ""; const neg=s.startsWith("-"); s=s.replace(/-/g,"");
  const [i,...r]=s.split("."), d=r.join(""); const n=i.replace(/^0+(?=\d)/,""); return (neg?"-":"")+(n?(+n).toLocaleString("en-IN"):(r.length?"0":""))+(s.includes(".")?"."+d.slice(0,2):""); };
const inrWords = n => { n=Math.abs(n); return n>=1e7 ? `${(n/1e7).toFixed(2).replace(/\.?0+$/,"")} crore` : n>=1e5 ? `${(n/1e5).toFixed(2).replace(/\.?0+$/,"")} lakh` : ""; };
function inrInput(e){ const i=e.target; if(!i.matches || !i.matches("input[data-inr]")) return;
  const pos=i.selectionStart??i.value.length, keep=i.value.slice(0,pos).replace(/[^\d.\-]/g,"").length, f=inrFmt(i.value);
  if(f!==i.value){ i.value=f; let c=0, k=0; while(c<f.length && k<keep){ if(/[\d.\-]/.test(f[c])) k++; c++; } try{ i.setSelectionRange(c,c); }catch(x){} }
  inrHint(i); }
function inrHint(i){ const w=i.closest(".f"); if(!w) return; let h=w.querySelector(".inrh"); const n=parseFloat(i.value.replace(/,/g,""))||0, t=inrWords(n);
  if(!t){ if(h) h.textContent=""; return; } if(!h){ h=document.createElement("div"); h.className="inrh"; (i.closest(".negwrap")||i).after(h); } h.textContent="₹ "+t; }
document.addEventListener("input", inrInput, true);
function field(f){
  const [id,label,kind0,o={}] = f; const inr=isInrField(id,label,kind0), kind=inr?"text":kind0; const v = inr ? inrFmt(o.value ?? "") : (o.value ?? "");
  let inp;
  if(kind==="select") inp=`<select id="f_${id}">${(o.options||[]).map(([val,l])=>`<option value="${esc(val)}" ${String(val)===String(v)?"selected":""}>${esc(l)}</option>`).join("")}</select>`;
  else if(kind==="textarea") inp=`<textarea id="f_${id}">${esc(v)}</textarea>`;
  else inp=`<input id="f_${id}" type="${kind}" value="${esc(v)}" ${o.step?`step="${o.step}"`:""} ${o.ph?`placeholder="${esc(o.ph)}"`:""} ${kind==="number"||inr?'inputmode="decimal"':""} ${inr?"data-inr":""} ${o.list?`list="${o.list}"`:""}>`;
  if(o.neg) inp=`<div class="negwrap">${inp}<button type="button" class="btn negbtn" data-neg="f_${id}" aria-label="Switch between minus and plus">− / +</button></div>`;
  return `<div class="f" id="w_${id}" ${o.hide?'hidden':''}><label for="f_${id}">${esc(label)}</label>${inp}${o.hint?`<div class="hint">${esc(o.hint)}</div>`:""}</div>`;
}
const val = id => { const e=$("#f_"+id); return e ? (e.hasAttribute("data-inr") ? e.value.replace(/,/g,"") : e.value).trim() : ""; };
function catTree(kind){
  const all=live("categories").filter(c=>!kind || c.kind===kind), ids=new Set(all.map(c=>c.id));
  const tops=all.filter(c=>!c.parentId || !ids.has(c.parentId)).sort((a,b)=>a.name.localeCompare(b.name));
  return tops.map(t=>({c:t, subs:all.filter(s=>s.parentId===t.id).sort((a,b)=>a.name.localeCompare(b.name))}));
}
const catOpts = kind => catTree(kind).flatMap(({c,subs})=>[[c.id,c.name], ...subs.map(s=>[s.id, `${c.name} › ${s.name}`])]);
/* loans you can pay from directly (money that never went through your accounts) */
/* an expense paid from your account with money borrowed on a loan: fundLoan (+ fundAmt when only part of it) */
const fundOf = t => t && t.type==="expense" ? (t.fundLoan ? {loan:t.fundLoan, amt:Math.min(+t.fundAmt||+t.amount, +t.amount)} : t.fromLoan ? {loan:t.fromLoan, amt:+t.amount} : null) : null;
/* all the loans whose money paid for an expense: [{loan, amt, part}] (part "own"/"bank" for loans with both) */
const fundsOf = t => { if(!t || t.type!=="expense") return []; const tot=Math.abs(+t.amount||0);
  if((t.funds||[]).length){ let left=tot; return t.funds.map(f=>{ const a=Math.max(0,Math.min(+f.amt||0,left)); left-=a; return {loan:f.loan, amt:a, part:f.part||""}; }).filter(f=>f.loan && f.amt>0); }
  const f=fundOf(t); return f ? [{loan:f.loan, amt:f.amt, part:""}] : []; };
const fundNames = fs => fs.map(f=>(byId("loans",f.loan)||{}).name).filter(Boolean).join(" + ");
/* the "Money from loans" rows in a form; returns a reader for the rows */
function fundsUI(host, init, totalFn){
  const L=fundLoanOpts().slice(1); let rows=(init||[]).map(f=>({loan:f.loan, amt:f.amt??"", part:f.part||"own"}));
  const tot=()=>Math.abs(totalFn()||0), sum=()=>rows.reduce((a,r)=>a+(parseFloat(String(r.amt).replace(/,/g,""))||0),0);
  const own=()=>{ const el=host.querySelector(".fundOwn"); if(!rows.some(r=>r.loan)){ el.textContent="All your own money"; el.classList.remove("warn"); return; }
    const t=tot(), lone=rows.filter(r=>r.loan).length===1 && !String(rows.find(r=>r.loan).amt).trim();
    const rest=lone ? 0 : t-sum(); el.textContent = rest<-0.5 ? `The loans add up to ${money(sum())}, more than the ${money(t)} paid` : `Your own money: ${money(Math.max(0,rest))}`; el.classList.toggle("warn", rest<-0.5); };
  const draw=()=>{ host.querySelector(".fundList").innerHTML=rows.map((r,i)=>{ const l=byId("loans",r.loan), hy=l&&kindOf(l)==="hybrid";
      return `<div class="fundrow" data-i="${i}"><select data-k="loan" aria-label="Loan">${[["","Choose a loan"],...L].map(([v,x])=>`<option value="${esc(v)}" ${v===r.loan?"selected":""}>${esc(x)}</option>`).join("")}</select>
        <input data-k="amt" data-inr type="text" inputmode="decimal" aria-label="Amount from this loan" placeholder="${rows.length===1?"All of it":"Amount"}" value="${esc(inrFmt(r.amt))}">
        <button type="button" class="btn sm" data-x aria-label="Remove this loan">✕</button>
        ${hy?`<select data-k="part" class="fpart" aria-label="Which part"><option value="own" ${r.part!=="bank"?"selected":""}>${esc(l.lender||"Their")}'s own money (interest-free)</option><option value="bank" ${r.part==="bank"?"selected":""}>Bank-loan money (${esc((bankOf(l)||{}).lender||"bank")}, with interest)</option></select>`:""}</div>`; }).join(""); own(); };
  host.addEventListener("change", e=>{ const row=e.target.closest(".fundrow"); if(!row) return; const r=rows[+row.dataset.i], k=e.target.dataset.k; if(!r||!k) return; r[k]=e.target.value; if(k==="loan") draw(); else own(); });
  host.addEventListener("input", e=>{ const row=e.target.closest(".fundrow"); if(!row || e.target.dataset.k!=="amt") return; rows[+row.dataset.i].amt=e.target.value; own(); });
  host.addEventListener("click", e=>{ if(e.target.closest("[data-x]")){ rows.splice(+e.target.closest(".fundrow").dataset.i,1); draw(); } else if(e.target.closest(".fundAdd")){ rows.push({loan:"",amt:"",part:"own"}); draw(); } });
  draw();
  return { refresh:own, get(){ const t=tot(), rs=rows.filter(r=>r.loan); if(!rs.length) return [];
      const out=rs.map(r=>{ const l=byId("loans",r.loan), a=parseFloat(String(r.amt).replace(/,/g,"")); return {loan:r.loan, amt:a>0?a:(rs.length===1?t:0), ...(l&&kindOf(l)==="hybrid"?{part:r.part==="bank"?"bank":"own"}:{})}; });
      if(out.some(f=>!(f.amt>0))) throw new Error("Enter how much came from each loan.");
      if(out.reduce((a,f)=>a+f.amt,0)>t+0.5) throw new Error("The loans add up to more than the amount paid.");
      return out; } };
}
const fundsBox = () => `<div class="f" id="w_funds"><label>Money from loans</label><div class="fundList"></div><button type="button" class="btn sm fundAdd">+ Add a loan</button><div class="note fundOwn" style="margin:6px 0 0"></div><div class="hint">For borrowed money (from Dad, LP, Monisha…) that came into your account and paid for this.</div></div>`;
const fundLoanOpts = () => [["","No, my own money"], ...live("loans").filter(l=>kindOf(l)!=="cardemi").map(l=>[l.id, `${l.name}${l.lender?` · ${l.lender}`:""}`])];
const legacyLoanOpt = id => { const l=id&&byId("loans",id); return l ? [["~"+l.id, `${l.name}${l.lender?` · ${l.lender}`:""} · loan`]] : []; };
const loanSrcOpts = () => live("loans").filter(l=>!l.closedOn || l.closedOn>ymOf(today())).map(l=>["~"+l.id, `${l.name}${l.lender?` · ${l.lender}`:""} · loan`]);
const fromLoanName = t => { const l=t.fromLoan && byId("loans",t.fromLoan); return l ? `Paid from ${l.name} (loan)` : "Paid from a loan"; };
const accOpts = (blankLbl, keep) => [...(blankLbl?[["",blankLbl]]:[]), ...live("accounts").filter(a=>!a.hidden || a.id===keep).map(a=>[a.id, `${a.name} · ${ACC_LBL[a.type]||a.type}`])];
const INV_TYPES=["Mutual Fund","Stock","US Stocks","PPF","NPS","EPF","Gold","FD / RD","Bonds","Real estate","Other"];
/* types valued as units x price; the rest are valued by typing the balance */
const UNIT_TYPES=["Mutual Fund","Stock","US Stocks","Gold"];   /* NPS is tracked by total value, like EPF and PPF */
const invTypeOf = t => t.invType || (t.link && t.link.startsWith("r:") ? byId("recurring",t.link.slice(2).split("|")[0])?.invType : null) || holdingFor(t.instrument)?.type || null;
const instruments = () => [...new Set([...live("holdings").map(h=>h.instrument||h.name), ...[...live("txns"),...live("recurring")].filter(x=>x.type==="investment" && x.instrument).map(x=>x.instrument)])];

/* ---------- forms ---------- */
function txnForm(t={}, preset){
  const isNew=!t.id; t={type:"expense", date:today(), ...preset, ...t}; if(S._potNext){ if(isNew) t.pot=S._potNext; S._potNext=null; }
  const body = `
    <div class="seg" role="group" aria-label="Type" id="tseg">${["expense","income","transfer","investment"].map(k=>`<button type="button" data-k="${k}" aria-pressed="${t.type===k}">${TYPE_LBL[k]}</button>`).join("")}</div><div style="height:12px"></div>
    ${field(["amount","Amount (₹)","number",{value:t.amount,step:"0.01",ph:"0.00",neg:1,hint:"A negative expense, e.g. -500, is a refund or cashback: it reduces that category's spending and adds back to the account."}])}
    <div class="grid2">${field(["date","Date","date",{value:t.date}])}${field(["accountId","From account","select",{value:t.paidBy?"@"+t.paidBy:t.fromLoan?"~"+t.fromLoan:t.accountId,options:[...accOpts("",t.accountId),...payers().map(p=>["@"+p.id,p.name]),...legacyLoanOpt(t.fromLoan),...(t.paidBy&&!payers().some(p=>p.id===t.paidBy)?[["@"+t.paidBy,payerLbl(t)]]:[])]}])}</div>
    <p class="note spnote" id="spNote" hidden></p>
    ${fundsBox()}
    <label class="opt" id="w_pot" hidden><input type="checkbox" id="f_pot" ${t.pot==="reserve"?"checked":""}><div><b>Paid from the big-bills reserve</b><span>Takes it out of the reserve pot, not your emergency fund.</span></div></label>
    ${field(["toAccountId","To account","select",{value:t.toAccountId,options:accOpts("",t.toAccountId),hint:"Use transfers for card bill payments, moving money to savings, or withdrawing cash. They don't count as spending."}])}
    ${field(["categoryId","Category","select",{value:t.categoryId,options:catOpts("expense")}])}
    ${field(["budgetId","Counts toward budget","select",{value:t.budgetId||"",options:[]}])}
    ${field(["instrument","Investment","text",{value:t.instrument,ph:"e.g. Nifty 50 index fund SIP",list:"instl",hint:"Only for new money leaving your account. For what you'd already invested, use Accounts → Investments → + Add."}])}<datalist id="instl">${instruments().map(i=>`<option value="${esc(i)}">`).join("")}</datalist>
    ${field(["invType","Investment type","select",{value:t.invType||"",options:[["","Choose a type"],...INV_TYPES.map(x=>[x,x])]}])}
    ${field(["units","Units bought (optional)","number",{value:t.units??"",step:"any",ph:"e.g. 12.345",hint:"Adds to the holding's units for units × price."}])}
    ${field(["charges","Charges (₹)","number",{value:t.charges??"",step:"0.01",ph:"0.00",hint:"Part of the amount that didn't go into the investment: stamp duty, platform or broker charges. Counted as Fees & Charges; the rest is invested."}])}
    ${field(["note","Note","text",{value:t.note,ph:"Optional"}])}
    <div class="f" id="w_tags"><label>Tags</label><div class="tagbox"></div><div class="hint">Tap to tag, e.g. Home, Office, Trip. Use as many as you like.</div></div>
    <label class="opt" style="margin-bottom:12px"><input type="checkbox" id="f_hist" ${t.hist?"checked":""}><div><b>Already in my balances</b><span>For a past entry you're adding late, when your account balances already include it. It shows in Insights and reports but doesn't change any balance, card bill or loan.</span></div></label>
    <div class="btns"><button class="btn pri" id="sv" type="button">${isNew?"Add":"Save"}</button><button class="btn" id="spl" type="button">Split</button>${isNew?"":'<button class="btn danger" id="dl" type="button">Delete</button>'}<button class="btn" id="cx" type="button">Cancel</button></div>`;
  openSheet(isNew?"Add transaction":"Edit transaction", body, s=>{
    const getTags=tagPicker(s, t.tags);
    noteSuggest(s);
    let type=t.type, first=true; const CUR=t.categoryId;
    var FU=fundsUI($("#w_funds"), t.fromLoan?[]:fundsOf(t), ()=>parseFloat(val("amount"))||0);
    /* mutual funds: fill the 0.005% stamp duty until you type your own charges */
    let chgTouched = t.charges!=null && t.charges!=="";
    const chgAuto=()=>{ if(chgTouched || type!=="investment") return; const ty=val("invType")||(holdingFor(val("instrument"))||{}).type, a=parseFloat(val("amount"));
      $("#f_charges").value = ty==="Mutual Fund" && a>0 ? stampDuty(a).toFixed(2) : ""; };
    $("#f_charges").addEventListener("input",()=>{ chgTouched=true; });
    $("#f_amount").addEventListener("input",chgAuto); $("#f_invType").addEventListener("change",chgAuto); $("#f_instrument").addEventListener("input",chgAuto);
    const sync=()=>{
      s.querySelectorAll("#tseg button").forEach(b=>b.setAttribute("aria-pressed", b.dataset.k===type));
      $("#w_toAccountId").hidden = type!=="transfer";
      $("#w_categoryId").hidden = type==="transfer" || type==="investment";
      $("#w_instrument").hidden = type!=="investment"; $("#w_invType").hidden = type!=="investment"; $("#w_units").hidden = type!=="investment"; $("#w_charges").hidden = type!=="investment";
      { const gl=()=>{ const ty=(val("invType")||(holdingFor(val("instrument"))||{}).type), g=ty==="Gold", us=ty==="US Stocks";
          $("#w_units label").textContent=g?"Grams bought (optional)":us?"Shares bought (optional)":"Units bought (optional)"; $("#w_units .hint").textContent=g?"Adds to the grams in your gold holding.":us?"Adds to the shares in this US stock holding. Enter the amount above in ₹, as it left your bank.":"Adds to the holding's units for units × price."; };
        gl(); $("#f_invType").onchange=gl; $("#f_instrument").oninput=gl; }
      chgAuto();
      { const ym=ymOf(val("date")||today()), bs=activeBudgets(ym), bsel=$("#f_budgetId"), keep=bsel.value||t.budgetId||"";
        bsel.innerHTML=[["","None"],...bs.map(r=>{ const left=+r.amount-budgetSpent(r.id,ym)+(t.budgetId===r.id&&ymOf(t.date||"")===ym?+t.amount:0); return [r.id, `${r.name} · ${left>=0?money(left)+" left":"over by "+money(-left)}`]; })].map(([v,l])=>`<option value="${esc(v)}" ${v===keep?"selected":""}>${esc(l)}</option>`).join("");
        $("#w_budgetId").hidden = !(type==="expense"||type==="transfer") || !bs.length; }
      $("#w_accountId label").textContent = type==="income" ? "Into account" : "From account";
      $("#spl").hidden = type!=="expense";
      $("#w_pot").hidden = !(type==="expense" && reserveAcc());
      $("#w_funds").hidden = type!=="expense" || $("#f_accountId").value.startsWith("~") || $("#f_accountId").value.startsWith("@"); if(FU) FU.refresh();
      { const asel=$("#f_accountId"), has=asel.querySelector('option[value^="@"]');
        if(type!=="expense"){ if(asel.value.startsWith("~")){ asel.value=(mainAcc()||{}).id||""; } asel.querySelectorAll('option[value^="~"]').forEach(o=>o.remove()); }
        else if(!asel.querySelector('option[value^="~"]')){ for(const [v,l] of legacyLoanOpt(t.fromLoan)){ const o=document.createElement("option"); o.value=v; o.textContent=l; asel.appendChild(o); } }
        if(type!=="expense"){ if(asel.value.startsWith("@")){ asel.value=(mainAcc()||{}).id||""; asel.dispatchEvent(new Event("change",{bubbles:true})); } asel.querySelectorAll('option[value^="@"]').forEach(o=>o.remove()); }
        else if(!has){ for(const p of payers()){ const o=document.createElement("option"); o.value="@"+p.id; o.textContent=p.name; asel.appendChild(o); } }
        const py=type==="expense" && asel.value.startsWith("@") ? PAYERS_ALL().find(p=>"@"+p.id===asel.value) : null;
        const fl=type==="expense" && asel.value.startsWith("~");
        $("#spNote").hidden=!py && !fl; if(py){ $("#spNote").textContent=payerNote(py); $("#w_budgetId").hidden=true; }
        if(fl) $("#spNote").textContent="Paid straight from the loan: it counts as spending, but no bank balance changes. Record the borrowing on the loan as usual, so it shows what you owe."; }
      const sel=$("#f_categoryId"), kind=type==="income"?"income":"expense", dflt=undefined, cur=first?(CUR||dflt):(catOpts(kind).some(([v])=>v===sel.value)?sel.value:dflt); first=false;
      sel.innerHTML = [["","Choose a category"],...catOpts(kind)].map(([v,l])=>`<option value="${esc(v)}" ${v===cur?"selected":""}>${esc(l)}</option>`).join("");
    };
    s.querySelectorAll("#tseg button").forEach(b=>b.onclick=()=>{ type=b.dataset.k; sync(); });
    $("#f_date").addEventListener("change", sync);
    $("#f_accountId").addEventListener("change", sync); $("#f_amount").addEventListener("input", ()=>FU&&FU.refresh());
    sync();
    s.querySelector("#cx").onclick=closeModal;
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>askConfirm("Delete this transaction?","Delete",()=>del("txns",t.id));
    s.querySelector("#spl").onclick=()=>{ const amount=parseFloat(val("amount")); if(!(amount>0)){ toast("Enter the full amount first."); return; }
      const acc=val("accountId"), o={...t, type:"expense", amount, date:val("date")||today(), note:val("note"), categoryId:val("categoryId")||t.categoryId};
      if(acc.startsWith("@")){ o.paidBy=acc.slice(1); delete o.accountId; delete o.fromLoan; } else if(acc.startsWith("~")){ o.fromLoan=acc.slice(1); delete o.accountId; delete o.paidBy; } else { o.accountId=acc; delete o.paidBy; delete o.fromLoan; }
      const tg=getTags(); if(tg.length) o.tags=tg; else delete o.tags; closeModal(); splitSheet(o); };
    s.querySelector("#sv").onclick=()=>{
      const amount=parseFloat(val("amount")), tyNow=$("#f_type")?val("type"):type;
      /* expenses and income may be negative (a refund, reversal or cashback booked against its category); transfers and investments may not */
      if(isNaN(amount) || amount===0){ toast("Enter an amount."); return; }
      if(amount<0 && !["expense","income"].includes(tyNow)){ toast("Only expenses and income can be negative. For money coming back, use a transfer the other way."); return; }
      if(!live("accounts").length){ toast("Add an account first under Setup."); return; }
      if(type==="transfer" && val("accountId")===val("toAccountId")){ toast("Pick two different accounts for a transfer."); return; }
      if((type==="expense"||type==="income") && !val("categoryId")){ toast("Pick a category."); return; }
      const o={...t, id:t.id||uid(), type, amount, date:val("date")||today(), accountId:val("accountId"), note:val("note")};
      const payer = type==="expense" && String(o.accountId||"").startsWith("@") ? o.accountId.slice(1) : null, pobj = payer && PAYERS_ALL().find(p=>p.id===payer);
      if((type==="expense"||type==="transfer") && val("budgetId")) o.budgetId=val("budgetId"); else delete o.budgetId;
      const tg=getTags(); if(pobj && pobj.tag && !tg.some(g=>g.toLowerCase()===pobj.tag.toLowerCase())) tg.push(allTags().find(g=>g.toLowerCase()===pobj.tag.toLowerCase())||pobj.tag); if(tg.length) o.tags=tg; else delete o.tags;
      if(payer){ o.paidBy=payer; delete o.accountId; delete o.budgetId; } else delete o.paidBy;
      if(type==="expense" && String(o.accountId||"").startsWith("~")){ o.fromLoan=o.accountId.slice(1); delete o.accountId; } else delete o.fromLoan;
      if(type==="expense" && !o.fromLoan && !o.paidBy){ let fs; try{ fs=FU.get(); }catch(e){ toast(e.message); return; } if(fs.length) o.funds=fs; else delete o.funds; } else delete o.funds;
      delete o.fundLoan; delete o.fundAmt;
      if(type==="expense"){ if($("#f_pot").checked) o.pot="reserve"; else if(o.pot==="reserve") delete o.pot; }
      if(type!=="investment") delete o.charges;
      if(type==="transfer"){ o.toAccountId=val("toAccountId"); delete o.categoryId; delete o.instrument; }
      else if(type==="investment"){ if(!val("invType")){ toast("Pick the investment type."); return; } o.instrument=val("instrument")||"Investment"; o.invType=val("invType"); { const u=parseFloat(val("units")); if(u>0) o.units=u; else delete o.units; }
        { const c=parseFloat(val("charges")); if(c>=amount){ toast("Charges must be less than the amount."); return; } if(c>0) o.charges=Math.round(c*100)/100; else delete o.charges; }
        delete o.categoryId; delete o.toAccountId; }
      else { o.categoryId=val("categoryId"); delete o.toAccountId; delete o.instrument; }
      if($("#f_hist").checked) o.hist=true; else delete o.hist;
      closeModal(); upsert("txns",o); toast(isNew?"Added":"Saved");
    };
  });
}
function recForm(r={}){
  const isNew=!r.id; r={type:"expense", freq:"monthly", start:ymOf(today()), ...r};
  const body = `
    <div class="seg" role="group" aria-label="Type" id="rseg">${["expense","income","investment","transfer"].map(k=>`<button type="button" data-k="${k}" aria-pressed="${r.type===k}">${TYPE_LBL[k]}</button>`).join("")}</div><div style="height:12px"></div>
    ${field(["name","Name","text",{value:r.name,ph:"e.g. Netflix, Car insurance, Salary"}])}
    ${field(["amount","Amount (₹)","number",{value:r.amount,step:"0.01",ph:"0.00"}])}
    ${field(["freq","How often","select",{value:r.freq,options:Object.entries(FREQ_LBL)}])}
    <div class="grid2">${field(["start","Starts (month)","month",{value:r.start}])}${field(["end","Ends (month)","month",{value:r.end||"",hint:"Leave empty if it doesn't end"}])}</div>
    <div class="grid2">${field(["day","Due day","number",{value:r.day||"",ph:"1–31"}])}${field(["accountId","Paid from / into","select",{value:r.accountId||"",options:accOpts("Not set")}])}</div>
    ${field(["toAccountId","To account","select",{value:r.toAccountId||"",options:accOpts("Choose", r.toAccountId)}])}
    ${field(["categoryId","Category","select",{value:r.categoryId,options:catOpts("expense")}])}
    ${field(["instrument","Investment","text",{value:r.instrument,ph:"e.g. ICICI small cap SIP",list:"instl"}])}${field(["invType","Investment type","select",{value:r.invType||"",options:[["","Choose a type"],...INV_TYPES.map(x=>[x,x])]}])}${field(["charges","Charges each time (₹, optional)","number",{value:r.charges??"",step:"0.01",ph:"0.00",hint:"Stamp duty, platform or broker charges taken from each payment. Leave empty for mutual funds and the 0.005% stamp duty is used."}])}<datalist id="instl">${instruments().map(i=>`<option value="${esc(i)}">`).join("")}</datalist>
    <label class="opt" id="w_auto"><input type="checkbox" id="f_auto" ${r.auto?"checked":""}><div><b>Auto-debit / auto-renews</b><span>Paid for you (bank auto-debit, standing instruction or auto-renewal), so it isn't on Pay by Tuesday. It's still in the readiness check, so the money is there. Items charged to a card count as auto too: you pay the card bill instead.</span></div></label>
    <label class="opt" id="w_shift"><input type="checkbox" id="f_shift" ${r.shift==="trading"?"checked":""}><div><b>Move to the next trading day</b><span>If the due day falls on a Saturday, Sunday or stock-market holiday, plan it for the next trading day (e.g. investments on the 3rd).</span></div></label>
    <div class="grid2" id="w_rmd">${field(["remind","Remind me (days before)","number",{value:r.remind??"",ph:"e.g. 30"}])}${field(["provider","Provider (optional)","text",{value:r.provider||"",ph:"e.g. HDFC Life, ACT"}])}</div>
    <label class="opt" id="w_budget"><input type="checkbox" id="f_budget" ${r.budget?"checked":""}><div><b>This is a budget (placeholder)</b><span>Spends you tag to it each month reduce what's left; the forecast counts only the remainder. Unused amount is dropped at month end. For cash, tag your ATM withdrawals.</span></div></label>
    <div class="btns"><button class="btn pri" id="sv" type="button">${isNew?"Add":"Save"}</button>${isNew?"":'<button class="btn danger" id="dl" type="button">Delete</button>'}<button class="btn" id="cx" type="button">Cancel</button></div>`;
  openSheet(isNew?"Add planned item":"Edit planned item", body, s=>{
    let type=r.type, first=true; const CUR=r.categoryId;
    const sync=()=>{
      s.querySelectorAll("#rseg button").forEach(b=>b.setAttribute("aria-pressed", b.dataset.k===type));
      $("#w_categoryId").hidden = type==="investment"||type==="transfer"; $("#w_toAccountId").hidden = type!=="transfer"; $("#w_accountId label").textContent = type==="transfer" ? "From account" : "Paid from / into"; $("#w_instrument").hidden = type!=="investment"; $("#w_invType").hidden = type!=="investment"; $("#w_charges").hidden = type!=="investment"; $("#w_budget").hidden = type!=="expense";
      $("#w_end").hidden = val("freq")==="once";
      $("#w_start label").textContent = val("freq")==="once" ? "Month" : "Starts (month)";
      const sel=$("#f_categoryId"), kind=type==="income"?"income":"expense", dflt=(live("categories").find(c=>c.kind===kind&&!c.parentId&&/^Other/.test(c.name))||{}).id, cur=first?(CUR||dflt):(catOpts(kind).some(([v])=>v===sel.value)?sel.value:dflt); first=false;
      sel.innerHTML = [["","Choose a category"],...catOpts(kind)].map(([v,l])=>`<option value="${esc(v)}" ${v===cur?"selected":""}>${esc(l)}</option>`).join("");
    };
    s.querySelectorAll("#rseg button").forEach(b=>b.onclick=()=>{ type=b.dataset.k; sync(); });
    $("#f_freq").onchange=sync; sync();
    s.querySelector("#cx").onclick=closeModal;
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>askConfirm(`Delete "${r.name}"? Past transactions stay.`,"Delete",()=>del("recurring",r.id));
    s.querySelector("#sv").onclick=()=>{
      const amount=parseFloat(val("amount")), name=val("name"), start=val("start"), end=val("freq")==="once"?"":val("end");
      if(!name){ toast("Give it a name."); return; }
      if(!(amount>0)){ toast("Enter an amount above zero."); return; }
      if(!/^\d{4}-\d{2}$/.test(start)){ toast("Pick the start month."); return; }
      if(end && end<start){ toast("The end month is before the start month."); return; }
      if(type==="transfer" && (!val("accountId") || !val("toAccountId") || val("accountId")===val("toAccountId"))){ toast("Pick two different accounts for the transfer."); return; }
      if(type!=="investment" && type!=="transfer" && !val("categoryId")){ toast("Pick a category."); return; }
      const day=parseInt(val("day"),10);
      const o={...r, id:r.id||uid(), type, name, amount, freq:val("freq"), start, end:end||null, day:(day>=1&&day<=31)?day:null, accountId:val("accountId")||null};
      if(type==="expense" && $("#f_budget").checked) o.budget=true; else delete o.budget;
      if($("#f_auto").checked) o.auto=true; else delete o.auto;
      if($("#f_shift").checked) o.shift="trading"; else delete o.shift;
      { const rm=parseInt(val("remind"),10); if(rm>0) o.remind=rm; else delete o.remind; } if(val("provider")) o.provider=val("provider"); else delete o.provider;
      if(type==="investment"){ if(!val("invType")){ toast("Pick the investment type."); return; } o.instrument=val("instrument")||name; o.invType=val("invType"); delete o.categoryId;
        if(val("charges")===""){ delete o.charges; } else { const c=parseFloat(val("charges")); if(!(c>=0) || c>=amount){ toast("Charges must be less than the amount."); return; } o.charges=Math.round(c*100)/100; } } else if(type==="transfer"){ o.toAccountId=val("toAccountId"); delete o.categoryId; delete o.instrument; delete o.budget; } else { o.categoryId=val("categoryId"); delete o.instrument; }
      if(type!=="transfer") delete o.toAccountId;
      if(type!=="investment") delete o.charges;
      closeModal(); upsert("recurring",o); toast(isNew?"Added to plan":"Saved");
    };
  });
}
function radios(name, legend, opts, cur){
  return `<fieldset class="fs"><legend>${esc(legend)}</legend>${opts.map(([v,t,s])=>`<label class="opt"><input type="radio" name="${name}" value="${v}" ${v===cur?"checked":""}><div><b>${esc(t)}</b>${s?`<span>${esc(s)}</span>`:""}</div></label>`).join("")}</fieldset>`;
}
const radioVal = n => { const e=document.querySelector(`input[name="${n}"]:checked`); return e ? e.value : ""; };
const btnRow = (isNew, addLbl) => `<div class="btns"><button class="btn pri" id="sv" type="button">${isNew?addLbl:"Save"}</button><button class="btn" id="cx" type="button">Cancel</button>${isNew?"":'<button class="btn danger" id="dl" type="button">Delete</button>'}</div>`;
const MODE_OPTS = [["tenure","Keep EMI, change tenure","Same monthly EMI; the loan ends earlier or later"],["emi","Keep tenure, change EMI","Same end date; the monthly EMI goes down or up"]];

function loanForm(l={}){
  const isNew=!l.id; let kind=isNew ? (l.kind||"emi") : kindOf(l);
  const b={start:ymOf(today()), ...(kind==="hybrid" ? (l.bank||{}) : l)};
  const body = `
    ${isNew?`<div class="seg" role="group" aria-label="Loan type" id="kseg">${Object.entries(KIND_LBL).map(([k,t])=>`<button type="button" data-k="${k}" aria-pressed="${kind===k}">${t}</button>`).join("")}</div><p class="note" id="kdesc"></p>`:`<p class="note">${KIND_LBL[kind]}</p>`}
    ${field(["name","Loan name","text",{value:l.name,ph:"e.g. Home loan, Loan from Ravi"}])}
    ${field(["lender","Lender","text",{value:l.lender,ph:"Bank or person"}])}
    <div id="g_first" hidden>
      <p class="sect" id="firstHd">First borrowing</p>
      <div class="grid2">${field(["ownAmt","Amount (₹)","number",{ph:"0 to add later"}])}${field(["ownDate","Date","date",{value:today()}])}</div>
      ${field(["ownAcc","Received into","select",{options:accOpts("Not linked to an account")}])}
    </div>
    <div id="g_bank">
      <p class="sect" id="bankHd" hidden>Bank loan part (taken by them, you pay the EMI)</p>
      ${field(["bankName","Their bank","text",{value:b.lender,ph:"e.g. SBI"}])}
      <div class="grid2">${field(["principal","Loan amount (₹)","number",{value:b.principal}])}${field(["rate","Interest % per year","number",{value:b.rate??"",step:"0.01",hint:isNew?"Starting rate. Add floating-rate changes later on the loan page.":"Starting rate. Rate changes are on the loan page."}])}</div>
      <div class="grid2">${field(["tenure","Tenure (months)","number",{value:b.tenure||""}])}${field(["start","First EMI month","month",{value:b.start}])}</div>
      <div class="grid2">${field(["emi","EMI (₹)","number",{value:b.emi||"",hint:"Leave empty to calculate it"}])}${field(["day","EMI day","number",{value:b.day||"",ph:"1–31"}])}</div>
      ${field(["accountId","EMI paid from","select",{value:b.accountId||"",options:accOpts("Not set")}])}
      <div id="g_cemi" hidden>
        ${field(["cardId","Card","select",{value:l.accountId||"",options:[["","Choose the card"],...live("accounts").filter(a=>a.type==="card" && (!a.hidden || a.id===l.accountId)).map(a=>[a.id,a.name])]}])}
        ${field(["categoryId","What you bought (category)","select",{value:l.categoryId||"",options:[["","Choose a category"],...catOpts("expense")]}])}
        <div class="grid2">${field(["fee","Processing fee (₹)","number",{value:l.fee??"",step:"0.01",ph:"0 if none",hint:"GST is added on top"}])}${field(["gst","GST %","number",{value:l.gstRate??18,step:"0.01",hint:"On interest and fee"}])}</div>
        <p class="note" style="margin-top:-4px">EMIs on statements before today are treated as already in your card's balance, so only upcoming ones are added.</p>
      </div>
      <div class="note" id="emiCalc"></div>
    </div>
    ${btnRow(isNew,"Add loan")}`;
  openSheet(isNew?"Add loan":"Edit loan", body, s=>{
    const DESC={emi:"An EMI loan from a bank, e.g. a home loan. Record floating-rate changes and part payments on its page.",
      family:"Interest-free money from family or friends. Borrow and repay any number of times, on any date.",
      hybrid:"Money from a relative where part is their own (interest-free) and part comes from a bank loan they took, whose EMI you pay.",
      cardemi:"A purchase converted to EMI on a credit card. Each statement, the EMI (purchase) and interest + GST are added to the card automatically; the processing fee + GST comes with the first one."};
    const sync=()=>{
      s.querySelectorAll("#kseg button").forEach(x=>x.setAttribute("aria-pressed", x.dataset.k===kind));
      if($("#kdesc")) $("#kdesc").textContent=DESC[kind];
      $("#g_bank").hidden = kind==="family";
      $("#g_first").hidden = !isNew || isEmiLike(kind);
      const ce=kind==="cardemi"; $("#g_cemi").hidden=!ce; $("#w_lender").hidden=ce; $("#w_day").hidden=ce; $("#w_accountId").hidden=ce;
      $("#w_principal label").textContent = ce ? "Amount converted (₹)" : "Loan amount (₹)";
      $("#w_start label").textContent = ce ? "First EMI statement" : "First EMI month";
      { const h=$("#w_rate .hint"); if(h) h.hidden=ce; }
      $("#w_emi .hint").textContent = ce ? "From the bank's SMS, excluding GST. Empty to calculate." : "Leave empty to calculate it";
      $("#bankHd").hidden = kind!=="hybrid"; $("#w_bankName").hidden = kind!=="hybrid";
      $("#firstHd").textContent = kind==="hybrid" ? "Their own money (interest-free)" : "First borrowing";
      $("#w_ownAcc label").textContent = kind==="hybrid" ? "Both parts received into" : "Received into";
      $("#w_lender label").textContent = kind==="emi" ? "Bank" : "Person";
      $("#w_tenure .hint")?.remove(); if(kind==="emi") $("#w_tenure").insertAdjacentHTML("beforeend",'<div class="hint">Empty if there\'s no fixed schedule</div>');
    };
    s.querySelectorAll("#kseg button").forEach(x=>x.onclick=()=>{ kind=x.dataset.k; sync(); });
    const calc=()=>{ const t={principal:val("principal"),rate:val("rate"),tenure:val("tenure"),emi:val("emi"),start:val("start")};
      const e=emiOf(t); $("#emiCalc").textContent = e ? `EMI ${money(e)} · total interest ${money(e*(+t.tenure||0)-(+t.principal||0))}${t.start&&t.tenure?` · last EMI ${mLabel(loanEnd(t))}`:""}` : ""; };
    s.querySelectorAll("input").forEach(i=>i.addEventListener("input",calc)); calc(); sync();
    s.querySelector("#cx").onclick=closeModal;
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>deleteLoan(l);
    s.querySelector("#sv").onclick=()=>{
      const name=val("name"), lender=val("lender");
      if(!name){ toast("Give the loan a name."); return; }
      if(!isEmiLike(kind) && !lender){ toast("Who are you borrowing from?"); return; }
      if(kind==="cardemi"){ if(!val("cardId")){ toast("Choose the card."); return; } if(!(parseInt(val("tenure"),10)>0)){ toast("Enter the tenure in months."); return; } if(!val("categoryId")){ toast("Choose what you bought (category)."); return; } }
      const o={...l, id:l.id||uid(), kind, name, lender};
      if(kind!=="family"){
        const principal=parseFloat(val("principal")), tenure=parseInt(val("tenure"),10), day=parseInt(val("day"),10), start=val("start");
        if(!(principal>0)){ toast(kind==="hybrid"?"Enter the bank loan amount.":"Enter the loan amount."); return; }
        if(kind==="hybrid" && !(tenure>0)){ toast("Enter the bank loan's tenure in months."); return; }
        if(tenure>0 && !/^\d{4}-\d{2}$/.test(start)){ toast("Pick the first EMI month."); return; }
        const bf={principal, rate:parseFloat(val("rate"))||0, tenure:tenure>0?tenure:null, start:start||ymOf(today()), emi:parseFloat(val("emi"))||null, day:(day>=1&&day<=31)?day:null, accountId:val("accountId")||null};
        if(kind==="cardemi"){ const card=byId("accounts",val("cardId")); Object.assign(o, bf, {postFrom:l.postFrom||today(), accountId:card.id, day:+card.stmtDay||null, lender:card.name, categoryId:val("categoryId"), fee:parseFloat(val("fee"))||0, gstRate:isNaN(parseFloat(val("gst")))?18:parseFloat(val("gst"))}); }
        else if(kind==="emi") Object.assign(o, bf); else o.bank={...(l.bank||{}), ...bf, lender:val("bankName")};
      }
      if(!isEmiLike(kind)) o.plans=l.plans||[];
      put("loans",o);
      if(isNew && !isEmiLike(kind)){
        const amt=parseFloat(val("ownAmt"))||0, date=val("ownDate")||today(), acc=val("ownAcc")||null;
        if(amt>0) put("txns",{id:uid(), type:"loan", loanId:o.id, act:"borrow", part:"own", amount:amt, date, accountId:acc, note:""});
        if(kind==="hybrid") put("txns",{id:uid(), type:"loan", loanId:o.id, act:"borrow", part:"bank", amount:o.bank.principal, date, accountId:acc, note:"Bank-loan money"});
      }
      closeModal(); S.loanId=o.id; changed(); go("loan"); toast(isNew?"Loan added":"Saved");
    };
  });
}
/* close a loan that's been settled (foreclosed, repaid early, or ended outside the planner): it stops appearing anywhere, history kept */
function closeLoanSheet(l){
  const x=loanSum(l), now=ymOf(today());
  openSheet(`Close ${l.name}`, `<p>The loan stops showing in Plan, Home, Insights and the forecast. Its history stays, and you can reopen it any time. It moves to "Closed loans" under Loans.</p>
    ${x.out>0.5?`<p class="note">The planner still shows ${money(x.out)} outstanding. If you paid it off, record that payment first (Part payment or Repaid) so your account balance is right.</p>`:""}
    ${field(["ym","Closed in (month)","month",{value:now,hint:"EMIs after this month are removed."}])}
    <div class="btns"><button class="btn pri" id="sv" type="button">Mark as closed</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#sv").onclick=()=>{ const ym=val("ym"); if(!/^\d{4}-\d{2}$/.test(ym)){ toast("Pick the month."); return; } closeModal(); upsert("loans",{...l, closedOn:ym}); toast(`${l.name} closed`); };
  });
}
function deleteLoan(l){
  askConfirm(`Delete "${l.name}" and all its entries?`,"Delete",()=>{
    for(const t of loanTx(l.id)){ t.deleted=true; stamp(t); }
    const x=byId("loans",l.id); x.deleted=true; stamp(x); changed(); go("plan");
  });
}
/* borrowing, repayment (own-money part) or part payment (EMI part) */
function entryForm(l, act, t={}, preset={}){
  const isNew=!t.id, kind=kindOf(l); t={date:today(), part:"own", ...preset, ...t}; act=t.act||act;
  const hasSched=!!schedule(l);
  const TTL={borrow:isNew?"Add borrowing":"Edit borrowing", repay:isNew?"Add repayment":"Edit repayment", prepay:isNew?"Add part payment":"Edit part payment"};
  const body = `
    ${act==="borrow"&&kind==="hybrid"?`<div class="seg" role="group" aria-label="Which part" id="pseg">${[["own","Their own money"],["bank","Bank-loan money"]].map(([k,x])=>`<button type="button" data-k="${k}" aria-pressed="${t.part===k}">${x}</button>`).join("")}</div><p class="note" id="pdesc"></p>`:""}
    ${act==="repay"?`<p class="note">You owe ${esc(l.lender||l.name)} ${money(ownTotals(l).out)}${kind==="hybrid"?" on the interest-free part":""}.</p>`:""}
    ${act==="prepay"?`<p class="note">Outstanding on the ${kind==="hybrid"?"bank part":"loan"}: ${money(loanSum(l).bank)}.</p>`:""}
    <div class="grid2">${field(["amount","Amount (₹)","number",{value:t.amount,step:"0.01",ph:"0.00"}])}${field(["date","Date","date",{value:t.date}])}</div>
    ${field(["accountId",act==="borrow"?"Received into":"Paid from","select",{value:t.accountId||"",options:accOpts("Not linked to an account"),hint:"A linked account's balance goes up or down with this entry."}])}
    <label class="opt" style="margin-bottom:12px"><input type="checkbox" id="f_hist" ${t.hist?"checked":""}><div><b>Already in my balances</b><span>The linked account's balance already includes this money, so it isn't added or taken off again. The loan still counts it.</span></div></label>
    ${act==="prepay"&&hasSched?radios("mode","After this payment",[["tenure","Reduce tenure","Keep the EMI; the loan ends sooner"],["emi","Reduce EMI","Keep the end date; the EMI goes down"]],t.mode):""}
    ${field(["note","Note","text",{value:t.note,ph:"Optional"}])}
    ${btnRow(isNew,"Add")}`;
  openSheet(TTL[act], body, s=>{
    let part=t.part;
    const sync=()=>{ s.querySelectorAll("#pseg button").forEach(x=>x.setAttribute("aria-pressed", x.dataset.k===part));
      if($("#pdesc")) $("#pdesc").textContent = part==="bank" ? "Records money from their bank loan reaching you. The bank part's balance follows its EMI schedule." : "Interest-free money from their own savings. Adds to what you owe them."; };
    s.querySelectorAll("#pseg button").forEach(x=>x.onclick=()=>{ part=x.dataset.k; sync(); }); sync();
    s.querySelector("#cx").onclick=closeModal;
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>askConfirm("Delete this entry?","Delete",()=>del("txns",t.id));
    s.querySelector("#sv").onclick=()=>{
      const amount=parseFloat(val("amount")), date=val("date")||today(), mode=radioVal("mode");
      if(!(amount>0)){ toast("Enter an amount above zero."); return; }
      if(act==="repay"){ const owe=ownTotals(l).out + (isNew?0:+t.amount); if(amount>owe+1){ toast(`That's more than you owe (${money(owe)}).`); return; } }
      let before=null;
      if(act==="prepay"){
        if(hasSched && !mode){ toast("Choose reduce tenure or reduce EMI."); return; }
        before=hasSched ? schedule(l, t.id||"_new") : null;
        const ym=ymOf(date), row=before && before.rows.find(r=>r.ym>=ym), owe=before ? (ym<before.start?before.principal:(row?row.open:0)) : loanSum(l).bank + (isNew?0:+t.amount);
        if(amount>owe+1){ toast(`That's more than the outstanding ${money(owe)}.`); return; }
      }
      const o={...t, id:t.id||uid(), type:"loan", loanId:l.id, act, amount, date, accountId:val("accountId")||null, note:val("note"),
        part: act==="prepay" ? "bank" : (act==="borrow" && kind==="hybrid" ? part : "own")};
      if($("#f_hist").checked) o.hist=true; else delete o.hist;
      if(act==="prepay" && hasSched) o.mode=mode; else delete o.mode;
      closeModal(); upsert("txns",o);
      if(before){
        const after=schedule(byId("loans",l.id)), ym=ymOf(date), b1=before.rows.find(r=>r.ym>=ym), a1=after ? after.rows.find(r=>r.ym>=ym) : null;
        const saved=before.totalInt-(after?after.totalInt:0);
        toast(!after || !after.rows.length || !a1 ? `Loan closed. Interest saved ${money(saved)}.` :
          mode==="emi" ? `EMI from ${mShort(a1.ym)}: ${money(a1.emi)} (was ${money(b1?b1.emi:0)}) · interest saved ${money(saved)}` :
          `Now ends ${mShort(after.end)} instead of ${mShort(before.end)} · interest saved ${money(saved)}`);
      } else toast(isNew?"Added":"Saved");
    };
  });
}
/* what a loan's money was spent on: expenses marked "Money from a loan" (or paid straight from it) */
function loanSpends(l){
  const sp=live("txns").map(t=>[t,fundsOf(t).filter(f=>f.loan===l.id).reduce((a,f)=>a?{...a,amt:a.amt+f.amt}:f,null)]).filter(([,f])=>f).sort((a,b)=>b[0].date.localeCompare(a[0].date)); if(!sp.length) return "";
  const x=loanSum(l), b=bankOf(l), borrowed=(x.own.borrowed||0)+(b&&kindOf(l)==="hybrid"?(+b.principal||0):isEmiLike(kindOf(l))?(+l.principal||0):0), used=sp.reduce((a,[,f])=>a+f.amt,0);
  const pi=new Map(live("propItems").filter(i=>i.txnId).map(i=>[i.txnId,i]));
  return `<h2>Where the money went<span class="sp"></span><span class="chip mute">${sp.length}</span></h2>
  <div class="list">${sp.map(([t,f])=>{ const it=pi.get(t.id), pr=it&&byId("props",it.prop);
    return `<div class="row tap" data-tx="${esc(t.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(pr?`${pr.name} · ${pcOf(it.cat).name}`:(t.note||catName(t.categoryId)))}</div><div class="s">${fmtD(t.date)} · ${esc(t.fromLoan?"paid straight from the loan":accName(t.accountId))}${f.amt<+t.amount-0.5?` · ${money(f.amt)} of ${money(t.amount)}`:""}</div></div><div class="amt">${money(f.amt)}</div></div>`; }).join("")}</div>
  <p class="note">${borrowed>0?`${money(used)} of the ${money(borrowed)} borrowed is accounted for${used>=borrowed-0.5?" (all of it)":`; ${money(borrowed-used)} isn't linked to a spend yet`}.`:`${money(used)} spent with this loan's money.`}</p>`;
}
/* floating-rate change on the EMI part */
function rateForm(l, rc={}){
  const isNew=!rc.id, b=bankOf(l), x=loanSum(l);
  const body = `
    <p class="note">Rate now ${rateTxt(x.rateNow)}% · EMI ${money(x.emiNow)} · ends ${x.end?mShort(x.end):"—"}</p>
    <div class="grid2">${field(["ym","From EMI month","month",{value:rc.ym||ymOf(today())}])}${field(["rate","New rate % per year","number",{value:rc.rate??"",step:"0.01"}])}</div>
    ${radios("mode","What did the bank change?",MODE_OPTS,rc.mode)}
    ${btnRow(isNew,"Add rate change")}`;
  openSheet(isNew?"Rate change":"Edit rate change", body, s=>{
    const save=list=>{ const o={...l}; if(kindOf(l)!=="hybrid") o.rates=list; else o.bank={...l.bank, rates:list}; return o; };
    s.querySelector("#cx").onclick=closeModal;
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>askConfirm("Delete this rate change?","Delete",()=>upsert("loans",save((b.rates||[]).filter(r=>r.id!==rc.id))));
    s.querySelector("#sv").onclick=()=>{
      const ym=val("ym"), rate=parseFloat(val("rate")), mode=radioVal("mode");
      if(!/^\d{4}-\d{2}$/.test(ym)){ toast("Pick the month the new rate applies from."); return; }
      if(b.start && ym<b.start){ toast(`The first EMI is in ${mLabel(b.start)}. Pick that month or later.`); return; }
      if(!(rate>=0) || val("rate")===""){ toast("Enter the new rate."); return; }
      if(!mode){ toast("Choose whether the EMI or the tenure changed."); return; }
      const before=schedule(l);
      const list=(b.rates||[]).filter(r=>r.id!==rc.id).concat({id:rc.id||uid(), ym, rate, mode}).sort((p,q)=>p.ym.localeCompare(q.ym));
      closeModal(); upsert("loans",save(list));
      const after=schedule(byId("loans",l.id)), b1=before&&before.rows.find(r=>r.ym>=ym), a1=after&&after.rows.find(r=>r.ym>=ym);
      if(a1) toast(mode==="emi" ? `EMI from ${mShort(a1.ym)}: ${money(a1.emi)} (was ${money(b1?b1.emi:0)})` : `Now ends ${mShort(after.end)} (was ${before&&before.end?mShort(before.end):"—"})`);
      else toast("Saved");
    };
  });
}
/* match the bank-loan part to the outstanding on a bank statement; later EMIs follow the bank's figure */
function syncMonth(l, date){ const b=bankOf(l), ym=ymOf(date), day=+b.day||1; return +date.slice(8) >= day ? addM(ym,1) : ym; }   /* the next EMI after that date */
function syncForm(l){
  const b=bankOf(l), x=loanSum(l), list=(b.syncs||[]).slice().sort((p,q)=>p.date.localeCompare(q.date));
  const ours=d=>bankOut(l, syncMonth(l,d));
  const body = `
    <p class="note">Enter the principal outstanding from the bank's statement or app on a date. The planner follows the bank's figure from the next EMI after that date${b.day?` (EMIs on day ${b.day})`:""}.</p>
    <div class="grid2">${field(["sdate","Outstanding as on","date",{value:today()}])}${field(["sbal","Outstanding (₹)","number",{step:"0.01",ph:String(Math.round(x.bank))}])}</div>
    <p class="note" id="sdiff" style="font-weight:700"></p>
    ${radios("smode","Keep in step with the bank by",[["tenure","Keeping the EMI","The EMI stays the same; the end date moves if needed"],["emi","Keeping the end date","The end date stays; the EMI changes a little"]],"tenure")}
    <div class="btns"><button class="btn pri" id="sv" type="button">Match</button><button class="btn" id="cx" type="button">Cancel</button></div>
    ${list.length?`<p class="sect">Earlier matches</p><div class="list">${list.map(m=>`<div class="row"><div class="main"><div class="t">${money(m.bal)} on ${fmtD(m.date)} ${m.date.slice(0,4)}</div><div class="s">from the ${mShort(m.ym)} EMI · ${m.mode==="emi"?"kept the end date":"kept the EMI"}${m.was!=null?` · planner had ${money(m.was)}`:""}</div></div><button class="btn sm danger" type="button" data-sdel="${esc(m.id)}">Remove</button></div>`).join("")}</div>`:""}`;
  openSheet(`Match ${l.name} to the bank`, body, s=>{
    const save=arr=>{ const o={...l}; if(kindOf(l)!=="hybrid") o.syncs=arr; else o.bank={...l.bank, syncs:arr}; return o; };
    const diff=()=>{ const d=val("sdate"), v=parseFloat(val("sbal")); if(!d) return; const w=ours(d); $("#sdiff").textContent = isNaN(v) ? `The planner has ${money(w)} outstanding then.` : Math.abs(v-w)<0.5 ? `✓ Already matches (${money(w)}).` : `The planner has ${money(w)}: the bank's figure is ${money(Math.abs(v-w))} ${v>w?"higher":"lower"}.`; };
    $("#f_sdate").oninput=diff; $("#f_sbal").oninput=diff; diff();
    s.querySelector("#cx").onclick=closeModal;
    s.querySelectorAll("[data-sdel]").forEach(bt=>bt.onclick=()=>askConfirm("Remove this match? The schedule goes back to the planner's own figures from that point.","Remove",()=>{ upsert("loans",save((b.syncs||[]).filter(m=>m.id!==bt.dataset.sdel))); toast("Removed"); }));
    s.querySelector("#sv").onclick=()=>{
      const d=val("sdate"), v=parseFloat(val("sbal")), mode=radioVal("smode")||"tenure";
      if(!d){ toast("Pick the statement date."); return; } if(!(v>=0) || val("sbal")===""){ toast("Enter the outstanding amount."); return; }
      const ym=syncMonth(l,d); if(b.start && ym<b.start){ toast(`That's before the first EMI (${mLabel(b.start)}). Edit the loan instead.`); return; }
      const was=ours(d), before=schedule(l);
      const arr=(b.syncs||[]).filter(m=>m.ym!==ym).concat({id:uid(), date:d, ym, bal:Math.round(v*100)/100, mode, was:Math.round(was*100)/100}).sort((p,q)=>p.ym.localeCompare(q.ym));
      closeModal(); upsert("loans",save(arr));
      const after=schedule(byId("loans",l.id)), a1=after&&after.rows.find(r=>r.ym>=ym);
      toast(!after||!a1 ? "Matched. The loan is cleared." : mode==="emi" ? `Matched. EMI from ${mShort(ym)}: ${money(a1.emi)}` : `Matched. Ends ${mShort(after.end)}${before&&before.end!==after.end?` (was ${mShort(before.end)})`:""}`);
    };
  });
}
/* hybrid: you missed this month's bank EMI, the relative paid it */
function markMissed(key){
  const [head, ym]=key.split("|"), l=byId("loans", head.slice(2)); if(!l) return;
  const row=schedule(l)?.rows.find(r=>r.ym===ym); if(!row) return;
  const who=l.lender||"Your relative", b=bankOf(l);
  openSheet("Mark EMI as missed", `<p>${esc(who)} pays ${money(row.emi)} to the bank for the ${mLabel(ym)} EMI. You'll owe it to them, interest-free, until you pay it back.</p>
    <p class="note">The bank loan's schedule doesn't change. This doesn't touch your account balances.</p>
    <div class="btns"><button class="btn pri" id="sv" type="button">Mark missed</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#sv").onclick=()=>{ closeModal();
      upsert("txns",{id:uid(), type:"loan", loanId:l.id, act:"missed", part:"bank", ym, amount:Math.round(row.emi*100)/100, date:`${ym}-${pad(Math.min(b.day||1,28))}`, accountId:null, link:key, note:""});
      toast(`${mShort(ym)} EMI marked missed. You owe ${who} ${money(missedInfo(byId("loans",l.id)).owed)}.`); };
  });
}
function missedSheet(l, t){
  const m=missedInfo(l).list.find(x=>x.t.id===t.id);
  openSheet(`${mLabel(t.ym)} EMI · missed`, `<p>${esc(l.lender||"Your relative")} paid ${money(t.amount)} to the bank for this EMI.</p>
    <p class="note">${m && m.by ? `Paid back on ${dLabel(m.by.date)} ${m.by.date.slice(0,4)}. To undo the miss, delete that payment first.` : "Still owed. Undo if you actually paid this EMI yourself."}</p>
    <div class="btns">${m && m.by ? "" : '<button class="btn danger" id="dl" type="button">Undo missed</button>'}<button class="btn" id="cx" type="button">Close</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>{ closeModal(); del("txns",t.id); toast("Undone. The EMI shows as unpaid again."); };
  });
}
/* pay back specific missed EMIs to the relative */
function catchupForm(l, t={}){
  const isNew=!t.id, mi=missedInfo(l), mine=new Set(t.covers||[]);
  const opts=mi.list.filter(m=>!m.by || mine.has(m.t.id));
  if(!opts.length){ toast("No missed EMIs are owed."); return; }
  const pre=isNew ? new Set([opts[0].t.id]) : mine;
  const body = `
    <fieldset class="fs"><legend>Which missed EMIs are you paying back?</legend>${opts.map(m=>`<label class="opt"><input type="checkbox" name="cv" value="${esc(m.t.id)}" data-amt="${m.amount}" ${pre.has(m.t.id)?"checked":""}><div><b>${mLabel(m.ym)} EMI · ${money(m.amount)}</b></div></label>`).join("")}</fieldset>
    <p class="note" id="cvSum"></p>
    <div class="grid2">${field(["date","Date","date",{value:t.date||today()}])}${field(["accountId","Paid from","select",{value:t.accountId||bankOf(l).accountId||"",options:accOpts("Not linked to an account")}])}</div>
    ${field(["note","Note","text",{value:t.note,ph:"Optional"}])}
    ${btnRow(isNew,"Record payment")}`;
  openSheet(isNew?`Pay back ${l.lender||"relative"}`:"Edit payment", body, s=>{
    const picked=()=>[...s.querySelectorAll('input[name=cv]:checked')];
    const sum=()=>picked().reduce((a,e)=>a + +e.dataset.amt, 0);
    const upd=()=>{ $("#cvSum").textContent = picked().length ? `Total ${money(sum())} for ${picked().length} EMI${picked().length>1?"s":""}` : "Tick at least one EMI."; };
    s.querySelectorAll('input[name=cv]').forEach(e=>e.onchange=upd); upd();
    s.querySelector("#cx").onclick=closeModal;
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>askConfirm("Delete this payment? Those EMIs will show as owed again.","Delete",()=>del("txns",t.id));
    s.querySelector("#sv").onclick=()=>{
      if(!picked().length){ toast("Tick the missed EMIs you're paying back."); return; }
      const o={...t, id:t.id||uid(), type:"loan", loanId:l.id, act:"catchup", part:"missed", covers:picked().map(e=>e.value), amount:Math.round(sum()*100)/100, date:val("date")||today(), accountId:val("accountId")||null, note:val("note")};
      closeModal(); upsert("txns",o);
      const left=missedInfo(byId("loans",l.id)).owed;
      toast(left>0.5 ? `Recorded. ${money(left)} in missed EMIs still owed.` : "Recorded. All missed EMIs are paid back.");
    };
  });
}
/* planned interest-free repayment, one-time or monthly */
function planForm(l, p={}){
  const isNew=!p.id; p={freq:"once", start:ymOf(today()), ...p};
  const body = `
    <div class="seg" role="group" aria-label="How often" id="fseg">${[["once","One time"],["monthly","Monthly"]].map(([k,x])=>`<button type="button" data-k="${k}" aria-pressed="${p.freq===k}">${x}</button>`).join("")}</div><div style="height:12px"></div>
    ${field(["amount","Amount (₹)","number",{value:p.amount}])}
    <div class="grid2">${field(["start","Month","month",{value:p.start}])}${field(["end","Until (month)","month",{value:p.end||"",hint:"Empty = until it's repaid"}])}</div>
    ${field(["accountId","Paid from","select",{value:p.accountId||"",options:accOpts("Not set")}])}
    <p class="note">Planned repayments show in the forecast and stop once the interest-free amount is cleared.</p>
    ${btnRow(isNew,"Add to plan")}`;
  openSheet(isNew?"Plan a repayment":"Edit planned repayment", body, s=>{
    let freq=p.freq;
    const sync=()=>{ s.querySelectorAll("#fseg button").forEach(x=>x.setAttribute("aria-pressed", x.dataset.k===freq)); $("#w_end").hidden=freq!=="monthly"; $("#w_start label").textContent=freq==="monthly"?"From (month)":"Month"; };
    s.querySelectorAll("#fseg button").forEach(x=>x.onclick=()=>{ freq=x.dataset.k; sync(); }); sync();
    const save=list=>upsert("loans",{...l, plans:list});
    s.querySelector("#cx").onclick=closeModal;
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>askConfirm("Remove this planned repayment?","Remove",()=>save((l.plans||[]).filter(x=>x.id!==p.id)));
    s.querySelector("#sv").onclick=()=>{
      const amount=parseFloat(val("amount")), start=val("start"), end=freq==="monthly"?val("end"):"";
      if(!(amount>0)){ toast("Enter an amount above zero."); return; }
      if(!/^\d{4}-\d{2}$/.test(start)){ toast("Pick the month."); return; }
      if(end && end<start){ toast("The end month is before the start month."); return; }
      closeModal(); save((l.plans||[]).filter(x=>x.id!==p.id).concat({id:p.id||uid(), freq, amount, start, end:end||null, accountId:val("accountId")||null}));
      toast(isNew?"Added to plan":"Saved");
    };
  });
}
const accGroups = () => [...new Set(live("accounts").map(a=>a.group).filter(Boolean))].sort();
function accForm(a={}){
  const isNew=!a.id; a={type:"bank", opening:0, ...a};
  /* the reserve account: show what its balance is set aside for before the settings */
  let split=""; if(!isNew && a.reserve){ const st=reserveState(); if(st.a&&st.a.id===a.id){
    split=`<div class="card" style="padding:12px 14px;margin:0 0 14px;box-shadow:none;background:var(--bg)"><div class="kv" style="margin-top:0"><span>Balance today</span><b>${money(st.bal)}</b>
      <span>Big-bills reserve</span><b>${money(st.held)} <span class="mut" style="font-weight:400">of ${money(st.target)}</span></b>
      ${st.funds.filter(f=>f.have>0.5||f.need>0.5).map(f=>`<span>${esc(f.p.name)} fund</span><b>${money(f.have)}</b>`).join("")}
      <span class="tot">Emergency fund</span><b class="tot ${st.emergency<0?"neg":""}">${money(st.emergency)} <span class="mut" style="font-weight:400">of ${money(st.emTarget)}</span></b></div>
      <button class="lnk" type="button" id="toCash" style="margin-top:8px">See details in Plan › Cash flow ›</button></div>`; } }
  openSheet(isNew?"Add account":"Edit account", `${split}
    ${field(["name","Name","text",{value:a.name,ph:"e.g. HDFC savings, SBI Cashback card"}])}
    <div class="grid2">${field(["type","Type","select",{value:a.type,options:Object.entries(ACC_LBL)}])}${field(["group","Group","text",{value:a.group,ph:"e.g. Savings, Cards",list:"grpl"}])}</div><datalist id="grpl">${accGroups().map(g=>`<option value="${esc(g)}">`).join("")}</datalist>
    ${field(["opening","Balance when you start (₹)","number",{value:a.opening,step:"0.01",neg:1,hint:"For a credit card, enter what you owe as a negative number, e.g. -12000: type the amount, then tap − / +."}])}
    <label class="opt"><input type="checkbox" id="f_hidden" ${a.hidden?"checked":""}><div><b>Hide this account</b><span>Not shown on the Accounts tab or when adding transactions, and not counted in totals. Its history still shows in Transactions and reports.</span></div></label>
    <label class="opt"><input type="checkbox" id="f_noTotal" ${a.noTotal?"checked":""}><div><b>Leave out of totals</b><span>Still shown with its balance, but not added to bank totals, card dues, forecast or net worth.</span></div></label>
    <div id="g_bank">${field(["minBal","Keep at least (₹, optional)","number",{value:a.minBal??"",step:"100",hint:"The readiness check warns you before this account drops below it"}])}
      <label class="opt"><input type="checkbox" id="f_reserve" ${a.reserve?"checked":""}><div><b>Holds my big-bills reserve and emergency fund</b><span>The app splits this account's balance into the two pots. Only one account can hold them.</span></div></label>
      <div id="g_res" class="grid2">${field(["reserveStart","Already set aside for big bills (₹)","number",{value:a.reserveStart??"",step:"1"}])}${field(["emTarget","Emergency fund target (₹)","number",{value:a.emTarget??"",step:"1000",hint:"Leave empty to use the app's suggestion"}])}</div></div>
    <div id="g_card"><div class="grid2">${field(["stmtDay","Statement day","number",{value:a.stmtDay||"",ph:"1–31"}])}${field(["dueDay","Payment due day","number",{value:a.dueDay||"",ph:"1–31"}])}</div>
    ${field(["payFrom","Bill usually paid from","select",{value:a.payFrom||"",options:[["","Not set"],...live("accounts").filter(x=>x.type!=="card").map(x=>[x.id,x.name])]}])}
    <p class="note" style="margin-top:-4px">The bill is what you owed on the statement day, less payments since. A due day on or before the statement day falls in the next month.</p>
    <p class="sect">Limit, charges and rewards (optional)</p>
    <div class="grid2">${field(["limit","Credit limit (₹)","number",{value:a.limit??"",step:"1000"}])}${field(["apr","Interest (% a month)","number",{value:a.apr??"",step:"0.01",ph:"e.g. 3.75"}])}</div>
    <div class="grid2">${field(["fee","Annual fee (₹)","number",{value:a.fee??"",step:"1"}])}${field(["feeWaive","Fee waived if you spend (₹/year)","number",{value:a.feeWaive??"",step:"1000"}])}</div>
    ${field(["reward","Rewards worth (% of spend)","number",{value:a.reward??"",step:"0.01",ph:"e.g. 1.5",hint:"Points or cashback as a % of what you spend, e.g. 5% on Amazon, 1% elsewhere → use your overall rate."}])}
    ${field(["rewardNote","Reward notes","text",{value:a.rewardNote||"",ph:"e.g. 5% on Swiggy, lounge access 4/yr"}])}</div>
    <div class="btns"><button class="btn pri" id="sv" type="button">${isNew?"Add":"Save"}</button>${isNew?"":'<button class="btn danger" id="dl" type="button">Delete</button>'}<button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    const sync=()=>{ $("#g_card").hidden = val("type")!=="card"; $("#g_bank").hidden = val("type")==="card"; $("#g_res").hidden=!$("#f_reserve").checked; }; $("#f_type").onchange=sync; $("#f_reserve").onchange=sync; sync();
    const tc=s.querySelector("#toCash"); if(tc) tc.onclick=()=>{ closeModal(); S.planTab="cashflow"; go("plan"); };
    s.querySelector("#cx").onclick=closeModal;
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>askConfirm(`Delete "${a.name}"? Its transactions stay but will show no account.`,"Delete",()=>del("accounts",a.id));
    s.querySelector("#sv").onclick=()=>{ const name=val("name"); if(!name){ toast("Give the account a name."); return; }
      const sd=parseInt(val("stmtDay"),10), dd=parseInt(val("dueDay"),10), type=val("type");
      const o={...a, id:a.id||uid(), name, type, group:val("group")||null, opening:parseFloat(val("opening"))||0};
      if($("#f_hidden").checked) o.hidden=true; else delete o.hidden; if($("#f_noTotal").checked) o.noTotal=true; else delete o.noTotal;
      if(type==="card"){ o.stmtDay=(sd>=1&&sd<=31)?sd:null; o.dueDay=(dd>=1&&dd<=31)?dd:null; o.payFrom=val("payFrom")||null;
        for(const k of ["limit","apr","fee","feeWaive","reward"]){ const v=parseFloat(val(k)); if(v>0) o[k]=v; else delete o[k]; } if(val("rewardNote")) o.rewardNote=val("rewardNote"); else delete o.rewardNote; }
      else { for(const k of ["stmtDay","dueDay","payFrom","limit","apr","fee","feeWaive","reward","rewardNote"]) delete o[k];
        { const v=parseFloat(val("minBal")); if(v>0) o.minBal=v; else delete o.minBal; }
        if($("#f_reserve").checked){ o.reserve=true; for(const x of live("accounts")) if(x.reserve && x.id!==o.id) upsert("accounts",{...x, reserve:false});
          for(const k of ["reserveStart","emTarget"]){ const v=parseFloat(val(k)); if(v>0) o[k]=v; else delete o[k]; } } else { delete o.reserve; } }
      closeModal(); upsert("accounts",o); };
  });
}
function payerForm(p={}){
  const isNew=!p.id; p={own:true, tag:"", ...p}; const used=isNew?0:live("txns").filter(t=>t.paidBy===p.id).length;
  openSheet(isNew?"Add a way to pay":`Edit ${p.name}`, `
    ${field(["name","Name","text",{value:p.name,ph:"e.g. Cash, Pluxee, Spouse"}])}
    <fieldset class="fs"><legend>Whose money is it?</legend>
      <label class="opt"><input type="radio" name="own" value="1" ${p.own?"checked":""}><div><b>Mine</b><span>Cash, a meal card, a wallet you don't track. Counts as paid by you in tag views.</span></div></label>
      <label class="opt"><input type="radio" name="own" value="0" ${p.own?"":"checked"}><div><b>Someone else's</b><span>Like your spouse paying from her account. Shown separately as paid by them.</span></div></label></fieldset>
    ${field(["tag","Always tag with (optional)","text",{value:p.tag,list:"pytags",ph:"e.g. Home",hint:"Added automatically to every entry paid this way."}])}<datalist id="pytags">${allTags().map(g=>`<option value="${esc(g)}">`).join("")}</datalist>
    <div class="btns"><button class="btn pri" id="sv" type="button">${isNew?"Add":"Save"}</button>${isNew?"":'<button class="btn danger" id="dl" type="button">Remove</button>'}<button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>askConfirm(used?`Remove "${p.name}"? Its ${used} entr${used===1?"y stays":"ies stay"} and keep the name, but you can't pick it for new ones.`:`Remove "${p.name}"?`,"Remove",()=>del("payers",p.id));
    s.querySelector("#sv").onclick=()=>{ const name=val("name").trim(); if(!name){ toast("Give it a name."); return; }
      if(payers().some(x=>x.id!==p.id && x.name.toLowerCase()===name.toLowerCase())){ toast("There's already one with that name."); return; }
      const o={...p, id:p.id||uid(), name, own:(s.querySelector('input[name="own"]:checked')||{}).value!=="0", tag:val("tag").trim()};
      closeModal(); upsert("payers",o); toast(isNew?"Added":"Saved"); };
  });
}
function catForm(c={}){
  const isNew=!c.id; c={kind:"expense",...c};
  const hasSubs=!isNew && live("categories").some(x=>x.parentId===c.id);
  const parents=k=>[["","None (main category)"], ...catTree(k).map(({c:t})=>t).filter(t=>t.id!==c.id).map(t=>[t.id,t.name])];
  openSheet(isNew?"Add category":"Edit category", `
    ${field(["name","Name","text",{value:c.name}])}
    ${field(["kind","Used for","select",{value:c.kind,options:[["expense","Expenses"],["income","Income"]]}])}
    ${hasSubs?'<p class="note">This category has subcategories, so it stays a main category.</p>':field(["parentId","Subcategory of","select",{value:c.parentId||"",options:parents(c.kind)}])}
    ${field(["limit","Monthly limit (₹, optional)","number",{value:c.limit??"",step:"500",hint:"For main expense categories. Shown in Insights › Month and on Home when you get close. It doesn't change the forecast."}])}
    <div class="btns"><button class="btn pri" id="sv" type="button">${isNew?"Add":"Save"}</button>${isNew?"":'<button class="btn danger" id="dl" type="button">Delete</button>'}<button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    const lsync=()=>{ $("#w_limit").hidden = val("kind")!=="expense" || (!hasSubs && !!val("parentId")); }; lsync(); $("#f_kind").addEventListener("change",lsync); if(!hasSubs) $("#f_parentId").addEventListener("change",lsync);
    if(!hasSubs) $("#f_kind").onchange=()=>{ $("#f_parentId").innerHTML=parents(val("kind")).map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join(""); lsync(); };
    s.querySelector("#cx").onclick=closeModal;
    const d=s.querySelector("#dl"); if(d) d.onclick=()=>askConfirm(`Delete "${c.name}"?${hasSubs?" Its subcategories become main categories.":""} Transactions using it will show as uncategorised.`,"Delete",()=>{
      for(const x of live("categories")) if(x.parentId===c.id){ delete x.parentId; stamp(x); }
      del("categories",c.id); });
    s.querySelector("#sv").onclick=()=>{ const name=val("name"); if(!name){ toast("Give it a name."); return; }
      const o={...c,id:c.id||uid(),name,kind:val("kind")}; if(!hasSubs){ const p=val("parentId"); if(p) o.parentId=p; else delete o.parentId; }
      { const lm=parseFloat(val("limit")); if(lm>0 && o.kind==="expense" && !o.parentId) o.limit=lm; else delete o.limit; }
      closeModal(); upsert("categories",o); };
  });
}
/* undo or edit what was recorded when a planned item was marked paid / received / missed */
function undoMark(key){
  const t=paidMap().get(key); if(!t) return;
  const l=t.loanId ? byId("loans",t.loanId) : null;
  if(t.act==="missed" && l) return missedSheet(l,t);
  const ym=key.split("|")[1], what=t.type==="income"?"received":"paid";
  openSheet(`Marked ${what}`, `<p>${esc(t.note||"This item")} was marked ${what}: ${money(t.amount)} on ${fmtD(t.date)}${t.accountId?` from ${esc(accName(t.accountId))}`:""}.</p>
    <p class="note">Undo deletes the transaction that was recorded, puts the amount back in the account balance, and shows the item as due again for ${mLabel(ym)}.</p>
    <div class="btns"><button class="btn danger" id="un" type="button">Undo, mark as not ${what}</button><button class="btn" id="ed" type="button">Edit amount or date</button><button class="btn" id="cx" type="button">Close</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#un").onclick=()=>{ closeModal(); del("txns",t.id); toast(`Undone. It shows as due again.`); };
    s.querySelector("#ed").onclick=()=>{ closeModal(); if(t.type==="loan" && l) entryForm(l,t.act,{...t}); else txnForm({...t}); };
  });
}
function markPaid(it){
  const ym=it.key.split("|")[1], date=ym===ymOf(today()) ? today() : ym+"-01";
  if(isBigItem(it) && reserveAcc() && it.type==="expense"){ const ra=reserveAcc(), a0=it.accountId&&byId("accounts",it.accountId); if(!a0 || a0.type!=="card"){ it={...it, accountId:ra.id}; S._potNext="reserve"; } }
  if(it.src==="p"){ const l=byId("loans",it.id); if(l) entryForm(l,"repay",{},{amount:Math.round(it.amount*100)/100, accountId:it.accountId||live("accounts")[0]?.id, link:it.key, date, note:"Planned repayment"}); return; }
  txnForm({}, {type:it.type, amount:Math.round(it.amount*100)/100, accountId:it.accountId||live("accounts")[0]?.id, ...(it.type==="transfer"?{toAccountId:it.toAccountId}:{}), ...(it.type==="investment"&&it.chg?{charges:it.chg}:{}), categoryId:it.categoryId, instrument:it.type==="investment"?(byId("recurring",it.id)?.instrument):undefined, invType:it.type==="investment"?(byId("recurring",it.id)?.invType):undefined, note:it.name, link:it.key, date: it.key.split("|")[1]===ymOf(today()) ? today() : it.key.split("|")[1]+"-01"});
}

/* ---------- views ---------- */
function plannedRow(it, showPaid){
  if(it.src==="c") return `<div class="row"><div class="main"><div class="t">${esc(it.name)} <span class="chip mute">Card</span></div><div class="s">${it.day?`Due ${it.day} · `:""}${esc(it.sub)}</div></div>
    <div class="amt">${money(it.amount)}</div>${showPaid ? (it.paidC ? '<span class="chip good">Paid</span>' : `<button class="btn sm" type="button" data-cpay="${esc(it.id)}">Pay</button>`) : ""}</div>`;
  if(it.src==="b"){
    const over=it.spent-it.budget, pct=it.budget?Math.min(100,it.spent/it.budget*100):0, left=Math.max(0,it.budget-it.spent);
    return `<div class="row tap" data-rec="${esc(it.id)}" role="button" tabindex="0"><div class="main"><div class="t">${esc(it.name)} <span class="chip mute">Budget</span></div>
      <div class="s">Spent ${money(it.spent)} of ${money(it.budget)}${over>0.5?` · <span class="ccbad">over by ${money(over)}</span>`:""}</div>
      <div class="bar"><i style="width:${pct.toFixed(1)}%;${over>0.5?"background:var(--bad)":""}"></i></div></div>
      <div class="ccamt"><div class="cclbl">${over>0.5?"Over":"Left"}</div><div class="amt ${over>0.5?"neg":""}">${money(over>0.5?over:left)}</div></div></div>`;
  }
  const sign = it.type==="income" ? "in" : it.type==="transfer" ? "" : "out";
  const tag = it.type==="transfer" ? '<span class="chip mute">Transfer</span>' : it.type==="investment" ? '<span class="chip">Invest</span>' : it.src==="l" ? '<span class="chip mute">EMI</span>' : it.src==="p" ? '<span class="chip mute">Repay</span>' : it.type==="income" ? '<span class="chip good">Income</span>' : "";
  return `<div class="row"><div class="main"><div class="t">${esc(it.name)} ${tag} ${it.ends?'<span class="chip good">Last one</span>':""}</div>
    <div class="s">${it.day?`Due ${it.day} · `:""}${esc(it.sub || (it.type==="investment"?"Investment":catName(it.categoryId)))}</div></div>
    <div class="amt ${sign}">${it.type==="income"?"+":""}${money(it.amount)}</div>
    ${showPaid ? (it.missed ? `<button type="button" class="chip bad chipbtn" data-undo="${esc(it.key)}" aria-label="Missed. Tap to undo or change">Missed ▾</button>` : it.paid ? `<button type="button" class="chip good chipbtn" data-undo="${esc(it.key)}" aria-label="${it.type==="income"?"Received":"Paid"}. Tap to undo or change">${it.type==="income"?"Received":"Paid"} ▾</button>` : `<span class="btns" style="flex-wrap:nowrap;gap:6px">${it.canMiss?`<button class="btn sm" type="button" data-miss="${esc(it.key)}">Missed</button>`:""}<button class="btn sm" type="button" data-pay="${esc(it.key)}">${it.type==="income"?"Received":"Paid"}</button></span>`) : ""}</div>`;
}
/* the account Home's current balance is read from: the one marked main, else HDFC, else the first bank account */
const mainAcc = () => { const b=live("accounts").filter(a=>a.type!=="card" && countsAcc(a)); return b.find(a=>a.main) || b.find(a=>/^hdfc$/i.test(a.name.trim())) || b.find(a=>a.type==="bank") || null; };
function monthBalance(cur){
  const m=mainAcc(); if(!m) return "";
  const now=ymOf(today()), on=id=>!id || id===m.id;
  const curBal=balances().get(m.id)||0;
  const pend=cur.rows.filter(r=>!r.paid && on(r.accountId));
  const inc=pend.filter(r=>r.type==="income"), out=pend.filter(r=>r.type!=="income");
  const cards=out.filter(r=>r.src==="c"), other=out.filter(r=>r.src!=="c");
  const inSum=inc.reduce((s,r)=>s+r.amount,0), outSum=other.reduce((s,r)=>s+r.amount,0), cardSum=cards.reduce((s,r)=>s+r.amount,0);
  const end=curBal+inSum-outSum-cardSum;
  const line=(t,sub,v,cls="")=>`<div class="row"><div class="main"><div class="t">${t}</div>${sub?`<div class="s">${sub}</div>`:""}</div><div class="amt ${cls}">${v}</div></div>`;
  const names=list=>list.slice(0,3).map(x=>esc(x)).join(", ")+(list.length>3?` +${list.length-3} more`:"");
  return `
  <h2>${esc(m.name)} balance <span class="sp"></span><button class="btn sm" type="button" id="pickMain">Change account</button></h2>
  <div class="list">
    ${line("Current balance",`In ${esc(m.name)} today`,money(curBal),curBal<0?"neg":"")}
    ${line("Income still expected",inc.length?names(inc.map(r=>r.name)):"Nothing pending",`+${money(inSum)}`,"in")}
    ${line("Still to pay this month",other.length?names(other.map(r=>r.name)):"Nothing pending",`−${money(outSum)}`)}
    ${cards.length?line("Card bills due",names(cards.map(r=>r.name.replace(/ bill$/,""))),`−${money(cardSum)}`):""}
    <div class="row" style="background:var(--accent-soft)"><div class="main"><div class="t"><b>Month-end balance</b></div><div class="s">After everything planned for ${mLabel(now)}</div></div><div class="amt ${end<0?"neg":""}"><b>${money(end)}</b></div></div>
  </div>
  <p class="note">Counts regular items paid from or into ${esc(m.name)} (or with no account set) that aren't marked paid yet.${end<0?" <b>The month ends short; move money in or push a payment.</b>":""}</p>`;
}
function pickMainSheet(){
  const m=mainAcc(), banks=live("accounts").filter(a=>a.type!=="card" && (!a.hidden || (m&&a.id===m.id)));
  openSheet("Account for Home balance", `${field(["acc","Show the current and month-end balance for","select",{value:m?m.id:"",options:banks.map(a=>[a.id,a.name])}])}
    <div class="btns"><button class="btn pri" id="sv" type="button">Save</button><button class="btn" id="cx" type="button">Cancel</button></div>`, s=>{
    s.querySelector("#cx").onclick=closeModal;
    s.querySelector("#sv").onclick=()=>{ const id=val("acc"); for(const a of banks){ const want=a.id===id; if(!!a.main!==want){ if(want) a.main=true; else delete a.main; stamp(a); } } closeModal(); changed(); };
  });
}
const CC=["var(--v1)","var(--v2)","var(--v3)","var(--v4)","var(--v5)"];
/* items that need action now: overdue or due-soon bills/EMIs, card bills, unmarked hybrid EMIs, overspent budgets */
function needsYou(){
  const td=today(), now=ymOf(td), day=+td.slice(8), out=[];
  const cur=forecast(1).months[0];
  for(const r of cur.rows){
    if(r.paid || r.type==="income") continue;
    if(r.src==="b"){
      if(r.spent>r.budget+0.5) out.push({w:1, t:`${r.name} budget`, s:`Over by ${money(r.spent-r.budget)}`, a:r.spent, act:'<span class="pill bad">Over</span>'});
      else if(r.budget-r.spent>0.5) out.push({w:2.5, d:r.day||99, t:`${r.name} budget`, s:`Spent ${money(r.spent)} of ${money(r.budget)}${r.day?` · planned by ${r.day} ${MN[+now.slice(5)-1]}`:""}`, a:r.budget-r.spent, act:`<span class="pill">Left</span><button class="btn sm" type="button" data-rec="${esc(r.id)}">Edit</button>`});
      continue; }
    if(r.src==="c") continue;   /* card bills are on Pay by Tuesday */
    if(r.src==="c"){ const a=byId("accounts",r.id), c=a&&cardInfo(a); if(!c||!c.due||c.dueLeft<0.5) continue;
      out.push({w:c.days<0?0:c.days<=5?1:3, t:r.name, s:r.sub, a:r.amount, act:`${c.days<0?'<span class="pill bad">Overdue</span>':c.days<=5?`<span class="pill warn">${c.days}d left</span>`:""}<button class="btn sm pri" type="button" data-cpay="${esc(r.id)}">Pay</button>`}); continue; }
    if(!isAutoItem(r) || !r.day || r.day>day) continue;   /* bills you pay yourself are on Pay by Tuesday; auto ones show once their day comes */
    const late=r.day && r.day<day, soon=r.day && r.day-day<=5;
    out.push({w:late?0:soon?1:2, d:r.day||99, t:r.name, s:`${r.day?`${late?"Was due":"Due"} ${r.day} ${MN[+now.slice(5)-1]} · `:""}${r.sub||catName(r.categoryId)}`, a:r.amount,
      act:`${late?'<span class="pill bad">Overdue</span>':""}${r.canMiss?`<button class="btn sm" type="button" data-miss="${esc(r.key)}">Missed</button>`:""}<button class="btn sm pri" type="button" data-pay="${esc(r.key)}">${r.type==="income"?"Received":"Paid"}</button>`});
  }
  /* hybrid EMIs from earlier months never marked paid or missed */
  for(const l of live("loans")) if(kindOf(l)==="hybrid"){ const sc=schedule(l), pm=paidMap(); if(!sc) continue;
    for(const row of sc.rows) if(row.ym<now && !pm.has(`l:${l.id}|${row.ym}`))
      out.push({w:0, t:`${l.name} EMI · ${mLabel(row.ym)}`, s:"Not marked yet", a:row.emi, act:`<button class="btn sm" type="button" data-miss="l:${esc(l.id)}|${row.ym}">Missed</button><button class="btn sm pri" type="button" data-pay="l:${esc(l.id)}|${row.ym}">Paid</button>`}); }
  return out.sort((a,b)=>a.w-b.w || (a.d||99)-(b.d||99));
}

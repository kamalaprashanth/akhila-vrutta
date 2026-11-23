/* KP Money Planner, moved over unchanged. Tidied into typed modules later in Milestone 2. */
/* ==========================================================================
   Broker trades (Kite tradebooks): kept for reference and listed in Transactions.
   They never change a bank balance or any total; holdings come from the holdings file.
   ========================================================================== */
/* a small .xlsx reader: first worksheet → rows of cell values */
async function xlsxRows(file){
  const buf=new Uint8Array(await file.arrayBuffer()), dv=new DataView(buf.buffer);
  let e=-1; for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--) if(dv.getUint32(i,true)===0x06054b50){ e=i; break; }
  if(e<0) throw new Error("not an .xlsx file");
  const n=dv.getUint16(e+10,true); let p=dv.getUint32(e+16,true); const files={};
  for(let i=0;i<n;i++){ const method=dv.getUint16(p+10,true), csize=dv.getUint32(p+20,true), nl=dv.getUint16(p+28,true), xl=dv.getUint16(p+30,true), cl=dv.getUint16(p+32,true), off=dv.getUint32(p+42,true);
    const name=new TextDecoder().decode(buf.subarray(p+46,p+46+nl)); files[name]={method,csize,off}; p+=46+nl+xl+cl; }
  const read=async name=>{ const f=files[name]; if(!f) return null; const lh=f.off, start=lh+30+dv.getUint16(lh+26,true)+dv.getUint16(lh+28,true), data=buf.subarray(start,start+f.csize);
    if(f.method===0) return new TextDecoder().decode(data);
    const s=new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")); return await new Response(s).text(); };
  const P=new DOMParser(), ss=[], sst=await read("xl/sharedStrings.xml");
  if(sst){ const doc=P.parseFromString(sst,"application/xml"); for(const si of doc.getElementsByTagName("si")) ss.push([...si.getElementsByTagName("t")].map(t=>t.textContent).join("")); }
  const sheetName=Object.keys(files).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  const doc=P.parseFromString(await read(sheetName),"application/xml"), rows=[];
  const col=ref=>{ let c=0; for(const ch of ref.replace(/\d+/g,"")) c=c*26+(ch.charCodeAt(0)-64); return c-1; };
  for(const r of doc.getElementsByTagName("row")){ const row=[];
    for(const c of r.getElementsByTagName("c")){ const t=c.getAttribute("t"), v=c.getElementsByTagName("v")[0], is=c.getElementsByTagName("is")[0];
      let val = t==="s" ? ss[+(v&&v.textContent)] : t==="inlineStr" ? (is?[...is.getElementsByTagName("t")].map(x=>x.textContent).join(""):"") : t==="b" ? (v&&v.textContent)==="1" : v ? (t==="str"?v.textContent:(isNaN(+v.textContent)?v.textContent:+v.textContent)) : null;
      row[col(c.getAttribute("r")||"A")]=val; }
    rows.push(row); }
  return rows;
}
/* Kite tradebook rows → trade records */
function kiteTrades(rows){
  const hi=rows.findIndex(r=>r && r.includes("Symbol") && r.includes("Trade Type")); if(hi<0) throw new Error("not a Kite tradebook");
  const H=rows[hi], c=n=>H.indexOf(n), out=[];
  for(const r of rows.slice(hi+1)){ if(!r || !r[c("Symbol")]) continue;
    const d=String(r[c("Trade Date")]||"").slice(0,10), side=String(r[c("Trade Type")]||"").toLowerCase(), qty=+r[c("Quantity")], price=+r[c("Price")];
    if(!/^\d{4}-\d\d-\d\d$/.test(d) || !(qty>0) || !(price>=0) || !/^(buy|sell)$/.test(side)) continue;
    const ex=String(r[c("Exchange")]||""), tid=String(r[c("Trade ID")]??""), oid=String(r[c("Order ID")]??"");
    out.push({id:`kt:${ex}:${d}:${tid}:${oid}`, broker:"Kite", sym:String(r[c("Symbol")]).trim(), isin:String(r[c("ISIN")]||""), date:d, side, qty, price, ex, at:String(r[c("Order Execution Time")]||"")}); }
  return out;
}
async function importTradebooks(files){
  if(!files || !files.length) return;
  let added=0, seen=0, bad=0;
  for(const f of files){ try{ const list=kiteTrades(await xlsxRows(f)); for(const t of list){ seen++; if(!byId("trades",t.id)){ put("trades", t); added++; } } } catch(e){ console.warn("tradebook", f.name, e); bad++; } }
  if(added) changed();
  toast(added ? `${added} trade${added>1?"s":""} added${seen-added?`, ${seen-added} already there`:""}${bad?`, ${bad} file${bad>1?"s":""} couldn't be read`:""}` : seen ? "All these trades are already in the app." : "Couldn't read these as Kite tradebooks.");
}
/* the trades behind one holding: same ISIN or symbol (or an older name in h.aka), on the holding's platform */
const tradeSym = s => String(s||"").toUpperCase().replace(/-(E|RR|BE|EQ)$/,"").replace(/\s*\(.*\)$/,"").trim();
function tradesFor(h){
  if(!h || !["Stock","US Stocks","Gold"].includes(h.type)) return [];
  const isin=String(h.px||"").startsWith("stk:")?h.px.slice(4):"", syms=new Set([tradeSym(h.name), tradeSym(h.instrument), ...(h.aka||[]).map(tradeSym)].filter(Boolean)), plat=String(h.platform||"").toLowerCase();
  return live("trades").filter(t=>(!plat || plat===String(t.broker).toLowerCase()) && ((isin && t.isin===isin) || syms.has(tradeSym(t.sym)) || (h.aka||[]).includes(t.isin))).sort((a,b)=>b.date.localeCompare(a.date)||String(b.at).localeCompare(String(a.at)));
}
function tradesBlock(h){
  const T=tradesFor(h); if(!T.length) return "";
  const us=T[0].ccy==="USD", f=us?usd:money, F=us?usd:rs0, amt=t=>t.amt??t.qty*t.price;
  const buys=T.filter(t=>t.side==="buy"), sells=T.filter(t=>t.side==="sell"), sum=a=>a.reduce((x,t)=>x+amt(t),0), q=a=>+a.reduce((x,t)=>x+t.qty,0).toFixed(us?4:0);
  const row=t=>`<div class="row trow"><div class="main"><div class="t">${t.side==="buy"?"Bought":"Sold"} ${us?(+t.qty).toFixed(4):t.qty} @ ${f(t.price)}</div><div class="s">${fmtD(t.date)}${t.ex?` · ${esc(t.ex)}`:""}${t.fee?` · fee ${f(t.fee)}`:""}${t.sym!==T[0].sym?` · as ${esc(t.sym)}`:""}</div></div><div class="amt ${t.side==="sell"?"in":""}">${t.side==="sell"?"+":""}${f(amt(t))}</div></div>`;
  return `<p class="sect">Trades on ${esc(T[0].broker)}</p>
    <div class="kp3 trk"><div class="tile"><div class="k">Bought · ${q(buys)}</div><div class="v">${F(sum(buys))}</div></div><div class="tile"><div class="k">Sold${sells.length?` · ${q(sells)}`:""}</div><div class="v">${sells.length?F(sum(sells)):"—"}</div></div><div class="tile"><div class="k">First trade</div><div class="v">${fmtD(T[T.length-1].date)}</div></div></div>
    <div class="list" style="margin-top:8px">${T.slice(0,8).map(row).join("")}</div>
    ${T.length>8?`<details class="ctab"><summary>Show all ${T.length} trades</summary><div class="list">${T.slice(8).map(row).join("")}</div></details>`:""}
    <p class="note">From your tradebooks. Bonuses, splits and years not imported aren't in this list, so it can differ from the units held.</p>`;
}
/* trades in Transactions, newest first; never counted anywhere */
function tradeTxItems(){
  return live("trades").map(t=>{ const amt=Math.round((t.amt??t.qty*t.price)*100)/100, buy=t.side==="buy", us=t.ccy==="USD", f=us?usd:money;
    return {id:"trd:"+t.id, type:"trade", ccy:t.ccy, date:t.date, amount:amt, title:`${t.sym} · ${buy?"bought":"sold"} ${us?(+t.qty).toFixed(4):t.qty} @ ${f(t.price)}`, sub:`${t.broker}${t.ex?` · ${t.ex}`:""}${us?` · ${usd(amt)}`:""} · not from a bank account`, note:`${t.sym} ${t.isin} ${t.broker} ${buy?"buy bought":"sell sold"}`, out:!buy, updatedAt:0, isin:t.isin, buy}; });
}

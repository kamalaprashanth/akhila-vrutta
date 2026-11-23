/* KP Money Planner, moved over unchanged. Tidied into typed modules later in Milestone 2. */
/* ==========================================================================
   Excel export (both builds). A tiny .xlsx writer: stored ZIP + SpreadsheetML,
   so no library is needed. Readable copy of everything, for Excel / Sheets.
   ========================================================================== */
const XL = (()=>{
  const CRC=(()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
  const crc32=u=>{ let c=0xFFFFFFFF; for(let i=0;i<u.length;i++) c=CRC[(c^u[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; };
  const enc=new TextEncoder();
  function zip(files){ /* files: [{name, text}] -> Uint8Array (stored, UTF-8 names) */
    const parts=[], cd=[]; let off=0; const d=new Date(), dt=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(), tm=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1);
    for(const f of files){
      const name=enc.encode(f.name), data=enc.encode(f.text), crc=crc32(data);
      const h=new DataView(new ArrayBuffer(30)); h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(8,0,true); h.setUint16(10,tm,true); h.setUint16(12,dt,true); h.setUint32(14,crc,true); h.setUint32(18,data.length,true); h.setUint32(22,data.length,true); h.setUint16(26,name.length,true); h.setUint16(28,0,true);
      parts.push(new Uint8Array(h.buffer),name,data);
      const c=new DataView(new ArrayBuffer(46)); c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x0800,true); c.setUint16(10,0,true); c.setUint16(12,tm,true); c.setUint16(14,dt,true); c.setUint32(16,crc,true); c.setUint32(20,data.length,true); c.setUint32(24,data.length,true); c.setUint16(28,name.length,true); c.setUint32(42,off,true);
      cd.push(new Uint8Array(c.buffer),name); off+=30+name.length+data.length;
    }
    const cdSize=cd.reduce((a,u)=>a+u.length,0), e=new DataView(new ArrayBuffer(22)); e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true); e.setUint32(12,cdSize,true); e.setUint32(16,off,true);
    const all=[...parts,...cd,new Uint8Array(e.buffer)], out=new Uint8Array(all.reduce((a,u)=>a+u.length,0)); let p=0; for(const u of all){ out.set(u,p); p+=u.length; } return out;
  }
  const x=s=>String(s??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const col=i=>{ let s=""; i++; while(i){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; };
  const serial=d=>{ const [y,m,dd]=String(d).split("-").map(Number); if(!y) return null; return (Date.UTC(y,(m||1)-1,dd||1)-Date.UTC(1899,11,30))/864e5; };
  /* kinds: s text · n number · m money · d date (yyyy-mm-dd) · p percent (0.12 = 12%) */
  const STY={h:1,d:2,m:3,p:4,n:0,s:0};
  function sheet(sh){
    const rows=[`<row r="1">${sh.cols.map((c,i)=>`<c r="${col(i)}1" t="inlineStr" s="1"><is><t>${x(c.h)}</t></is></c>`).join("")}</row>`];
    sh.rows.forEach((r,ri)=>{ const R=ri+2; rows.push(`<row r="${R}">${r.map((v,i)=>{ const k=sh.cols[i].t||"s", ref=col(i)+R;
      if(v===null||v===undefined||v==="") return "";
      if(k==="d"){ const s=serial(v); return s===null?`<c r="${ref}" t="inlineStr"><is><t>${x(v)}</t></is></c>`:`<c r="${ref}" s="2"><v>${s}</v></c>`; }
      if(k==="m"||k==="n"||k==="p"){ const n=+v; return isFinite(n)?`<c r="${ref}" s="${STY[k]}"><v>${Math.round(n*1e6)/1e6}</v></c>`:""; }
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`; }).join("")}</row>`); });
    const last=`${col(sh.cols.length-1)}${Math.max(1,sh.rows.length+1)}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${sh.cols.map((c,i)=>`<col min="${i+1}" max="${i+1}" width="${c.w||14}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.join("")}</sheetData>${sh.rows.length?`<autoFilter ref="A1:${last}"/>`:""}</worksheet>`;
  }
  function book(sheets){
    const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd-mmm-yyyy"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0E5E4C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const files=[
      {name:"[Content_Types].xml", text:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`},
      {name:"_rels/.rels", text:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
      {name:"xl/workbook.xml", text:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${x(s.name.slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets>${sheets.map((s,i)=>s.rows.length?`<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${x(s.name)}'!$A$1:$${col(s.cols.length-1)}$${s.rows.length+1}</definedName></definedNames>`:"").filter(Boolean).slice(0,1).join("")}</workbook>`},
      {name:"xl/_rels/workbook.xml.rels", text:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
      {name:"xl/styles.xml", text:styles},
      ...sheets.map((s,i)=>({name:`xl/worksheets/sheet${i+1}.xml`, text:sheet(s)}))
    ];
    return zip(files);
  }
  return {book};
})();

function excelSheets(){
  const split=id=>{ const n=catName(id); const i=n.indexOf(" › "); return i<0?[n,""]:[n.slice(0,i),n.slice(i+3)]; };
  const tx=live("txns").slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"") || (b.updatedAt||0)-(a.updatedAt||0)).map(t=>{
    let type=TYPE_LBL[t.type]||t.type, cat="", sub="", flow="Out", amt=+t.amount, item=t.note||"";
    if(t.type==="expense"||t.type==="income"){ [cat,sub]=split(t.categoryId); if(t.type==="income") flow="In"; }
    else if(t.type==="transfer"){ flow="Transfer"; }
    else if(t.type==="investment"){ cat=invTypeOf(t)||"Investment"; sub=t.instrument||""; }
    else if(t.type==="loan"){ const l=byId("loans",t.loanId); type=`Loan · ${ACT_LBL[t.act]||t.act}`; cat=l?l.name:"Loan"; flow=t.act==="borrow"?"In":t.act==="missed"?"Owed":"Out"; }
    else if(t.type==="carry"){ type="Carry-over"; cat=t.dir==="in"?"Last month balance":"Carried to next month"; amt=+t.carry; flow=t.dir==="in"?"In":"Out"; }
    const b=t.budgetId&&byId("recurring",t.budgetId);
    return [t.date, type, cat, sub, t.paidBy?`${payerLbl(t)} (no balance kept)`:t.accountId?accName(t.accountId):"", t.toAccountId?accName(t.toAccountId):"", flow, amt, item, (t.tags||[]).join(", "), b?b.name:""];
  });
  const bal=balances();
  const acc=live("accounts").map(a=>[a.name, ACC_LBL[a.type]||a.type, bal.get(a.id)||0, +a.opening||0, a.stmtDay||"", a.dueDay||"", a.main?"Yes":""]);
  const rec=live("recurring").map(r=>[r.name, r.budget?"Budget":(TYPE_LBL[r.type]||r.type), +r.amount, FREQ_LBL[r.freq]||r.freq, r.day||"", r.start||"", r.end||"", r.accountId?accName(r.accountId):"", r.type==="investment"?(r.instrument||""):(r.categoryId?catName(r.categoryId):""), r.type==="investment"?(r.invType||""):""]);
  const loans=live("loans").map(l=>{ const x=loanSum(l); return [l.name, KIND_LBL[kindOf(l)]||"", l.lender||"", x.out, x.emiNow||"", x.rateNow||"", x.end||"", isClosed(l,x)?"Closed":"Open"]; });
  const hold=live("holdings").map(h=>{ const x=holdingSum(h); return [h.name, h.type, h.platform||"", x.byUnits?x.units:"", x.inv, x.value, x.isUsd?x.usdValue:"", x.isUsd?(+h.fx||""):"", x.gain, x.inv>0?x.gain/x.inv:"", x.asOf||"", h.excludeNW?"No":"Yes"]; });
  const y=today().slice(0,4), months=Array.from({length:12},(_,i)=>`${y}-${pad(i+1)}`).map(ym=>{ const f=monthFigures(ym); return [mLabel(ym), f.kind==="actual"?"Actual":f.kind==="projected"?"So far + still due":"Plan", f.income, f.expense, f.investment, f.income-f.expense-f.investment]; });
  const nw=netWorth();
  const nwr=[["Bank (month-end for "+(nw.mainAcc?nw.mainAcc.name:"main account")+")", nw.banks],["Investments", nw.inv],["Property", nw.prop],["You own", nw.banks+nw.inv+nw.prop],["Loans", -nw.loans],["Card bills", -nw.cards],["You owe", -(nw.loans+nw.cards)],["Net worth at month-end", nw.total],["Not counted (property)", nw.excluded]];
  return [
    {name:"Transactions", cols:[{h:"Date",t:"d",w:13},{h:"Type",w:18},{h:"Category",w:22},{h:"Subcategory",w:24},{h:"Account",w:16},{h:"To account",w:16},{h:"Flow",w:9},{h:"Amount (₹)",t:"m",w:14},{h:"Note",w:30},{h:"Tags",w:16},{h:"Budget",w:16}], rows:tx},
    {name:`Months ${y}`, cols:[{h:"Month",w:12},{h:"Figures",w:18},{h:"Income (₹)",t:"m",w:15},{h:"Expenses (₹)",t:"m",w:15},{h:"Invested (₹)",t:"m",w:15},{h:"Balance (₹)",t:"m",w:15}], rows:months},
    {name:"Accounts", cols:[{h:"Account",w:22},{h:"Type",w:13},{h:"Balance today (₹)",t:"m",w:18},{h:"Opening (₹)",t:"m",w:15},{h:"Statement day",t:"n",w:14},{h:"Due day",t:"n",w:10},{h:"Main account",w:13}], rows:acc},
    {name:"Regular items", cols:[{h:"Name",w:24},{h:"Kind",w:12},{h:"Amount (₹)",t:"m",w:14},{h:"Frequency",w:16},{h:"Day",t:"n",w:6},{h:"Starts",w:10},{h:"Ends",w:10},{h:"Account",w:16},{h:"Category / investment",w:30},{h:"Investment type",w:16}], rows:rec},
    {name:"Loans", cols:[{h:"Loan",w:20},{h:"Kind",w:18},{h:"Lender",w:16},{h:"Outstanding (₹)",t:"m",w:17},{h:"EMI now (₹)",t:"m",w:14},{h:"Rate %",t:"n",w:9},{h:"Ends",w:10},{h:"Status",w:10}], rows:loans},
    {name:"Investments", cols:[{h:"Holding",w:26},{h:"Type",w:14},{h:"Platform",w:14},{h:"Units",t:"n",w:11},{h:"Invested (₹)",t:"m",w:15},{h:"Current value (₹)",t:"m",w:17},{h:"Value in $",t:"m",w:13},{h:"₹ per $",t:"n",w:9},{h:"Gain (₹)",t:"m",w:14},{h:"Gain %",t:"p",w:10},{h:"Value as of",t:"d",w:13},{h:"In net worth",w:12}], rows:hold},
    {name:"Net worth", cols:[{h:"Item",w:36},{h:"Amount (₹)",t:"m",w:18}], rows:nwr}
  ];
}
async function saveFile(filename, bytes, mime){
  const blob=new Blob([bytes],{type:mime});
  try{ const dl=(window.claude && typeof window.claude.use==="function") ? await window.claude.use("downloads") : null;
    if(dl){ try{ await dl.save({filename, data:blob}); toast("Saved "+filename); }catch(e){ if(e && e.code!=="declined") toast("Couldn't save the file here ("+(e.code||"error")+")."); } return; } }catch(e){}
  const url=URL.createObjectURL(blob), a=document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 4000); toast("Downloaded "+filename);
}
function exportExcel(){
  try{ const bytes=XL.book(excelSheets()); saveFile(`KP Money Planner ${today()}.xlsx`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); }
  catch(e){ toast("Couldn't build the Excel file ("+(e.message||"error")+")."); }
}


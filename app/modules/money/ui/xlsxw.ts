/* A tiny .xlsx writer (stored ZIP + SpreadsheetML), as KP Money Planner's Excel export: no library needed. */
/* eslint-disable */
export interface XlCol { h: string; t?: "s" | "n" | "m" | "d" | "p"; w?: number }
export interface XlSheet { name: string; cols: XlCol[]; rows: unknown[][] }
export const XL = (()=>{
  const CRC=(()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
  const crc32=(u: Uint8Array): number=>{ let c=0xFFFFFFFF; for(let i=0;i<u.length;i++) c=CRC[(c^u[i]!)&255]!^(c>>>8); return (c^0xFFFFFFFF)>>>0; };
  const enc=new TextEncoder();
  function zip(files: { name: string; text: string }[]): Uint8Array { /* files: [{name, text}] -> Uint8Array (stored, UTF-8 names) */
    const parts: Uint8Array[]=[], cd: Uint8Array[]=[]; let off=0; const d=new Date(), dt=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(), tm=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1);
    for(const f of files){
      const name=enc.encode(f.name), data=enc.encode(f.text), crc=crc32(data);
      const h=new DataView(new ArrayBuffer(30)); h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(8,0,true); h.setUint16(10,tm,true); h.setUint16(12,dt,true); h.setUint32(14,crc,true); h.setUint32(18,data.length,true); h.setUint32(22,data.length,true); h.setUint16(26,name.length,true); h.setUint16(28,0,true);
      parts.push(new Uint8Array(h.buffer),name,data);
      const c=new DataView(new ArrayBuffer(46)); c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x0800,true); c.setUint16(10,0,true); c.setUint16(12,tm,true); c.setUint16(14,dt,true); c.setUint32(16,crc,true); c.setUint32(20,data.length,true); c.setUint32(24,data.length,true); c.setUint16(28,name.length,true); c.setUint32(42,off,true);
      cd.push(new Uint8Array(c.buffer),name); off+=30+name.length+data.length;
    }
    const cdSize=cd.reduce((a,u)=>a+u.length,0), e=new DataView(new ArrayBuffer(22)); e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true); e.setUint32(12,cdSize,true); e.setUint32(16,off,true);
    const all: Uint8Array[]=[...parts,...cd,new Uint8Array(e.buffer)], out=new Uint8Array(all.reduce((a,u)=>a+u.length,0)); let p=0; for(const u of all){ out.set(u,p); p+=u.length; } return out;
  }
  const x=(s: unknown): string=>String(s??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").replace(/[&<>"]/g,(c: string)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"} as Record<string, string>)[c]!);
  const col=(i: number): string=>{ let s=""; i++; while(i){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; };
  const serial=(d: unknown): number | null=>{ const [y,m,dd]=String(d).split("-").map(Number); if(!y) return null; return (Date.UTC(y,(m||1)-1,dd||1)-Date.UTC(1899,11,30))/864e5; };
  /* kinds: s text · n number · m money · d date (yyyy-mm-dd) · p percent (0.12 = 12%) */
  const STY: Record<string, number>={h:1,d:2,m:3,p:4,n:0,s:0};
  function sheet(sh: XlSheet): string {
    const rows: string[]=[`<row r="1">${sh.cols.map((c,i)=>`<c r="${col(i)}1" t="inlineStr" s="1"><is><t>${x(c.h)}</t></is></c>`).join("")}</row>`];
    sh.rows.forEach((r,ri)=>{ const R=ri+2; rows.push(`<row r="${R}">${r.map((v,i)=>{ const k=sh.cols[i]!.t||"s", ref=col(i)+R;
      if(v===null||v===undefined||v==="") return "";
      if(k==="d"){ const s=serial(v); return s===null?`<c r="${ref}" t="inlineStr"><is><t>${x(v)}</t></is></c>`:`<c r="${ref}" s="2"><v>${s}</v></c>`; }
      if(k==="m"||k==="n"||k==="p"){ const n=+v; return isFinite(n)?`<c r="${ref}" s="${STY[k]}"><v>${Math.round(n*1e6)/1e6}</v></c>`:""; }
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`; }).join("")}</row>`); });
    const last=`${col(sh.cols.length-1)}${Math.max(1,sh.rows.length+1)}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${sh.cols.map((c,i)=>`<col min="${i+1}" max="${i+1}" width="${c.w||14}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.join("")}</sheetData>${sh.rows.length?`<autoFilter ref="A1:${last}"/>`:""}</worksheet>`;
  }
  function book(sheets: XlSheet[]): Uint8Array {
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

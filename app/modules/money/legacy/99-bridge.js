/* Bridge to Akhila Vrutta. The parent page owns the data: it decrypts it, hands it over in rupees,
   and saves back whatever changed (in paise, encrypted, one record at a time). */
const AVB = (() => { try { return window.parent !== window ? window.parent.AV_MONEY : null; } catch (e) { return null; } })();
function hSaveLocal(){ if(AVB && S.data) AVB.save(S.data); }
async function hSync(){ if(AVB && S.data) AVB.save(S.data); }
async function hSignIn(){ return null; }
function hostedCard(){ return `<h2>Security &amp; saving</h2><div class="card"><p style="margin:0">Your money data is encrypted and saved by Akhila Vrutta. Unlocking, your passphrase and importing are in the app's main <b>Settings</b> tab.</p></div>`; }
const notHere = () => toast("This is in Akhila Vrutta's main Settings tab.");
function hSnapSheet(){ notHere(); }
function hBackup(){ notHere(); }
function hModeSheet(){ notHere(); }
function hChangePass(){ notHere(); }
function hSignOut(){ notHere(); }
function hSnapDaily(){}
async function hOpenBackup(){ throw new Error("Open encrypted backups from Settings › Import in Akhila Vrutta."); }

(async function boot(){
  if(!AVB){ document.body.innerHTML = '<p style="padding:24px">Open this from Akhila Vrutta.</p>'; return; }
  /* Prices and the Advisor use the main app's signed-in Firebase (same session, nothing stored here). */
  try { const f = await AVB.firebase(); if(f) Object.assign(H, f, { key: true, cfg: { ai: true, aiRegion: "asia-south1" } }); } catch(e){}
  S.data = merge({}, AVB.load()); S.dirty = false; carryReady = true;
  const h = readHash(); if(VIEWS[h]) S.view = h;
  /* Transactions is drawn by Akhila Vrutta itself now (app/modules/money/views); the planner keeps its
     state (filters, month, selection) and still opens the forms and sheets for it. */
  for(const v of (AVB.moved || ["activity"])) VIEWS[v] = () => "";
  const toast0 = toast;
  toast = t => { if(!(AVB.toast && AVB.toast(t))) toast0(t); };
  new MutationObserver(() => AVB.sheet && AVB.sheet(!!$("#modal").firstElementChild)).observe($("#modal"), { childList: true });
  const draw = render;
  render = function(){ draw(); AVB.onView(S.view); };
  AVB.ready({
    go: v => { if(S.view !== v) go(v); else render(); },
    add: () => { const b = document.querySelector("[data-add]"); if(b) b.click(); },
    replace: data => { S.data = merge({}, data); MEMO = new Map(); render(); },
    state: () => { txFilter(); return S; },
    call: (name, ...args) => {
      if(name === "go") return go(args[0]);
      /* fragments only the planner can draw yet */
      if(name === "html") return args[0] === "pxLine" ? pxLine() : "";
      /* a tap on a page Akhila Vrutta draws, for something only the planner can open yet */
      if(name === "click"){ const b=document.createElement("button"); b.type="button"; b.hidden=true; for(const [k,v] of Object.entries(args[0])) b.setAttribute(k,v); $("#view").appendChild(b); b.click(); b.remove(); return; }
      if(name === "files" && args[0] === "importTradebooks") return importTradebooks(args[1]);
      if(name === "run" && args[0] === "ensureSmartGoals") return ensureSmartGoals();
    },
    openTx: id => openTxItem(id),
    filters: () => txFilterSheet(),
    cleanup: () => cleanupSheet(),
    bulk: k => bulkAct(k),
    /* "full": the frame fills the screen while a sheet is open (offsets keep the page where it was);
       "only": just the sheet, over a screen Akhila Vrutta draws. */
    chrome: (mode, o) => { const r = document.documentElement; r.classList.toggle("avfull", mode !== ""); r.classList.toggle("avonly", mode === "only");
      if(o) for(const k of ["t","l","b"]) r.style.setProperty("--av"+k, (o[k]||0)+"px"); },
  });
  render(); setSync("ok", "Saved");
  AVB.save(S.data);   /* anything the first render filled in (carry-overs, card EMIs, snapshots) */
})();

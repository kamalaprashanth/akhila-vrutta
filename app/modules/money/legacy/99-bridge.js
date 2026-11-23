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

(function boot(){
  if(!AVB){ document.body.innerHTML = '<p style="padding:24px">Open this from Akhila Vrutta.</p>'; return; }
  S.data = merge({}, AVB.load()); S.dirty = false; carryReady = true;
  const h = readHash(); if(VIEWS[h]) S.view = h;
  const draw = render;
  render = function(){ draw(); AVB.onView(S.view); };
  AVB.ready({
    go: v => { if(S.view !== v) go(v); else render(); },
    add: () => { const b = document.querySelector("[data-add]"); if(b) b.click(); },
    replace: data => { S.data = merge({}, data); MEMO = new Map(); render(); },
  });
  render(); setSync("ok", "Saved");
  AVB.save(S.data);   /* anything the first render filled in (carry-overs, card EMIs, snapshots) */
})();

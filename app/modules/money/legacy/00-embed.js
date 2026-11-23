/* KP Money Planner running inside Akhila Vrutta. It behaves like the hosted app (same data rules),
   but unlock, encryption and saving belong to Akhila Vrutta: see 99-bridge.js. */
"use strict";
const HOSTED = true, EMBED = true;
const H = { cfg: {}, user: null, key: null, mode: null };
const MODE_LBL = {};
const fromB64 = b => { const s=atob(b); const u=new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return u; };

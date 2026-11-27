# Working on Akhila Vrutta

- **Show it first.** Before building any feature or visual change, show the owner a design or
  screenshots and get a yes. Ask instead of assuming.
- Never paste or commit API keys. Never store bank account or folio numbers (last 4 only). ID numbers in Documents
  (Aadhaar, PAN, PRAN, passport…) are kept in full, encrypted, hidden until tapped (owner's decision, 27 Nov 2026).
  Never show the owner's email in the UI; show the UID only when needed.
- Money is paise (`app/core/money.ts`). Format with `formatINR` / `formatShort` (Indian grouping).
- All HTML goes through the `html` tagged template (escapes by default); use `raw()` only for markup you built.
- New area = new folder in `app/modules/` exporting a `Module`, added to `MODULES`.
- Firebase SDK comes from the gstatic CDN by dynamic import (pinned version in `app/core/firebase.ts`);
  keep runtime npm dependencies at zero.
- Before pushing: `npm run check` (typecheck, unit, build, page checks). With the owner's export at hand also
  `AV_EXPORT=… OLD_APP=… npm run test:parity` (every money page vs the old app). Never commit real data.
- Work on a branch; CI runs the cloud tests (`tests/cloud`, Firebase emulators with the real firebase.json and
  rules) on every push. Merge to `main` only when green.
- `main` releases itself: preview channel → `tests/live` on the preview → that exact build cloned to live →
  `tests/live` on live → automatic rollback if it fails (rehearsed on every release).
- New cloud behaviour (unlock, saving, rules, sync) gets a step in `tests/cloud/cloud.mjs` in the same change.
- Tell the owner something works only after it has passed on the preview or live site, and say plainly what
  wasn't tested (for example anything that needs a real phone or a real Google sign-in).
- Commit as `Claude <noreply@anthropic.com>`.

# Working on Akhila Vrutta

- **Show it first.** Before building any feature or visual change, show the owner a design or
  screenshots and get a yes. Ask instead of assuming.
- Never paste or commit API keys. Never store PAN, account numbers, PRAN or folio numbers (last 4 only).
  Never show the owner's email in the UI; show the UID only when needed.
- Money is paise (`app/core/money.ts`). Format with `formatINR` / `formatShort` (Indian grouping).
- All HTML goes through the `html` tagged template (escapes by default); use `raw()` only for markup you built.
- New area = new folder in `app/modules/` exporting a `Module`, added to `MODULES`.
- Firebase SDK comes from the gstatic CDN by dynamic import (pinned version in `app/core/firebase.ts`);
  keep runtime npm dependencies at zero.
- Before pushing: `npm run check`. CI deploys `main` to kp-akhila-vrutta.web.app.
- Commit as `Claude <noreply@anthropic.com>`.

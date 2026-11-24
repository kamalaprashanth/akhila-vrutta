# Money: moving the planner's screens into Akhila Vrutta

The owner asked (24 Nov 2026) for all of Money to be finished without stopping for approval at each step.
Looks stay the same (agreed "new shell, same screens"); only agreed fixes change anything visible.
Each step ships on its own: branch → CI (cloud tests) → main → release, checked against the old app.

## How a screen moves
- Page HTML is built by a typed, pure function from the store (paise) — `app/modules/money/views/*.ts`.
- `tests/parity/screens.mjs` compares it with the planner's own view function, character for character,
  on the real export (AV_EXPORT) and on made-up rows for anything rare. Mutation-test the new code.
- The planner's stylesheet is scoped to `.mv` at build (`scripts/scope-css.mjs` → `dist/money/mv.css`).
- Until the planner frame is gone it keeps shared UI state (`S`): filters, month, tabs. Moved screens read and
  write that state through the bridge (`99-bridge.js` → `FrameApi`).
- Interactions are tested in `tests/e2e/*.mjs` on the made-up sample (phone + laptop).

## Order and status
1. Calculations — done (calc/*.ts, `tests/parity/calc.mjs`).
2. Transactions list — done (views/txlist.ts). Planner sheets fill the screen; + hidden while open.
3. UI kit (sheet, fields, ₹ inputs, category/account pickers, toast, confirm) + transaction form, split,
   tags, filters sheet, clean-up, bulk sheets — next.
4. Accounts (+ card, loan, EPF, PPF, NPS, properties pages and their forms).
5. Plan (month, regular, cash flow, calendar, goals; forecast).
6. Overview. 7. Insights. 8. Advisor. 9. Money settings (more).
10. Remove the frame; switch-over (import button goes, old app read-only for a month).

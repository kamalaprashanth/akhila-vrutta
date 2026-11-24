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
3. UI kit (ui/kit.ts) + transaction form, split, carry-over, filters, clean-up, bulk sheets — done (live).
4. Accounts page (views/accounts.ts, charts in views/charts.ts) — done. Still in the planner: card, loan, EPF,
   PPF, NPS, property pages; account/loan/holding/property forms; prices status line (`plannerHtml("pxLine")`).
   Pages plug into views/pages.ts; taps a page doesn't handle go to the planner (`plannerClick`).
5. Plan page (views/plan.ts) — done. Still in the planner: regular item / goal / emergency forms, marking paid
   (markPaid, undo, missed), Move / Put aside, market holidays; goals are created from the profile by the planner.
   AMOUNTS_VERSION is paise-6 (goal school/ug/pg/spend are money): the owner re-imports once, at the end.
6. Overview (views/home.ts) — done. Pay/Move/Set aside/Invest buttons, Change account and the Advisor still
   open in the planner.
7. Insights (views/insights.ts) — done. Fixed: the Year › Reserve tab crashed for a year with no months yet.
   Year in review, month-item sheet, category limits form still open in the planner.
8. Advisor (views/advisor.ts) — done; asks Claude via askClaude itself. The monthly check-up still also runs
   automatically from the planner (render hook) until the frame goes.
9. 9. Money settings (more).
10. Remove the frame; switch-over (import button goes, old app read-only for a month).

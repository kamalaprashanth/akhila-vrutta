# The shell (Calm redesign, approved 26 Nov 2026)

- **Side menu** (`#drawer`): every section; the open one lists its own pages under it (Money: Overview,
  Activity, Plan, Accounts, then Insights, Advisor, Money settings; Home: Due, Appliances, Vehicles, Lists).
  Today shows how many things today still needs. On a phone it opens from ☰ or a swipe in from the left edge,
  and closes on a tap outside, Escape, Android Back, or opening a page. From 900 px wide it's always open.
- **Section tabs** (`#nav`): the open section's own tabs at the bottom of a phone (a module's `subs()`; the open
  one from `sub()`). Sections without tabs have no bottom bar.
- **Today** (`app/modules/today`): what's due today and in the next 7 days from every section (bills and EMIs,
  medicines and check-ups, habits, home jobs, warranties, vehicle renewals, papers). Medicines and daily habits
  are ticked in place.
- **Logo**: a six-petal lotus, one petal per part of the app (`app/core/logo.ts`); with icons where it's big (the
  unlock screen), plain where it's small (side menu, app icons). `node scripts/icons.mjs` remakes the web icons
  from `static/icons/logo.svg`; the Android icon and splash are made from the same file in CI.
- Tests: `tests/e2e/shellflow.mjs`; every page at seven widths in `tests/e2e/layout.mjs`.

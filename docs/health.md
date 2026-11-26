# Health

Designed with the owner on 26 Nov 2026. For each person in People (shared with Documents; "me" marks whose habits
they are). Not medical advice: the ranges are the usual adult ones, as a guide.

- Readings (`hlReadings`): weight (BMI from a height in `hlProfiles`), blood pressure, fasting and after-meal sugar,
  resting heart rate, SpO2, temperature, waist. Tiles with the latest value, its status, 30-day change and a small
  chart; a kind's sheet has the history.
- Lab reports (`hlLabs`): the PDF or photos in the vault; values read by Claude (the PDF's text, read on the device
  with pdf.js, goes through askClaude with `LAB_PROMPT`; JSON back, checked by `parseLabJson`; the person checks and
  corrects every value) or typed. Each value is flagged against its range and compared with the last report's.
  Scans and photos have no text: typed values.
- Medicines and supplements (`hlMeds`, `hlMedLog`): times, days, stock; today's doses ticked (stock goes down),
  "running low" at a week's worth. Reminders at each time say how many medicines are due and for whom, never which.
- Check-ups (`hlCheckups`): repeating every N months, Mark done moves the next due on; reminders a week before and
  on the day, no test names. Doctor visits (`hlVisits`) with prescriptions as files and the fee offered to Money.
- Habits: amount habits (steps, water) show as tiles for "me"; a weight reading ticks a check habit named "Weigh…".

Tests: `tests/unit/health.test.ts`, `tests/e2e/hlflow.mjs` (Claude stood in), the cloud step. Not tested by CI: the
real Claude reading a real report, reminders arriving on a phone.

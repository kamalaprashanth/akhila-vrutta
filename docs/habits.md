# Habits

Its own tab (`app/modules/habits/`), drawn with Money's look. Agreed with the owner on 25 Nov 2026.

## Kinds
- **Done / not done**: tick it; optionally only on chosen weekdays (other days are skipped, not missed).
- **Amount**: − / + towards a daily target (8 glasses); done when the target is reached.
- **Times a week**: tick on any days; the week is met at the target.
- **Avoid**: every day is clean unless marked **Slipped**; the streak is days since the last slip.
- **A set number of days** (on done / amount habits): every day until it has been done that many days. A missed
  day moves the finish on by a day. When reached: "What next?" offers **Carry on daily** (it becomes an everyday
  habit, its days so far its streak) or **Finish** (kept under Stopped or finished).

## Data (`data.ts`, encrypted like everything else)
- `habits`: name, icon, kind, target/unit, days (0 = Monday), start, goal, completed, stopped, order.
- `habitLog`: `<habit>_<day>` → `v` (1 done, the amount, or 1 = slipped for avoid). No record: not done / clean.
- `habitPrefs/prefs`: `nudge` "HH:MM" ("" = off; 21:00 when not set).

## Counting
- Streaks: days in a row over the days it's asked for; today not ticked yet doesn't break it. Weekly: weeks in a row.
- Week score (Monday to Sunday): done ÷ asked for, today left out until done; a weekly habit is asked its target
  spread over the days gone (so midweek isn't counted against it), extra times don't pass 100%.
- Ticking: any day of this week or last week from today's list; older days from the habit's 6-month calendar.

## Evening nudge (`habitNotes`, via `app/core/reminders.ts`)
One phone notification at the chosen time for each of the next 7 days, only when something is left that day:
"2 habits left for today". Never names the habits. Avoid habits need nothing; weekly ones only when the rest of the
week needs every day.

## Tests
`tests/unit/habits.test.ts` (streaks, set number of days, score, nudge), `tests/e2e/hbflow.mjs` (phone and
laptop on a fixed day), and the cloud step (habit and tick stored as ciphertext, kept through a re-import and reload).
Not tested by CI: the nudge arriving on a real phone.

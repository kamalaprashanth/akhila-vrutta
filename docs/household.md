# Household

For each home (Money's properties, plus homes added here such as the one you live in):

- **Due**: maintenance jobs that repeat (every 1–24 months), warranties and AMCs ending within 60 days, and
  to-dos with a date, grouped Overdue / This month / Coming up. A home without jobs offers the usual ones
  (AC service, RO filter, pest control, tank cleaning, chimney, fire extinguisher).
- **Mark done**: date, cost, note; the next due date moves on from that day. With a cost, "Add to Money as
  an expense" (ticked by default) writes the expense, category Maintenance-like by default.
- **Appliances**: model, bought, price, warranty and AMC end, service centre, service history, and files.
- **Lists**: To do and Groceries, optionally per home.

## Data (encrypted store, like Money)
`hhHomes`, `hhJobs`, `hhDone`, `hhAppliances`, `hhItems`; amounts in paise. A Money import never touches
them (`Store.replaceAll` only replaces the money collections and meta).

## Files: the vault (`app/core/files.ts`)
Each file is encrypted on the device with the data key (AES-GCM, bound to its id), then uploaded to an
"Akhila Vrutta" folder in the signed-in account's Google Drive as `<id>.avf`. Drive never sees the name or
type; those are in the encrypted `files` record. The app asks Drive only for `drive.file` (files it made).
Web: Google's consent popup through Firebase; Android: Android's own consent screen (`AkhilaNative.googleAccess`).

Taking a copy out: an open file can be saved or shared. The app says every time that the copy won't be
encrypted (the owner's choice). Android: `AkhilaNative.saveFile` writes to Downloads/Akhila Vrutta through
MediaStore (Android 10+, no storage permission); `AkhilaNative.shareFile` puts the copy in the app's cache
(`cache/share`, cleared at the next share and on start) and opens Android's share sheet via the FileProvider.
Web: Download saves through the browser; Share uses the browser's share sheet where it can share files.

## Phone reminders (`householdNotes`, via `app/core/reminders.ts`)
Jobs and dated to-dos at 9 AM the day before and on the day; warranty and AMC 30 days before. Names only.

## Tests
`tests/unit/household.test.ts`, `tests/e2e/hhflow.mjs` (with an in-memory Drive that only sees ciphertext),
and a cloud step (records encrypted, kept through a Money re-import and a reload).
The Android emulator test saves a file to Downloads/Akhila Vrutta and opens the share sheet.
Not tested by CI: real Google Drive, the consent screens, the phone camera, actually sending a file to another app.

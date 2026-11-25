# Backup and restore

Agreed with the owner on 25 Nov 2026. Settings › Backup (`app/modules/backupcard.ts`, `app/core/backup.ts`).

- One `.avb` file with every record (Money, Household, Habits, the list of vault files), sealed with the data key
  (AES-GCM, aad "backup", compressed). It carries the data key wrapped by the passphrase, as the cloud keeps it,
  so it opens with the passphrase it was made with and needs none to be made. The vault files themselves stay
  in Drive (the owner chose records only).
- Download a backup now: Downloads/Akhila Vrutta on the phone, the browser's downloads elsewhere.
- Weekly to Google Drive ("Akhila Vrutta/Backups", the last 8 kept), the first time the app opens on or after
  Sunday, 20 s after unlocking. On the phone it runs by itself; the website can't open Google's permission window
  without a tap, so there it happens with Back up to Drive now. On by default; the switch is kept in `backupLog`.
- Restore: from a file or from Drive; the passphrase it was made with; what's inside is shown; a backup of the
  current data is downloaded first; then the cloud is made to match the backup (`replaceAll` over every backed-up
  collection). If the backup was made with a different data key, the vault-file records are left out (their files
  wouldn't open).
- `backupLog` (when each backup was made; the weekly switch) is synced but not itself backed up.

Tests: `tests/unit/backup.test.ts`, `tests/e2e/bkflow.mjs` (in-memory Drive). Not tested by CI: real Drive.

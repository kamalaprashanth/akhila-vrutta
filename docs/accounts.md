# Accounts (open to everyone since 26 Nov 2026)

- Anyone signed in with Google may create their own home (`firestore.rules`: `allowed()` is any signed-in
  account). A home is readable only by its members; nobody can read another account's home, key or records.
- First run: a welcome (what the app is, privacy, Terms and Privacy policy links, Continue with Google), then a
  passphrase, then the Secret Key: the Emergency Kit must be downloaded and the key's last 4 characters typed
  before going on (can't be skipped), then how the device unlocks.
- Settings › Account: first name only (never the e-mail), the user ID (copy, to ask the owner for Claude),
  Delete my account and data: the app deletes the encrypted files and backups in the person's Drive, then
  `deleteAccount` deletes every home they own (all records), their membership elsewhere, their account records
  and their sign-in. Google Play requires this.
- Settings › Admin (only the owner, OWNER_UID): accounts, active this week (from `seen/{uid}`, written by
  aiStatus at each unlock), Claude questions today; Claude access by user ID with a name only the owner sees
  (`adminAiList`, `adminAiSet` → `aiAccess/{uid}`). Counts only, never data.
- The owner's US ticker list (`priceWatch`) stays owner-only: the daily price job has a small free quota.
- `static/privacy.html` (/privacy) and `static/terms.html` (/terms) are linked from the welcome screen. They
  need the support e-mail filled in before the Play listing.
- App Check: Settings › Admin shows whether this device's calls carry a valid App Check token. Enforcing:
  Cloud Firestore through the "App Check" workflow (Actions › App Check › Run workflow › ENFORCED; UNENFORCED
  undoes it), the functions (askClaude, admin) with APP_CHECK=enforce in functions/.env.akhila-vrutta.
  aiStatus and deleteAccount are never refused for App Check (account deletion must always work).
- Not done yet: per-account storage limits.

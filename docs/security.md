# Security

What protects the data, and what was decided (25 Nov 2026, with the owner).

## In place
- End-to-end encryption: AES-256-GCM with a data key; the key wrapped by the passphrase (PBKDF2-SHA256, 600,000
  rounds). Firestore and Drive hold only ciphertext; the rules refuse anything else (`firestore.rules`).
- Only listed accounts may use the project (`allowed()` in the rules); the Claude function checks the owner.
- Web headers: strict CSP, X-Frame-Options, HSTS, nosniff, Referrer-Policy, Permissions-Policy (`firebase.json`).
- The site and the Android app carry their own copy of the Firebase SDK (`scripts/firebase-sdk.mjs`), so the page
  loads no script from Google's CDN; the CSP's script-src allows only the site and Google sign-in.
- Passphrase strength meter when choosing or changing it (`app/core/strength.ts`); weak ones are refused.
- After 5 wrong passphrases on a device: a wait (30 s, doubling to an hour) (`app/core/attempts.ts`). This slows
  guessing through the app only; offline guessing is slowed by the rounds and the passphrase's strength.
- Android: release WebView not debuggable, backups off, fingerprint key in the Keystore (invalidated on a new
  fingerprint), FLAG_SECURE (blank in recent apps, no screenshots), FileProvider limited to the camera's Pictures
  folder and cache/share.
- No PAN, account, PRAN or folio numbers beyond the last 4; notifications name things, never amounts.

## Decided against
- Root detection and certificate pinning: little gain with end-to-end encryption; pinning breaks on Google's
  certificate rotation.
- An in-app TOTP code: the passphrase is already the second lock after Google sign-in. Instead: 2-Step
  Verification (Authenticator or a passkey) on the Google account.

## App Check (watch-only since 25 Nov 2026)
- Providers registered (`.github/workflows/appcheck-setup.yml`): reCAPTCHA Enterprise for the website (site key
  made by the owner, domains kp-akhila-vrutta.web.app and .firebaseapp.com), Play Integrity for the Android app
  (Cloud project linked in Play Console by the owner).
- Website: `initializeAppCheck` with ReCaptchaEnterpriseProvider (APP_CHECK_SITE_KEY at build). Android: a
  CustomProvider asking our plugin (`AkhilaNative.appCheckToken`, Firebase App Check + Play Integrity natively,
  with the Android app's id and key read from Firebase in CI, never committed). Failures are only logged.
- Next: after a few days, look at the verified/unverified counts, then enforce on Firestore and the Claude
  function (`enforceAppCheck`). The GitHub APK won't pass Play Integrity: installs are from Play only from then on.

## Next
- A professional penetration test once the app holds documents.

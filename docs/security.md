# Security

What protects the data, and what was decided (25 Nov 2026, with the owner).

## In place
- End-to-end encryption: AES-256-GCM with a data key; the key wrapped by the passphrase, derived with Argon2id
  (128 MB, 3 passes, 1 lane, 16-byte salt, 32-byte key; about a second on a phone). Older PBKDF2-SHA256 locks
  (600,000 rounds) still open and are re-wrapped with Argon2id at the next passphrase unlock; backups carry their
  lock, so old ones keep opening. Argon2id is hash-wasm 4.13.0 (MIT), vendored in `app/vendor/hash-wasm` and built
  from its C source with clang 18 (`scripts/build-hash-wasm.sh`), checked against the published test vectors.
  The CSP allows WebAssembly ('wasm-unsafe-eval') for it. Firestore and Drive hold only ciphertext; the rules
  refuse anything else (`firestore.rules`, including the shape of the passphrase lock).
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

## Secret Key (owner's design, 25 Nov 2026)
- 128 random bits made on the device, written as `A1-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXX` (Crockford base32, 2 check
  characters catch typos). With it on, the passphrase key and the Secret Key are mixed with HKDF-SHA256 (salted with
  the wrap's salt) before opening the data key: the cloud's wrap (`sk: 1`) opens with neither alone.
- Each device keeps a copy (IndexedDB) after it's typed once; fingerprint and "stay unlocked" don't need it. A new
  device, a device that hasn't seen it, restoring a backup made with it on, changing the passphrase or turning it
  off there: the Secret Key is asked for (typed, or scanned from the kit's QR where the browser can read QR codes).
- Emergency Kit: a one-page PDF made on the device (`app/core/kit.ts`, QR by qrcode-generator, MIT, vendored).
- Settings › Secret Key: turn on (key shown, kit, confirm the last 4, passphrase), download the kit again, turn off.
- Backups made before it was turned on still open with the passphrase alone.

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
- Parked by the owner: an Authenticator (TOTP) or passkey check before a new device may read the data.

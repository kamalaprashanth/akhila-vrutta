# The Android app

The same site, packed into an Android app with Capacitor (`mobile/`). It ships no npm package at run time:
the web code calls the native side through `window.Capacitor` (`app/core/native.ts`).

## What the phone adds
- **Google sign-in** through Android's account picker (Credential Manager), since Google blocks its sign-in
  page inside apps. The ID token becomes a Firebase sign-in with the web SDK. Client: `mobile/google-client.json`
  (the project's web OAuth client; public).
- **Fingerprint unlock**: a 32-byte secret, encrypted under an Android Keystore key that only a strong
  fingerprint opens (never the phone's PIN) and that Android deletes when a fingerprint is added. It wraps the
  data key exactly as the WebAuthn secret does on the web. A deleted key: the app asks for the passphrase, then
  offers fingerprint again. Plugin: `mobile/android/app/src/main/java/in/kp/akhilavrutta/AkhilaNativePlugin.java`.
- **Bill reminders** (`app/modules/money/ui/phone.ts`): 9 AM the day before and on the due day, for bills,
  card dues, EMIs and SIPs, names only (no amounts), the next 45 days, rescheduled after every change.
- **Back**: closes an open sheet, then goes back a page; at Overview, twice within 2 seconds closes the app.
- **Auto-lock** after a minute away (choosing a file also leaves the app briefly).
- **Offline start**: the app carries the pinned Firebase SDK in `/firebase` (`mobile/prepare.mjs`).

## Build and release (CI, `.github/workflows/ci.yml`, job `android`)
1. The site built with `AV_MOBILE=1` (config gets `sdkBase` and `googleClientId`).
2. `mobile/prepare.mjs` copies it into `mobile/www`, adds the SDK, draws the icon and splash from the logo
   (`@capacitor/assets`).
3. A test app (Money test page, made-up data) and the app are built and run on an emulator (`tests/android`).
4. On `main`: the release key from Secret Manager (`android-keystore`) signs the APK, which is attached to a
   GitHub release `android-1.<run>`. Open the release on the phone and tap the `.apk` to install or update.

The key was made once by `.github/workflows/android-setup.yml` (run by pushing to the `android-setup` branch),
which also registered the Android app and the key's SHA-1/SHA-256 with Firebase. Lose the key and the app can
only be reinstalled, not updated.

## Not tested by CI
A real fingerprint, real Google sign-in, notifications actually appearing, and anything on the real phone.

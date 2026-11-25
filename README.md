# Akhila Vrutta

One private app for money, household, health and documents. Built for one person first, family later.
Live at **https://kp-akhila-vrutta.web.app** (Firebase project `akhila-vrutta`).

## Layout

| Path | What it holds |
|---|---|
| `app/main.ts` | The shell: header, tab bar, routing (`#/money`) |
| `app/core/` | Shared code: money in paise, DOM helpers, Firebase |
| `app/modules/` | One folder per area; each exports a `Module` |
| `static/` | `index.html`, manifest, icons; copied as-is |
| `mobile/` | The Android app (Capacitor): see `docs/android.md` |
| `scripts/build.mjs` | esbuild bundle into `dist/`, writes `dist/config.js` |
| `tests/unit/` | `node:test` tests, run with native TypeScript |
| `tests/e2e/` | Playwright smoke test over `dist/` |
| `firestore.rules` | Deny-all until Milestone 3 |

## Commands

```sh
npm install
npm run check        # typecheck, unit tests, build, e2e
npm run build        # dist/ only
```

A local build has no Firebase config, so sign-in is switched off. In CI the
`FIREBASE_WEB_CONFIG` repository variable supplies it.

## Tests

| What | Where | Runs |
|---|---|---|
| Types, unit tests (crypto, import, paise) | `tests/unit` | every push |
| Every tab renders, phone and laptop | `tests/e2e` | every push |
| Cloud: sign-in, passphrase, import, encrypted saving, reload, second device, sync, passphrase change, fingerprint, another account refused, database rules | `tests/cloud` on Firebase emulators | every push |
| Money pages identical to KP Money Planner on a real export | `tests/parity` | locally, with `AV_EXPORT` and `OLD_APP` |
| Files, types, headers, real CSP, lock screen, the old planner not served, on a deployed address | `tests/live` | preview and live, on `main` |
| Android app on an emulator: native plugins, pages, bill reminders, Back, auto-lock, sign-in screen with its own Firebase | `tests/android` | every push |

## Deploys

Pushes to `main` release themselves (`.github/workflows/ci.yml`):
checks → deploy to a preview channel → `tests/live` on the preview → database rules → that exact build
cloned to live → `tests/live` on live → automatic rollback to the previous version if that fails.
Each release also rehearses the rollback on a throwaway preview. On `main` the Android app is also signed
(key in Secret Manager) and attached to a GitHub release for installing on the phone. Screenshots from every stage are kept
as run artifacts.

## Rules that don't bend

- Money is stored in paise (integers). Never floats.
- Everything personal is end-to-end encrypted before it leaves the phone.
- Never store PAN, full account numbers, PRAN or folio numbers. Last 4 digits only.
- No secrets in the repo; API keys live in Secret Manager.

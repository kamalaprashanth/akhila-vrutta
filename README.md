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

## Deploys

Every push to `main` runs `.github/workflows/ci.yml`: checks, then deploys Hosting
(site `kp-akhila-vrutta`) and the Firestore rules using the `FIREBASE_SERVICE_ACCOUNT` secret.
Pull requests run the checks only.

## Rules that don't bend

- Money is stored in paise (integers). Never floats.
- Everything personal is end-to-end encrypted before it leaves the phone.
- Never store PAN, full account numbers, PRAN or folio numbers. Last 4 digits only.
- No secrets in the repo; API keys live in Secret Manager.

# Browser smoke test

Requires the API on :4000 (seeded with `npm run seed --prefix backend`), the frontend on :5173
(`npm run dev`), and a headless Chromium. This script uses `@sparticuz/chromium` and `puppeteer-core`,
which are not project dependencies. Install them in a scratch folder and run:
`node e2e/browser-smoke.cjs` from a folder where those packages resolve.

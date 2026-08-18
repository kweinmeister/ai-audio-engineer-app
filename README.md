<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/72976900-81e8-415e-83e0-3976ea72eb09

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Quality Checks

The same checks run in CI on every push and pull request.

| Command | What it does |
| --- | --- |
| `npm run lint` | Lint and format check with [Biome](https://biomejs.dev) |
| `npm run format` | Apply Biome's safe fixes and formatting |
| `npm run typecheck` | Type check with `tsc --noEmit` |
| `npm test` | Run the [Vitest](https://vitest.dev) unit tests |
| `npm run test:watch` | Run the unit tests in watch mode |
| `npm run build` | Build the client bundle and the server bundle |

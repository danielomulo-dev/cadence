# Cadence — Campaign Content Studio

Define a client brief, pick an engine (OpenAI / Gemini / Claude-via-proxy), and Cadence drafts a
full month of platform-tailored social content: a campaign theme, content pillars, and a
calendar of ready-to-publish posts. Built with React + Vite. State persists in your browser
(localStorage), with a saveable campaign library.

---

## 1. Run it locally

You need Node.js 18+ installed.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

To preview a production build:

```bash
npm run build
npm run preview
```

---

## 2. Deploy to GitHub Pages

This repo ships with a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds and
deploys automatically on every push to `main`.

### One-time setup

1. **Set the base path.** Pages serves a project repo at `https://<user>.github.io/<repo>/`.
   Open `vite.config.js` and make `base` match your repo name:

   ```js
   base: "/cadence/",   // for a repo named "cadence"
   ```

   If you deploy to a user/org root site (`https://<user>.github.io/`), use `base: "/"`.

2. **Push the repo:**

   ```bash
   git init
   git add .
   git commit -m "Cadence: campaign content studio"
   git branch -M main
   git remote add origin https://github.com/danielomulo-dev/cadence.git
   git push -u origin main
   ```

3. **Turn on Pages:** in the repo on GitHub go to **Settings → Pages → Build and deployment**,
   and set **Source = GitHub Actions**.

That's it. The workflow runs on push; when it finishes, your site is live at
`https://danielomulo-dev.github.io/cadence/`. Subsequent pushes redeploy automatically.

---

## 3. Engines & API keys

Pick the engine in the **Engine** panel (top of the sidebar).

| Engine  | Works client-side? | What you need |
|---------|--------------------|---------------|
| Gemini  | ✅ Yes              | A Google AI Studio API key |
| OpenAI  | ✅ Usually          | An OpenAI API key (browser calls normally allowed; some orgs restrict via CORS) |
| Claude  | ⚠️ Needs a proxy    | A URL to your own endpoint that forwards to the Anthropic API |

**Why Claude needs a proxy:** browsers cannot call `api.anthropic.com` directly (CORS). Stand up
a tiny proxy (Cloudflare Worker, Vercel/Netlify function) that accepts the same JSON body Cadence
sends, attaches your `x-api-key` server-side, forwards to `https://api.anthropic.com/v1/messages`,
and returns the Anthropic response unchanged. Paste that endpoint's URL into the **Claude Proxy URL**
field. The same proxy pattern is the recommended setup for OpenAI too once this is client-facing —
keep keys server-side.

Use **Test connection** to verify a key/model before generating.

---

## 4. Persistence

- **Auto-save:** your brief, engine choice, models, and the current generated month are saved to
  `localStorage` continuously — refresh the tab and everything is still there.
- **Campaign library:** hit **Save** in the header to snapshot the current campaign under a name.
  Open **Library** to load or delete saved campaigns, or start a fresh one.
- **API keys** are saved only if you tick **"Remember key on this device"** (off by default).
  When off, keys live in memory and clear on refresh. localStorage is readable by any script on
  the page, so only enable it on a device you trust.

Everything lives under one localStorage key: `cadence:v1`. Clearing site data resets the app.

---

## 5. Project structure

```
cadence/
├─ index.html
├─ package.json
├─ vite.config.js          # set `base` here for GitHub Pages
├─ .github/workflows/
│  └─ deploy.yml           # auto build + deploy to Pages
└─ src/
   ├─ main.jsx             # React entry
   ├─ index.css            # global reset
   ├─ storage.js           # localStorage helpers
   └─ App.jsx              # the whole app (UI, engines, generation)
```

The provider logic is cleanly split in `App.jsx` — `callModel()` routes to `callOpenAI`,
`callGemini`, or `callAnthropic`. To point any of them at a backend proxy, just change the
`fetch` target in that one function.

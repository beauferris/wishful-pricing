# Host the app home page (for App Store review)

Shopify reviewers open your app from **Apps** in the admin. `application_url` in `shopify.app.wishful-pricing-2.toml` must be a **real HTTPS page** — not `https://shopify.dev/apps/default-app-home`.

This app is **extension-only** (discount function + admin UI + theme block). You do not need a React server. A static HTML page is enough.

---

## What you’re hosting

| File | Purpose |
|------|---------|
| `web/app-home/index.html` | Post-install / app-home instructions for merchants and reviewers |

Before submit, replace the **Support** paragraph in that file with your real support email.

Optional: host `docs/PRIVACY-POLICY.md` as a second static page (or separate URL) for the listing.

---

## Option A — Cloudflare Pages (recommended)

**Time:** ~10 minutes · **Cost:** free

1. Push this repo to GitHub (if not already).
2. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select the repo.
4. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `web/app-home`
5. Deploy. Note the URL, e.g. `https://wishful-pricing.pages.dev/`.
6. Update `shopify.app.wishful-pricing-2.toml`:

   ```toml
   application_url = "https://wishful-pricing.pages.dev/"
   ```

7. Partners → **Apps** → **Wishful Pricing 2** → **App setup** → **URLs**:
   - **App URL** = same as `application_url`
   - **Allowed redirection URL(s)** — leave empty unless you add OAuth later
8. From project root: `npm run deploy`

**Custom domain (optional):** Pages → your project → **Custom domains** → e.g. `apps.yourdomain.com`.

---

## Option B — Netlify

1. [Netlify](https://app.netlify.com) → **Add new site** → **Import from Git**.
2. **Publish directory:** `web/app-home`
3. Deploy → copy URL → set `application_url` → `npm run deploy`.

---

## Option C — GitHub Pages

1. Create branch `gh-pages` or use **Settings → Pages** with folder `/web/app-home` (may require moving files or a small workflow).
2. URL will be `https://<user>.github.io/<repo>/` — set that as `application_url`.

Slightly more setup than Cloudflare Pages for a monorepo; use if you already host other docs on GitHub Pages.

---

## Option D — Manual upload (no Git)

1. Cloudflare Pages → **Upload assets** → drag the `web/app-home/` folder.
2. Use the generated `*.pages.dev` URL as `application_url`.

Good for a one-off before you connect CI.

---

## Verify before submit

- [ ] Open `application_url` in an incognito window — page loads, no 404
- [ ] Page explains **Discounts → Wishful pricing card** (not a fake admin embed)
- [ ] Page explains **theme app block** setup
- [ ] Support email is real
- [ ] `npm run deploy` completed after changing `application_url`
- [ ] In admin **Apps → Wishful Pricing 2** — opens your hosted page (not Shopify dev placeholder)

---

## Privacy policy (separate URL)

Host `docs/PRIVACY-POLICY.md` the same way (second Pages project, or `/privacy/` path):

1. Fill in `[DATE]` and `[YOUR EMAIL]`.
2. Remove outdated references (e.g. uploaded artwork — not used).
3. Add the HTTPS URL to Partners → **App Store listing → Privacy policy URL**.

Example layout on Cloudflare Pages with two folders:

```
web/
  app-home/index.html      → https://wishful-pricing.pages.dev/
  privacy/index.html       → https://wishful-pricing.pages.dev/privacy/
```

Convert the markdown to HTML once, or paste rendered HTML into `web/privacy/index.html`.

---

## Extension-only apps — what you do *not* need

- Embedded React admin (discount settings UI is already an admin extension)
- OAuth redirect URLs (empty `redirect_urls` is fine for this app today)
- A backend server for pricing logic (Shopify Functions + metafields)

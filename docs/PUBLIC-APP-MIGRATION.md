# Migrate Wishful Pricing to a public (unlisted) app

Non-Plus stores cannot use **custom** distribution or store **Develop apps** with Shopify Functions. This guide moves the same codebase to a **new public** Partner app (unlisted after review).

The old custom app config is backed up in `shopify.app.custom.toml`.

---

## Phase 1 — Create the public app (Partners Dashboard)

1. Open [partners.shopify.com](https://partners.shopify.com) → **Apps** → **Create app**.
2. Choose **Create app manually** (or **Start from Dev Dashboard**).
3. When asked for distribution, select **Public** — not Custom.
4. App name: **Wishful Pricing** (or **Wishful Pricing 2** if the name is taken).
5. Do **not** create a separate app under the merchant’s **Settings → Develop apps**.

You cannot convert the existing custom app to public; this must be a **new** app record.

---

## Phase 2 — Link this repo to the new app

In the project root:

```bash
npm run link-public
```

Select the **new public** app. CLI updates `client_id` in `shopify.app.toml`.

Optional — link by Client ID from Partners → **App setup**:

```bash
PATH="$HOME/.local/node-v22/bin:$PATH" shopify app config link --client-id=YOUR_NEW_CLIENT_ID
```

---

## Phase 3 — First deploy to the new app

Extension `uid` values in `extensions/*/shopify.extension.toml` belong to the **old** app. Reset them once:

1. In `extensions/discount-function/shopify.extension.toml`, remove the line `uid = "..."`.
2. In `extensions/wishful-vinyl-settings/shopify.extension.toml`, remove the line `uid = "..."`.
3. Deploy:

```bash
npm run deploy
```

CLI will assign new `uid` values. Commit those lines after deploy.

---

## Phase 4 — Test on a dev store

```bash
npm run dev
```

Pick a **development store** (not Plus required). Then:

1. **Discounts** → create an automatic discount using **Wishful** / your function.
2. Open the discount → configure pricing → **Save pricing**.
3. Confirm checkout applies the discount on a test cart.

---

## Phase 5 — App Store listing (for review)

In Partners → new app → **App Store listing** (see `docs/APP-LISTING.md` for copy).

Minimum:

| Field | Suggestion |
|-------|------------|
| Privacy policy URL | Host `docs/PRIVACY-POLICY.md` on your site (see file) |
| Support email | Your business email |
| App icon | 1200×1200 PNG |
| Category | **Discounts** |
| Pricing | Free (no Billing API charges unless you add them later) |

Describe that merchants configure pricing under **Discounts** when editing a Wishful discount — there is no separate app menu required.

Submit for **App Store review**.

After approval: **Distribution** → set visibility to **Limited** (unlisted). Share the install link only with clients.

---

## Phase 6 — Each merchant store

On every **non-Plus** production store:

1. Uninstall the old **custom** Wishful app (if installed).
2. Uninstall any **Develop apps** copy on that store.
3. Install the **new public** app (install link from Partners).
4. Recreate discounts (or re-save) and run **Save pricing**.
5. **Theme editor** → Product template → add **Wishful pricing** app block (see `docs/APPROVAL-CHECKLIST.md`).

---

## Keep using the old custom app?

`shopify.app.custom.toml` keeps the old `client_id` for reference only.

- **Plus** merchants or **dev stores** can stay on the custom app until you migrate them.
- **Non-Plus** production stores need the **public** app.

Deploy to the old app only if you temporarily restore `client_id` in `shopify.app.toml` from `shopify.app.custom.toml` (not recommended long term).

---

## If review fails on “app homepage after install”

`application_url` is set to Shopify’s default App Home for extension-only apps. If automated checks fail:

1. Host a simple HTTPS page (e.g. Cloudflare Pages) with `web/app-home/index.html` from this repo.
2. Set `application_url` in `shopify.app.toml` to that URL.
3. Redeploy and resubmit.

---

## Checklist

- [ ] New **public** app created in Partners
- [ ] `npm run link-public` completed
- [ ] `uid` lines removed, `npm run deploy` succeeded
- [ ] Tested discount on dev store
- [ ] Privacy policy URL live
- [ ] Listing submitted
- [ ] **Limited** visibility after approval
- [ ] Merchant stores reinstalled (public app only)

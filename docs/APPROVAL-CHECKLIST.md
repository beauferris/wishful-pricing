# App Store approval checklist (Wishful Pricing 2)

Map each Partners **Distribution** item to what this repo provides and what you must do before submit.

## Before you submit

- [ ] `npm run deploy` — includes **discount function**, **discount settings UI**, and **theme app extension**
- [ ] Privacy policy URL live (`docs/PRIVACY-POLICY.md` hosted on HTTPS)
- [ ] `application_url` in `shopify.app.wishful-pricing-2.toml` points to your hosted app home (see `docs/HOST-APP-HOME.md`)
- [ ] App Store listing filled (`docs/APP-LISTING.md`)
- [ ] Screencast: create discount → configure → add theme block → product page → checkout

## Distribution criteria (from Partners dashboard)

### Technical — performance

| Requirement | Status | Notes |
|-------------|--------|--------|
| Core Web Vitals (CLS, INP) | **Merchant / theme** | Measured on the **storefront** after the app block is added. Keep the block in one product section; avoid duplicate blocks. Scripts run only on configured products (catalog gate). |
| Minimizes storefront load | **OK** | No global app embed required; block is opt-in in theme editor. |

**Reviewer tip:** Test on Dawn with a single **Wishful pricing** app block on the product template.

### Design and functionality

| Requirement | Status | Notes |
|-------------|--------|--------|
| Embedded in Shopify admin | **OK** | Configuration runs in **Discounts → [automatic discount] → Wishful settings** (Admin UI extension). No separate login. |
| Theme app extensions (not Asset API) | **OK** | `extensions/wishful-pricing-storefront` — merchants add **Wishful pricing** app block. This app does **not** use the Asset API. |
| Well-integrated | **OK** | Primary workflow: Discounts + theme editor. App home explains setup. |
| Shopify design guidelines | **OK** | Admin UI uses Shopify UI extension components (`s-*`). |
| Doesn't use Asset API | **OK** | Merchants use the **Wishful pricing** theme app block only. Legacy `theme/` snippet copies were removed from the repo. |

### Category — Discount

| Requirement | Status | Notes |
|-------------|--------|--------|
| Discount Function API | **OK** | `extensions/discount-function` — product discounts via `cart.lines.discounts.generate.run` |
| Discount settings UI | **OK** | `extensions/wishful-vinyl-settings` — `admin.discount-details.function-settings.render` |
| Opt-in products | **OK** | Empty `productIds` = no discount / no storefront UI |
| Checkout matches preview | **OK** | Same pricing logic in function + metafield sync |

### Merchant utility (Built for Shopify — **after** launch)

50 installs, 5 reviews, 4+ stars — not required for initial approval.

## Reviewer demo script (copy into listing)

1. Install **Wishful Pricing 2** on the review store.
2. Open app home (optional) — read setup steps.
3. **Discounts** → **Create discount** → **Automatic** → select **Wishful** product discount.
4. Open the discount → Wishful card → add a product → set tiers → **Save pricing**.
5. **Online Store → Themes → Customize** → **Product** template → main product section → **Add block** → **Wishful pricing** (under Apps).
6. Open that product → enter size/qty → verify live price → add to cart → checkout shows matching discount.
7. **Refresh storefront** after removing products or deleting a discount.

## If rejected

| Common reason | Fix |
|---------------|-----|
| App home / post-install | Host `web/app-home/index.html`; set `application_url`; redeploy |
| Theme / Asset API | Point listing + screencast to **theme app block**, not manual snippets |
| Privacy | Public HTTPS privacy URL |
| Discount unclear | Screencast must show checkout total change |

## After approval

Partners → **Distribution** → set visibility to **Limited** (unlisted) and share the install link with clients (`docs/PUBLIC-APP-MIGRATION.md`).

# Vinyl pricing — why checkout might show no discount

## 1. Product page price does not change from the discount function

**Discount functions only run at checkout** (and sometimes in cart). They do **not** update the price shown on the product page.

- Use the **Wishful pricing** theme app block on the product template (see `docs/THEME-BLOCK-SETUP.md`).
- Click **Save pricing** in the discount admin (with products selected) to sync rates to each product’s metafield; the theme reads `product.metafields.app.pricing_config` automatically.
- Tag `wishful-volume` still selects volume-only UI if the metafield is missing.

## 2. Variant price must be HIGHER than the table total

The function applies a **discount** (money off). It cannot **increase** price.

| Your setup | Table price (4×2, qty 1) | Result |
|------------|--------------------------|--------|
| Variant price **$0.20** | **$1.60** (8 × $0.20/sq in) | No discount — target is *higher* than cart |
| Variant price **$100.00** | **$1.60** | **$98.40 off** at checkout ✓ |

**Fix:** Set the vinyl variant to a high **anchor price** (e.g. **$100** or **$500**), or use compare-at price + theme copy like “Price calculated at checkout”.

The $0.20 on the product is the **per sq in rate** from your sheet, not the line total. Shopify still needs a catalog unit price to discount *from*.

## 3. Test in the right place

1. Add to cart with width **4**, height **2**, quantity **1** or **25**.
2. Open **checkout** (not only the product page).
3. Look for **Sticker Pricing** (or your discount title) on the line.

Cart drawer may not show automatic discounts until checkout depending on theme.

## 4. Line item property keys

The function reads these keys on the cart line:

- `width`
- `height`
- `individually_cut` (optional)
- `square_inches` (optional, instead of width×height)

Theme inputs must use:

```html
<input name="properties[width]" ...>
<input name="properties[height]" ...>
```

**Not** `properties[Width (inches)]` unless you only rely on the fallback aliases (we added some, but `width` / `height` is reliable).

## 5. Discount settings in admin

- Discount type: **Product** class enabled (the settings UI enables this on save).
- Discount is **active** and not limited to wrong segments.
- You are logged in as a **B2B** customer — account tiers apply a % off retail at storefront and checkout (tag the customer or set `wishful.account_tier` metafield).

## Example: 4×2 in, qty 25

- Area: 8 sq in → row “&lt;20”
- Qty 25 → column “25–99” → **$0.14 / sq in**
- Material: 8 × 0.14 × 25 = **$28.00**
- With anchor price $100/line → checkout shows ~$28 after discount

## 6. Volume-only products (no size)

In the discount admin, set **Pricing type** to **Volume only (per unit)**.

- Use Shopify’s discount **eligibility** (which products/collections get this discount).
- Set **quantity breaks** and **unit prices** — no width/height on the line.
- Need different rates for another product line? Create a **second discount** with its own table.

**Storefront:** add the **Wishful pricing** theme app block on the product template. Re-install the app or approve the **write products** scope so **Save pricing** can sync metafields.

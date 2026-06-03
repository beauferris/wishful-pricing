# Storefront pricing metafield (`app.pricing_config`)

## Setup model

**One discount = one pricing table** (volume *or* size × qty). Use two Shopify discounts for nametags and stickers; enable **Combinations** on both for mixed carts.

## Why products show no metafield

1. **Invalid `shopify.app.toml`** — Do not put `scopes` inside `[product.metafields.app.pricing_config]`. Scopes belong only under `[access_scopes]`. A bad line breaks validation and the definition is never created (dev preview shows: `Unsupported section(s): discount, product`).
2. **Save pricing not run** — Values are written when you click **Save pricing** in the discount app block, not when you save the discount title alone.
3. **No products chosen** — Each product group must use **Choose products**. Empty list = zero metafields written.
4. **App config not deployed** — After fixing TOML, run `shopify app deploy` (or restart `shopify app dev` until preview is ✅ without validation errors).

## Correct `shopify.app.toml`

```toml
[access_scopes]
scopes = "write_discounts,read_products,write_products"

[product.metafields.app.pricing_config]
type = "json"
name = "Wishful storefront pricing"
description = "Synced from discount admin for product-page price tables"
access.admin = "merchant_read_write"
access.storefront = "public_read"
```

Discount function config stays separate:

```toml
[discount.metafields.app.function-configuration]
type = "json"
access.storefront = "none"
```

## Merchant steps

1. Fix TOML → `shopify app deploy` → approve **write products** if prompted.
2. Open discount → **Choose products** for each group → **Save pricing** (required after deploy to fill **shop pricing catalog**).
3. Confirm green banner: “Storefront pricing synced to N product(s)”.
4. Add the **Wishful pricing** theme app block on the product template (`docs/THEME-BLOCK-SETUP.md`).
5. Product page shows the calculator only for products saved in step 2.

## Shop catalog (storefront fallback)

Save pricing also writes `shop.metafields.app.pricing_catalog` — a JSON map keyed by product id. The theme reads this when product metafields are empty in Liquid (common on older themes).

**Settings → Custom data → Shop** → look for **Wishful pricing catalog** after save.

## Verify in browser

View page source, search for `wishful-pricing-catalog`. It should include your product id and `"rates":[[8.5,8,7.5,7.25]]`. If `{}`, run **Save pricing** again after deploy.

## Theme

```liquid
{% render 'wishful-pricing', product: product, product_form_id: product_form_id %}
```

Reads (in order): `shop.metafields.wishful.pricing_catalog`, then `product.metafields.wishful.pricing_config`. The `wishful` namespace is written on Save pricing for theme Liquid compatibility.

## Verify with GraphiQL (dev)

```graphql
query ProductPricing($id: ID!) {
  product(id: $id) {
    metafield(namespace: "$app", key: "pricing_config") {
      value
    }
  }
}
```

Variables: `{ "id": "gid://shopify/Product/YOUR_ID" }`

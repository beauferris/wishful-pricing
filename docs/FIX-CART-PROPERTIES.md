# Fix: width / height not showing in cart

If cart lines do not show `width: 4` and `height: 2`, Shopify never received line item properties.

## Step 1 — Use the theme app block (required)

1. Deploy the app: `npm run deploy`
2. **Online Store → Themes → Customize → Product** template
3. In the main product section, **Add block → Apps → Wishful pricing**
4. Save and test again

The block renders width/height inputs with correct `properties[width]` / `properties[height]` names and syncs them on add-to-cart.

See `docs/THEME-BLOCK-SETUP.md` if the block does not appear.

## Step 2 — Verify in cart

Add to cart with 4 and 2. Cart line should show:

```
width: 4
height: 2
```

Optional: modifier keys from your discount admin (e.g. custom checkbox properties).

## Common mistakes

| Problem | Fix |
|---------|-----|
| **Wishful pricing** block not added | Add the app block on the product template |
| Fields **outside** `{% form 'product' %}` | Use the app block (handles form association) |
| `name="width"` instead of `name="properties[width]"` | App block uses correct names |
| Two sets of width/height fields | Remove duplicate custom fields from the theme |
| Theme AJAX cart ignores extra fields | App block includes cart property sync |

## Still broken?

View page source on the product page, search for `properties[width]`. If it’s missing, the **Wishful pricing** block is not on that template. If it’s present but cart is empty, check the browser console for `[wishful-pricing]` warnings.

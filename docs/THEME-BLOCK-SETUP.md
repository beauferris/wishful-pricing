# Wishful pricing theme block — not showing?

The block only exists **after** the theme app extension is deployed and enabled for your store.

## 1. Release the extension (required)

Your terminal may be waiting at:

```text
Release a new version of Wishful Pricing 2?
  + wishful-pricing-storefront (new)
```

Press **`y`** and Enter, or run:

```bash
npm run deploy
```

Confirm the release when prompted. Until this finishes, the block **will not** appear in the theme editor.

## 2. Turn on development store preview (Partners)

1. [partners.shopify.com](https://partners.shopify.com) → **Apps** → **Wishful Pricing 2**
2. Open the app → **Extensions** (or **Versions** / extension list)
3. Select **Wishful pricing storefront** (theme extension)
4. Enable **Development store preview** / **Turn on** for dev stores

Without this, some dev stores never receive theme extension updates.

## 3. Install the correct app on the store

The block belongs to **Wishful Pricing 2** (`wishful-pricing-2`), not the old custom **Wishful Pricing** app.

**Settings → Apps** on the store should show **Wishful Pricing 2** installed.

## 4. Add the block in the right place

App blocks only show on templates allowed in the schema (**product** only).

1. **Online Store → Themes → Customize**
2. Use the template dropdown → open **Products** → **Default product** (or your product template)
3. In the left sidebar, select the **main product section** (e.g. “Product information” on Dawn) — not Header or Footer
4. Click **Add block**
5. Under **Apps**, choose **Wishful pricing** (from Wishful Pricing 2)

If you see “No app blocks found”:

- You are not on a **product** template, or
- That section does not support app blocks (use the main product section on an **Online Store 2.0** theme like Dawn), or
- Step 1–2 above are not done

## 5. Publish the theme

Changes in the editor are drafts until you **Save** and the theme is live.

## Still using manual snippets?

If you previously pasted `{% render 'wishful-pricing' ... %}` into the theme, that still works. The app block is the App Store–approved path; you do not need both (avoid duplicate UI).

## Local dev preview

```bash
npm run dev
```

Then enable dev store preview in Partners (step 2). `dev` alone does not replace `deploy` for other machines or after you close the CLI session.

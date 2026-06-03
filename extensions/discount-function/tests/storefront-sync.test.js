import { describe, it, expect } from "vitest";
import {
  parseDiscountConfiguration,
  buildCatalogFromRules,
  collectOrphanProductOwnerIds,
} from "../../wishful-vinyl-settings/src/syncProductPricing.js";

describe("storefront catalog sync helpers", () => {
  it("parses rules array from function configuration", () => {
    const { rules, accountTiers } = parseDiscountConfiguration(
      JSON.stringify({
        rules: [
          {
            pricingMode: "quantity_only",
            productIds: ["gid://shopify/Product/1"],
          },
        ],
        accountTiers: { wholesale: { percentOff: 15 } },
      }),
    );
    expect(rules).toHaveLength(1);
    expect(rules[0].productIds).toEqual(["gid://shopify/Product/1"]);
    expect(accountTiers.wholesale).toBeDefined();
  });

  it("builds catalog from all rules without merging stale keys", () => {
    const catalog = buildCatalogFromRules([
      {
        rule: {
          pricingMode: "area_quantity",
          productIds: ["gid://shopify/Product/10"],
          areaTiers: [],
          quantityTiers: [],
          rates: [],
        },
        accountTiers: { wholesale: { percentOff: 10 } },
      },
    ]);
    expect(catalog["10"].accountTiers.wholesale).toBeDefined();
    expect(catalog.__wishfulAccountTierKeys).toContain("wholesale");
    expect(catalog["10"]).toBeDefined();
    expect(catalog["gid://shopify/Product/10"]).toBeDefined();
    expect(catalog["99"]).toBeUndefined();
  });

  it("collects orphan product owner ids from old catalog", () => {
    const orphans = collectOrphanProductOwnerIds(
      {
        "1": { pricingMode: "area_quantity" },
        "gid://shopify/Product/2": { pricingMode: "area_quantity" },
      },
      {
        "gid://shopify/Product/3": { pricingMode: "area_quantity" },
      },
    );
    expect(orphans).toContain("gid://shopify/Product/1");
    expect(orphans).toContain("gid://shopify/Product/2");
    expect(orphans).not.toContain("gid://shopify/Product/3");
  });
});

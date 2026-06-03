import { describe, it, expect } from "vitest";
import {
  DEFAULT_PRICING_TABLE,
  DEFAULT_AREA_FLAT_TABLE,
  DEFAULT_VOLUME_TABLE,
  PRICING_MODE_AREA_FLAT,
  PRICING_MODE_VOLUME,
  parseAppConfig,
  applyAccountTier,
  resolveBuyerTierKey,
  calculateLineMaterialTotal,
  calculateLineTargets,
  findAreaTierIndex,
  getVolumeRatesForVariant,
  getRatesMatrixForVariant,
  lineMatchesPricingMode,
  lineMatchesProduct,
} from "../src/pricing.js";

const line = (overrides = {}) => ({
  id: "line-1",
  quantity: 25,
  width: { value: "4" },
  height: { value: "2" },
  individuallyCut: null,
  merchandise: {
    __typename: "ProductVariant",
    product: { id: "gid://shopify/Product/1" },
  },
  ...overrides,
});

describe("area pricing", () => {
  it("matches 4×2 in, qty 25 on default table", () => {
    const table = {
      ...parseAppConfig({}).rules[0],
      productIds: ["gid://shopify/Product/1"],
    };
    const result = calculateLineMaterialTotal(line(), table);
    expect(result.sqIn).toBe(8);
    expect(result.rate).toBe(0.14);
    expect(result.total).toBe(28);
  });

  it("migrates legacy multi-table config to default table", () => {
    const { rules } = parseAppConfig({
      tables: [
        {
          id: "vinyl",
          isDefault: false,
          rates: [[0.1, 0.1, 0.1, 0.1, 0.1]],
          areaTiers: DEFAULT_PRICING_TABLE.areaTiers,
          quantityTiers: DEFAULT_PRICING_TABLE.quantityTiers,
          extraFeePerUnit: 0,
          maxArea: 80,
        },
        {
          id: "default",
          isDefault: true,
          rates: DEFAULT_PRICING_TABLE.rates,
          areaTiers: DEFAULT_PRICING_TABLE.areaTiers,
          quantityTiers: DEFAULT_PRICING_TABLE.quantityTiers,
          extraFeePerUnit: 0,
          maxArea: 80,
        },
      ],
    });

    expect(rules[0].rates).toEqual(DEFAULT_PRICING_TABLE.rates);
  });

  it("applies separate rules to different products in one cart", () => {
    const targets = calculateLineTargets(
      [
        line({ id: "sticker-line" }),
        line({
          id: "badge-line",
          quantity: 10,
          width: null,
          height: null,
          merchandise: {
            __typename: "ProductVariant",
            product: { id: "gid://shopify/Product/badges" },
          },
        }),
      ],
      {
        rules: [
          {
            ...DEFAULT_PRICING_TABLE,
            productIds: ["gid://shopify/Product/1"],
            extraFeePerUnit: 0,
          },
          {
            ...DEFAULT_VOLUME_TABLE,
            productIds: ["gid://shopify/Product/badges"],
            extraFeePerUnit: 0,
          },
        ],
      },
    );

    expect(targets.get("sticker-line")?.target).toBe(28);
    expect(targets.get("badge-line")?.target).toBe(50);
  });

  it("shows per-unit price without order minimum", () => {
    const config = parseAppConfig({});
    config.rules[0].productIds = ["gid://shopify/Product/1"];
    const targets = calculateLineTargets(
      [line({ quantity: 10, width: { value: "2" }, height: { value: "2" } })],
      config,
    );
    expect(targets.get("line-1").target).toBe(8);
    expect(targets.get("line-1").unitPrice).toBe(0.8);
  });

  it("does not price lines when no products are selected", () => {
    const targets = calculateLineTargets(
      [line({ quantity: 10, width: { value: "2" }, height: { value: "2" } })],
      parseAppConfig({ productIds: [] }),
    );
    expect(targets.size).toBe(0);
  });

  it("rejects area over max", () => {
    expect(findAreaTierIndex(81, DEFAULT_PRICING_TABLE)).toBe(-1);
  });

  it("skips sized lines on a volume-only discount", () => {
    const volume = { ...DEFAULT_VOLUME_TABLE, extraFeePerUnit: 0 };
    expect(lineMatchesPricingMode(line(), volume)).toBe(false);
    expect(calculateLineMaterialTotal(line(), volume)).toBeNull();
  });

  it("skips dimensionless lines on an area discount", () => {
    const bare = line({ width: null, height: null });
    expect(lineMatchesPricingMode(bare, DEFAULT_PRICING_TABLE)).toBe(false);
    expect(calculateLineMaterialTotal(bare, DEFAULT_PRICING_TABLE)).toBeNull();
  });

  it("prices each matching cart line independently", () => {
    const config = {
      ...DEFAULT_PRICING_TABLE,
      productIds: ["gid://shopify/Product/1"],
      extraFeePerUnit: 0,
    };
    const targets = calculateLineTargets(
      [
        line({ id: "line-a" }),
        line({
          id: "line-b",
          merchandise: {
            __typename: "ProductVariant",
            product: { id: "gid://shopify/Product/999" },
          },
        }),
      ],
      { rules: [config] },
    );
    expect(targets.size).toBe(1);
    expect(targets.get("line-a")?.target).toBe(28);
  });

  it("only prices lines for selected products", () => {
    const config = {
      ...DEFAULT_PRICING_TABLE,
      productIds: ["gid://shopify/Product/1"],
      extraFeePerUnit: 0,
    };
    expect(lineMatchesProduct(line(), config)).toBe(true);
    expect(
      lineMatchesProduct(
        line({
          merchandise: {
            __typename: "ProductVariant",
            product: { id: "gid://shopify/Product/999" },
          },
        }),
        config,
      ),
    ).toBe(false);
  });

  it("uses per-variant area rate matrix when ratesByVariant is set", () => {
    const table = parseAppConfig({
      ...DEFAULT_PRICING_TABLE,
      productIds: ["gid://shopify/Product/1"],
      extraFeePerUnit: 0,
      ratesByVariant: {
        "gid://shopify/ProductVariant/premium": [
          [0.25, 0.2, 0.18, 0.15, 0.12],
          [0.2, 0.16, 0.14, 0.12, 0.1],
          [0.12, 0.1, 0.09, 0.08, 0.07],
        ],
      },
    }).rules[0];

    const premiumLine = line({
      quantity: 1,
      merchandise: {
        __typename: "ProductVariant",
        id: "gid://shopify/ProductVariant/premium",
        product: { id: "gid://shopify/Product/1" },
      },
    });

    expect(calculateLineMaterialTotal(premiumLine, table).total).toBe(2);
    expect(
      getRatesMatrixForVariant(table, "gid://shopify/ProductVariant/premium")[0][0],
    ).toBe(0.25);
    expect(calculateLineMaterialTotal(line(), table).total).toBe(28);
  });
});

describe("area flat pricing", () => {
  const flatTable = {
    ...DEFAULT_AREA_FLAT_TABLE,
    extraFeePerUnit: 0,
    productIds: ["gid://shopify/Product/1"],
  };

  it("charges flat band price × qty (Cad-Cut style)", () => {
    const result = calculateLineMaterialTotal(
      line({ quantity: 2, width: { value: "2" }, height: { value: "2" } }),
      flatTable,
    );
    expect(result.sqIn).toBe(4);
    expect(result.rate).toBe(3);
    expect(result.total).toBe(6);
    expect(result.pricingMode).toBe(PRICING_MODE_AREA_FLAT);
  });

  it("uses medium band for 8 sq in", () => {
    const result = calculateLineMaterialTotal(
      line({ quantity: 1, width: { value: "4" }, height: { value: "2" } }),
      flatTable,
    );
    expect(result.sqIn).toBe(8);
    expect(result.total).toBe(4);
  });

  it("skips dimensionless lines", () => {
    expect(
      calculateLineMaterialTotal(
        line({ width: null, height: null }),
        flatTable,
      ),
    ).toBeNull();
  });

  it("uses per-variant flat band prices when ratesByVariant is set", () => {
    const table = parseAppConfig({
      ...DEFAULT_AREA_FLAT_TABLE,
      productIds: ["gid://shopify/Product/1"],
      extraFeePerUnit: 0,
      ratesByVariant: {
        "gid://shopify/ProductVariant/red": [[5], [6], [8], [12]],
      },
    }).rules[0];

    const redLine = line({
      quantity: 1,
      width: { value: "2" },
      height: { value: "2" },
      merchandise: {
        __typename: "ProductVariant",
        id: "gid://shopify/ProductVariant/red",
        product: { id: "gid://shopify/Product/1" },
      },
    });

    expect(calculateLineMaterialTotal(redLine, table).total).toBe(5);
    expect(calculateLineMaterialTotal(line({ quantity: 1, width: { value: "2" }, height: { value: "2" } }), table).total).toBe(3);
  });

  it("uses line width×height at checkout, not variant metafield fallback", () => {
    const result = calculateLineMaterialTotal(
      line({
        quantity: 1,
        width: { value: "4" },
        height: { value: "2" },
        merchandise: {
          __typename: "ProductVariant",
          product: { id: "gid://shopify/Product/1" },
          widthInches: { value: "2" },
          heightInches: { value: "1.5" },
        },
      }),
      flatTable,
    );
    expect(result.sqIn).toBe(8);
    expect(result.total).toBe(4);
  });
});

describe("volume-only pricing", () => {
  const volumeLine = (overrides = {}) =>
    line({
      quantity: 25,
      width: null,
      height: null,
      ...overrides,
    });

  it("charges unit price × qty without dimensions", () => {
    const table = {
      ...DEFAULT_VOLUME_TABLE,
      extraFeePerUnit: 0,
      productIds: ["gid://shopify/Product/1"],
    };
    const result = calculateLineMaterialTotal(volumeLine(), table);
    expect(result.sqIn).toBeNull();
    expect(result.rate).toBe(4.5);
    expect(result.total).toBe(112.5);
  });

  it("normalizes legacy unitPrices array", () => {
    const table = parseAppConfig({
      pricingMode: PRICING_MODE_VOLUME,
      productIds: ["gid://shopify/Product/1"],
      unitPrices: [10, 9, 8],
      quantityTiers: [
        { label: "1", min: 1 },
        { label: "10+", min: 10 },
        { label: "50+", min: 50 },
      ],
    }).rules[0];
    expect(table.rates[0]).toEqual([10, 9, 8]);
    const result = calculateLineMaterialTotal(volumeLine({ quantity: 50 }), table);
    expect(result.total).toBe(400);
  });

  it("uses per-variant unit prices when ratesByVariant is set", () => {
    const table = {
      ...DEFAULT_VOLUME_TABLE,
      extraFeePerUnit: 0,
      productIds: ["gid://shopify/Product/badges"],
      rates: [[5, 4.5, 4, 3.5, 3]],
      ratesByVariant: {
        "gid://shopify/ProductVariant/111": [8.5, 8.5, 8, 7.5, 7.25],
        "gid://shopify/ProductVariant/222": [8, 8, 7.5, 7, 6.75],
      },
    };

    const magnet = volumeLine({
      quantity: 1,
      merchandise: {
        __typename: "ProductVariant",
        id: "gid://shopify/ProductVariant/111",
        product: { id: "gid://shopify/Product/badges" },
      },
    });
    const pin = volumeLine({
      quantity: 1,
      merchandise: {
        __typename: "ProductVariant",
        id: "gid://shopify/ProductVariant/222",
        product: { id: "gid://shopify/Product/badges" },
      },
    });

    expect(calculateLineMaterialTotal(magnet, table).total).toBe(8.5);
    expect(calculateLineMaterialTotal(pin, table).total).toBe(8);
    expect(getVolumeRatesForVariant(table, "gid://shopify/ProductVariant/111")[0]).toBe(
      8.5,
    );
  });

  it("subtracts pin back discount per unit when property is set", () => {
    const table = {
      ...DEFAULT_VOLUME_TABLE,
      extraFeePerUnit: 0,
      productIds: ["gid://shopify/Product/1"],
      pinBackDiscountPerUnit: 0.5,
      rates: [[8.5, 8.5, 8, 7.5, 7.25]],
    };
    const withPin = volumeLine({
      quantity: 10,
      pinBack: { value: "true" },
    });
    expect(calculateLineMaterialTotal(withPin, table).total).toBe(80);
  });

  it("formats checkout message without sq in", () => {
    const config = parseAppConfig({
      ...DEFAULT_VOLUME_TABLE,
      productIds: ["gid://shopify/Product/1"],
    });
    const targets = calculateLineTargets(
      [volumeLine({ quantity: 100 })],
      config,
    );
    expect(targets.get("line-1").message).toMatch(/\$4\.00 each/);
    expect(targets.get("line-1").message).not.toMatch(/sq in/);
  });
});

describe("account tier pricing", () => {
  it("applies wholesale percent when buyer tier metafield matches", () => {
    const retail = {
      ...parseAppConfig({}).rules[0],
      productIds: ["gid://shopify/Product/1"],
      rates: [[0.2, 0.14, 0.12, 0.09, 0.07]],
    };
    const config = parseAppConfig({
      ...retail,
      accountTiers: { wholesale: { percentOff: 50 } },
    });
    const buyerIdentity = {
      customer: { accountTier: { value: "wholesale" } },
    };
    expect(resolveBuyerTierKey(buyerIdentity, config.accountTiers)).toBe(
      "wholesale",
    );
    const effective = applyAccountTier(
      config.rules[0],
      "wholesale",
      config.accountTiers,
    );
    expect(effective.rates[0][1]).toBe(0.07);
    const targets = calculateLineTargets(
      [line({ quantity: 25 })],
      config,
      buyerIdentity,
    );
    expect(targets.get("line-1").rate).toBe(0.07);
  });

  it("applies tier from line item property at checkout", () => {
    const retail = {
      ...parseAppConfig({}).rules[0],
      productIds: ["gid://shopify/Product/1"],
      rates: [[0.2, 0.14, 0.12, 0.09, 0.07]],
    };
    const config = parseAppConfig({
      ...retail,
      accountTiers: { wholesale: { percentOff: 50 } },
    });
    const cart = { wishfulAccountTier: null };
    const lines = [
      line({
        wishfulAccountTier: { value: "wholesale" },
      }),
    ];
    expect(
      resolveBuyerTierKey(null, config.accountTiers, cart, lines),
    ).toBe("wholesale");
    const targets = calculateLineTargets(lines, config, null, cart);
    expect(targets.get("line-1").rate).toBe(0.07);
  });

  it("matches customer tag to configured tier key", () => {
    const accountTiers = { wholesale: { percentOff: 10 } };
    const buyerIdentity = {
      customer: {
        tagChecks: [{ tag: "wholesale", hasTag: true }],
      },
    };
    expect(resolveBuyerTierKey(buyerIdentity, accountTiers, null, [])).toBe(
      "wholesale",
    );
  });
});

/**
 * One pricing table per discount:
 * - area_quantity: rate per sq in × area × qty (+ optional extra fee)
 * - area_flat: width × height → size band → flat price per piece (no qty breaks)
 * - quantity_only: unit price by quantity break (no width/height)
 */

export const PRICING_MODE_AREA = "area_quantity";
export const PRICING_MODE_AREA_FLAT = "area_flat";
export const PRICING_MODE_VOLUME = "quantity_only";

const AREA_FLAT_QUANTITY_TIERS = [{ label: "Per piece", min: 1 }];

const VOLUME_PLACEHOLDER_AREA = {
  label: "Volume pricing",
  maxSqIn: 999999,
};

export const DEFAULT_VOLUME_TABLE = {
  id: "volume-default",
  name: "Volume pricing",
  productIds: [],
  isDefault: false,
  pricingMode: PRICING_MODE_VOLUME,
  areaTiers: [VOLUME_PLACEHOLDER_AREA],
  quantityTiers: [
    { label: "1–24", min: 1 },
    { label: "25–99", min: 25 },
    { label: "100–249", min: 100 },
    { label: "250–999", min: 250 },
    { label: "1000+", min: 1000 },
  ],
  rates: [[5, 4.5, 4, 3.5, 3]],
  extraFeePerUnit: 0,
  extraFeeAttributeKey: "individually_cut",
  pinBackDiscountPerUnit: 0.5,
  pinBackAttributeKey: "pin_back",
  modifiers: [
    {
      key: "pin_back",
      label: "Pin back",
      amountPerUnit: -0.5,
      appliesTo: "volume",
    },
  ],
  maxArea: 999999,
  areaUnit: "each",
};

export const DEFAULT_PRICING_TABLE = {
  id: "default",
  name: "Default pricing",
  productIds: [],
  isDefault: true,
  pricingMode: PRICING_MODE_AREA,
  areaTiers: [
    { label: "Less than 20 sq in", maxSqIn: 20 },
    { label: "20–40 sq in", minSqIn: 20, maxSqIn: 40 },
    { label: "40–80 sq in", minSqIn: 40, maxSqIn: 80 },
  ],
  quantityTiers: [
    { label: "1–24", min: 1 },
    { label: "25–99", min: 25 },
    { label: "100–249", min: 100 },
    { label: "250–999", min: 250 },
    { label: "1000+", min: 1000 },
  ],
  rates: [
    [0.2, 0.14, 0.12, 0.09, 0.07],
    [0.17, 0.12, 0.09, 0.07, 0.06],
    [0.09, 0.07, 0.06, 0.05, 0.04],
  ],
  extraFeePerUnit: 0.05,
  extraFeeAttributeKey: "individually_cut",
  modifiers: [
    {
      key: "individually_cut",
      label: "Individually cut",
      amountPerUnit: 0.05,
      appliesTo: "sized",
    },
  ],
  maxArea: 80,
  areaUnit: "sq in",
};

export const DEFAULT_AREA_FLAT_TABLE = {
  id: "area-flat-default",
  name: "Size band pricing",
  productIds: [],
  isDefault: false,
  pricingMode: PRICING_MODE_AREA_FLAT,
  areaTiers: [
    { label: "Small (up to 6 sq in)", maxSqIn: 6 },
    { label: "Medium (6–16 sq in)", minSqIn: 6, maxSqIn: 16 },
    { label: "Large (16–40 sq in)", minSqIn: 16, maxSqIn: 40 },
    { label: "Extra large (to 100 sq in)", minSqIn: 40, maxSqIn: 100 },
  ],
  quantityTiers: AREA_FLAT_QUANTITY_TIERS,
  rates: [[3], [4], [6.5], [10.75]],
  extraFeePerUnit: 0,
  extraFeeAttributeKey: "individually_cut",
  pinBackDiscountPerUnit: 0,
  pinBackAttributeKey: "pin_back",
  modifiers: [],
  maxArea: 100,
  areaUnit: "sq in",
};

/** @deprecated Use DEFAULT_PRICING_TABLE */
export const DEFAULT_VINYL_PRICING_CONFIG = DEFAULT_PRICING_TABLE;

/**
 * @typedef {object} PricingModifier
 * @property {string} key
 * @property {string} label
 * @property {number} amountPerUnit Positive = surcharge, negative = discount
 */

/**
 * Keep rates[area][qty] aligned with tier counts (pads with 0, trims excess).
 */
export function normalizeRatesMatrix(areaTiers, quantityTiers, rates) {
  const rows = areaTiers.length;
  const cols = quantityTiers.length;
  const matrix = [];

  for (let i = 0; i < rows; i++) {
    const source = Array.isArray(rates?.[i]) ? rates[i] : [];
    const row = [];
    for (let j = 0; j < cols; j++) {
      row.push(typeof source[j] === "number" ? source[j] : 0);
    }
    matrix.push(row);
  }

  return matrix;
}

/**
 * @param {unknown} raw
 * @param {number} qtyCount
 * @param {number[]} fallbackRow
 */
export function normalizeRatesByVariant(raw, qtyCount, fallbackRow) {
  if (!raw || typeof raw !== "object") return {};

  const fallback = Array.isArray(fallbackRow) ? fallbackRow : [];
  /** @type {Record<string, number[]>} */
  const out = {};

  for (const [key, row] of Object.entries(
    /** @type {Record<string, unknown>} */ (raw),
  )) {
    out[String(key)] = normalizeVariantRateRow(row, qtyCount, fallback);
  }

  return out;
}

/**
 * Per-variant full rate matrix (area × qty). Flat pricing uses one column per row.
 *
 * @param {unknown} raw
 * @param {number} areaCount
 * @param {number} qtyCount
 * @param {number[][]} fallbackMatrix
 */
export function normalizeRatesByVariantMatrix(
  raw,
  areaCount,
  qtyCount,
  fallbackMatrix,
) {
  if (!raw || typeof raw !== "object") return {};

  const areaTiers = Array.from({ length: areaCount }, (_, i) => ({
    label: String(i),
  }));
  const quantityTiers = Array.from({ length: qtyCount }, (_, i) => ({
    label: String(i),
    min: 1,
  }));

  /** @type {Record<string, number[][]>} */
  const out = {};

  for (const [key, entry] of Object.entries(
    /** @type {Record<string, unknown>} */ (raw),
  )) {
    let matrix = entry;
    if (
      Array.isArray(entry) &&
      entry.length &&
      typeof entry[0] === "number"
    ) {
      matrix = entry.map((n) => [typeof n === "number" ? n : 0]);
    }
    out[String(key)] = normalizeRatesMatrix(
      areaTiers,
      quantityTiers,
      /** @type {number[][]} */ (matrix),
    );
  }

  return out;
}

/**
 * @param {Record<string, unknown> | undefined} map
 * @param {string | null} variantId
 */
export function resolveVariantRatesEntry(map, variantId) {
  if (!map || typeof map !== "object" || !variantId) return null;

  const tryKey = (key) => {
    if (!key) return null;
    const entry = map[key];
    return entry == null ? null : entry;
  };

  const direct = tryKey(variantId);
  if (direct != null) return direct;

  const numeric = variantId.split("/").pop();
  if (numeric) {
    const byNumeric = tryKey(numeric);
    if (byNumeric != null) return byNumeric;

    if (!variantId.startsWith("gid://")) {
      const gid = `gid://shopify/ProductVariant/${numeric}`;
      const byGid = tryKey(gid);
      if (byGid != null) return byGid;
    }
  }

  return null;
}

function isVariantRatesMatrix(entry) {
  return Array.isArray(entry) && entry.length > 0 && Array.isArray(entry[0]);
}

/**
 * @param {unknown} row
 * @param {number} qtyCount
 * @param {number[]} fallbackRow
 */
export function normalizeVariantRateRow(row, qtyCount, fallbackRow) {
  const source = Array.isArray(row) ? row : [];
  const fallback = Array.isArray(fallbackRow) ? fallbackRow : [];
  /** @type {number[]} */
  const result = [];

  for (let j = 0; j < qtyCount; j++) {
    result.push(
      typeof source[j] === "number"
        ? source[j]
        : typeof fallback[j] === "number"
          ? fallback[j]
          : 0,
    );
  }

  return result;
}

function normalizeModifiers(raw, pricingMode, legacy) {
  /** @type {PricingModifier[]} */
  const out = [];

  const list = raw && typeof raw === "object" ? raw.modifiers : undefined;
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const key = String(entry.key ?? "").trim();
      if (!key) continue;
      const amountPerUnit = Number(entry.amountPerUnit);
      if (!Number.isFinite(amountPerUnit) || amountPerUnit === 0) continue;
      const label = String(entry.label ?? key).trim() || key;
      out.push({ key, label, amountPerUnit });
    }

    if (out.length) return out;
  }

  // Legacy fallback: extraFee and pinBack fields.
  if (legacy && typeof legacy === "object") {
    const extraAmount = Number(legacy.extraFeePerUnit);
    const extraKey = String(legacy.extraFeeAttributeKey ?? "individually_cut");
    if (Number.isFinite(extraAmount) && extraAmount > 0 && extraKey) {
      out.push({
        key: extraKey,
        label: extraKey === "individually_cut" ? "Individually cut" : extraKey,
        amountPerUnit: extraAmount,
      });
    }

    if (pricingMode === PRICING_MODE_VOLUME) {
      const pbAmount = Number(legacy.pinBackDiscountPerUnit);
      const pbKey = String(legacy.pinBackAttributeKey ?? "pin_back");
      if (Number.isFinite(pbAmount) && pbAmount > 0 && pbKey) {
        out.push({
          key: pbKey,
          label: pbKey === "pin_back" ? "Pin back" : pbKey,
          amountPerUnit: -pbAmount,
        });
      }
    }
  }

  return out;
}

/**
 * @param {object} line
 */
export function getLineVariantId(line) {
  const merch = line.merchandise;
  if (merch?.__typename === "ProductVariant" && merch.id) {
    return String(merch.id);
  }
  return null;
}

/**
 * @param {ReturnType<typeof normalizePricingTable>} table
 * @param {string | null} variantId
 */
export function getVolumeRatesForVariant(table, variantId) {
  const fallback = table.rates[0] ?? [];
  const entry = resolveVariantRatesEntry(table.ratesByVariant, variantId);
  if (!Array.isArray(entry)) return fallback;
  if (isVariantRatesMatrix(entry)) return fallback;
  return normalizeVariantRateRow(
    entry,
    table.quantityTiers.length,
    fallback,
  );
}

/**
 * @param {ReturnType<typeof normalizePricingTable>} table
 * @param {string | null} variantId
 */
export function getRatesMatrixForVariant(table, variantId) {
  const fallback = table.rates;
  const entry = resolveVariantRatesEntry(table.ratesByVariant, variantId);
  if (entry == null) return fallback;

  if (isVariantRatesMatrix(entry)) {
    return normalizeRatesMatrix(
      table.areaTiers,
      table.quantityTiers,
      entry,
    );
  }

  if (isAreaFlatTable(table) && Array.isArray(entry)) {
    return normalizeRatesMatrix(
      table.areaTiers,
      table.quantityTiers,
      entry.map((n) => [typeof n === "number" ? n : 0]),
    );
  }

  return fallback;
}

function maxAreaFromTiers(areaTiers, fallback) {
  let max = fallback;
  for (const tier of areaTiers) {
    if (typeof tier.maxSqIn === "number" && tier.maxSqIn > max) {
      max = tier.maxSqIn;
    }
  }
  return max;
}

/**
 * @param {ReturnType<typeof normalizePricingTable>} table
 */
export function isQuantityOnlyTable(table) {
  return table.pricingMode === PRICING_MODE_VOLUME;
}

/**
 * @param {ReturnType<typeof normalizePricingTable>} table
 */
export function isAreaFlatTable(table) {
  return table.pricingMode === PRICING_MODE_AREA_FLAT;
}

/**
 * Volume discounts should not price custom-sized lines (use a separate area discount).
 * Area discounts should not price lines without dimensions (use a separate volume discount).
 *
 * @param {object} line
 * @param {ReturnType<typeof normalizePricingTable>} table
 */
export function lineMatchesPricingMode(line, table) {
  const sqIn = getLineSquareInches(line, table);

  if (isQuantityOnlyTable(table)) {
    return sqIn == null;
  }

  return sqIn != null;
}

/**
 * @param {object} line
 * @param {ReturnType<typeof normalizePricingTable>} table
 */
export function lineMatchesProduct(line, table) {
  const ids = table.productIds;
  if (!Array.isArray(ids) || !ids.length) return false;

  const productId =
    line.merchandise?.__typename === "ProductVariant"
      ? line.merchandise.product?.id
      : null;

  if (!productId) return false;

  const numeric = productId.split("/").pop();
  return ids.some((id) => {
    const key = String(id);
    return (
      key === productId ||
      (numeric && key === numeric) ||
      (numeric && key === `gid://shopify/Product/${numeric}`)
    );
  });
}

function resolvePricingMode(raw, base) {
  const mode = String(raw.pricingMode ?? base.pricingMode);
  if (mode === PRICING_MODE_VOLUME) return PRICING_MODE_VOLUME;
  if (mode === PRICING_MODE_AREA_FLAT) return PRICING_MODE_AREA_FLAT;
  return PRICING_MODE_AREA;
}

function volumeRatesSource(raw, quantityTiers, fallbackRates) {
  if (Array.isArray(raw.unitPrices) && raw.unitPrices.length) {
    return [raw.unitPrices];
  }
  if (Array.isArray(raw.rates) && raw.rates.length) {
    return [raw.rates[0]];
  }
  return fallbackRates;
}

/**
 * @param {unknown} table
 */
export function normalizePricingTable(table) {
  const base = { ...DEFAULT_PRICING_TABLE };
  if (!table || typeof table !== "object") return base;

  const raw = /** @type {Record<string, unknown>} */ (table);
  const pricingMode = resolvePricingMode(raw, base);
  const modeBase =
    pricingMode === PRICING_MODE_VOLUME
      ? DEFAULT_VOLUME_TABLE
      : pricingMode === PRICING_MODE_AREA_FLAT
        ? DEFAULT_AREA_FLAT_TABLE
        : base;

  let areaTiers =
    Array.isArray(raw.areaTiers) && raw.areaTiers.length
      ? raw.areaTiers
      : modeBase.areaTiers;
  let quantityTiers =
    Array.isArray(raw.quantityTiers) && raw.quantityTiers.length
      ? raw.quantityTiers
      : modeBase.quantityTiers;

  if (pricingMode === PRICING_MODE_VOLUME) {
    areaTiers = [VOLUME_PLACEHOLDER_AREA];
  }

  if (pricingMode === PRICING_MODE_AREA_FLAT) {
    quantityTiers = AREA_FLAT_QUANTITY_TIERS;
  }

  const ratesInput =
    pricingMode === PRICING_MODE_VOLUME
      ? volumeRatesSource(raw, quantityTiers, modeBase.rates)
      : Array.isArray(raw.rates)
        ? raw.rates
        : modeBase.rates;

  const rates = normalizeRatesMatrix(areaTiers, quantityTiers, ratesInput);
  const ratesByVariant =
    pricingMode === PRICING_MODE_VOLUME
      ? normalizeRatesByVariant(
          raw.ratesByVariant,
          quantityTiers.length,
          rates[0],
        )
      : normalizeRatesByVariantMatrix(
          raw.ratesByVariant,
          areaTiers.length,
          quantityTiers.length,
          rates,
        );

  const legacy = {
    extraFeePerUnit:
      typeof raw.extraFeePerUnit === "number"
        ? raw.extraFeePerUnit
        : typeof raw.individualCutFee === "number"
          ? raw.individualCutFee
          : base.extraFeePerUnit,
    extraFeeAttributeKey:
      raw.extraFeeAttributeKey ??
      (raw.attributeKeys && typeof raw.attributeKeys === "object"
        ? /** @type {Record<string, string>} */ (raw.attributeKeys)
            .individuallyCut
        : undefined) ??
      base.extraFeeAttributeKey,
    pinBackDiscountPerUnit:
      pricingMode === PRICING_MODE_VOLUME
        ? typeof raw.pinBackDiscountPerUnit === "number"
          ? raw.pinBackDiscountPerUnit
          : DEFAULT_VOLUME_TABLE.pinBackDiscountPerUnit
        : 0,
    pinBackAttributeKey:
      raw.pinBackAttributeKey ?? DEFAULT_VOLUME_TABLE.pinBackAttributeKey,
  };

  return {
    productIds: Array.isArray(raw.productIds)
      ? raw.productIds.map(String)
      : [],
    pricingMode,
    areaTiers,
    quantityTiers,
    rates,
    ratesByVariant,
    // Legacy fields remain, but calculations use `modifiers`.
    extraFeePerUnit: legacy.extraFeePerUnit,
    extraFeeAttributeKey: String(legacy.extraFeeAttributeKey),
    maxArea:
      pricingMode === PRICING_MODE_VOLUME
        ? 999999
        : maxAreaFromTiers(
            Array.isArray(raw.areaTiers) && raw.areaTiers.length
              ? raw.areaTiers
              : base.areaTiers,
            typeof raw.maxArea === "number"
              ? raw.maxArea
              : typeof raw.maxSqIn === "number"
                ? raw.maxSqIn
                : base.maxArea,
          ),
    areaUnit: String(
      raw.areaUnit ??
        (pricingMode === PRICING_MODE_VOLUME ? "each" : "sq in"),
    ),
    pinBackDiscountPerUnit: legacy.pinBackDiscountPerUnit,
    pinBackAttributeKey: String(legacy.pinBackAttributeKey),
    modifiers: normalizeModifiers(raw, pricingMode, legacy),
  };
}

/**
 * @param {Record<string, unknown>} raw
 */
function pickLegacyTable(raw) {
  if (!Array.isArray(raw.tables) || !raw.tables.length) {
    return normalizePricingTable(raw);
  }

  const rawTables = raw.tables;
  const preferred =
    rawTables.find((t) => t && typeof t === "object" && t.isDefault) ??
    rawTables.find(
      (t) =>
        t &&
        typeof t === "object" &&
        Array.isArray(t.productIds) &&
        t.productIds.length,
    ) ??
    rawTables[0];

  return normalizePricingTable(preferred);
}

/**
 * @typedef {{ percentOff: number }} AccountTierDiscount
 */

/**
 * @param {unknown} tier
 * @returns {number} 0–100 percent off retail
 */
export function accountTierPercentOff(tier) {
  if (!tier || typeof tier !== "object") return 0;
  const raw = /** @type {Record<string, unknown>} */ (tier);
  const pct = Number(
    raw.percentOff ?? raw.discountPercent ?? raw.percent ?? 0,
  );
  return Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
}

/**
 * @param {unknown} raw
 * @returns {AccountTierDiscount}
 */
export function normalizeAccountTierEntry(raw) {
  return { percentOff: accountTierPercentOff(raw) };
}

/**
 * @param {unknown} raw
 * @returns {Record<string, AccountTierDiscount>}
 */
export function normalizeAccountTiers(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  /** @type {Record<string, AccountTierDiscount>} */
  const out = {};

  for (const [key, value] of Object.entries(
    /** @type {Record<string, unknown>} */ (raw),
  )) {
    const tierKey = String(key).trim();
    if (!tierKey || !value || typeof value !== "object") continue;
    out[tierKey] = normalizeAccountTierEntry(value);
  }

  return out;
}

function scaleRateValue(rate, factor) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return 0;
  return roundMoney(n * factor);
}

function scaleRatesMatrix(matrix, factor) {
  if (!Array.isArray(matrix)) return matrix;
  return matrix.map((row) =>
    Array.isArray(row)
      ? row.map((cell) => scaleRateValue(cell, factor))
      : [scaleRateValue(row, factor)],
  );
}

function scaleRatesByVariant(map, factor) {
  if (!map || typeof map !== "object") return {};
  /** @type {Record<string, number[][] | number[]>} */
  const out = {};
  for (const [id, entry] of Object.entries(map)) {
    if (!Array.isArray(entry)) continue;
    if (entry.length > 0 && Array.isArray(entry[0])) {
      out[id] = scaleRatesMatrix(entry, factor);
    } else {
      out[id] = entry.map((n) => scaleRateValue(n, factor));
    }
  }
  return out;
}

/**
 * @param {ReturnType<typeof normalizePricingTable>} rule
 * @param {string | null} tierKey
 * @param {Record<string, AccountTierDiscount>} accountTiers
 */
export function applyAccountTier(rule, tierKey, accountTiers) {
  if (!tierKey || !accountTiers?.[tierKey]) {
    return rule;
  }

  const percent = accountTierPercentOff(accountTiers[tierKey]);
  if (percent <= 0) {
    return rule;
  }

  const factor = 1 - percent / 100;

  return {
    ...rule,
    rates: scaleRatesMatrix(rule.rates, factor),
    ratesByVariant: scaleRatesByVariant(rule.ratesByVariant, factor),
  };
}

/**
 * Logged-in buyer tier key from customer metafield or B2B company id.
 *
 * @param {object | null | undefined} buyerIdentity
 * @param {Record<string, AccountTierDiscount>} accountTiers
 * @param {object | null | undefined} [cart]
 * @returns {string | null}
 */
export function resolveBuyerTierKey(buyerIdentity, accountTiers, cart, lines) {
  if (!accountTiers || typeof accountTiers !== "object") {
    return null;
  }

  const tierKeys = Object.keys(accountTiers);
  if (!tierKeys.length) return null;

  const matchTierKey = (candidate) => {
    const raw = String(candidate ?? "").trim();
    if (!raw) return null;
    if (accountTiers[raw]) return raw;
    const lower = raw.toLowerCase();
    for (const key of tierKeys) {
      if (key.toLowerCase() === lower) return key;
    }
    return null;
  };

  if (Array.isArray(lines)) {
    for (const line of lines) {
      const fromLine = matchTierKey(line?.wishfulAccountTier?.value);
      if (fromLine) return fromLine;
    }
  }

  const cartTier = matchTierKey(cart?.wishfulAccountTier?.value);
  if (cartTier) return cartTier;

  if (!buyerIdentity) return null;

  const tagChecks = buyerIdentity.customer?.tagChecks;
  if (Array.isArray(tagChecks)) {
    for (const entry of tagChecks) {
      if (!entry?.hasTag) continue;
      const matched = matchTierKey(entry.tag);
      if (matched) return matched;
    }
  }

  const companyId = buyerIdentity.purchasingCompany?.company?.id;
  if (companyId) {
    if (accountTiers[companyId]) return companyId;
    const numeric = String(companyId).split("/").pop();
    if (numeric) {
      const short = `company:${numeric}`;
      if (accountTiers[short]) return short;
    }
  }

  const tierValue = buyerIdentity.customer?.accountTier?.value;
  const fromMetafield = matchTierKey(tierValue);
  if (fromMetafield) return fromMetafield;

  return null;
}

/**
 * @param {unknown} jsonValue
 * @returns {{
 *   rules: ReturnType<typeof normalizePricingTable>[];
 *   accountTiers: Record<string, AccountTierDiscount>;
 * }}
 */
export function parseAppConfig(jsonValue) {
  if (!jsonValue || typeof jsonValue !== "object") {
    return {
      rules: [normalizePricingTable(DEFAULT_PRICING_TABLE)],
      accountTiers: {},
    };
  }

  const raw = /** @type {Record<string, unknown>} */ (jsonValue);
  const accountTiers = normalizeAccountTiers(raw.accountTiers);

  if (Array.isArray(raw.rules) && raw.rules.length) {
    return {
      rules: raw.rules.map((rule) => normalizePricingTable(rule)),
      accountTiers,
    };
  }

  return { rules: [pickLegacyTable(raw)], accountTiers };
}

/** @deprecated */
export function parsePricingConfig(jsonValue) {
  return parseAppConfig(jsonValue);
}

/**
 * @deprecated Each discount has one table; use the config from parseAppConfig directly.
 */
export function getTableForLine(_line, config) {
  if (config && Array.isArray(config.tables)) {
    return pickLegacyTable(config);
  }
  return config ?? normalizePricingTable(DEFAULT_PRICING_TABLE);
}

/**
 * @param {number} sqIn
 * @param {ReturnType<typeof normalizePricingTable>} table
 */
export function findAreaTierIndex(sqIn, table) {
  if (sqIn <= 0 || sqIn > table.maxArea) {
    return -1;
  }

  for (let i = 0; i < table.areaTiers.length; i++) {
    const tier = table.areaTiers[i];
    const min = tier.minSqIn;
    const max = tier.maxSqIn;
    const isLast = i === table.areaTiers.length - 1;

    if (min != null && sqIn < min) continue;
    if (max != null) {
      if (isLast) {
        if (sqIn > max) continue;
      } else if (sqIn >= max) {
        continue;
      }
    }
    return i;
  }

  return -1;
}

/**
 * @param {number} quantity
 * @param {ReturnType<typeof normalizePricingTable>} table
 */
export function findQuantityTierIndex(quantity, table) {
  let index = 0;
  for (let i = 0; i < table.quantityTiers.length; i++) {
    if (quantity >= table.quantityTiers[i].min) {
      index = i;
    }
  }
  return index;
}

function parsePositiveNumber(value) {
  if (value == null || value === "") return null;
  const n = Number.parseFloat(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseBoolean(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const s = String(value).toLowerCase().trim();
  return s === "true" || s === "1" || s === "yes";
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed =
      typeof value === "object" && value !== null && "value" in value
        ? parsePositiveNumber(value.value)
        : parsePositiveNumber(value);
    if (parsed != null) return parsed;
  }
  return null;
}

/**
 * @param {object} line
 * @param {ReturnType<typeof normalizePricingTable>} table
 */
export function getLineSquareInches(line, table) {
  const sqDirect = firstNumber(line.squareInches);
  if (sqDirect != null) return sqDirect;

  const w = firstNumber(line.width, line.widthLabel);
  const h = firstNumber(line.height, line.heightLabel);
  if (w != null && h != null) return w * h;

  return null;
}

/**
 * @param {object} line
 * @param {ReturnType<typeof normalizePricingTable>} table
 */
export function hasExtraFee(line, table) {
  const key = table.extraFeeAttributeKey;
  if (parseBoolean(line.individuallyCut?.value)) return true;

  return false;
}

/**
 * @param {object} line
 * @param {ReturnType<typeof normalizePricingTable>} table
 */
export function hasPinBack(line, table) {
  if (!table.pinBackDiscountPerUnit || table.pinBackDiscountPerUnit <= 0) {
    return false;
  }

  if (parseBoolean(line.pinBack?.value)) return true;

  const key = table.pinBackAttributeKey;
  if (key && key !== "pin_back") {
    const attr = line[key];
    if (attr && parseBoolean(attr.value)) return true;
  }

  return false;
}

function getLineAttributeValue(line, key) {
  if (!line || !key) return null;

  const direct = line[key];
  if (direct && parseBoolean(direct.value)) return direct.value;
  return null;
}

function parseWishfulModifierKeys(line) {
  const raw = String(line?.wishfulModifiers?.value ?? "").trim();
  if (!raw) return new Set();

  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map((k) => String(k).trim()).filter(Boolean));
      }
    } catch {
      // fallthrough to comma-separated parsing
    }
  }

  return new Set(
    raw
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
  );
}

function isModifierEnabled(line, mod, table) {
  const attrValue = getLineAttributeValue(line, mod.key);
  if (parseBoolean(attrValue)) return true;
  if (parseWishfulModifierKeys(line).has(String(mod.key))) return true;

  if (mod.key === "individually_cut") {
    if (parseBoolean(line.individuallyCut?.value)) return true;
  }

  if (mod.key === "pin_back") {
    if (parseBoolean(line.pinBack?.value)) return true;
  }

  return false;
}

function applyModifiersToTotal(line, table, baseTotal) {
  const mods = Array.isArray(table.modifiers) ? table.modifiers : [];
  if (!mods.length) return Math.max(0, baseTotal);

  let total = baseTotal;
  for (const mod of mods) {
    if (!mod || typeof mod !== "object") continue;
    const amount = Number(mod.amountPerUnit);
    if (!Number.isFinite(amount) || amount === 0) continue;
    if (isModifierEnabled(line, mod, table)) {
      total += amount * line.quantity;
    }
  }

  return Math.max(0, total);
}

/**
 * @param {object} line
 * @param {ReturnType<typeof normalizePricingTable>} table
 */
export function calculateLineMaterialTotal(line, table) {
  if (!lineMatchesProduct(line, table) || !lineMatchesPricingMode(line, table)) {
    return null;
  }

  const qtyIndex = findQuantityTierIndex(line.quantity, table);

  if (isQuantityOnlyTable(table)) {
    const variantRates = getVolumeRatesForVariant(table, getLineVariantId(line));
    const unitPrice = variantRates[qtyIndex];
    if (unitPrice == null) return null;

    let total = unitPrice * line.quantity;
    total = applyModifiersToTotal(line, table, total);
    const effectiveUnit = line.quantity > 0 ? total / line.quantity : unitPrice;

    return {
      sqIn: null,
      rate: roundMoney(effectiveUnit),
      areaIndex: 0,
      qtyIndex,
      total: roundMoney(total),
      pricingMode: PRICING_MODE_VOLUME,
    };
  }

  const sqIn = getLineSquareInches(line, table);
  if (sqIn == null) return null;

  const areaIndex = findAreaTierIndex(sqIn, table);
  if (areaIndex < 0) return null;

  const ratesMatrix = getRatesMatrixForVariant(table, getLineVariantId(line));

  if (isAreaFlatTable(table)) {
    const flatPrice = ratesMatrix[areaIndex]?.[0];
    if (flatPrice == null) return null;

    let total = flatPrice * line.quantity;
    total = applyModifiersToTotal(line, table, total);

    return {
      sqIn,
      rate: flatPrice,
      areaIndex,
      qtyIndex: 0,
      total: roundMoney(total),
      pricingMode: PRICING_MODE_AREA_FLAT,
    };
  }

  const rate = ratesMatrix[areaIndex]?.[qtyIndex];
  if (rate == null) return null;

  let total = sqIn * rate * line.quantity;
  total = applyModifiersToTotal(line, table, total);

  return {
    sqIn,
    rate,
    areaIndex,
    qtyIndex,
    total: roundMoney(total),
    pricingMode: PRICING_MODE_AREA,
  };
}

function buildLineTargetMessage(line, rule, result) {
  const qty = line.quantity;
  const unitPrice =
    qty > 0 ? roundMoney(result.total / qty) : result.total;

  if (isQuantityOnlyTable(rule)) {
    const tierLabel =
      rule.quantityTiers[result.qtyIndex]?.label ?? `qty ${qty}+`;
    return {
      target: result.total,
      unitPrice,
      sqIn: result.sqIn,
      rate: result.rate,
      message: `$${unitPrice.toFixed(2)} each — ${tierLabel}`,
    };
  }

  if (isAreaFlatTable(rule)) {
    const bandLabel =
      rule.areaTiers[result.areaIndex]?.label ?? "size band";
    return {
      target: result.total,
      unitPrice,
      sqIn: result.sqIn,
      rate: result.rate,
      message: `$${unitPrice.toFixed(2)} each — ${bandLabel} (${result.sqIn} sq in)`,
    };
  }

  const unit = rule.areaUnit;
  return {
    target: result.total,
    unitPrice,
    sqIn: result.sqIn,
    rate: result.rate,
    message: `$${unitPrice.toFixed(2)} each — ${result.sqIn} ${unit} @ $${result.rate.toFixed(2)}/${unit}`,
  };
}

/**
 * @param {object[]} lines
 * @param {{
 *   rules?: ReturnType<typeof normalizePricingTable>[];
 *   accountTiers?: Record<string, ReturnType<typeof normalizePricingTable>>;
 * }} appConfig
 * @param {object | null | undefined} [buyerIdentity]
 * @param {object | null | undefined} [cart]
 */
export function calculateLineTargets(lines, appConfig, buyerIdentity, cart) {
  const rules =
    appConfig?.rules ??
    (appConfig ? [getTableForLine(null, appConfig)] : [normalizePricingTable(DEFAULT_PRICING_TABLE)]);
  const accountTiers = appConfig?.accountTiers ?? {};
  const tierKey = resolveBuyerTierKey(buyerIdentity, accountTiers, cart, lines);
  const targets = new Map();

  for (const line of lines) {
    for (const rule of rules) {
      const effectiveRule = applyAccountTier(rule, tierKey, accountTiers);
      const result = calculateLineMaterialTotal(line, effectiveRule);
      if (!result) continue;

      targets.set(
        line.id,
        buildLineTargetMessage(line, effectiveRule, result),
      );
      break;
    }
  }

  return targets;
}

/** @deprecated */
export function calculateAdjustedLineTargets(lines, config) {
  return calculateLineTargets(lines, {
    rules: [normalizePricingTable(config)],
  });
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

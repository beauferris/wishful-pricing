const WISHFUL_NS = "wishful";
const CATALOG_KEY = "pricing_catalog";
const PRODUCT_KEY = "pricing_config";
const FUNCTION_CONFIG_KEY = "function-configuration";
const METAFIELD_CHUNK = 25;

/**
 * @param {unknown} value
 * @returns {{ rules: object[]; accountTiers: Record<string, object> }}
 */
export function parseDiscountConfiguration(value) {
  if (value == null || value === "") {
    return { rules: [], accountTiers: {} };
  }

  try {
    let parsed = value;
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
    }

    if (!parsed || typeof parsed !== "object") {
      return { rules: [], accountTiers: {} };
    }

    const accountTiers =
      parsed.accountTiers &&
      typeof parsed.accountTiers === "object" &&
      !Array.isArray(parsed.accountTiers)
        ? parsed.accountTiers
        : {};

    if (Array.isArray(parsed.rules) && parsed.rules.length) {
      return { rules: parsed.rules, accountTiers };
    }

    if (Array.isArray(parsed.tables) && parsed.tables.length) {
      const preferred =
        parsed.tables.find((t) => t?.isDefault) ??
        parsed.tables.find(
          (t) => Array.isArray(t?.productIds) && t.productIds.length,
        ) ??
        parsed.tables[0];
      return preferred
        ? { rules: [preferred], accountTiers }
        : { rules: [], accountTiers };
    }

    if (
      parsed.rates?.length ||
      parsed.areaTiers?.length ||
      parsed.pricingMode
    ) {
      return { rules: [parsed], accountTiers };
    }

    return { rules: [], accountTiers };
  } catch {
    return { rules: [], accountTiers: {} };
  }
}

/**
 * @param {{ rule: object; accountTiers?: Record<string, object> }[] | object[]} entries
 * @returns {Record<string, object>}
 */
export function buildCatalogFromRules(entries) {
  /** @type {Record<string, object>} */
  const catalog = {};
  /** @type {Set<string>} */
  const accountTierKeys = new Set();

  for (const entry of entries) {
    const rule =
      entry && typeof entry === "object" && "rule" in entry
        ? entry.rule
        : entry;
    const accountTiers =
      entry && typeof entry === "object" && "rule" in entry
        ? entry.accountTiers ?? {}
        : {};

    if (!rule || typeof rule !== "object") continue;
    for (const tierKey of Object.keys(accountTiers ?? {})) {
      if (tierKey) accountTierKeys.add(String(tierKey));
    }
    const config = serializeRuleForStorefront(rule, accountTiers);

    for (const productId of rule.productIds ?? []) {
      if (!productId) continue;
      const numericId = String(productId).split("/").pop() ?? String(productId);
      catalog[numericId] = config;
      catalog[String(productId)] = config;
    }
  }

  if (accountTierKeys.size) {
    catalog.__wishfulAccountTierKeys = [...accountTierKeys];
  }

  return catalog;
}

/**
 * Product ids that were in the old catalog but not the new one (numeric + GID keys deduped).
 *
 * @param {Record<string, object>} oldCatalog
 * @param {Record<string, object>} newCatalog
 * @returns {string[]}
 */
export function collectOrphanProductOwnerIds(oldCatalog, newCatalog) {
  const stillActive = productOwnerIdsInCatalog(newCatalog);
  /** @type {Set<string>} */
  const orphans = new Set();

  for (const key of Object.keys(oldCatalog ?? {})) {
    const ownerId = toProductOwnerGid(key);
    if (!ownerId || stillActive.has(ownerId)) continue;
    orphans.add(ownerId);
  }

  return [...orphans];
}

/**
 * @param {Record<string, object>} catalog
 * @returns {Set<string>}
 */
function productOwnerIdsInCatalog(catalog) {
  /** @type {Set<string>} */
  const ids = new Set();

  for (const key of Object.keys(catalog ?? {})) {
    const ownerId = toProductOwnerGid(key);
    if (ownerId) ids.add(ownerId);
  }

  return ids;
}

/**
 * @param {string} key
 * @returns {string | null}
 */
function toProductOwnerGid(key) {
  const raw = String(key);
  if (raw.startsWith("gid://shopify/Product/")) return raw;
  if (raw.startsWith("gid://shopify/ProductVariant/")) return null;

  const numeric = raw.split("/").pop();
  if (numeric && /^\d+$/.test(numeric)) {
    return `gid://shopify/Product/${numeric}`;
  }

  return /^\d+$/.test(raw) ? `gid://shopify/Product/${raw}` : null;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, object>}
 */
function parseCatalogJson(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {(query: string, options?: { variables?: object }) => Promise<{ data?: object; errors?: { message?: string }[] }>} adminApiQuery
 * @param {{
 *   currentDiscountId?: string | null;
 *   currentRules?: object[];
 *   currentAccountTiers?: Record<string, object>;
 *   apiOnly?: boolean;
 *   activeOnly?: boolean;
 * }} [options]
 * @returns {Promise<{ rule: object; accountTiers: Record<string, object> }[]>}
 */
async function fetchAllWishfulCatalogEntries(adminApiQuery, options = {}) {
  const {
    currentDiscountId = null,
    currentRules = [],
    currentAccountTiers = {},
    apiOnly = false,
    activeOnly = false,
  } = options;
  const result = await adminApiQuery(
    `#graphql
    query WishfulDiscountConfigs($first: Int!) {
      discountNodes(first: $first) {
        nodes {
          id
          metafield(namespace: "$app", key: "${FUNCTION_CONFIG_KEY}") {
            value
          }
          discount {
            __typename
            ... on DiscountAutomaticApp {
              status
            }
          }
        }
      }
    }`,
    { variables: { first: 100 } },
  );

  const nodes = result?.data?.discountNodes?.nodes ?? [];
  /** @type {{ rule: object; accountTiers: Record<string, object> }[]} */
  const entries = [];

  for (const node of nodes) {
    if (node.discount?.__typename !== "DiscountAutomaticApp") continue;

    const status = node.discount?.status;
    if (status === "EXPIRED") continue;
    if (activeOnly && status !== "ACTIVE") continue;

    const isCurrent =
      currentDiscountId && String(node.id) === String(currentDiscountId);
    const parsed = parseDiscountConfiguration(node.metafield?.value);
    const rules =
      !apiOnly && isCurrent && currentRules?.length
        ? currentRules
        : parsed.rules;
    const accountTiers =
      !apiOnly && isCurrent && currentRules?.length
        ? currentAccountTiers
        : parsed.accountTiers;

    for (const rule of rules) {
      entries.push({ rule, accountTiers });
    }
  }

  if (
    !apiOnly &&
    currentDiscountId &&
    !nodes.some((n) => String(n.id) === String(currentDiscountId))
  ) {
    for (const rule of currentRules ?? []) {
      entries.push({ rule, accountTiers: currentAccountTiers });
    }
  }

  return entries;
}

/**
 * Product GIDs that still have a Wishful pricing_config metafield (for stale cleanup).
 *
 * @param {(query: string, options?: { variables?: object }) => Promise<{ data?: object; errors?: { message?: string }[] }>} adminApiQuery
 * @returns {Promise<string[]>}
 */
async function fetchProductOwnersWithPricingConfig(adminApiQuery) {
  /** @type {string[]} */
  const ownerIds = [];
  let after = null;

  for (;;) {
    const result = await adminApiQuery(
      `#graphql
      query WishfulProductsWithPricingConfig($first: Int!, $after: String, $query: String!) {
        products(first: $first, after: $after, query: $query) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
          }
        }
      }`,
      {
        variables: {
          first: 100,
          after,
          query: `metafields.${WISHFUL_NS}.${PRODUCT_KEY}:*`,
        },
      },
    );

    const connection = result?.data?.products;
    for (const node of connection?.nodes ?? []) {
      if (node?.id) ownerIds.push(node.id);
    }

    if (!connection?.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }

  return ownerIds;
}

/**
 * @param {string[]} productOwnerIds
 * @returns {{ ownerId: string; namespace: string; key: string }[]}
 */
function deleteInputsForProducts(productOwnerIds) {
  /** @type {{ ownerId: string; namespace: string; key: string }[]} */
  const inputs = [];

  for (const ownerId of productOwnerIds) {
    for (const namespace of ["$app", WISHFUL_NS]) {
      inputs.push({ ownerId, namespace, key: PRODUCT_KEY });
    }
  }

  return inputs;
}

/**
 * @param {(query: string, options?: { variables?: object }) => Promise<{ data?: object; errors?: { message?: string }[] }>} adminApiQuery
 */
export async function ensureWishfulMetafieldDefinitions(_adminApiQuery) {
  // App-owned metafields are declared in shopify.app.toml ($app namespace).
  // Merchant-owned "wishful" definitions cannot set access.admin via API.
  return null;
}

/**
 * Rebuild shop catalog from all active Wishful discounts and remove stale product metafields.
 * Does not require Save pricing — use after deleting a discount or removing products.
 *
 * @param {(query: string, options?: { variables?: object }) => Promise<{ data?: object; errors?: { message?: string }[] }>} adminApiQuery
 * @param {{ currentDiscountId?: string | null; currentRules?: object[] }} [options]
 */
export async function refreshStorefrontCatalog(adminApiQuery) {
  return syncProductPricingMetafields(
    {
      rules: [],
      previousProductIds: [],
      currentDiscountId: null,
      catalogOnly: true,
      rebuildFromApiOnly: true,
    },
    adminApiQuery,
  );
}

/**
 * @param {{
 *   rules: object[];
 *   accountTiers?: Record<string, object>;
 *   previousProductIds?: string[];
 *   currentDiscountId?: string | null;
 *   catalogOnly?: boolean;
 *   rebuildFromApiOnly?: boolean;
 * }} syncContext
 * @param {(query: string, options?: { variables?: object }) => Promise<{ data?: object; errors?: { message?: string }[] }>} adminApiQuery
 */
export async function syncProductPricingMetafields(syncContext, adminApiQuery) {
  const defError = await ensureWishfulMetafieldDefinitions(adminApiQuery);
  const errors = defError ? [defError] : [];

  const currentRules = syncContext.rules ?? [];
  const currentAccountTiers = syncContext.accountTiers ?? {};
  const allEntries = await fetchAllWishfulCatalogEntries(adminApiQuery, {
    currentDiscountId: syncContext.currentDiscountId,
    currentRules,
    currentAccountTiers,
    apiOnly: Boolean(syncContext.rebuildFromApiOnly),
    activeOnly: Boolean(syncContext.rebuildFromApiOnly),
  });

  const catalog = buildCatalogFromRules(allEntries);
  const activeProductIds = productOwnerIdsInCatalog(catalog);

  const shopResult = await adminApiQuery(
    `#graphql
    query WishfulShopCatalog {
      shop {
        id
        appCatalog: metafield(namespace: "$app", key: "pricing_catalog") {
          value
        }
        wishfulCatalog: metafield(namespace: "${WISHFUL_NS}", key: "${CATALOG_KEY}") {
          value
        }
      }
    }`,
  );

  const shopId = shopResult?.data?.shop?.id;
  if (!shopId) {
    errors.push("Could not load shop id for pricing catalog.");
  }

  /** @type {Record<string, object>} */
  let oldCatalog = {};
  for (const source of [
    shopResult?.data?.shop?.wishfulCatalog?.value,
    shopResult?.data?.shop?.appCatalog?.value,
  ]) {
    oldCatalog = { ...oldCatalog, ...parseCatalogJson(source) };
  }

  /** @type {Set<string>} */
  const toClear = new Set(collectOrphanProductOwnerIds(oldCatalog, catalog));

  if (syncContext.catalogOnly) {
    try {
      const withConfig = await fetchProductOwnersWithPricingConfig(adminApiQuery);
      for (const ownerId of withConfig) {
        if (!activeProductIds.has(ownerId)) toClear.add(ownerId);
      }
    } catch {
      /* product search optional; orphan catalog keys still cleared */
    }
  }

  const previousIds = syncContext.previousProductIds ?? [];
  const currentIds = new Set(
    (currentRules[0]?.productIds ?? []).map((id) => toProductOwnerGid(String(id))).filter(Boolean),
  );

  for (const productId of previousIds) {
    const ownerId = toProductOwnerGid(String(productId));
    if (!ownerId) continue;
    if (currentIds.has(ownerId)) continue;
    if (activeProductIds.has(ownerId)) continue;
    toClear.add(ownerId);
  }

  const deleteInputs = deleteInputsForProducts([...toClear]);
  for (let i = 0; i < deleteInputs.length; i += METAFIELD_CHUNK) {
    const chunk = deleteInputs.slice(i, i + METAFIELD_CHUNK);
    const result = await metafieldsDeleteChunk(adminApiQuery, chunk);
    errors.push(...result.errors);
  }

  const catalogJson = JSON.stringify(catalog);
  const catalogKeys = Object.keys(catalog).filter(
    (k) =>
      !k.startsWith("gid://shopify/ProductVariant/") &&
      !k.startsWith("__"),
  );

  if (shopId) {
    for (const ns of ["$app", WISHFUL_NS]) {
      const catalogResult = await metafieldsSetChunk(adminApiQuery, [
        {
          ownerId: shopId,
          namespace: ns,
          key: CATALOG_KEY,
          type: "json",
          value: catalogJson,
        },
      ]);
      for (const err of catalogResult.errors) {
        if (ns === WISHFUL_NS && err.includes("access control")) continue;
        errors.push(err);
      }
    }
  }

  /** @type {{ ownerId: string; namespace: string; key: string; type: string; value: string }[]} */
  const productMetafields = [];

  if (!syncContext.catalogOnly) {
  for (const rule of currentRules) {
    const config = serializeRuleForStorefront(rule, currentAccountTiers);
    const value = JSON.stringify(config);

    for (const productId of rule.productIds ?? []) {
      if (!productId) continue;

      productMetafields.push({
        ownerId: toProductOwnerGid(String(productId)) ?? String(productId),
        namespace: "$app",
        key: PRODUCT_KEY,
        type: "json",
        value,
      });
    }
  }
  }

  for (let i = 0; i < productMetafields.length; i += METAFIELD_CHUNK) {
    const chunk = productMetafields.slice(i, i + METAFIELD_CHUNK);
    const result = await metafieldsSetChunk(adminApiQuery, chunk);
    errors.push(...result.errors);
  }

  const cleared = toClear.size;
  const synced =
    productMetafields.length + (shopId ? 2 : 0) + deleteInputs.length;

  return {
    synced,
    catalogKeys: catalogKeys.length,
    cleared,
    errors,
  };
}

/**
 * @param {Function} adminApiQuery
 * @param {object[]} metafields
 */
async function metafieldsSetChunk(adminApiQuery, metafields) {
  const errors = [];
  const result = await adminApiQuery(
    `#graphql
    mutation WishfulSyncProductPricing($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
        }
        userErrors {
          field
          message
          code
        }
      }
    }`,
    { variables: { metafields } },
  );

  const gqlErrors = result?.errors ?? [];
  for (const err of gqlErrors) {
    errors.push(err.message ?? "GraphQL request failed");
  }

  const payload = result?.data?.metafieldsSet;
  if (!payload && !gqlErrors.length) {
    errors.push("metafieldsSet returned no data.");
  }

  for (const err of payload?.userErrors ?? []) {
    const detail = [err.message, err.code].filter(Boolean).join(" — ");
    errors.push(detail || "Unknown metafield error");
  }

  return { errors };
}

/**
 * @param {Function} adminApiQuery
 * @param {{ ownerId: string; namespace: string; key: string }[]} metafields
 */
async function metafieldsDeleteChunk(adminApiQuery, metafields) {
  const errors = [];
  if (!metafields.length) return { errors };

  const result = await adminApiQuery(
    `#graphql
    mutation WishfulMetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) {
        deletedMetafields {
          ownerId
          namespace
          key
        }
        userErrors {
          field
          message
        }
      }
    }`,
    { variables: { metafields } },
  );

  const gqlErrors = result?.errors ?? [];
  for (const err of gqlErrors) {
    errors.push(err.message ?? "GraphQL request failed");
  }

  for (const err of result?.data?.metafieldsDelete?.userErrors ?? []) {
    errors.push(err.message ?? "metafieldsDelete failed");
  }

  return { errors };
}

/** @param {Record<string, number[] | number[][]>} ratesByVariant */
function expandVariantRateKeys(ratesByVariant) {
  /** @type {Record<string, number[] | number[][]>} */
  const out = { ...ratesByVariant };

  for (const [key, row] of Object.entries(ratesByVariant)) {
    const numeric = key.split("/").pop();
    if (numeric && !out[numeric]) {
      out[numeric] = row;
    }
    if (numeric && !key.startsWith("gid://")) {
      const gid = `gid://shopify/ProductVariant/${numeric}`;
      if (!out[gid]) out[gid] = row;
    }
  }

  return out;
}

/**
 * @param {object} rule
 * @param {Record<string, object>} [accountTiers]
 */
function serializeRuleForStorefront(rule, accountTiers = {}) {
  return {
    pricingMode: rule.pricingMode ?? "area_quantity",
    productIds: rule.productIds ?? [],
    areaTiers: rule.areaTiers ?? [],
    quantityTiers: rule.quantityTiers ?? [],
    rates: rule.rates ?? [],
    ratesByVariant: expandVariantRateKeys(rule.ratesByVariant ?? {}),
    modifiers: Array.isArray(rule.modifiers) ? rule.modifiers : [],
    maxArea: rule.maxArea ?? 80,
    areaUnit: rule.areaUnit ?? "sq in",
    accountTiers: accountTiers ?? {},
  };
}

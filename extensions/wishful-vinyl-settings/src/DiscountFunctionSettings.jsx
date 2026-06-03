import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import {
  refreshStorefrontCatalog,
  syncProductPricingMetafields,
} from "./syncProductPricing.js";

function resizeRates(areaCount, qtyCount, existingRates) {
  const rates = [];
  for (let i = 0; i < areaCount; i++) {
    const source = Array.isArray(existingRates?.[i]) ? existingRates[i] : [];
    const row = [];
    for (let j = 0; j < qtyCount; j++) {
      row.push(typeof source[j] === "number" ? source[j] : 0);
    }
    rates.push(row);
  }
  return rates;
}

function maxAreaFromTiers(areaTiers, fallback = 80) {
  let max = fallback;
  for (const tier of areaTiers) {
    if (typeof tier.maxSqIn === "number" && tier.maxSqIn > max) {
      max = tier.maxSqIn;
    }
  }
  return max;
}

const PRICING_MODE_AREA = "area_quantity";
const PRICING_MODE_AREA_FLAT = "area_flat";
const PRICING_MODE_VOLUME = "quantity_only";

function isVolumeConfig(config) {
  return config?.pricingMode === PRICING_MODE_VOLUME;
}

function isAreaFlatConfig(config) {
  return config?.pricingMode === PRICING_MODE_AREA_FLAT;
}

const DEFAULT_AREA_TIERS = [
  { label: "Less than 20 sq in", maxSqIn: 20 },
  { label: "20–40 sq in", minSqIn: 20, maxSqIn: 40 },
  { label: "40–80 sq in", minSqIn: 40, maxSqIn: 80 },
];

const DEFAULT_QUANTITY_TIERS = [
  { label: "1–24", min: 1 },
  { label: "25–99", min: 25 },
  { label: "100–249", min: 100 },
  { label: "250–999", min: 250 },
  { label: "1000+", min: 1000 },
];

const DEFAULT_AREA_RATES = [
  [0.2, 0.14, 0.12, 0.09, 0.07],
  [0.17, 0.12, 0.09, 0.07, 0.06],
  [0.09, 0.07, 0.06, 0.05, 0.04],
];

const DEFAULT_VOLUME_RATES = [[5, 4.5, 4, 3.5, 3]];

const DEFAULT_AREA_FLAT_TIERS = [
  { label: "Small (up to 6 sq in)", maxSqIn: 6 },
  { label: "Medium (6–16 sq in)", minSqIn: 6, maxSqIn: 16 },
  { label: "Large (16–40 sq in)", minSqIn: 16, maxSqIn: 40 },
  { label: "Extra large (to 100 sq in)", minSqIn: 40, maxSqIn: 100 },
];

const DEFAULT_AREA_FLAT_RATES = [[3], [4], [6.5], [10.75]];

const AREA_FLAT_QUANTITY_TIERS = [{ label: "Per piece", min: 1 }];

const DEFAULT_CONFIG = normalizeConfig({});

function normalizeConfig(raw = {}) {
  const pricingMode =
    raw.pricingMode === PRICING_MODE_VOLUME
      ? PRICING_MODE_VOLUME
      : raw.pricingMode === PRICING_MODE_AREA_FLAT
        ? PRICING_MODE_AREA_FLAT
        : PRICING_MODE_AREA;
  const isVolume = pricingMode === PRICING_MODE_VOLUME;
  const isAreaFlat = pricingMode === PRICING_MODE_AREA_FLAT;

  const areaTiers = isVolume
    ? [{ label: "Volume pricing", maxSqIn: 999999 }]
    : isAreaFlat
      ? Array.isArray(raw.areaTiers) && raw.areaTiers.length
        ? raw.areaTiers
        : DEFAULT_AREA_FLAT_TIERS
      : Array.isArray(raw.areaTiers) && raw.areaTiers.length
        ? raw.areaTiers
        : DEFAULT_AREA_TIERS;

  let quantityTiers =
    Array.isArray(raw.quantityTiers) && raw.quantityTiers.length
      ? raw.quantityTiers
      : DEFAULT_QUANTITY_TIERS;

  const volumeHadSingleQtyTier =
    isVolume &&
    Array.isArray(raw.quantityTiers) &&
    raw.quantityTiers.length < 2;

  if (isAreaFlat) {
    quantityTiers = AREA_FLAT_QUANTITY_TIERS;
  }

  if (isVolume && quantityTiers.length < 2) {
    quantityTiers = DEFAULT_QUANTITY_TIERS.map((tier) => ({ ...tier }));
  }

  let rates = isVolume
    ? DEFAULT_VOLUME_RATES
    : isAreaFlat
      ? DEFAULT_AREA_FLAT_RATES
      : DEFAULT_AREA_RATES;
  if (isVolume && Array.isArray(raw.unitPrices) && raw.unitPrices.length) {
    rates = [raw.unitPrices];
  } else if (isVolume && volumeHadSingleQtyTier) {
    rates = resizeRates(1, quantityTiers.length, DEFAULT_VOLUME_RATES);
    const preserved = raw.rates?.[0]?.[0];
    if (typeof preserved === "number" && Number.isFinite(preserved)) {
      rates[0][0] = preserved;
    }
  } else if (Array.isArray(raw.rates) && raw.rates.length) {
    rates = isVolume ? [raw.rates[0]] : raw.rates;
  }

  if (isAreaFlat && !isVolume) {
    rates = rates.map((row) => [Array.isArray(row) ? (row[0] ?? 0) : 0]);
  }

  const normalizedRates = resizeRates(
    areaTiers.length,
    quantityTiers.length,
    rates,
  );
  const ratesByVariant = isVolume
    ? normalizeRatesByVariant(
        raw.ratesByVariant,
        quantityTiers.length,
        normalizedRates[0] ?? [],
      )
    : normalizeRatesByVariantMatrix(
        raw.ratesByVariant,
        areaTiers.length,
        quantityTiers.length,
        normalizedRates,
      );

  const modifiers = normalizeModifiers(raw.modifiers);

  return {
    productIds: Array.isArray(raw.productIds)
      ? raw.productIds.map(String)
      : [],
    pricingMode,
    areaTiers,
    quantityTiers,
    rates: normalizedRates,
    ratesByVariant,
    modifiers,
    maxArea: isVolume
      ? 999999
      : isAreaFlat
        ? maxAreaFromTiers(areaTiers, 100)
        : maxAreaFromTiers(areaTiers),
    areaUnit: String(raw.areaUnit ?? (isVolume ? "each" : "sq in")),
    accountTiers: normalizeAccountTiersMap(raw.accountTiers),
  };
}

function normalizeAccountTierEntry(raw) {
  if (!raw || typeof raw !== "object") {
    return { percentOff: 0 };
  }
  const pct = Number(
    raw.percentOff ?? raw.discountPercent ?? raw.percent ?? 0,
  );
  return {
    percentOff: Number.isFinite(pct)
      ? Math.min(100, Math.max(0, pct))
      : 0,
  };
}

function normalizeAccountTiersMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  /** @type {Record<string, { percentOff: number }>} */
  const out = {};

  for (const [key, value] of Object.entries(raw)) {
    const tierKey = String(key).trim();
    if (!tierKey || !value || typeof value !== "object") continue;
    out[tierKey] = normalizeAccountTierEntry(value);
  }

  return out;
}

function serializeAccountTiers(accountTiers) {
  /** @type {Record<string, { percentOff: number }>} */
  const out = {};

  for (const [key, tier] of Object.entries(accountTiers ?? {})) {
    const tierKey = String(key).trim();
    if (!tierKey || !tier) continue;
    out[tierKey] = normalizeAccountTierEntry(tier);
  }

  return out;
}

function normalizeModifiers(rawModifiers) {
  /** @type {{key: string, label: string, amountPerUnit: number}[]} */
  const out = [];

  if (!Array.isArray(rawModifiers)) return out;

  for (const entry of rawModifiers) {
    if (!entry || typeof entry !== "object") continue;
    const key = String(entry.key ?? "").trim();
    if (!key) continue;
    const amount = Number(entry.amountPerUnit);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const label = String(entry.label ?? key).trim() || key;
    out.push({ key, label, amountPerUnit: amount });
  }

  return out;
}

export default async () => {
  render(<App />, document.body);
};

function notifyFormDirty(inputEl) {
  if (!inputEl) return;
  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  inputEl.dispatchEvent(new Event("change", { bubbles: true }));
}

function SettingsCard({ heading, children }) {
  return (
    <s-box
      padding="base"
      background="base"
      borderRadius="base"
      borderWidth="base"
      borderColor="base"
    >
      <s-stack gap="base">
        <s-heading>{heading}</s-heading>
        {children}
      </s-stack>
    </s-box>
  );
}

const DEFAULT_RATES_PANEL_ID = "__default__";

function variantAccordionTitle(variant, i18n) {
  return i18n.translate("variantRateRow", {
    product: variant.productTitle,
    variant: variantLabel(variant),
  });
}

/**
 * Collapsible panels — one section open at a time (default + variants).
 *
 * @param {object} props
 * @param {{ id: string, title: string, content: import('preact').ComponentChildren }[]} props.panels
 * @param {string | null} props.expandedPanelId
 * @param {(id: string | null) => void} props.onExpandedChange
 * @param {import('@shopify/ui-extensions/admin.discount-details.function-settings.render').Api['i18n']} props.i18n
 */
function RatesMatrixAccordion({
  panels,
  expandedPanelId,
  onExpandedChange,
  i18n,
}) {
  if (!panels.length) return null;

  return (
    <s-stack gap="small">
      {panels.map((panel) => {
        const isOpen = expandedPanelId === panel.id;

        return (
          <s-box
            key={panel.id}
            borderWidth="base"
            borderRadius="base"
            borderColor="base"
            overflow="hidden"
          >
            <s-button
              variant="tertiary"
              onClick={() =>
                onExpandedChange(isOpen ? null : panel.id)
              }
            >
              {isOpen
                ? i18n.translate("variantAccordionCollapse", {
                    title: panel.title,
                  })
                : i18n.translate("variantAccordionExpand", {
                    title: panel.title,
                  })}
            </s-button>
            {isOpen ? (
              <s-box padding="base">{panel.content}</s-box>
            ) : null}
          </s-box>
        );
      })}
    </s-stack>
  );
}

function App() {
  const {
    applyExtensionMetafieldChange,
    i18n,
    resetForm,
    config,
    setConfig,
    loading,
    initialized,
    saveError,
    syncMessage,
    refreshStorefront,
    pickProducts,
    products,
    productIdsInputRef,
    formRevision,
  } = useExtensionData();

  if (loading || !initialized) {
    return <s-text>{i18n.translate("loading")}</s-text>;
  }

  const volumeMode = isVolumeConfig(config);
  const areaFlatMode = isAreaFlatConfig(config);
  const rateRows = volumeMode
    ? config.rates[0]
      ? [config.rates[0]]
      : [[]]
    : config.rates;
  const catalogVariants = products.flatMap((product) =>
    (product.variants ?? []).map((variant) => ({
      ...variant,
      productTitle: product.title,
    })),
  );
  const hasVariantRateRows = catalogVariants.length > 0;
  const variantIdsKey = catalogVariants.map((v) => v.id).join(",");
  const [expandedPanelId, setExpandedPanelId] = useState(null);

  useEffect(() => {
    if (!catalogVariants.length) {
      setExpandedPanelId(null);
      return;
    }
    const validIds = new Set([
      DEFAULT_RATES_PANEL_ID,
      ...catalogVariants.map((v) => v.id),
    ]);
    if (!expandedPanelId || !validIds.has(expandedPanelId)) {
      setExpandedPanelId(DEFAULT_RATES_PANEL_ID);
    }
  }, [variantIdsKey]);

  const productIdsValue = (config.productIds ?? []).join(",");

  return (
    <s-function-settings
      key={formRevision}
      onSubmit={(event) => {
        event.waitUntil?.(applyExtensionMetafieldChange());
      }}
      onReset={resetForm}
    >
      <input
        ref={productIdsInputRef}
        type="hidden"
        name="wishfulProductIds"
        value={productIdsValue}
        readOnly
      />

      <s-heading>
        {volumeMode ? i18n.translate("titleVolume") : i18n.translate("title")}
      </s-heading>
      <s-paragraph>
        {volumeMode ? i18n.translate("introVolume") : i18n.translate("intro")}
      </s-paragraph>

      {saveError ? (
        <s-banner tone="critical">{saveError}</s-banner>
      ) : null}

      {syncMessage ? (
        <s-banner tone={syncMessage.tone}>{syncMessage.text}</s-banner>
      ) : null}

      <s-stack gap="base">
        <SettingsCard heading={i18n.translate("productsHeading")}>
          <s-paragraph>{i18n.translate("productsHelp")}</s-paragraph>
          <s-banner tone="warning">
            {i18n.translate("productsMultiDiscount")}
          </s-banner>
          <s-button onClick={pickProducts}>
            {i18n.translate("pickProducts")}
          </s-button>
          {products.length > 0 ? (
            <s-stack gap="none">
              {products.map((product) => (
                <s-text key={product.id}>{product.title}</s-text>
              ))}
            </s-stack>
          ) : (
            <s-text>{i18n.translate("allProductsHint")}</s-text>
          )}
          <s-select
            label={i18n.translate("pricingMode")}
            name="wishfulPricingMode"
            value={config.pricingMode ?? PRICING_MODE_AREA}
            onChange={(event) =>
              setPricingMode(setConfig, event.currentTarget.value)
            }
          >
            <s-option value={PRICING_MODE_AREA}>
              {i18n.translate("pricingModeArea")}
            </s-option>
            <s-option value={PRICING_MODE_AREA_FLAT}>
              {i18n.translate("pricingModeAreaFlat")}
            </s-option>
            <s-option value={PRICING_MODE_VOLUME}>
              {i18n.translate("pricingModeVolume")}
            </s-option>
          </s-select>
          {volumeMode ? (
            <s-banner tone="info">{i18n.translate("volumeModeHint")}</s-banner>
          ) : null}
          {areaFlatMode ? (
            <s-banner tone="info">{i18n.translate("areaFlatModeHint")}</s-banner>
          ) : null}
        </SettingsCard>

        <SettingsCard heading={i18n.translate("accountPricingHeading")}>
          <s-paragraph>{i18n.translate("accountPricingHelp")}</s-paragraph>
          <s-banner tone="info">
            {i18n.translate("accountPricingMetafieldHint")}
          </s-banner>
          <s-stack gap="base">
            {Object.entries(config.accountTiers ?? {}).map(
              ([tierKey, tierConfig]) => (
                <s-box
                  key={`acct-${tierKey}`}
                  padding="base"
                  background="subdued"
                  borderRadius="base"
                  borderWidth="base"
                  borderColor="base"
                >
                  <s-stack gap="base">
                    <s-grid
                      gridTemplateColumns="minmax(12rem, 1.5fr) 9rem"
                      gap="base"
                      alignItems="end"
                    >
                      <s-text-field
                        label={i18n.translate("accountTierKeyLabel")}
                        value={tierKey}
                        onChange={(event) =>
                          updateAccountTierKey(
                            setConfig,
                            tierKey,
                            event.currentTarget.value,
                          )
                        }
                      />
                      <s-number-field
                        label={i18n.translate("accountTierPercentLabel")}
                        value={String(tierConfig.percentOff ?? 0)}
                        min={0}
                        max={100}
                        step={1}
                        suffix="%"
                        onChange={(event) =>
                          updateAccountTierPercent(
                            setConfig,
                            tierKey,
                            event.currentTarget.value,
                          )
                        }
                      />
                    </s-grid>
                    <s-button
                      variant="secondary"
                      onClick={() => removeAccountTier(setConfig, tierKey)}
                    >
                      {i18n.translate("removeAccountTier")}
                    </s-button>
                  </s-stack>
                </s-box>
              ),
            )}
            <s-button
              variant="primary"
              onClick={() => addAccountTier(setConfig)}
            >
              {i18n.translate("addAccountTier")}
            </s-button>
          </s-stack>
        </SettingsCard>

        {!volumeMode ? (
          <SettingsCard heading={i18n.translate("areaHeading")}>
            <s-paragraph>{i18n.translate("areaHelp")}</s-paragraph>
            <s-stack gap="small">
              {config.areaTiers.map((tier, areaIndex) => (
                <s-grid
                  key={`area-${areaIndex}`}
                  gridTemplateColumns={
                    config.areaTiers.length > 1
                      ? "minmax(12rem, 1.5fr) 9rem 9rem auto"
                      : "minmax(12rem, 1.5fr) 9rem 9rem"
                  }
                  gap="base"
                  alignItems="end"
                >
                  <s-text-field
                    label={i18n.translate("areaLabel")}
                    value={tier.label ?? ""}
                    onChange={(event) =>
                      updateAreaTier(
                        setConfig,
                        areaIndex,
                        "label",
                        event.currentTarget.value,
                      )
                    }
                  />
                  <s-number-field
                    label={i18n.translate("areaMin")}
                    value={tier.minSqIn != null ? String(tier.minSqIn) : ""}
                    min={0}
                    step={0.1}
                    suffix="sq in"
                    onChange={(event) =>
                      updateAreaTier(
                        setConfig,
                        areaIndex,
                        "minSqIn",
                        event.currentTarget.value,
                      )
                    }
                  />
                  <s-number-field
                    label={i18n.translate("areaMax")}
                    value={tier.maxSqIn != null ? String(tier.maxSqIn) : ""}
                    min={0}
                    step={0.1}
                    suffix="sq in"
                    onChange={(event) =>
                      updateAreaTier(
                        setConfig,
                        areaIndex,
                        "maxSqIn",
                        event.currentTarget.value,
                      )
                    }
                  />
                  {config.areaTiers.length > 1 ? (
                    <s-button
                      variant="tertiary"
                      onClick={() => removeAreaTier(setConfig, areaIndex)}
                    >
                      {i18n.translate("remove")}
                    </s-button>
                  ) : null}
                </s-grid>
              ))}
            </s-stack>
            <s-button onClick={() => addAreaTier(setConfig)}>
              {i18n.translate("addAreaTier")}
            </s-button>
          </SettingsCard>
        ) : null}

        {!areaFlatMode ? (
        <SettingsCard
          heading={
            volumeMode
              ? i18n.translate("qtyHeadingVolume")
              : i18n.translate("qtyHeading")
          }
        >
          <s-paragraph>
            {volumeMode
              ? i18n.translate("qtyHelpVolume")
              : i18n.translate("qtyHelp")}
          </s-paragraph>
          <s-stack gap="small">
            {config.quantityTiers.map((tier, qtyIndex) => (
              <s-grid
                key={`qty-${qtyIndex}`}
                gridTemplateColumns={
                  config.quantityTiers.length > 1
                    ? "minmax(12rem, 1.5fr) 9rem auto"
                    : "minmax(12rem, 1.5fr) 9rem"
                }
                gap="base"
                alignItems="end"
              >
                <s-text-field
                  label={i18n.translate("qtyLabel")}
                  value={tier.label ?? ""}
                  onChange={(event) =>
                    updateQuantityTier(
                      setConfig,
                      qtyIndex,
                      "label",
                      event.currentTarget.value,
                    )
                  }
                />
                <s-number-field
                  label={i18n.translate("qtyMin")}
                  value={String(tier.min ?? 1)}
                  min={1}
                  step={1}
                  onChange={(event) =>
                    updateQuantityTier(
                      setConfig,
                      qtyIndex,
                      "min",
                      event.currentTarget.value,
                    )
                  }
                />
                {config.quantityTiers.length > 1 ? (
                  <s-button
                    variant="tertiary"
                    onClick={() => removeQuantityTier(setConfig, qtyIndex)}
                  >
                    {i18n.translate("remove")}
                  </s-button>
                ) : null}
              </s-grid>
            ))}
          </s-stack>
          <s-button onClick={() => addQuantityTier(setConfig)}>
            {i18n.translate("addQtyTier")}
          </s-button>
        </SettingsCard>
        ) : null}

        <SettingsCard
          heading={
            volumeMode
              ? i18n.translate("matrixHeadingVolume")
              : areaFlatMode
                ? i18n.translate("matrixHeadingAreaFlat")
                : i18n.translate("matrixHeading")
          }
        >
          <s-paragraph>
            {volumeMode
              ? i18n.translate("volumeMatrixHelp")
              : areaFlatMode
                ? i18n.translate("matrixHelpAreaFlat")
                : i18n.translate("matrixHelp")}
          </s-paragraph>
          {areaFlatMode ? (
            <s-stack gap="base">
              {hasVariantRateRows ? (
                <RatesMatrixAccordion
                  expandedPanelId={expandedPanelId}
                  onExpandedChange={setExpandedPanelId}
                  i18n={i18n}
                  panels={[
                    {
                      id: DEFAULT_RATES_PANEL_ID,
                      title: i18n.translate("variantRatesDefaultHeading"),
                      content: (
                        <s-stack gap="small">
                          <s-text>
                            {i18n.translate("variantRatesFallback")}
                          </s-text>
                          {config.areaTiers.map((tier, areaIndex) => (
                            <s-grid
                              key={`flat-rate-${areaIndex}`}
                              gridTemplateColumns="minmax(12rem, 1.5fr) 9rem"
                              gap="base"
                              alignItems="end"
                            >
                              <s-text type="strong">{tier.label}</s-text>
                              <s-number-field
                                label={i18n.translate("areaFlatPriceLabel")}
                                value={String(config.rates[areaIndex]?.[0] ?? 0)}
                                min={0}
                                step={0.01}
                                prefix="$"
                                onChange={(event) =>
                                  updateRate(
                                    setConfig,
                                    areaIndex,
                                    0,
                                    event.currentTarget.value,
                                  )
                                }
                              />
                            </s-grid>
                          ))}
                        </s-stack>
                      ),
                    },
                    ...catalogVariants.map((variant) => ({
                      id: variant.id,
                      title: variantAccordionTitle(variant, i18n),
                      content: (
                        <s-stack gap="small">
                          {config.areaTiers.map((tier, areaIndex) => (
                            <s-grid
                              key={`${variant.id}-flat-${areaIndex}`}
                              gridTemplateColumns="minmax(12rem, 1.5fr) 9rem"
                              gap="base"
                              alignItems="end"
                            >
                              <s-text type="strong">{tier.label}</s-text>
                              <s-number-field
                                label={i18n.translate("areaFlatPriceLabel")}
                                value={String(
                                  variantRatesMatrix(config, variant.id)[
                                    areaIndex
                                  ]?.[0] ?? 0,
                                )}
                                min={0}
                                step={0.01}
                                prefix="$"
                                onChange={(event) =>
                                  updateVariantMatrixRate(
                                    setConfig,
                                    variant.id,
                                    areaIndex,
                                    0,
                                    event.currentTarget.value,
                                  )
                                }
                              />
                            </s-grid>
                          ))}
                        </s-stack>
                      ),
                    })),
                  ]}
                />
              ) : (
                config.areaTiers.map((tier, areaIndex) => (
                  <s-grid
                    key={`flat-rate-${areaIndex}`}
                    gridTemplateColumns="minmax(12rem, 1.5fr) 9rem"
                    gap="base"
                    alignItems="end"
                  >
                    <s-text type="strong">{tier.label}</s-text>
                    <s-number-field
                      label={i18n.translate("areaFlatPriceLabel")}
                      value={String(config.rates[areaIndex]?.[0] ?? 0)}
                      min={0}
                      step={0.01}
                      prefix="$"
                      onChange={(event) =>
                        updateRate(
                          setConfig,
                          areaIndex,
                          0,
                          event.currentTarget.value,
                        )
                      }
                    />
                  </s-grid>
                ))
              )}
            </s-stack>
          ) : volumeMode ? (
            <s-stack gap="base">
              {hasVariantRateRows ? (
                <RatesMatrixAccordion
                  expandedPanelId={expandedPanelId}
                  onExpandedChange={setExpandedPanelId}
                  i18n={i18n}
                  panels={[
                    {
                      id: DEFAULT_RATES_PANEL_ID,
                      title: i18n.translate("variantRatesDefaultHeading"),
                      content: (
                        <s-stack gap="small">
                          <s-text>
                            {i18n.translate("variantRatesFallback")}
                          </s-text>
                          <s-grid
                            gridTemplateColumns="repeat(4, 1fr)"
                            gap="base"
                            alignItems="end"
                          >
                            {(rateRows[0] ?? []).map((rate, qtyIndex) => (
                              <s-number-field
                                key={`vol-fallback-${qtyIndex}`}
                                label={
                                  config.quantityTiers[qtyIndex]?.label ??
                                  `Qty ${qtyIndex + 1}`
                                }
                                value={String(rate)}
                                min={0}
                                step={0.01}
                                prefix="$"
                                onChange={(event) =>
                                  updateRate(
                                    setConfig,
                                    0,
                                    qtyIndex,
                                    event.currentTarget.value,
                                  )
                                }
                              />
                            ))}
                          </s-grid>
                        </s-stack>
                      ),
                    },
                    ...catalogVariants.map((variant) => ({
                      id: variant.id,
                      title: variantAccordionTitle(variant, i18n),
                      content: (
                        <s-grid
                          gridTemplateColumns="repeat(4, 1fr)"
                          gap="base"
                          alignItems="end"
                        >
                          {(
                            config.ratesByVariant?.[variant.id] ??
                            config.rates[0] ??
                            []
                          ).map((rate, qtyIndex) => (
                            <s-number-field
                              key={`${variant.id}-${qtyIndex}`}
                              label={
                                config.quantityTiers[qtyIndex]?.label ??
                                `Qty ${qtyIndex + 1}`
                              }
                              value={String(rate)}
                              min={0}
                              step={0.01}
                              prefix="$"
                              onChange={(event) =>
                                updateVariantRate(
                                  setConfig,
                                  variant.id,
                                  qtyIndex,
                                  event.currentTarget.value,
                                )
                              }
                            />
                          ))}
                        </s-grid>
                      ),
                    })),
                  ]}
                />
              ) : (
                <s-grid
                  gridTemplateColumns="repeat(4, 1fr)"
                  gap="base"
                  alignItems="end"
                >
                  {(rateRows[0] ?? []).map((rate, qtyIndex) => (
                    <s-number-field
                      key={`vol-fallback-${qtyIndex}`}
                      label={
                        config.quantityTiers[qtyIndex]?.label ??
                        `Qty ${qtyIndex + 1}`
                      }
                      value={String(rate)}
                      min={0}
                      step={0.01}
                      prefix="$"
                      onChange={(event) =>
                        updateRate(
                          setConfig,
                          0,
                          qtyIndex,
                          event.currentTarget.value,
                        )
                      }
                    />
                  ))}
                </s-grid>
              )}
            </s-stack>
          ) : (
            <s-stack gap="base">
              {hasVariantRateRows ? (
                <RatesMatrixAccordion
                  expandedPanelId={expandedPanelId}
                  onExpandedChange={setExpandedPanelId}
                  i18n={i18n}
                  panels={[
                    {
                      id: DEFAULT_RATES_PANEL_ID,
                      title: i18n.translate("variantRatesDefaultHeading"),
                      content: (
                        <s-stack gap="base">
                          <s-text>
                            {i18n.translate("variantRatesFallback")}
                          </s-text>
                          {rateRows.map((row, areaIndex) => (
                            <s-stack key={`rates-${areaIndex}`} gap="small">
                              <s-text type="strong">
                                {config.areaTiers[areaIndex]?.label ??
                                  `Row ${areaIndex + 1}`}
                              </s-text>
                              <s-grid
                                gridTemplateColumns="repeat(4, 1fr)"
                                gap="base"
                                alignItems="end"
                              >
                                {row.map((rate, qtyIndex) => (
                                  <s-number-field
                                    key={`${areaIndex}-${qtyIndex}`}
                                    label={
                                      config.quantityTiers[qtyIndex]?.label ??
                                      `Qty ${qtyIndex + 1}`
                                    }
                                    value={String(rate)}
                                    min={0}
                                    step={0.01}
                                    prefix="$"
                                    suffix="/sq in"
                                    onChange={(event) =>
                                      updateRate(
                                        setConfig,
                                        areaIndex,
                                        qtyIndex,
                                        event.currentTarget.value,
                                      )
                                    }
                                  />
                                ))}
                              </s-grid>
                            </s-stack>
                          ))}
                        </s-stack>
                      ),
                    },
                    ...catalogVariants.map((variant) => ({
                      id: variant.id,
                      title: variantAccordionTitle(variant, i18n),
                      content: (
                        <s-stack gap="base">
                          {variantRatesMatrix(config, variant.id).map(
                            (row, areaIndex) => (
                              <s-stack
                                key={`${variant.id}-area-${areaIndex}`}
                                gap="small"
                              >
                                <s-text type="strong">
                                  {config.areaTiers[areaIndex]?.label ??
                                    `Row ${areaIndex + 1}`}
                                </s-text>
                                <s-grid
                                  gridTemplateColumns="repeat(4, 1fr)"
                                  gap="base"
                                  alignItems="end"
                                >
                                  {row.map((rate, qtyIndex) => (
                                    <s-number-field
                                      key={`${variant.id}-${areaIndex}-${qtyIndex}`}
                                      label={
                                        config.quantityTiers[qtyIndex]
                                          ?.label ?? `Qty ${qtyIndex + 1}`
                                      }
                                      value={String(rate)}
                                      min={0}
                                      step={0.01}
                                      prefix="$"
                                      suffix="/sq in"
                                      onChange={(event) =>
                                        updateVariantMatrixRate(
                                          setConfig,
                                          variant.id,
                                          areaIndex,
                                          qtyIndex,
                                          event.currentTarget.value,
                                        )
                                      }
                                    />
                                  ))}
                                </s-grid>
                              </s-stack>
                            ),
                          )}
                        </s-stack>
                      ),
                    })),
                  ]}
                />
              ) : (
                rateRows.map((row, areaIndex) => (
                  <s-stack key={`rates-${areaIndex}`} gap="small">
                    <s-text type="strong">
                      {config.areaTiers[areaIndex]?.label ??
                        `Row ${areaIndex + 1}`}
                    </s-text>
                    <s-grid
                      gridTemplateColumns="repeat(4, 1fr)"
                      gap="base"
                      alignItems="end"
                    >
                      {row.map((rate, qtyIndex) => (
                        <s-number-field
                          key={`${areaIndex}-${qtyIndex}`}
                          label={
                            config.quantityTiers[qtyIndex]?.label ??
                            `Qty ${qtyIndex + 1}`
                          }
                          value={String(rate)}
                          min={0}
                          step={0.01}
                          prefix="$"
                          suffix="/sq in"
                          onChange={(event) =>
                            updateRate(
                              setConfig,
                              areaIndex,
                              qtyIndex,
                              event.currentTarget.value,
                            )
                          }
                        />
                      ))}
                    </s-grid>
                  </s-stack>
                ))
              )}
            </s-stack>
          )}
        </SettingsCard>
      </s-stack>

      <s-section heading={i18n.translate("optionsHeading")}>
        <s-stack gap="base">
          <SettingsCard heading={i18n.translate("modifiersHeading")}>
            <s-paragraph>{i18n.translate("modifiersHelp")}</s-paragraph>
            <s-stack gap="base">
              {(config.modifiers ?? []).map((m, i) => (
                <s-box
                  key={`mod-${i}`}
                  padding="base"
                  background="subdued"
                  borderRadius="base"
                  borderWidth="base"
                  borderColor="base"
                >
                  <s-stack gap="base">
                    <s-grid
                      gridTemplateColumns="minmax(10rem, 2fr) minmax(9rem, 1fr)"
                      gap="base"
                      alignItems="end"
                    >
                      <s-text-field
                        label={i18n.translate("modifierLabelLabel")}
                        value={String(m.label ?? "")}
                        onChange={(event) =>
                          updateModifier(setConfig, i, {
                            label: event.currentTarget.value,
                          })
                        }
                      />
                      <s-text-field
                        label={i18n.translate("modifierKeyLabel")}
                        value={String(m.key ?? "")}
                        onChange={(event) =>
                          updateModifier(setConfig, i, {
                            key: event.currentTarget.value,
                          })
                        }
                      />
                    </s-grid>
                    <s-number-field
                      label={i18n.translate("modifierAmountLabel")}
                      value={String(m.amountPerUnit ?? 0)}
                      step={0.01}
                      prefix="$"
                      onChange={(event) =>
                        updateModifier(setConfig, i, {
                          amountPerUnit: Number(event.currentTarget.value) || 0,
                        })
                      }
                    />
                    <s-button
                      variant="secondary"
                      onClick={() => removeModifier(setConfig, i)}
                    >
                      {i18n.translate("removeModifier")}
                    </s-button>
                  </s-stack>
                </s-box>
              ))}

              <s-button
                variant="primary"
                onClick={() => addModifier(setConfig)}
              >
                {i18n.translate("addModifier")}
              </s-button>
            </s-stack>
          </SettingsCard>
        </s-stack>
      </s-section>

      <s-banner tone="info">
        {volumeMode ? i18n.translate("volumeTierHint") : i18n.translate("tierHint")}
      </s-banner>

      <s-section>
        <s-stack gap="base">
          <s-stack direction="inline" gap="base">
            <s-button
              variant="primary"
              disabled={loading}
              onClick={() => applyExtensionMetafieldChange()}
            >
              {i18n.translate("saveButton")}
            </s-button>
            <s-button
              variant="secondary"
              disabled={loading}
              onClick={() => refreshStorefront()}
            >
              {i18n.translate("refreshStorefrontButton")}
            </s-button>
          </s-stack>
          <s-text>{i18n.translate("saveButtonHint")}</s-text>
          <s-text>{i18n.translate("refreshStorefrontHint")}</s-text>
        </s-stack>
      </s-section>
    </s-function-settings>
  );
}

function mutateConfig(setConfig, mutator) {
  setConfig((prev) => mutator(prev));
}

function updateConfig(setConfig, patch) {
  mutateConfig(setConfig, (c) => ({ ...c, ...patch }));
}

function addAccountTier(setConfig) {
  mutateConfig(setConfig, (c) => {
    const tiers = { ...(c.accountTiers ?? {}) };
    let key = "wholesale";
    let n = 1;
    while (tiers[key]) {
      key = `account${n}`;
      n += 1;
    }
    tiers[key] = { percentOff: 10 };
    return { ...c, accountTiers: tiers };
  });
}

function removeAccountTier(setConfig, tierKey) {
  mutateConfig(setConfig, (c) => {
    const tiers = { ...(c.accountTiers ?? {}) };
    delete tiers[tierKey];
    return { ...c, accountTiers: tiers };
  });
}

function updateAccountTierKey(setConfig, oldKey, newKey) {
  const key = String(newKey).trim();
  if (!key || key === oldKey) return;
  mutateConfig(setConfig, (c) => {
    const tiers = { ...(c.accountTiers ?? {}) };
    if (!tiers[oldKey] || tiers[key]) return c;
    tiers[key] = tiers[oldKey];
    delete tiers[oldKey];
    return { ...c, accountTiers: tiers };
  });
}

function updateAccountTierPercent(setConfig, tierKey, value) {
  const percent = Math.min(100, Math.max(0, Number(value) || 0));
  mutateConfig(setConfig, (c) => {
    const tiers = { ...(c.accountTiers ?? {}) };
    if (!tiers[tierKey]) return c;
    tiers[tierKey] = { percentOff: percent };
    return { ...c, accountTiers: tiers };
  });
}

function updateModifier(setConfig, index, patch) {
  mutateConfig(setConfig, (c) => {
    const modifiers = Array.isArray(c.modifiers) ? [...c.modifiers] : [];
    const current = modifiers[index] ?? {
      key: "",
      label: "",
      amountPerUnit: 0,
    };
    modifiers[index] = { ...current, ...patch };
    return { ...c, modifiers };
  });
}

function removeModifier(setConfig, index) {
  mutateConfig(setConfig, (c) => {
    const modifiers = Array.isArray(c.modifiers) ? [...c.modifiers] : [];
    modifiers.splice(index, 1);
    return { ...c, modifiers };
  });
}

function addModifier(setConfig) {
  mutateConfig(setConfig, (c) => {
    const modifiers = Array.isArray(c.modifiers) ? [...c.modifiers] : [];
    modifiers.push({
      key: "",
      label: "",
      amountPerUnit: 0,
    });
    return { ...c, modifiers };
  });
}

function setPricingMode(setConfig, mode) {
  mutateConfig(setConfig, (c) => {
    if (mode === PRICING_MODE_VOLUME) {
      const areaTiers = [{ label: "Volume pricing", maxSqIn: 999999 }];
      const quantityTiers =
        c.pricingMode === PRICING_MODE_AREA_FLAT ||
        !Array.isArray(c.quantityTiers) ||
        c.quantityTiers.length < 2
          ? DEFAULT_QUANTITY_TIERS.map((tier) => ({ ...tier }))
          : c.quantityTiers;
      const rateSource =
        c.pricingMode === PRICING_MODE_AREA_FLAT
          ? DEFAULT_VOLUME_RATES
          : c.pricingMode === PRICING_MODE_VOLUME
            ? [c.rates[0] ?? []]
            : [c.rates[0] ?? DEFAULT_VOLUME_RATES[0]];
      const rates = resizeRates(1, quantityTiers.length, rateSource);
      return {
        ...c,
        pricingMode: PRICING_MODE_VOLUME,
        areaTiers,
        quantityTiers,
        rates,
        maxArea: 999999,
        areaUnit: "each",
      };
    }

    if (mode === PRICING_MODE_AREA_FLAT) {
      const areaTiers = DEFAULT_AREA_FLAT_TIERS;
      const quantityTiers = AREA_FLAT_QUANTITY_TIERS;
      const rates = resizeRates(
        areaTiers.length,
        quantityTiers.length,
        DEFAULT_AREA_FLAT_RATES,
      );
      return {
        ...c,
        pricingMode: PRICING_MODE_AREA_FLAT,
        areaTiers,
        quantityTiers,
        rates,
        ratesByVariant: {},
        maxArea: maxAreaFromTiers(areaTiers, 100),
        areaUnit: "sq in",
      };
    }

    const areaTiers =
      c.areaTiers.length > 1 && c.pricingMode !== PRICING_MODE_VOLUME
        ? c.areaTiers
        : DEFAULT_AREA_TIERS;
    const rates = resizeRates(areaTiers.length, c.quantityTiers.length, [
      c.rates[0],
      ...c.rates.slice(1),
    ]);
    return {
      ...c,
      pricingMode: PRICING_MODE_AREA,
      areaTiers,
      rates,
      ratesByVariant: {},
      maxArea: maxAreaFromTiers(areaTiers),
      areaUnit: "sq in",
    };
  });
}

function updateRate(setConfig, areaIndex, qtyIndex, value) {
  mutateConfig(setConfig, (c) => {
    const rates = c.rates.map((row, i) =>
      i === areaIndex
        ? row.map((cell, j) => (j === qtyIndex ? Number(value) || 0 : cell))
        : [...row],
    );
    return { ...c, rates };
  });
}

function updateVariantRate(setConfig, variantId, qtyIndex, value) {
  mutateConfig(setConfig, (c) => {
    const fallback = c.rates[0] ?? [];
    const current = c.ratesByVariant?.[variantId] ?? [...fallback];
    const row = current.map((cell, j) =>
      j === qtyIndex ? Number(value) || 0 : cell,
    );
    return {
      ...c,
      ratesByVariant: {
        ...(c.ratesByVariant ?? {}),
        [variantId]: row,
      },
    };
  });
}

function updateVariantMatrixRate(
  setConfig,
  variantId,
  areaIndex,
  qtyIndex,
  value,
) {
  mutateConfig(setConfig, (c) => {
    const qtyCols =
      c.pricingMode === PRICING_MODE_AREA_FLAT ? 1 : c.quantityTiers.length;
    const matrix = variantRatesMatrix(c, variantId).map((row, i) =>
      i === areaIndex
        ? row.map((cell, j) =>
            j === qtyIndex ? Number(value) || 0 : cell,
          )
        : [...row],
    );
    return {
      ...c,
      ratesByVariant: {
        ...(c.ratesByVariant ?? {}),
        [variantId]: matrix,
      },
    };
  });
}

function resizeAllVariantRateMatrices(config, areaCount, qtyCount) {
  const ratesByVariant = config.ratesByVariant;
  if (!ratesByVariant || typeof ratesByVariant !== "object") return null;

  /** @type {Record<string, number[][] | number[]>} */
  const next = {};
  let changed = false;

  for (const [id, entry] of Object.entries(ratesByVariant)) {
    if (config.pricingMode === PRICING_MODE_VOLUME) {
      const row = normalizeVariantRateRow(
        entry,
        qtyCount,
        config.rates[0] ?? [],
      );
      if (JSON.stringify(row) !== JSON.stringify(entry)) changed = true;
      next[id] = row;
    } else {
      const matrix = resizeRates(
        areaCount,
        qtyCount,
        isVariantRatesMatrix(entry)
          ? entry
          : Array.isArray(entry) && typeof entry[0] === "number"
            ? entry.map((n) => [n])
            : config.rates,
      );
      if (JSON.stringify(matrix) !== JSON.stringify(entry)) changed = true;
      next[id] = matrix;
    }
  }

  return changed ? next : null;
}

function normalizeRatesByVariant(raw, qtyCount, fallbackRow) {
  if (!raw || typeof raw !== "object") return {};

  const fallback = Array.isArray(fallbackRow) ? fallbackRow : [];
  /** @type {Record<string, number[]>} */
  const out = {};

  for (const [key, row] of Object.entries(raw)) {
    out[String(key)] = normalizeVariantRateRow(row, qtyCount, fallback);
  }

  return out;
}

function normalizeRatesByVariantMatrix(raw, areaCount, qtyCount, fallbackMatrix) {
  if (!raw || typeof raw !== "object") return {};

  /** @type {Record<string, number[][]>} */
  const out = {};

  for (const [key, entry] of Object.entries(raw)) {
    let matrix = entry;
    if (
      Array.isArray(entry) &&
      entry.length &&
      typeof entry[0] === "number"
    ) {
      matrix = entry.map((n) => [typeof n === "number" ? n : 0]);
    }
    out[String(key)] = resizeRates(areaCount, qtyCount, matrix);
  }

  return out;
}

function isVariantRatesMatrix(entry) {
  return Array.isArray(entry) && entry.length > 0 && Array.isArray(entry[0]);
}

function variantRatesMatrix(config, variantId) {
  const qtyCols =
    config.pricingMode === PRICING_MODE_AREA_FLAT
      ? 1
      : config.quantityTiers.length;
  const entry = config.ratesByVariant?.[variantId];
  if (isVariantRatesMatrix(entry)) {
    return resizeRates(config.areaTiers.length, qtyCols, entry);
  }
  return resizeRates(config.areaTiers.length, qtyCols, config.rates);
}

function normalizeVariantRateRow(row, qtyCount, fallbackRow) {
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

function variantLabel(variant) {
  const options = (variant.selectedOptions ?? [])
    .map((o) => o?.value)
    .filter(Boolean);
  if (options.length) return options.join(" / ");
  if (variant.title && variant.title !== "Default Title") {
    return variant.title;
  }
  return variant.id?.split("/").pop() ?? "Variant";
}

function ensureVariantRates(config, products) {
  const allVariants = products.flatMap((p) => p.variants ?? []);
  if (!allVariants.length) return config;

  const isVolume = config.pricingMode === PRICING_MODE_VOLUME;
  const qtyCols = isVolume
    ? config.quantityTiers.length
    : config.pricingMode === PRICING_MODE_AREA_FLAT
      ? 1
      : config.quantityTiers.length;

  const ratesByVariant = { ...(config.ratesByVariant ?? {}) };
  const activeIds = new Set(allVariants.map((v) => v.id));
  let changed = false;
  const volumeFallback = config.rates[0] ?? [];

  for (const variant of allVariants) {
    if (isVolume) {
      if (!ratesByVariant[variant.id]) {
        ratesByVariant[variant.id] = [...volumeFallback];
        changed = true;
      } else {
        const resized = normalizeVariantRateRow(
          ratesByVariant[variant.id],
          qtyCols,
          volumeFallback,
        );
        if (
          JSON.stringify(resized) !==
          JSON.stringify(ratesByVariant[variant.id])
        ) {
          ratesByVariant[variant.id] = resized;
          changed = true;
        }
      }
    } else {
      const existing = ratesByVariant[variant.id];
      const matrix = resizeRates(
        config.areaTiers.length,
        qtyCols,
        isVariantRatesMatrix(existing)
          ? existing
          : Array.isArray(existing) && typeof existing[0] === "number"
            ? existing.map((n) => [n])
            : config.rates,
      );
      if (!existing || JSON.stringify(matrix) !== JSON.stringify(existing)) {
        ratesByVariant[variant.id] = matrix;
        changed = true;
      }
    }
  }

  for (const id of Object.keys(ratesByVariant)) {
    if (!activeIds.has(id)) {
      delete ratesByVariant[id];
      changed = true;
    }
  }

  return changed ? { ...config, ratesByVariant } : config;
}

function updateAreaTier(setConfig, areaIndex, field, value) {
  mutateConfig(setConfig, (c) => {
    const areaTiers = c.areaTiers.map((tier, i) => {
      if (i !== areaIndex) return tier;
      const next = { ...tier, [field]: value };
      if (field === "minSqIn" || field === "maxSqIn") {
        const n = Number(value);
        next[field] = value === "" || !Number.isFinite(n) ? undefined : n;
      }
      return next;
    });
    return {
      ...c,
      areaTiers,
      maxArea: maxAreaFromTiers(areaTiers),
    };
  });
}

function updateQuantityTier(setConfig, qtyIndex, field, value) {
  mutateConfig(setConfig, (c) => {
    const quantityTiers = c.quantityTiers.map((tier, i) => {
      if (i !== qtyIndex) return tier;
      if (field === "min") {
        return { ...tier, min: Number(value) || 1 };
      }
      return { ...tier, [field]: value };
    });
    quantityTiers.sort((a, b) => a.min - b.min);
    return { ...c, quantityTiers };
  });
}

function addAreaTier(setConfig) {
  mutateConfig(setConfig, (c) => {
    if (c.pricingMode === PRICING_MODE_VOLUME) return c;
    const qtyCols =
      c.pricingMode === PRICING_MODE_AREA_FLAT ? 1 : c.quantityTiers.length;
    const last = c.areaTiers[c.areaTiers.length - 1];
    const nextMin =
      typeof last?.maxSqIn === "number" ? last.maxSqIn : c.maxArea;
    const areaTiers = [
      ...c.areaTiers,
      {
        label: `Over ${nextMin} sq in`,
        minSqIn: nextMin,
        maxSqIn: nextMin + 40,
      },
    ];
    const newRow = Array.from({ length: qtyCols }, () => 0);
    const rates = resizeRates(areaTiers.length, qtyCols, [...c.rates, newRow]);
    const ratesByVariant = resizeAllVariantRateMatrices(
      { ...c, areaTiers, rates },
      areaTiers.length,
      qtyCols,
    );
    return {
      ...c,
      areaTiers,
      rates,
      ...(ratesByVariant ? { ratesByVariant } : {}),
      maxArea: maxAreaFromTiers(areaTiers),
    };
  });
}

function removeAreaTier(setConfig, areaIndex) {
  mutateConfig(setConfig, (c) => {
    const areaTiers = c.areaTiers.filter((_, i) => i !== areaIndex);
    const rates = c.rates.filter((_, i) => i !== areaIndex);
    const qtyCols =
      c.pricingMode === PRICING_MODE_AREA_FLAT ? 1 : c.quantityTiers.length;
    const ratesByVariant = c.ratesByVariant;
    let nextVariantRates = null;
    if (ratesByVariant && c.pricingMode !== PRICING_MODE_VOLUME) {
      nextVariantRates = {};
      for (const [id, matrix] of Object.entries(ratesByVariant)) {
        if (isVariantRatesMatrix(matrix)) {
          nextVariantRates[id] = matrix.filter((_, i) => i !== areaIndex);
        } else {
          nextVariantRates[id] = resizeRates(areaTiers.length, qtyCols, rates);
        }
      }
    }
    return {
      ...c,
      areaTiers,
      rates,
      ...(nextVariantRates ? { ratesByVariant: nextVariantRates } : {}),
      maxArea: maxAreaFromTiers(areaTiers),
    };
  });
}

function addQuantityTier(setConfig) {
  mutateConfig(setConfig, (c) => {
    const last = c.quantityTiers[c.quantityTiers.length - 1];
    const nextMin = (last?.min ?? 1) + 100;
    const quantityTiers = [
      ...c.quantityTiers,
      { label: `${nextMin}+`, min: nextMin },
    ];
    const rates = resizeRates(c.areaTiers.length, quantityTiers.length, c.rates);
    const qtyCols =
      c.pricingMode === PRICING_MODE_AREA_FLAT ? 1 : quantityTiers.length;
    const resizedVariants = resizeAllVariantRateMatrices(
      { ...c, quantityTiers, rates },
      c.areaTiers.length,
      qtyCols,
    );
    return {
      ...c,
      quantityTiers,
      rates,
      ...(resizedVariants ? { ratesByVariant: resizedVariants } : {}),
    };
  });
}

function removeQuantityTier(setConfig, qtyIndex) {
  mutateConfig(setConfig, (c) => {
    const quantityTiers = c.quantityTiers.filter((_, i) => i !== qtyIndex);
    const rates = c.rates.map((row) => row.filter((_, j) => j !== qtyIndex));
    let ratesByVariant = c.ratesByVariant;
    if (ratesByVariant) {
      if (c.pricingMode === PRICING_MODE_VOLUME) {
        ratesByVariant = {};
        for (const [id, row] of Object.entries(c.ratesByVariant)) {
          ratesByVariant[id] = row.filter((_, j) => j !== qtyIndex);
        }
      } else if (c.pricingMode !== PRICING_MODE_AREA_FLAT) {
        ratesByVariant = {};
        for (const [id, matrix] of Object.entries(c.ratesByVariant)) {
          if (isVariantRatesMatrix(matrix)) {
            ratesByVariant[id] = matrix.map((row) =>
              row.filter((_, j) => j !== qtyIndex),
            );
          }
        }
      }
    }
    return { ...c, quantityTiers, rates, ratesByVariant };
  });
}

function getFunctionConfigurationRaw(data) {
  if (!data?.metafields) return undefined;

  const mf = data.metafields.find((m) => m.key === "function-configuration");
  if (!mf) return null;

  const value = mf.value;
  if (value != null && String(value).trim() !== "") {
    return value;
  }

  if (mf.jsonValue != null) {
    return mf.jsonValue;
  }

  return null;
}

function parseJsonLoose(value) {
  let parsed = value;
  for (let i = 0; i < 3 && typeof parsed === "string"; i++) {
    const trimmed = parsed.trim();
    if (!trimmed) return {};
    parsed = JSON.parse(trimmed);
  }
  return parsed;
}

function serializeConfig(config) {
  return {
    productIds: config.productIds ?? [],
    pricingMode: config.pricingMode ?? PRICING_MODE_AREA,
    areaTiers: config.areaTiers,
    quantityTiers: config.quantityTiers,
    rates: config.rates,
    ratesByVariant: config.ratesByVariant ?? {},
    modifiers: normalizeModifiers(config.modifiers),
    maxArea: config.maxArea,
    areaUnit: config.areaUnit,
    accountTiers: serializeAccountTiers(config.accountTiers),
  };
}

function parseMetafield(value) {
  try {
    const parsed =
      value != null && typeof value === "object" && !Array.isArray(value)
        ? value
        : parseJsonLoose(value ?? "{}");

    if (Array.isArray(parsed.rules) && parsed.rules.length) {
      return {
        ...normalizeConfig(parsed.rules[0]),
        accountTiers: normalizeAccountTiersMap(parsed.accountTiers),
      };
    }

    if (Array.isArray(parsed.tables) && parsed.tables.length) {
      const preferred =
        parsed.tables.find((t) => t?.isDefault) ??
        parsed.tables.find(
          (t) => Array.isArray(t?.productIds) && t.productIds.length,
        ) ??
        parsed.tables[0];
      return {
        ...normalizeConfig(preferred),
        accountTiers: normalizeAccountTiersMap(parsed.accountTiers),
      };
    }

    if (parsed.rates?.length || parsed.areaTiers?.length || parsed.pricingMode) {
      return {
        ...normalizeConfig(parsed),
        accountTiers: normalizeAccountTiersMap(parsed.accountTiers),
      };
    }

    return DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function loadProductsWithVariants(productGids, adminApiQuery) {
  if (!productGids?.length) return [];
  const result = await adminApiQuery(
    `#graphql
    query Products($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          variants(first: 100) {
            nodes {
              id
              title
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
    }`,
    { variables: { ids: productGids } },
  );

  return (result?.data?.nodes ?? [])
    .filter(Boolean)
    .map((product) => ({
      id: product.id,
      title: product.title,
      variants: product.variants?.nodes ?? [],
    }));
}

function useExtensionData() {
  const { applyMetafieldChange, i18n, data, resourcePicker, query } = shopify;
  const didInitialize = useRef(false);
  const configRef = useRef(DEFAULT_CONFIG);

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [initialConfig, setInitialConfig] = useState(DEFAULT_CONFIG);
  const [initialized, setInitialized] = useState(false);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [syncMessage, setSyncMessage] = useState(null);
  const [formRevision, setFormRevision] = useState(0);
  const productIdsInputRef = useRef(null);
  const didRefreshCatalog = useRef(false);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  function applySyncMessage(sync) {
    if (sync.catalogKeys === 0 && !sync.errors.length) {
      setSyncMessage({
        tone: "success",
        text: i18n.translate("storefrontSyncCleared", {
          cleared: sync.cleared ?? 0,
        }),
      });
    } else if (sync.errors.length) {
      setSyncMessage({
        tone: "warning",
        text: i18n.translate("storefrontSyncPartial", {
          count: sync.synced,
          errors: sync.errors.join("; "),
        }),
      });
    } else {
      setSyncMessage({
        tone: "success",
        text: i18n.translate("storefrontSyncRefreshed", {
          catalogKeys: sync.catalogKeys,
          cleared: sync.cleared ?? 0,
        }),
      });
    }
  }

  useEffect(() => {
    if (didInitialize.current || !data?.metafields) return;

    const raw = getFunctionConfigurationRaw(data);
    if (raw === undefined) return;

    didInitialize.current = true;
    const loaded = raw === null ? DEFAULT_CONFIG : parseMetafield(raw);
    configRef.current = loaded;
    setConfig(loaded);
    setInitialConfig(loaded);
    setInitialized(true);
  }, [data?.metafields]);

  useEffect(() => {
    if (!initialized || didRefreshCatalog.current) return;
    didRefreshCatalog.current = true;

    refreshStorefrontCatalog(query)
      .then(applySyncMessage)
      .catch(() => {
        /* non-blocking on load */
      });
  }, [initialized, data?.id, query, i18n]);

  useEffect(() => {
    if (!initialized) return;
    loadProductsWithVariants(config.productIds, query).then((loaded) => {
      setProducts(loaded);
      setConfig((current) => ensureVariantRates(current, loaded));
    });
  }, [config.productIds, query, initialized]);

  async function pickProducts() {
    const selection = await resourcePicker({
      type: "product",
      selectionIds: products.map(({ id }) => ({ id })),
      multiple: true,
      action: "select",
    });
    const ids = (selection ?? []).map((p) => p.id);
    const loaded = await loadProductsWithVariants(ids, query);
    setProducts(loaded);
    setConfig((current) =>
      ensureVariantRates({ ...current, productIds: ids }, loaded),
    );
    requestAnimationFrame(() => {
      const input = productIdsInputRef.current;
      if (input) {
        input.value = (configRef.current.productIds ?? []).join(",");
        notifyFormDirty(input);
      }
    });
  }

  async function applyExtensionMetafieldChange() {
    setLoading(true);
    setSaveError(null);
    setSyncMessage(null);
    try {
      const payload = serializeConfig(configRef.current);
      const result = await applyMetafieldChange({
        type: "updateMetafield",
        namespace: "$app",
        key: "function-configuration",
        value: JSON.stringify(payload),
        valueType: "json",
      });

      if (result?.type === "error") {
        setSaveError(result.message ?? i18n.translate("saveError"));
        return;
      }

      const saved = normalizeConfig(payload);
      const previousProductIds = initialConfig.productIds ?? [];
      configRef.current = saved;
      setConfig(saved);
      setInitialConfig(saved);
      setFormRevision((n) => n + 1);

      const { discounts } = shopify;
      const classes = discounts?.discountClasses?.value ?? [];
      if (!classes.includes("product")) {
        await discounts?.updateDiscountClasses?.(["product"]);
      }

      const sync = await syncProductPricingMetafields(
        {
          rules: [saved],
          accountTiers: saved.accountTiers ?? {},
          previousProductIds,
          currentDiscountId: data?.id ?? null,
        },
        query,
      );
      if (sync.catalogKeys === 0 && !sync.errors.length) {
        applySyncMessage(sync);
      } else if (sync.synced === 0) {
        setSyncMessage({
          tone: "warning",
          text: i18n.translate("storefrontSyncNone"),
        });
      } else if (sync.errors.length) {
        setSyncMessage({
          tone: "warning",
          text: i18n.translate("storefrontSyncPartial", {
            count: sync.synced,
            errors: sync.errors.join("; "),
          }),
        });
      } else if (sync.catalogKeys === 0) {
        setSyncMessage({
          tone: "warning",
          text: i18n.translate("storefrontSyncCatalogMissing"),
        });
      } else {
        setSyncMessage({
          tone: "success",
          text: i18n.translate("storefrontSyncOk", {
            count: sync.synced,
            catalogKeys: sync.catalogKeys,
            cleared: sync.cleared ?? 0,
          }),
        });
      }
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : i18n.translate("saveError"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function refreshStorefront() {
    setLoading(true);
    setSaveError(null);
    setSyncMessage(null);
    try {
      const sync = await refreshStorefrontCatalog(query);
      applySyncMessage(sync);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : i18n.translate("saveError"),
      );
    } finally {
      setLoading(false);
    }
  }

  const resetForm = () => {
    setSaveError(null);
    setSyncMessage(null);
    configRef.current = initialConfig;
    setConfig(initialConfig);
  };

  return {
    applyExtensionMetafieldChange,
    refreshStorefront,
    i18n,
    resetForm,
    config,
    setConfig,
    loading,
    initialized,
    saveError,
    syncMessage,
    pickProducts,
    products,
    productIdsInputRef,
    formRevision,
  };
}

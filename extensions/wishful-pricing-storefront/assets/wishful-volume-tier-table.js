/**
 * Shared volume tier table for Wishful storefront pricing.
 * Used by volume-only and area × quantity modes.
 */
(function (global) {
  function formatMoney(amount, currency) {
    const code = currency || global.WISHFUL_SHOP_CURRENCY || 'USD';
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
    }).format(amount);
  }

  function formatUnitPrice(amount, currency) {
    return formatMoney(amount, currency).replace(/\s/g, '') + '/ea';
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {HTMLTableSectionElement} tbody
   * @param {string[]} labels
   * @param {{ showDiscount?: boolean }} [options]
   */
  function renderRows(tbody, labels, options) {
    if (!tbody) return;
    const showDiscount = Boolean(options && options.showDiscount);
    tbody.innerHTML = labels
      .map((label, i) => {
        let html =
          '<tr data-wishful-tier="' +
          i +
          '"><td>' +
          escapeHtml(label) +
          '</td>';
        if (showDiscount) {
          html += '<td data-wishful-discount>—</td>';
        }
        html += '<td data-wishful-price>—</td></tr>';
        return html;
      })
      .join('');
  }

  /**
   * @param {HTMLElement} tbody
   * @param {{ prices: number[]; activeIndex: number; modifierDelta?: number; currency?: string }} opts
   */
  function updateUnitPrices(tbody, opts) {
    const rows = tbody.querySelectorAll('[data-wishful-tier]');
    const modifier = Number(opts.modifierDelta) || 0;
    const currency = opts.currency;

    rows.forEach((row, i) => {
      const priceCell = row.querySelector('[data-wishful-price]');
      const unit = Math.max(0, (opts.prices[i] ?? 0) + modifier);
      if (priceCell) {
        priceCell.textContent = formatMoney(unit, currency) + ' each';
      }
      row.classList.toggle(
        'wishful-volume-table__row--active',
        i === opts.activeIndex,
      );
    });
  }

  /**
   * Area × quantity matrix row — discount % vs first tier, price per unit at current sq in.
   *
   * @param {HTMLElement} tbody
   * @param {{
   *   rowRates: number[];
   *   sqIn: number;
   *   modifierDelta?: number;
   *   activeIndex: number;
   *   currency?: string;
   * }} opts
   */
  function updateAreaQuantityRow(tbody, opts) {
    const rows = tbody.querySelectorAll('[data-wishful-tier]');
    const rowRates = opts.rowRates;
    const baseRate = rowRates[0];
    const sqIn = opts.sqIn;
    const modifier = Number(opts.modifierDelta) || 0;
    const currency = opts.currency;

    rows.forEach((row, i) => {
      const rate = rowRates[i];
      const unit = Math.max(0, sqIn * rate + modifier);
      const discountCell = row.querySelector('[data-wishful-discount]');
      const priceCell = row.querySelector('[data-wishful-price]');

      if (discountCell) {
        if (i === 0) {
          discountCell.textContent = '—';
        } else {
          const pct = Math.round((1 - rate / baseRate) * 100);
          discountCell.textContent = pct > 0 ? pct + '% off' : '—';
        }
      }

      if (priceCell) {
        priceCell.textContent = formatUnitPrice(unit, currency);
      }

      row.classList.toggle(
        'wishful-volume-table__row--active',
        i === opts.activeIndex,
      );
    });
  }

  /**
   * Flat price per size band (area_flat) — one price per row, no "each" suffix.
   *
   * @param {HTMLElement} tbody
   * @param {{ prices: number[]; activeIndex: number; currency?: string }} opts
   */
  function updateFlatBandPrices(tbody, opts) {
    const rows = tbody.querySelectorAll('[data-wishful-tier]');
    const currency = opts.currency;

    rows.forEach((row, i) => {
      const priceCell = row.querySelector('[data-wishful-price]');
      if (priceCell) {
        priceCell.textContent = formatMoney(opts.prices[i] ?? 0, currency);
      }
      row.classList.toggle(
        'wishful-volume-table__row--active',
        i === opts.activeIndex,
      );
    });
  }

  /**
   * @param {HTMLElement | null} wrapper
   * @param {boolean} visible
   */
  function setVisible(wrapper, visible) {
    if (!wrapper) return;
    wrapper.hidden = !visible;
  }

  /**
   * @param {ParentNode} scope
   * @returns {HTMLElement | null}
   */
  function findBody(scope) {
    const root = scope || document;
    return root.querySelector('[data-wishful-volume-tier-body]');
  }

  /**
   * @param {ParentNode} scope
   * @returns {HTMLElement | null}
   */
  function findWrapper(scope) {
    const root = scope || document;
    return root.querySelector('[data-wishful-volume-table]');
  }

  global.WishfulVolumeTable = {
    formatMoney,
    formatUnitPrice,
    renderRows,
    updateUnitPrices,
    updateAreaQuantityRow,
    updateFlatBandPrices,
    setVisible,
    findBody,
    findWrapper,
  };
})(window);

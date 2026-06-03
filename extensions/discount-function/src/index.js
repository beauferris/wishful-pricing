// Area × quantity or volume pricing — one table per discount.
// Target: cart.lines.discounts.generate.run

import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from "../generated/api";
import { parseAppConfig, calculateLineTargets } from "./pricing.js";

export function cartLinesDiscountsGenerateRun(input) {
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return { operations: [] };
  }

  const appConfig = parseAppConfig(input.discount.metafield?.jsonValue ?? null);
  const lineTargets = calculateLineTargets(
    input.cart.lines,
    appConfig,
    input.cart.buyerIdentity,
    input.cart,
  );
  const candidates = [];

  for (const line of input.cart.lines) {
    const pricing = lineTargets.get(line.id);
    if (!pricing) continue;

    const subtotal = Number.parseFloat(line.cost.subtotalAmount.amount);
    if (!Number.isFinite(subtotal) || subtotal <= 0) continue;

    const discountAmount = roundMoney(subtotal - pricing.target);
    if (discountAmount < 0.01) continue;

    candidates.push({
      message: pricing.message,
      targets: [{ cartLine: { id: line.id } }],
      value: {
        fixedAmount: {
          amount: discountAmount.toFixed(2),
          appliesToEachItem: false,
        },
      },
    });
  }

  if (!candidates.length) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

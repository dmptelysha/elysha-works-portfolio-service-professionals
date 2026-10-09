import { describe, expect, it } from "vitest";

import {
  convertUsdToViewerAmount,
  formatViewerAmount,
  type ViewerCurrency,
} from "@/features/quiz/viewer-currency";

const php: ViewerCurrency = {
  localCurrency: "PHP",
  localSymbol: "₱",
  fxRate: 58,
};

describe("viewer currency formatting", () => {
  it("converts and formats source pricing only in the viewer currency", () => {
    expect(convertUsdToViewerAmount(4000, php)).toBe(232000);
    expect(formatViewerAmount(4000, php)).toBe("₱232,000 PHP");
  });

  it("keeps USD when USD is the viewer currency", () => {
    expect(formatViewerAmount(4000, { localCurrency: "USD", localSymbol: "$", fxRate: null })).toBe("$4,000 USD");
    expect(formatViewerAmount(1572.5, { localCurrency: "USD", localSymbol: "$", fxRate: 1 })).toBe("$1,572.50 USD");
  });

  it("does not fall back to visible USD when a local conversion is unavailable", () => {
    expect(formatViewerAmount(4000, { ...php, fxRate: null })).toBeNull();
  });
});

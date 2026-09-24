import type { ProjectPriceQuote } from "./types";
import {
  convertUsdToViewerAmount,
  finalViewerAmount,
  formatLocalAmount,
} from "./viewer-currency";

interface ProjectInvestmentProps {
  quote: ProjectPriceQuote;
  couponInput: string;
  couponMessage: string | null;
  countryCode: string;
  locked: boolean;
  busy: boolean;
  onCouponInput: (value: string) => void;
  onApplyCoupon: () => Promise<void>;
  onRemoveCoupon: () => void;
  onRetryConversion: () => Promise<void>;
  onConfirm: () => Promise<void>;
}

export function ProjectInvestment({
  quote,
  couponInput,
  couponMessage,
  countryCode,
  locked,
  busy,
  onCouponInput,
  onApplyCoupon,
  onRemoveCoupon,
  onRetryConversion,
  onConfirm,
}: ProjectInvestmentProps) {
  const discounted = Boolean(quote.campaign && quote.discountAmountUsd > 0);
  const originalAmount = convertUsdToViewerAmount(quote.originalTotalUsd, quote);
  const finalAmount = finalViewerAmount(quote);
  const conversionUnavailable = finalAmount === null || originalAmount === null;
  const original = originalAmount === null ? null : formatLocalAmount(originalAmount, quote);
  const final = finalAmount === null ? null : formatLocalAmount(finalAmount, quote);
  const savings = discounted && originalAmount !== null && finalAmount !== null
    ? formatLocalAmount(Math.max(0, originalAmount - finalAmount), quote)
    : null;

  return (
    <div className="project-investment">
      <div className="project-investment-price" aria-live="polite">
        {discounted && original ? <del>{original}</del> : null}
        {final ? <strong className="result-price">{final}</strong> : null}
        {discounted && savings ? (
          <p>You save {savings} · {quote.campaign!.percentage}% off</p>
        ) : null}
        {conversionUnavailable ? (
          <p>Live {quote.localCurrency} conversion is unavailable. Retry to view and confirm your local total.</p>
        ) : quote.localCurrency !== "USD" ? (
          <p>Your project total is shown in {quote.localCurrency}.</p>
        ) : null}
        {quote.fxRateTimestamp && final ? (
          <small>Rate checked {new Date(quote.fxRateTimestamp).toLocaleString("en-US")}.</small>
        ) : null}
      </div>

      <div className="project-coupon">
        <label htmlFor="proposal-coupon">Coupon code</label>
        <div>
          <input
            id="proposal-coupon"
            value={couponInput}
            disabled={locked || busy || Boolean(quote.campaign)}
            autoComplete="off"
            maxLength={40}
            onChange={(event) => onCouponInput(event.target.value)}
            placeholder="Input your coupon code here"
          />
          {quote.campaign ? (
            <button className="quiz-secondary" disabled={locked || busy} onClick={onRemoveCoupon} type="button">Remove</button>
          ) : (
            <button className="quiz-secondary" disabled={locked || busy || !couponInput.trim()} onClick={() => void onApplyCoupon()} type="button">Apply coupon</button>
          )}
        </div>
        <p className="project-coupon-status" role="status" aria-live="polite">
          {couponMessage ?? (countryCode === "ZZ"
            ? "Discount eligibility requires a supported business country."
            : "One eligible coupon can be applied to this proposal.")}
        </p>
      </div>

      {conversionUnavailable ? (
        <button className="quiz-back" disabled={busy} onClick={() => void onRetryConversion()} type="button">Retry conversion</button>
      ) : null}
      <button className="quiz-primary project-confirm" disabled={busy || locked || conversionUnavailable} onClick={() => void onConfirm()} type="button">
        {locked ? "Proposal confirmed" : busy ? "Confirming proposal…" : "Confirm roadmap and email proposal"}
      </button>
    </div>
  );
}

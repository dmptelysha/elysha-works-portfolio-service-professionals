import type { ProjectPriceQuote } from "./types";

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

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function localMoney(quote: ProjectPriceQuote) {
  if (quote.finalTotalLocal === null) return null;
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(quote.finalTotalLocal);
  return `${quote.localSymbol}${amount} ${quote.localCurrency}`;
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
  const local = localMoney(quote);

  return (
    <div className="project-investment">
      <div className="project-investment-price" aria-live="polite">
        {discounted ? <del>{usd.format(quote.originalTotalUsd)}</del> : null}
        <strong className="result-price">{usd.format(quote.finalTotalUsd)} USD</strong>
        {discounted ? (
          <p>You save {usd.format(quote.discountAmountUsd)} · {quote.campaign!.percentage}% off</p>
        ) : null}
        {local ? (
          <p>Approximately {local}. USD remains the source price; conversion is indicative.</p>
        ) : quote.localCurrency !== "USD" ? (
          <p>Live {quote.localCurrency} conversion is unavailable. USD remains the source price.</p>
        ) : <p>Displayed in the approved USD source currency.</p>}
        {quote.fxRateTimestamp && local ? (
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
            placeholder={countryCode === "PH" ? "PINOYAKO" : "EARLYBIRDWORKS"}
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

      {quote.finalTotalLocal === null && quote.localCurrency !== "USD" ? (
        <button className="quiz-back" disabled={busy} onClick={() => void onRetryConversion()} type="button">Retry conversion</button>
      ) : null}
      <button className="quiz-primary project-confirm" disabled={busy || locked} onClick={() => void onConfirm()} type="button">
        {locked ? "Proposal confirmed" : busy ? "Confirming proposal…" : "Confirm roadmap and email proposal"}
      </button>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

import { COUNTRY_OPTIONS, type CountryOption } from "./countries";

interface BusinessLocationStepProps {
  busy: boolean;
  error: string | null;
  onContinue: (country: CountryOption) => Promise<void>;
}

export function BusinessLocationStep({ busy, error, onContinue }: BusinessLocationStepProps) {
  const [value, setValue] = useState("Philippines");
  const selected = useMemo(
    () => COUNTRY_OPTIONS.find((country) => country.name.toLowerCase() === value.trim().toLowerCase()),
    [value],
  );

  return (
    <section className="quiz-stage quiz-location" aria-labelledby="quiz-location-title">
      <p className="quiz-kicker">Business location</p>
      <h1 id="quiz-location-title">Where does your business operate?</h1>
      <p className="quiz-lede">
        We use this only to show a helpful local-currency estimate and the payment options relevant to your market. USD remains the source price.
      </p>
      <form onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="business-country">Country</label>
        <input
          id="business-country"
          type="search"
          list="business-country-options"
          autoComplete="country-name"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-describedby={error ? "business-country-error" : undefined}
        />
        <datalist id="business-country-options">
          {COUNTRY_OPTIONS.map((country) => <option key={country.code} value={country.name}>{country.currency}</option>)}
        </datalist>
        {!selected && value.trim() ? <p className="quiz-validation">Choose a country from the list.</p> : null}
        {error ? <p className="quiz-validation" id="business-country-error" role="status">{error}</p> : null}
        <button
          className="quiz-primary"
          disabled={!selected || busy}
          onClick={() => { if (selected) void onContinue(selected); }}
          type="button"
        >
          {busy ? "Checking currency…" : "Continue to Assessment"} <span aria-hidden="true">→</span>
        </button>
      </form>
    </section>
  );
}

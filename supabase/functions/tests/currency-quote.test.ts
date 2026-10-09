import { currencyQuoteHandler } from "../currency-quote/index.ts";

function assert(condition: unknown, message = "assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("currency quote timestamps when the quote is fetched rather than the upstream daily update", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    result: "success",
    time_last_update_utc: "Wed, 24 Sep 2026 00:02:32 +0000",
    rates: { PHP: 62.712472 },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    const requestedAfter = Date.now();
    const response = await currencyQuoteHandler(new Request(
      "https://project.supabase.co/functions/v1/currency-quote",
      {
        method: "POST",
        headers: {
          origin: "https://elyshaworks.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          countryCode: "PH",
          countryName: "Philippines",
          currency: "PHP",
          symbol: "₱",
        }),
      },
    ));
    const requestedBefore = Date.now();
    const body = await response.json() as Record<string, unknown>;
    const timestamp = Date.parse(String(body.fxRateTimestamp));

    assert(response.status === 200, `expected 200, received ${response.status}`);
    assert(body.fxRate === 62.712472, "expected the upstream PHP rate");
    assert(timestamp >= requestedAfter && timestamp <= requestedBefore, "expected a fresh quote timestamp");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

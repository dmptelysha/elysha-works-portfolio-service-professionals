import Link from "next/link";

import { SITE_CONTENT } from "@/data/site-content";

export function FinalCtaSection() {
  const { finalCta } = SITE_CONTENT;
  return (
    <section className="portfolio-section final-cta-section" id="final-cta" aria-labelledby="final-cta-title">
      <div className="portfolio-shell final-cta-inner">
        <p className="section-eyebrow">{finalCta.eyebrow}</p>
        <h2 id="final-cta-title">Your next move starts with<br /><span>the right roadmap.</span></h2>
        <p>{finalCta.body}</p>
        <Link className="portfolio-primary-cta" href="/quiz">
          <span>{finalCta.primaryLabel}</span><span aria-hidden="true">→</span>
        </Link>
        <Link className="portfolio-text-link" href={finalCta.secondaryHref}>
          {finalCta.secondaryLabel} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

import Link from "next/link";

import { HeroBenefitRotator } from "@/components/home/HeroBenefitRotator";
import { SITE_CONTENT } from "@/data/site-content";

export function Hero() {
  const { hero } = SITE_CONTENT;
  return (
    <section className="hero section hero-roadmap" id="top" aria-labelledby="hero-title">
      <div className="shell hero-roadmap-inner">
        <p className="eyebrow">{hero.eyebrow}</p>
        <h1 className="hero-promise" id="hero-title">
          <span className="hero-mobile-line">Before investing in a </span>
          <span className="hero-mobile-line">
            website,<br className="hero-desktop-break" aria-hidden="true" /> funnel, or{" "}
          </span>
          <span className="hero-mobile-line">
            automation, discover<br className="hero-desktop-break" aria-hidden="true" />{" "}
          </span>
          <span className="hero-mobile-line">
            <span className="hero-promise-accent">exactly what your </span>
          </span>
          <span className="hero-mobile-line">
            <span className="hero-promise-accent">
              business<br className="hero-desktop-break" aria-hidden="true" /> needs to grow.
            </span>
          </span>
        </h1>
        <p className="hero-roadmap-intro">
          <span className="hero-mobile-line">In just 2 minutes, you&apos;ll receive a </span>
          <span className="hero-mobile-line">
            personalized roadmap<br className="hero-desktop-break" aria-hidden="true" /> showing the{" "}
          </span>
          <span className="hero-mobile-line">best solution for your goals.</span>
        </p>
        <HeroBenefitRotator benefits={hero.benefits} />
        <div className="button-row">
          <Link className="button button-signal hero-roadmap-cta" href="/quiz">
            <span>{hero.primaryCta}</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="hero-trust">
          <span className="hero-stars" aria-label="Five out of five stars">
            <span aria-hidden="true">★★★★★</span>
          </span>
          <p>{hero.trust}</p>
        </div>
      </div>
    </section>
  );
}

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
          <span>Before investing in a website, </span>
          <span>funnel, or automation, discover </span>
          <span className="hero-promise-accent">exactly what your business </span>
          <span className="hero-promise-accent">needs to grow.</span>
        </h1>
        <p className="hero-roadmap-intro">
          <span>In just 2 minutes, you&apos;ll receive a personalized roadmap</span>
          <span>showing the best solution for your goals.</span>
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
          <span className="hero-trust-divider" aria-hidden="true" />
          <p>{hero.trust}</p>
        </div>
      </div>
    </section>
  );
}

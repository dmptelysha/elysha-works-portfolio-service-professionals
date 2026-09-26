import Link from "next/link";
import Image from "next/image";

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
        <ul className="hero-benefits" aria-label="What your personalized roadmap includes">
          {hero.benefits.map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>
        <div className="button-row">
          <Link className="button button-signal hero-roadmap-cta" href="/quiz">
            <span>{hero.primaryCta}</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="hero-trust">
          <Image
            className="hero-trust-avatar"
            src="/assets/v3-hero/elysha-portrait-cutout.png"
            alt="Elysha Dumpit"
            width={68}
            height={68}
            unoptimized
          />
          <span className="hero-trust-divider" aria-hidden="true" />
          <div className="hero-trust-copy">
            <span className="hero-stars" aria-label="Five out of five stars">
              <span aria-hidden="true">★★★★★</span>
            </span>
            <p>{hero.trust}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

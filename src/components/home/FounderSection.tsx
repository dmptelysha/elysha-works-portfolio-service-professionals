import { SITE_CONTENT } from "@/data/site-content";

export function FounderSection() {
  const { founder } = SITE_CONTENT;
  return (
    <section className="portfolio-section founder-section" id="about" aria-labelledby="founder-title">
      <div className="portfolio-shell founder-grid">
        <figure className="founder-portrait">
          <img src={founder.portrait} alt={founder.portraitAlt} loading="lazy" />
          <figcaption>Founder &amp; systems designer</figcaption>
        </figure>
        <div className="founder-copy">
          <p className="section-eyebrow">{founder.eyebrow}</p>
          <h2 id="founder-title">Strategy first.<br /><span>Then the right system.</span></h2>
          <p>{founder.body}</p>
          <dl className="founder-principles">
            <div><dt>01</dt><dd>Understand the real business journey.</dd></div>
            <div><dt>02</dt><dd>Choose the simplest system that fits.</dd></div>
            <div><dt>03</dt><dd>Build a clearer experience from inquiry onward.</dd></div>
          </dl>
        </div>
      </div>
    </section>
  );
}

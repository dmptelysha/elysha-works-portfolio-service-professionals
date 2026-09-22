import { SITE_CONTENT } from "@/data/site-content";

export function TestimonialSection() {
  const { testimonial } = SITE_CONTENT;
  return (
    <section className="portfolio-section testimonial-section" id="testimonial" aria-labelledby="testimonial-title">
      <div className="portfolio-shell testimonial-inner">
        <p className="section-eyebrow">{testimonial.eyebrow}</p>
        <figure>
          <span className="testimonial-mark" aria-hidden="true">“</span>
          <blockquote id="testimonial-title">{testimonial.quote}</blockquote>
          {testimonial.attribution && <figcaption>{testimonial.attribution}</figcaption>}
        </figure>
        <p className="testimonial-note">Verified client feedback reserved.</p>
      </div>
    </section>
  );
}

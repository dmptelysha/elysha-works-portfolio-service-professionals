import Link from "next/link";

import { SITE_CONTENT } from "@/data/site-content";

export function SiteFooter() {
  const { brand, footer } = SITE_CONTENT;
  return (
    <footer className="portfolio-footer">
      <div className="portfolio-shell">
        <div className="footer-main">
          <div className="footer-identity">
            <Link href="/#top" aria-label="Elysha Works home" className="brand-mark">
              <span>&lt;</span> <b>Elysha Works</b> <span>/&gt;</span>
            </Link>
            <p>{brand.positioning}</p>
          </div>
          <nav aria-label="Footer navigation">
            {footer.links.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}
          </nav>
          {footer.social.length > 0 && (
            <nav aria-label="Social links">
              {footer.social.map((link) => <a href={link.href} key={link.href}>{link.label}</a>)}
            </nav>
          )}
        </div>
        <div className="footer-legal">
          <p>© Elysha Works. All rights reserved.</p>
          <div>{footer.legal.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}</div>
        </div>
      </div>
    </footer>
  );
}

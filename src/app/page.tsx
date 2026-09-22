import { ContextualNav } from "@/components/home/ContextualNav";
import { FaqSection } from "@/components/home/FaqSection";
import { FinalCtaSection } from "@/components/home/FinalCtaSection";
import { FounderSection } from "@/components/home/FounderSection";
import { Hero } from "@/components/home/Hero";
import { ProjectsSection } from "@/components/home/ProjectsSection";
import { SiteFooter } from "@/components/home/SiteFooter";
import { TestimonialSection } from "@/components/home/TestimonialSection";

export default function Home() {
  return (
    <>
      <a className="portfolio-skip-link" href="#main">Skip to content</a>
      <main id="main">
        <Hero />
        <ContextualNav />
        <ProjectsSection />
        <FounderSection />
        <TestimonialSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <SiteFooter />
    </>
  );
}

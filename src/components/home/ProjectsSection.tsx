"use client";

import { useRef, useState } from "react";

import { PROJECTS, type PortfolioProject } from "@/data/projects";
import { SITE_CONTENT } from "@/data/site-content";
import type { AudienceKey } from "@/features/quiz/types";

type ProjectFilter = "all" | AudienceKey;

const PROJECT_FILTERS: readonly { key: ProjectFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "coaches_educators", label: "Coaches & Educators" },
  { key: "service_businesses", label: "Service Businesses" },
  { key: "custom_order_businesses", label: "Custom-Order Brands" },
] as const;

function ProjectArticle({ project, index }: { project: PortfolioProject; index: number }) {
  return (
    <article className="portfolio-project">
      <a className="portfolio-project-media" href={project.previewUrl} aria-label={`View ${project.title} project`}>
        <span className="project-scroll-canvas">
          <img src={project.coverImage} alt={`${project.title} project preview`} loading="lazy" />
        </span>
        <span className="project-index">0{index + 1}</span>
        <span className="project-scroll-label"><span aria-hidden="true">↓</span> Hover to scroll</span>
      </a>
      <div className="portfolio-project-copy">
        <div className="project-meta">
          <span>{project.kind}</span>
          <span className={`project-status project-status--${project.status}`}>{project.status}</span>
        </div>
        <h3>{project.title}</h3>
        <p className="project-summary">{project.summary}</p>
        {project.featured && (
          <dl className="project-story">
            <div><dt>Problem</dt><dd>{project.problem}</dd></div>
            <div><dt>Solution</dt><dd>{project.solution}</dd></div>
            <div><dt>Outcome</dt><dd>{project.outcome}</dd></div>
          </dl>
        )}
        <ul className="project-tags" aria-label={`${project.title} capabilities`}>
          {project.serviceKeys.map((key) => <li key={key}>{key.replaceAll("_", " ")}</li>)}
        </ul>
        <a className="project-view-link" href={project.previewUrl}>
          View project <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}

export function ProjectsSection() {
  const [activeFilter, setActiveFilter] = useState<ProjectFilter>("all");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const content = SITE_CONTENT.projects;
  const visibleProjects = activeFilter === "all"
    ? PROJECTS
    : PROJECTS.filter((project) => project.audienceKeys.includes(activeFilter));

  const selectAdjacentFilter = (currentIndex: number, direction: 1 | -1) => {
    const nextIndex = (currentIndex + direction + PROJECT_FILTERS.length) % PROJECT_FILTERS.length;
    setActiveFilter(PROJECT_FILTERS[nextIndex].key);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <section className="portfolio-section projects-section" id="projects" aria-labelledby="projects-title">
      <div className="portfolio-shell">
        <header className="section-heading projects-heading">
          <p className="section-eyebrow">{content.eyebrow}</p>
          <h2 id="projects-title">Thoughtful work.<br /><span>A practical purpose.</span></h2>
          <p>{content.intro}</p>
        </header>
        <div className="project-filter-tabs" role="tablist" aria-label="Filter projects by audience">
          {PROJECT_FILTERS.map((filter, index) => (
            <button
              key={filter.key}
              ref={(node) => { tabRefs.current[index] = node; }}
              type="button"
              role="tab"
              id={`project-filter-${filter.key}`}
              aria-controls="project-filter-panel"
              aria-selected={activeFilter === filter.key}
              tabIndex={activeFilter === filter.key ? 0 : -1}
              onClick={() => setActiveFilter(filter.key)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") { event.preventDefault(); selectAdjacentFilter(index, 1); }
                if (event.key === "ArrowLeft") { event.preventDefault(); selectAdjacentFilter(index, -1); }
                if (event.key === "Home") { event.preventDefault(); setActiveFilter(PROJECT_FILTERS[0].key); tabRefs.current[0]?.focus(); }
                if (event.key === "End") { event.preventDefault(); const last = PROJECT_FILTERS.length - 1; setActiveFilter(PROJECT_FILTERS[last].key); tabRefs.current[last]?.focus(); }
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="projects-list" id="project-filter-panel" role="tabpanel" aria-labelledby={`project-filter-${activeFilter}`}>
          {visibleProjects.map((project, index) => (
            <ProjectArticle key={project.slug} project={project} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

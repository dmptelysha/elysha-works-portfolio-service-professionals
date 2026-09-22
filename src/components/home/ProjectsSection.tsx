"use client";

import { useState } from "react";

import { PROJECTS, type PortfolioProject } from "@/data/projects";
import { SITE_CONTENT } from "@/data/site-content";
import { ProjectPreviewDialog } from "./ProjectPreviewDialog";

function ProjectArticle({ project, index, onPreview }: {
  project: PortfolioProject;
  index: number;
  onPreview: (project: PortfolioProject, trigger: HTMLButtonElement) => void;
}) {
  return (
    <article className={`portfolio-project ${project.featured ? "portfolio-project--featured" : "portfolio-project--supporting"}`}>
      <div className="portfolio-project-media">
        <img src={project.coverImage} alt={`${project.title} project preview`} loading="lazy" />
        <span className="project-index">0{index + 1}</span>
      </div>
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
        <button type="button" className="project-preview-button" onClick={(event) => onPreview(project, event.currentTarget)}>
          Preview {project.title} <span aria-hidden="true">↗</span>
        </button>
      </div>
    </article>
  );
}

export function ProjectsSection() {
  const [preview, setPreview] = useState<PortfolioProject | null>(null);
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLButtonElement | null>(null);
  const content = SITE_CONTENT.projects;

  return (
    <>
      <section className="portfolio-section projects-section" id="projects" aria-labelledby="projects-title">
        <div className="portfolio-shell">
          <header className="section-heading projects-heading">
            <p className="section-eyebrow">{content.eyebrow}</p>
            <h2 id="projects-title">Thoughtful work.<br /><span>A practical purpose.</span></h2>
            <p>{content.intro}</p>
          </header>
          <div className="projects-list">
            {PROJECTS.map((project, index) => (
              <ProjectArticle
                key={project.slug}
                project={project}
                index={index}
                onPreview={(selected, trigger) => {
                  setReturnFocusTo(trigger);
                  setPreview(selected);
                }}
              />
            ))}
          </div>
        </div>
      </section>
      {preview && (
        <ProjectPreviewDialog
          project={preview}
          returnFocusTo={returnFocusTo}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

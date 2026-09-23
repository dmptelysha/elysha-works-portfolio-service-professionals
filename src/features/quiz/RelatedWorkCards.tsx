import Image from "next/image";

import { PROJECTS } from "@/data/projects";

import type { AudienceKey } from "./types";

interface RelatedWorkCardsProps {
  audienceKey: AudienceKey;
  limit?: number;
}

export function RelatedWorkCards({ audienceKey, limit = 2 }: RelatedWorkCardsProps) {
  const projects = PROJECTS
    .filter((project) => project.audienceKeys.includes(audienceKey))
    .slice(0, limit);

  return (
    <div className="result-projects">
      {projects.map((project) => (
        <article key={project.slug}>
          <div className="result-project-image">
            <Image
              alt={`${project.title} project preview`}
              fill
              sizes="(max-width: 780px) 100vw, 50vw"
              src={project.coverImage}
            />
          </div>
          <div className="result-project-copy">
            <span>{project.kind}</span>
            <h3>{project.title}</h3>
            <p>{project.summary}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

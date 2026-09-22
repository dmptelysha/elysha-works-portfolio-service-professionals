import type { Metadata } from "next";

import { QuizExperience } from "@/features/quiz/QuizExperience";

export const metadata: Metadata = {
  title: "Personalized System Roadmap | Elysha Works",
  description: "Answer eight focused questions and receive a local, personalized system recommendation without sharing personal information.",
};

export default function QuizPage() {
  return <QuizExperience />;
}

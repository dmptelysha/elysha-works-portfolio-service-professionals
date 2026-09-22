import type { Metadata } from "next";

import { QuizExperience } from "@/features/quiz/QuizExperience";

export const metadata: Metadata = {
  title: "Personalized System Roadmap | Elysha Works",
  description: "Share your business context, answer eight focused questions, and receive a personalized three-day system proposal.",
};

export default function QuizPage() {
  return <QuizExperience />;
}

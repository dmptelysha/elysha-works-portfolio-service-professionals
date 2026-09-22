import { useEffect, useRef } from "react";

import type { QuestionDefinition } from "./types";

interface QuizQuestionProps {
  question: QuestionDefinition;
  questionIndex: number;
  questionCount: number;
  selected: readonly string[];
  validationMessage: string | null;
  onSelect: (optionKey: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function QuizQuestion({
  question,
  questionIndex,
  questionCount,
  selected,
  validationMessage,
  onSelect,
  onBack,
  onContinue,
}: QuizQuestionProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [question.key]);

  const progress = ((questionIndex + 1) / questionCount) * 100;

  return (
    <section className="quiz-stage quiz-question-stage" aria-labelledby="quiz-question-title">
      <div className="quiz-progress-copy">
        <span>Question {questionIndex + 1} of {questionCount}</span>
        <span>{Math.round(progress)}% complete</span>
      </div>
      <div className="quiz-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className="quiz-kicker">Your business, your route</p>
      <h1 id="quiz-question-title" ref={headingRef} tabIndex={-1}>{question.prompt}</h1>
      {question.helpText ? <p className="question-help">{question.helpText}</p> : null}
      <div
        className="quiz-options"
        role={question.selection === "single" ? "radiogroup" : "group"}
        aria-label={question.prompt}
      >
        {question.options.map((option, optionIndex) => {
          const isSelected = selected.includes(option.key);
          return (
            <button
              aria-pressed={isSelected}
              className="quiz-option"
              key={option.key}
              onClick={() => onSelect(option.key)}
              type="button"
            >
              <span className="option-marker" aria-hidden="true">
                {isSelected ? "✓" : String(optionIndex + 1).padStart(2, "0")}
              </span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      {validationMessage ? <p className="quiz-validation" role="alert">{validationMessage}</p> : null}
      <div className="quiz-controls">
        <button className="quiz-back" onClick={onBack} type="button">← Back</button>
        <button className="quiz-primary" onClick={onContinue} type="button">
          {questionIndex === questionCount - 1 ? "See My Roadmap" : "Continue"} <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

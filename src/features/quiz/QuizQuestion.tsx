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
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [question.key]);

  const progress = ((questionIndex + 1) / questionCount) * 100;

  const handleRadioKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, optionIndex: number) => {
    if (question.selection !== "single") return;
    const lastIndex = question.options.length - 1;
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = optionIndex === lastIndex ? 0 : optionIndex + 1;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex = optionIndex === 0 ? lastIndex : optionIndex - 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;
    if (nextIndex === null) return;
    event.preventDefault();
    onSelect(question.options[nextIndex].key);
    optionRefs.current[nextIndex]?.focus();
  };

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
              role={question.selection === "single" ? "radio" : undefined}
              aria-checked={question.selection === "single" ? isSelected : undefined}
              aria-pressed={question.selection === "multiple" ? isSelected : undefined}
              className="quiz-option"
              key={option.key}
              onKeyDown={(event) => handleRadioKeyDown(event, optionIndex)}
              onClick={() => onSelect(option.key)}
              ref={(element) => { optionRefs.current[optionIndex] = element; }}
              tabIndex={question.selection === "single" ? (isSelected || (!selected.length && optionIndex === 0) ? 0 : -1) : undefined}
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

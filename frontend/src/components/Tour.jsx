import { useEffect, useRef, useState } from "react";

const TOUR_KEY = "ldi_tour_completed_v1";

/**
 * Tour step definition:
 *   { id: string, targetId: string | null, title: string, text: string }
 *
 * If targetId is null, the step uses a centered modal-style bubble (no spotlight).
 */
const MAIN_TOUR_STEPS = [
  {
    id: "welcome",
    targetId: null,
    title: "Welcome to Legal Document Intelligence",
    text: "This tool helps you analyze legal documents, detect issues, and get AI-powered explanations. Let's take a quick tour of the main features.",
  },
  {
    id: "upload",
    targetId: "tour-upload-zone",
    title: "01 — Upload Your Document",
    text: "Click here to select a digital PDF (up to 15 MB). Scanned images are not supported — the document must have selectable text.",
  },
  {
    id: "analyze",
    targetId: "tour-analyze-btn",
    title: "Analyze Document",
    text: "Once a file is selected, click here to run the full analysis — clause extraction, rule checks, risk scoring, and clause coverage all happen automatically.",
  },
  {
    id: "findings",
    targetId: "tour-findings-panel",
    title: "02 — Review Findings",
    text: "After analysis, all detected issues appear here, organized by severity (High, Medium, Low). Click any tab to switch between Findings, AI Analysis, Summary, Chat, and Fairness Check.",
  },
  {
    id: "compare",
    targetId: "tour-compare-btn",
    title: "Compare Documents",
    text: "Use the Compare button to upload two PDFs and see a side-by-side clause and risk comparison.",
  },
  {
    id: "history",
    targetId: "tour-history-btn",
    title: "Analysis History",
    text: "All your analyzed documents are saved here. You can revisit them without re-uploading.",
  },
  {
    id: "done",
    targetId: null,
    title: "You're All Set! 🎉",
    text: "Upload a document to get started. If you ever need this tour again, click the ? button in the bottom-right corner.",
  },
];

function getElementRect(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY - 8,
    left: rect.left + window.scrollX - 8,
    width: rect.width + 16,
    height: rect.height + 16,
  };
}

function getBubblePosition(spotlight, windowW, windowH) {
  if (!spotlight) {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  const bubbleW = 320;
  const bubbleH = 200; // approximate
  const margin = 16;

  let top, left;

  // Try below the element
  if (spotlight.top + spotlight.height + bubbleH + margin < windowH) {
    top = spotlight.top + spotlight.height + margin;
    left = Math.min(
      Math.max(spotlight.left, margin),
      windowW - bubbleW - margin
    );
    return { top: `${top}px`, left: `${left}px` };
  }

  // Try above
  if (spotlight.top - bubbleH - margin > 0) {
    top = spotlight.top - bubbleH - margin;
    left = Math.min(
      Math.max(spotlight.left, margin),
      windowW - bubbleW - margin
    );
    return { top: `${top}px`, left: `${left}px` };
  }

  // Fallback: centered
  return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
}

export function useTour() {
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  function startTour() {
    setStepIndex(0);
    setIsActive(true);
  }

  function endTour() {
    setIsActive(false);
    localStorage.setItem(TOUR_KEY, "true");
  }

  function nextStep() {
    if (stepIndex < MAIN_TOUR_STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      endTour();
    }
  }

  function prevStep() {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }

  // Auto-start for first-time visitors
  useEffect(() => {
    const completed = localStorage.getItem(TOUR_KEY);
    if (!completed) {
      // Small delay so the page has rendered
      const timer = setTimeout(() => startTour(), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  return { isActive, stepIndex, startTour, endTour, nextStep, prevStep };
}

export function TourOverlay({ isActive, stepIndex, onNext, onBack, onSkip }) {
  const [spotlight, setSpotlight] = useState(null);
  const [windowSize, setWindowSize] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });
  const rafRef = useRef(null);

  const step = MAIN_TOUR_STEPS[stepIndex];

  useEffect(() => {
    if (!isActive) return;
    function updateSpotlight() {
      if (step?.targetId) {
        setSpotlight(getElementRect(step.targetId));
      } else {
        setSpotlight(null);
      }
    }
    updateSpotlight();

    function onResize() {
      setWindowSize({ w: window.innerWidth, h: window.innerHeight });
      updateSpotlight();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isActive, step]);

  // Scroll target into view
  useEffect(() => {
    if (!isActive || !step) return;
    if (step?.targetId) {
      const el = document.getElementById(step.targetId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive, step]);

  if (!isActive || !step) return null;

  const bubbleStyle = getBubblePosition(spotlight, windowSize.w, windowSize.h);

  return (
    <>
      {/* Overlay backdrop */}
      <div
        className="tour-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Product tour"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Spotlight ring around target element */}
      {spotlight && (
        <div
          className="tour-spotlight"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
          aria-hidden="true"
        />
      )}

      {/* Bubble */}
      <div className="tour-bubble" style={bubbleStyle} role="document">
        <p className="tour-bubble-title">{step.title}</p>
        <p className="tour-bubble-text">{step.text}</p>
        <p className="tour-bubble-progress">
          {stepIndex + 1} of {MAIN_TOUR_STEPS.length}
        </p>
        <div className="tour-bubble-actions">
          {stepIndex > 0 ? (
            <button className="tour-btn-back" onClick={onBack} type="button">
              ← Back
            </button>
          ) : (
            <button className="tour-btn-skip" onClick={onSkip} type="button">
              Skip tour
            </button>
          )}
          <button className="tour-btn-next" onClick={onNext} type="button" autoFocus>
            {stepIndex < MAIN_TOUR_STEPS.length - 1 ? "Next →" : "Get Started"}
          </button>
        </div>
      </div>
    </>
  );
}

export function TourHelpButton({ onStart }) {
  return (
    <button
      className="tour-help-btn"
      onClick={onStart}
      type="button"
      title="Restart tour"
      aria-label="Restart product tour"
    >
      ?
    </button>
  );
}

"use client";

import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useMemo, useRef, useState } from "react";
import { laneRecommendations, progressLabel, type Assignments } from "@/lib/recommend";
import type { CorrectionCandidate, DemoBundle, LaneId, MovieVector, TasteLane } from "@/types/demo";

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

function DraggableTitle({ candidate, assigned }: { candidate: CorrectionCandidate; assigned?: LaneId }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: candidate.movieId,
    data: { candidate },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`question-card ${isDragging ? "is-dragging" : ""} ${assigned ? "is-assigned" : ""}`}
      {...listeners}
      {...attributes}
    >
      <div className="card-index">0{candidate.impactScore.toFixed(0)}</div>
      <div>
        <p className="micro-label">High-impact title</p>
        <h3>{candidate.title}</h3>
        <p>{candidate.genres.slice(0, 3).join(" · ")}</p>
      </div>
      <div className="uncertainty-mark" aria-label={`${Math.round((1 - candidate.assignmentConfidence) * 100)} percent uncertain`}>
        {assigned ? "SET" : `${Math.round((1 - candidate.assignmentConfidence) * 100)}% ?`}
      </div>
    </article>
  );
}

function LaneDropZone({
  lane,
  assignedTitles,
  onAssign,
  activeCandidate,
}: {
  lane: TasteLane;
  assignedTitles: CorrectionCandidate[];
  onAssign: (laneId: LaneId) => void;
  activeCandidate: string | null;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: lane.id });
  return (
    <section
      ref={setNodeRef}
      className={`taste-lane ${isOver ? "is-over" : ""}`}
      style={{ "--lane-accent": lane.accent } as React.CSSProperties}
    >
      <div className="lane-rule" />
      <p className="micro-label">{lane.eyebrow}</p>
      <h3>{lane.name}</h3>
      <p className="lane-description">{lane.description}</p>
      <div className="anchor-stack">
        {lane.anchorTitles.slice(0, 3).map((title) => (
          <span key={title}>{title}</span>
        ))}
      </div>
      {assignedTitles.length > 0 && (
        <div className="assigned-stack" aria-label={`Titles assigned to ${lane.name}`}>
          {assignedTitles.map((title) => (
            <span key={title.movieId}>+ {title.title}</span>
          ))}
        </div>
      )}
      <button
        className="lane-assign-button"
        disabled={!activeCandidate}
        onClick={() => onAssign(lane.id)}
      >
        Place selected title here
      </button>
    </section>
  );
}

function RecommendationRow({ movies, compact = false }: { movies: MovieVector[]; compact?: boolean }) {
  return (
    <div className={`recommendation-row ${compact ? "compact" : ""}`}>
      {movies.map((movie, index) => (
        <article className="recommendation-card" key={`${movie.movieId}-${index}`}>
          <span className="rank">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h4>{movie.title}</h4>
            <p>{movie.genres.slice(0, 2).join(" / ")}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function Evidence({ bundle }: { bundle: DemoBundle }) {
  const { evaluation } = bundle;
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  return (
    <details className="evidence-panel">
      <summary>
        <span>Evidence, not engagement claims</span>
        <span className="summary-action">Open methodology + metrics</span>
      </summary>
      <div className="evidence-grid">
        <div className="metric-lead">
          <p className="micro-label">Offline NDCG@10</p>
          <strong>{evaluation.ndcgSplitTaste.toFixed(3)}</strong>
          <span>SplitTaste · {evaluation.householdCount} synthetic households</span>
        </div>
        <dl>
          <div><dt>Blended</dt><dd>{evaluation.ndcgBlended.toFixed(3)}</dd></div>
          <div><dt>SplitTaste</dt><dd>{evaluation.ndcgSplitTaste.toFixed(3)}</dd></div>
          <div><dt>Oracle bound</dt><dd>{evaluation.ndcgOracle.toFixed(3)}</dd></div>
          <div><dt>ARI / NMI</dt><dd>{evaluation.ari.toFixed(2)} / {evaluation.nmi.toFixed(2)}</dd></div>
          <div><dt>Lane-count accuracy</dt><dd>{percent(evaluation.laneCountAccuracy)}</dd></div>
          <div><dt>Abstention precision</dt><dd>{percent(evaluation.abstentionPrecision)}</dd></div>
          <div><dt>Coverage</dt><dd>{percent(evaluation.abstentionCoverage)}</dd></div>
        </dl>
        <div className="claim-box">
          <span className={evaluation.claimSupported ? "claim-dot supported" : "claim-dot"} />
          <div>
            <strong>{evaluation.claimSupported ? "Offline claim gate passed" : "Hypothesis under evaluation"}</strong>
            <p>
              95% CI for NDCG delta: [{evaluation.deltaCi95[0].toFixed(3)}, {evaluation.deltaCi95[1].toFixed(3)}].
              This is not measured viewing or engagement lift.
            </p>
          </div>
        </div>
      </div>
    </details>
  );
}

export function SplitTasteExperience({ bundle }: { bundle: DemoBundle }) {
  const [assignments, setAssignments] = useState<Assignments>({});
  const [activeCandidate, setActiveCandidate] = useState<string | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));
  const assignedCount = Object.keys(assignments).length;
  const complete = assignedCount >= 3;
  const recommendations = useMemo(
    () => laneRecommendations(bundle, assignments, 4),
    [bundle, assignments],
  );

  const assign = (movieId: string, laneId: LaneId) => {
    setAssignments((current) => ({ ...current, [movieId]: laneId }));
    setActiveCandidate(null);
  };

  const assignSelected = (laneId: LaneId) => {
    if (activeCandidate) assign(activeCandidate, laneId);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && bundle.lanes.some((lane) => lane.id === over.id)) {
      assign(String(active.id), over.id as LaneId);
    }
  };

  const scrollToWorkspace = () => document.getElementById("untangle")?.scrollIntoView({ behavior: "smooth" });
  const scrollToResults = () => resultsRef.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <main>
      <div className="grain" />
      <nav className="masthead" aria-label="Primary">
        <a href="#top" className="wordmark">SplitTaste<span>●</span></a>
        <div className="nav-note">Independent, noncommercial research demo</div>
        <a href="#evidence">Method / 01</a>
      </nav>

      <section className="hero" id="top">
        <div className="hero-kicker">
          <span>Shared household</span>
          <span>{bundle.account.historyCount.toLocaleString()} rating events</span>
          <span>{bundle.account.overlapCohort}</span>
        </div>
        <h1>
          Your account<br />isn&apos;t <em>confused.</em>
        </h1>
        <div className="hero-bottom">
          <p>
            It contains three consistent tastes.<br />Make three choices. Untangle the recommendations.
          </p>
          <button className="primary-action" onClick={scrollToWorkspace}>
            Untangle this account <ArrowIcon />
          </button>
        </div>
        <div className="signal-line" aria-hidden="true">
          {Array.from({ length: 42 }, (_, index) => (
            <i key={index} style={{ height: `${12 + ((index * 17) % 52)}px` }} />
          ))}
        </div>
      </section>

      <section className="diagnosis">
        <p className="section-number">01 / Diagnosis</p>
        <p className="diagnosis-statement">
          One recommendation row is averaging together signals that should stay distinct.
        </p>
        <RecommendationRow movies={bundle.blendedRecommendations.slice(0, 4)} compact />
        <div className="blend-caption">
          <span>Current blend</span><span>Everything influences everything</span>
        </div>
      </section>

      <DndContext id="splittaste-lane-assignment" sensors={sensors} onDragEnd={onDragEnd}>
        <section className="workspace" id="untangle">
          <header className="section-header">
            <div>
              <p className="section-number">02 / Three decisions</p>
              <h2>Put each title where it feels at home.</h2>
            </div>
            <div className="progress-ring" aria-label={`${assignedCount} of 3 decisions complete`}>
              <strong>{assignedCount}</strong><span>/ 3</span>
            </div>
          </header>

          <p className="interaction-note" aria-live="polite">
            {progressLabel(assignedCount)} Drag a card, or select it and use a lane button.
          </p>

          <div className="question-deck">
            {bundle.correctionCandidates.slice(0, 3).map((candidate) => (
              <div
                className={`question-shell ${activeCandidate === candidate.movieId ? "is-selected" : ""}`}
                key={candidate.movieId}
              >
                <DraggableTitle candidate={candidate} assigned={assignments[candidate.movieId]} />
                <button
                  className="select-title-button"
                  onClick={() => setActiveCandidate(candidate.movieId)}
                  aria-pressed={activeCandidate === candidate.movieId}
                >
                  {activeCandidate === candidate.movieId ? "Selected" : "Select title"}
                </button>
              </div>
            ))}
          </div>

          <div className="lane-grid">
            {bundle.lanes.map((lane) => (
              <LaneDropZone
                key={lane.id}
                lane={lane}
                activeCandidate={activeCandidate}
                onAssign={assignSelected}
                assignedTitles={bundle.correctionCandidates.filter(
                  (candidate) => assignments[candidate.movieId] === lane.id,
                )}
              />
            ))}
          </div>

          {complete && (
            <button className="reveal-button" onClick={scrollToResults}>
              See what changed <ArrowIcon />
            </button>
          )}
        </section>
      </DndContext>

      <section className={`results ${complete ? "is-revealed" : ""}`} ref={resultsRef}>
        <header className="section-header">
          <div>
            <p className="section-number">03 / Reweighted</p>
            <h2>Three lanes. Three different next choices.</h2>
          </div>
          <div className="result-stamp">Updated locally<br />No identity inferred</div>
        </header>
        {bundle.lanes.map((lane) => (
          <div className="result-lane" key={lane.id} style={{ "--lane-accent": lane.accent } as React.CSSProperties}>
            <div className="result-lane-title">
              <span />
              <div><p>{lane.eyebrow}</p><h3>{lane.name}</h3></div>
            </div>
            <RecommendationRow movies={recommendations[lane.id]} />
          </div>
        ))}
      </section>

      <section id="evidence" className="evidence-section">
        <p className="section-number">04 / Proof, with boundaries</p>
        <h2>The interface is the story.<br />The evaluation is the receipt.</h2>
        <Evidence bundle={bundle} />
      </section>

      <footer>
        <div className="footer-thesis">Shared accounts are mixtures<br />with the wrong weights.</div>
        <div className="footer-disclosures">
          {bundle.disclosures.map((item) => <p key={item}>{item}</p>)}
        </div>
        <div className="footer-mark">ST / 2026</div>
      </footer>
    </main>
  );
}

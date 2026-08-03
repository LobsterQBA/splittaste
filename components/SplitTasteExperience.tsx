"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { bestOtherLane, laneRecommendations, type Assignments } from "@/lib/recommend";
import type { CohortResult, DemoBundle, LaneId, MovieVector, TasteLane } from "@/types/demo";

type GuestAnswer = "mine" | "guest" | "unsure";
type RepairPhase = "idle" | "question-one" | "question-two" | "applying" | "complete";
type IntroStage = "scan" | "pattern" | "guest" | "leaving";

const laneCopy: Record<LaneId, { name: string; description: string }> = {
  "lane-a": { name: "Pressure Cookers", description: "Tense choices, uneasy laughs, and consequences closing in." },
  "lane-b": { name: "Big Ideas & Strange Worlds", description: "Speculative worlds, odd humor, and stories that bend the rules." },
  "lane-c": { name: "Character Stories", description: "People under pressure, moral choices, and lives that stay with you." },
};

const cardThemes = ["ember", "ocean", "violet", "sand", "forest", "cobalt"] as const;
const filmStills = {
  blueOrbit: "/images/film-stills/blue-orbit.webp",
  lastWash: "/images/film-stills/last-wash.webp",
  afterHours: "/images/film-stills/after-hours.webp",
  morningCake: "/images/film-stills/morning-cake.webp",
  coastalMap: "/images/film-stills/coastal-map.webp",
  paperCity: "/images/film-stills/paper-city.webp",
} as const;

function themeFor(movie: MovieVector) {
  const seed = [...movie.movieId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return cardThemes[seed % cardThemes.length];
}

function stillFor(movie: MovieVector) {
  const genres = new Set(movie.genres);
  if (genres.has("Animation") || genres.has("Fantasy")) return filmStills.paperCity;
  if (genres.has("Sci-Fi")) return filmStills.blueOrbit;
  if (genres.has("Crime") || genres.has("Thriller") || genres.has("Horror")) return filmStills.afterHours;
  if (genres.has("Comedy")) return filmStills.morningCake;
  if (genres.has("Adventure") || genres.has("Action")) return filmStills.coastalMap;
  return Number(movie.movieId.replace(/\D/g, "").slice(-1) || 0) % 2 ? filmStills.lastWash : filmStills.coastalMap;
}

function laneStill(lane: LaneId) {
  return lane === "lane-a" ? filmStills.afterHours : lane === "lane-b" ? filmStills.blueOrbit : filmStills.lastWash;
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
  );
}

function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5V7Z" /></svg>;
}

function IntroSequence({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<IntroStage>("scan");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timings = reducedMotion ? [80, 160, 240, 320] : [1800, 3900, 6200, 7200];
    const timers = [
      window.setTimeout(() => setStage("pattern"), timings[0]),
      window.setTimeout(() => setStage("guest"), timings[1]),
      window.setTimeout(() => setStage("leaving"), timings[2]),
      window.setTimeout(onDone, timings[3]),
    ];
    return () => {
      timers.forEach(window.clearTimeout);
      document.body.style.overflow = previousOverflow;
    };
  }, [onDone]);

  const finish = () => {
    setStage("leaving");
    window.setTimeout(onDone, 180);
  };

  return (
    <section className={`signal-intro stage-${stage}`} aria-live="polite" aria-label="Checking recommendation signals">
      <button className="intro-skip" type="button" onClick={finish}>Skip intro</button>
      <div className="intro-brand">SplitTaste<span>+</span></div>
      <div className="signal-scene" aria-hidden="true">
        <div className="signal-orb"><span /><i /><i /><i /></div>
        <div className="signal-particles"><i /><i /><i /><i /><i /><i /></div>
      </div>
      <div className="intro-copy">
        <div className="intro-copy-frame" key={stage}>
        <p className="intro-status">
          {stage === "scan" && "Reading this profile"}
          {stage === "pattern" && "Something shifted"}
          {(stage === "guest" || stage === "leaving") && "Possible shared viewing"}
        </p>
        <h1>
          {stage === "scan" && <>Calibrating your<br />taste signal…</>}
          {stage === "pattern" && <>This profile has<br />a new pattern.</>}
          {(stage === "guest" || stage === "leaving") && <>Someone else may have<br />watched on this profile.</>}
        </h1>
        <p className="intro-detail">
          {stage === "scan" && "Comparing recent choices with the patterns that usually shape this home row."}
          {stage === "pattern" && "A few recent choices are moving differently from the rest of your taste."}
          {(stage === "guest" || stage === "leaving") && "This is only a signal—not an identity guess. A quick calibration can put your preferences back in the lead."}
        </p>
        </div>
      </div>
      <div className="intro-progress" aria-hidden="true"><i /><i /><i /></div>
    </section>
  );
}

function MovieCard({ movie, index, signal, compact = false }: { movie: MovieVector; index?: number; signal?: string; compact?: boolean }) {
  return (
    <article className={`movie-card theme-${themeFor(movie)} ${compact ? "compact" : ""}`}>
      <div className="movie-art" aria-hidden="true">
        <Image className="movie-still" src={stillFor(movie)} alt="" fill priority={index === 1} sizes={compact ? "370px" : "(max-width: 600px) 72vw, 19vw"} />
        <span className="art-mark">{String(index ?? 1).padStart(2, "0")}</span>
        <strong>{movie.title}</strong>
      </div>
      <div className="movie-meta">
        <div><h3>{movie.title}</h3><p>{movie.genres.slice(0, 2).join(" · ")}</p></div>
        {signal && <span className="signal-tag">{signal}</span>}
      </div>
    </article>
  );
}

function ContentRail({ title, note, movies, signalFirst = false, id }: { title: string; note?: string; movies: MovieVector[]; signalFirst?: boolean; id?: string }) {
  return (
    <section className="content-rail" id={id}>
      <header><h2>{title}</h2>{note && <p>{note}</p>}</header>
      <div className="rail-track">
        {movies.map((movie, index) => (
          <MovieCard key={`${movie.movieId}-${index}`} movie={movie} index={index + 1} signal={signalFirst && index === 0 ? "New signal" : undefined} />
        ))}
      </div>
    </section>
  );
}

function LaneOption({ lane, selected, onSelect }: { lane: TasteLane; selected: boolean; onSelect: () => void }) {
  const copy = laneCopy[lane.id];
  return (
    <button
      type="button"
      className={`lane-option ${selected ? "selected" : ""}`}
      style={{ "--lane-accent": lane.accent } as React.CSSProperties}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="lane-preview" aria-hidden="true">
        <Image src={laneStill(lane.id)} alt="" fill sizes="300px" />
        {lane.anchorTitles.slice(0, 3).map((title, index) => <i key={title} className={`preview-${index + 1}`}>{title.slice(0, 1)}</i>)}
      </span>
      <span className="lane-copy"><strong>{copy.name}</strong><small>{copy.description}</small></span>
      <span className="selection-ring">{selected ? "✓" : ""}</span>
    </button>
  );
}

function RepairDialog({
  bundle,
  phase,
  ownerLane,
  candidate,
  onLane,
  onAnswer,
  onClose,
}: {
  bundle: DemoBundle;
  phase: RepairPhase;
  ownerLane: LaneId | null;
  candidate: MovieVector;
  onLane: (lane: LaneId) => void;
  onAnswer: (answer: GuestAnswer) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase === "idle" || phase === "complete") return;
    const firstButton = dialogRef.current?.querySelector<HTMLButtonElement>("button:not(.dialog-close)");
    firstButton?.focus();
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, phase]);

  if (phase === "idle" || phase === "complete") return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="repair-dialog" role="dialog" aria-modal="true" aria-labelledby="repair-title" ref={dialogRef}>
        <header className="dialog-header">
          <div className="dialog-brand">SplitTaste <span>Repair</span></div>
          <div className="step-dots" aria-label={phase === "question-one" ? "Step 1 of 2" : "Step 2 of 2"}>
            <i className="active" /><i className={phase !== "question-one" ? "active" : ""} />
          </div>
          <button className="dialog-close" onClick={onClose} aria-label="Close repair flow">×</button>
        </header>

        <div className={`dialog-stage ${phase}`}>
          {phase === "question-one" && (
            <div className="dialog-question question-one-panel">
              <p className="step-label">One quick check</p>
              <h2 id="repair-title">Which row feels most like you?</h2>
              <p className="dialog-explainer">We found three recurring patterns in this account. You decide which one should lead your home screen.</p>
              <div className="lane-options">
                {bundle.lanes.map((lane) => (
                  <LaneOption key={lane.id} lane={lane} selected={ownerLane === lane.id} onSelect={() => onLane(lane.id)} />
                ))}
              </div>
              <p className="dialog-footnote">Taste patterns are not detected people or household roles.</p>
            </div>
          )}

          {phase === "question-two" && (
            <div className="dialog-question question-two-panel">
              <div className="candidate-preview"><MovieCard movie={candidate} compact /></div>
              <div className="candidate-question">
                <p className="step-label">One title can clarify the mix</p>
                <h2 id="repair-title">Was this your pick?</h2>
                <p className="dialog-explainer">It sits between taste patterns, so this answer is more useful than confirming an obvious title.</p>
                <div className="answer-buttons">
                  <button onClick={() => onAnswer("mine")}><span>Yes, that was me</span><ArrowIcon /></button>
                  <button onClick={() => onAnswer("guest")}><span>No, probably a guest</span><ArrowIcon /></button>
                  <button onClick={() => onAnswer("unsure")}><span>I&apos;m not sure</span><ArrowIcon /></button>
                </div>
                <p className="dialog-footnote">“Guest” only comes from your answer. SplitTaste does not infer who watched.</p>
              </div>
            </div>
          )}

          {phase === "applying" && (
            <div className="applying-panel" aria-live="polite">
              <div className="reweight-animation" aria-hidden="true"><i /><i /><i /><span>✓</span></div>
              <p className="step-label">Updating this device</p>
              <h2 id="repair-title">Rebalancing your home row…</h2>
              <p>Keeping every taste. Changing which one leads.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Evidence({ bundle }: { bundle: DemoBundle }) {
  const { evaluation } = bundle;
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  return (
    <details className="evidence-panel">
      <summary><span>Open the evaluation</span><span>Data, metrics, limitations <b>+</b></span></summary>
      <div className="evidence-grid">
        <div className="metric-lead"><p>Offline NDCG@10</p><strong>{evaluation.ndcgSplitTaste.toFixed(3)}</strong><span>after three confirmations across {evaluation.householdCount} synthetic households</span></div>
        <dl>
          <div><dt>Blended account</dt><dd>{evaluation.ndcgBlended.toFixed(3)}</dd></div>
          <div><dt>SplitTaste</dt><dd>{evaluation.ndcgSplitTaste.toFixed(3)}</dd></div>
          <div><dt>Oracle bound</dt><dd>{evaluation.ndcgOracle.toFixed(3)}</dd></div>
          <div><dt>Lane recovery ARI / NMI</dt><dd>{evaluation.ari.toFixed(2)} / {evaluation.nmi.toFixed(2)}</dd></div>
          <div><dt>Abstention precision</dt><dd>{percent(evaluation.abstentionPrecision)}</dd></div>
          <div><dt>Coverage</dt><dd>{percent(evaluation.abstentionCoverage)}</dd></div>
        </dl>
        <div className="claim-box">
          <span className={evaluation.claimSupported ? "claim-dot supported" : "claim-dot"} />
          <p><strong>{evaluation.claimSupported ? "Offline ranking improvement supported." : "Hypothesis under evaluation."}</strong> 95% CI for NDCG delta: [{evaluation.deltaCi95[0].toFixed(3)}, {evaluation.deltaCi95[1].toFixed(3)}]. This is not measured viewing, engagement, retention, or production lift.</p>
        </div>
      </div>
    </details>
  );
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.18 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return <div ref={ref} className={`essay-reveal ${visible ? "is-visible" : ""} ${className}`}>{children}</div>;
}

function RankingComparison({ bundle }: { bundle: DemoBundle }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const rows = [
    { label: "One blended profile", value: bundle.evaluation.ndcgBlended, tone: "blended" },
    { label: "SplitTaste · 3 answers", value: bundle.evaluation.ndcgSplitTaste, tone: "split" },
    { label: "Oracle upper bound", value: bundle.evaluation.ndcgOracle, tone: "oracle" },
  ];
  const max = Math.max(...rows.map((row) => row.value));
  return (
    <div ref={ref} className={`ranking-comparison ${visible ? "is-visible" : ""}`}>
      <div className="chart-heading"><div><p>Held-out ranking quality</p><h3>Separating tastes recovered part of the signal.</h3></div><span>NDCG@10 · offline</span></div>
      <div className="ranking-axis"><span>0</span><span>{max.toFixed(3)}</span></div>
      <div className="ranking-rows">
        {rows.map((row) => <div className="ranking-row" key={row.label}><strong>{row.label}</strong><div><i className={row.tone} style={{ "--bar-width": `${(row.value / max) * 100}%` } as React.CSSProperties} /></div><b>{row.value.toFixed(3)}</b></div>)}
      </div>
      <p className="chart-note">The oracle uses evaluator-only source mappings. It is a ceiling for comparison, never part of the public product.</p>
    </div>
  );
}

function CorrectionChart({ bundle }: { bundle: DemoBundle }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const points = bundle.evaluation.correctionCurve;
  const values = points.map((point) => point.ndcgAt10);
  const min = Math.min(...values) - 0.002;
  const max = Math.max(...values) + 0.002;
  const coordinates = points.map((point, index) => ({
    x: 42 + index * 142,
    y: 145 - ((point.ndcgAt10 - min) / (max - min)) * 105,
    ...point,
  }));

  return (
    <div ref={ref} className={`correction-chart ${visible ? "is-visible" : ""}`}>
      <div className="chart-heading"><div><p>Correction curve</p><h3>A few answers move the ranking.</h3></div><span>NDCG@10 · offline</span></div>
      <svg viewBox="0 0 510 190" role="img" aria-label="NDCG at 10 improves as confirmations increase from zero to ten">
        <title>Correction curve for zero, three, five, and ten confirmations</title>
        {[40, 75, 110, 145].map((y) => <line key={y} x1="42" x2="468" y1={y} y2={y} className="grid-line" />)}
        <polyline points={coordinates.map((point) => `${point.x},${point.y}`).join(" ")} className="curve-line" />
        {coordinates.map((point) => (
          <g key={point.confirmations}>
            <circle cx={point.x} cy={point.y} r="5" />
            <text x={point.x} y={point.y - 13} textAnchor="middle">{point.ndcgAt10.toFixed(3)}</text>
            <text x={point.x} y="173" textAnchor="middle">{point.confirmations} answers</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function CohortExplorer({ rows }: { rows: CohortResult[] }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const dimensions: CohortResult["dimension"][] = ["overlap", "household size", "activity", "sparsity"];
  const [dimension, setDimension] = useState<CohortResult["dimension"]>("overlap");
  const visibleRows = rows.filter((row) => row.dimension === dimension);
  const maxValue = Math.max(...visibleRows.flatMap((row) => [row.ndcgBlended, row.ndcgSplitTaste])) * 1.08;

  return (
    <div ref={ref} className={`cohort-explorer ${visible ? "is-visible" : ""}`}>
      <div className="chart-heading"><div><p>Cohort EDA</p><h3>The average hides where the idea struggles.</h3></div><span>72 households · 24 per displayed cohort</span></div>
      <div className="cohort-tabs" role="tablist" aria-label="Cohort dimension">
        {dimensions.map((item) => <button key={item} role="tab" aria-selected={dimension === item} className={dimension === item ? "active" : ""} onClick={() => setDimension(item)}>{item}</button>)}
      </div>
      <div className="bar-legend"><span><i className="blended" />Blended</span><span><i className="split" />SplitTaste</span></div>
      <div className="cohort-bars" key={dimension}>
        {visibleRows.map((row) => {
          const delta = row.ndcgSplitTaste - row.ndcgBlended;
          return (
            <div className="cohort-row" key={`${row.dimension}-${row.cohort}`}>
              <div className="cohort-label"><strong>{row.cohort}</strong><span>{row.households} households</span></div>
              <div className="bar-pair">
                <i className="bar blended" style={{ "--bar-width": `${(row.ndcgBlended / maxValue) * 100}%` } as React.CSSProperties}><span>{row.ndcgBlended.toFixed(3)}</span></i>
                <i className="bar split" style={{ "--bar-width": `${(row.ndcgSplitTaste / maxValue) * 100}%` } as React.CSSProperties}><span>{row.ndcgSplitTaste.toFixed(3)}</span></i>
              </div>
              <div className={`cohort-delta ${delta < 0 ? "negative" : ""}`}>{delta >= 0 ? "+" : ""}{delta.toFixed(3)}</div>
            </div>
          );
        })}
      </div>
      <p className="cohort-reading">Read this as directional offline evidence, not a population estimate. Switch cohorts to inspect heterogeneity and failure cases.</p>
    </div>
  );
}

function ResearchSection({ bundle }: { bundle: DemoBundle }) {
  const { source, modelingCohort, householdDesign } = bundle.research;
  const format = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M` : value.toLocaleString();

  return (
    <section className="research-section" id="evidence">
      <Reveal className="essay-title">
        <p>SplitTaste · a visual data essay</p>
        <h2>When one profile<br /><em>remembers everyone.</em></h2>
        <span>{format(source.ratingEvents)} rating events, {householdDesign.households} synthetic households, and one question: can a few corrections repair a mixed recommendation profile?</span>
      </Reveal>

      <Reveal className="essay-prose essay-lede">
        <p>MovieLens does not contain households. It contains anonymous people rating movies. So I kept their real rating behavior, then deterministically combined two to four users into synthetic shared accounts.</p>
        <p><strong>The account is synthetic. The preferences inside it are not.</strong> Original user mappings remain evaluator-only, and rating timestamps are treated as rating events—not viewing sessions.</p>
      </Reveal>

      <Reveal className="source-strip">
        <div><span>MovieLens 32M</span><strong>{format(source.ratingEvents)}</strong><small>rating events</small></div>
        <div><span>Public source</span><strong>{source.movies.toLocaleString()}</strong><small>movies</small></div>
        <div><span>Anonymous</span><strong>{source.anonymizedUsers.toLocaleString()}</strong><small>users</small></div>
        <div><span>Modeling cohort</span><strong>{format(modelingCohort.ratingEvents)}</strong><small>rating events</small></div>
      </Reveal>

      <Reveal className="essay-prose essay-question">
        <p className="section-number">01 · Constructing the test</p>
        <h3>First, I needed households that do not exist in the source data.</h3>
        <p>Eligible users were split chronologically, embedded in {modelingCohort.embeddingDimensions} dimensions, and grouped into households with low, medium, or high taste overlap. A fixed seed makes the full experiment reproducible.</p>
      </Reveal>

      <Reveal className="pipeline-flow">
        <div><b>01</b><strong>Ingest</strong><span>CSV → Parquet</span><small>Checksum + schema gates</small></div><i>→</i>
        <div><b>02</b><strong>Model</strong><span>{modelingCohort.users.toLocaleString()} users</span><small>{modelingCohort.embeddingDimensions}D movie embeddings</small></div><i>→</i>
        <div><b>03</b><strong>Mix</strong><span>{householdDesign.households} households</span><small>Sizes {householdDesign.sizes.join("–")} · seed {householdDesign.fixedSeed}</small></div><i>→</i>
        <div><b>04</b><strong>Serve</strong><span>DemoBundle</span><small>No IDs or raw timestamps</small></div>
      </Reveal>

      <Reveal className="essay-prose essay-question">
        <p className="section-number">02 · The cost of blending</p>
        <h3>What gets lost when several coherent tastes become one average?</h3>
        <p>I compared three conditions on held-out rating events: treating the household as one person, inferring editable taste lanes, and an oracle that knows the hidden source mapping.</p>
      </Reveal>
      <RankingComparison bundle={bundle} />

      <Reveal className="essay-prose essay-question">
        <p className="section-number">03 · The smallest useful intervention</p>
        <h3>How many questions does it take to move the ranking?</h3>
        <p>The system asks about titles that are both uncertain and likely to change recommendations. Three confirmations produced a measurable offline improvement; more answers kept helping, but with diminishing returns.</p>
      </Reveal>
      <CorrectionChart bundle={bundle} />

      <Reveal className="essay-prose essay-question">
        <p className="section-number">04 · Where the idea breaks</p>
        <h3>The average result hides the difficult households.</h3>
        <p>Switch the cohort below. SplitTaste helped many groups, but the middle-activity cohort regressed. That failure is product information, not a footnote.</p>
      </Reveal>
      <CohortExplorer rows={bundle.research.cohortResults} />

      <Reveal className="honesty-section">
        <p className="section-number">05 · The honest boundary</p>
        <h3>The model found useful tastes.<br />It did <em>not</em> recover people.</h3>
        <div className="honesty-numbers"><div><strong>{bundle.evaluation.ari.toFixed(3)}</strong><span>ARI · source-person recovery</span></div><div><strong>{(bundle.evaluation.laneCountAccuracy * 100).toFixed(1)}%</strong><span>correct lane-count selection</span></div></div>
        <p>That result changed the product. SplitTaste exposes voluntary, editable taste lanes—not “detected people,” demographics, family roles, or unauthorized account users.</p>
      </Reveal>

      <Reveal className="essay-method">
        <h3>Methodology & limitations</h3>
        <p><strong>What this demonstrates.</strong> A reproducible ETL and evaluation path, a baseline–model–oracle comparison, cohort diagnostics, confidence gates, and a user-facing correction loop.</p>
        <p><strong>What it does not demonstrate.</strong> Real household identification, confirmed watches, engagement lift, retention lift, production readiness, or any result using Prime Video data.</p>
        <p><strong>What I would test next.</strong> A prospective study where people voluntarily label a small number of mixed-profile events, with calibration and abstention thresholds set before measuring recommendation quality.</p>
      </Reveal>

      <Reveal><Evidence bundle={bundle} /></Reveal>
    </section>
  );
}

export function SplitTasteExperience({ bundle }: { bundle: DemoBundle }) {
  const [showIntro, setShowIntro] = useState(true);
  const [phase, setPhase] = useState<RepairPhase>("idle");
  const [ownerLane, setOwnerLane] = useState<LaneId | null>(null);
  const [guestAnswer, setGuestAnswer] = useState<GuestAnswer | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const homeRowRef = useRef<HTMLElement>(null);
  const candidate = bundle.correctionCandidates[0];

  const assignments = useMemo<Assignments>(() => {
    if (!ownerLane || !guestAnswer || guestAnswer === "unsure") return {};
    return { [candidate.movieId]: guestAnswer === "mine" ? ownerLane : bestOtherLane(bundle, ownerLane, candidate) };
  }, [bundle, candidate, guestAnswer, ownerLane]);

  const recommendations = useMemo(() => laneRecommendations(bundle, assignments, 5), [bundle, assignments]);
  const complete = phase === "complete" && ownerLane !== null;
  const selectedLane = bundle.lanes.find((lane) => lane.id === ownerLane);
  const homeMovies = complete && !showBefore && ownerLane ? recommendations[ownerLane] : bundle.blendedRecommendations.slice(0, 5);
  const recentMovies = [...bundle.correctionCandidates.slice(0, 3), ...bundle.recommendationCandidates.slice(0, 2)];
  const discoveryMovies = bundle.recommendationCandidates.slice(10, 15);

  const startRepair = () => {
    setShowBefore(false);
    setPhase("question-one");
  };

  const selectLane = (lane: LaneId) => {
    setOwnerLane(lane);
    window.setTimeout(() => setPhase("question-two"), 220);
  };

  const answerGuest = (answer: GuestAnswer) => {
    setGuestAnswer(answer);
    setPhase("applying");
    window.setTimeout(() => {
      setPhase("complete");
      window.setTimeout(() => homeRowRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }), 80);
    }, 760);
  };

  const reset = () => {
    setPhase("idle");
    setOwnerLane(null);
    setGuestAnswer(null);
    setShowBefore(false);
  };

  return (
    <main className="streaming-app">
      {showIntro && <IntroSequence onDone={() => setShowIntro(false)} />}
      <div className={`experience-shell ${showIntro ? "intro-obscured" : ""}`} aria-hidden={showIntro}>
      <nav className="stream-nav" aria-label="Primary">
        <a href="#home" className="brand">SplitTaste<span>+</span></a>
        <div className="nav-links"><a href="#home">Product demo</a><a href="#browse">Browse</a><a href="#evidence">Data & evaluation</a></div>
        <button className="profile-control" onClick={startRepair}><span>J</span><b>Your profile</b><i>⌄</i></button>
      </nav>

      <section className="stream-hero" id="home">
        <div className="living-room-art" aria-hidden="true">
          <div className="window-glow" /><div className="tv-frame"><div className="tv-light"><span>PLAY</span></div></div><div className="couch"><i /><i /></div><div className="room-shadow" />
        </div>
        <div className="hero-vignette" />
        <div className="hero-copy">
          <p className="hero-kicker"><span>Guest night</span> · Your profile</p>
          <h1>A friend pressed play.<br />Your home row changed.</h1>
          <p>They used the profile already open on your TV. No one did anything wrong, but now their taste is mixed into yours.</p>
          <div className="hero-actions">
            <button className="repair-button" onClick={startRepair}><span className="button-icon">✦</span>Repair my recommendations</button>
            <a className="quiet-button" href="#why"><PlayIcon />See the idea</a>
          </div>
          <div className="hero-facts"><span>2 questions</span><span>Runs locally</span><span>No identity inference</span></div>
        </div>
      </section>

      <div className="catalog" id="browse">
        <p className="catalog-art-note">Real MovieLens titles · original illustrative stills, not official film art</p>
        <ContentRail title="Recently watched on this profile" note="One account. More than one taste." movies={recentMovies} signalFirst />

        <section className={`content-rail home-recommendations ${complete && !showBefore ? "repaired" : ""}`} ref={homeRowRef} aria-live="polite">
          <header>
            <div>
              <h2>{complete && !showBefore ? "Repaired for you" : "Recommended for you"}</h2>
              <p>{complete && selectedLane && !showBefore ? `${laneCopy[selectedLane.id].name} now leads this row.` : "Every recent signal currently has equal influence."}</p>
            </div>
            {complete ? (
              <div className="compare-switch" role="group" aria-label="Compare recommendations">
                <button className={showBefore ? "active" : ""} onClick={() => setShowBefore(true)}>Before</button>
                <button className={!showBefore ? "active" : ""} onClick={() => setShowBefore(false)}>Repaired</button>
              </div>
            ) : <button className="rail-repair" onClick={startRepair}>This row feels off <ArrowIcon /></button>}
          </header>
          <div className="rail-track recommendation-update" key={`${complete}-${showBefore}-${ownerLane}`}>
            {homeMovies.map((movie, index) => <MovieCard key={`${movie.movieId}-${index}`} movie={movie} index={index + 1} />)}
          </div>
          {complete && !showBefore && (
            <div className="repair-receipt">
              <div className="receipt-icon">✓</div>
              <div><strong>Your taste is leading again.</strong><p>We changed the weights, not the history. Other taste patterns are still available.</p></div>
              <button onClick={reset}>Undo repair</button>
            </div>
          )}
        </section>

        <ContentRail title="Stories that stay with you" note="A quieter lane from this account" movies={discoveryMovies} />
      </div>

      <section className="product-story" id="why">
        <div className="story-index">01</div>
        <div className="story-copy"><p>The product idea</p><h2>Profiles prevent the mix.<br />SplitTaste repairs it.</h2></div>
        <div className="story-body">
          <p>On a couch, the lowest-friction action wins: people press play. SplitTaste looks for recurring taste patterns, then asks the account owner for just enough context to rebalance the home screen.</p>
          <ul><li>User-controlled labels</li><li>Uncertain answers are allowed</li><li>Other tastes are kept, not erased</li></ul>
        </div>
      </section>

      <ResearchSection bundle={bundle} />

      <footer><div className="brand">SplitTaste<span>+</span></div><p>Independent, noncommercial research demo. Not affiliated with Amazon or Prime Video.</p><a href="#home">Back to top ↑</a></footer>

      <RepairDialog bundle={bundle} phase={phase} ownerLane={ownerLane} candidate={candidate} onLane={selectLane} onAnswer={answerGuest} onClose={() => setPhase("idle")} />
      </div>
    </main>
  );
}

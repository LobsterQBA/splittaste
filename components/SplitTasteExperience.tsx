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
const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const filmStills = {
  blueOrbit: `${publicBasePath}/images/film-stills/blue-orbit.webp`,
  lastWash: `${publicBasePath}/images/film-stills/last-wash.webp`,
  afterHours: `${publicBasePath}/images/film-stills/after-hours.webp`,
  morningCake: `${publicBasePath}/images/film-stills/morning-cake.webp`,
  coastalMap: `${publicBasePath}/images/film-stills/coastal-map.webp`,
  paperCity: `${publicBasePath}/images/film-stills/paper-city.webp`,
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
      <div className="chart-heading"><div><p>Recommendation quality</p><h3>Did the separated tastes rank movies better?</h3></div><span>NDCG@10 · offline test</span></div>
      <div className="ranking-axis"><span>0</span><span>{max.toFixed(3)}</span></div>
      <div className="ranking-rows">
        {rows.map((row) => <div className="ranking-row" key={row.label}><strong>{row.label}</strong><div><i className={row.tone} style={{ "--bar-width": `${(row.value / max) * 100}%` } as React.CSSProperties} /></div><b>{row.value.toFixed(3)}</b></div>)}
      </div>
      <p className="chart-note">Higher is better. The oracle shows the best result we could expect if we already knew which source user rated each movie.</p>
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
      <div className="chart-heading"><div><p>Correction curve</p><h3>Each answer helps the model adjust.</h3></div><span>NDCG@10 · offline test</span></div>
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
      <div className="chart-heading"><div><p>Household breakdown</p><h3>The average does not tell the whole story.</h3></div><span>72 synthetic households</span></div>
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
      <p className="cohort-reading">Switch the tabs to see where SplitTaste helped and where it did not. These are offline test results, not real customer behavior.</p>
    </div>
  );
}

function ResearchSection({ bundle }: { bundle: DemoBundle }) {
  const { source, modelingCohort, householdDesign } = bundle.research;
  const format = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M` : value.toLocaleString();

  return (
    <section className="research-section" id="evidence">
      <Reveal className="essay-title">
        <p>A MovieLens 32M experiment</p>
        <h2>Can a shared profile<br /><em>be repaired?</em></h2>
        <span>I used a public movie-rating dataset to test whether a few simple answers could improve recommendations on a mixed profile.</span>
      </Reveal>

      <Reveal className="essay-prose essay-lede">
        <p><strong>I started with MovieLens 32M.</strong> It contains {format(source.ratingEvents)} movie ratings from {source.anonymizedUsers.toLocaleString()} anonymous users. It does not contain households, profiles, or confirmed viewing history.</p>
        <p>To recreate the shared-TV problem, I combined two to four real MovieLens users into one synthetic account. Their ratings stayed real; only the shared household was simulated.</p>
        <p><strong>The question was simple:</strong> if one account contains several consistent tastes, can a few user answers separate them well enough to improve its recommendations?</p>
      </Reveal>

      <Reveal className="source-strip">
        <div><span>MovieLens 32M</span><strong>{format(source.ratingEvents)}</strong><small>rating events</small></div>
        <div><span>Public source</span><strong>{source.movies.toLocaleString()}</strong><small>movies</small></div>
        <div><span>Anonymous</span><strong>{source.anonymizedUsers.toLocaleString()}</strong><small>users</small></div>
        <div><span>Modeling cohort</span><strong>{format(modelingCohort.ratingEvents)}</strong><small>rating events</small></div>
      </Reveal>

      <Reveal className="essay-prose essay-question">
        <p className="section-number">01 · How I built the test</p>
        <h3>I turned individual ratings into shared accounts.</h3>
        <p>I kept earlier ratings for training and later ratings for testing. Then I represented movies in {modelingCohort.embeddingDimensions} dimensions and created households with low, medium, and high taste overlap. The fixed seed means the same households can be rebuilt every time.</p>
      </Reveal>

      <Reveal className="pipeline-flow">
        <div><b>01</b><strong>Ingest</strong><span>CSV → Parquet</span><small>Checksum + schema gates</small></div><i>→</i>
        <div><b>02</b><strong>Model</strong><span>{modelingCohort.users.toLocaleString()} users</span><small>{modelingCohort.embeddingDimensions}D movie embeddings</small></div><i>→</i>
        <div><b>03</b><strong>Mix</strong><span>{householdDesign.households} households</span><small>Sizes {householdDesign.sizes.join("–")} · seed {householdDesign.fixedSeed}</small></div><i>→</i>
        <div><b>04</b><strong>Serve</strong><span>DemoBundle</span><small>No IDs or raw timestamps</small></div>
      </Reveal>

      <Reveal className="essay-prose essay-question">
        <p className="section-number">02 · The first question</p>
        <h3>Does separating the tastes improve recommendations?</h3>
        <p>I compared three versions: one blended profile, SplitTaste after three user answers, and an oracle that already knows the original user behind each rating.</p>
      </Reveal>
      <RankingComparison bundle={bundle} />

      <Reveal className="essay-prose essay-question">
        <p className="section-number">03 · The second question</p>
        <h3>How many answers are enough?</h3>
        <p>I chose movies where the model was uncertain and where an answer could change the recommendation list. Three answers improved the offline ranking. More answers still helped, but each extra answer added less.</p>
      </Reveal>
      <CorrectionChart bundle={bundle} />

      <Reveal className="essay-prose essay-question">
        <p className="section-number">04 · Where did it struggle?</p>
        <h3>Some households were easier than others.</h3>
        <p>SplitTaste helped several groups, but it performed worse for the middle-activity cohort. That matters because a good average can still hide a poor experience for one group.</p>
      </Reveal>
      <CohortExplorer rows={bundle.research.cohortResults} />

      <Reveal className="essay-method">
        <h3>What this project shows</h3>
        <p><strong>The data work:</strong> a reproducible pipeline from raw ratings to a browser-safe demo, with chronological testing and the original user mapping kept out of the public bundle.</p>
        <p><strong>The product idea:</strong> ask for a small amount of context when it can meaningfully change the recommendation list.</p>
        <p><strong>The limit:</strong> these are synthetic households and offline ranking results. They do not show real viewing, engagement, retention, or production impact.</p>
        <p><strong>What I would test next:</strong> let volunteers label a few mixed-profile choices, then measure whether the calibrated recommendations actually feel more relevant.</p>
      </Reveal>
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
          <div className="window-glow" /><div className="tv-frame"><div className="tv-light"><Image src={filmStills.blueOrbit} alt="" fill priority sizes="48vw" /><span>PLAY</span></div></div><div className="couch"><i /><i /></div><div className="room-shadow" />
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
        </div>
      </section>

      <ResearchSection bundle={bundle} />

      <footer><div className="brand">SplitTaste<span>+</span></div><div className="footer-links"><a href="https://github.com/LobsterQBA/splittaste" target="_blank" rel="noreferrer">GitHub ↗</a><a href="#home">Back to top ↑</a></div></footer>

      <RepairDialog bundle={bundle} phase={phase} ownerLane={ownerLane} candidate={candidate} onLane={selectLane} onAnswer={answerGuest} onClose={() => setPhase("idle")} />
      </div>
    </main>
  );
}

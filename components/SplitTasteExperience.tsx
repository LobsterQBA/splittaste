"use client";

import { useMemo, useRef, useState } from "react";
import { bestOtherLane, laneRecommendations, type Assignments } from "@/lib/recommend";
import type { DemoBundle, LaneId, MovieVector } from "@/types/demo";

type GuestAnswer = "mine" | "guest" | "unsure";

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

function RecommendationRow({ movies, tone = "dark" }: { movies: MovieVector[]; tone?: "dark" | "light" }) {
  return (
    <div className={`recommendation-row ${tone}`}>
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
        <span>How we tested the idea</span>
        <span className="summary-action">Open data + metrics</span>
      </summary>
      <div className="evidence-grid">
        <div className="metric-lead">
          <p className="micro-label">Offline NDCG@10</p>
          <strong>{evaluation.ndcgSplitTaste.toFixed(3)}</strong>
          <span>after three confirmations · {evaluation.householdCount} synthetic households</span>
        </div>
        <dl>
          <div><dt>One blended account</dt><dd>{evaluation.ndcgBlended.toFixed(3)}</dd></div>
          <div><dt>SplitTaste, 3 answers</dt><dd>{evaluation.ndcgSplitTaste.toFixed(3)}</dd></div>
          <div><dt>Oracle upper bound</dt><dd>{evaluation.ndcgOracle.toFixed(3)}</dd></div>
          <div><dt>Lane recovery ARI / NMI</dt><dd>{evaluation.ari.toFixed(2)} / {evaluation.nmi.toFixed(2)}</dd></div>
          <div><dt>Abstention precision</dt><dd>{percent(evaluation.abstentionPrecision)}</dd></div>
          <div><dt>Abstention coverage</dt><dd>{percent(evaluation.abstentionCoverage)}</dd></div>
        </dl>
        <div className="claim-box">
          <span className={evaluation.claimSupported ? "claim-dot supported" : "claim-dot"} />
          <div>
            <strong>{evaluation.claimSupported ? "Offline ranking improvement supported" : "Hypothesis under evaluation"}</strong>
            <p>
              95% CI for the NDCG delta: [{evaluation.deltaCi95[0].toFixed(3)}, {evaluation.deltaCi95[1].toFixed(3)}].
              This does not measure viewing time, engagement, retention, or production lift.
            </p>
          </div>
        </div>
      </div>
    </details>
  );
}

export function SplitTasteExperience({ bundle }: { bundle: DemoBundle }) {
  const [ownerLane, setOwnerLane] = useState<LaneId | null>(null);
  const [guestAnswer, setGuestAnswer] = useState<GuestAnswer | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const candidate = bundle.correctionCandidates[0];
  const complete = ownerLane !== null && guestAnswer !== null;

  const assignments = useMemo<Assignments>(() => {
    if (!ownerLane || !guestAnswer || guestAnswer === "unsure") return {};
    return {
      [candidate.movieId]: guestAnswer === "mine"
        ? ownerLane
        : bestOtherLane(bundle, ownerLane, candidate),
    };
  }, [bundle, candidate, guestAnswer, ownerLane]);

  const recommendations = useMemo(
    () => laneRecommendations(bundle, assignments, 4),
    [bundle, assignments],
  );

  const selectedLane = bundle.lanes.find((lane) => lane.id === ownerLane);
  const mixedTitles = [
    candidate.title,
    ...bundle.lanes.flatMap((lane) => lane.anchorTitles.slice(0, 2)),
  ].slice(0, 7);

  const reset = () => {
    setOwnerLane(null);
    setGuestAnswer(null);
    document.getElementById("repair")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main>
      <div className="grain" />
      <nav className="masthead" aria-label="Primary">
        <a href="#top" className="wordmark">SplitTaste<span>●</span></a>
        <div className="nav-note">A user-controlled recommendation repair demo</div>
        <a href="#evidence">Evidence / 04</a>
      </nav>

      <section className="hero" id="top">
        <p className="eyebrow">A familiar streaming problem</p>
        <h1>
          My friend used<br />my TV. Now my<br /><em>recommendations<br />feel like theirs.</em>
        </h1>
        <div className="hero-bottom">
          <p>
            They pressed play on my profile. I didn&apos;t stop the movie to create a guest account.
            A few nights later, my home screen no longer felt like mine.
          </p>
          <button className="primary-action" onClick={() => document.getElementById("moment")?.scrollIntoView({ behavior: "smooth" })}>
            See what happened <ArrowIcon />
          </button>
        </div>
        <div className="signal-line" aria-hidden="true">
          {Array.from({ length: 42 }, (_, index) => <i key={index} style={{ height: `${12 + ((index * 17) % 52)}px` }} />)}
        </div>
      </section>

      <section className="moment" id="moment">
        <div className="moment-copy">
          <p className="section-number">01 / The moment</p>
          <h2>Profiles solve the data problem.<br /><em>They don&apos;t solve the human moment.</em></h2>
          <p className="body-copy">
            Switching profiles works when people remember. But on a couch, at a friend&apos;s place,
            the natural action is to press play. The result is one history carrying several different tastes.
          </p>
        </div>
        <div className="remote-scene" aria-label="A guest presses play without switching profiles">
          <div className="profile-pill"><span>●</span> Your profile</div>
          <div className="remote-button">▶</div>
          <div className="remote-caption">The lowest-friction choice wins.</div>
        </div>
      </section>

      <section className="mixed-history">
        <p className="section-number">02 / One account, mixed signals</p>
        <div className="history-header">
          <h2>The account remembers the titles.<br />It doesn&apos;t know the context.</h2>
          <p>
            SplitTaste looks for recurring taste patterns in the mixed history.
            It does not identify people, ages, relationships, or who owns the account.
          </p>
        </div>
        <div className="title-stream" aria-label="Example titles from a mixed history">
          {mixedTitles.map((title, index) => (
            <span key={`${title}-${index}`} className={`stream-title stream-${(index % 3) + 1}`}>{title}</span>
          ))}
        </div>
        <button className="primary-action repair-cta" onClick={() => document.getElementById("repair")?.scrollIntoView({ behavior: "smooth" })}>
          Fix my recommendations <ArrowIcon />
        </button>
      </section>

      <section className="repair" id="repair">
        <header className="repair-header">
          <div>
            <p className="section-number">03 / A two-question repair</p>
            <h2>We found three consistent<br />taste patterns.</h2>
          </div>
          <div className="privacy-note">You label the pattern.<br />The model does not label the person.</div>
        </header>

        <fieldset className="question-block">
          <legend><span>Question 1 of 2</span>Which taste feels most like yours?</legend>
          <div className="taste-options">
            {bundle.lanes.map((lane) => (
              <button
                type="button"
                key={lane.id}
                className={`taste-option ${ownerLane === lane.id ? "selected" : ""}`}
                style={{ "--lane-accent": lane.accent } as React.CSSProperties}
                onClick={() => { setOwnerLane(lane.id); setGuestAnswer(null); }}
                aria-pressed={ownerLane === lane.id}
              >
                <span className="lane-dot" />
                <span className="micro-label">{lane.eyebrow}</span>
                <strong>{lane.name}</strong>
                <span className="lane-description">{lane.description}</span>
                <span className="anchor-list">{lane.anchorTitles.slice(0, 3).join(" · ")}</span>
                <span className="choose-label">{ownerLane === lane.id ? "This feels like me ✓" : "Choose this taste"}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {ownerLane && (
          <fieldset className="question-block second-question">
            <legend>
              <span>Question 2 of 2</span>
              Was <em>{candidate.title}</em> your choice?
            </legend>
            <p className="question-context">
              This title sits between patterns, so one answer changes the recommendation weights more than confirming an obvious title.
            </p>
            <div className="answer-options">
              {([
                ["mine", "Yes, that was me"],
                ["guest", "No, probably a guest"],
                ["unsure", "I'm not sure"],
              ] as [GuestAnswer, string][]).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={guestAnswer === value ? "selected" : ""}
                  onClick={() => setGuestAnswer(value)}
                  aria-pressed={guestAnswer === value}
                >
                  <span>{label}</span><span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {complete && (
          <button className="reveal-button" onClick={() => resultsRef.current?.scrollIntoView({ behavior: "smooth" })}>
            See my repaired recommendations <ArrowIcon />
          </button>
        )}
      </section>

      <section className={`results ${complete ? "is-revealed" : ""}`} ref={resultsRef} aria-live="polite">
        {complete && selectedLane && (
          <>
            <header className="result-hero">
              <div>
                <p className="section-number">The result</p>
                <h2>Your recommendations<br /><em>feel like yours again.</em></h2>
              </div>
              <div className="result-stamp">Updated in your browser<br />No identity inferred</div>
            </header>

            <div className="comparison">
              <section className="before-panel">
                <div className="panel-heading"><span>Before</span><p>Every taste had equal influence.</p></div>
                <RecommendationRow movies={bundle.blendedRecommendations.slice(0, 4)} tone="light" />
              </section>
              <section className="after-panel" style={{ "--lane-accent": selectedLane.accent } as React.CSSProperties}>
                <div className="panel-heading">
                  <span>After</span>
                  <p><strong>{selectedLane.name}</strong> now leads this home row.</p>
                </div>
                <RecommendationRow movies={recommendations[selectedLane.id]} />
              </section>
            </div>

            <div className="what-changed">
              <div>
                <p className="micro-label">What changed</p>
                <h3>We changed the weights,<br />not the history.</h3>
              </div>
              <p>
                Your chosen taste now leads the recommendation row. The other patterns are kept, not deleted,
                and can still be used for a guest night or another household member. “Guest” was your answer—not a model inference.
              </p>
              <button onClick={reset}>Undo and try another answer</button>
            </div>
          </>
        )}
      </section>

      <section id="evidence" className="evidence-section">
        <p className="section-number">04 / Evidence, with boundaries</p>
        <h2>A product idea backed by<br />an honest offline test.</h2>
        <p className="evidence-intro">
          MovieLens has anonymous rating events, not households or confirmed watch sessions. We therefore combined real users into
          deterministic synthetic shared accounts, kept the original mapping only for evaluation, and tested whether a few corrections improve ranking.
        </p>
        <Evidence bundle={bundle} />
      </section>

      <footer>
        <div className="footer-thesis">Shared accounts are mixtures<br />with the wrong weights.</div>
        <div className="footer-disclosures">{bundle.disclosures.map((item) => <p key={item}>{item}</p>)}</div>
        <div className="footer-mark">ST / 2026</div>
      </footer>
    </main>
  );
}

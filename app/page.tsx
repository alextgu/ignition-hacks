import { CreateEventForm } from "./create-event-form";

export default function Home() {
  return (
    <main className="create-page">
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="SnapPlan home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SnapPlan</span>
        </a>
        <span className="working-label">working title</span>
      </nav>

      <section className="create-layout">
        <div className="intro-column">
          <div className="eyebrow"><span />Autonomous group planning</div>
          <h1>What are you imagining?</h1>
          <p className="intro-copy">
            Start with the half-formed idea. We&apos;ll help your group find a
            time, agree on a price, and turn it into somewhere you can step into.
          </p>

          <CreateEventForm />
        </div>

        <aside className="world-card" aria-label="Growing world preview">
          <div className="world-meta">
            <span className="live-dot" />
            <span>World preview</span>
            <span className="world-stage">01 / idea</span>
          </div>
          <div className="world-scene" aria-hidden="true">
            <div className="sun-glow" />
            <div className="arch arch-one" />
            <div className="arch arch-two" />
            <div className="table-shape" />
            <div className="seat seat-one" />
            <div className="seat seat-two" />
            <div className="seat seat-three" />
            <div className="floor-line line-one" />
            <div className="floor-line line-two" />
          </div>
          <div className="world-caption">
            <p>Your world grows with the plan.</p>
            <span>Describe the feeling first. Details add light, space, and places for everyone.</span>
          </div>
        </aside>
      </section>
    </main>
  );
}

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

          <form className="create-form">
            <label className="field field-wide">
              <span>Describe the idea</span>
              <textarea
                name="description"
                aria-label="Event idea"
                placeholder="A cozy birthday dinner with shared plates and warm lighting…"
                rows={4}
              />
            </label>

            <div className="form-grid">
              <label className="field field-wide">
                <span>City or area</span>
                <input name="location" aria-label="City or area" placeholder="West Toronto" />
              </label>
              <label className="field">
                <span>Group size</span>
                <input name="groupSize" aria-label="Approximate group size" type="number" min="2" max="30" placeholder="6" />
              </label>
              <label className="field">
                <span>Price from</span>
                <div className="money-input"><span>$</span><input name="priceMin" aria-label="Minimum price per person" type="number" min="0" placeholder="35" /></div>
              </label>
              <label className="field">
                <span>Price to</span>
                <div className="money-input"><span>$</span><input name="priceMax" aria-label="Maximum price per person" type="number" min="0" placeholder="65" /></div>
              </label>
              <label className="field field-wide">
                <span>First possible time</span>
                <input name="timeOptions" aria-label="Possible date and time" type="datetime-local" />
              </label>
            </div>

            <button className="primary-button" type="button">
              Create the shared plan <span aria-hidden="true">→</span>
            </button>
            <p className="form-note">No account needed. You&apos;ll receive a private host link.</p>
          </form>
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

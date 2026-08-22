"use client";

import { useState, type FormEvent } from "react";

type CreatedEvent = {
  guestUrl: string;
  manageUrl: string;
};

export function CreateEventForm() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedEvent | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const timeOptions = data
      .getAll("timeOptions")
      .map(String)
      .filter(Boolean)
      .map((value) => new Date(value).toISOString());

    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: data.get("title"),
          description: data.get("description"),
          location: data.get("location"),
          groupSize: data.get("groupSize"),
          priceMin: data.get("priceMin"),
          priceMax: data.get("priceMax"),
          timeOptions,
        }),
      });
      const result = (await response.json()) as CreatedEvent & { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to create event.");
      setCreated(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create event.");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <section className="created-links" aria-live="polite">
        <h2>Your plan is ready to share</h2>
        <label className="field">
          <span>Guest link</span>
          <input readOnly value={created.guestUrl} onFocus={(event) => event.currentTarget.select()} />
        </label>
        <label className="field">
          <span>Private host link</span>
          <input readOnly value={created.manageUrl} onFocus={(event) => event.currentTarget.select()} />
        </label>
        <p className="form-note">Save the private host link. Anyone with it can manage this event.</p>
      </section>
    );
  }

  return (
    <form className="create-form" onSubmit={submit}>
      <label className="field field-wide">
        <span>Short title (optional)</span>
        <input name="title" aria-label="Event title" placeholder="Maya’s birthday dinner" />
      </label>
      <label className="field field-wide">
        <span>Describe the idea</span>
        <textarea
          name="description"
          aria-label="Event idea"
          placeholder="A cozy birthday dinner with shared plates and warm lighting…"
          rows={4}
          required
        />
      </label>
      <div className="form-grid">
        <label className="field field-wide">
          <span>City or area</span>
          <input name="location" aria-label="City or area" placeholder="West Toronto" required />
        </label>
        <label className="field">
          <span>Group size</span>
          <input name="groupSize" aria-label="Approximate group size" type="number" min="2" max="30" defaultValue="6" required />
        </label>
        <label className="field">
          <span>Price from</span>
          <div className="money-input"><span>$</span><input name="priceMin" aria-label="Minimum price per person" type="number" min="0" defaultValue="35" required /></div>
        </label>
        <label className="field">
          <span>Price to</span>
          <div className="money-input"><span>$</span><input name="priceMax" aria-label="Maximum price per person" type="number" min="0" defaultValue="65" required /></div>
        </label>
        <label className="field field-wide">
          <span>First possible time</span>
          <input name="timeOptions" aria-label="First possible date and time" type="datetime-local" required />
        </label>
        <label className="field field-wide">
          <span>Second possible time (optional)</span>
          <input name="timeOptions" aria-label="Second possible date and time" type="datetime-local" />
        </label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary-button" type="submit" disabled={saving}>
        {saving ? "Creating…" : "Create the shared plan"} <span aria-hidden="true">→</span>
      </button>
      <p className="form-note">No account needed. You&apos;ll receive a private host link.</p>
    </form>
  );
}

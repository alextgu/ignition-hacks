"use client";

import { useEffect, useState, type FormEvent } from "react";
import { buildRsvpRequestPath } from "../../../src/features/guests/identity";

type Attendee = {
  displayName: string;
  selectedTimeOptions: string[];
  priceResponse: "works" | "flexible" | "too_much";
};

export function RsvpForm({
  slug,
  timeOptions,
  invitationToken,
}: {
  slug: string;
  timeOptions: string[];
  invitationToken?: string;
}) {
  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [suggestedName, setSuggestedName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(buildRsvpRequestPath(slug, invitationToken))
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setAttendee(result.attendee);
        setSuggestedName(result.suggestedName ?? "");
      })
      .catch(() => setError("Unable to load your response."))
      .finally(() => setLoading(false));
  }, [invitationToken, slug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(buildRsvpRequestPath(slug, invitationToken), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: data.get("displayName"),
          selectedTimeOptions: data.getAll("selectedTimeOptions"),
          priceResponse: data.get("priceResponse"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAttendee(result.attendee);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading your response…</p>;

  return (
    <form className="temporary-form" onSubmit={submit}>
      <h2>{attendee ? "Your response" : "Can you make it?"}</h2>
      <label className="field">
        <span>Name</span>
        <input
          name="displayName"
          defaultValue={attendee?.displayName ?? suggestedName}
          maxLength={60}
          required
        />
      </label>
      <fieldset>
        <legend>Times that work</legend>
        {timeOptions.map((option) => (
          <label className="temporary-choice" key={option}>
            <input
              type="checkbox"
              name="selectedTimeOptions"
              value={option}
              defaultChecked={attendee?.selectedTimeOptions.includes(option)}
            />
            {new Date(option).toLocaleString()}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Estimated price</legend>
        {[
          ["works", "Works for me"],
          ["flexible", "I’m flexible"],
          ["too_much", "Too much"],
        ].map(([value, label]) => (
          <label className="temporary-choice" key={value}>
            <input
              type="radio"
              name="priceResponse"
              value={value}
              defaultChecked={attendee?.priceResponse === value}
              required
            />
            {label}
          </label>
        ))}
      </fieldset>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary-button" disabled={saving}>
        {saving ? "Saving…" : "Save my response"}
      </button>
    </form>
  );
}

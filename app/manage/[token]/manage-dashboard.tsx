"use client";

import { useEffect, useState } from "react";
import type {
  AttendeeRecord,
  EventRecord,
} from "../../../src/features/events/contracts";

type ManageEvent = Omit<EventRecord, "managementToken">;

export type ManagePayload = {
  event: ManageEvent;
  attendees: AttendeeRecord[];
  guestUrl: string;
  summary: {
    responseCount: number;
    timeCounts: Record<string, number>;
    priceCounts: { works: number; flexible: number; too_much: number };
  };
};

export function ManageDashboard({
  token,
  initial,
}: {
  token: string;
  initial: ManagePayload;
}) {
  const [data, setData] = useState(initial);
  const [refreshError, setRefreshError] = useState("");

  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch(`/api/manage/${token}`);
        if (!response.ok) throw new Error();
        setData(await response.json());
        setRefreshError("");
      } catch {
        setRefreshError("Live refresh failed. The saved data is still shown.");
      }
    };
    const interval = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(interval);
  }, [token]);

  return (
    <>
      <p>{data.event.description}</p>
      <dl className="temporary-details">
        <div><dt>Area</dt><dd>{data.event.location}</dd></div>
        <div><dt>Responses</dt><dd>{data.summary.responseCount} / about {data.event.groupSize}</dd></div>
        <div><dt>Estimate</dt><dd>${data.event.priceMin}–${data.event.priceMax}</dd></div>
      </dl>

      <section className="temporary-section">
        <h2>Share this guest link</h2>
        <input readOnly value={data.guestUrl} onFocus={(event) => event.currentTarget.select()} />
      </section>

      <section className="temporary-section">
        <h2>Availability</h2>
        {data.event.timeOptions.map((option) => (
          <p key={option}>
            <strong>{data.summary.timeCounts[option] ?? 0}</strong> · {new Date(option).toLocaleString()}
          </p>
        ))}
      </section>

      <section className="temporary-section">
        <h2>Price comfort</h2>
        <p>Works: {data.summary.priceCounts.works}</p>
        <p>Flexible: {data.summary.priceCounts.flexible}</p>
        <p>Too much: {data.summary.priceCounts.too_much}</p>
      </section>

      <section className="temporary-section">
        <h2>Guests</h2>
        {data.attendees.length === 0 ? (
          <p>No responses yet.</p>
        ) : (
          <ul>
            {data.attendees.map((attendee) => (
              <li key={attendee.id}>{attendee.displayName} · {attendee.priceResponse.replace("_", " ")}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="temporary-section">
        <h2>Ready to plan</h2>
        <p>Booking, seating, and requirements connect in the next build slice.</p>
        <div className="temporary-actions">
          <button disabled>Book venue</button>
          <button disabled>Choose seating</button>
          <button disabled>Add requirements</button>
        </div>
      </section>
      {refreshError ? <p className="form-error" role="status">{refreshError}</p> : null}
    </>
  );
}

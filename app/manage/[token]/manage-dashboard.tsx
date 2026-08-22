"use client";

import { useEffect, useState, useTransition } from "react";
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

type BookingCall = {
  status?: string;
  externalId?: string;
  outcome?: string;
  summary?: string;
  transcript?: Array<{ role: string; message: string; atSeconds: number }>;
  error?: string;
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
  const [bookingNote, setBookingNote] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [call, setCall] = useState<BookingCall | null>(null);
  const [statusUrl, setStatusUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  useEffect(() => {
    if (!statusUrl) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(statusUrl);
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setCall(body.call ?? null);
        if (
          body.call?.status === "completed" ||
          body.call?.status === "failed"
        ) {
          window.clearInterval(interval);
        }
      } catch {
        // Keep polling; transient network errors are expected.
      }
    };
    const interval = window.setInterval(poll, 3_000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [statusUrl]);

  const startBooking = (live: boolean) => {
    startTransition(async () => {
      setBookingError("");
      setBookingNote(live ? "Starting call…" : "Running dry-run…");
      try {
        const response = await fetch(`/api/manage/${token}/book`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ live }),
        });
        const body = await response.json();
        if (!response.ok) {
          setBookingError(body.error || "Booking request failed.");
          setBookingNote("");
          return;
        }
        setBookingNote(body.note || "Booking request accepted.");
        setCall(body.booking?.call ?? null);
        setStatusUrl(body.statusUrl ?? null);
      } catch {
        setBookingError("Unable to reach the booking endpoint.");
        setBookingNote("");
      }
    });
  };

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
        <p>
          Book venue uses your configured test number by default. Live mode
          places a real ElevenLabs/Twilio call when credentials are ready.
        </p>
        <div className="temporary-actions">
          <button
            type="button"
            disabled={pending}
            onClick={() => startBooking(false)}
          >
            Dry-run book
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startBooking(true)}
          >
            Live / mock call
          </button>
          <button type="button" disabled>
            Choose seating
          </button>
          <button type="button" disabled>
            Add requirements
          </button>
        </div>
        {bookingNote ? <p role="status">{bookingNote}</p> : null}
        {bookingError ? (
          <p className="form-error" role="alert">
            {bookingError}
          </p>
        ) : null}
        {call ? (
          <div>
            <p>
              Call status: <strong>{call.status}</strong>
              {call.outcome ? ` · ${call.outcome}` : ""}
            </p>
            {call.summary ? <p>{call.summary}</p> : null}
            {call.error ? <p className="form-error">{call.error}</p> : null}
            {call.transcript?.length ? (
              <ul>
                {call.transcript.map((line, index) => (
                  <li key={`${line.atSeconds}-${index}`}>
                    <strong>{line.role}</strong>: {line.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
      {refreshError ? <p className="form-error" role="status">{refreshError}</p> : null}
    </>
  );
}

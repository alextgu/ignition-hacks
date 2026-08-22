import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createD1EventsRepository } from "../../../src/features/events/repository";
import { createEventService } from "../../../src/features/events/service";
import { RsvpForm } from "./rsvp-form";

type EventPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ invite?: string | string[] }>;
};

function getService() {
  return createEventService(createD1EventsRepository());
}

export async function generateMetadata({
  params,
}: EventPageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = await getService().getEventBySlug(slug);
  if (!event) return { title: "Event not found — SnapPlan" };
  const description = `${event.location} · $${event.priceMin}–$${event.priceMax} per person · Choose the time that works.`;
  const images = event.worldPreviewImageUrl
    ? [{ url: event.worldPreviewImageUrl }]
    : [];
  return {
    title: `${event.title} — SnapPlan`,
    description,
    openGraph: { title: event.title, description, images },
    twitter: { title: event.title, description, images },
  };
}

export default async function EventPage({ params, searchParams }: EventPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const invitationToken =
    typeof query.invite === "string" ? query.invite : undefined;
  const event = await getService().getEventBySlug(slug);
  if (!event) notFound();

  return (
    <main className="temporary-page">
      <Link className="brand" href="/">SnapPlan</Link>
      <p className="eyebrow">Shared event</p>
      <h1>{event.title}</h1>
      <p>{event.description}</p>
      <dl className="temporary-details">
        <div><dt>Area</dt><dd>{event.location}</dd></div>
        <div><dt>Estimate</dt><dd>${event.priceMin}–${event.priceMax} / person</dd></div>
        <div><dt>Group</dt><dd>About {event.groupSize} people</dd></div>
      </dl>
      <section className="temporary-section" aria-label="Event world">
        <h2>Your world</h2>
        <p>
          Generated once from the idea itself, and it fills with light as
          people answer.
        </p>
        {/* Same URL Base44 embeds. Keeping the guest page on the iframe
            rather than on the component means the handoff contract is
            exercised on every visit instead of only in production. */}
        <iframe
          className="world-frame"
          src={`/world/${slug}`}
          title={`Interactive world for ${event.title}`}
          loading="lazy"
          allow="fullscreen"
        />
      </section>

      <RsvpForm
        slug={slug}
        timeOptions={event.timeOptions}
        invitationToken={invitationToken}
      />
    </main>
  );
}

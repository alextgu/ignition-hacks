import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createD1EventsRepository } from "../../../src/features/events/repository";
import { createEventService } from "../../../src/features/events/service";
import { RsvpForm } from "./rsvp-form";

type EventPageProps = { params: Promise<{ slug: string }> };

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

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params;
  const event = await getService().getEventBySlug(slug);
  if (!event) notFound();

  return (
    <main className="temporary-page">
      <a className="brand" href="/">SnapPlan</a>
      <p className="eyebrow">Shared event</p>
      <h1>{event.title}</h1>
      <p>{event.description}</p>
      <dl className="temporary-details">
        <div><dt>Area</dt><dd>{event.location}</dd></div>
        <div><dt>Estimate</dt><dd>${event.priceMin}–${event.priceMax} / person</dd></div>
        <div><dt>Group</dt><dd>About {event.groupSize} people</dd></div>
      </dl>
      <RsvpForm slug={slug} timeOptions={event.timeOptions} />
    </main>
  );
}

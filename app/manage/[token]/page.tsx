import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createD1EventsRepository } from "../../../src/features/events/repository";
import { createEventService } from "../../../src/features/events/service";
import { summarizeResponses } from "../../../src/features/events/summary";
import { ManageDashboard, type ManagePayload } from "./manage-dashboard";

export const metadata: Metadata = {
  title: "Manage event — SnapPlan",
  robots: { index: false, follow: false },
};

type ManagePageProps = { params: Promise<{ token: string }> };

export default async function ManagePage({ params }: ManagePageProps) {
  const { token } = await params;
  const managed = await createEventService(
    createD1EventsRepository(),
  ).getManagedEvent(token);
  if (!managed) notFound();

  const { managementToken: _managementToken, ...event } = managed.event;
  void _managementToken;
  const initial: ManagePayload = {
    event,
    attendees: managed.attendees,
    summary: summarizeResponses(managed.event, managed.attendees),
    guestUrl: `/e/${managed.event.publicSlug}`,
  };

  return (
    <main className="temporary-page">
      <Link className="brand" href="/">SnapPlan</Link>
      <p className="eyebrow">Private host view</p>
      <h1>{managed.event.title}</h1>
      <ManageDashboard token={token} initial={initial} />
    </main>
  );
}

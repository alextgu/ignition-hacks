import type { AttendeeRecord, EventRecord } from "./contracts";

export function summarizeResponses(
  event: EventRecord,
  attendees: AttendeeRecord[],
) {
  const timeCounts = Object.fromEntries(
    event.timeOptions.map((option) => [option, 0]),
  ) as Record<string, number>;
  const priceCounts = { works: 0, flexible: 0, too_much: 0 };

  for (const attendee of attendees) {
    for (const option of attendee.selectedTimeOptions) {
      if (option in timeCounts) timeCounts[option] += 1;
    }
    priceCounts[attendee.priceResponse] += 1;
  }

  return {
    responseCount: attendees.length,
    timeCounts,
    priceCounts,
  };
}

import type { EventBrief } from "../types.ts";

/** Shared brief used across the ElevenLabs tests. */
export const sampleBrief: EventBrief = {
  eventId: "evt_abc123",
  venueName: "Osteria Rialto",
  venuePhoneNumber: "+14165550123",
  location: "Toronto",
  partySize: 6,
  preferredWindows: [
    { startIso: "2026-09-11T19:00:00-04:00", endIso: "2026-09-11T22:00:00-04:00" },
    { startIso: "2026-09-12T19:30:00-04:00", endIso: "2026-09-12T22:30:00-04:00" },
  ],
  budgetPerPerson: 55,
  currency: "CAD",
  seatingPreference: "a quiet booth",
  dietaryNotes: ["one vegan", "no shellfish"],
  hostName: "Simon",
  hostCallbackNumber: "+14165559876",
  negotiation: {
    maxPricePerPerson: 70,
    timeFlexible: true,
    acceptSplitSeating: false,
    timeToleranceMinutes: 30,
  },
};

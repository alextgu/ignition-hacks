import type { EventRecord } from "../events/contracts";
import type { EventBrief } from "../../integrations/elevenlabs/types";

export type BookRequestBody = {
  live?: boolean;
  /** Destination override. Live calls may only use the configured test number unless confirmRealVenue is true. */
  toNumber?: string;
  venueName?: string;
  venuePhoneNumber?: string;
  hostName?: string;
  seatingPreference?: string;
  dietaryNotes?: string[];
  /** Required to dial any number other than ELEVENLABS_TEST_TO_NUMBER. */
  confirmRealVenue?: boolean;
};

function windowsFromEvent(event: EventRecord) {
  return event.timeOptions.map((startIso) => {
    const start = new Date(startIso);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    return {
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    };
  });
}

export function buildEventBrief(
  event: EventRecord,
  options: {
    toNumber: string;
    venueName?: string;
    hostName?: string;
    seatingPreference?: string;
    dietaryNotes?: string[];
  },
): EventBrief {
  return {
    eventId: event.id,
    venueName: options.venueName?.trim() || event.location || event.title,
    venuePhoneNumber: options.toNumber,
    location: event.location,
    partySize: event.groupSize,
    preferredWindows: windowsFromEvent(event),
    budgetPerPerson: event.priceMax,
    currency: "CAD",
    seatingPreference: options.seatingPreference,
    dietaryNotes: options.dietaryNotes,
    hostName: options.hostName?.trim() || "Plan-it host",
    negotiation: {
      maxPricePerPerson: event.priceMax,
      timeFlexible: true,
      acceptSplitSeating: false,
      timeToleranceMinutes: 45,
    },
  };
}

export function resolveDestination(input: {
  requestedToNumber?: string;
  testToNumber?: string;
  confirmRealVenue?: boolean;
}): { ok: true; toNumber: string } | { ok: false; error: string } {
  const requested = input.requestedToNumber?.trim();
  const testToNumber = input.testToNumber?.trim();

  if (!requested && !testToNumber) {
    return {
      ok: false,
      error: "Provide toNumber or set ELEVENLABS_TEST_TO_NUMBER for test calls.",
    };
  }

  const toNumber = requested || testToNumber!;
  if (testToNumber && toNumber === testToNumber) {
    return { ok: true, toNumber };
  }

  if (input.confirmRealVenue === true) {
    return { ok: true, toNumber };
  }

  return {
    ok: false,
    error:
      "Live calls are limited to ELEVENLABS_TEST_TO_NUMBER unless confirmRealVenue is true.",
  };
}

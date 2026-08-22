import type { EventBrief, TimeWindow } from "./types.ts";

/**
 * Converts a confirmed `EventBrief` into everything the ElevenLabs agent
 * needs for one outbound call: a system prompt, an opening line, and a flat
 * map of dynamic variables.
 *
 * This is the highest-leverage file in the integration — it is what decides
 * whether the call sounds like a competent assistant or a robot reading a
 * form. Everything here is pure and deterministic so it can be unit tested
 * and iterated on without placing a single phone call.
 *
 * Two delivery paths are supported (see docs/elevenlabs-setup.md):
 *   - `dynamic_variables` — always sent; the dashboard prompt can reference
 *     them as {{party_size}}, {{venue_name}}, etc.
 *   - `conversation_config_override` — sent when ELEVENLABS_USE_PROMPT_OVERRIDE
 *     is on; carries the full prompt built below, so the call behaviour is
 *     controlled from code rather than the dashboard.
 */

export type CallScript = {
  systemPrompt: string;
  firstMessage: string;
  dynamicVariables: Record<string, string>;
};

export function buildCallScript(brief: EventBrief): CallScript {
  return {
    systemPrompt: buildSystemPrompt(brief),
    firstMessage: buildFirstMessage(brief),
    dynamicVariables: buildDynamicVariables(brief),
  };
}

export function buildSystemPrompt(brief: EventBrief): string {
  const currency = brief.currency ?? "CAD";
  const windows = brief.preferredWindows.map(formatWindow);
  const primary = windows[0] ?? "a time that works for them";
  const alternates = windows.slice(1);

  const lines: string[] = [];

  lines.push(
    `# Role`,
    `You are a polite, efficient assistant making a phone call on behalf of ${brief.hostName} to book a table at ${brief.venueName}${
      brief.location ? ` in ${brief.location}` : ""
    }.`,
    ``,
    `# Disclosure`,
    `If the person asks whether you are a real person, an AI, a bot, or a recording — or seems at all confused about who they are speaking to — tell them plainly and straight away that you are an automated assistant booking on behalf of ${brief.hostName}. Answer the question first, before anything else. Never claim to be human, never dodge, never change the subject.`,
    `Then reassure them: the reservation is for a real group of real people who will be coming in. That part is true and is usually what they actually want to know.`,
    ``,
    `# Goal`,
    `Reserve a table for ${brief.partySize} ${
      brief.partySize === 1 ? "person" : "people"
    } at ${primary}.`
  );

  if (alternates.length > 0) {
    lines.push(
      `If that is unavailable, offer these alternatives in order: ${alternates.join("; ")}.`
    );
  }

  lines.push(
    ``,
    `# Scope — seats only`,
    `You are booking one thing: a table. A date, a time, a number of people, and a name. Nothing else is in scope.`,
    `Out of scope, without exception: pre-ordering food or drinks, set menus and tasting menus, deposits or any payment, private rooms or venue hire, catering, parties needing staffing or equipment, and changing or cancelling a reservation that already exists.`,
    ``,
    `# When to hand off`,
    `If the venue asks for anything outside that scope, asks something you cannot answer from the details you were given, needs a decision the group has not made, or if the call simply becomes complicated — do not improvise and do not guess.`,
    `Say: "I'm sorry, I'm an automated assistant so I can't help with that part — ${brief.hostName} will get back to you directly about it."${
      brief.hostCallbackNumber
        ? ` If they want to reach them sooner, give them the callback number ${brief.hostCallbackNumber}.`
        : ""
    }`,
    `Then thank them and end the call politely. Handing off is always the right choice when you are unsure. It is never a failure, and it is always better than inventing an answer.`,
    ``,
    `# Hard limits — never exceed these`
  );

  if (brief.negotiation.maxPricePerPerson !== undefined) {
    lines.push(
      `- Do not agree to any per-person cost, minimum spend, or prix-fixe above ${formatMoney(
        brief.negotiation.maxPricePerPerson,
        currency
      )} per person. If the venue requires more, say you need to check with the group and end politely.`
    );
  } else {
    lines.push(
      `- No price ceiling was set. If the venue requires a minimum spend or deposit, do not agree — say you need to confirm with the group first.`
    );
  }

  lines.push(
    `- Never provide credit card numbers, payment details, or any personal information beyond the host's name${
      brief.hostCallbackNumber ? ` and callback number` : ""
    }.`,
    `- Never agree to a non-refundable deposit or a cancellation fee.`
  );

  if (!brief.negotiation.timeFlexible) {
    lines.push(
      `- Do not accept a date or time outside the options listed above. If none work, thank them and end the call.`
    );
  } else if (brief.negotiation.timeToleranceMinutes) {
    lines.push(
      `- You may accept a start time up to ${brief.negotiation.timeToleranceMinutes} minutes earlier or later than the options above. Anything beyond that needs the group's approval.`
    );
  } else {
    lines.push(
      `- You may accept a nearby alternative time if the listed options are unavailable.`
    );
  }

  if (!brief.negotiation.acceptSplitSeating) {
    lines.push(
      `- The group must be seated together. Do not accept split tables.`
    );
  } else {
    lines.push(`- Split tables are acceptable if one table is not available.`);
  }

  lines.push(``, `# Requests to make`);

  if (brief.seatingPreference) {
    lines.push(
      `- Ask for ${brief.seatingPreference}, but treat it as a preference, not a requirement.`
    );
  }
  if (brief.dietaryNotes && brief.dietaryNotes.length > 0) {
    lines.push(
      `- Mention these dietary needs and confirm the kitchen can accommodate them: ${brief.dietaryNotes.join(
        ", "
      )}.`
    );
  }
  if (brief.budgetPerPerson !== undefined) {
    lines.push(
      `- The group is planning around ${formatMoney(
        brief.budgetPerPerson,
        currency
      )} per person. Only bring this up if the venue raises cost, set menus, or minimum spend.`
    );
  }

  lines.push(
    ``,
    `# Before ending the call`,
    `Read back and confirm out loud: the date and time, the number of people, and the name on the reservation (${brief.hostName}). If they gave a confirmation or reference number, repeat it back.`,
    ``,
    `# Style`,
    `- This is a live phone call. Keep every turn to one or two short sentences.`,
    `- Sound natural and warm, never scripted. Do not list your requirements all at once — ask for the reservation first, then handle details as they come up.`,
    `- Never invent availability, prices, or policies. If you do not know something, say you will check with the group.`,
    `- If you reach voicemail, leave a short message with the host's name, the party size, the requested time${
      brief.hostCallbackNumber ? `, and the callback number ${brief.hostCallbackNumber}` : ""
    }, then end the call.`
  );

  return lines.join("\n");
}

export function buildFirstMessage(brief: EventBrief): string {
  const primary = brief.preferredWindows[0];
  const when = primary ? formatWindow(primary) : "sometime soon";
  return `Hi! I'm calling on behalf of ${brief.hostName} — I'd like to see if you have a table for ${brief.partySize} available ${when}.`;
}

export function buildDynamicVariables(brief: EventBrief): Record<string, string> {
  const currency = brief.currency ?? "CAD";
  const windows = brief.preferredWindows.map(formatWindow);

  return {
    event_id: brief.eventId,
    venue_name: brief.venueName,
    location: brief.location,
    host_name: brief.hostName,
    host_callback_number: brief.hostCallbackNumber ?? "",
    party_size: String(brief.partySize),
    primary_time: windows[0] ?? "",
    alternate_times: windows.slice(1).join("; "),
    all_times: windows.join("; "),
    budget_per_person:
      brief.budgetPerPerson !== undefined ? formatMoney(brief.budgetPerPerson, currency) : "",
    max_price_per_person:
      brief.negotiation.maxPricePerPerson !== undefined
        ? formatMoney(brief.negotiation.maxPricePerPerson, currency)
        : "",
    seating_preference: brief.seatingPreference ?? "",
    dietary_notes: (brief.dietaryNotes ?? []).join(", "),
    time_flexible: brief.negotiation.timeFlexible ? "yes" : "no",
    accept_split_seating: brief.negotiation.acceptSplitSeating ? "yes" : "no",
  };
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Formats an ISO-8601 timestamp into speech-friendly text, e.g.
 * "Friday, September 12 at 7:00 PM".
 *
 * Deliberately reads the wall-clock fields straight out of the string rather
 * than going through `Date`+`Intl` with a timezone: the offset in the string
 * already IS the event's local time, so this stays deterministic across
 * machines and test runs with no timezone-database dependency.
 */
export function formatIsoForSpeech(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso.trim());
  if (!match) return iso;

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const monthName = MONTHS[month - 1];
  const period = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minutePart = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`;

  return `${weekday}, ${monthName} ${day} at ${hour12}${minutePart || ":00"} ${period}`;
}

function formatWindow(window: TimeWindow): string {
  return formatIsoForSpeech(window.startIso);
}

function formatMoney(amount: number, currency: string): string {
  const rounded = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${rounded} ${currency}`;
}

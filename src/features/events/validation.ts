import type {
  CreateEventInput,
  CreateInvitationsInput,
  ParseResult,
  PriceResponse,
  UpsertAttendeeInput,
} from "./contracts";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

function deriveTitle(description: string) {
  const sentence = description.split(/[.!?\n]/, 1)[0]?.trim() || description;
  if (sentence.length <= 56) return sentence;
  return `${sentence.slice(0, 53).trimEnd()}…`;
}

export function parseCreateEventInput(value: unknown): ParseResult<CreateEventInput> {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Describe the event idea." };
  }

  const input = value as Record<string, unknown>;
  const description = text(input.description);
  if (!description) return { ok: false, error: "Describe the event idea." };
  if (description.length > 600) {
    return { ok: false, error: "Keep the event idea under 600 characters." };
  }

  const location = text(input.location);
  if (!location) return { ok: false, error: "Add a city or general area." };

  const groupSize = number(input.groupSize);
  if (!Number.isInteger(groupSize) || groupSize < 2 || groupSize > 30) {
    return { ok: false, error: "Group size must be between 2 and 30." };
  }

  const priceMin = number(input.priceMin);
  const priceMax = number(input.priceMax);
  if (
    !Number.isInteger(priceMin) ||
    !Number.isInteger(priceMax) ||
    priceMin < 0 ||
    priceMax < 0
  ) {
    return { ok: false, error: "Add a valid estimated price range." };
  }
  if (priceMax < priceMin) {
    return {
      ok: false,
      error: "Maximum price must be at least the minimum price.",
    };
  }

  if (!Array.isArray(input.timeOptions) || input.timeOptions.length === 0) {
    return { ok: false, error: "Add at least one possible time." };
  }
  const timeOptions = Array.from(
    new Set(input.timeOptions.map(text).filter(Boolean)),
  );
  if (timeOptions.length === 0) {
    return { ok: false, error: "Add at least one possible time." };
  }
  if (timeOptions.length > 4) {
    return { ok: false, error: "Add no more than four possible times." };
  }
  if (timeOptions.some((option) => Number.isNaN(Date.parse(option)))) {
    return { ok: false, error: "Add valid dates and times." };
  }

  const title = text(input.title) || deriveTitle(description);
  return {
    ok: true,
    value: {
      title,
      description,
      location,
      groupSize,
      priceMin,
      priceMax,
      timeOptions,
    },
  };
}

const priceResponses = new Set<PriceResponse>([
  "works",
  "flexible",
  "too_much",
]);

export function parseAttendeeInput(
  value: unknown,
): ParseResult<UpsertAttendeeInput> {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Add your name and response." };
  }
  const input = value as Record<string, unknown>;
  const displayName = text(input.displayName);
  if (!displayName || displayName.length > 60) {
    return { ok: false, error: "Add a name between 1 and 60 characters." };
  }
  const selectedTimeOptions = Array.isArray(input.selectedTimeOptions)
    ? Array.from(new Set(input.selectedTimeOptions.map(text).filter(Boolean)))
    : [];
  if (selectedTimeOptions.length === 0) {
    return { ok: false, error: "Choose at least one possible time." };
  }
  const priceResponse = text(input.priceResponse) as PriceResponse;
  if (!priceResponses.has(priceResponse)) {
    return { ok: false, error: "Choose how the estimated price feels." };
  }
  return {
    ok: true,
    value: { displayName, selectedTimeOptions, priceResponse },
  };
}

export function parseCreateInvitationsInput(
  value: unknown,
): ParseResult<CreateInvitationsInput> {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Add at least one friend name." };
  }
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.names)) {
    return { ok: false, error: "Add at least one friend name." };
  }
  const names = input.names.map(text);
  if (names.length === 0 || names.some((name) => !name)) {
    return { ok: false, error: "Add at least one friend name." };
  }
  if (names.length > 30) {
    return { ok: false, error: "Create no more than 30 named links at once." };
  }
  if (names.some((name) => name.length > 60)) {
    return { ok: false, error: "Keep each friend name under 60 characters." };
  }
  return { ok: true, value: { names } };
}

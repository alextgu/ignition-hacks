/**
 * Public entry point for the ElevenLabs booking-agent integration.
 *
 * Application code should import ONLY from this file (or `./types.ts` for
 * the plain type declarations) — never from elevenLabsAdapter.ts,
 * mockAdapter.ts, or internalApiTypes.ts.
 *
 * Usage:
 *
 *   import { startBookingCall, getBookingCallStatus } from "src/integrations/elevenlabs";
 *
 *   const call = await startBookingCall(brief);
 *   // ... poll from a background job or a status endpoint ...
 *   const updated = await getBookingCallStatus(call.externalId!);
 *
 * Whether this places a real phone call or runs the deterministic mock is
 * decided once from environment configuration and is invisible to callers.
 * With no credentials set, the mock runs — so the booking flow is always
 * demoable. See docs/elevenlabs-setup.md.
 */

import { loadConfig, shouldUseRealAdapter, describeConfig, missingCredentials, type EnvLike } from "./config.ts";
import { RealBookingAgentAdapter } from "./elevenLabsAdapter.ts";
import { MockBookingAgentAdapter } from "./mockAdapter.ts";
import { readEnv } from "../shared/encoding.ts";
import type {
  BookingAgentAdapter,
  BookingCallResult,
  BookingOutcome,
  EventBrief,
} from "./types.ts";

export type {
  EventBrief,
  BookingCallResult,
  BookingCallStatus,
  BookingOutcome,
  BookingAgentAdapter,
  NegotiationBounds,
  TimeWindow,
  TranscriptLine,
} from "./types.ts";

export {
  buildCallScript,
  buildSystemPrompt,
  buildFirstMessage,
  buildDynamicVariables,
} from "./briefMapper.ts";

const VALID_OUTCOMES: BookingOutcome[] = ["booked", "declined", "needs_followup", "unknown"];

let cachedAdapter: BookingAgentAdapter | undefined;

/** Builds a fresh adapter from the given environment. Exposed for tests. */
export function createBookingAgentAdapter(
  env: EnvLike = readEnv()
): BookingAgentAdapter {
  const config = loadConfig(env);

  if (shouldUseRealAdapter(config)) {
    return new RealBookingAgentAdapter(config);
  }

  const forcedOutcome = VALID_OUTCOMES.find((outcome) => outcome === config.mockOutcome);
  return new MockBookingAgentAdapter(forcedOutcome ? { forcedOutcome } : {});
}

/** Process-wide singleton, selected from the environment on first use. */
export function getBookingAgentAdapter(): BookingAgentAdapter {
  if (!cachedAdapter) {
    cachedAdapter = createBookingAgentAdapter();
  }
  return cachedAdapter;
}

/** Resets the memoized singleton. Tests only. */
export function resetBookingAgentAdapterForTests(): void {
  cachedAdapter = undefined;
}

/** Safe-to-log summary of how the booking agent is configured (no secrets). */
export function describeBookingAgentConfig(
  env: EnvLike = readEnv()
): Record<string, unknown> {
  return describeConfig(loadConfig(env));
}

/**
 * True when real phone calls are possible. The UI can use this to label the
 * booking action honestly ("Call venue" vs "Simulate call") — it should
 * never change whether the flow works.
 */
export function isLiveCallingConfigured(env: EnvLike = readEnv()): boolean {
  return shouldUseRealAdapter(loadConfig(env));
}

/** Env vars still needed before real calls can be placed. */
export function missingBookingAgentCredentials(
  env: EnvLike = readEnv()
): string[] {
  return missingCredentials(loadConfig(env));
}

export async function startBookingCall(brief: EventBrief): Promise<BookingCallResult> {
  return getBookingAgentAdapter().startBookingCall(brief);
}

export async function getBookingCallStatus(externalId: string): Promise<BookingCallResult> {
  return getBookingAgentAdapter().getBookingCallStatus(externalId);
}

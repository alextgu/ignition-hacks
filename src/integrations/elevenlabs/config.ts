/**
 * Environment-driven configuration for the ElevenLabs booking agent.
 *
 * Read lazily so tests can set env vars without re-importing. No secret is
 * ever logged — `describeConfig` exists so callers can debug configuration
 * state without risking printing the API key.
 */

export type ElevenLabsConfig = {
  /** Secret API key (`xi-api-key`). Absent -> the mock adapter is used. */
  apiKey: string | undefined;
  /** Pre-configured agent id from the ElevenLabs dashboard. */
  agentId: string | undefined;
  /** Imported Twilio phone number id from the ElevenLabs dashboard. */
  agentPhoneNumberId: string | undefined;
  /** API base URL. Overridable for tests. */
  baseUrl: string;
  /** Per-HTTP-call timeout in milliseconds. */
  timeoutMs: number;
  /**
   * When true, send a full `conversation_config_override` (system prompt +
   * first message) built from the brief. Requires the matching Security
   * toggles on the agent — see docs/elevenlabs-setup.md. When false, only
   * `dynamic_variables` are sent and the dashboard prompt must reference
   * them via {{placeholders}}.
   */
  usePromptOverride: boolean;
  /** Ask Twilio to record the call. Off by default (consent/privacy). */
  callRecordingEnabled: boolean;
  /** Forces the mock adapter even when credentials are present. */
  forceMock: boolean;
  /**
   * Forces the mock adapter's outcome, for demoing the non-happy paths
   * ("booked" | "declined" | "needs_followup" | "unknown"). Unset means the
   * mock decides from the brief.
   */
  mockOutcome: string | undefined;
};

const DEFAULT_BASE_URL = "https://api.elevenlabs.io";
const DEFAULT_TIMEOUT_MS = 15_000;

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ElevenLabsConfig {
  return {
    apiKey: env.ELEVENLABS_API_KEY?.trim() || undefined,
    agentId: env.ELEVENLABS_AGENT_ID?.trim() || undefined,
    agentPhoneNumberId: env.ELEVENLABS_AGENT_PHONE_NUMBER_ID?.trim() || undefined,
    baseUrl: env.ELEVENLABS_BASE_URL?.trim() || DEFAULT_BASE_URL,
    timeoutMs: parsePositiveInt(env.ELEVENLABS_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    usePromptOverride: parseBoolean(env.ELEVENLABS_USE_PROMPT_OVERRIDE, true),
    callRecordingEnabled: parseBoolean(env.ELEVENLABS_CALL_RECORDING_ENABLED, false),
    forceMock: parseBoolean(env.ELEVENLABS_FORCE_MOCK),
    mockOutcome: env.ELEVENLABS_MOCK_OUTCOME?.trim() || undefined,
  };
}

/**
 * The real adapter needs all three credentials to place a call. Missing any
 * one of them means we fall back to the mock rather than failing at call
 * time — a half-configured environment should still give a working demo.
 */
export function shouldUseRealAdapter(config: ElevenLabsConfig): boolean {
  return (
    Boolean(config.apiKey) &&
    Boolean(config.agentId) &&
    Boolean(config.agentPhoneNumberId) &&
    !config.forceMock
  );
}

/** Names the env vars that are required but currently unset. */
export function missingCredentials(config: ElevenLabsConfig): string[] {
  const missing: string[] = [];
  if (!config.apiKey) missing.push("ELEVENLABS_API_KEY");
  if (!config.agentId) missing.push("ELEVENLABS_AGENT_ID");
  if (!config.agentPhoneNumberId) missing.push("ELEVENLABS_AGENT_PHONE_NUMBER_ID");
  return missing;
}

/** Safe-to-log configuration summary. Never includes the API key. */
export function describeConfig(config: ElevenLabsConfig): Record<string, unknown> {
  return {
    apiKeyConfigured: Boolean(config.apiKey),
    agentIdConfigured: Boolean(config.agentId),
    agentPhoneNumberIdConfigured: Boolean(config.agentPhoneNumberId),
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    usePromptOverride: config.usePromptOverride,
    callRecordingEnabled: config.callRecordingEnabled,
    forceMock: config.forceMock,
    mockOutcome: config.mockOutcome,
    usingRealAdapter: shouldUseRealAdapter(config),
    missingCredentials: missingCredentials(config),
  };
}

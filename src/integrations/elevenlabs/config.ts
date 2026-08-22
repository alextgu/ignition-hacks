export type BookingEnv = {
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_AGENT_ID?: string;
  ELEVENLABS_PHONE_NUMBER_ID?: string;
  ELEVENLABS_WEBHOOK_SECRET?: string;
  ELEVENLABS_TEST_TO_NUMBER?: string;
  TWILIO_SID?: string;
  TWILIO_API_KEY?: string;
};

export type BookingConfig = {
  apiKey: string | null;
  agentId: string | null;
  phoneNumberId: string | null;
  webhookSecret: string | null;
  testToNumber: string | null;
  twilioSid: string | null;
  twilioApiKey: string | null;
  readyForDryRun: boolean;
  readyForLiveCall: boolean;
  missingForLiveCall: string[];
};

function trimOrNull(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function loadBookingConfig(env: BookingEnv): BookingConfig {
  const apiKey = trimOrNull(env.ELEVENLABS_API_KEY);
  const agentId = trimOrNull(env.ELEVENLABS_AGENT_ID);
  const phoneNumberId = trimOrNull(env.ELEVENLABS_PHONE_NUMBER_ID);
  const webhookSecret = trimOrNull(env.ELEVENLABS_WEBHOOK_SECRET);
  const testToNumber = trimOrNull(env.ELEVENLABS_TEST_TO_NUMBER);
  const twilioSid = trimOrNull(env.TWILIO_SID);
  const twilioApiKey = trimOrNull(env.TWILIO_API_KEY);

  const missingForLiveCall: string[] = [];
  if (!apiKey) missingForLiveCall.push("ELEVENLABS_API_KEY");
  if (!agentId) missingForLiveCall.push("ELEVENLABS_AGENT_ID");
  if (!phoneNumberId) missingForLiveCall.push("ELEVENLABS_PHONE_NUMBER_ID");
  if (!testToNumber) missingForLiveCall.push("ELEVENLABS_TEST_TO_NUMBER");

  return {
    apiKey,
    agentId,
    phoneNumberId,
    webhookSecret,
    testToNumber,
    twilioSid,
    twilioApiKey,
    readyForDryRun: true,
    readyForLiveCall: missingForLiveCall.length === 0,
    missingForLiveCall,
  };
}

export function bookingReadinessSummary(config: BookingConfig) {
  return {
    readyForDryRun: config.readyForDryRun,
    readyForLiveCall: config.readyForLiveCall,
    missingForLiveCall: config.missingForLiveCall,
    hasTwilioCredentials: Boolean(config.twilioSid && config.twilioApiKey),
    hasWebhookSecret: Boolean(config.webhookSecret),
    hasPhoneNumberId: Boolean(config.phoneNumberId),
    hasTestDestination: Boolean(config.testToNumber),
  };
}

# SnapPlan

SnapPlan is the temporary name for an autonomous small-event coordinator. Read [`project.md`](project.md) for the product scope and design.

## Current foundation

This repository currently provides:

- Durable event and attendee storage with Cloudflare D1
- Host event creation
- Separate public guest and private management URLs
- One editable RSVP per anonymous browser identity
- Availability and price-comfort summaries
- Temporary functional pages for testing the flow

The pages are intentionally temporary. Base44 will own the finished product UI. The stable API and data contracts are the reusable part of this slice.

World Labs work is isolated under `src/integrations/worldlabs/` and is owned by the separate integration agent. The current coordination flow does not require World Labs to succeed.

## Local development

The starter requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The local D1 schema initializes automatically on first use. Schema migrations are also checked into `drizzle/` for hosted deployment.

Run verification with:

```bash
npm test
npm run lint
```

After changing `db/schema.ts`, regenerate and inspect the migration:

```bash
npm run db:generate
```

## HTTP surface

### Create an event

`POST /api/events`

```json
{
  "title": "Maya's birthday dinner",
  "description": "A cozy dinner with shared plates and warm lighting.",
  "location": "West Toronto",
  "groupSize": 6,
  "priceMin": 35,
  "priceMax": 65,
  "timeOptions": ["2026-08-28T19:00:00.000Z"]
}
```

The response includes the event, public `guestUrl`, and secret `manageUrl`.

### Read or update this browser's RSVP

- `GET /api/events/{publicSlug}/rsvp`
- `PUT /api/events/{publicSlug}/rsvp`

```json
{
  "displayName": "Alex",
  "selectedTimeOptions": ["2026-08-28T19:00:00.000Z"],
  "priceResponse": "works"
}
```

`priceResponse` is `works`, `flexible`, or `too_much`. The browser receives an HTTP-only `snapplan_guest_id` cookie. Repeated PUT requests update the same attendee record.

### Read private host state

`GET /api/manage/{managementToken}`

The response contains the public event fields, attendees, guest URL, availability totals, and price-comfort totals. It does not echo the management token.

### Booking call wireframe (dry run by default)

`POST /api/manage/{managementToken}/book`

```json
{
  "live": false,
  "toNumber": "+15551234567"
}
```

Defaults to a dry run that never calls ElevenLabs. Live calling requires Twilio credentials imported into ElevenLabs Telephony, plus `ELEVENLABS_PHONE_NUMBER_ID`, and `{ "live": true }`.

`POST /api/webhooks/elevenlabs` verifies the `ElevenLabs-Signature` HMAC header. Booking-attempt persistence is not wired yet.

## Temporary routes

- `/` — event creation harness
- `/e/{publicSlug}` — guest RSVP harness
- `/manage/{managementToken}` — host-management harness

Do not treat these pages as the final Base44 interface.

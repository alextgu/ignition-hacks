# SnapPlan

> **Working title:** SnapPlan is temporary and may be renamed before submission.

## Project summary

SnapPlan is an autonomous event coordination experience for small social plans and lightweight professional gatherings. A host can begin with an incomplete idea such as “a cozy birthday dinner in Toronto” or “a weekend meetup in Montreal.” SnapPlan turns that idea into a visual event proposal, collects availability and price comfort through one shareable link, and prepares the confirmed group for autonomous booking.

The product deliberately does not plan every detail of a large event or trip. It establishes consensus, creates a memorable spatial-art experience, and gives an agent enough information to handle the next practical action.

## Core promise

Planning should move from a vague idea to a bookable group decision without long group-chat threads, manual availability comparisons, or repeated venue calls.

The primary flow is:

1. The host describes an event idea.
2. SnapPlan creates a lightweight proposal with possible times and estimated pricing.
3. Guests respond through a shared mobile-friendly link.
4. The visual world grows as the event becomes more concrete and people join.
5. Once the group reaches consensus, the host can ask an autonomous agent to book online or call the venue.

## Hackathon priorities

The first release is a polished, reliable vertical slice. Demo reliability matters more than production completeness.

- **World Labs:** Turns the host's description into an interactive spatial-art centerpiece.
- **ElevenLabs:** Powers the voice agent that calls a venue when online self-booking is unavailable or unsuitable.
- **Coordination:** Replaces availability polling and price negotiation with one link.
- **Autonomy:** Converts confirmed group preferences into an actionable booking request.

## First product slice

### 1. Create

The host starts with a loose natural-language description. SnapPlan asks only for the information needed to coordinate the group:

- General area or city
- Approximate group size
- A small set of possible dates or time windows
- Expected price per person or a rough price range

The opening description is also the creative seed for the World Labs experience. Structured answers enrich that seed with event type, mood, setting, season, time of day, group size, and price character.

The host previews the proposal and creates the event. SnapPlan returns two different links:

- A public, unlisted guest link suitable for sharing in a group chat
- A private host-management link protected by an unguessable token

### 2. Coordinate

The guest page is mobile-first and intentionally low friction. A guest:

1. Enters their name.
2. Selects every time they can attend.
3. Responds to the estimate with **Works**, **Flexible**, or **Too much**.
4. Submits one response and receives a place in the shared world.

The guest can edit their existing response but cannot create a second response from the same browser identity.

The host dashboard shows:

- Response count and expected group size
- Availability overlap
- Price comfort summary
- Participants represented in the spatial scene
- Whether the event has enough agreement to proceed

### 3. Act

When the host decides that the group is ready, the event enters a **Ready to plan** state. The host sees focused next-step options:

- **Book venue**
- **Choose seating**
- **Add requirements**

The first site slice presents these actions and their handoff state. The subsequent booking slice will connect them to the autonomous agent.

The booking agent should attempt an appropriate online booking path first when one is available. If online booking is unavailable, unclear, or cannot satisfy the group's requirements, an ElevenLabs voice agent calls the venue and negotiates within the host's approved constraints.

## Spatial-art experience

The world begins as a lightweight animated preview while the host fills in the creation form. The interface progressively reflects atmosphere, lighting, setting, and empty places as more details become available.

The complete World Labs scene is generated once when the host creates the event. It is not regenerated after every form change or RSVP.

As guests respond, the site layers participant markers, names, occupied places, and ambient changes over the scene. This makes the world feel alive without repeatedly invoking world generation. When the event is confirmed, the scene becomes the event's interactive digital pass and keepsake.

World generation must fail gracefully. If it is slow or unavailable, the coordination flow remains usable with the animated fallback and upgrades when the finished world becomes available.

## Guest identity and duplicate prevention

The first release does not require guest accounts. Each browser receives a persistent anonymous guest identifier. The server enforces one attendee record for each `(event, guest identifier)` pair.

- Reopening the link on the same browser restores the guest's response.
- Submitting again updates the existing response instead of creating a duplicate.
- The guest may edit their name, availability, and price comfort.
- The host identity is separate and is represented by the secret management token.

This prevents accidental duplicate submissions while preserving the frictionless group-chat experience. Preventing deliberate duplicates across devices or private browsing would require verified phone numbers, email addresses, or individual invitation links and is outside the first slice.

## Site structure

- `/` — Host event creation
- `/e/{event-slug}` — Public guest event and response page
- `/manage/{secret-token}` — Private host consensus dashboard

The guest event page must provide event-specific link-preview metadata so shared links feel intentional in Messages and other chat applications. A normal website may open in the phone's browser sheet; remaining fully interactive inside Messages would require a native App Clip or Messages extension and is outside the hackathon scope.

## Initial data model

### Event

- ID
- Public slug
- Secret management token
- Working title
- Host description
- General location
- Expected group size
- Candidate time windows
- Estimated price range
- World seed
- World generation status
- World embed URL and preview image when available
- Coordination status
- Created and updated timestamps

### Attendee

- ID
- Event ID
- Anonymous guest ID
- Display name
- Selected time windows
- Price response
- Visual marker or avatar assignment
- Created and updated timestamps

The database must enforce uniqueness for the event and anonymous guest ID pair.

## World Labs boundary

World generation is isolated behind a small provider interface so the rest of the application does not depend on API-specific details.

```ts
type WorldSeed = {
  description: string;
  eventType: string;
  mood: string;
  location: string;
  timeCharacter: string;
  groupSize: number;
  priceCharacter: string;
};

type WorldResult = {
  status: "pending" | "ready" | "failed";
  embedUrl?: string;
  previewImageUrl?: string;
};

generateWorld(seed: WorldSeed): Promise<WorldResult>;
```

A mock or fallback implementation must remain available for demos and local development.

## Booking-agent boundary

The coordination application will eventually pass a confirmed event brief to an orchestration service. That brief should contain the venue or search area, acceptable time window, party size, estimated budget, seating preference, dietary notes, and the host's permitted negotiation range.

The booking implementation is a separate slice. It must not be required for creating an event, collecting responses, or viewing consensus.

## Reliability and error handling

- Event creation must not fail solely because World Labs is unavailable.
- RSVP submission must be idempotent for the same event and guest identity.
- Guests must see a clear retry state if saving fails.
- The host dashboard must distinguish between no responses and a loading failure.
- Booking actions must never appear successful until an external booking path returns confirmation.
- Demo data and a deterministic world fallback should be available if external services fail during judging.

## Work split

### Coordination spine

- Project and persistence setup
- Host creation experience
- Public and private event links
- Guest identity, availability, and price responses
- Consensus dashboard
- Ready-to-plan state and booking handoff placeholders

### World Labs experience

- Progressive creation preview
- `WorldSeed` mapping
- World Labs provider adapter
- Scene loading and fallback states
- Guest-facing spatial-art panel
- Participant and occupied-place overlays

These areas communicate only through the World Labs boundary and should avoid editing the same implementation files.

## Explicit non-goals for the first slice

- Full trip itinerary planning
- Large-event ticket sales or ticket inventory
- Payment collection and production billing
- Guest accounts or authentication
- Verified prevention of deliberate multi-device duplicate responses
- Complex venue discovery
- Production-grade booking automation
- Repeated World Labs regeneration after every response
- Native iOS App Clips or Messages extensions

## First-slice acceptance criteria

The slice is demo-ready when:

1. A host can create an event from a vague idea and a few constraints.
2. The host receives separate guest and management links.
3. Multiple guests on different browsers can submit availability and price comfort.
4. The same browser cannot create multiple attendee records for one event.
5. The host can see a clear consensus summary.
6. The event has a recognizable spatial-art experience with a dependable fallback.
7. The event reaches a Ready-to-plan state with visible booking, seating, and requirements actions.
8. A shared event link has event-specific preview text and imagery when available.


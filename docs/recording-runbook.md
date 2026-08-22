# Recording runbook — a real conversation with the booking agent

Two paths. **Path A needs no new credentials and works right now.** Path B is
the real phone call and needs one dashboard step first.

Either way the admin view is the same, and that is the second half of the
recording: paste the conversation id into the host page and the transcript,
outcome and summary appear.

---

## Path A — talk to the agent in your browser (no phone number needed)

The agent doesn't need a phone line to hold a conversation. You talk to it in
the ElevenLabs dashboard, playing the restaurant, and it produces a
conversation id exactly like a phone call would.

**1. Paste the script into the agent.** The per-call prompt override is
injected at dial time, so a browser test uses whatever the dashboard says
instead. Paste the two blocks below into your agent (ElevenLabs → your agent →
System prompt, and First message) so the browser conversation behaves the same
as a real call would.

**2. Talk to it.** Use the agent's test widget. Play the restaurant. Worth
recording all three of these, because each shows a different thing:

* Give it a table — it reads back the time, party size and name
* Say you're fully booked — it takes the alternative or ends politely
* Ask *"wait, is this an AI?"* — it tells you straight, then says the booking
  is for a real group
* Ask it to pre-order food or take a deposit — it hands off to you instead of
  improvising

**3. Copy the conversation id** from the ElevenLabs conversation view.

**4. Open the host page** at `/manage/{token}`, paste the id into
**"Or watch a conversation started elsewhere"**, press Watch. The status,
outcome, summary and full transcript render in the admin.

---

## Path B — a real phone call

Everything above, but the agent dials your phone.

1. **ElevenLabs → Phone Numbers → import from Twilio.** You'll need a Twilio
   number on the account plus the SID and auth token, both already in `.env`.
2. Copy the returned id into `ELEVENLABS_PHONE_NUMBER_ID` in `.env`. That
   exact name is already read by the config loader.
3. Add it to `.dev.vars` too — the Cloudflare dev runtime reads that, not
   `.env`:
   ```
   ELEVENLABS_API_KEY=...
   ELEVENLABS_AGENT_ID=...
   ELEVENLABS_PHONE_NUMBER_ID=...
   ELEVENLABS_TEST_TO_NUMBER=+1...
   ```
4. Restart `npm run dev`, open the host page, press **Live / mock call**.

The destination is locked to `ELEVENLABS_TEST_TO_NUMBER` unless the request
passes `confirmRealVenue: true`, so your first live call goes to your own
phone. That is the one you want to record.

---

## Two things to set on the agent before recording

**Enable the Security toggles** for prompt and first-message overrides. Without
them the per-call brief — party size, times, budget — never reaches the agent
on a real call, and it falls back to the dashboard prompt.

**Add a `booking_confirmed` boolean data-collection field.** It is the only
thing that can produce an outcome of `booked`. Without it every completed call
reports `needs_followup`, which is honest but undramatic on camera. See
`docs/elevenlabs-setup.md`.

---

## First message

```
Hi! I'm calling on behalf of Sean — I'd like to see if you have a table for 6 available Friday, August 28 at 7:00 PM.
```

## System prompt

```
# Role
You are a polite, efficient assistant making a phone call on behalf of Sean to book a table at the restaurant in West Toronto.

# Disclosure
If the person asks whether you are a real person, an AI, a bot, or a recording — or seems at all confused about who they are speaking to — tell them plainly and straight away that you are an automated assistant booking on behalf of Sean. Answer the question first, before anything else. Never claim to be human, never dodge, never change the subject.
Then reassure them: the reservation is for a real group of real people who will be coming in. That part is true and is usually what they actually want to know.

# Goal
Reserve a table for 6 people at Friday, August 28 at 7:00 PM.
If that is unavailable, offer these alternatives in order: Saturday, August 29 at 6:30 PM.

# Scope — seats only
You are booking one thing: a table. A date, a time, a number of people, and a name. Nothing else is in scope.
Out of scope, without exception: pre-ordering food or drinks, set menus and tasting menus, deposits or any payment, private rooms or venue hire, catering, parties needing staffing or equipment, and changing or cancelling a reservation that already exists.

# When to hand off
If the venue asks for anything outside that scope, asks something you cannot answer from the details you were given, needs a decision the group has not made, or if the call simply becomes complicated — do not improvise and do not guess.
Say: "I'm sorry, I'm an automated assistant so I can't help with that part — Sean will get back to you directly about it." If they want to reach them sooner, give them the callback number +14165550199.
Then thank them and end the call politely. Handing off is always the right choice when you are unsure. It is never a failure, and it is always better than inventing an answer.

# Hard limits — never exceed these
- Do not agree to any per-person cost, minimum spend, or prix-fixe above 70 CAD per person. If the venue requires more, say you need to check with the group and end politely.
- Never provide credit card numbers, payment details, or any personal information beyond the host's name and callback number.
- Never agree to a non-refundable deposit or a cancellation fee.
- You may accept a start time up to 30 minutes earlier or later than the options above. Anything beyond that needs the group's approval.
- The group must be seated together. Do not accept split tables.

# Requests to make
- Ask for a quiet booth if there is one, but treat it as a preference, not a requirement.
- The group is planning around 65 CAD per person. Only bring this up if the venue raises cost, set menus, or minimum spend.

# Before ending the call
Read back and confirm out loud: the date and time, the number of people, and the name on the reservation (Sean). If they gave a confirmation or reference number, repeat it back.

# Style
- This is a live phone call. Keep every turn to one or two short sentences.
- Sound natural and warm, never scripted. Do not list your requirements all at once — ask for the reservation first, then handle details as they come up.
- Never invent availability, prices, or policies. If you do not know something, say you will check with the group.
- If you reach voicemail, leave a short message with the host's name, the party size, the requested time, and the callback number +14165550199, then end the call.
```

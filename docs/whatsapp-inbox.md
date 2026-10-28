# WhatsApp inbox

The inbox keeps a conversation summary collection separate from message history.
Its first list request backfills summaries from all existing messages. Subsequent
requests refresh only phones changed since the last sync, with a short overlap.
The existing 400-message scan limit no longer hides older contacts or determines
their reply windows. No manual inbox migration is required. New collections and
indexes are created through the Mongoose models. The template manager and direct
media/template sending need the Meta configuration described below.

## Behaviour

- Delivery-status updates never scroll the conversation or dashboard. Reading
  older messages preserves the viewport; new arrivals expose a jump button.
- Older history is loaded in pages of 50 with a timestamp and ObjectId cursor.
  Search runs over the full conversation, including unloaded history.
- Drafts and pending request checks are stored per contact and staff account in
  session storage. They survive reloads in that tab. Successful sends clear only
  the unchanged draft belonging to the original recipient.
- Read receipts belong to each staff account. Only messages visible in the open
  conversation at the latest position are marked read. Search and the hidden
  inbox do not mark incoming messages read.
- Needs reply, unread status, resolution and the customer-service reply window
  are independent. A new inbound message reopens a resolved conversation.
- The mobile chat follows the visual viewport, including keyboard resizing.
  Contact details use a keyboard-accessible native dialog on smaller screens.
- Templates start without preset recipients. Empty selections are rejected.

## Message templates

Open **Admin → WhatsApp → Message templates**. Create a draft with its name,
language, Utility/Marketing category, message, optional static header/footer and
buttons. Body variables use `{{1}}`, `{{2}}`, etc. Give each a clear field label
and a realistic example for Meta review. Save, review the preview, then select
**Submit to Meta**. Saving a draft does not contact Meta or send a message.

The library imports templates already on the connected account and displays
pending, approved, rejected, paused and disabled states, with rejection details
when available. It refreshes every minute while visible and through **Refresh
Meta status**. Both existing webhook handlers also accept template-status events.
Only approved, supported templates expose **Use approved template**. Exact Meta
language codes are preserved. Approved status and the reviewed content version
are checked again before sending. A changed template must be previewed again.

Submitted versions are read-only. **Copy and revise** creates a new local draft
under a different name. A lost submission response remains unconfirmed until
status refresh resolves it; the server does not blindly submit it again.
The editor supports text templates, static text headers/footers, website/phone
buttons and quick replies. Imported templates with media headers, dynamic buttons
or other unsupported components remain visible with an explanation.

### Meta server configuration

Configure these on the server; values are never returned to the browser:

| Variable | Purpose |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Meta token with access to the business account; `META_ACCESS_TOKEN` is an alternative. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA used for template creation and status; `WHATSAPP_WABA_ID` is an alternative. |
| `WHATSAPP_PHONE_NUMBER_ID` | Sending number used for outgoing templates and attachments. |
| `WHATSAPP_GRAPH_VERSION` | Optional Graph version; defaults to `v25.0`. |

The token needs `whatsapp_business_management` for template management and
`whatsapp_business_messaging` for messages/media. Configure the existing Meta app's
webhook subscription for `messages` and `message_template_status_update`. The
refresh control still checks approval when template-status webhooks are absent.
See [Meta's Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api)
and [Meta's template management tutorial](https://whatsappbusiness.com/blog/manage-message-templates-whatsapp-business-api/).
New direct sends use the explicitly selected recipient; they do not use the
legacy automation's test-recipient redirection or n8n sender.

Without the token/WABA, local drafts remain available and submission is disabled.
No real template submission or customer send is performed by the verification
commands below.

## Everyday workspace features

- **Saved replies:** Fees, classes, PTM, homework and support starters, plus shared
  staff-created replies. Staff edit their own replies or copy an existing one.
  `{name}` is filled when inserting; insertion never sends automatically.
- **Attachments:** JPEG/PNG images up to 5 MB and PDF/plain-text/PGN documents up
  to 10 MB. The server checks file contents, not just the extension. PGNs keep
  their filename and upload as plain text. Captions are supported. Attachments
  follow the same 24-hour customer-service window as freeform replies.
- **Assignments and private notes:** Assign a chat to an active online admin or
  coach. Coaches receive an internal notification and see only their assigned
  conversations, including media and notes. Assignment enables view/create for
  the coach; custom staff roles must also carry the appropriate role permission.
  Reassignment removes access to the previous coach's conversation. Notes remain
  internal and are paginated; repeated note submissions do not create duplicates.
- **LMS context:** Linked profile, parent details, batches and coaches appear in
  the details panel/drawer. Fee plans, credit balance and unpaid invoices appear
  only to staff with student-fee access; coaches receive no billing data.
  Managers can correct the linked LMS account, give the contact a display name,
  unlink it or restore automatic phone matching.
- **Templates in chat:** Choose an approved template, fill labelled fields and
  review the actual message while keeping the recipient fixed to the chat.
  Templates can be used after the freeform reply window expires.
- **Follow-ups:** Set a date/time in IST, choose tomorrow at 10 AM, add a reminder
  note or clear it. Follow-ups and reply windows expiring within two hours have
  separate inbox filters. Due reminders are highlighted and create internal
  notifications once.

## Broadcast centre

Open **Broadcast centre**, choose an approved template and select manual numbers,
students, coaches, all users or a batch. Variable fields accept fixed text and
`{name}`, `{parentName}`, `{username}`, `{batchName}`. Batch name is available for
the batch audience. Preview saves the concrete recipients and personalised text
without sending. Invalid numbers, missing personalisation, duplicates and
marketing opt-outs are excluded with reasons. The limit is 5,000 unique numbers.

Changing the form requires a fresh preview. Start the reviewed preview now or
schedule it in IST. The centre shows recipient-level pending, processing,
accepted, queued, sent, delivered, read, failed, unconfirmed and cancelled states.
Provider acceptance does not claim delivery. Receipt webhooks update progress.
Older campaigns and recipient pages remain accessible.

Only confirmed failures can be retried. Delivered/read/accepted and unconfirmed
sends are excluded. Each recipient attempt has a durable reservation; repeated
clicks and concurrent workers cannot create another send for that attempt. A
template/category change pauses dispatch until a new preview is created.
Marketing opt-outs and the scheduling staff's current permissions are checked
again before dispatch. Cancel stops remaining work; a message already processing
may still complete, and its outcome is shown separately.

Broadcasts and follow-ups use the existing in-process scheduler in
`src/instrumentation.ts`: 30-second and 60-second sweeps respectively. Run the
application as the existing long-running Node/VPS service for scheduled work.
Durable queued work is resumed after restart. There is no separate public cron
endpoint, and saving a draft never arms a broadcast.

## API contract

- `GET /api/admin/whatsapp`: conversation summaries, unread counts, triage state
  and customer-service window metadata.
- `GET /api/admin/whatsapp?view=thread&phone=...`: most recent message page.
  Supply `before=<nextCursor>` for older history, or `q=<literal search>`.
- `PATCH /api/admin/whatsapp`: `{phoneNumber, action, lastInboundId}`. Actions
  are `read`, `resolve` and `reopen`. Reading requires the view permission and
  affects only the authenticated staff account. Resolution also requires create
  permission. `lastInboundId` is the displayed inbound watermark, so late read
  receipts and delayed resolve requests cannot swallow later arrivals.
- Manual reply and template POSTs require a `requestId` of 16–100 letters,
  digits, underscores or hyphens. The UI generates UUIDs. The server reserves the
  key before contacting the provider and replays the original result for the
  same staff member, message type and payload. Reusing a key with another payload
  returns 409. Reservations are retained for 30 days.
- A rejected reply returns `ok: false` and a failure HTTP status. Provider
  acceptance, queuing, delivery and reading are displayed separately.
- A lost response is unconfirmed, rather than automatically retryable. The UI
  checks the same request key after reconnecting or reloading. Staff can clear an
  unresolved check after reviewing delivery before deliberately starting a new
  send. Automatic retries never submit a new request key.
- Both webhook entry points preserve original media payloads, record delivery
  errors and prevent late receipts from regressing a delivered/read message.

## Verification

Run the WhatsApp Vitest files under `src/lib/` and
`src/app/api/admin/whatsapp/`, plus `src/lib/accessRolePolicy.test.ts`.

`npx playwright test tests/whatsapp-inbox.spec.ts --project=chromium --workers=1`
bundles the real components, dashboard refresh wrapper and stylesheet against
simulated APIs. It checks scrolling, drafts, sending failures, interrupted
requests across reloads, pagination, search, triage, mobile layout, template
submission locking and out-of-order fetch responses. It also covers draft →
pending → approved, rejection revisions, missing Meta configuration, revoked
approval, in-chat previews, saved replies, PGN upload, assignments, private notes,
LMS link corrections, follow-ups, broadcast previews/schedules and failure retries.
It never contacts WhatsApp.

`npx tsx scripts/verify-whatsapp-inbox.ts` starts an isolated temporary MongoDB
on localhost and verifies backfill beyond 400 messages, window metadata, summary
updates, resolution reopening, read/delivery ordering, attachment preservation
and concurrent/idempotent send reservations. Set `WHATSAPP_TEST_MONGO_BINARY` to
a local `mongod` executable when the default Windows cached binary is absent.
The script never loads LMS credentials or connects to the LMS database, and
removes its temporary database after disconnecting.

`npx tsx scripts/verify-whatsapp-features.ts` uses another temporary MongoDB and
simulates every Graph request. It checks approval gating, exact languages,
personalisation/deduplication, concurrent workers, receipt tracking, failed-only
retries, unknown send outcomes, changed categories, opt-outs after scheduling,
revoked staff access, preserved assignments/LMS links, internal notes and
idempotent follow-up notifications. It never loads `.env` or contacts Meta.

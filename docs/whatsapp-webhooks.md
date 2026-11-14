# WhatsApp Cloud API test webhooks

## Scope and inspected schema

Callback: `/api/webhooks/whatsapp` (GET verification, POST status receipts). Uses the existing
`createAdminClient()` server-only service-role utility, not a user session. A webhook cannot
send messages, create bookings, or update customer/Gmail notification records.

The schema was inspected read-only through PostgREST and PostgreSQL catalog constraints:

- `notification_outbox`: UUID ID; unique `idempotency_key`; nullable appointment/customer FKs;
  channel `WHATSAPP`/`EMAIL`; status `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`;
  required `event_type`, `recipient`, JSONB `payload`; other required fields have defaults.
- `notification_deliveries`: required `outbox_id` FK with ON DELETE CASCADE, provider, status;
  optional `provider_message_id`, `error_message`, `sent_at`, `delivered_at`, `read_at`;
  status check allows only `SENT`, `DELIVERED`, `READ`, `FAILED`.
- There is no `failed_at` or delivery `updated_at` column. The sanitized failure text includes
  its event timestamp and optional numeric Meta error code; no raw error body is saved.
- No schemas, migrations, grants, or RLS policies were changed. The exact PostgREST joins and
  JSON filters were checked against the hosted schema using read-only synthetic-ID queries.

## Environment (server-only)

In Vercel **Preview**, configure these in addition to the existing provider settings:

- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: a long random secret you choose for Meta's verification handshake.
- `WHATSAPP_APP_SECRET`: the **App Secret** from Meta App Settings → Basic for this exact app.
  This is distinct from the access token and verification token.
- Existing `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_PHONE_NUMBER_ID`, and
  `WHATSAPP_TEST_RECIPIENTS` must match the test account/sender/authorized recipients.
- Existing `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be available to
  the server. Never use NEXT_PUBLIC for the service role, Meta credentials or verification token.

No existing local or hosted environment values were changed by this implementation.
`WHATSAPP_TEST_ENABLED=true` is required to **send** from the protected admin endpoint; signed
receipts continue to be processed when sending is disabled, so disabling tests does not lose receipts.

## Meta and Vercel Preview configuration

These steps are for the owner to perform on an approved Preview deployment. No deployment,
Meta subscription, live callback verification or live receipt delivery was performed here.

1. Deploy this code to **Preview** using your normal approved workflow; use a stable HTTPS Preview
   domain and configure the server variables above. Environment changes need a new deployment.
2. Ensure Meta can reach **both GET and POST** at
   `https://YOUR-PREVIEW-HOST/api/webhooks/whatsapp` without a Vercel deployment-protection login
   or application login. If necessary, configure a narrowly scoped deployment-protection exception
   for this callback or use an appropriate publicly reachable test deployment. Do not disable admin
   authorization or add a session-cookie requirement to the callback. Do not put credentials or
   protection-bypass secrets into the callback URL.
3. In the exact Meta Developer App, open WhatsApp → Configuration / Webhooks (labels can vary).
   Set the callback URL above and the same verification token as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
   Save/verify. GET accepts only `hub.mode=subscribe`, the correct token and a numeric challenge,
   returning the exact challenge as `text/plain`; invalid requests return 403. Missing server
   verification configuration returns 503. Do not copy token-bearing verification URLs into logs.
4. Subscribe to the WhatsApp Business Account **messages** field. Ensure this app is subscribed
   to the **test WABA**, not only that its URL verification passed. Where manual app subscription
   is needed, Meta documents `POST /{WHATSAPP_BUSINESS_ACCOUNT_ID}/subscribed_apps` under the
   configured Graph version, using the appropriate server-side token. Do not log or paste that token
   into browser code. Do not register/migrate the real barbershop phone number.
5. Sign in as admin on this Preview origin. Use the browser-console request in `whatsapp-test.md`
   to send **one** fixed `hello_world` test to a verified, allowlisted test number. Keep the returned
   provider message ID and confirm `persisted:true`. No real customer recipient is permitted.
6. Receive/open the test message on the authorized test device. In Supabase inspect only the matching
   `notification_deliveries` row (`provider=META_WHATSAPP`, matching `provider_message_id`) and its
   `notification_outbox` parent (`event_type=WHATSAPP_TEST`, `payload.test=true`). Expect status
   `SENT` → `DELIVERED` → `READ` where Meta supplies those receipts. Some devices/settings may
   not provide read receipts. The timestamp columns reflect **Meta event time**, not receipt time.
7. Retry the same signed synthetic receipt in an isolated test environment to verify no changes on
   replay; do not fabricate delivery claims for real messages. The local automated suite covers this.
   Meta Dashboard sample IDs often do not match a saved test send, so a sample may return 200
   without updating any record. That is not proof of real status delivery.
8. Disable test sending when finished. To clean up later, identify only the specific `WHATSAPP_TEST`
   outbox IDs created for your session. Deleting those parents cascades their delivery records;
   do not broadly delete notifications or customer records.

References:
- [Meta webhook verification and signatures](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/)
- [WhatsApp overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/)

## Validation, status transitions and retries

POST reads at most 256 KiB of **raw bytes**, verifies `X-Hub-Signature-256: sha256=<64 hex>` with
HMAC-SHA256 over those exact bytes and constant-time comparison, then decodes/parses JSON.
Missing/malformed/wrong signatures return 401 before any database access. Malformed authenticated
payloads return 400, oversized bodies 413, missing configuration 503. No headers, raw payloads,
phone numbers, access tokens, app secrets, private error descriptions, or verification tokens are logged.

Only the configured test WABA/sender, allowlisted recipient IDs and supported status types are
processed. Incoming messages and unsupported fields/statuses are acknowledged without auto-replies.
A batch is fully validated before any writes and is limited to 100 supported status events.
Delivery lookup additionally restricts the provider and the marked test outbox, so existing production
notifications are untouched. Duplicate provider IDs fail closed rather than updating ambiguous records.

Status priority is `SENT < FAILED < DELIVERED < READ`: failure supersedes sent, but positive delivery/read
evidence supersedes failure. Neither sent, delivered nor failed can downgrade READ. Known per-stage
timestamps can be filled in later without lowering the status; the earliest timestamp observed for
that stage is retained. Duplicate events cause no writes. Failure details are saved only on transition
to FAILED, with sanitized code/time; later positive evidence clears that failure text.

Updates compare status **and every mutable timestamp/error field** in the SQL UPDATE predicate.
A racing event causes a reread/retry (up to five attempts), preserving monotonicity across separate
Vercel processes without process-local locks or RLS changes. Database failure/contention returns
503 so Meta can retry. If part of a batch succeeded before a DB failure, replay is safe.

Unknown message IDs are normally acknowledged without changes. A receipt can beat the post-send
message-ID INSERT; if a matching test outbox is still reserved (`CANCELLED`) and less than two minutes
old, the callback returns 503 to request a retry instead of discarding the early receipt. This is a bounded
race guard, not durable unmatched-event storage. After that window genuinely untracked IDs are ignored.

## Test-send persistence and limitations

The admin endpoint previously did not persist sends. It now validates configuration/allowlist and
creates a `WHATSAPP_TEST` outbox before contacting Meta. Tests use `CANCELLED` as their reservation
state so **no generic PENDING/PROCESSING worker can send them**. Payload is only
`{test:true,template:"hello_world",language:"en_US"}`, with no customer/appointment references and a
random unique test idempotency key. A preflight DB failure returns 503 without sending.

After Meta returns an ID, the endpoint inserts a delivery under that outbox and marks the parent
`COMPLETED`. Because the schema has no ACCEPTED status, a newly accepted delivery uses `SENT`
with null `sent_at`; only Meta's sent receipt fills that timestamp. This is not a delivery claim.
The outbox describes completion of the one send attempt; receipt failures change the delivery, not
queue the outbox again.

If Meta succeeds but either persistence step fails, the response remains HTTP 200 with
`success:true`, `status:"accepted"`, the provider `messageId`, reserved `outboxId`, `persisted:false` and warning
`accepted_not_fully_recorded_do_not_resend`. The record may be partially saved. Reconcile the specific
record using the returned outbox ID and provider message ID instead of clicking Send again. There is no automatic resend. A failed
or ambiguous provider call marks the reserved outbox FAILED where possible; timeouts may still mean
Meta accepted a message, so check the device before any manual retry. Crash/network failure between
Meta acceptance and saving the ID cannot be made atomic across Meta and PostgreSQL here.

## Automated verification

```sh
npm run test:whatsapp
npm run test:whatsapp-webhook
node scripts/test-email-safety.cjs
npm run lint
npx tsc --noEmit
```

Tests use the actual TypeScript routes/provider/persistence functions with mocked network/Auth/DB
boundaries. They cover challenge verification, signatures over raw bytes, schema validation,
unknown/foreign messages, test-only scoping, duplicate/out-of-order/concurrent receipts, failure
sanitization, DB retries, early-receipt race handling, and provider-success/database-failure behavior.
No live messages or database mutations were performed by those suites. Live Meta webhook delivery
and device receipt confirmation remain to be performed using the steps above.

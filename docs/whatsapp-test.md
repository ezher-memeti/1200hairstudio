# WhatsApp Cloud API admin test

This isolated integration sends only Meta's `hello_world` template, language `en_US`, with no
parameters. It uses the existing cookie-based Supabase Auth and database admin role through
`getCurrentUserRole()`. It does not touch bookings, Gmail, reminders, schemas, or RLS.

## Configure locally

Keep `.env.local` private (it is already Git-ignored). Set these **server-only** variables there;
do not prefix any of them with `NEXT_PUBLIC_`, paste tokens into browser code, or commit secrets.
Existing environment values have not been changed by this implementation.

| Variable | Value |
| --- | --- |
| `WHATSAPP_TEST_ENABLED` | `true` to explicitly enable the test; unset/false disables it |
| `WHATSAPP_ACCESS_TOKEN` | Valid Meta test-account access token with WhatsApp messaging permission |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone-number ID of **Meta's test sender**, not the actual barbershop number |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | The test WhatsApp Business Account ID, required and validated |
| `WHATSAPP_API_VERSION` | Exact supported Graph version configured in Meta, including `v`, e.g. `vXX.0` with the real version substituted |
| `WHATSAPP_TEST_RECIPIENTS` | Explicit comma-separated list of your authorized disposable/test numbers in international format; digits only, optional leading `+` |

Recipient validation permits 7–15 international digits, with a nonzero first digit; spaces,
parentheses and domestic prefixes are not normalized. Both request and allowlist use the same
normalization. All allowlist entries must be valid or configuration fails closed. Use only
numbers added and verified as test recipients in Meta's dashboard. Never add customer numbers.

Only the phone-number ID belongs in `/PHONE_NUMBER_ID/messages`; the business-account ID is
required for configuration completeness but is not an argument to that endpoint. This integration
does not register, migrate, or connect any phone number. Ensure the configured ID is Meta's test
sender. The fixed template must be available on that sender; arbitrary templates are unsupported.

Meta's official reference:
https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/

## Send one message through Next.js

1. Set the missing configuration locally and run `npm run dev` (restart after environment changes).
2. Sign in using an existing **admin** account at `/admin/login` on `http://localhost:3000`.
3. Open the browser developer console on that same origin and run this once, replacing the
   placeholder recipient with one of your server-allowlisted test numbers:

```js
const response = await fetch('/api/admin/whatsapp/test', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {
    'Content-Type': 'application/json',
    'X-WhatsApp-Test': '1',
  },
  body: JSON.stringify({ recipient: '+YOUR_VERIFIED_TEST_NUMBER' }),
});
console.log(response.status, await response.json());
```

No token or session cookie needs to be copied: the browser sends its existing session securely.
The server now reserves a clearly marked, non-queued test outbox record before sending and saves
the Meta message ID in `notification_deliveries` afterward. The request body must contain **only** `recipient`. Text, template, language, and parameter
fields are rejected. Cross-origin browser requests are rejected and CORS access is not granted.
Request bodies are limited to 1024 bytes, including streamed bodies without Content-Length.

A success response is:

```json
{"success":true,"messageId":"wamid.PROVIDER_MESSAGE_ID","outboxId":"TEST_OUTBOX_UUID","status":"accepted","persisted":true}
```

`accepted` means Meta returned a message ID; it is **not proof of WhatsApp delivery**. Check the
authorized test device for the actual `hello_world` message. Signed webhook status tracking is documented in [whatsapp-webhooks.md](./whatsapp-webhooks.md). It does not automatically retry, because a network timeout
may occur after Meta accepted a message; check the device before manually trying again.
Disable the test switch when finished.

If `persisted` is false, the send was already accepted and `messageId` remains valid. The response
includes `accepted_not_fully_recorded_do_not_resend`. Do not automatically repeat the POST; reconcile
the record instead. A `persistence_unavailable` response before sending means no provider call occurred.
No test record is put into an automatically sendable outbox state.

Errors have the shape `{"success":false,"error":{"code":"..."}}`:

| HTTP | Codes |
| --- | --- |
| 400 | `invalid_request`, `invalid_recipient` |
| 401 / 403 | `unauthenticated`, `forbidden` |
| 429 | `rate_limited` (see `Retry-After`) |
| 503 | `test_disabled`, `not_configured`, `persistence_unavailable` |
| 502 | `provider_rejected`, `provider_unavailable`, `invalid_provider_response` |
| 504 | `provider_timeout` |
| 500 | `internal_error` (including an unexpected authorization service failure) |

The provider aborts after ten seconds (including response parsing), refuses redirects, disables
fetch caching, and exposes only fixed error codes. Raw Meta errors, exception messages, tokens,
recipients, and request headers/bodies are never logged. Safe provider message IDs are returned
only to an authenticated admin. HTTP responses are marked `no-store`.

## Rate limiting and Vercel scope

All authenticated admin test attempts share a budget of three per minute in each warm Node
process; malformed requests and provider failures consume the budget too. The counter has bounded
constant memory and is consumed synchronously before sending, including concurrent requests.
Unauthenticated/non-admin requests never send or allocate limiter entries.

This is a **basic process-local test limiter**, not a distributed production quota. Cold starts,
restarts, multiple Vercel instances, and multiple regions have independent counters. Keep this
test switch disabled on production deployments. A production messaging rollout needs a shared
atomic limiter and idempotency/delivery tracking; those services and business flows are outside
this test integration. The existing authentication middleware may also run before the route;
it has not been changed or bypassed.

## Verification

```sh
npm run test:whatsapp
npm run test:whatsapp-webhook
node scripts/test-email-safety.cjs
npm run lint
npx tsc --noEmit
```

The WhatsApp suite executes the actual TypeScript provider, limiter and POST handler with mocked
Auth/HTTP boundaries. It never contacts Meta or Supabase and never sends a message. It checks
admin/anonymous/customer authorization, configuration, input/allowlist validation, origin guards,
fixed payload and URL, timeout/abort behavior, sanitized errors/logs, and concurrent rate limiting.
The existing email-safety suite checks the unrelated Gmail/business notification behavior.

At implementation time local token/IDs/allowlist values were present, but `WHATSAPP_API_VERSION`
and `WHATSAPP_TEST_ENABLED` were absent. Their contents were not printed or modified. Therefore
**no live message was sent through this endpoint, and live delivery is not verified**.

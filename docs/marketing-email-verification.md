# Marketing email workflow correction — 24 November 2026

## Root cause and trace

There is no separate marketing REST send endpoint. `AdminMarketingView` and
`MarketingAudienceReview` call Next.js Server Actions in
`src/app/admin/(dashboard)/marketing/actions.ts`. An action failure can return HTTP 200 with
`success: false`; HTTP success alone does not mean Gmail accepted a message.

The original `sendMarketingTest` called `validateContent(input)` **before** applying the German
translation. The editor stores German copy in `input.translations.de` while English source
fields can be empty. A filled German draft therefore threw the required-English-fields error
before rendering or any Gmail request. `sendMarketingCampaign` had the same initial validation.
The original test also chose content from the **interface** locale (`getLocale`) rather than
the independently selected **content** locale, and used the unlocalized source subject even
when the body was German. Every exception was replaced by the same generic test failure.

This was reproduced against the original action using a synthetic German-only draft: the
result was failure and the mocked Gmail sender was never reached. The corrected action sends
that same draft successfully in mocks. The owner subsequently retried the local admin test and
reported that it sent successfully. The earlier failed live action's private payload/provider
response was not captured, so it is not claimed that an original Gmail rejection was observed.
The owner's success confirms the test now works; inbox delivery/rendering was not separately
confirmed during this task.

## Shared delivery implementation and configuration

Test: admin role guard → validate selected content language and verified admin email → render
HTML/plain text → `sendGmailMessage` → Gmail `users.messages.send` with `userId: 'me'` → success
only after a provider message ID is returned. Tests do not create campaigns or customer logs.

Campaign: admin role guard → normalize/validate content → obtain eligible consented audience →
validate required copy for selected recipient languages → atomically claim/create campaign as
`sending` → reload each customer and recheck eligibility/unsubscribe/consent → create a
`pending` recipient record → render the recipient's preferred language → `sendMarketingEmail`
(add signed unsubscribe footer and recheck consent) → `sendCustomerEmail` (`processing` log) →
shared Gmail sender → `sent`/`failed` customer log and recipient status → campaign completion.
No new queue, provider, table or RLS policy was introduced.

Marketing and booking confirmations use the **same** `src/lib/email/gmail.ts`, OAuth environment
variables, official Google client, fixed studio From identity, runtime sender display name,
MIME builder and base64url request construction. No separate marketing OAuth credentials or
sender configuration exist. The working booking deliveries and successful OAuth validation
are owner-provided evidence. This correction did not modify Gmail authentication, MIME
construction, booking confirmations, reminders, SMTP, environment variables or token storage.

All three required Gmail variables are now present in development environment files. A
read-only live request to the existing development authorization route confirmed that the
running server's client ID matches the validator environment. Equality of the running secret
and refresh token could not be independently verified: temporary read-only comparison probes
returned 404 and were removed. No secret/fingerprint was printed or retained. The subsequent
successful owner-triggered admin test is functional evidence that this server can submit mail.

The authorized Google account and send-as aliases were not queried with extra scopes. Because
marketing and bookings share the same From and client, there is no evidence of a marketing-only
alias mismatch. Do not request new OAuth grants or change the sender on that assumption.
If a future specific permission error occurs, check the account's Gmail “Send mail as” settings
manually; no broad Gmail settings permissions were added for this diagnosis.

## Changes

- Both test buttons pass the selected content locale. Test validation, subject and body use
  that same locale; campaigns preserve each customer's language and source-copy fallback.
- Missing copy and malformed CTA URLs fail before sending with translated actionable messages.
  Subjects cannot contain CR/LF headers, and invalid admin addresses never reach Gmail.
- Test diagnostics distinguish authorization, validation, rendering and Gmail-submission stages.
  User-facing errors come from fixed allowlisted messages; arbitrary provider errors and
  addresses are never rendered as errors or written to diagnostic logs.
- Campaigns validate recipient-language copy before creating send records and again when
  rendering freshly loaded recipients. Consent and unsubscribe checks remain mandatory.
- Selected customer IDs and normalized destination addresses are deduplicated within a send.
- Failed deliveries no longer leave a campaign falsely marked `sent`. Safe failure reasons
  are recorded. Partial/failed results report counts and retain their campaign ID in the UI.
- A failed/partial/recording-error campaign cannot be resent by retrying its ID: only `draft`
  campaigns can be claimed for sending. The UI retains the returned ID on failure and blocks
  concurrent Send Campaign clicks. No automatic retry or resending was introduced.
- If Gmail accepts a message but log/status persistence fails, existing critical diagnostics
  remain; a recording failure is not an instruction to resend. A newly created campaign with
  a different ID is a new administrator-initiated send, not an idempotent retry.

## Verification

Synthetic-only suites:

- `node scripts/test-marketing-test-email.cjs`: independent UI/content languages, German-only
  and English tests, localized subject/body consistency, admin/recipient/content/CTA/header
  validation, safe provider errors, actual shared MIME/base64url encoding and `userId: me`.
- `node scripts/test-marketing-campaign.cjs`: real audience/consent/unsubscribe helpers with a
  mocked database/Gmail; both languages, exclusions, duplicate IDs/addresses, status transitions,
  provider failure, post-acceptance recording failure and retry guards. No real RLS claim.
- Existing admin-content, email-safety, production-logging and localization regression suites.

No automated test sends email, creates accounts, appointments or payments, or mutates production
records. The owner performed the sole real Send Test retry and reported success. No automated
customer campaign was sent. No hosted configuration changes or new credentials are required
by these fixes. No commit or deployment was performed.

Reference: [Gmail message construction and sending](https://developers.google.com/workspace/gmail/api/guides/sending).

Changed files: `src/app/admin/(dashboard)/marketing/actions.ts`,
`src/components/admin/AdminMarketingView.tsx`,
`src/components/admin/MarketingAudienceReview.tsx`,
`src/lib/marketing/delivery-errors.ts`, `messages/en.json`, `messages/de.json`,
`scripts/test-marketing-test-email.cjs`, `scripts/test-marketing-campaign.cjs`, and this report.

Final checks passed: both targeted marketing suites, 12 admin-content groups, 9 email-safety
tests, 6 production-logging groups, 18 localization groups, translation validation, TypeScript,
ESLint and the standard lint-enabled production build. Three existing admin image warnings
remain. An initial unrelated Next Google-font loader failure was resolved by clearing only the
isolated build cache. The final build used synthetic Supabase configuration, so expected public
settings fallback logs occurred without accessing production data. The user's running dev
server and its build directory were preserved.

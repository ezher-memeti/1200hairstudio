# Admin navigation verification — 7 November 2026

## Findings before changes

- The sidebar and section tabs already used Next.js `Link`. No handler cancelled navigation,
  and the desktop click tests did not require a second click. The visible problem was a long
  silent wait for an uncached dynamic route to compile/render and finish fetching data.
- A cold development Appointments navigation took 15.33 seconds; the dev server reported
  9.6 seconds compiling that route. Customers took 6.84 seconds on its first tested navigation.
  Most warm routes took approximately 0.7–1.5 seconds. There was no loading feedback on those
  links and no shared admin loading boundary; only Email History had its own loading file.
- The fixed mobile drawer was nested inside a header with `backdrop-filter`. That header became
  the fixed-position containing block, constraining the drawer to the header's height. Visual
  inspection showed a cramped navigation area with only one scrolled link visible. Automated
  scrolling could still reach individual links, so click success alone did not reveal this.
- `FinanceOverview` used an `initialRender` ref to suppress its first effect. Development Strict
  Mode replays effects, so the second setup submitted an unnecessary `getFinanceOverviewComparison`
  server action with the unchanged initial range. The server log recorded the extra Finance POST.
  Server actions also share the router action queue, making unnecessary actions undesirable during
  navigation; this test did not attribute every individual delay to that queue.
- Receipt and report pages both fetched the full finance workspace, including unrelated finance
  summaries, payments, promotions, and enrichment queries. Appointments also delayed independent
  promotions/settings/recurring queries until its first batch had completed.
- The layout, pages, and helpers repeatedly invoked the same admin guard and constructed server
  Supabase clients during a render. Next.js already deduplicates some identical fetches, but these
  helper/client operations were not explicitly shared within the render.
- Both the existing development output and the isolated QA output had an empty middleware
  manifest. The root `middleware.ts` was not in the measured request path, so its Supabase call
  was not responsible for the measured latency. Middleware registration/behavior was left unchanged.
  Server layout/data-access authentication and authorization checks were retained.

## Targeted changes

1. Added `AdminNavLink`, retaining native `Link` behavior and automatic prefetch policy, with
   `useLinkStatus` feedback. Links remain usable while another destination is pending.
2. Added server-rendered loading boundaries for the dashboard, Finance, and Site Settings.
   These allow partial prefetching/streaming of dynamic routes while data is loading, without
   rendering protected data on the client or replacing server authorization checks.
3. Moved the fixed drawer outside the filtered header. Mobile links retain their pending indicator
   until the pathname changes; selecting the current page closes the drawer immediately.
   Navigation completion restores page scrolling through the existing menu effect cleanup.
4. Pointed the primary Site Settings link directly at its Services destination, retaining the
   section's active highlight and all legacy redirect routes.
5. Memoized `requireAdminUser` and the server Supabase client with React `cache`, which is scoped
   to one server render. No global/session-wide authorization cache was introduced.
6. Replaced the Finance mount-count guard with a request-key comparison against the initial data.
   Initial hydration/effect replay submits no comparison action; changing the range still does.
7. Added authorized receipt-only and report-only queries. Receipt number/amount normalization
   and report normalization remain equivalent to their former full-workspace result paths.
8. Started the independent Appointments queries in its first parallel batch; queries requiring
   appointment IDs still wait for those IDs.

No dashboard redesign, authentication bypass, database schema change, deployment, or commit was made.

## Browser verification

Tests used real Supabase sessions belonging to disposable admin accounts and an isolated copy of
the application. Existing appointments, payments, settings, and other business records were read,
not edited. Each fixture's generated customer row, auth user, and profile were removed after its
run. Cleanup succeeded for every run, including the diagnostic run whose history assertion was
too restrictive and was corrected to allow App Router's valid intermediate history entry.

| Coverage | Development | Production artifact |
| --- | --- | --- |
| Main navigation, Customer tabs, seven Site Settings pages, seven Finance pages | Passed at 1280, 768, and 390 px | Passed at 1280, 768, and 390 px |
| Immediate link/loading feedback and first-click navigation | Passed | Passed: 75/75 link clicks |
| Full-viewport mobile drawer and scroll restoration | Passed after structural correction | Passed |
| Delayed Calendar response and choosing Settings before it completes | Latest destination won | Latest destination won |
| Browser Back/Forward | Passed | Passed |
| Finance mount without redundant POST | Passed under Strict Mode | Passed |
| Finance range change | Exactly one comparison POST | Exactly one comparison POST |
| Anonymous access to protected Settings | Redirected to admin login | Redirected to admin login |
| Test admin downgraded to customer on a fresh request | Redirected to account | Redirected to account |
| Legacy Services/Selected Work/Homepage Content/Site Settings redirects and authenticated login redirect | Existing destinations retained | Passed at all three widths |

The primary matrix covers 21 distinct final admin destinations, with 25 link clicks per viewport
to enter each nested navigation group. The production redirect checks cover the remaining aliases
and authenticated login behavior. No browser page errors occurred. Each tested link needed one
actual click; tests did not repeatedly click a pending link to force it to load.

Production measurements from the local test, using live Supabase data:

| Viewport | Median navigation commit | Median content settled | Maximum content settled |
| --- | --- | --- | --- |
| Desktop, 1280 px | 48 ms | 690 ms | 2142 ms |
| Tablet, 768 px | 47 ms | 657 ms | 943 ms |
| Mobile, 390 px | 48 ms | 606 ms | 1375 ms |

Commit means the URL/route changed, often showing the loading boundary; it does not mean all data
was ready. Content-settled measurements include the test's network-idle/loading checks and are not
an SLA. Supabase/network latency still determines data readiness, and first-time development
compilation can still take several seconds. The fix makes that wait visible and interruptible.

In the isolated pre/post development trace, Receipts went from ten recorded remote calls to three
(auth, profile, receipts); Reports went from eleven to four (auth, profile, reports, settings).
These counts include auth and describe the test dataset, rather than a database query plan or a
guarantee for every session. No unwanted Finance POST was observed during the 75 production clicks.

## Build and static validation

- Focused ESLint checks for all modified TypeScript/TSX files: passed.
- `npx tsc --noEmit --incremental false`: passed.
- `git diff --check`: passed.
- The standard production build compiled the application, then failed existing
  `@next/next/no-html-link-for-pages` errors in `CustomerAccountView.tsx`, `CustomerLoyaltyView.tsx`,
  and public `HeaderClient.tsx`. Those unrelated files were not changed.
- The production test artifact was successfully built with `next build --no-lint` and
  `NODE_OPTIONS=--max-old-space-size=4096`; Next's TypeScript validation and static generation
  completed. The 4 GB heap was needed after the build worker exhausted its default 2 GB heap.
  Lint settings in the application were not disabled or edited.
- The isolated production server was tested locally on port 3011; the isolated development server
  used port 3010. Both were stopped afterward. The user's existing server on port 3000 was retained.

Machine reports and before/after drawer screenshots are under `/tmp/1200-admin-navigation-qa/`.
They contain sanitized route/timing results, not passwords, tokens, or credential-bearing headers.
The screenshot `stress-dev-final-mobile-pending.png` shows the corrected full-height drawer and
pending link indicator.

Framework references: [Next.js linking and navigation](https://nextjs.org/docs/app/getting-started/linking-and-navigating),
[Next.js 15 link status](https://nextjs.org/docs/15/app/api-reference/functions/use-link-status),
and [request-scoped authentication memoization](https://nextjs.org/docs/app/guides/authentication).

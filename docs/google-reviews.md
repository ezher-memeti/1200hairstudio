# Compact Google Reviews strip

## Files and placement

The section stays between Next Availability (the actual second homepage section) and Services.
The scoped UI lives in `GoogleReviewsClient.tsx`, `google-reviews.module.css` and its streaming
placeholder `GoogleReviewsSection.tsx`. The Places provider and types are unchanged.

The strip uses the existing page-container grid, capped at 1120px. It has three desktop card
slots (1024px+), two tablet slots (768px+) and one mobile slot. During continuous movement,
neighboring card fragments naturally cross the faded edges; these are not additional full-size
card slots. Cards have a fixed 136px height, 15–16px internal padding, 28px real author avatars,
12px names, compact real ratings, and three lines of 16px/22px existing serif type. Initials are
only a fallback derived from the real author name. Original text stays intact in the DOM and
links to the complete individual review.

The warm-charcoal surface, 1px low-contrast border and 5px radius use the current design tokens.
There are no shadows, large headings, summary blocks, external widgets, navigation controls,
pause buttons or details buttons. The single quiet footer contains the unmodified Google Maps
logo, a relevance-order notice, returned third-party attribution if any, and View all reviews.
Attribution-required third-party text can increase footer height if Google supplies long entries.
The normal measured section height is 217px, including its 22px top/bottom padding and footer.
The loading placeholder reserves the same geometry without fabricated reviews.

## Existing announcement animation reuse

AnnouncementBar and its flex-segment/keyframe/hover architecture were inspected before editing.
Reviews retain `announcement-ticker-track`, `announcement-ticker-segment`,
`announcementTickerLeft` and `--announcement-duration`. No animation library or JS animation
loop was added. AnnouncementBar itself is untouched.

The only shared CSS change makes the existing keyframe's end transform accept optional
`--announcement-distance`, with its original **50% default**. Announcements still use that
unchanged default. Reviews reverse the direction and supply the precisely measured width of
one original sequence, including each 12/14/16px trailing gap. Their duration is distance divided
by the named `SPEED = 24` CSS pixels/second constant.

Extra identical source sequences cover viewport width plus one sequence distance; at least two
are rendered. The initial four copies plus a CSS source-width estimate fill all 3/2/1 layouts
before hydration, even with one review. ResizeObserver measures the viewport and original group;
it rounds card strides down to whole pixels to avoid subpixel rasterization differences at the
loop boundary. Every seam has exactly the normal card spacing. There are no index jumps, snaps,
per-card easing, intervals advancing slides, per-frame setState calls, or repeated API requests.

Both sides of the actual viewport use CSS mask-image gradients (52px desktop, 36px tablet,
16px mobile), including the WebKit-prefixed rule. These are transparent masks, not opaque overlays.
No horizontal page overflow or visible marquee scrollbar is introduced.

## Interaction and accessibility

Only the first original source set is exposed to screen readers and keyboard navigation.
Visual copies have aria-hidden and tabindex=-1 on links; their pointer links remain usable.
Fine-pointer hover pauses the CSS animation at its current phase. Leaving resumes without
resetting the phase. Keyboard focus temporarily exposes a static original list so real source
links stay reachable; leaving focus resumes at the current browsing offset. Touch browsing
pauses only during interaction/momentum and automatically resumes after 700ms idle. Synchronous
mode refs and focus-visible detection avoid the previously confirmed permanent keyboard/touch
pause race. There is no explicit pause/resume control, per the compact-strip requirements.

Automatic movement is independent of the system reduced-motion preference, as explicitly
requested. Hover, keyboard browsing and touch interaction still pause movement. Source/profile
links, Google attribution and relevance ordering remain available.

## Existing API and configuration (unchanged)

The server-only `GOOGLE_PLACES_API_KEY` and `GOOGLE_PLACE_ID` environment variables, field mask,
Google Places API (New) endpoint, authentic reviews/ratings/avatars and maps links are preserved.
The provider still uses a private header, no-store fetches, request-scoped deduplication, a
five-second timeout, and sanitized error handling. No database/disk/ISR/CDN/localStorage cache
of review content or fabricated fallback data is added. Empty/unavailable content hides the
section. No environment value, API restriction, business record or hosted setting was changed.

Source references from the integration audit:
- https://developers.google.com/maps/documentation/places/web-service/policies
- https://developers.google.com/maps/documentation/places/web-service/place-details
- https://developers.google.com/maps/documentation/places/web-service/maps-links

## Verification

### Static-strip diagnosis and requested behavior

The affected Chrome session on localhost:3000 reported a reduced-motion preference,
`animation: none`, `0s` duration and no hover. The former reviews-only reduced-motion
media query caused that static layout. At the owner's explicit request, that media query
has been removed: this section no longer checks the system motion preference. The
announcements and all other sections retain their existing behavior.

The browser regression verifies actual movement under both preference values, plus
hover, keyboard and touch pause/resume behavior. It does not change the OS setting.

`npm run test:google-reviews` tests the server parsing/fetch behavior and SSR markup: authentic
content, private headers, timeout/errors, source/author attribution, real-name initials, clone
accessibility, removed headings/extra controls, compact cards and the all-reviews link.

`scripts/test-google-reviews-browser.cjs` checks real elapsed-time automatic movement (without
seeking the animation timeline), hover/mouse-leave, keyboard-exit resume, mobile autoplay/tap
resume and autoplay under both motion preferences. Run against a local app with Places configured. It loads two homepages
and performs only read requests. Playwright is an optional external QA tool, not an app dependency:

```sh
npm install --prefix /tmp/1200-reviews-browser playwright --no-audit --no-fund
PLAYWRIGHT_MODULE_PATH=/tmp/1200-reviews-browser/node_modules/playwright \
CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
REVIEWS_TEST_URL=http://localhost:3000 \
node scripts/test-google-reviews-browser.cjs
```

Additional Chrome QA covers 320, 375, 390, 430, 768, 1024, 1440, 1920 and 3440px: centered width,
217px section height, 136px cards, same-row name/stars, three-line text, both masks, single-row
footer, no page overflow, constant 24px/s speed and repeated hover/resume after resizing. An
independent seam pixel comparison found zero differences. The original AnnouncementBar fixture
still moves leftward and pauses/resumes with its original default keyframe distance.

Browser-only temporary fixtures (never added to application source) tested 1, 2, 3 and 9 source
reviews at four widths. A one-review fixture ran through three complete real-time cycles with
no gap or speed discontinuity. The fixture route is removed before the conclusive production build.
No mock feedback is shipped. Runtime checks used Chrome; Safari/Firefox were not separately run.

All 13 unit/SSR tests, the real-time browser regression, `npx tsc --noEmit`, `npm run lint`,
and the standard `npm run build` passed. The conclusive production build and `next start`
checks used an isolated copy with lint/type checks enabled and a 4 GB Node heap. Three existing
admin image lint warnings remain. The same responsive/motion/mask suite passed in production
mode. No deployment or commit was performed.

## Contact review-writing action

The homepage Contact action uses `googleMapsLinks.writeAReviewUri` from the same
request-deduplicated Places response as the review strip. It opens in a new tab with
`noopener noreferrer`; there is no click-time fetch. The existing Contact enable/label
settings still apply. The stored manual review URL is not used on the public homepage.
If configuration, the API response or the official writing URL is unavailable, the
review action is omitted while other Contact actions remain available. No constructed
review-writing fallback is used. Configure both server-only Places variables in each
environment; the Place ID is not hardcoded in application source.

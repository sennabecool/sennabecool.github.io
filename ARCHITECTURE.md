# Portfolio Architecture

The site is a small client-side application built around four contracts:
page metadata, reusable components, design tokens, and shared experience
controllers.

## Add A Route

Each HTML document keeps the same small landmark structure:

```html
<header class="site-header">...</header>
<main id="main-content" class="app">...</main>
<nav class="chatbox-wrap" aria-label="Portfolio navigation">...</nav>
```

Do not add empty landmarks. A footer belongs in the document only when it has
real footer content. Conversation headers and project articles stay inside
their owning page section.

Use a hash screen for a view that belongs to the current document:

1. Add one `.screen.page` section inside `.app`.
2. Give it a unique `data-screen-name`.
3. Choose `data-page-layout="hero"` or `data-page-layout="conversation"`.
4. Link to it with `data-target="<screen-name>"`.

Use a standalone document for a primary portfolio page:

1. Create `<route>/index.html`.
2. Set `data-routing="document"` on its `body`.
3. Include one `.screen.page[data-default-screen]`.
4. Load the shared `tokens.css`, `styles.css`, and `script.js`.
5. Link across documents with both `data-target` and `data-href`.

The home document uses `data-routing="hash"` so Home and About retain their
lightweight in-document history. Work uses `/work/` and is independently
addressable, refreshable, and indexable.

Example:

```html
<section
  class="screen page page--conversation"
  data-screen-name="contact"
  data-page-layout="conversation"
  aria-label="Contact"
  hidden
>
  <header class="top-bar top-bar--conversation">...</header>
  <article class="answer">
    <p data-leet-text>Page-specific content.</p>
  </article>
</section>
```

Mark exactly one page per document with `data-default-screen`. The router uses
the first registered page only as a fallback when that marker is absent.

The router discovers local screens automatically. If a `data-target` is not
present in the current document, it follows `data-href` instead. Both routing
modes reset scroll position, update active chatbox chips, and start the shared
page text sequence.

Menu motion and page motion have separate timer registries. Closing the global
chatbox therefore never interrupts the intro of the page it just opened.

## Page Intro

Text animation order follows DOM order. The timing planner calculates writing
and correction durations from character count and rendered font size, then
fits the sequence between the minimum and maximum duration tokens.

Optional page overrides:

```html
<section
  data-leet-duration="2600"
  data-leet-write-duration="900"
>
```

Use `data-page-intro="shell"` only for a page that must wait for the first-load
shell and token-counter intro.

## Viewport Reveal

Add `data-reveal-on-scroll` to any component or content group that should
generate only when it enters the viewport:

```html
<article data-reveal-on-scroll>
  <h2 data-leet-text>Project title</h2>
  <img data-pixel-reveal ... />
</article>
```

The initial page planner excludes text inside these groups only when all of its
reserved characters are below the generation fold. A deferred text already
visible above the fold joins the initial cohort automatically, without losing
its component ownership. Every active page owns one shared generation queue.
Its `IntersectionObserver` batches groups that enter together into one
DOM-order sequence; groups reached during an active batch wait their turn.
Writing and correction expose completion promises, so component dependencies
follow actual character events rather than parallel `setTimeout` estimates.
The top edge of `.chatbox-wrap` is the shared lower boundary for initial text
classification, the last visible Leet character, and the viewport observer.
The page-intro configuration uses the closed chatbox floor as a geometry
fallback when the chatbox cannot be measured. The queue is released only when the initial writing
promise resolves. Initial correction may therefore continue while the first
deferred group writes, keeping the page ordered without introducing a
correction-length pause.
The same hierarchy therefore drives writing and correction across components,
not only inside one component. Font size and character count still calculate
each effect's speed automatically; calculated durations control pace, never
cross-component synchronization. Text generation consumes the same persistent
tokens as the page intro. Optional `data-leet-duration` and
`data-leet-write-duration` overrides remain available for exceptional
component pacing, not ordinary page sequencing.

Project image generation also consumes tokens as new percentage peaks are
reached. A randomized regression never charges twice, and failed or
reduced-motion image paths do not charge generation tokens.

## Components

### Back Button

Use the same component class on a semantic button for in-document history or
on an anchor when a real fallback URL is available:

```html
<a
  class="back-button"
  href="../index.html#home"
  data-action="back"
  data-fallback-href="../index.html#home"
  aria-label="Go back"
>
  <svg class="back-button__icon" aria-hidden="true">
    <use href="#i-chevron-left"></use>
  </svg>
</a>
```

The shared click controller follows the browser's previous referring page.
`data-fallback-href` is used when no referring page exists, avoiding a return
to the browser's initial blank document. Component
geometry stays with the component in `styles.css`; color, icon stroke, radius,
blur, and motion consume the shared foundations also used by the chatbox.

### Conversation Header

Every standalone page outside Home starts with the same full-column header:

```html
<header class="top-bar top-bar--conversation">
  <a class="back-button" href="..." data-action="back" data-fallback-href="..." aria-label="Go back">
    <svg class="back-button__icon" aria-hidden="true"><use href="#i-chevron-left"></use></svg>
  </a>
  <h1 class="chat-bubble chat-bubble--selected question-chip" data-leet-grow="intrinsic">
    <span class="chip__copy">
      <span class="chip__muted" data-leet-text>Prompt prefix</span>
      <span class="chip__keyword" data-leet-text>label</span>
      <span class="chip__muted" data-leet-text>suffix</span>
    </span>
  </h1>
</header>
<div class="subpage-content">
  <a class="logo logo-sm" data-assistant-avatar data-assistant-avatar-state="hidden">...</a>
  <div class="message" data-message>
    <div class="message__body" data-message-body>...</div>
    <div class="message-actions" data-message-actions>...</div>
  </div>
  <div class="suggestions" data-reveal-on-scroll>
  <p class="suggestions__title" data-leet-text>Dive deeper</p>
  ...
</div>
</div>
```

The header fills the page content column. Its first grid track keeps the Back
button fixed at the top-left while the question bubble is pinned to the right
edge of the second track. `data-leet-grow="intrinsic"` opts the bubble into
zero-width Leet preparation, so its right edge stays fixed while its visible
content grows leftward. At the available-width limit, the shared chat bubble
wraps only between complete words and the header height follows it naturally,
without additional vertical padding. The shared subpage layout positions this
header directly below the fixed site header; individual pages must not add
their own top offset. Every secondary page places its specific content inside
`.subpage-content`; its internal responsive configuration
`--subpage-content-item-gap` provides 12px on mobile and
24px on desktop, both vertically and horizontally. The assistant avatar is
revealed after the final conversation-header segment, then message content,
actions, timestamp, and suggestions continue in DOM order. The shared Prompt
Suggestions component always begins with its `Dive deeper` title, separated
from the prompt rows by the spacing scale. Each subpage ends with 40px of
scroll clearance above the closed chatbox. Short handoff delays stay in the
page-sequence JavaScript configuration.
Use `data-viewport-fade` on non-text page components that must disappear with
the scroll timeline. Shared text, actions, and suggestions are already
registered by their component selectors; their top fade reaches zero before
the component crosses viewport `y=0`. Project cards retain the shared bottom
entry animation but intentionally have no scripted top fade or mask; after
entry they remain fully opaque and leave through normal viewport clipping.

### Chat Bubble

`chat-bubble` is the shared visual component for a page-level user prompt and
the large interactive suggestions inside the opened chatbox. Compose it with
`question-chip` plus `chat-bubble--selected` for a semantic heading, or with
`chip chip--bg` for an interactive suggestion. Prefix, keyword, suffix, Leet,
hover, and routing behavior remain state-specific layers on the same shell.
The shell wraps only between complete `.leet-word` elements, preserving words
and the shared multiline growth behavior in both contexts. Both contexts use
the same `.chip__copy`, `.chip__muted`, and `.chip__keyword` anatomy so their
internal spacing cannot drift.

### Message

```html
<div class="message" data-message>
  <div class="message__body" data-message-body>
    <p class="lede" data-leet-text>...</p>
    <div class="message__continuation" data-reveal-on-scroll>
      <p class="lede" data-leet-text>...</p>
      <p class="lede" data-leet-text>...</p>
    </div>
  </div>
  <div class="message-actions" data-message-actions>
    ...
    <time data-message-generated-at></time>
  </div>
</div>
```

Share, rating, timestamp, reveal, correction color, and token consumption are
scoped to the nearest message component. The action footer waits for the final
text inside `[data-message-body]`, including text revealed later on scroll.
Every subpage message includes this footer; do not duplicate or restyle its
controls per route.
Put one `data-reveal-on-scroll` marker on a parent when its descendant texts
form one content unit. Separate markers still join the page-level queue and
keep their relative DOM order.

### Suggestions

Use `.suggestions` as the list and `.suggestion[data-target]` for each row.
The line, arrow, Leet replay, navigation, and token behavior are automatic.

### Chatbox

Every collapsed and expanded chip pair shares the same `data-target` or
`data-action`. The FLIP animation reads live dimensions and typography from
both component states; page-specific values are not required. A shared
`ResizeObserver` also animates vertical chip displacement when progressive
text causes an expanded chip to wrap onto multiple lines.

### Project Cards and Images

Every responsive card uses the same `.project-card__title`,
`.project-card__tag`, and `.project-card__image` structure. Declare its grid
variant with `data-project-size-mobile` and `data-project-size-desktop`, using
`sm`, `md`, or `lg`. The project-image controller synchronizes the active
modifier class at the shared 768px grid breakpoint, so one card can move
between image-backed and horizontal split layouts without changing markup.
The work page expands the desktop grid to a centered 1296px maximum with three
columns and 24px gaps. At that maximum, `sm` is 416 × 350px, `md` spans two
columns at 856 × 350px, and `lg` spans two columns and two rows at 856 × 724px;
the row height scales with the available grid width below the maximum.

Add `data-pixel-reveal` to a project image and load
`project-image-reveal.js` with `defer` on that page. The controller overlays
a temporary Canvas 2D layer, starts when the image enters the viewport, and
removes the canvas after the native image is revealed. Every participating
project card can expose the shared progress chip with `data-pixel-progress`
and a child marked `data-pixel-progress-value`.

Timing, cascade, pixel size, viewport threshold, and device-pixel-ratio limits
live in the project-image controller configuration. The chip counts continuously from 0 to 100,
while the canvas advances through one resolution level at each 20% milestone.
Each reveal lasts between 2.2 and 3 seconds and receives a randomized pace profile.
The counter can briefly regress, while image resolution keeps its highest milestone.
At completion, the plain `DONE!` label replaces the counter and dismisses the chip.
Each newly reached percentage point consumes the controller's configured token
cost.
Reduced-motion users receive the native image and a completed progress value
immediately. Dynamic pages can call `portfolioProjectImages.init(root)`,
while `portfolioProjectImages.replay(root)` is available for deliberate
replays. Pass `{ startImmediately: true }` as its second argument to replay
every card in a specimen regardless of viewport intersection.

### Shell

`.site-header` and the token counter live outside individual screens. Their
state therefore persists while pages change.

Visitor-facing pages use normal document scrolling and a `100vh` minimum page
height at every breakpoint, matching the reference site's `min-h-screen`, so
Safari can composite the page beneath its floating bottom toolbar. The viewport
keeps Safari's default inset behavior rather than opting into
`viewport-fit=cover`. The root canvas owns `--bg-page`, while `body` stays
transparent and no `theme-color` overrides Safari's scroll-edge treatment.
This mirrors the reference site's root/background structure.
An opaque `.site-shell` wraps the sticky header and page content, matching the
reference site's `.main bg-main-background` wrapper. On mobile, the site header
occupies normal document flow, preventing content from starting inside Safari's
top browser region. `.site-header::before` applies an 8px backdrop blur through
a gradient mask. Once the page is more than 50px down, a downward scroll
translates that whole header layer -128px; an upward scroll restores it.
Important fixed bottom controls use
`safe-area-inset-bottom`, but the document itself remains full-height and
visible behind browser chrome.

## Tokens

`tokens.css` contains exactly 46 portfolio-wide design decisions:

- 12 semantic colors.
- 10 spacing values on the 4px scale.
- 12 typography values.
- 7 border, radius, and icon values.
- 5 shared effect and motion values.

Component-only geometry stays next to its component in `styles.css`.
Algorithmic timings and thresholds stay in the JavaScript configuration that
owns the behavior. Neither category is promoted to a global token unless the
same design decision is reused by multiple independent components.

Before adding a token, first reuse the closest foundation value. Add a new one
only when it expresses a recurring portfolio-wide decision; keep the complete
foundation between 30 and 50 tokens.

## Design System

The public `design-system/index.html` route is the canonical visual inventory
for the portfolio. Its documentary layout is intentionally independent from
the portfolio shell: it has no fixed site topbar, token counter, or global
chatbox.

- Foundations are generated directly from every custom property declared in
  `tokens.css`. The catalogue shows the source expression, computed value,
  and a visual preview without maintaining a parallel token list.
- Components are organised as Atoms, Molecules, Organisms, Templates, and
  Pages. Production classes and assets are used for every specimen.
- Viewport-dependent organisms and complete pages are rendered in isolated
  live frames. The `?ds-preview=1` contract keeps all behavior available while
  disabling persistent token spending.
- `data-target="design-system"` is the shared navigation key for both the
  collapsed chip and expanded chat bubble. Home uses `design-system/`; nested
  document routes use `../design-system/`.

### Component update contract

Every component creation or behavior change must update the Design System in
the same change:

1. Reuse the 46 shared foundations; add a token only for a genuinely recurring
   portfolio-wide decision.
2. Update the production component classes and behavior.
3. Update its Design System specimen, anatomy, variants, states, behavior, and
   consumed-token references.
4. Verify the production context and the documentation page at desktop and
   mobile widths.

This keeps the Design System a live contract rather than a manually maintained
gallery.

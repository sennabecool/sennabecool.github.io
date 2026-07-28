# Portfolio Architecture

The site is a small client-side application built around four contracts:
page metadata, reusable components, design tokens, and shared experience
controllers.

## Add A Page

1. Add one `.screen.page` section inside `.app`.
2. Give it a unique `data-screen-name`.
3. Choose `data-page-layout="hero"` or `data-page-layout="conversation"`.
4. Add `data-leet-text` only to text that should use the shared text engine.
5. Link to it with `data-target="<screen-name>"`.

Mark exactly one page with `data-default-screen`. The router uses the first
registered page only as a fallback when that marker is absent.

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

The router discovers the page automatically, updates `#contact`, manages
browser history, resets scroll position, updates active chatbox chips, and
starts the page text sequence.

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

## Components

### Message

```html
<div class="message" data-message>
  <p class="lede" data-message-body data-leet-text>...</p>
  <div class="message-actions" data-message-actions>
    ...
    <time data-message-generated-at></time>
  </div>
</div>
```

Share, rating, timestamp, reveal, correction color, and token consumption are
scoped to the nearest message component.

### Suggestions

Use `.suggestions` as the list and `.suggestion[data-target]` for each row.
The line, arrow, Leet replay, navigation, and token behavior are automatic.

### Chatbox

Every collapsed and expanded chip pair shares the same `data-target` or
`data-action`. The FLIP animation reads live dimensions and typography from
both component states; page-specific values are not required. A shared
`ResizeObserver` also animates vertical chip displacement when progressive
text causes an expanded chip to wrap onto multiple lines.

### Shell

`.site-header` and the token counter live outside individual screens. Their
state therefore persists while pages change.

## Tokens

All visual and timing values live in `tokens.css`.

- Primitive tokens: colors, typography, spacing, radii.
- Semantic tokens: backgrounds, foregrounds, borders, shadows.
- Component tokens: page, topbar, message, suggestion, chatbox.
- Motion tokens: Leet engine, page timing planner, menu FLIP, counter.

Component CSS and JavaScript should consume tokens rather than introduce new
raw design values.

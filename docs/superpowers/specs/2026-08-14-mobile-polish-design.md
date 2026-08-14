# Mobile polish, favicon, and motion — design

## Context

The ImmoLink Sénégal homepage (`frontend/src/app/page.tsx`) and header
(`frontend/src/components/immolink/Header.tsx`) received a first mobile
decluttering pass (header CTA/Connexion moved off the cramped top bar, hero
headline/eyebrow fixed, search tabs made scrollable). The user now wants a
fuller mobile experience: a real slide-in mobile menu, a browser favicon
(none exists today), scroll-triggered reveal animations, and consistent
button tap feedback, applied across the whole homepage — not just the hero.

Existing brand system (do not change): colors in `frontend/src/app/globals.css`
`@theme` block (`brand-green` #0a5a2e, `brand-red` #c81e1e, `brand-gold`
#f2c200, `brand-cream` #f7f5ee), `font-serif` (Instrument Serif) for display
type, `font-sans` (Manrope) for body. Existing motion vocabulary: `im-up`
(fade + 14px rise) and `im-fade` (fade only) keyframes, currently only used
once on page load (`animate-im-fade` on `<main>`). `sharp` is already a
project dependency (used for upload processing), available for a one-off
favicon-generation script.

## 1. Favicon

**Source**: `frontend/public/immolink-emblem.png` — already an icon-only
mark (roughly 50:38 aspect ratio, no wordmark baked in), used in the header.

**Approach**: a one-off Node script (`sharp`) that:
1. Trims transparent padding from the source PNG.
2. Composites the trimmed glyph, centered, onto a square canvas with
   rounded corners and a `brand-green` (#0a5a2e) background — consistent
   with the existing rounded-avatar treatment elsewhere in the header.
3. Exports `frontend/src/app/icon.png` (512×512 — Next.js App Router
   auto-generates the `<link rel="icon">` tags and smaller sizes from this)
   and `frontend/src/app/apple-icon.png` (180×180, flat corners per Apple's
   own masking convention).

No new runtime dependency; the script is run once locally and the two PNGs
are committed. Next.js's file-based metadata convention
(`app/icon.png` / `app/apple-icon.png`) needs no manual `<head>` wiring.

## 2. Mobile menu — slide-in drawer

Replace the current inline dropdown (`{mobileOpen && <nav>...}` in
`Header.tsx`) with a full-screen drawer:

- **Backdrop**: fixed, full-viewport, `bg-black/40`, fades in
  (`transition-opacity`), click closes the menu.
- **Panel**: fixed to the right edge, full height, ~85vw wide (max ~360px),
  `bg-brand-cream`, slides in via `translate-x-full` → `translate-x-0`
  (CSS transition, ~250ms ease-out). Contains, top to bottom: close button
  (✕, top-right), the "Publier une annonce" CTA as a full-width solid pill
  (promoted, first item), the 5 nav links at a larger size with generous
  vertical spacing, a divider, then "Tableau de bord" / "Connexion" or the
  logged-in avatar + "Se déconnecter".
- **Behavior**: closes on Escape key and on backdrop click (already closes
  on link click via existing `closeMobile`). Body scroll is locked
  (`document.body.style.overflow = 'hidden'`) while open, restored on
  close/unmount.
- **Motion**: CSS transitions only (no animation library). Respects
  `prefers-reduced-motion` by skipping the slide (drawer still opens/closes,
  just without the animated transform) via the `motion-safe:` /
  `motion-reduce:` Tailwind variants.
- Desktop (`lg:` and up) behavior is unchanged — this only replaces the
  `lg:hidden` mobile path.

## 3. Scroll-triggered reveals

New client component `frontend/src/components/immolink/Reveal.tsx`:

- Wraps children in a `<div>`, uses `IntersectionObserver` (threshold
  ~0.15, rootMargin so it triggers slightly before full entry) to add the
  existing `animate-im-up` class once the element enters the viewport.
- Fires once per element (unobserves after first trigger) — this is a
  one-time entrance reveal, not a scroll-linked continuous animation,
  matching the "sober/professional" intensity chosen over the cascading/
  staggered option.
- Before trigger, the element sits at `opacity-0` (via inline style) so
  there's no flash of fully-visible content; if `prefers-reduced-motion:
  reduce` is set, the component skips the observer entirely and renders
  fully visible immediately.
- Applied once per section (not per individual card) on the homepage:
  "Biens à la Une", "Programmes immobiliers neufs", "Nouvelles annonces",
  "Ils ont trouvé leur bien", "Des packs pour chaque ambition" — wrapping
  each section's heading+content block.

## 4. Button tap feedback

New utility in `globals.css`:

```css
.im-tap {
  transition: transform 0.15s ease;
}
.im-tap:active {
  transform: scale(0.96);
}
```

Applied to: header CTA (desktop + drawer), search panel tabs and
"Rechercher" button, "Voir tout →" links, pack CTA buttons, property card
favorite-heart button. `PropertyCard`'s existing `hover:-translate-y-1`
is left as-is (desktop hover lift) and gets `im-tap` added alongside for
the mobile tap case.

## 5. Mobile polish pass on remaining sections

Quick review + fixes, not a redesign, of the four sections not yet touched:

- **Packs** (`PACKS.map` block): the "POPULAIRE" badge is
  `absolute -top-2.5 left-1/2 -translate-x-1/2` inside a card with no
  horizontal overflow guard — confirm it doesn't clip against the section's
  outer padding on narrow (320px) screens; add `whitespace-nowrap` if not
  already implied.
- **Programmes neufs / Témoignages / Nouvelles annonces**: these already use
  `grid-cols-1` mobile-first grids — verify heading sizes and section
  padding read comfortably at 375px width (spot-check, adjust only if
  actually cramped, no wholesale rewrite).
- No changes to `PropertyCard` layout/content, only the `im-tap` addition
  from item 4.

## Out of scope

- Non-homepage pages (`/recherche`, `/biens/[id]`, `/dashboard`, etc.) —
  not part of this request.
- Any new animation library (Framer Motion, GSAP, etc.) — CSS transitions
  and the existing keyframes are sufficient for the chosen "sober" intensity
  and keep bundle size down.
- Redesigning `PropertyCard` itself.

## Testing

No existing test coverage targets `frontend/src/app/**` pages or
`components/immolink/*` (this app ships no UI test suite per the starter's
"headless" design — see CLAUDE.md). Verification is manual: `pnpm
typecheck`, `pnpm lint`, `pnpm test` (server-side suite, unaffected) must
stay green, plus a manual check on a real deployment (no headless-browser
tool available in this environment).

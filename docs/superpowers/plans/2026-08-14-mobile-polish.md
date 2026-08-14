# Mobile Polish, Favicon, and Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the ImmoLink Sénégal homepage a real mobile menu (slide-in drawer), a browser favicon derived from the existing logo mark, and sober scroll-reveal + button-tap motion across every homepage section.

**Architecture:** Pure CSS transitions + one small `IntersectionObserver`-based React client component for reveals — no new npm dependency. Favicon is generated once by a local Node script (using the `sharp` package already installed) and the two output PNGs are committed as static Next.js App Router metadata files.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, `sharp` (already a dependency, used elsewhere for upload processing).

## Global Constraints

- Brand tokens are fixed — do not introduce new colors. Use only `brand-green` (`#0a5a2e`), `brand-green-dark` (`#06401f`), `brand-red` (`#c81e1e`), `brand-red-dark` (`#9e1616`), `brand-gold` (`#f2c200`), `brand-cream` (`#f7f5ee`), `brand-slate`, `brand-muted`, `brand-muted2` from `frontend/src/app/globals.css`.
- No new runtime npm dependency. `sharp` is already installed; everything else is Tailwind + plain CSS + React.
- Respect `prefers-reduced-motion` everywhere motion is added (drawer slide, ping dot, scroll reveal).
- **This project ships no UI/component test harness** (headless starter — see `CLAUDE.md`; Vitest here only covers `frontend/src/lib/server/**`, no `@testing-library/react` or jsdom component environment is installed). Per-task "test cycle" in this plan is therefore: `pnpm typecheck`, `pnpm lint`, and a manual dev-server check (`pnpm dev` + `curl`/browser) — not a fabricated unit test. Do not add a component-testing framework as part of this work; that would be unrelated scope creep.
- Run `pnpm format && pnpm lint && pnpm typecheck && pnpm test` before the final commit of the whole feature (per `CLAUDE.md`'s pre-commit checklist), in addition to each task's own gate.
- Every task's commit message follows Conventional Commits, and every commit must actually be created (`git add` the specific files, not `-A`).

---

### Task 1: Favicon generation script + generated assets

**Files:**
- Create: `frontend/scripts/generate-favicon.mjs`
- Create (generated output, committed): `frontend/src/app/icon.png`
- Create (generated output, committed): `frontend/src/app/apple-icon.png`

**Interfaces:**
- Consumes: `frontend/public/immolink-emblem.png` (existing asset, icon-only mark, no wordmark).
- Produces: `frontend/src/app/icon.png` (512×512) and `frontend/src/app/apple-icon.png` (180×180) — Next.js App Router's file-based metadata convention picks these up automatically, no manual `<head>` wiring needed by later tasks.

- [ ] **Step 1: Write the generation script**

Create `frontend/scripts/generate-favicon.mjs`:

```js
// One-off script: generates app/icon.png + app/apple-icon.png from the
// existing emblem mark. Run manually with `node scripts/generate-favicon.mjs`
// whenever the source logo changes — output is committed, not built on the fly.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '../public/immolink-emblem.png');
const APP_DIR = path.join(__dirname, '../src/app');

// #0a5a2e — brand-green, matches the app's rounded-avatar treatment.
const BRAND_GREEN = { r: 10, g: 90, b: 46, alpha: 1 };

async function build(size, outPath, cornerRadiusRatio) {
  const trimmed = await sharp(SRC).trim().toBuffer();

  const glyphSize = Math.round(size * 0.62);
  const glyph = await sharp(trimmed)
    .resize(glyphSize, glyphSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();
  const offset = Math.round((size - glyphSize) / 2);

  const layers = [];
  if (cornerRadiusRatio > 0) {
    const r = Math.round(size * cornerRadiusRatio);
    layers.push({
      input: Buffer.from(
        `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
      ),
      blend: 'dest-in',
    });
  }
  layers.push({ input: glyph, left: offset, top: offset });

  await sharp({
    create: { width: size, height: size, channels: 4, background: BRAND_GREEN },
  })
    .composite(layers)
    .png()
    .toFile(outPath);
}

async function main() {
  // Rounded-square favicon (matches the app's rounded-xl/rounded-full language).
  await build(512, path.join(APP_DIR, 'icon.png'), 0.22);
  // iOS applies its own corner mask — ship a flat square per Apple's convention.
  await build(180, path.join(APP_DIR, 'apple-icon.png'), 0);
  console.log('Generated icon.png (512x512) and apple-icon.png (180x180)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script**

Run (from `frontend/`): `node scripts/generate-favicon.mjs`
Expected output: `Generated icon.png (512x512) and apple-icon.png (180x180)`

- [ ] **Step 3: Verify the generated files**

Run (from `frontend/`):
```bash
node -e "
const sharp = require('sharp');
Promise.all([
  sharp('src/app/icon.png').metadata(),
  sharp('src/app/apple-icon.png').metadata(),
]).then(([icon, apple]) => {
  console.log('icon.png:', icon.width, 'x', icon.height, icon.format);
  console.log('apple-icon.png:', apple.width, 'x', apple.height, apple.format);
  if (icon.width !== 512 || icon.height !== 512) throw new Error('icon.png wrong size');
  if (apple.width !== 180 || apple.height !== 180) throw new Error('apple-icon.png wrong size');
  console.log('PASS');
});
"
```
Expected: prints both dimensions (512x512 png, 180x180 png) and `PASS`.

- [ ] **Step 4: Manual visual check**

Open both `frontend/src/app/icon.png` and `frontend/src/app/apple-icon.png` (e.g. via the Read tool or an image viewer) and confirm the glyph is centered, not stretched, and legible on the green background at a glance.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add scripts/generate-favicon.mjs src/app/icon.png src/app/apple-icon.png
git commit -m "feat(app): generate favicon and apple-touch-icon from the emblem mark"
```

---

### Task 2: Motion utility CSS (`im-tap` + animation fill-mode fix)

**Files:**
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Produces: `.im-tap` class (apply to any interactive element for tap/press feedback), and corrects `.animate-im-up` / `.animate-im-fade` to hold their end state — later tasks (3, 4, 5, 6) depend on both.

- [ ] **Step 1: Edit `globals.css`**

Current (lines 58–64):
```css
.animate-im-up {
  animation: im-up 0.3s ease;
}

.animate-im-fade {
  animation: im-fade 0.35s ease;
}
```

Replace with:
```css
/* `forwards` so the element holds its post-animation state instead of
   snapping back to its pre-animation CSS the instant the animation ends —
   required for Reveal (components/immolink/Reveal.tsx), which swaps an
   `opacity-0` class for `animate-im-up` on scroll-into-view. */
.animate-im-up {
  animation: im-up 0.3s ease forwards;
}

.animate-im-fade {
  animation: im-fade 0.35s ease forwards;
}

/* Tap/press feedback for interactive elements — buttons, cards, links. */
.im-tap {
  transition: transform 0.15s ease;
}

.im-tap:active {
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .im-tap {
    transition: none;
  }

  .im-tap:active {
    transform: none;
  }
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter frontend run lint && pnpm typecheck`
Expected: both exit 0 (CSS isn't type-checked, but this confirms nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "feat(css): add im-tap press feedback utility, fix reveal animation fill-mode"
```

---

### Task 3: `Reveal` scroll-trigger component

**Files:**
- Create: `frontend/src/components/immolink/Reveal.tsx`

**Interfaces:**
- Consumes: `.animate-im-up` class from Task 2.
- Produces: named export `Reveal` — `function Reveal({ children, className }: { children: ReactNode; className?: string }): JSX.Element`. Task 5 imports this as `import { Reveal } from '@/components/immolink/Reveal';` and wraps section content with `<Reveal>...</Reveal>` or `<Reveal className="...">...</Reveal>`.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/immolink/Reveal.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Fades + lifts children into view once, the first time they scroll into
 * the viewport (reuses the `animate-im-up` keyframe already used for the
 * page-load fade). Skips the animation entirely under
 * prefers-reduced-motion — content is simply visible immediately.
 */
export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${visible ? 'animate-im-up' : 'opacity-0'} ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm --filter frontend run lint`
Expected: both exit 0. (Component isn't wired into any page yet, so nothing renders differently — this step only confirms the file compiles cleanly.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/immolink/Reveal.tsx
git commit -m "feat(immolink): add Reveal scroll-into-view animation component"
```

---

### Task 4: Header mobile drawer

**Files:**
- Modify: `frontend/src/components/immolink/Header.tsx`

**Interfaces:**
- Consumes: `.im-tap` from Task 2. Existing `openPacks`, `user`, `logout`, `router`, `mobileOpen`, `closeMobile`, `onLogout`, `NAV_LINKS`, `initials` — all already defined in this file, unchanged.
- Produces: no new exports — `Header` keeps its existing signature. Nothing downstream depends on this task's internals.

- [ ] **Step 1: Add the escape-key + body-scroll-lock effect**

In `frontend/src/components/immolink/Header.tsx`, add `useEffect` to the React import (currently `import { useState } from 'react';`):

```tsx
import { useEffect, useState } from 'react';
```

Then, directly after the existing `const [mobileOpen, setMobileOpen] = useState(false);` line, add:

```tsx
  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);
```

- [ ] **Step 2: Replace the mobile dropdown with the slide-in drawer**

Replace the current closing block (everything from `{mobileOpen && (` to the matching `)}` right before `</header>`):

```tsx
      {mobileOpen && (
        <nav className="flex flex-col gap-1 border-t border-brand-green/10 bg-brand-cream px-4 py-3 text-[14.5px] font-semibold text-brand-slate lg:hidden">
          <button
            type="button"
            onClick={() => {
              openPacks();
              closeMobile();
            }}
            className="mb-1 cursor-pointer rounded-full bg-brand-green px-5 py-3 text-center text-sm font-bold text-brand-cream sm:hidden"
          >
            Publier une annonce
          </button>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={closeMobile}
              className="rounded-lg px-2 py-2.5 hover:bg-brand-green/8 hover:text-brand-red"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className="rounded-lg px-2 py-2.5 hover:bg-brand-green/8 hover:text-brand-red sm:hidden"
          >
            Tableau de bord
          </Link>
          {!user && (
            <Link
              href="/login"
              onClick={closeMobile}
              className="mt-1 rounded-lg border-t border-brand-green/10 px-2 pt-3.5 pb-1 hover:text-brand-red sm:hidden"
            >
              Connexion
            </Link>
          )}
        </nav>
      )}
```

with:

```tsx
      {/* Mobile drawer — backdrop + slide-in panel. Desktop (lg:) is
          untouched; this whole block only ever renders below the lg
          breakpoint via the hamburger button above. */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={closeMobile}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 motion-reduce:transition-none ${
            mobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          className={`absolute top-0 right-0 flex h-full w-[85vw] max-w-90 flex-col gap-1 overflow-y-auto bg-brand-cream px-5 py-5 text-[15px] font-semibold text-brand-slate shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none ${
            mobileOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <button
            type="button"
            onClick={closeMobile}
            aria-label="Fermer le menu"
            className="im-tap mb-3 ml-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-xl text-brand-slate"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={() => {
              openPacks();
              closeMobile();
            }}
            className="im-tap mb-4 cursor-pointer rounded-full bg-brand-green px-5 py-3.5 text-center text-[15px] font-bold text-brand-cream sm:hidden"
          >
            Publier une annonce
          </button>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={closeMobile}
              className="im-tap rounded-lg px-2 py-3 hover:bg-brand-green/8 hover:text-brand-red"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className="im-tap rounded-lg px-2 py-3 hover:bg-brand-green/8 hover:text-brand-red sm:hidden"
          >
            Tableau de bord
          </Link>
          <div className="mt-3 border-t border-brand-green/10 pt-3">
            {user ? (
              <button
                type="button"
                onClick={onLogout}
                className="im-tap flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-brand-green/8 hover:text-brand-red"
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-linear-to-br from-brand-red to-brand-red-dark text-sm font-bold text-white">
                  {initials}
                </span>
                Se déconnecter
              </button>
            ) : (
              <Link
                href="/login"
                onClick={closeMobile}
                className="im-tap block rounded-lg px-2 py-3 hover:bg-brand-green/8 hover:text-brand-red sm:hidden"
              >
                Connexion
              </Link>
            )}
          </div>
        </div>
      </div>
```

- [ ] **Step 3: Add `im-tap` to the hamburger button and top-bar CTA**

Find (top-bar hamburger button):
```tsx
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-xl text-brand-slate lg:hidden"
```
Replace with:
```tsx
            className="im-tap flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-xl text-brand-slate lg:hidden"
```

Find (top-bar "Publier une annonce" button):
```tsx
            className="hidden cursor-pointer rounded-full bg-brand-green px-5 py-2.5 text-sm font-bold text-brand-cream sm:inline-flex"
```
Replace with:
```tsx
            className="im-tap hidden cursor-pointer rounded-full bg-brand-green px-5 py-2.5 text-sm font-bold text-brand-cream sm:inline-flex"
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm --filter frontend run lint`
Expected: both exit 0.

Then manually: `pnpm --filter frontend run dev`, open `http://localhost:3000` in a narrow/mobile viewport (browser devtools device toolbar), click the hamburger. Confirm: backdrop dims, panel slides in from the right, "Publier une annonce" is the first/most prominent item, Escape key and backdrop click both close it, and scrolling the page body is locked while open.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/immolink/Header.tsx
git commit -m "feat(immolink): replace mobile dropdown with slide-in drawer menu"
```

---

### Task 5: Wire `Reveal` and `im-tap` into the homepage sections

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `Reveal` from Task 3 (`import { Reveal } from '@/components/immolink/Reveal';`), `.im-tap` from Task 2.

- [ ] **Step 1: Import `Reveal`**

At the top of `frontend/src/app/page.tsx`, add to the imports:
```tsx
import { Reveal } from '@/components/immolink/Reveal';
```

- [ ] **Step 2: Wrap "Biens à la Une"**

Find:
```tsx
      {/* BIENS A LA UNE */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-2 sm:px-8">
        <div className="mb-6.5 flex items-end justify-between">
          <div>
            <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-red uppercase">
              Sélection premium
            </div>
            <h2 className="font-serif text-4xl leading-none font-normal">Biens à la Une</h2>
          </div>
          <Link
            href="/recherche?txn=vente"
            className="border-b-2 border-brand-red pb-1 text-sm font-bold text-brand-green"
          >
            Voir tout →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5.5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => (
            <PropertyCard key={p.id} property={p} size="lg" />
          ))}
        </div>
      </section>
```

Replace with (only the outer wrapper changes — same content, same classes):
```tsx
      {/* BIENS A LA UNE */}
      <Reveal>
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-2 sm:px-8">
          <div className="mb-6.5 flex items-end justify-between">
            <div>
              <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-red uppercase">
                Sélection premium
              </div>
              <h2 className="font-serif text-4xl leading-none font-normal">Biens à la Une</h2>
            </div>
            <Link
              href="/recherche?txn=vente"
              className="im-tap border-b-2 border-brand-red pb-1 text-sm font-bold text-brand-green"
            >
              Voir tout →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-5.5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p) => (
              <PropertyCard key={p.id} property={p} size="lg" />
            ))}
          </div>
        </section>
      </Reveal>
```

- [ ] **Step 3: Wrap "Programmes immobiliers neufs"**

Find the `{/* PROJETS NEUFS */}` section (the whole `<section>...</section>` block) and:
1. Wrap the entire `<section>...</section>` in `<Reveal>...</Reveal>`.
2. Add `im-tap` to the "Explorer →" link's className: change
   `className="text-sm font-bold text-brand-gold"` to
   `className="im-tap text-sm font-bold text-brand-gold"`.
3. Add `im-tap` to each program `<Link>` card's className: change
   `className="overflow-hidden rounded-2xl border border-brand-cream/14 bg-brand-cream/6"` to
   `className="im-tap overflow-hidden rounded-2xl border border-brand-cream/14 bg-brand-cream/6"`.

No other content changes in this section.

- [ ] **Step 4: Wrap "Nouvelles annonces"**

Same pattern as Step 2: wrap the `{/* NOUVELLES ANNONCES */}` `<section>...</section>` in `<Reveal>...</Reveal>`, and add `im-tap` to its "Voir tout →" link (`className="border-b-2 border-brand-red pb-1 text-sm font-bold text-brand-green"` → prefix with `im-tap `).

- [ ] **Step 5: Wrap "Témoignages"**

Wrap the `{/* TEMOIGNAGES */}` `<section>...</section>` in `<Reveal>...</Reveal>`. No interactive elements in this section, so no `im-tap` additions needed here.

- [ ] **Step 6: Wrap "Packs teaser"**

Wrap the `{/* PACKS TEASER */}` `<section>...</section>` in `<Reveal>...</Reveal>`. Add `im-tap` to each pack's CTA link: change
```tsx
                className={`block w-full rounded-xl py-3 text-center text-sm font-bold ${pk.button}`}
```
to
```tsx
                className={`im-tap block w-full rounded-xl py-3 text-center text-sm font-bold ${pk.button}`}
```

The "POPULAIRE" badge (`absolute -top-2.5 left-1/2 -translate-x-1/2 ...`) was reviewed against the spec's concern about mobile overflow: it's a single short word in an auto-width pill, horizontally centered — it does not risk clipping at any realistic viewport width. No change needed there.

- [ ] **Step 7: Verify**

Run: `pnpm typecheck && pnpm --filter frontend run lint`
Expected: both exit 0.

Then manually: `pnpm --filter frontend run dev`, load `http://localhost:3000`, scroll down. Confirm each section (Biens à la Une, Programmes neufs, Nouvelles annonces, Témoignages, Packs) fades/lifts into view the first time it enters the viewport, and does not re-animate on scrolling back up and down again.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat(immolink): add scroll-reveal and tap feedback to homepage sections"
```

---

### Task 6: `im-tap` on search panel + property cards, final verification, and push

**Files:**
- Modify: `frontend/src/components/immolink/HomeSearchPanel.tsx`
- Modify: `frontend/src/components/immolink/PropertyCard.tsx`

**Interfaces:**
- Consumes: `.im-tap` from Task 2. No new exports from either file.

- [ ] **Step 1: Add `im-tap` to the search panel tabs**

In `frontend/src/components/immolink/HomeSearchPanel.tsx`, find:
```tsx
            className={`flex-none cursor-pointer rounded-full px-4 py-2 text-[13.5px] font-bold whitespace-nowrap sm:px-5 sm:py-2.5 sm:text-sm ${
              tab === t.label ? 'bg-brand-green text-brand-cream' : 'text-brand-slate'
            }`}
```
Replace with:
```tsx
            className={`im-tap flex-none cursor-pointer rounded-full px-4 py-2 text-[13.5px] font-bold whitespace-nowrap sm:px-5 sm:py-2.5 sm:text-sm ${
              tab === t.label ? 'bg-brand-green text-brand-cream' : 'text-brand-slate'
            }`}
```

- [ ] **Step 2: Add `im-tap` to the "Rechercher" button**

In the same file, find:
```tsx
          className="cursor-pointer bg-brand-red px-7.5 py-4 text-[15px] font-bold text-white"
```
Replace with:
```tsx
          className="im-tap cursor-pointer bg-brand-red px-7.5 py-4 text-[15px] font-bold text-white"
```

- [ ] **Step 3: Add `im-tap` to the property card favorite button**

In `frontend/src/components/immolink/PropertyCard.tsx`, find:
```tsx
          className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/92 text-[17px]"
```
Replace with:
```tsx
          className="im-tap absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/92 text-[17px]"
```

(The card's outer `<Link>` already has `transition-transform hover:-translate-y-1` for the desktop hover lift — left as-is; `im-tap` on the heart button covers the mobile tap case without conflicting with the card-level hover transform.)

- [ ] **Step 4: Full verification**

Run, from the repo root:
```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```
Expected: all four commands exit 0 (matches `CLAUDE.md`'s pre-commit checklist).

Then manually: `pnpm --filter frontend run dev`, click/tap the search tabs, the "Rechercher" button, and a property card's heart icon — confirm each visibly presses inward (`scale(0.96)`) on click/tap.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/immolink/HomeSearchPanel.tsx frontend/src/components/immolink/PropertyCard.tsx
git commit -m "feat(immolink): add tap feedback to search panel and property cards"
```

- [ ] **Step 6: Push**

Push the branch (this repo's remote/credential setup is already established earlier in the session — use whatever push method was used for the prior commits in this conversation, e.g. `git push saasimmo main`).

- [ ] **Step 7: Report back**

Summarize for the user: what changed (favicon, drawer menu, scroll reveals, tap feedback), confirm the deployment will pick it up automatically via the GitHub → Vercel integration, and note that no headless-browser screenshot was taken (none available in this environment) — ask the user to verify visually once deployed.

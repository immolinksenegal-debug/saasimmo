// Decorative card cluster for the homepage hero — top-right, desktop only.
// Purely presentational (static marketing dressing, like TESTIMONIALS /
// PROGRAMS in lib/mock/immolink.ts), no live data. Gently floats via the
// `animate-im-float` keyframe (globals.css), staggered per card, and is
// disabled under prefers-reduced-motion like the rest of the im-* animations.
//
// Cards are vertically staggered (each row given more height than any card
// can realistically render at) so they never overlap each other's text,
// regardless of exact rendered height.
const BARS = [40, 55, 46, 72, 88, 60];

export function HeroFloatingCards() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-4 right-6 hidden h-[480px] w-[380px] xl:block"
    >
      <div
        className="animate-im-float absolute top-0 right-2.5 flex w-37.5 flex-col items-center gap-3 rounded-[24px] bg-brand-cream p-5 text-center shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)]"
        style={{ animationDelay: '0s' }}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-green/10">
          <svg viewBox="0 0 48 48" className="h-9 w-9" fill="none">
            <path
              d="M8 24 24 10l16 14"
              stroke="#c81e1e"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 22v16h8v-8h8v8h8V22"
              stroke="#0a5a2e"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="30" cy="30" r="2.6" fill="#f2c200" />
            <path d="M32.3 30h5.2" stroke="#f2c200" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-[12.5px] font-bold text-brand-ink">Clés en main</span>
      </div>

      <div
        className="animate-im-float absolute top-[190px] left-0 w-50 rounded-[20px] bg-brand-cream p-4.5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)]"
        style={{ animationDelay: '0.6s' }}
      >
        <div className="mb-1.5 text-[10px] font-extrabold tracking-wide text-brand-muted2 uppercase">
          Loyers encaissés · Août
        </div>
        <div className="mb-2.5 font-serif text-xl text-brand-ink">184 260 FCFA</div>
        <div className="flex items-end gap-1.5">
          {BARS.map((h, i) => (
            <div
              key={i}
              className={`w-3 rounded-t-sm ${i >= 3 && i <= 4 ? 'bg-brand-red' : 'bg-brand-green/15'}`}
              style={{ height: `${h * 0.35}px` }}
            />
          ))}
        </div>
      </div>

      <div
        className="animate-im-float absolute top-[350px] right-0 w-54 rounded-[20px] bg-brand-green-dark p-4.5 text-brand-cream shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)]"
        style={{ animationDelay: '1.2s' }}
      >
        <div className="mb-1.5 flex items-center gap-2 text-[12px] font-bold">
          <span className="relative flex h-2 w-2 flex-none">
            <span className="motion-safe:absolute motion-safe:inline-flex motion-safe:h-full motion-safe:w-full motion-safe:animate-ping motion-safe:rounded-full motion-safe:bg-brand-gold motion-safe:opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-gold" />
          </span>
          Nouveau bail signé
        </div>
        <p className="mb-2 text-[12.5px] leading-snug text-brand-cream/85">
          Appartement T3 · Cité Keur Gorgui — signé électroniquement.
        </p>
        <div className="text-[10.5px] font-semibold text-brand-cream/60">il y a 3 min</div>
      </div>
    </div>
  );
}

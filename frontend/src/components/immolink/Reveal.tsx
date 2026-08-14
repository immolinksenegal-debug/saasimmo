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

'use client';

import { useState } from 'react';
import type { Property } from '@prisma/client';
import { estimateMonthlyPayment, formatFcfa } from '@/lib/mock/immolink';

export function MortgageCalculator({ property }: { property: Property }) {
  const [duration, setDuration] = useState(20);
  const { mensualite, apport, finance } = estimateMonthlyPayment(property, duration);

  return (
    <div className="relative mt-8 overflow-hidden rounded-3xl bg-brand-green-dark p-7 text-brand-cream sm:px-7.5">
      <div className="absolute inset-0 bg-[radial-gradient(500px_200px_at_100%_0,rgba(242,194,0,.2),transparent_60%)]" />
      <div className="relative">
        <h3 className="mb-1 font-serif text-2xl">Calculateur de mensualités</h3>
        <p className="mb-5.5 text-[13.5px] text-brand-cream/70">
          Apport 20% · taux indicatif 8% / an
        </p>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Durée du crédit</span>
          <span className="text-sm font-extrabold text-brand-gold">{duration} ans</span>
        </div>
        <input
          type="range"
          min={5}
          max={30}
          step={1}
          value={duration}
          onChange={(e) => setDuration(parseInt(e.target.value, 10))}
          className="mb-5.5 w-full accent-brand-red"
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[13px] font-semibold text-brand-cream/70">Mensualité estimée</div>
            <div className="font-serif text-[40px] leading-none text-brand-gold">
              {formatFcfa(mensualite)} F
            </div>
          </div>
          <div className="text-[13px] leading-relaxed text-brand-cream/72 sm:text-right">
            <div>
              Apport : <b className="text-brand-cream">{formatFcfa(apport)} F</b>
            </div>
            <div>
              Montant financé : <b className="text-brand-cream">{formatFcfa(finance)} F</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

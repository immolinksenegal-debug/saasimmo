import Image from 'next/image';
import Link from 'next/link';
import type { InvestmentProject } from '@prisma/client';
import { formatFcfa } from '@/lib/mock/immolink';

export function InvestmentProjectCard({ project }: { project: InvestmentProject }) {
  return (
    <Link
      href={`/projets-neufs/${project.id}`}
      className="overflow-hidden rounded-2xl border border-brand-green/8 bg-white transition-transform hover:-translate-y-1"
    >
      <div className="relative h-48">
        <Image src={project.image} alt={project.title} fill className="object-cover" />
        <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.75 py-1 text-xs font-bold text-white">
          {project.status}
        </span>
      </div>
      <div className="p-4.5">
        <h3 className="mb-0.5 text-lg font-extrabold">{project.title}</h3>
        <div className="mb-3 text-[13px] font-semibold text-brand-muted">
          {project.city} · {project.lotsLabel}
        </div>
        <div className="text-[13px] font-semibold text-brand-slate">
          À partir de{' '}
          <span className="font-extrabold text-brand-green">
            {formatFcfa(project.priceFrom)} FCFA
          </span>
        </div>
      </div>
    </Link>
  );
}

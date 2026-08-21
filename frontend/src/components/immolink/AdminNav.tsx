'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin/orders', label: 'Paiements' },
  { href: '/admin/withdrawals', label: 'Retraits' },
  { href: '/admin/promotions', label: 'Publicités' },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-2 border-b border-gray-200 pb-3 text-sm font-medium">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`rounded-full px-3.5 py-1.5 ${
            pathname === l.href ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

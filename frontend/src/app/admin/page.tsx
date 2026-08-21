import { redirect } from 'next/navigation';

// Bare /admin has no content of its own — redirect to the first real
// back-office page instead of 404ing (this is where someone typing
// "/admin" by hand, or clicking a stale link, would otherwise land).
export default function AdminIndexPage() {
  redirect('/admin/orders');
}

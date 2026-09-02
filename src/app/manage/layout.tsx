import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookMarked, ShieldCheck, Trash2, Users } from 'lucide-react';
import { AwaitingApproval } from '@/components/awaiting-approval';
import { getCurrentProfile, getCurrentVolunteer } from '@/lib/supabase/server';

/**
 * Everything under /manage is closed to the public.
 *
 * Three gates, as the project rules require: the proxy redirects before a page
 * renders, RLS returns nothing without the role, and this layout is the render
 * check. The accounts tab additionally needs an administrator, which its own
 * page enforces — a volunteer who types the URL gets told, not a blank screen.
 */
export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const volunteer = await getCurrentVolunteer();

  if (!volunteer) {
    // A pending account has a session, so redirecting it to sign in would send
    // it round in a circle. It gets told what it is waiting for instead.
    const profile = await getCurrentProfile();
    if (profile) return <AwaitingApproval email={profile.email} />;
    redirect('/login?next=/manage/vocabulary');
  }

  const isAdmin = volunteer.role === 'admin';

  return (
    <div className="mx-auto max-w-6xl px-6 pt-8 pb-14 sm:pt-12 sm:pb-16">
      <header className="mb-9">
        <p className="eyebrow animate-rise">Archive administration</p>
        <h1 className="animate-rise mt-2 font-display text-3xl leading-tight sm:text-5xl">Manage</h1>
        <p
          className="animate-rise mt-4 max-w-2xl leading-relaxed text-muted sm:text-lg"
          style={{ '--reveal-delay': '90ms' } as React.CSSProperties}
        >
          The words and names the catalogue is allowed to use, and who is allowed to use them.
          {!isAdmin && ' Adding is open to you; removing is an administrator action.'}
        </p>
      </header>

      <nav className="mb-10 flex flex-wrap gap-2.5" aria-label="Manage">
        <Tab href="/manage/vocabulary" icon={<BookMarked size={17} />} label="Vocabulary" />
        <Tab href="/manage/families" icon={<Users size={17} />} label="Families" />
        {isAdmin && <Tab href="/manage/accounts" icon={<ShieldCheck size={17} />} label="Accounts" />}
        {isAdmin && <Tab href="/manage/bin" icon={<Trash2 size={17} />} label="Bin" />}
      </nav>

      {children}
    </div>
  );
}

function Tab({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex h-12 items-center gap-2 rounded-full border border-rule bg-paper px-5 font-medium shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-strong hover:bg-accent-wash"
    >
      {icon}
      {label}
    </Link>
  );
}

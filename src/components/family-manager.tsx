'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2, Mail, Plus, Trash2, X } from 'lucide-react';
import { buttonClass } from '@/components/primitives';
import { COMMUNITY_COLORS, COMMUNITY_ORDER } from '@/lib/communities';
import { COMMUNITY_LABELS, type Community, type Contributor, type Family } from '@/lib/types';

export type FamilyContributor = Contributor & { familyIds: string[]; submissions: number };

/**
 * The family register.
 *
 * These are the names the collections are actually known by — the Sassoons, the
 * Ezras, the Benjamins — and they are also the surnames of living people. A
 * family belongs to one community; a record may carry more than one family.
 */
export function FamilyManager({
  families,
  contributors,
  isAdmin,
}: {
  families: Family[];
  /** The contributor register, with the families each address is linked to. */
  contributors: FamilyContributor[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [community, setCommunity] = useState<Community>('bene_israel');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openFamily, setOpenFamily] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState('');
  const [contactName, setContactName] = useState('');

  async function send(url: string, init: RequestInit): Promise<boolean> {
    setError(null);
    const response = await fetch(url, init);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? 'That did not go through. Try again.');
      return false;
    }
    startTransition(() => router.refresh());
    return true;
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusyId('new');
    const done = await send('/api/manage/families', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), community, notes: notes.trim() || null }),
    });
    if (done) {
      setName('');
      setNotes('');
    }
    setBusyId(null);
  }

  /**
   * Ties an address to a family.
   *
   * Takes the address rather than picking from a list, because the useful case
   * is a volunteer who knows the correspondence comes from the Sassoons before
   * the archive has ever received anything from that address. The row is
   * created if it is new.
   */
  async function addContact(event: React.FormEvent, familyId: string) {
    event.preventDefault();
    if (!contactEmail.trim()) return;

    setBusyId(`contact:${familyId}`);
    const done = await send('/api/manage/contributors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: contactEmail.trim(),
        fullName: contactName.trim() || null,
        familyId,
      }),
    });
    if (done) {
      setContactEmail('');
      setContactName('');
    }
    setBusyId(null);
  }

  async function removeContact(contributorId: string, familyId: string) {
    setBusyId(`contact:${contributorId}`);
    await send(`/api/manage/contributors?contributorId=${contributorId}&familyId=${familyId}`, {
      method: 'DELETE',
    });
    setBusyId(null);
  }

  async function remove(family: Family) {
    setBusyId(family.id);
    await send(`/api/manage/families?id=${family.id}`, { method: 'DELETE' });
    setBusyId(null);
  }

  const byCommunity = COMMUNITY_ORDER.map((c) => ({
    community: c,
    rows: families.filter((f) => f.community === c),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="max-w-4xl">
      <p className="mb-6 rounded-lg border-l-[3px] border-caution bg-accent-wash px-4 py-3 text-sm leading-relaxed text-caution">
        Family names are <strong>published</strong> on every record they are attached to, which
        means the surnames of living relatives appear in public. Register a family when the name is
        already part of the historical record — not to identify a private donor.
      </p>

      <form onSubmit={add} className="mb-8 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label>
          <span className="eyebrow mb-1.5 block">Family name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Sassoon"
            className="h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none"
          />
        </label>

        <label>
          <span className="eyebrow mb-1.5 block">Community</span>
          <select
            value={community}
            onChange={(e) => setCommunity(e.target.value as Community)}
            className="h-13 rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:outline-none"
          >
            {COMMUNITY_ORDER.map((c) => (
              <option key={c} value={c}>
                {COMMUNITY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={busyId === 'new' || !name.trim()}
          className={buttonClass('primary', 'h-13')}
        >
          {busyId === 'new' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Add
        </button>

        <label className="sm:col-span-3">
          <span className="eyebrow mb-1.5 block">Note — optional</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={400}
            placeholder="Merchant family, Bombay and Shanghai"
            className="h-13 w-full rounded-lg border border-rule bg-paper px-4 focus:border-accent-strong focus:bg-accent-wash/30 focus:outline-none"
          />
        </label>
      </form>

      {error && (
        <p role="alert" className="mb-5 rounded-lg border-l-[3px] border-critical bg-critical/8 px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      {families.length === 0 ? (
        <p className="rounded-xl border border-dashed border-rule-strong bg-paper-2/60 px-6 py-10 text-center text-muted">
          No families registered yet. Add one and it becomes selectable on every record in that
          community.
        </p>
      ) : (
        <div className="space-y-7">
          {byCommunity.map(({ community: c, rows }) => (
            <div key={c}>
              <h3 className="eyebrow mb-2.5 flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: COMMUNITY_COLORS[c] }}
                />
                {COMMUNITY_LABELS[c]}
                <span className="font-mono normal-case">{rows.length}</span>
              </h3>
              <ul className="divide-y divide-rule border-y border-rule">
                {rows.map((family) => {
                  const contacts = contributors.filter((c) => c.familyIds.includes(family.id));
                  const open = openFamily === family.id;

                  return (
                    <li key={family.id} className="py-3">
                      <div className="flex items-center gap-3">
                        <span className="font-display text-lg">{family.name}</span>
                        {family.notes && (
                          <span className="flex-1 text-sm text-muted">{family.notes}</span>
                        )}
                        {!family.notes && <span className="flex-1" />}

                        {/* The count is the useful thing at a glance and the
                            addresses are one click away rather than always on
                            screen. They are private addresses, and most of the
                            time the answer to "who is this family" is the name. */}
                        <button
                          type="button"
                          onClick={() => {
                            setOpenFamily(open ? null : family.id);
                            setContactEmail('');
                            setContactName('');
                          }}
                          aria-expanded={open}
                          className="inline-flex items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent-strong hover:bg-accent-wash hover:text-ink"
                        >
                          <Mail size={14} aria-hidden />
                          {contacts.length}
                          <ChevronDown
                            size={14}
                            aria-hidden
                            className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
                          />
                          <span className="sr-only">Addresses linked to {family.name}</span>
                        </button>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => remove(family)}
                            disabled={busyId === family.id}
                            className="rounded p-2 text-muted transition-colors hover:bg-critical/10 hover:text-critical disabled:opacity-40"
                          >
                            <Trash2 size={15} />
                            <span className="sr-only">Remove {family.name}</span>
                          </button>
                        )}
                      </div>

                      {open && (
                        <div className="mt-3 rounded-lg bg-paper-2/70 px-4 py-3.5">
                          {contacts.length === 0 ? (
                            <p className="text-sm text-muted">
                              No addresses linked to this family yet.
                            </p>
                          ) : (
                            <ul className="mb-3 space-y-1.5">
                              {contacts.map((contact) => (
                                <li key={contact.id} className="flex flex-wrap items-center gap-2.5">
                                  <span className="machine text-sm">{contact.email}</span>
                                  {contact.full_name && (
                                    <span className="text-sm text-muted">{contact.full_name}</span>
                                  )}
                                  {contact.submissions > 0 && (
                                    <span className="text-sm text-muted">
                                      {contact.submissions}{' '}
                                      {contact.submissions === 1 ? 'record' : 'records'}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeContact(contact.id, family.id)}
                                    disabled={busyId === `contact:${contact.id}`}
                                    className="rounded p-1 text-muted transition-colors hover:bg-critical/10 hover:text-critical disabled:opacity-40"
                                  >
                                    <X size={14} />
                                    <span className="sr-only">
                                      Unlink {contact.email} from {family.name}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}

                          <form
                            onSubmit={(event) => addContact(event, family.id)}
                            className="flex flex-wrap items-end gap-2"
                          >
                            <label className="min-w-[15rem] flex-1">
                              <span className="sr-only">Address to link to {family.name}</span>
                              <input
                                type="email"
                                value={contactEmail}
                                onChange={(e) => setContactEmail(e.target.value)}
                                maxLength={160}
                                placeholder="ruth@example.com"
                                className="h-11 w-full rounded-lg border border-rule bg-paper px-3 focus:border-accent-strong focus:outline-none"
                              />
                            </label>
                            <label className="min-w-[10rem] flex-1">
                              <span className="sr-only">Their name, if known</span>
                              <input
                                value={contactName}
                                onChange={(e) => setContactName(e.target.value)}
                                maxLength={120}
                                placeholder="Name — optional"
                                className="h-11 w-full rounded-lg border border-rule bg-paper px-3 focus:border-accent-strong focus:outline-none"
                              />
                            </label>
                            <button
                              type="submit"
                              disabled={!contactEmail.trim() || busyId === `contact:${family.id}`}
                              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-rule-strong bg-paper px-4 text-sm font-medium transition-all duration-200 hover:border-accent-strong hover:bg-accent-wash disabled:pointer-events-none disabled:opacity-50"
                            >
                              {busyId === `contact:${family.id}` ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Plus size={14} />
                              )}
                              Link
                            </button>
                          </form>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {pending && <span className="sr-only">Saving</span>}
    </div>
  );
}

'use client';

import { useSyncExternalStore } from 'react';

/**
 * A screen saying "not while I am open" to the language control in the strip.
 *
 * ── the problem it solves ───────────────────────────────────────────────────
 *
 * The contribution flow asks, on screen two, which language the machine should
 * read the document in — and from that moment the pre-review, the catalogue
 * fields and the machine's own prose all belong to that choice. The control in
 * the masthead changes the *site* language, which reloads the page. Pressing it
 * mid-contribution throws away the files, the address, the consent and the
 * reading, and there is no way to explain that on a button.
 *
 * So it is not disabled, it is gone. A disabled control is a thing to wonder
 * about; an absent one is not a question. It comes back the moment the
 * contribution is sent.
 *
 * ── why a module-level store and not context ────────────────────────────────
 *
 * The two components are in different trees. `LanguagePicker` is rendered by
 * the masthead in the root layout; `UploadFlow` is rendered by the page inside
 * it. No provider can sit above both without wrapping the entire application in
 * a client boundary to serve one screen.
 *
 * They are, however, in the same bundle, so module scope is a shared place they
 * can both reach — and `useSyncExternalStore` is React's own answer for reading
 * one safely, without the tearing a bare module variable plus `useState` would
 * produce.
 *
 * A knowledge expert is exempt. They review in the language the site is set to,
 * and changing it mid-review is the whole point of the third request — see
 * `LanguagePicker`.
 */

let locked = false;
const listeners = new Set<() => void>();

/** Hide the control. Returns the function that puts it back. */
export function lockLanguage(): () => void {
  if (!locked) {
    locked = true;
    for (const listener of listeners) listener();
  }
  return unlockLanguage;
}

export function unlockLanguage(): void {
  if (!locked) return;
  locked = false;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = () => locked;

/**
 * The server always answers `false`.
 *
 * A lock is a thing a person did in this browser a moment ago; the server
 * rendering the page has no idea about it, and claiming otherwise would
 * hydrate the strip with the control missing and then put it back — a flicker
 * on every page load, to be right about a case that has not happened yet.
 */
const readOnServer = () => false;

export function useLanguageLocked(): boolean {
  return useSyncExternalStore(subscribe, read, readOnServer);
}

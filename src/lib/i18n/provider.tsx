'use client';

import { createContext, useContext, useMemo } from 'react';
import { en, format, type MessageKey } from './messages';

/**
 * The catalogue, for the parts of the archive that run in the browser.
 *
 * Server components read the cookie themselves and need nothing from this. But
 * the upload flow, the review workbench and the pickers are all client
 * components with text of their own, and threading forty strings down as props
 * would make every one of them a worse component.
 *
 * The whole resolved catalogue is serialised once into the root layout — one
 * language, a few kilobytes — rather than per component. It cannot change
 * without a reload, and choosing a language already does a full reload
 * (`language-picker`), so there is nothing to keep in sync.
 */

const Catalogue = createContext<Record<string, string> | null>(null);

export function MessagesProvider({
  catalogue,
  children,
}: {
  catalogue: Record<string, string>;
  children: React.ReactNode;
}) {
  return <Catalogue.Provider value={catalogue}>{children}</Catalogue.Provider>;
}

/**
 * Falls back to English rather than throwing when there is no provider above.
 *
 * A component rendered in a test, or in some future corner that forgets the
 * provider, should show the interface in English — not crash the page. The
 * archive has a rule about this: a missing translation is never worse than the
 * original.
 */
export function useMessages() {
  const catalogue = useContext(Catalogue);
  return useMemo(() => {
    const table: Record<string, string> = catalogue ?? en;
    return (key: MessageKey, vars?: Record<string, string | number>) =>
      format(table[key] ?? en[key] ?? key, vars);
  }, [catalogue]);
}

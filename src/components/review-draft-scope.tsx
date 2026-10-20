'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type DraftReading = { analysisId: string; field: 'ocrText' | 'transcript'; text: string };
const Context = createContext<{
  readings: DraftReading[];
  restored: DraftReading[];
  restore: (readings: DraftReading[]) => void;
  change: (reading: DraftReading, original: string) => void;
} | null>(null);

export function ReviewDraftScope({ children }: { children: ReactNode }) {
  const [readings, setReadings] = useState<DraftReading[]>([]);
  const [restored, setRestored] = useState<DraftReading[]>([]);
  const value = useMemo(() => ({
    readings, restored,
    restore: (next: DraftReading[]) => { setReadings(next); setRestored(next); },
    change: (reading: DraftReading, original: string) => setReadings(previous => {
      const existing = previous.find(row => row.analysisId === reading.analysisId && row.field === reading.field);
      if (existing?.text === reading.text || (!existing && reading.text === original)) return previous;
      const other = previous.filter(row => row.analysisId !== reading.analysisId || row.field !== reading.field);
      return reading.text === original ? other : [...other, reading].sort((a, b) => `${a.analysisId}:${a.field}`.localeCompare(`${b.analysisId}:${b.field}`));
    }),
  }), [readings, restored]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDraftReadings() { return useContext(Context); }

/** One integration element inside the existing independently saved reading editor. */
export function ReviewReadingDraft({ analysisId, field, text, original, restore }: DraftReading & { original: string; restore: (text: string) => void }) {
  const context = useDraftReadings();
  const restored = context?.restored;
  const change = context?.change;
  useEffect(() => {
    const reading = restored?.find(row => row.analysisId === analysisId && row.field === field);
    if (reading) restore(reading.text);
  }, [restored, analysisId, field, restore]);
  useEffect(() => { change?.({ analysisId, field, text }, original); }, [change, analysisId, field, text, original]);
  return null;
}

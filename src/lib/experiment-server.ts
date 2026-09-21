import 'server-only';
import { cookies } from 'next/headers';
import { BUCKETS, EXPERIMENT_COOKIE, variantOf, type Variant } from '@/lib/experiment';

/**
 * Reading the bucket, on the server.
 *
 * Split from the pure half because the proxy imports the constants, and the
 * proxy runs in the middleware runtime where `next/headers` does not exist. A
 * single module would have taken that import into the middleware bundle.
 */
export async function currentBucket(): Promise<number | null> {
  const raw = (await cookies()).get(EXPERIMENT_COOKIE)?.value;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value < BUCKETS ? value : null;
}

/** The variant this visitor sees. Falls back to 'a' when nothing is assigned. */
export async function variantFor(experiment: string): Promise<Variant> {
  const bucket = await currentBucket();
  return bucket === null ? 'a' : variantOf(experiment, bucket);
}

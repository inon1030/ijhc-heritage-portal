import type { MessageKey } from './messages';
import type { Community, ItemCategory } from '@/lib/types';

/**
 * The archive's own vocabulary, as catalogue keys.
 *
 * `COMMUNITY_LABELS` in `lib/types` still exists and is still the English. It
 * is the wrong place to translate from, because those keys are the database's
 * enum values and a great deal of code compares against them; this maps the
 * value to a key and leaves the enum alone.
 *
 * A community is a proper name, so translating it is a judgement rather than an
 * obligation — but "Cochin" set in Latin inside a Malayalam sentence is the one
 * word a Cochin reader has the most right to see in their own script. The
 * catalogue is where that decision is made once and can be corrected by hand.
 */
export function communityKey(community: Community): MessageKey {
  return `community.${community}` as MessageKey;
}

export function categoryKey(category: ItemCategory | null): MessageKey {
  return (category ? `category.${category}` : 'category.none') as MessageKey;
}

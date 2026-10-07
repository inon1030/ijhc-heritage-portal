import { COMMUNITY_ORDER } from '@/lib/communities';
import type { Community } from '@/lib/types';
import type { FieldValue } from '@/lib/fields/registry';

/** A contributor statement, even if the machine independently agrees. */
export function withContributorCommunity(fields: FieldValue[], community: string): FieldValue[] {
  if (!COMMUNITY_ORDER.includes(community as Community)) return fields;
  return [...fields.filter((field) => field.key !== 'community'), {
    key: 'community', value: community, source: 'contributor',
  }];
}

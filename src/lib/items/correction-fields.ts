import { fieldDef } from '@/lib/fields/registry';
import { fieldLabel } from '@/lib/fields/labels';
import type { MessageKey } from '@/lib/i18n/messages';
import type { Item, ItemField } from '@/lib/types';
import { discreteField } from './portal-facets';
import type { CorrectionField } from './public-input';

export function correctionFields(item: Item & { fields: ItemField[] }, t: (key: MessageKey) => string): CorrectionField[] {
  return [
    { key: 'title', label: t('public.title'), value: item.title, maxLength: 200 },
    { key: 'description', label: t('public.description'), value: item.description ?? '', maxLength: 4000 },
    { key: 'period', label: t('record.period'), value: item.period ?? '', maxLength: 120 },
    { key: 'origin_place', label: t('record.placeOfOrigin'), value: item.origin_place ?? '', maxLength: 200 },
    ...item.fields.filter(row => discreteField(row.field_key)).map(row => {
      const def = fieldDef(row.field_key)!;
      return { key: `field:${row.field_key}`, label: fieldLabel(t, def), value: row.value, maxLength: 2000,
        options: def.type === 'facet' ? [{ value: row.value, label: row.value }] : def.options ? [...def.options] : undefined };
    }),
  ];
}

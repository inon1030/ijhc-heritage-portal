'use client';
import { usePathname } from 'next/navigation';
import type { SyntheticEvent } from 'react';

export function isPublicMediaPath(path: string | null) {
  return path === '/portal' || Boolean(path?.startsWith('/portal/'));
}
export function usePublicMedia() {
  const protectedView = isPublicMediaPath(usePathname());
  const prevent = (event: SyntheticEvent) => event.preventDefault();
  return {
    protectedView,
    props: protectedView ? {
      onContextMenu: prevent, onDragStart: prevent, draggable: false,
      'data-public-media': true,
      style: { userSelect: 'none' as const, WebkitUserSelect: 'none' as const },
    } : {},
  };
}

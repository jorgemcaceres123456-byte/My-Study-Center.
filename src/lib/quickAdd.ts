import { useEffect } from 'react';

/** Sections subscribe to the topbar's "Añadir" menu. */
export function useQuickAdd(type: string, handler: () => void) {
  useEffect(() => {
    const fn = (e: Event) => { if ((e as CustomEvent<string>).detail === type) handler(); };
    window.addEventListener('msc:new', fn);
    return () => window.removeEventListener('msc:new', fn);
  });
}

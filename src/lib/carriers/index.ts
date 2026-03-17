import type { CarrierAdapter } from './types';
import type { Carrier } from '@/lib/types';
import { ceskaPostaAdapter } from './ceska-posta';
import { zasilkovnaAdapter } from './zasilkovna';
import { pplAdapter } from './ppl';

// Všechny registrované adaptéry
const adapters: CarrierAdapter[] = [
  ceskaPostaAdapter,
  zasilkovnaAdapter,
  pplAdapter,
];

/**
 * Auto-detekce přepravce podle tracking čísla.
 * Vrací název přepravce nebo 'other'.
 */
export function detectCarrier(trackingNumber: string): Carrier {
  for (const adapter of adapters) {
    if (adapter.detect(trackingNumber)) {
      return adapter.name as Carrier;
    }
  }

  // Fallback detekce pro přepravce bez adaptéru
  const tn = trackingNumber.trim();
  if (/^\d{14}$/.test(tn)) return 'dpd';
  if (/^\d{8,11}$/.test(tn)) return 'gls';

  return 'other';
}

/**
 * Získá adaptér pro daného přepravce.
 */
export function getAdapter(carrier: Carrier): CarrierAdapter | null {
  return adapters.find(a => a.name === carrier) || null;
}

/**
 * Detekuje přepravce a vrátí adaptér + carrier type.
 */
export function detectAndGetAdapter(trackingNumber: string): { carrier: Carrier; adapter: CarrierAdapter | null } {
  const carrier = detectCarrier(trackingNumber);
  const adapter = getAdapter(carrier);
  return { carrier, adapter };
}

export type { CarrierAdapter } from './types';

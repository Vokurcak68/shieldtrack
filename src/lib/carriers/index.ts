import type { CarrierAdapter } from './types';
import type { Carrier } from '@/lib/types';
import { ceskaPostaAdapter } from './ceska-posta';
import { zasilkovnaAdapter } from './zasilkovna';
import { pplAdapter } from './ppl';
import { dpdAdapter } from './dpd';
import { glsAdapter } from './gls';
import { geisAdapter } from './geis';

// Všechny registrované adaptéry
const adapters: CarrierAdapter[] = [
  ceskaPostaAdapter,
  zasilkovnaAdapter,
  pplAdapter,
  dpdAdapter,
  glsAdapter,
  geisAdapter,
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
  const tn = trackingNumber.trim().toUpperCase();

  // DPD: 14 číslic
  if (/^\d{14}$/.test(tn)) return 'dpd';
  // GLS: 8-12 číslic (ale ne PPL 40xxxxxxxxx)
  if (/^\d{8,12}$/.test(tn) && !/^40\d{9}$/.test(tn)) return 'gls';
  // Geis: N/G + čísla, nebo 15+ číslic, nebo XXXX-XXXX-XXXX
  if (/^[NG]\d{8,}$/.test(tn)) return 'geis';
  if (/^\d{15,}$/.test(tn)) return 'geis';
  if (/^\d{4}-\d{4}-\d{4,}$/.test(tn)) return 'geis';

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

import type { CarrierAdapter } from './types';
import type { TrackingResult, TrackingEventData } from '@/lib/types';

/**
 * PPL CZ adapter — POST /TrackAndTrace/{shipmentId}
 * Endpoint: https://api.dhl.com/ecs/ppl/webapi/TrackAndTrace/{id}
 * Method: POST with empty body {}
 * Auth: dhl-api-key header (public key from ppl.cz frontend)
 */

const PPL_API_KEY = '7HH634Q79Zpge4xEGeFAHXAnUMRxv0XQ';
const PPL_BASE_URL = 'https://api.dhl.com/ecs/ppl/webapi/TrackAndTrace';

// Phase → ShipmentStatus mapping
const PHASE_MAP: Record<string, TrackingResult['status']> = {
  'WaitingForShipment': 'registered',
  'ShipmentInTransport': 'in_transit',
  'PreparingForDelivery': 'in_transit',
  'LoadingForDelivery': 'out_for_delivery',
  'Delivered': 'delivered',
  'Returned': 'returned',
  'Cancelled': 'cancelled',
};

// Event code → ShipmentStatus (more granular)
const EVENT_CODE_MAP: Record<string, TrackingResult['status']> = {
  'WaitingForShipment': 'registered',
  'ShipmentInTransport': 'in_transit',
  'ShipmentInTransport.TakeOverFromSender': 'in_transit',
  'PreparingForDelivery': 'in_transit',
  'LoadingForDelivery.TimeWindow': 'out_for_delivery',
  'LoadingForDelivery': 'out_for_delivery',
  'Delivered': 'delivered',
  'DeliveredToParcelShop': 'delivered',
  'Returned': 'returned',
};

export const pplAdapter: CarrierAdapter = {
  name: 'ppl',

  detect(trackingNumber: string): boolean {
    const tn = trackingNumber.trim().toUpperCase();
    // PPL formáty: 10-12 číslic začínajících na 40/45/50/60/80
    if (/^[45689]0\d{8,10}$/.test(tn)) return true;
    if (/^45\d{9}$/.test(tn)) return true;
    // PPL CZ: s prefixem
    if (/^PPL/i.test(tn)) return true;
    return false;
  },

  async track(trackingNumber: string): Promise<TrackingResult> {
    const tn = trackingNumber.trim();
    const trackingUrl = `https://www.ppl.cz/vyhledat-zasilku?shipmentId=${encodeURIComponent(tn)}`;

    try {
      const res = await fetch(`${PPL_BASE_URL}/${encodeURIComponent(tn)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'dhl-api-key': PPL_API_KEY,
          'Origin': 'https://www.ppl.cz',
          'Referer': 'https://www.ppl.cz/',
        },
        body: '{}',
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        if (res.status === 404) {
          return { found: false, status: 'registered', carrierStatusRaw: 'Zásilka nenalezena', events: [] };
        }
        return { found: false, status: 'registered', carrierStatusRaw: `HTTP ${res.status}`, events: [] };
      }

      const data = await res.json() as PplResponse;

      if (!data.shipmentId || (!data.events?.length && !data.phase)) {
        return { found: false, status: 'registered', carrierStatusRaw: 'Zásilka nenalezena', events: [] };
      }

      // Parse events
      const events: TrackingEventData[] = (data.events || []).map((e) => ({
        status: e.eventText || e.code,
        description: e.eventText || e.code,
        location: undefined,
        timestamp: e.eventDate,
      }));

      // Determine status from phase or last event code
      const phase = data.phase || data.lastEventCode || '';
      let status: TrackingResult['status'] = PHASE_MAP[phase] || EVENT_CODE_MAP[data.lastEventCode || ''] || 'registered';

      // Fallback: check event codes if phase doesn't match
      if (status === 'registered' && events.length > 0) {
        const lastCode = data.lastEventCode || '';
        for (const [code, s] of Object.entries(EVENT_CODE_MAP)) {
          if (lastCode.startsWith(code)) {
            status = s;
            break;
          }
        }
      }

      const carrierStatusRaw = data.lastEventText || phase;

      // Extract info from addresses
      // NOTE: PPL type=4 is SENDER, not recipient. Recipient name is not available via public API (GDPR).
      let deliveryCity: string | undefined;
      const recipientAddr = data.addresses?.find((a) => a.type === 1); // type 1 = recipient (if ever returned)
      if (recipientAddr?.city) deliveryCity = recipientAddr.city;

      return {
        found: true,
        status,
        carrierStatusRaw,
        deliveryCity,
        carrierRecipientName: recipientAddr?.name, // only if type=1 exists (currently PPL doesn't return it)
        trackingUrl,
        lastEventDate: data.lastEventDate || events[events.length - 1]?.timestamp,
        events,
      };
    } catch (error) {
      console.error('PPL tracking error:', error);
      return { found: false, status: 'registered', carrierStatusRaw: 'Chyba při sledování', events: [] };
    }
  },
};

// PPL API response types
interface PplEvent {
  code: string;
  eventDate: string;
  eventText: string;
}

interface PplAddress {
  type: number;
  country?: string;
  city?: string;
  name?: string;
}

interface PplResponse {
  shipmentId?: string;
  phase?: string;
  lastEventCode?: string;
  lastEventDate?: string;
  lastEventText?: string;
  weight?: number;
  events?: PplEvent[];
  addresses?: PplAddress[];
  expectedDeliveryDate?: string;
  timeWindow?: { from?: string; to?: string };
  packagesInSet?: number;
}

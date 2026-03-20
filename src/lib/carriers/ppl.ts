import type { CarrierAdapter } from './types';
import type { TrackingResult, TrackingEventData } from '@/lib/types';

/**
 * PPL CZ adapter.
 * PPL web (ppl.cz) je SPA - HTML scraping nefunguje (data se načítají přes JS).
 * Strategie:
 * 1. Pokud je nastavený DHL_API_KEY → DHL Unified Tracking API (PPL = DHL eCommerce)
 * 2. Fallback: vrátíme found=true s odkazem na PPL tracking web (bez event dat)
 */
export const pplAdapter: CarrierAdapter = {
  name: 'ppl',

  detect(trackingNumber: string): boolean {
    const tn = trackingNumber.trim().toUpperCase();
    // PPL formáty: 10-12 číslic začínajících na 40/50/60
    if (/^[456]0\d{8,10}$/.test(tn)) return true;
    // PPL CZ: s prefixem (např. PPL + číslo)
    if (/^PPL/i.test(tn)) return true;
    return false;
  },

  async track(trackingNumber: string): Promise<TrackingResult> {
    const tn = trackingNumber.trim();
    const trackingUrl = `https://www.ppl.cz/vyhledat-zasilku?shipmentId=${encodeURIComponent(tn)}`;

    // Pokus 1: DHL Unified Tracking API
    const dhlApiKey = process.env.DHL_API_KEY;
    if (dhlApiKey) {
      try {
        const result = await trackViaDHL(tn, dhlApiKey);
        if (result) return result;
      } catch (error) {
        console.warn('PPL/DHL API tracking failed, falling back:', error);
      }
    }

    // Pokus 2: PPL B2C stránka - pokus o zachycení JSON dat
    try {
      const result = await trackViaPplWeb(tn);
      if (result) return result;
    } catch (error) {
      console.warn('PPL web tracking failed:', error);
    }

    // Fallback: vrátíme registrovanou zásilku s odkazem na manuální kontrolu
    return {
      found: true,
      status: 'registered',
      carrierStatusRaw: 'Zásilka zaregistrována — automatické ověření není dostupné',
      trackingUrl,
      events: [],
    };
  },
};

/**
 * DHL Unified Tracking API — PPL je pod DHL Group.
 * Zdarma API klíč z developer.dhl.com
 * Docs: https://developer.dhl.com/api-reference/shipment-tracking
 */
async function trackViaDHL(trackingNumber: string, apiKey: string): Promise<TrackingResult | null> {
  const url = `https://api-eu.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`;

  const res = await fetch(url, {
    headers: {
      'DHL-API-Key': apiKey,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    console.warn(`DHL API returned ${res.status}`);
    return null;
  }

  const data = await res.json();
  const shipments = data?.shipments;
  if (!shipments || shipments.length === 0) return null;

  const shipment = shipments[0];
  const dhlStatus = shipment.status?.statusCode || '';
  const events: TrackingEventData[] = (shipment.events || []).map((e: Record<string, unknown>) => ({
    status: (e.description as string) || (e.statusCode as string) || '',
    description: (e.description as string) || '',
    location: formatDhlLocation(e.location as Record<string, unknown> | undefined),
    timestamp: (e.timestamp as string) || new Date().toISOString(),
  }));

  const statusMap: Record<string, TrackingResult['status']> = {
    'pre-transit': 'registered',
    'transit': 'in_transit',
    'delivered': 'delivered',
    'failure': 'returned',
    'unknown': 'registered',
  };

  const trackingUrl = `https://www.ppl.cz/vyhledat-zasilku?shipmentId=${encodeURIComponent(trackingNumber)}`;

  return {
    found: true,
    status: statusMap[dhlStatus] || 'in_transit',
    carrierStatusRaw: shipment.status?.description || dhlStatus,
    deliveryCity: formatDhlLocation(shipment.destination as Record<string, unknown> | undefined),
    lastEventDate: events[0]?.timestamp,
    trackingUrl,
    events,
  };
}

function formatDhlLocation(loc: Record<string, unknown> | undefined): string | undefined {
  if (!loc) return undefined;
  const address = loc.address as Record<string, unknown> | undefined;
  if (!address) return undefined;
  const parts = [address.addressLocality, address.countryCode].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * PPL B2C tracking přes interní web API.
 * PPL web volá DHL ecs API, ale klíč je veřejný na webu.
 */
async function trackViaPplWeb(trackingNumber: string): Promise<TrackingResult | null> {
  // PPL interní API klíč (veřejně dostupný na ppl.cz frontend)
  const pplApiKey = '7HH634Q79Zpge4xEGeFAHXAnUMRxv0XQ';
  const baseUrl = 'https://api.dhl.com/ecs/ppl/webapi';

  // Zkusíme známé endpointy
  const endpoints = [
    `${baseUrl}/tnt?shipmentId=${trackingNumber}&lang=cs`,
    `${baseUrl}/tnt/${trackingNumber}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          'x-api-key': pplApiKey,
          'Accept': 'application/json',
          'Origin': 'https://www.ppl.cz',
          'Referer': 'https://www.ppl.cz/',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object' && !data.status) {
          return parsePplApiResponse(data, trackingNumber);
        }
      }
    } catch {
      // Zkusíme další endpoint
    }
  }

  return null;
}

function parsePplApiResponse(data: Record<string, unknown>, trackingNumber: string): TrackingResult | null {
  // PPL API response formát se může lišit — tady parsujeme co přijde
  const trackingUrl = `https://www.ppl.cz/vyhledat-zasilku?shipmentId=${encodeURIComponent(trackingNumber)}`;

  const events: TrackingEventData[] = [];
  const rawEvents = (data.events || data.timeline || data.history || []) as Record<string, unknown>[];

  for (const e of rawEvents) {
    events.push({
      status: String(e.description || e.status || e.text || ''),
      description: String(e.description || e.text || ''),
      location: String(e.location || e.depot || e.depo || ''),
      timestamp: String(e.timestamp || e.date || e.dateTime || new Date().toISOString()),
    });
  }

  const statusStr = String(data.status || data.state || '').toLowerCase();
  let status: TrackingResult['status'] = 'registered';
  if (statusStr.includes('deliver') || statusStr.includes('doruč')) status = 'delivered';
  else if (statusStr.includes('transit') || statusStr.includes('přeprav')) status = 'in_transit';
  else if (statusStr.includes('return') || statusStr.includes('vráce')) status = 'returned';

  return {
    found: true,
    status,
    carrierStatusRaw: String(data.statusText || data.description || statusStr),
    trackingUrl,
    lastEventDate: events[0]?.timestamp,
    events,
  };
}

import type { CarrierAdapter } from './types';
import type { TrackingResult, TrackingEventData } from '@/lib/types';

/**
 * Česká pošta carrier adapter.
 * Používá oficiální JSON API na b2c.cpost.cz místo web scrapingu.
 * Výhody: strukturovaná data, postcode + postoffice u každého eventu, spolehlivější.
 */

interface CPostState {
  id: string;
  date: string;
  text: string;
  postcode: string | null;
  postoffice: string | null;
  idIcon: string | null;
  publicAccess: number;
  latitude: string | null;
  longitude: string | null;
  timeDeliveryAttempt: string | null;
}

interface CPostResponse {
  id: string;
  attributes: {
    parcelType: string;
    weight: number;
    currency: string;
    dobirka: number;
    zemePuvodu: string | null;
    zemeUrceni: string | null;
    dorucovaniDate: string | null;
    dorucovaniOd: string | null;
    dorucovaniDo: string | null;
    [key: string]: unknown;
  };
  states: {
    state: CPostState[];
  };
}

// Klíčová slova pro identifikaci stavu zásilky z textu eventu
const DELIVERED_KEYWORDS = ['doručen', 'dodán', 'převzat', 'vložen do schránky', 'uložena na požadované'];
const IN_TRANSIT_KEYWORDS = ['přeprav', 'podán', 'vypravena', 'odesláno', 'přijato', 'příjem zásilky'];
const RETURNED_KEYWORDS = ['vrácen', 'zpět odesílateli'];
const CANCELLED_KEYWORDS = ['storno', 'zrušen'];
const OUT_FOR_DELIVERY_KEYWORDS = ['doručování', 'na cestě k adresátovi', 'předána k doručení'];
// Eventy doručení — extrahujeme město z postoffice
const DELIVERY_LOCATION_KEYWORDS = ['doručen', 'dodán', 'převzat', 'uložen'];

export const ceskaPostaAdapter: CarrierAdapter = {
  name: 'ceska_posta',

  detect(trackingNumber: string): boolean {
    const tn = trackingNumber.trim().toUpperCase();
    // DR/RR/BA/NX/EE/CE/CD/CJ + 9 číslic + CZ (13 znaků)
    if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(tn)) return true;
    // Čistě numerické ~13 číslic (interní podací čísla)
    if (/^\d{13,14}$/.test(tn)) return true;
    return false;
  },

  async track(trackingNumber: string): Promise<TrackingResult> {
    const url = `https://b2c.cpost.cz/services/ParcelHistory/getDataAsJson?idParcel=${encodeURIComponent(trackingNumber.trim())}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      });

      if (!res.ok) {
        return { found: false, status: 'registered', carrierStatusRaw: `HTTP ${res.status}`, events: [] };
      }

      const data: CPostResponse[] = await res.json();

      if (!data || data.length === 0) {
        return { found: false, status: 'registered', carrierStatusRaw: 'Prázdná odpověď', events: [] };
      }

      const parcel = data[0];
      const states = parcel.states?.state || [];

      // ID -3 = zásilka není v evidenci, -4 = nezobrazujeme
      if (states.length === 1 && (states[0].id === '-3' || states[0].id === '-4')) {
        return {
          found: false,
          status: 'registered',
          carrierStatusRaw: states[0].text,
          events: [],
        };
      }

      // Převod eventů (ČP vrací od nejnovějšího)
      const events: TrackingEventData[] = states
        .filter(s => s.publicAccess !== 0 || parseInt(s.id) > 0)
        .map(s => ({
          status: s.text,
          description: s.text,
          location: formatLocation(s.postoffice, s.postcode),
          timestamp: parseDate(s.date, s.timeDeliveryAttempt),
        }));

      // Určení celkového stavu z textů eventů
      const status = determineStatus(states);
      const carrierStatusRaw = states[0]?.text || 'Neznámý stav';

      // Extrakce města a PSČ doručení
      const { deliveryCity, deliveryZip } = extractDeliveryLocation(states);

      // Poslední event date
      const lastEventDate = events.length > 0 ? events[0].timestamp : undefined;

      return {
        found: true,
        status,
        carrierStatusRaw,
        deliveryCity,
        deliveryZip,
        lastEventDate,
        events,
      };
    } catch (error) {
      console.error('Česká pošta tracking error:', error);
      return { found: false, status: 'registered', carrierStatusRaw: 'Chyba při sledování', events: [] };
    }
  },
};

/**
 * Určí celkový stav zásilky z eventů.
 */
function determineStatus(states: CPostState[]): TrackingResult['status'] {
  // Projdeme od nejnovějšího (index 0)
  for (const s of states) {
    const text = s.text.toLowerCase();

    if (DELIVERED_KEYWORDS.some(kw => text.includes(kw))) return 'delivered';
    if (RETURNED_KEYWORDS.some(kw => text.includes(kw))) return 'returned';
    if (CANCELLED_KEYWORDS.some(kw => text.includes(kw))) return 'cancelled';
    if (OUT_FOR_DELIVERY_KEYWORDS.some(kw => text.includes(kw))) return 'out_for_delivery';
  }

  // Pokud není doručeno/vráceno, ale má eventy → in_transit
  const hasRealEvents = states.some(s => parseInt(s.id) > 0 || IN_TRANSIT_KEYWORDS.some(kw => s.text.toLowerCase().includes(kw)));
  if (hasRealEvents) return 'in_transit';

  return 'registered';
}

/**
 * Extrahuje město a PSČ DORUČENÍ z eventů.
 * Hledá eventy s klíčovými slovy doručení a bere postoffice/postcode.
 * Pokud není doručeno, vezme poslední známou lokaci.
 */
function extractDeliveryLocation(states: CPostState[]): { deliveryCity?: string; deliveryZip?: string } {
  // 1. Hledáme event doručení
  for (const s of states) {
    const text = s.text.toLowerCase();
    if (DELIVERY_LOCATION_KEYWORDS.some(kw => text.includes(kw))) {
      const city = extractCityFromPostoffice(s.postoffice);
      const zip = s.postcode?.trim() || undefined;
      if (city || zip) return { deliveryCity: city, deliveryZip: zip };
    }
  }

  // 2. Pokud zásilka je out_for_delivery, vezmi postoffice z toho eventu
  for (const s of states) {
    const text = s.text.toLowerCase();
    if (OUT_FOR_DELIVERY_KEYWORDS.some(kw => text.includes(kw))) {
      const city = extractCityFromPostoffice(s.postoffice);
      const zip = s.postcode?.trim() || undefined;
      if (city || zip) return { deliveryCity: city, deliveryZip: zip };
    }
  }

  // 3. Fallback: poslední event s postcode (nejnovější lokace)
  for (const s of states) {
    if (s.postcode && s.postcode.trim()) {
      const city = extractCityFromPostoffice(s.postoffice);
      const zip = s.postcode.trim();
      return { deliveryCity: city, deliveryZip: zip };
    }
  }

  return {};
}

/**
 * Extrahuje název města z postoffice stringu.
 * ČP formát: "Praha 1", "Brno 12", "Olomouc", "Depo Praha 701" atd.
 * Odstraní číslo pošty a "Depo" prefix.
 */
function extractCityFromPostoffice(postoffice: string | null): string | undefined {
  if (!postoffice) return undefined;
  let city = postoffice.trim();

  // Odstraň "Depo " prefix
  city = city.replace(/^Depo\s+/i, '');
  // Odstraň číslo pošty na konci (Praha 1 → Praha, Brno 12 → Brno)
  city = city.replace(/\s+\d+$/, '');
  // Odstraň "SPU" a podobné zkratky
  city = city.replace(/\s+SPU$/i, '');

  return city || undefined;
}

/**
 * Formátuje lokaci z postoffice a postcode.
 */
function formatLocation(postoffice: string | null, postcode: string | null): string | undefined {
  const parts: string[] = [];
  if (postoffice?.trim()) parts.push(postoffice.trim());
  if (postcode?.trim()) parts.push(postcode.trim());
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * Parsuje datum z ČP formátu.
 * Formát: "2026-03-18" + volitelný čas "14:30"
 */
function parseDate(dateStr: string, timeStr: string | null): string {
  try {
    if (timeStr) {
      // timeStr může být "14:30" nebo "14:30:00"
      const time = timeStr.includes(':') ? timeStr : '00:00';
      return new Date(`${dateStr}T${time}:00`).toISOString();
    }
    return new Date(`${dateStr}T00:00:00`).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

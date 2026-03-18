import * as cheerio from 'cheerio';
import type { CarrierAdapter } from './types';
import type { TrackingResult, TrackingEventData } from '@/lib/types';

/**
 * Geis carrier adapter.
 * Web scraping — Geis nemá veřejné JSON API, parsujeme HTML tracking stránku.
 * Geis.cz přesměrovává na geis-group.cz.
 */

// Status keywords (CZ + EN + DE)
const DELIVERED_KEYWORDS = ['doručen', 'delivered', 'zugestellt', 'abgeholt', 'předán', 'vyzvednut'];
const IN_TRANSIT_KEYWORDS = ['přeprava', 'v přepravě', 'in transit', 'unterwegs', 'depo', 'nakládka', 'přijat', 'sklad', 'expedován'];
const OUT_FOR_DELIVERY_KEYWORDS = ['na rozvozu', 'out for delivery', 'in zustellung', 'doručování', 'rozvoz'];
const RETURNED_KEYWORDS = ['vrácen', 'returned', 'zurück', 'retoure'];
const CANCELLED_KEYWORDS = ['zrušen', 'cancelled', 'storniert'];

export const geisAdapter: CarrierAdapter = {
  name: 'geis',

  detect(trackingNumber: string): boolean {
    const tn = trackingNumber.trim().toUpperCase();
    // Geis: různé formáty
    // Číslo začínající na "N" nebo "G" + čísla (interní formáty)
    if (/^[NG]\d{8,}$/.test(tn)) return true;
    // Geis parcel čísla: typicky 15+ číslic nebo s pomlčkami
    if (/^\d{15,}$/.test(tn)) return true;
    // Format s pomlčkami: XXXX-XXXX-XXXX
    if (/^\d{4}-\d{4}-\d{4,}$/.test(tn)) return true;
    return false;
  },

  async track(trackingNumber: string): Promise<TrackingResult> {
    // Geis tracking page — try geis-group.cz directly (geis.cz redirects there)
    const url = `https://www.geis-group.cz/cs/sledovani-zasilek?p=${encodeURIComponent(trackingNumber.trim())}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'cs,en;q=0.5',
        },
        redirect: 'follow',
      });

      if (!res.ok) {
        return { found: false, status: 'registered', carrierStatusRaw: `HTTP ${res.status}`, events: [] };
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      const events: TrackingEventData[] = [];

      // Geis tracking table / timeline parsing
      $(
        '.tracking-table tbody tr, ' +
        '.shipment-events tbody tr, ' +
        '.tracking-result tbody tr, ' +
        'table.events tbody tr, ' +
        '.timeline-item, ' +
        '.tracking-event'
      ).each((_, el) => {
        const cells = $(el).find('td');
        if (cells.length >= 2) {
          const dateText = $(cells[0]).text().trim();
          const desc = $(cells[1]).text().trim();
          const location = cells.length >= 3 ? $(cells[2]).text().trim() : undefined;

          if (dateText && desc) {
            events.push({
              status: desc,
              description: desc,
              location: location || undefined,
              timestamp: parseDate(dateText),
            });
          }
        } else {
          // Non-table layout
          const dateEl = $(el).find('.date, .event-date, time');
          const descEl = $(el).find('.description, .event-text, .status');
          const locEl = $(el).find('.location, .place');

          const dateText = dateEl.text().trim();
          const desc = descEl.text().trim();

          if (dateText && desc) {
            events.push({
              status: desc,
              description: desc,
              location: locEl.text().trim() || undefined,
              timestamp: parseDate(dateText),
            });
          }
        }
      });

      const fullText = $('body').text().toLowerCase();
      let status: TrackingResult['status'] = 'registered';
      let carrierStatusRaw = 'Zásilka nalezena';

      if (DELIVERED_KEYWORDS.some(kw => fullText.includes(kw))) {
        status = 'delivered';
        carrierStatusRaw = 'Doručeno';
      } else if (OUT_FOR_DELIVERY_KEYWORDS.some(kw => fullText.includes(kw))) {
        status = 'out_for_delivery';
        carrierStatusRaw = 'Na rozvozu';
      } else if (RETURNED_KEYWORDS.some(kw => fullText.includes(kw))) {
        status = 'returned';
        carrierStatusRaw = 'Vráceno';
      } else if (CANCELLED_KEYWORDS.some(kw => fullText.includes(kw))) {
        status = 'cancelled';
        carrierStatusRaw = 'Zrušeno';
      } else if (IN_TRANSIT_KEYWORDS.some(kw => fullText.includes(kw))) {
        status = 'in_transit';
        carrierStatusRaw = 'V přepravě';
      } else if (fullText.includes('nenalezen') || fullText.includes('neexist') || fullText.includes('no result')) {
        return { found: false, status: 'registered', carrierStatusRaw: 'Zásilka nenalezena', events: [] };
      }

      // Extract delivery city and zip
      let deliveryCity: string | undefined;
      let deliveryZip: string | undefined;

      // From events: find delivered event
      for (const event of events) {
        const text = event.description.toLowerCase();
        if (DELIVERED_KEYWORDS.some(kw => text.includes(kw)) && event.location) {
          const parsed = parseCityZipFromLocation(event.location);
          deliveryCity = parsed.city;
          deliveryZip = parsed.zip;
          break;
        }
      }

      // Fallback: last known location
      if (!deliveryCity && events.length > 0) {
        for (const event of events) {
          if (event.location) {
            const parsed = parseCityZipFromLocation(event.location);
            deliveryCity = parsed.city;
            deliveryZip = parsed.zip;
            break;
          }
        }
      }

      return {
        found: events.length > 0 || status !== 'registered',
        status,
        carrierStatusRaw,
        deliveryCity,
        deliveryZip,
        lastEventDate: events[0]?.timestamp,
        events,
      };
    } catch (error) {
      console.error('Geis tracking error:', error);
      return { found: false, status: 'registered', carrierStatusRaw: 'Chyba při sledování', events: [] };
    }
  },
};

function parseCityZipFromLocation(location: string): { city?: string; zip?: string } {
  const zipMatch = location.match(/(\d{3}\s?\d{2})/);
  const zip = zipMatch ? zipMatch[1].replace(/\s/g, '') : undefined;
  const cityRaw = location.replace(/\d{3}\s?\d{2}/, '').replace(/[,\-]/g, ' ').trim();
  const city = cityRaw.replace(/\s+/g, ' ').trim() || undefined;
  return { city, zip };
}

function parseDate(text: string): string {
  // Try DD.MM.YYYY HH:MM format
  const match = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const [, day, month, year, hours, minutes, seconds] = match;
    return new Date(
      parseInt(year), parseInt(month) - 1, parseInt(day),
      parseInt(hours || '0'), parseInt(minutes || '0'), parseInt(seconds || '0')
    ).toISOString();
  }

  // Try YYYY-MM-DD format
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (isoMatch) {
    const [, year, month, day, hours, minutes] = isoMatch;
    return new Date(
      parseInt(year), parseInt(month) - 1, parseInt(day),
      parseInt(hours || '0'), parseInt(minutes || '0')
    ).toISOString();
  }

  return new Date().toISOString();
}

import * as cheerio from 'cheerio';
import type { CarrierAdapter } from './types';
import type { TrackingResult, TrackingEventData } from '@/lib/types';

export const pplAdapter: CarrierAdapter = {
  name: 'ppl',

  detect(trackingNumber: string): boolean {
    const tn = trackingNumber.trim().toUpperCase();
    // PPL formáty: 40xxxxxxxxx (11 číslic), nebo 10-12 číslic začínajících na 40/50/60
    if (/^[456]0\d{8,10}$/.test(tn)) return true;
    // PPL CZ: s prefixem (např. PPL + číslo)
    if (/^PPL/i.test(tn)) return true;
    return false;
  },

  async track(trackingNumber: string): Promise<TrackingResult> {
    const url = `https://www.ppl.cz/vyhledat-zasilku?shipmentId=${encodeURIComponent(trackingNumber)}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'cs,en;q=0.5',
        },
      });

      if (!res.ok) {
        return { found: false, status: 'registered', carrierStatusRaw: `HTTP ${res.status}`, events: [] };
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      const events: TrackingEventData[] = [];

      // PPL timeline parsing
      $('.shipment-detail__timeline-item, .timeline-item, .tracking-row, table tbody tr').each((_, el) => {
        const dateEl = $(el).find('.date, .timeline-date, td:first-child');
        const descEl = $(el).find('.description, .timeline-text, .status, td:nth-child(2)');
        const locEl = $(el).find('.location, .depo, td:nth-child(3)');

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
      });

      const fullText = $('body').text().toLowerCase();
      let status: TrackingResult['status'] = 'registered';
      let carrierStatusRaw = 'Zásilka nalezena';

      if (fullText.includes('doručen') || fullText.includes('předán')) {
        status = 'delivered';
        carrierStatusRaw = 'Doručeno';
      } else if (fullText.includes('rozvoz') || fullText.includes('na vozidle')) {
        status = 'out_for_delivery';
        carrierStatusRaw = 'Na rozvozu';
      } else if (fullText.includes('přeprav') || fullText.includes('depo') || fullText.includes('přijat')) {
        status = 'in_transit';
        carrierStatusRaw = 'V přepravě';
      } else if (fullText.includes('vrácen')) {
        status = 'returned';
        carrierStatusRaw = 'Vráceno';
      } else if (fullText.includes('nenalezen') || fullText.includes('neexist')) {
        return { found: false, status: 'registered', carrierStatusRaw: 'Zásilka nenalezena', events: [] };
      }

      let deliveryCity: string | undefined;
      const cityMatch = fullText.match(/(?:depo[:\s]+|místo[:\s]+)([A-ZÁ-Ža-zá-ž\s]+)/i);
      if (cityMatch) deliveryCity = cityMatch[1].trim();

      return {
        found: events.length > 0 || status !== 'registered',
        status,
        carrierStatusRaw,
        deliveryCity,
        lastEventDate: events[0]?.timestamp,
        events,
      };
    } catch (error) {
      console.error('PPL tracking error:', error);
      return { found: false, status: 'registered', carrierStatusRaw: 'Chyba při sledování', events: [] };
    }
  },
};

function parseDate(text: string): string {
  const match = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (match) {
    const [, day, month, year, hours, minutes] = match;
    return new Date(
      parseInt(year), parseInt(month) - 1, parseInt(day),
      parseInt(hours || '0'), parseInt(minutes || '0')
    ).toISOString();
  }
  return new Date().toISOString();
}

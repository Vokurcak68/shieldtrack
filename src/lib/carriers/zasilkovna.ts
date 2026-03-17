import * as cheerio from 'cheerio';
import type { CarrierAdapter } from './types';
import type { TrackingResult, TrackingEventData } from '@/lib/types';

export const zasilkovnaAdapter: CarrierAdapter = {
  name: 'zasilkovna',

  detect(trackingNumber: string): boolean {
    const tn = trackingNumber.trim().toUpperCase();
    // Z + 10+ číslic
    return /^Z\d{10,}$/.test(tn);
  },

  async track(trackingNumber: string): Promise<TrackingResult> {
    const url = `https://tracking.packeta.com/cs/?id=${encodeURIComponent(trackingNumber)}`;

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

      // Zásilkovna timeline
      $('.tracking-event, .timeline-event, .event-item, tr.event').each((_, el) => {
        const dateEl = $(el).find('.date, .event-date, td:first-child');
        const descEl = $(el).find('.description, .event-text, td:nth-child(2)');
        const locEl = $(el).find('.location, td:nth-child(3)');

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

      if (fullText.includes('doručen') || fullText.includes('vyzvednut')) {
        status = 'delivered';
        carrierStatusRaw = 'Doručeno / Vyzvednuto';
      } else if (fullText.includes('přeprav') || fullText.includes('odeslán') || fullText.includes('na cestě')) {
        status = 'in_transit';
        carrierStatusRaw = 'V přepravě';
      } else if (fullText.includes('výdejní místo') || fullText.includes('čeká na vyzvednutí')) {
        status = 'out_for_delivery';
        carrierStatusRaw = 'Na výdejním místě';
      } else if (fullText.includes('vrácen')) {
        status = 'returned';
        carrierStatusRaw = 'Vráceno odesílateli';
      } else if (fullText.includes('nenalezen') || fullText.includes('neexist')) {
        return { found: false, status: 'registered', carrierStatusRaw: 'Zásilka nenalezena', events: [] };
      }

      let deliveryCity: string | undefined;
      const cityMatch = fullText.match(/(?:výdejní místo[:\s]+|pobočka[:\s]+)([A-ZÁ-Ža-zá-ž\s,]+)/i);
      if (cityMatch) deliveryCity = cityMatch[1].trim().split(',')[0];

      return {
        found: events.length > 0 || status !== 'registered',
        status,
        carrierStatusRaw,
        deliveryCity,
        lastEventDate: events[0]?.timestamp,
        events,
      };
    } catch (error) {
      console.error('Zásilkovna tracking error:', error);
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

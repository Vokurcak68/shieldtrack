import * as cheerio from 'cheerio';
import type { CarrierAdapter } from './types';
import type { TrackingResult, TrackingEventData } from '@/lib/types';

export const ceskaPostaAdapter: CarrierAdapter = {
  name: 'ceska_posta',

  detect(trackingNumber: string): boolean {
    const tn = trackingNumber.trim().toUpperCase();
    // DR/RR/BA/NX + 9 číslic + CZ (13 znaků)
    if (/^(DR|RR|BA|NX)\d{9}CZ$/.test(tn)) return true;
    // Obecně 13 znaků alfanumerických
    if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(tn)) return true;
    // Čistě numerické ~13 číslic
    if (/^\d{13}$/.test(tn)) return true;
    return false;
  },

  async track(trackingNumber: string): Promise<TrackingResult> {
    const url = `https://www.postaonline.cz/trackandtrace/-/zasilka/cislo/${encodeURIComponent(trackingNumber)}`;

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

      // Parsing tabulky s událostmi
      $('table.table-tracking tbody tr, .timeline-item, .tracking-event').each((_, el) => {
        const cols = $(el).find('td');
        if (cols.length >= 2) {
          const dateText = $(cols[0]).text().trim();
          const desc = $(cols[1]).text().trim();
          const loc = cols.length >= 3 ? $(cols[2]).text().trim() : undefined;

          if (dateText && desc) {
            events.push({
              status: desc,
              description: desc,
              location: loc || undefined,
              timestamp: parseDate(dateText),
            });
          }
        }
      });

      // Určení statusu z textu stránky
      const fullText = $('body').text().toLowerCase();
      let status: TrackingResult['status'] = 'registered';
      let carrierStatusRaw = 'Zásilka nalezena';

      if (fullText.includes('doručen') || fullText.includes('dodán')) {
        status = 'delivered';
        carrierStatusRaw = 'Doručeno';
      } else if (fullText.includes('přeprav') || fullText.includes('podán')) {
        status = 'in_transit';
        carrierStatusRaw = 'V přepravě';
      } else if (fullText.includes('vrácen')) {
        status = 'returned';
        carrierStatusRaw = 'Vráceno';
      } else if (fullText.includes('nebyla nalezena') || fullText.includes('neexistuje')) {
        return { found: false, status: 'registered', carrierStatusRaw: 'Zásilka nenalezena', events: [] };
      }

      // Město doručení
      let deliveryCity: string | undefined;
      const cityMatch = fullText.match(/(?:doručen[ao]?\s+v\s+|místo:\s*|pošta:\s*)([A-ZÁ-Ža-zá-ž\s]+)/i);
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
      console.error('Česká pošta tracking error:', error);
      return { found: false, status: 'registered', carrierStatusRaw: 'Chyba při sledování', events: [] };
    }
  },
};

function parseDate(text: string): string {
  // Pokus o parsing českého formátu data "DD.MM.YYYY HH:MM"
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

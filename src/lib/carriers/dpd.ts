import type { CarrierAdapter } from './types';
import type { TrackingResult, TrackingEventData } from '@/lib/types';

/**
 * DPD carrier adapter.
 * Používá JSON REST API na tracking.dpd.de.
 */

interface DpdScanInfo {
  date: string;       // "20260318"
  time: string;       // "143000"
  scanType: {
    code: string;
    description: string;
  };
  scanData?: {
    location: string;
    facility?: string;
  };
  depot?: string;
  depotName?: string;
}

interface DpdParcelLifeCycleData {
  shipmentInfo?: {
    parcelLabelNumber: string;
    serviceDescription?: string;
    status?: string;
    statusDescription?: string;
    weight?: number;
    weightUnit?: string;
  };
  scanInfo?: {
    scan: DpdScanInfo[];
  };
  statusInfo?: {
    status: string;
    label: string;
    description: string;
    statusHasBeenReached: boolean;
    isCurrentStatus: boolean;
  }[];
}

interface DpdResponse {
  parcellifecycleResponse: {
    parcelLifeCycleData: DpdParcelLifeCycleData | DpdParcelLifeCycleData[] | null;
  };
}

// Status keywords (CZ + EN + DE)
const DELIVERED_KEYWORDS = ['doručen', 'delivered', 'zugestellt', 'abgeholt', 'delivered to', 'pickup'];
const IN_TRANSIT_KEYWORDS = ['přeprava', 'v přepravě', 'in transit', 'unterwegs', 'hub', 'depo', 'transit', 'parcel centre', 'sort'];
const OUT_FOR_DELIVERY_KEYWORDS = ['na rozvozu', 'out for delivery', 'in zustellung', 'delivery'];
const RETURNED_KEYWORDS = ['vrácen', 'returned', 'zurück', 'retoure', 'return'];
const CANCELLED_KEYWORDS = ['zrušen', 'cancelled', 'storniert'];

export const dpdAdapter: CarrierAdapter = {
  name: 'dpd',

  detect(trackingNumber: string): boolean {
    const tn = trackingNumber.trim();
    // DPD: typicky 14 číslic
    return /^\d{14}$/.test(tn);
  },

  async track(trackingNumber: string): Promise<TrackingResult> {
    const url = `https://tracking.dpd.de/rest/plc/cs_CZ/${encodeURIComponent(trackingNumber.trim())}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'cs,en;q=0.5',
        },
      });

      if (!res.ok) {
        return { found: false, status: 'registered', carrierStatusRaw: `HTTP ${res.status}`, events: [] };
      }

      const data: DpdResponse = await res.json();
      const lifeCycleData = data?.parcellifecycleResponse?.parcelLifeCycleData;

      if (!lifeCycleData) {
        return { found: false, status: 'registered', carrierStatusRaw: 'Zásilka nenalezena', events: [] };
      }

      // API může vrátit objekt nebo pole
      const parcel = Array.isArray(lifeCycleData) ? lifeCycleData[0] : lifeCycleData;

      if (!parcel) {
        return { found: false, status: 'registered', carrierStatusRaw: 'Zásilka nenalezena', events: [] };
      }

      // Parsování eventů ze scanInfo
      const scans = parcel.scanInfo?.scan || [];
      const events: TrackingEventData[] = scans.map(scan => {
        const desc = scan.scanType?.description || 'Neznámý stav';
        const location = formatScanLocation(scan);
        return {
          status: desc,
          description: desc,
          location,
          timestamp: parseDpdDate(scan.date, scan.time),
        };
      });

      // Určení statusu
      const status = determineStatus(parcel, events);
      const carrierStatusRaw = deriveCarrierStatusRaw(parcel, events);

      // Extrakce města a PSČ z doručovacího eventu
      const { deliveryCity, deliveryZip } = extractDeliveryLocation(parcel, events);

      return {
        found: true,
        status,
        carrierStatusRaw,
        deliveryCity,
        deliveryZip,
        lastEventDate: events.length > 0 ? events[0].timestamp : undefined,
        events,
      };
    } catch (error) {
      console.error('DPD tracking error:', error);
      return { found: false, status: 'registered', carrierStatusRaw: 'Chyba při sledování', events: [] };
    }
  },
};

function determineStatus(parcel: DpdParcelLifeCycleData, events: TrackingEventData[]): TrackingResult['status'] {
  // Check statusInfo from API first
  if (parcel.statusInfo) {
    for (const si of parcel.statusInfo) {
      if (si.isCurrentStatus) {
        const label = si.label.toLowerCase();
        if (DELIVERED_KEYWORDS.some(kw => label.includes(kw))) return 'delivered';
        if (RETURNED_KEYWORDS.some(kw => label.includes(kw))) return 'returned';
        if (CANCELLED_KEYWORDS.some(kw => label.includes(kw))) return 'cancelled';
        if (OUT_FOR_DELIVERY_KEYWORDS.some(kw => label.includes(kw))) return 'out_for_delivery';
        if (IN_TRANSIT_KEYWORDS.some(kw => label.includes(kw))) return 'in_transit';
      }
    }
  }

  // Fallback: check event descriptions
  for (const event of events) {
    const text = event.description.toLowerCase();
    if (DELIVERED_KEYWORDS.some(kw => text.includes(kw))) return 'delivered';
    if (RETURNED_KEYWORDS.some(kw => text.includes(kw))) return 'returned';
    if (CANCELLED_KEYWORDS.some(kw => text.includes(kw))) return 'cancelled';
    if (OUT_FOR_DELIVERY_KEYWORDS.some(kw => text.includes(kw))) return 'out_for_delivery';
  }

  if (events.length > 0) return 'in_transit';
  return 'registered';
}

function deriveCarrierStatusRaw(parcel: DpdParcelLifeCycleData, events: TrackingEventData[]): string {
  if (parcel.statusInfo) {
    const current = parcel.statusInfo.find(si => si.isCurrentStatus);
    if (current) return current.description || current.label;
  }
  if (events.length > 0) return events[0].description;
  return 'Neznámý stav';
}

function extractDeliveryLocation(
  parcel: DpdParcelLifeCycleData,
  events: TrackingEventData[]
): { deliveryCity?: string; deliveryZip?: string } {
  // Look for delivered event location
  for (const event of events) {
    const text = event.description.toLowerCase();
    if (DELIVERED_KEYWORDS.some(kw => text.includes(kw)) && event.location) {
      return parseCityZipFromLocation(event.location);
    }
  }

  // Fallback: out_for_delivery event
  for (const event of events) {
    const text = event.description.toLowerCase();
    if (OUT_FOR_DELIVERY_KEYWORDS.some(kw => text.includes(kw)) && event.location) {
      return parseCityZipFromLocation(event.location);
    }
  }

  // Fallback: last known location
  for (const event of events) {
    if (event.location) {
      return parseCityZipFromLocation(event.location);
    }
  }

  return {};
}

function parseCityZipFromLocation(location: string): { deliveryCity?: string; deliveryZip?: string } {
  // Try to extract ZIP and city from location string
  const zipMatch = location.match(/(\d{3}\s?\d{2})/);
  const deliveryZip = zipMatch ? zipMatch[1].replace(/\s/g, '') : undefined;

  // City: remove zip and trim
  const cityRaw = location.replace(/\d{3}\s?\d{2}/, '').replace(/[,\-]/g, ' ').trim();
  const deliveryCity = cityRaw.replace(/\s+/g, ' ').trim() || undefined;

  return { deliveryCity, deliveryZip };
}

function formatScanLocation(scan: DpdScanInfo): string | undefined {
  const parts: string[] = [];
  if (scan.scanData?.location) parts.push(scan.scanData.location);
  else if (scan.depotName) parts.push(scan.depotName);
  else if (scan.depot) parts.push(scan.depot);
  if (scan.scanData?.facility && !parts.includes(scan.scanData.facility)) {
    parts.push(scan.scanData.facility);
  }
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function parseDpdDate(dateStr: string, timeStr: string): string {
  try {
    // dateStr: "20260318", timeStr: "143000"
    if (dateStr && dateStr.length === 8) {
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      const hours = timeStr?.substring(0, 2) || '00';
      const minutes = timeStr?.substring(2, 4) || '00';
      const seconds = timeStr?.substring(4, 6) || '00';
      return new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}`).toISOString();
    }
  } catch {
    // fall through
  }
  return new Date().toISOString();
}

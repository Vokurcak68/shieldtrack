// ShieldTrack typy

export type Carrier = 'ceska_posta' | 'zasilkovna' | 'ppl' | 'dpd' | 'gls' | 'balikovna' | 'intime' | 'geis' | 'other';

export type ShipmentStatus = 'registered' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'returned' | 'lost' | 'cancelled';

export type VerificationCheckType = 'tracking_exists' | 'tracking_active' | 'city_match' | 'zip_match' | 'timeline_valid' | 'delivery_confirmed' | 'photo_verified' | 'recipient_name_match';

export type VerificationResultType = 'pass' | 'fail' | 'warning' | 'pending';

export interface Shop {
  id: string;
  user_id: string;
  name: string;
  domain: string | null;
  api_key: string;
  api_secret: string;
  webhook_url: string | null;
  created_at: string;
  is_active: boolean;
}

export interface Shipment {
  id: string;
  shop_id: string;
  external_order_id: string | null;
  tracking_number: string;
  carrier: Carrier;
  sender_name: string | null;
  sender_address: string | null;
  recipient_name: string | null;
  recipient_city: string | null;
  recipient_zip: string | null;
  recipient_address: string | null;
  status: ShipmentStatus;
  carrier_status_raw: string | null;
  verification_score: number;
  verification_details: Record<string, unknown>;
  last_checked_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrackingEvent {
  id: string;
  shipment_id: string;
  status: string;
  description: string | null;
  location: string | null;
  timestamp: string;
  raw_data: Record<string, unknown>;
}

export interface VerificationResult {
  id: string;
  shipment_id: string;
  check_type: VerificationCheckType;
  result: VerificationResultType;
  details: string | null;
  checked_at: string;
}

export interface TrackingResult {
  found: boolean;
  status: ShipmentStatus;
  carrierStatusRaw: string;
  deliveryCity?: string;
  deliveryZip?: string;
  carrierRecipientName?: string;
  lastEventDate?: string;
  trackingUrl?: string;
  events: TrackingEventData[];
}

export interface TrackingEventData {
  status: string;
  description: string;
  location?: string;
  timestamp: string;
}

export interface VerificationCheck {
  type: VerificationCheckType;
  result: VerificationResultType;
  points: number;
  maxPoints: number;
  details: string;
}

export interface VerificationReport {
  score: number;
  status: 'verified' | 'partial' | 'failed' | 'pending';
  checks: VerificationCheck[];
  summary: string;
}

export interface ShopStats {
  totalShipments: number;
  avgScore: number;
  deliveredPercent: number;
  avgDeliveryDays: number;
}

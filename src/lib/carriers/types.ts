import type { TrackingResult } from '@/lib/types';

export interface CarrierAdapter {
  name: string;
  detect(trackingNumber: string): boolean;
  track(trackingNumber: string): Promise<TrackingResult>;
}

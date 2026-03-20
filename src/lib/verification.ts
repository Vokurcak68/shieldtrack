import type {
  Shipment,
  TrackingResult,
  VerificationCheck,
  VerificationCheckType,
  VerificationReport,
  VerificationResultType,
} from './types';

interface CheckConfig {
  type: VerificationCheckType;
  maxPoints: number;
  label: string;
}

const CHECKS: CheckConfig[] = [
  { type: 'tracking_exists', maxPoints: 20, label: 'Tracking číslo existuje' },
  { type: 'tracking_active', maxPoints: 15, label: 'Zásilka je aktivní' },
  { type: 'recipient_name_match', maxPoints: 15, label: 'Shoda jména příjemce' },
  { type: 'city_match', maxPoints: 15, label: 'Shoda města doručení' },
  { type: 'zip_match', maxPoints: 10, label: 'Shoda PSČ' },
  { type: 'timeline_valid', maxPoints: 15, label: 'Platná časová osa' },
  { type: 'delivery_confirmed', maxPoints: 15, label: 'Potvrzení doručení' },
];

/**
 * Provede kompletní verifikaci zásilky.
 */
export function verifyShipment(
  shipment: Shipment,
  trackingResult: TrackingResult | null
): VerificationReport {
  const checks: VerificationCheck[] = [];

  // 1. Tracking exists (20 bodů)
  checks.push(checkTrackingExists(trackingResult));

  // 2. Tracking active (15 bodů)
  checks.push(checkTrackingActive(trackingResult));

  // 3. Recipient name match (15 bodů)
  checks.push(checkRecipientNameMatch(shipment, trackingResult));

  // 4. City match (15 bodů)
  checks.push(checkCityMatch(shipment, trackingResult));

  // 5. ZIP match (10 bodů)
  checks.push(checkZipMatch(shipment, trackingResult));

  // 6. Timeline valid (15 bodů)
  checks.push(checkTimelineValid(shipment, trackingResult));

  // 7. Delivery confirmed (15 bodů)
  checks.push(checkDeliveryConfirmed(trackingResult));

  const score = checks.reduce((sum, c) => sum + c.points, 0);
  const maxScore = checks.reduce((sum, c) => sum + c.maxPoints, 0);

  let status: VerificationReport['status'];
  if (score >= 80) status = 'verified';
  else if (score >= 40) status = 'partial';
  else if (checks.every(c => c.result === 'pending')) status = 'pending';
  else status = 'failed';

  const summary = generateSummary(score, maxScore, status, checks);

  return { score, status, checks, summary };
}

function checkTrackingExists(tracking: TrackingResult | null): VerificationCheck {
  const config = CHECKS[0];
  if (!tracking) {
    return { ...config, result: 'pending', points: 0, details: 'Čeká na kontrolu u přepravce' };
  }
  if (tracking.found) {
    return { ...config, result: 'pass', points: config.maxPoints, details: 'Tracking číslo nalezeno u přepravce' };
  }
  return { ...config, result: 'fail', points: 0, details: 'Tracking číslo nenalezeno' };
}

function checkTrackingActive(tracking: TrackingResult | null): VerificationCheck {
  const config = CHECKS[1];
  if (!tracking || !tracking.found) {
    return { ...config, result: 'pending', points: 0, details: 'Čeká na data od přepravce' };
  }
  if (['in_transit', 'out_for_delivery', 'delivered'].includes(tracking.status)) {
    return { ...config, result: 'pass', points: config.maxPoints, details: 'Zásilka se pohybuje nebo byla doručena' };
  }
  if (tracking.status === 'cancelled' || tracking.status === 'returned') {
    return { ...config, result: 'fail', points: 0, details: 'Zásilka byla stornována nebo vrácena' };
  }
  return { ...config, result: 'warning', points: Math.floor(config.maxPoints / 2), details: 'Zásilka zatím bez pohybu' };
}

function checkRecipientNameMatch(shipment: Shipment, tracking: TrackingResult | null): VerificationCheck {
  const config = CHECKS[2];
  if (!tracking || !tracking.found || !tracking.carrierRecipientName) {
    return { ...config, result: 'pending', points: 0, details: 'Jméno příjemce od přepravce není dostupné' };
  }
  if (!shipment.recipient_name) {
    return { ...config, result: 'warning', points: 0, details: 'Jméno příjemce nebylo zadáno' };
  }

  const expected = normalize(shipment.recipient_name);
  const actual = normalize(tracking.carrierRecipientName);

  // Přesná shoda
  if (expected === actual) {
    return { ...config, result: 'pass', points: config.maxPoints, details: `Jméno příjemce odpovídá: ${tracking.carrierRecipientName}` };
  }

  // Částečná shoda — rozdělit na slova a porovnat
  const expectedParts = expected.split(/\s+/).filter(p => p.length > 1);
  const actualParts = actual.split(/\s+/).filter(p => p.length > 1);
  const matchingParts = expectedParts.filter(ep => actualParts.some(ap => ap === ep || ap.includes(ep) || ep.includes(ap)));

  if (matchingParts.length >= Math.min(expectedParts.length, actualParts.length) && matchingParts.length > 0) {
    // Příjmení se shoduje (nebo jméno v jiném pořadí)
    return { ...config, result: 'pass', points: config.maxPoints, details: `Jméno příjemce odpovídá: ${tracking.carrierRecipientName}` };
  }

  if (matchingParts.length > 0) {
    return { ...config, result: 'warning', points: Math.floor(config.maxPoints / 2), details: `Částečná shoda jména: očekáváno "${shipment.recipient_name}", nalezeno "${tracking.carrierRecipientName}"` };
  }

  return { ...config, result: 'fail', points: 0, details: `Neshodné jméno příjemce: očekáváno "${shipment.recipient_name}", nalezeno "${tracking.carrierRecipientName}"` };
}

function checkCityMatch(shipment: Shipment, tracking: TrackingResult | null): VerificationCheck {
  const config = CHECKS[3];
  if (!tracking || !tracking.found || !tracking.deliveryCity) {
    return { ...config, result: 'pending', points: 0, details: 'Město doručení zatím není dostupné' };
  }
  if (!shipment.recipient_city) {
    return { ...config, result: 'warning', points: 0, details: 'Město příjemce nebylo zadáno' };
  }
  const expected = normalize(shipment.recipient_city);
  const actual = normalize(tracking.deliveryCity);
  if (expected === actual || actual.includes(expected) || expected.includes(actual)) {
    return { ...config, result: 'pass', points: config.maxPoints, details: `Město odpovídá: ${tracking.deliveryCity}` };
  }
  return { ...config, result: 'fail', points: 0, details: `Neshodné město: očekáváno "${shipment.recipient_city}", nalezeno "${tracking.deliveryCity}"` };
}

function checkZipMatch(shipment: Shipment, tracking: TrackingResult | null): VerificationCheck {
  const config = CHECKS[4];
  if (!tracking || !tracking.found || !tracking.deliveryZip) {
    return { ...config, result: 'pending', points: 0, details: 'PSČ doručení zatím není dostupné' };
  }
  if (!shipment.recipient_zip) {
    return { ...config, result: 'warning', points: 0, details: 'PSČ příjemce nebylo zadáno' };
  }
  const expected = shipment.recipient_zip.replace(/\s/g, '');
  const actual = tracking.deliveryZip.replace(/\s/g, '');
  if (expected === actual) {
    return { ...config, result: 'pass', points: config.maxPoints, details: `PSČ odpovídá: ${tracking.deliveryZip}` };
  }
  return { ...config, result: 'fail', points: 0, details: `Neshodné PSČ: očekáváno "${shipment.recipient_zip}", nalezeno "${tracking.deliveryZip}"` };
}

function checkTimelineValid(shipment: Shipment, tracking: TrackingResult | null): VerificationCheck {
  const config = CHECKS[5];
  if (!tracking || !tracking.found || tracking.events.length === 0) {
    return { ...config, result: 'pending', points: 0, details: 'Žádné události k validaci' };
  }

  // Nejstarší event by měl být PO vytvoření zásilky v systému
  const oldestEvent = tracking.events[tracking.events.length - 1];
  const eventDate = new Date(oldestEvent.timestamp);
  const createdDate = new Date(shipment.created_at);

  // Tolerance 24h zpět (zásilka mohla být podána před registrací v systému)
  const toleranceMs = 24 * 60 * 60 * 1000;
  if (eventDate.getTime() >= createdDate.getTime() - toleranceMs) {
    return { ...config, result: 'pass', points: config.maxPoints, details: 'Časová osa je konzistentní' };
  }
  return { ...config, result: 'warning', points: Math.floor(config.maxPoints / 2), details: 'Zásilka podána výrazně před registrací v systému' };
}

function checkDeliveryConfirmed(tracking: TrackingResult | null): VerificationCheck {
  const config = CHECKS[6];
  if (!tracking || !tracking.found) {
    return { ...config, result: 'pending', points: 0, details: 'Čeká na potvrzení doručení' };
  }
  if (tracking.status === 'delivered') {
    return { ...config, result: 'pass', points: config.maxPoints, details: 'Přepravce potvrdil doručení' };
  }
  if (['in_transit', 'out_for_delivery'].includes(tracking.status)) {
    return { ...config, result: 'pending', points: 0, details: 'Zásilka dosud nebyla doručena' };
  }
  return { ...config, result: 'warning', points: 0, details: `Stav zásilky: ${tracking.status}` };
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function generateSummary(
  score: number,
  maxScore: number,
  status: VerificationReport['status'],
  checks: VerificationCheck[]
): string {
  const passed = checks.filter(c => c.result === 'pass').length;
  const failed = checks.filter(c => c.result === 'fail').length;
  const pending = checks.filter(c => c.result === 'pending').length;

  switch (status) {
    case 'verified':
      return `Zásilka úspěšně ověřena se skóre ${score}/${maxScore}. Prošlo ${passed} z ${checks.length} kontrol.`;
    case 'partial':
      return `Zásilka částečně ověřena (${score}/${maxScore}). ${passed} kontrol prošlo, ${failed} selhalo, ${pending} čeká na data.`;
    case 'pending':
      return `Čeká se na data od přepravce. Všechny kontroly jsou ve stavu čekání.`;
    case 'failed':
      return `Verifikace selhala (${score}/${maxScore}). ${failed} kontrol selhalo. Zásilka může být podezřelá.`;
  }
}

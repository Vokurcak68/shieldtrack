-- ShieldTrack - SQL migrace
-- Spustit v Supabase SQL Editoru

-- Enumy
CREATE TYPE st_carrier AS ENUM (
  'ceska_posta', 'zasilkovna', 'ppl', 'dpd', 'gls', 'balikovna', 'intime', 'geis', 'other'
);

CREATE TYPE st_shipment_status AS ENUM (
  'registered', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'lost', 'cancelled'
);

CREATE TYPE st_verification_check AS ENUM (
  'tracking_exists', 'tracking_active', 'city_match', 'zip_match', 'timeline_valid', 'delivery_confirmed', 'photo_verified'
);

CREATE TYPE st_verification_result AS ENUM (
  'pass', 'fail', 'warning', 'pending'
);

-- Shopy (multi-tenant)
CREATE TABLE st_shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  api_key TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  api_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Zásilky
CREATE TABLE st_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES st_shops(id) ON DELETE CASCADE,
  external_order_id TEXT,
  tracking_number TEXT NOT NULL,
  carrier st_carrier NOT NULL DEFAULT 'other',
  sender_name TEXT,
  sender_address TEXT,
  recipient_name TEXT,
  recipient_city TEXT,
  recipient_zip TEXT,
  recipient_address TEXT,
  status st_shipment_status NOT NULL DEFAULT 'registered',
  carrier_status_raw TEXT,
  verification_score INTEGER DEFAULT 0,
  verification_details JSONB DEFAULT '{}',
  last_checked_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tracking eventy
CREATE TABLE st_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES st_shipments(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  description TEXT,
  location TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_data JSONB DEFAULT '{}'
);

-- Verifikační výsledky
CREATE TABLE st_verification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES st_shipments(id) ON DELETE CASCADE,
  check_type st_verification_check NOT NULL,
  result st_verification_result NOT NULL DEFAULT 'pending',
  details TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- API logy
CREATE TABLE st_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES st_shops(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  request_body JSONB,
  response_body JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexy
CREATE INDEX idx_st_shipments_shop_id ON st_shipments(shop_id);
CREATE INDEX idx_st_shipments_tracking ON st_shipments(tracking_number);
CREATE INDEX idx_st_shipments_status ON st_shipments(status);
CREATE INDEX idx_st_shipments_created ON st_shipments(created_at DESC);
CREATE INDEX idx_st_tracking_events_shipment ON st_tracking_events(shipment_id);
CREATE INDEX idx_st_verification_results_shipment ON st_verification_results(shipment_id);
CREATE INDEX idx_st_api_logs_shop ON st_api_logs(shop_id);
CREATE INDEX idx_st_shops_api_key ON st_shops(api_key);
CREATE INDEX idx_st_shops_user_id ON st_shops(user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION st_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER st_shipments_updated_at
  BEFORE UPDATE ON st_shipments
  FOR EACH ROW
  EXECUTE FUNCTION st_update_updated_at();

-- RLS
ALTER TABLE st_shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE st_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE st_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE st_verification_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE st_api_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies pro autentizované uživatele
CREATE POLICY "Users can view own shops" ON st_shops
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own shops" ON st_shops
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shops" ON st_shops
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own shipments" ON st_shipments
  FOR SELECT USING (shop_id IN (SELECT id FROM st_shops WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own shipments" ON st_shipments
  FOR INSERT WITH CHECK (shop_id IN (SELECT id FROM st_shops WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own shipments" ON st_shipments
  FOR UPDATE USING (shop_id IN (SELECT id FROM st_shops WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own tracking events" ON st_tracking_events
  FOR SELECT USING (shipment_id IN (
    SELECT s.id FROM st_shipments s JOIN st_shops sh ON s.shop_id = sh.id WHERE sh.user_id = auth.uid()
  ));

CREATE POLICY "Users can view own verification results" ON st_verification_results
  FOR SELECT USING (shipment_id IN (
    SELECT s.id FROM st_shipments s JOIN st_shops sh ON s.shop_id = sh.id WHERE sh.user_id = auth.uid()
  ));

CREATE POLICY "Users can view own api logs" ON st_api_logs
  FOR SELECT USING (shop_id IN (SELECT id FROM st_shops WHERE user_id = auth.uid()));

-- Service role policies (pro API a cron)
CREATE POLICY "Service can do anything on shops" ON st_shops
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service can do anything on shipments" ON st_shipments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service can do anything on tracking_events" ON st_tracking_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service can do anything on verification_results" ON st_verification_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service can do anything on api_logs" ON st_api_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

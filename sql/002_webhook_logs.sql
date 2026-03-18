-- ShieldTrack - Webhook tabulky
-- Spustit v Supabase SQL Editoru

-- Webhooky (podpora více webhooků na shop)
CREATE TABLE IF NOT EXISTS st_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES st_shops(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{"shipment.created","shipment.updated","shipment.verified"}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhooks_shop ON st_webhooks(shop_id);
CREATE INDEX idx_webhooks_active ON st_webhooks(is_active) WHERE is_active = true;

-- Webhook logy
CREATE TABLE IF NOT EXISTS st_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES st_webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  status_code INTEGER,
  response_body TEXT,
  success BOOLEAN DEFAULT false,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_webhook ON st_webhook_logs(webhook_id);
CREATE INDEX idx_webhook_logs_created ON st_webhook_logs(created_at);

-- RLS
ALTER TABLE st_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE st_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own webhooks" ON st_webhooks
  FOR SELECT USING (shop_id IN (SELECT id FROM st_shops WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage own webhooks" ON st_webhooks
  FOR ALL USING (shop_id IN (SELECT id FROM st_shops WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own webhook logs" ON st_webhook_logs
  FOR SELECT USING (webhook_id IN (
    SELECT w.id FROM st_webhooks w JOIN st_shops s ON w.shop_id = s.id WHERE s.user_id = auth.uid()
  ));

CREATE POLICY "Service can do anything on webhooks" ON st_webhooks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service can do anything on webhook_logs" ON st_webhook_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Migration 20260828040000_push_subscriptions.sql

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  endpoint text NOT NULL UNIQUE,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  label text
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_push_subs" ON push_subscriptions;
DROP POLICY IF EXISTS "anon_insert_push_subs" ON push_subscriptions;
DROP POLICY IF EXISTS "anon_delete_push_subs" ON push_subscriptions;

CREATE POLICY "anon_select_push_subs" ON push_subscriptions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_push_subs" ON push_subscriptions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_delete_push_subs" ON push_subscriptions FOR DELETE TO anon, authenticated USING (true);

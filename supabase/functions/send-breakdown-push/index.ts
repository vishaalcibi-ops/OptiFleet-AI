import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || 'BLuGPt4wJ-yZWz8trafXbjIQRor_CvBiRUOKkc6RqN1yXxFBYkv3O5iKRhe0niqSv8jwKMVH2p4Uar3XXQKUOMM';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '9yuiJy__oyU02u9H6K36Q-XLMQ-1rILZ0IFhQcQzXYs';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@optifleet.ai';

serve(async (req) => {
  try {
    const payload = await req.json();
    const alert = payload.record || payload;

    const lorryId = alert.lorry_id || 'Vehicle';
    const shipmentId = alert.shipment_id || 'Shipment';

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: subscriptions } = await supabase.from('push_subscriptions').select('*');

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: 'No push subscriptions found' }), { status: 200 });
    }

    const pushPayload = JSON.stringify({
      title: '⚠️ Breakdown Reported',
      body: `${lorryId} reported a breakdown — ${shipmentId} returned to queue.`,
      url: '/fleet-map',
    });

    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const res = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              'TTL': '86400',
              'Content-Type': 'application/json',
            },
            body: pushPayload,
          });

          if (res.status === 404 || res.status === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          }

          return { id: sub.id, status: res.status };
        } catch (err) {
          return { id: sub.id, error: String(err) };
        }
      })
    );

    return new Response(JSON.stringify({ success: true, dispatched: results.length, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

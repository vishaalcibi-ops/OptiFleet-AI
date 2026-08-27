import { supabase } from './supabase';

const PUBLIC_VAPID_KEY =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() ||
  'BLuGPt4wJ-yZWz8trafXbjIQRor_CvBiRUOKkc6RqN1yXxFBYkv3O5iKRhe0niqSv8jwKMVH2p4Uar3XXQKUOMM';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration) return false;
    const subscription = await registration.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}

export async function enablePushAlerts(): Promise<{ success: boolean; message: string }> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { success: false, message: 'Push notifications are not supported on this browser/device.' };
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, message: 'Notification permission was denied.' };
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { success: false, message: 'Failed to retrieve push subscription keys.' };
    }

    await supabase.from('push_subscriptions').upsert(
      {
        endpoint: json.endpoint,
        p256dh_key: json.keys.p256dh,
        auth_key: json.keys.auth,
        label: navigator.userAgent.slice(0, 100),
      },
      { onConflict: 'endpoint' }
    );

    return { success: true, message: 'Web Push Notifications successfully enabled for this device!' };
  } catch (err: unknown) {
    console.error('Error enabling push alerts:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'An error occurred while setting up Web Push.',
    };
  }
}

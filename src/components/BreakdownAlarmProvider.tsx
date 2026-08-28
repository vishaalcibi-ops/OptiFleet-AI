import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { AlertOctagon, Volume2, CheckCircle2 } from 'lucide-react';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import type { Lorry, DriverAlert } from '@/types';

interface BreakdownAlarmContextType {
  breakdownLorries: Lorry[];
  activeAlerts: DriverAlert[];
  unresolvedAlertsCount: number;
  acknowledgeBreakdown: (lorryId: string) => Promise<void>;
  isMuted: boolean;
  toggleMute: () => void;
  testSound: () => void;
}

const BreakdownAlarmContext = createContext<BreakdownAlarmContextType>({
  breakdownLorries: [],
  activeAlerts: [],
  unresolvedAlertsCount: 0,
  acknowledgeBreakdown: async () => {},
  isMuted: false,
  toggleMute: () => {},
  testSound: () => {},
});

export const useBreakdownAlarm = () => useContext(BreakdownAlarmContext);

import { SIREN_WAV_DATA_URI } from '@/components/sirenWav';

function getSirenWavUri(): string {
  return SIREN_WAV_DATA_URI;
}

// Global persistent audio context reference unlocked by user click
let globalAudioCtx: AudioContext | null = null;

function getOrCreateAudioContext(): AudioContext | null {
  if (!globalAudioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      globalAudioCtx = new AudioContextClass();
    }
  }
  if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
    void globalAudioCtx.resume();
  }
  return globalAudioCtx;
}

// Dual Engine Alarm Synthesizer: HTML5 Audio + Web Audio API simultaneously
function playSirenBeep() {
  // Engine 1: HTML5 Audio element
  try {
    const wavUri = getSirenWavUri();
    const audio = new Audio(wavUri);
    audio.volume = 1.0;
    void audio.play().catch((e) => console.warn('HTML5 audio play catch:', e));
  } catch (err) {
    console.warn('HTML5 Audio error:', err);
  }

  // Engine 2: Web Audio API Oscillator
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const pulses = [0, 0.25];
    pulses.forEach((delay) => {
      const now = ctx.currentTime + delay;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'square';
      osc1.frequency.setValueAtTime(1400, now);
      osc1.frequency.exponentialRampToValueAtTime(700, now + 0.2);
      gain1.gain.setValueAtTime(1.0, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(1800, now);
      osc2.frequency.exponentialRampToValueAtTime(900, now + 0.2);
      gain2.gain.setValueAtTime(0.7, now);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.23);
      osc2.stop(now + 0.23);
    });
  } catch (err) {
    console.warn('Alarm Web Audio blocked:', err);
  }
}

export function BreakdownAlarmProvider({ children }: { children: ReactNode }) {
  const { lorries, fetchData } = useStore();
  const [breakdownLorries, setBreakdownLorries] = useState<Lorry[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<DriverAlert[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasSubscribedRef = useRef<boolean>(false);

  const triggerSirenSound = () => {
    if (isMuted) return;

    // 1. Play DOM HTML5 Audio element
    if (audioRef.current) {
      try {
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 1.0;
        const promise = audioRef.current.play();
        if (promise !== undefined) {
          promise
            .then(() => console.log('audio played OK'))
            .catch((err) => console.warn('audio play blocked:', err));
        }
      } catch (err) {
        console.warn('audio play blocked:', err);
      }
    }

    // 2. Play Web Audio API synthesizer
    playSirenBeep();
  };

  // A3. Unlock DOM Audio Element & Web Audio API on very first interaction
  useEffect(() => {
    const unlockAudio = () => {
      try {
        if (audioRef.current) {
          audioRef.current.volume = 0.01;
          const promise = audioRef.current.play();
          if (promise !== undefined) {
            promise
              .then(() => {
                audioRef.current?.pause();
                if (audioRef.current) audioRef.current.currentTime = 0;
                setIsAudioUnlocked(true);
              })
              .catch(() => {});
          }
        }

        const ctx = getOrCreateAudioContext();
        if (ctx && ctx.state === 'suspended') {
          void ctx.resume();
        }
      } catch (err) {
        console.warn('Audio unlock attempt error:', err);
      }
    };

    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const lastSeenAlertTimeRef = useRef<number>(0);
  const recentlyAcknowledgedRef = useRef<Set<string>>(new Set());

  // Synchronize breakdown lorries from store & listen to cross-tab BroadcastChannel
  useEffect(() => {
    const initialBreakdowns = lorries.filter((l) => Boolean(l.is_breakdown) || l.status === 'maintenance');
    setBreakdownLorries(initialBreakdowns);

    try {
      const bc = new BroadcastChannel('optifleet_alerts_channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'BREAKDOWN') {
          console.log('BroadcastChannel alert fired', event.data);
          triggerSirenSound();
          void fetchData();
        }
      };
      return () => bc.close();
    } catch {}
  }, [lorries, fetchData]);

  // A2. Global Realtime subscription to driver_alerts & lorries (with duplicate subscribe check)
  useEffect(() => {
    if (!supabaseConfigured) {
      console.log('Supabase not configured or using placeholder; using local BroadcastChannel fallback for alarms.');
      return;
    }

    if (hasSubscribedRef.current) {
      console.warn('BreakdownAlarmProvider: Duplicate realtime subscription attempt blocked.');
      return;
    }
    hasSubscribedRef.current = true;

    // Function to check database for active breakdowns (guaranteed polling fallback)
    const checkActiveBreakdowns = async () => {
      try {
        const [alertsRes, lorriesRes] = await Promise.all([
          supabase.from('driver_alerts').select('*').eq('resolved', false),
          supabase.from('lorries').select('*').or('is_breakdown.eq.true,status.eq.maintenance'),
        ]);

        if (alertsRes.data) {
          const freshAlerts = alertsRes.data as DriverAlert[];
          setActiveAlerts(freshAlerts);

          const maxTime = freshAlerts.reduce((max, a) => {
            const t = new Date(a.created_at || 0).getTime();
            return t > max ? t : max;
          }, 0);

          if (maxTime > 0 && maxTime > lastSeenAlertTimeRef.current) {
            if (lastSeenAlertTimeRef.current > 0) {
              triggerSirenSound();
              void fetchData();
            }
            lastSeenAlertTimeRef.current = maxTime;
          } else if (lastSeenAlertTimeRef.current === 0 && freshAlerts.length > 0) {
            lastSeenAlertTimeRef.current = maxTime || Date.now();
          }
        }

        if (lorriesRes.data) {
          const freshLorries = lorriesRes.data as Lorry[];
          // Filter out lorries that were just acknowledged locally to prevent UI flicker
          const filtered = freshLorries.filter(l => !recentlyAcknowledgedRef.current.has(l.lorry_id));
          setBreakdownLorries(filtered);
        }
      } catch (err) {
        console.warn('Breakdown polling error:', err);
      }
    };

    // Initial fetch + 3-second robust polling timer
    void checkActiveBreakdowns();
    const pollTimer = setInterval(checkActiveBreakdowns, 3000);

    const channel = supabase
      .channel('global-driver-alerts-realtime')
      .on('broadcast', { event: 'breakdown' }, (payload) => {
        console.log('Realtime broadcast breakdown received:', payload);
        triggerSirenSound();
        void fetchData();
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_alerts' },
        (payload) => {
          console.log('driver_alerts postgres_changes fired:', payload);
          triggerSirenSound();
          void fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shipments' },
        () => {
          void fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lorries' },
        (payload) => {
          console.log('lorries postgres_changes fired:', payload);
          const newRow = payload.new as Lorry | undefined;
          if (newRow?.is_breakdown || newRow?.status === 'maintenance') {
            triggerSirenSound();
          }
          void fetchData();
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollTimer);
      supabase.removeChannel(channel);
      hasSubscribedRef.current = false;
    };
  }, [fetchData]);

  // Repeating siren sound every 10s while breakdown list is non-empty and unmuted
  useEffect(() => {
    if (breakdownLorries.length === 0 || isMuted) return;

    triggerSirenSound();

    const interval = setInterval(() => {
      triggerSirenSound();
    }, 10000);

    return () => clearInterval(interval);
  }, [breakdownLorries.length, isMuted]);

  // Acknowledge breakdown action
  const acknowledgeBreakdown = async (lorryId: string) => {
    const now = new Date().toISOString();

    // Mark as recently acknowledged to prevent polling from recreating it immediately
    recentlyAcknowledgedRef.current.add(lorryId);
    setTimeout(() => {
      recentlyAcknowledgedRef.current.delete(lorryId);
    }, 15000); // 15 seconds is plenty of time for DB to sync

    // 1. Apply locally FIRST — always works, even offline / placeholder URL
    useStore.setState((state) => {
      const lorries = state.lorries.map((l) =>
        l.lorry_id === lorryId
          ? {
              ...l,
              is_breakdown: false,
              breakdown_at: null,
              status: 'active' as const,
              driver_available: true,
              assignment_status: 'available' as const,
              current_shipment_id: null,
              updated_at: now,
            }
          : l
      );
      // Persist to localStorage so fetchData won't revert it
      try { localStorage.setItem('optifleet_lorries', JSON.stringify(lorries)); } catch { /* ignore */ }
      return { lorries };
    });

    // 2. Clear alarm UI immediately
    setBreakdownLorries((prev) => prev.filter((l) => l.lorry_id !== lorryId));
    setActiveAlerts((prev) => prev.filter((a) => a.lorry_id !== lorryId));

    // 3. Stop the siren sound
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // 4. Supabase update — best-effort in background
    if (supabaseConfigured) {
      try {
        await Promise.all([
          supabase
            .from('lorries')
            .update({
              status: 'active',
              assignment_status: 'available',
              current_shipment_id: null,
              updated_at: now,
            })
            .eq('lorry_id', lorryId),
          supabase
            .from('driver_alerts')
            .update({ resolved: true })
            .eq('lorry_id', lorryId),
        ]);
      } catch (err) {
        console.warn('Supabase acknowledge failed (local already applied):', err);
      }
    }
  };

  const toggleMute = () => setIsMuted((m) => !m);

  const testSound = () => {
    triggerSirenSound();
  };

  const unresolvedAlertsCount = breakdownLorries.length + activeAlerts.filter((a) => !a.resolved).length;

  return (
    <BreakdownAlarmContext.Provider
      value={{
        breakdownLorries,
        activeAlerts,
        unresolvedAlertsCount,
        acknowledgeBreakdown,
        isMuted,
        toggleMute,
        testSound,
      }}
    >
      {/* Hidden DOM Audio Element for guaranteed hardware audio playback */}
      <audio ref={audioRef} src={getSirenWavUri()} preload="auto" className="hidden" />

      {/* A4. Mandatory Persistent Visual Alert Banner requiring manual acknowledgment */}
      {(breakdownLorries.length > 0 || activeAlerts.some((a) => !a.resolved)) && (
        <aside
          aria-label="Active Breakdown Alert Banner"
          className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-2.5 shadow-2xl flex flex-wrap items-center justify-between gap-3 border-b-2 border-red-800 font-sans"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-full bg-white text-red-600 animate-bounce">
              <AlertOctagon size={20} />
            </div>
            <div>
              <span className="font-extrabold uppercase tracking-wider text-[11px] bg-red-800 px-2 py-0.5 rounded mr-2">
                CRITICAL SOS ALARM
              </span>
              <strong className="text-sm">
                ⚠️ {breakdownLorries.map((l) => l.lorry_id).join(', ') || 'Vehicle'} reported a breakdown — linked shipment returned to queue.
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">

            <button
              onClick={toggleMute}
              className="px-2.5 py-1 text-xs font-semibold bg-red-800 hover:bg-red-900 rounded-lg flex items-center gap-1.5 transition-colors"
              title={isMuted ? 'Unmute siren' : 'Mute siren sound'}
            >
              <Volume2 size={14} className={isMuted ? 'opacity-40 line-through' : ''} />
              {isMuted ? 'Unmute' : 'Mute Sound'}
            </button>

            {breakdownLorries.map((l) => (
              <button
                key={l.lorry_id}
                onClick={() => acknowledgeBreakdown(l.lorry_id)}
                className="px-3 py-1 text-xs font-bold bg-white hover:bg-red-50 text-red-700 rounded-lg shadow-sm flex items-center gap-1 transition-all active:scale-95"
              >
                <CheckCircle2 size={14} />
                Acknowledge {l.lorry_id}
              </button>
            ))}
          </div>
        </aside>
      )}

      <div className={breakdownLorries.length > 0 || activeAlerts.some((a) => !a.resolved) ? 'pt-12' : ''}>
        {children}
      </div>
    </BreakdownAlarmContext.Provider>
  );
}

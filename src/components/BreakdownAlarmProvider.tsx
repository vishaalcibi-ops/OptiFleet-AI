import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { AlertOctagon, Volume2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
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

// Dual-Oscillator Loud Triple-Pulse Piercing Siren Synthesizer
function playSirenBeep() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const pulses = [0, 0.25, 0.5]; // 3 rapid loud siren pulses
    pulses.forEach((delay) => {
      const now = ctx.currentTime + delay;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'square';
      osc1.frequency.setValueAtTime(1400, now);
      osc1.frequency.exponentialRampToValueAtTime(700, now + 0.2);
      gain1.gain.setValueAtTime(1.0, now); // Maximum 100% Volume
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
    console.warn('Alarm audio blocked:', err);
  }
}

export function BreakdownAlarmProvider({ children }: { children: ReactNode }) {
  const { lorries, fetchData } = useStore();
  const [breakdownLorries, setBreakdownLorries] = useState<Lorry[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<DriverAlert[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const isUnlockedRef = useRef<boolean>(false);
  const hasSubscribedRef = useRef<boolean>(false);

  // A3. Standard "Unlock on first interaction" pattern
  useEffect(() => {
    const unlockAudio = () => {
      try {
        if (!audioCtxRef.current) {
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioContextClass) {
            audioCtxRef.current = new AudioContextClass();
          }
        }
        if (audioCtxRef.current) {
          if (audioCtxRef.current.state === 'suspended') {
            void audioCtxRef.current.resume();
          }
          // Play silent 0-volume blip to unlock audio context for session
          const buffer = audioCtxRef.current.createBuffer(1, 1, 22050);
          const source = audioCtxRef.current.createBufferSource();
          source.buffer = buffer;
          source.connect(audioCtxRef.current.destination);
          source.start(0);
          isUnlockedRef.current = true;
        }
      } catch (err) {
        console.warn('Audio unlock attempt caught error:', err);
      }
    };

    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });

    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Synchronize breakdown lorries from store
  useEffect(() => {
    const initialBreakdowns = lorries.filter((l) => Boolean(l.is_breakdown) || l.status === 'maintenance');
    setBreakdownLorries(initialBreakdowns);
  }, [lorries]);

  // A2. Global Realtime subscription to driver_alerts & lorries (with duplicate subscribe check)
  useEffect(() => {
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
          setActiveAlerts((prev) => {
            const fresh = alertsRes.data as DriverAlert[];
            // If new alert found, trigger sound
            if (fresh.length > prev.length) {
              playSirenBeep();
              void fetchData();
            }
            return fresh;
          });
        }

        if (lorriesRes.data) {
          setBreakdownLorries((prev) => {
            const freshLorries = lorriesRes.data as Lorry[];
            if (freshLorries.length > prev.length) {
              playSirenBeep();
              void fetchData();
            }
            return freshLorries;
          });
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
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_alerts' },
        (payload) => {
          const newAlert = payload.new as DriverAlert;
          if (newAlert) {
            setActiveAlerts((prev) => [newAlert, ...prev.filter((a) => a.id !== newAlert.id)]);
            void fetchData();
            playSirenBeep();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lorries' },
        (payload) => {
          const newRow = payload.new as Lorry | undefined;
          if (!newRow || !newRow.lorry_id) return;

          setBreakdownLorries((prev) => {
            if (newRow.is_breakdown || newRow.status === 'maintenance') {
              const existingIndex = prev.findIndex((l) => l.lorry_id === newRow.lorry_id);
              if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = { ...updated[existingIndex], ...newRow };
                return updated;
              }
              playSirenBeep();
              return [newRow, ...prev];
            } else {
              return prev.filter((l) => l.lorry_id !== newRow.lorry_id);
            }
          });
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

    playSirenBeep();

    const interval = setInterval(() => {
      playSirenBeep();
    }, 10000);

    return () => clearInterval(interval);
  }, [breakdownLorries.length, isMuted]);

  // Acknowledge breakdown action
  const acknowledgeBreakdown = async (lorryId: string) => {
    const now = new Date().toISOString();
    try {
      await Promise.all([
        supabase
          .from('lorries')
          .update({
            is_breakdown: false,
            breakdown_at: null,
            status: 'active',
            updated_at: now,
          })
          .eq('lorry_id', lorryId),
        supabase
          .from('driver_alerts')
          .update({ resolved: true })
          .eq('lorry_id', lorryId),
      ]);

      setBreakdownLorries((prev) => prev.filter((l) => l.lorry_id !== lorryId));
      setActiveAlerts((prev) => prev.filter((a) => a.lorry_id !== lorryId));
      void fetchData();
    } catch (err) {
      console.error('Error acknowledging breakdown:', err);
    }
  };

  const toggleMute = () => setIsMuted((m) => !m);

  const testSound = () => {
    playSirenBeep();
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
              onClick={testSound}
              className="px-2.5 py-1 text-xs font-semibold bg-white text-red-700 hover:bg-red-50 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
              title="Test Siren Sound"
            >
              <Volume2 size={14} />
              Test Sound
            </button>
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

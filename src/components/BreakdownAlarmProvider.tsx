import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { AlertOctagon, Volume2, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import type { Lorry } from '@/types';

interface BreakdownAlarmContextType {
  breakdownLorries: Lorry[];
  acknowledgeBreakdown: (lorryId: string) => Promise<void>;
  isMuted: boolean;
  toggleMute: () => void;
  testSound: () => void;
}

const BreakdownAlarmContext = createContext<BreakdownAlarmContextType>({
  breakdownLorries: [],
  acknowledgeBreakdown: async () => {},
  isMuted: false,
  toggleMute: () => {},
  testSound: () => {},
});

export const useBreakdownAlarm = () => useContext(BreakdownAlarmContext);

// Dual-Oscillator Piercing Siren Synthesizer (Maximum Volume Loudness)
function playSirenBeep(audioCtx: AudioContext) {
  try {
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    // Primary High-Loudness Square Wave Oscillator (Piercing Siren)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();

    osc1.type = 'square';
    osc1.frequency.setValueAtTime(1200, now);
    osc1.frequency.exponentialRampToValueAtTime(650, now + 0.45);

    gain1.gain.setValueAtTime(0.85, now); // 85% Volume
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);

    // Harmonic Sawtooth Wave Oscillator (Police Siren Sweep)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(1500, now);
    osc2.frequency.exponentialRampToValueAtTime(800, now + 0.45);

    gain2.gain.setValueAtTime(0.5, now);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);

    osc1.start(now);
    osc2.start(now);

    osc1.stop(now + 0.52);
    osc2.stop(now + 0.52);
  } catch (err) {
    console.warn('Audio Context play error:', err);
  }
}

export function BreakdownAlarmProvider({ children }: { children: ReactNode }) {
  const { lorries } = useStore();
  const [breakdownLorries, setBreakdownLorries] = useState<Lorry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Initialize and resume Web Audio context on user interaction
  useEffect(() => {
    const initAudio = () => {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        void audioCtxRef.current.resume();
      }
    };
    window.addEventListener('click', initAudio);
    window.addEventListener('keydown', initAudio);
    return () => {
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
    };
  }, []);

  // Seed breakdown lorries on initial mount / whenever store lorries update
  useEffect(() => {
    const initialBreakdowns = lorries.filter((l) => Boolean(l.is_breakdown));
    setBreakdownLorries(initialBreakdowns);
  }, [lorries]);

  // Subscribe to real-time Postgres changes on the lorries table
  useEffect(() => {
    const channel = supabase
      .channel('admin-breakdown-alarm')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lorries' },
        (payload) => {
          const newRow = payload.new as Lorry | undefined;
          if (!newRow || !newRow.lorry_id) return;

          setBreakdownLorries((prev) => {
            if (newRow.is_breakdown) {
              const existingIndex = prev.findIndex((l) => l.lorry_id === newRow.lorry_id);
              if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = { ...updated[existingIndex], ...newRow };
                return updated;
              }
              return [newRow, ...prev];
            } else {
              return prev.filter((l) => l.lorry_id !== newRow.lorry_id);
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Repeating audible alarm while breakdown list is non-empty
  useEffect(() => {
    if (breakdownLorries.length === 0 || isMuted) return;

    // Play initial beep
    if (audioCtxRef.current) {
      playSirenBeep(audioCtxRef.current);
    }

    const interval = setInterval(() => {
      if (audioCtxRef.current) {
        playSirenBeep(audioCtxRef.current);
      }
    }, 10000); // Repeat siren alarm every 10 seconds as requested

    return () => clearInterval(interval);
  }, [breakdownLorries.length, isMuted]);

  // Acknowledge breakdown action
  const acknowledgeBreakdown = async (lorryId: string) => {
    const now = new Date().toISOString();
    try {
      await supabase
        .from('lorries')
        .update({
          is_breakdown: false,
          breakdown_at: null,
          updated_at: now,
        })
        .eq('lorry_id', lorryId);

      // Optimistically remove from local state
      setBreakdownLorries((prev) => prev.filter((l) => l.lorry_id !== lorryId));
    } catch (err) {
      console.error('Error acknowledging breakdown:', err);
    }
  };

  const toggleMute = () => setIsMuted((m) => !m);

  const testSound = () => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) audioCtxRef.current = new AudioContextClass();
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.resume();
      playSirenBeep(audioCtxRef.current);
    }
  };

  return (
    <BreakdownAlarmContext.Provider value={{ breakdownLorries, acknowledgeBreakdown, isMuted, toggleMute, testSound }}>
      {/* Persistent Red Alarm Banner fixed to top when breakdowns are active */}
      {breakdownLorries.length > 0 && (
        <aside
          aria-label="Active Breakdown Alert"
          className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-2.5 shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-pulse border-b-2 border-red-700"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded-full bg-white text-red-600 animate-bounce">
              <AlertOctagon size={20} />
            </div>
            <div>
              <span className="font-extrabold uppercase tracking-wider text-xs bg-red-800 px-2 py-0.5 rounded mr-2">
                CRITICAL SOS ALARM
              </span>
              <strong className="text-sm">
                {breakdownLorries.length} Lorry Breakdown Reported:{' '}
                {breakdownLorries.map((l) => l.lorry_id).join(', ')}
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
              className="px-2.5 py-1 text-xs font-semibold bg-red-700 hover:bg-red-800 rounded-lg flex items-center gap-1.5 transition-colors"
              title={isMuted ? 'Unmute siren' : 'Mute siren sound'}
            >
              <Volume2 size={14} className={isMuted ? 'opacity-40 line-through' : ''} />
              {isMuted ? 'Unmute' : 'Mute'}
            </button>

            {breakdownLorries.map((l) => (
              <button
                key={l.lorry_id}
                onClick={() => acknowledgeBreakdown(l.lorry_id)}
                className="px-3 py-1 text-xs font-bold bg-white hover:bg-red-50 text-red-700 rounded-lg shadow-sm flex items-center gap-1 transition-all active:scale-95"
              >
                <CheckCircle size={14} />
                Acknowledge {l.lorry_id}
              </button>
            ))}
          </div>
        </aside>
      )}

      <div className={breakdownLorries.length > 0 ? 'pt-12' : ''}>
        {children}
      </div>
    </BreakdownAlarmContext.Provider>
  );
}

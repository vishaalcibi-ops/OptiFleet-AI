import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Truck,
  Package,
  Gauge,
  Sparkles,
  Map,
  BarChart3,
  History,
  Settings,
  Zap,
  Menu,
  X,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { Dashboard } from '@/pages/Dashboard';
import { FleetManagement } from '@/pages/FleetManagement';
import { ShipmentManagement } from '@/pages/ShipmentManagement';
import { OptimizationResult as OptimizationResultPage } from '@/pages/OptimizationResult';
import { WhatIfSimulator } from '@/pages/WhatIfSimulator';
import { Copilot } from '@/pages/Copilot';
import { FleetMap } from '@/pages/FleetMap';
import { Analytics } from '@/pages/Analytics';
import { AuditLog } from '@/pages/AuditLog';
import { SettingsPage } from '@/pages/SettingsPage';
import { DriverTrack } from '@/pages/DriverTrack';
import { BreakdownAlarmProvider } from '@/components/BreakdownAlarmProvider';

type Page =
  | 'dashboard'
  | 'fleet'
  | 'shipments'
  | 'result'
  | 'whatif'
  | 'copilot'
  | 'map'
  | 'analytics'
  | 'audit'
  | 'settings';

const navItems: { id: Page; label: string; icon: typeof Truck }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'fleet', label: 'Fleet Management', icon: Truck },
  { id: 'shipments', label: 'Shipments', icon: Package },
  { id: 'result', label: 'Optimization Result', icon: Gauge },
  { id: 'whatif', label: 'Scenario Sandbox', icon: Sparkles },
  { id: 'copilot', label: 'AI Copilot', icon: Sparkles },
  { id: 'map', label: 'Fleet Map', icon: Map },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'audit', label: 'Audit Log', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('OptiFleet render error:', error, info); }
  render() {
    if (this.state.error) return <div className="min-h-screen bg-base-950 flex items-center justify-center p-6"><div className="card max-w-xl w-full p-6"><h1 className="text-xl font-bold text-gray-900">OptiFleet AI could not render this page</h1><p className="mt-2 text-sm text-gray-500">A runtime error was caught instead of showing a blank screen.</p><pre className="mt-4 p-3 rounded-lg bg-base-800 text-xs text-error-600 overflow-auto whitespace-pre-wrap">{this.state.error.message}</pre><button className="btn-primary mt-4" onClick={() => window.location.reload()}>Reload application</button></div></div>;
    return this.props.children;
  }
}

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { fetchData, error, setError, currentResult } = useStore();

  // Top-level driver standalone route check (never load alarm on driver phone)
  const path = window.location.pathname;
  const hash = window.location.hash;
  if (path.startsWith('/track/') || hash.startsWith('#/track/')) {
    return <DriverTrack />;
  }

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleNavigate = (p: Page) => {
    setPage(p);
    setSidebarOpen(false);
  };

  const handleOptimize = async () => {
    await useStore.getState().runOptimization({ beforeSummary: true, saveToDb: true });
    setPage('result');
  };

  return (
    <BreakdownAlarmProvider>
      <div className="min-h-screen flex bg-base-950">
      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 app-sidebar flex flex-col z-40 transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 flex items-center px-4 border-b border-base-700">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm bg-gradient-to-br from-accent-500 to-lavender-500">
              <Truck size={19} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-gray-900 leading-tight tracking-tight">OptiFleet AI</h1>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Smart Logistics</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`nav-link ${active ? 'nav-link-active' : ''}`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-base-700">
          <button onClick={handleOptimize} className="btn-primary w-full">
            <Zap size={16} />
            Optimize Fleet
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900/30 backdrop-blur-[2px] z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-20 app-navbar h-16 px-4 lg:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden btn-ghost p-2 rounded-xl"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <h2 className="text-base font-bold text-gray-900">
              {navItems.find((n) => n.id === page)?.label || 'OptiFleet AI'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                try {
                  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                  if (AudioContextClass) {
                    const ctx = new AudioContextClass();
                    void ctx.resume();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(1200, ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.5);
                    gain.gain.setValueAtTime(0.9, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.52);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.55);
                  }
                } catch (e) {
                  console.error('Test sound error:', e);
                }
              }}
              className="px-3 py-1.5 text-xs font-extrabold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md flex items-center gap-1.5 transition-transform active:scale-95 animate-pulse"
              title="Click to test emergency siren sound"
            >
              🔊 TEST SIREN SOUND
            </button>
            {currentResult && (
              <span className="text-xs text-gray-500 hidden sm:inline">
                Last run: {new Date(currentResult.timestamp).toLocaleTimeString()}
              </span>
            )}
            <button onClick={handleOptimize} className="btn-primary text-xs py-2">
              <Zap size={14} />
              Re-Optimize
            </button>
          </div>
        </header>

        {/* Error banner */}
        {error && (
          <div className="bg-error-50 border-b border-error-200 px-4 py-2.5 flex items-center justify-between">
            <p className="text-sm font-medium text-error-600">{error}</p>
            <button onClick={() => setError(null)} className="text-error-400 hover:text-error-600">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">
          {page === 'dashboard' && <Dashboard onNavigate={(p) => handleNavigate(p as Page)} />}
          {page === 'fleet' && <FleetManagement />}
          {page === 'shipments' && <ShipmentManagement />}
          {page === 'result' && <OptimizationResultPage />}
          {page === 'whatif' && <WhatIfSimulator />}
          {page === 'copilot' && <Copilot />}
          {page === 'map' && <FleetMap />}
          {page === 'analytics' && <Analytics />}
          {page === 'audit' && <AuditLog />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
    </BreakdownAlarmProvider>
  );
}

export default function AppWithErrorBoundary() { return <AppErrorBoundary><App /></AppErrorBoundary>; }

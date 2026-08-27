import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, User, Bot } from 'lucide-react';
import { useStore } from '@/lib/store';
import { formatCurrency, formatNumber, formatTime, formatDuration } from '@/components/Badges';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

export function Copilot() {
  const { currentResult, lorries } = useStore();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      content: "Hi! I'm OptiFleet AI Copilot. I can explain the optimization results based on actual calculated data. Ask me why a lorry was selected, why a shipment is unassigned, or about fuel, cost, and deadlines.",
    },
  ]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const answer = (q: string): string => {
    if (!currentResult) {
      return "No optimization has been run yet. Click 'Optimize Fleet' to generate a plan, then I can explain the results.";
    }

    const lower = q.toLowerCase();

    // Why was a lorry selected?
    const lorryMatch = currentResult.plans.find((p) =>
      lower.includes(p.lorry.lorry_id.toLowerCase())
    );
    if (lorryMatch && (lower.includes('select') || lower.includes('why') || lower.includes('chosen'))) {
      const plan = lorryMatch;
      const reasons = [
        `${plan.lorry.lorry_id} was selected because it is the lowest-cost feasible option for its assigned shipments.`,
        `Weight: ${formatNumber(plan.used_weight_kg)}/${formatNumber(plan.lorry.maximum_weight_capacity_kg)} kg (${Math.round((plan.used_weight_kg / plan.lorry.maximum_weight_capacity_kg) * 100)}% utilized).`,
        `Volume: ${formatNumber(plan.used_volume_m3, 1)}/${formatNumber(plan.lorry.maximum_volume_capacity_m3, 1)} m³ (${Math.round((plan.used_volume_m3 / plan.lorry.maximum_volume_capacity_m3) * 100)}% utilized).`,
        `Distance: ${formatNumber(plan.total_distance_km, 1)} km, Fuel: ${formatNumber(plan.total_fuel_litres, 1)} L, Cost: ${formatCurrency(plan.total_cost)}.`,
        `Deadline status: ${plan.worst_deadline_status}.`,
      ];
      if (plan.shipments.length > 1) {
        reasons.push(`Grouped ${plan.shipments.length} shipments (${plan.shipments.map((s) => s.shipment_id).join(', ')}) to reduce total transportation cost.`);
      }
      return reasons.join('\n');
    }

    // Why wasn't a lorry selected?
    const unassignedLorry = lorries.find((l) => lower.includes(l.lorry_id.toLowerCase()));
    if (unassignedLorry && !currentResult.plans.find((p) => p.lorry.lorry_id === unassignedLorry.lorry_id) && (lower.includes('why') || lower.includes('not'))) {
      if (!unassignedLorry.driver_available) {
        return `${unassignedLorry.lorry_id} was not used because its driver is unavailable.`;
      }
      if (unassignedLorry.status !== 'active') {
        return `${unassignedLorry.lorry_id} was not used because it is ${unassignedLorry.status}.`;
      }
      return `${unassignedLorry.lorry_id} was available but not selected because other lorries provided lower-cost feasible options for the current shipment assignments.`;
    }

    // Why is a shipment unassigned?
    const unassigned = currentResult.unassigned.find((u) =>
      lower.includes(u.shipment.shipment_id.toLowerCase())
    );
    if (unassigned && (lower.includes('unassigned') || lower.includes('why') || lower.includes('not assigned'))) {
      const reasons = unassigned.reasons.map((r) => `${r.lorry_id}: ${r.details || r.reason}`);
      return `${unassigned.shipment.shipment_id} is UNASSIGNED because no feasible lorry could carry it:\n${reasons.join('\n')}`;
    }

    // How much fuel?
    if (lower.includes('fuel')) {
      return `The current plan uses ${formatNumber(currentResult.total_fuel_litres, 1)} litres of fuel total.\n${currentResult.plans.map((p) => `${p.lorry.lorry_id}: ${formatNumber(p.total_fuel_litres, 1)} L (${p.lorry.fuel_efficiency_km_per_litre} km/L)`).join('\n')}`;
    }

    // Total cost?
    if (lower.includes('cost') || lower.includes('total')) {
      return `Total transportation cost: ${formatCurrency(currentResult.total_cost)}.\n${currentResult.plans.map((p) => `${p.lorry.lorry_id}: ${formatCurrency(p.total_cost)} (${formatNumber(p.total_distance_km, 1)} km)`).join('\n')}`;
    }

    // What happens if a lorry becomes unavailable?
    if (lower.includes('unavailable') || lower.includes('disable') || lower.includes('what happens') || lower.includes('failure')) {
      return `If a lorry becomes unavailable, its shipments will be re-assigned to other feasible lorries during re-optimization. If no feasible lorry exists, those shipments will become unassigned with detailed compatibility diagnostics. Use the Scenario Sandbox to explore this without modifying live fleet data.`;
    }

    // Which shipment is most urgent?
    if (lower.includes('urgent') || lower.includes('priority')) {
      const allShipments = currentResult.plans.flatMap((p) => p.shipments);
      const urgent = allShipments.filter((s) => s.priority === 'URGENT');
      if (urgent.length > 0) {
        return `There are ${urgent.length} urgent shipment(s): ${urgent.map((s) => s.shipment_id).join(', ')}. These were given higher priority in the optimization based on deadline proximity and priority weight.`;
      }
      return 'No urgent shipments in the current plan.';
    }

    // How to reduce cost?
    if (lower.includes('reduce') || lower.includes('save') || lower.includes('cheaper')) {
      const tips: string[] = [];
      if (currentResult.savings) {
        tips.push(`Optimization already saved ${formatCurrency(currentResult.savings.cost)} compared to naive assignment.`);
      }
      const inefficientLorries = currentResult.plans.filter((p) => p.lorry.fuel_efficiency_km_per_litre < 5);
      if (inefficientLorries.length > 0) {
        tips.push(`Consider using more fuel-efficient lorries. ${inefficientLorries.map((p) => p.lorry.lorry_id).join(', ')} have fuel efficiency below 5 km/L.`);
      }
      const underutilized = currentResult.plans.filter((p) => p.used_weight_kg / p.lorry.maximum_weight_capacity_kg < 0.5);
      if (underutilized.length > 0) {
        tips.push(`Some lorries are underutilized: ${underutilized.map((p) => `${p.lorry.lorry_id} (${Math.round((p.used_weight_kg / p.lorry.maximum_weight_capacity_kg) * 100)}%)`).join(', ')}. Consider grouping more shipments.`);
      }
      tips.push(`Adjust fuel price and cost settings in the Settings page to reflect actual operating costs.`);
      return tips.join('\n');
    }

    // Deadline info
    if (lower.includes('deadline') || lower.includes('eta') || lower.includes('time') || lower.includes('late')) {
      const allSeq = currentResult.plans.flatMap((p) => p.sequence);
      const late = allSeq.filter((ps) => ps.deadline_status === 'LATE');
      const onTime = allSeq.filter((ps) => ps.deadline_status === 'ON_TIME');
      return `On-time: ${onTime.length}/${allSeq.length} shipments.\n${late.length > 0 ? `Late: ${late.map((ps) => ps.shipment.shipment_id).join(', ')}\n` : 'All shipments are on time.\n'}Latest ETA: ${currentResult.plans.reduce((max, p) => p.latest_eta && (!max || p.latest_eta > max) ? p.latest_eta : max, null as Date | null) ? formatTime(currentResult.plans.reduce((max, p) => p.latest_eta && (!max || p.latest_eta > max) ? p.latest_eta : max, null as Date | null)!) : '—'}`;
    }

    // Distance
    if (lower.includes('distance') || lower.includes('route') || lower.includes('km')) {
      return `Total distance: ${formatNumber(currentResult.total_distance_km, 1)} km.\n${currentResult.plans.map((p) => `${p.lorry.lorry_id}: ${formatNumber(p.total_distance_km, 1)} km, ${formatDuration(p.total_travel_time_minutes)}`).join('\n')}`;
    }

    // Capacity
    if (lower.includes('capacity') || lower.includes('weight') || lower.includes('volume')) {
      return currentResult.plans.map((p) =>
        `${p.lorry.lorry_id}: Weight ${formatNumber(p.used_weight_kg)}/${formatNumber(p.lorry.maximum_weight_capacity_kg)} kg, Volume ${formatNumber(p.used_volume_m3, 1)}/${formatNumber(p.lorry.maximum_volume_capacity_m3, 1)} m³`
      ).join('\n');
    }

    // Summary
    if (lower.includes('summary') || lower.includes('overview') || lower.includes('plan')) {
      return `Current optimal plan:\n- ${currentResult.plans.length} lorry(ies) used\n- ${currentResult.assigned_count} shipments assigned, ${currentResult.unassigned_count} unassigned\n- Total cost: ${formatCurrency(currentResult.total_cost)}\n- Total distance: ${formatNumber(currentResult.total_distance_km, 1)} km\n- Total fuel: ${formatNumber(currentResult.total_fuel_litres, 1)} L\n- On-time: ${currentResult.on_time_count}/${currentResult.assigned_count}`;
    }

    return `I can answer questions about:\n- Why a lorry was selected or not selected\n- Why a shipment is unassigned\n- Total fuel, cost, distance\n- Deadlines and ETAs\n- Capacity utilization\n- How to reduce costs\n- Urgent shipments\n\nTry asking: "Why was ${currentResult.plans[0]?.lorry.lorry_id || 'L01'} selected?" or "How much fuel will this plan use?"`;
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: 'user', content: input };
    const aiResponse = answer(input);
    setMessages((prev) => [...prev, userMsg, { role: 'ai', content: aiResponse }]);
    setInput('');
  };

  const suggestedQuestions = [
    `Why was ${currentResult?.plans[0]?.lorry.lorry_id || 'L01'} selected?`,
    'How much fuel will this plan use?',
    'What is the total transportation cost?',
    'Which shipment is most urgent?',
    'How can transportation cost be reduced?',
  ];

  return (
    <div className="space-y-4 animate-fade-in max-w-4xl mx-auto">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <Sparkles size={20} className="text-accent-400" />
          OptiFleet AI Copilot
        </h2>
        <p className="text-sm text-gray-500">
          Ask questions about the optimization results. AI explains actual calculated data — it never invents results.
        </p>
      </div>

      <div className="card flex flex-col h-[60vh]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                msg.role === 'user' ? 'bg-base-700' : 'bg-accent-500/20'
              }`}>
                {msg.role === 'user' ? <User size={16} className="text-gray-400" /> : <Bot size={16} className="text-accent-400" />}
              </div>
              <div className={`rounded-lg p-3 max-w-[80%] ${
                msg.role === 'user' ? 'bg-base-700/50 text-gray-200' : 'bg-base-800/60 text-gray-300'
              }`}>
                <p className="text-sm whitespace-pre-line">{msg.content}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Suggested questions */}
        {messages.length <= 2 && (
          <div className="px-4 pb-2 flex flex-wrap gap-2">
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                onClick={() => { setInput(q); }}
                className="text-xs bg-base-800/60 text-gray-400 rounded-lg px-3 py-1.5 hover:bg-base-700 hover:text-gray-200 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-3 border-t border-base-700/50 flex gap-2">
          <input
            className="input flex-1"
            placeholder="Ask about the optimization plan..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          />
          <button onClick={handleSend} className="btn-primary">
            <Send size={16} />
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-600 text-center">
        AI Copilot uses only actual optimization results. It does not fabricate distances, costs, ETAs, or assignments.
      </p>
    </div>
  );
}

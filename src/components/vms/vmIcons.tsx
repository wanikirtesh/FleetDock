import React from 'react';
import {
  Server, Database, Cloud, Cpu, HardDrive, Globe, Shield, Laptop, Monitor, Router,
  Box, Layers, Terminal, Rocket, Flame, Zap, FlaskConical, Factory, Network, Container,
  LucideIcon,
} from 'lucide-react';

export const VM_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  server: { icon: Server, label: 'Server' },
  database: { icon: Database, label: 'Database' },
  cloud: { icon: Cloud, label: 'Cloud' },
  cpu: { icon: Cpu, label: 'Compute' },
  disk: { icon: HardDrive, label: 'Storage' },
  globe: { icon: Globe, label: 'Web' },
  shield: { icon: Shield, label: 'Security' },
  laptop: { icon: Laptop, label: 'Laptop' },
  monitor: { icon: Monitor, label: 'Desktop' },
  router: { icon: Router, label: 'Edge / Router' },
  box: { icon: Box, label: 'Box' },
  layers: { icon: Layers, label: 'Cluster' },
  terminal: { icon: Terminal, label: 'Terminal' },
  rocket: { icon: Rocket, label: 'Deploy' },
  flame: { icon: Flame, label: 'Hot' },
  zap: { icon: Zap, label: 'Fast' },
  flask: { icon: FlaskConical, label: 'Lab / Test' },
  factory: { icon: Factory, label: 'Production' },
  network: { icon: Network, label: 'Network' },
  container: { icon: Container, label: 'Docker' },
};

export const DEFAULT_VM_ICON = 'server';

/** Renders the icon chosen for a VM host (falls back to the default server icon). */
export const VmIcon: React.FC<{ icon?: string | null; className?: string }> = ({ icon, className = 'w-4 h-4' }) => {
  const Cmp = (icon && VM_ICONS[icon]?.icon) || VM_ICONS[DEFAULT_VM_ICON].icon;
  return <Cmp className={className} />;
};

export const VmIconPicker: React.FC<{ value: string; onChange: (icon: string) => void }> = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-1.5">
    {Object.entries(VM_ICONS).map(([key, { icon: Cmp, label }]) => {
      const active = value === key;
      return (
        <button
          key={key}
          type="button"
          title={label}
          onClick={() => onChange(key)}
          className={`p-2 rounded-lg border transition-colors ${
            active
              ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600'
          }`}
        >
          <Cmp className="w-4 h-4" />
        </button>
      );
    })}
  </div>
);

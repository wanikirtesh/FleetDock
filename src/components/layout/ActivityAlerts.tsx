import React from 'react';
import { X, CheckCircle2, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { useFleet } from '../../context/FleetContext';

export const ActivityAlerts: React.FC = () => {
  const { alerts, dismissAlert } = useFleet();

  if (alerts.length === 0) return null;

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />;
      default:
        return <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />;
    }
  };

  const getAlertBorder = (type: string) => {
    switch (type) {
      case 'success':
        return 'border-emerald-500/40 bg-slate-900/95';
      case 'warning':
        return 'border-amber-500/40 bg-slate-900/95';
      case 'error':
        return 'border-rose-500/40 bg-slate-900/95';
      default:
        return 'border-cyan-500/40 bg-slate-900/95';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`pointer-events-auto p-3 rounded-xl border shadow-xl backdrop-blur-md flex items-start gap-3 transition-all animate-slideUp ${getAlertBorder(
            alert.type
          )}`}
        >
          {getAlertIcon(alert.type)}
          <div className="flex-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-100">{alert.title}</span>
              <span className="text-[10px] text-slate-500 font-mono">{alert.timestamp}</span>
            </div>
            <p className="text-slate-300 mt-0.5 text-[11px] leading-relaxed">
              {alert.message}
            </p>
          </div>
          <button
            onClick={() => dismissAlert(alert.id)}
            className="text-slate-500 hover:text-slate-300 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};

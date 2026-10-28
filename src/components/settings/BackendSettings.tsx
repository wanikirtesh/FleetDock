import React, { useState } from 'react';
import { Database, RefreshCw, UploadCloud, Plus } from 'lucide-react';
import { useFleet } from '../../context/FleetContext';

export const BackendSettings: React.FC = () => {
  const {
    vms,
    backendUrl,
    isBackendConnected,
    isSyncing,
    backendEngineInfo,
    connectToBackend,
    seedBackendDatabase,
    dataSource,
    setDataSource,
    setIsAddVmModalOpen,
  } = useFleet();

  const [customBackendUrl, setCustomBackendUrl] = useState(backendUrl || 'http://localhost:8080');

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-base font-bold text-slate-100">Backend Settings</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Connection to the FleetDock backend service that manages your VMs and containers.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4 text-xs">
        <div className="flex items-center gap-2.5">
          <span className={`w-3 h-3 rounded-full ${isBackendConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          <div>
            <span className="font-semibold text-slate-200">
              Status:{' '}
              <span className={isBackendConnected ? 'text-emerald-400' : 'text-amber-400'}>
                {isBackendConnected ? 'Connected' : 'Offline (demo data)'}
              </span>
            </span>
            <span className="text-slate-400 font-mono text-[11px] ml-2">
              {backendEngineInfo} • {vms.length} hosts
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customBackendUrl}
            onChange={(e) => setCustomBackendUrl(e.target.value)}
            placeholder="http://localhost:8080"
            className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500 w-full md:w-72"
          />
          <button
            onClick={() => connectToBackend(customBackendUrl.trim())}
            disabled={isSyncing}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Connecting...' : 'Connect & Sync'}</span>
          </button>
        </div>

        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-400">
            <Database className="w-4 h-4 text-cyan-400" />
            <span>
              Data source: <strong className="text-slate-200">{dataSource === 'spring_boot' ? 'Backend' : 'In-memory demo'}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => seedBackendDatabase()}
              disabled={isSyncing}
              className="px-2.5 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Seed demo hosts</span>
            </button>
            <button
              onClick={() => setIsAddVmModalOpen(true)}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-cyan-400" />
              <span>Register VM</span>
            </button>
            <button
              onClick={() => setDataSource(dataSource === 'spring_boot' ? 'mock' : 'spring_boot')}
              className="px-2.5 py-1 rounded text-slate-400 hover:text-slate-200 underline text-[11px]"
            >
              Switch to {dataSource === 'spring_boot' ? 'demo mode' : 'live mode'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

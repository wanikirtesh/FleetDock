import React from 'react';
import { 
  Server, 
  Boxes, 
  Plus, 
  RefreshCw, 
  ShieldCheck, 
  Terminal, 
  Code2, 
  RotateCcw,
  Activity,
  Layers,
  Database,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { ThemeToggle } from './ThemeToggle';

export const Header: React.FC = () => {
  const { 
    vms, 
    selectedVmId, 
    setSelectedVmId, 
    clusterStats, 
    setIsAddVmModalOpen, 
    setIsDeployModalOpen,
    setActiveTab,
    resetToSampleData,
    isBackendConnected,
    isSyncing,
    fetchFromBackend,
    seedBackendDatabase
  } = useFleet();

  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/20">
            <Boxes className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                FleetDock
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded">
                v2.5
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Multi-VM & Container Orchestration Hub
            </p>
          </div>
        </div>

        {/* VM Selector Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-800/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-sm">
            <Server className="w-4 h-4 text-cyan-400 mr-2 shrink-0" />
            <span className="text-xs text-slate-400 mr-2 hidden md:inline">Target Host:</span>
            <select
              value={selectedVmId}
              onChange={(e) => setSelectedVmId(e.target.value)}
              className="bg-transparent text-slate-200 text-xs md:text-sm font-medium focus:outline-none cursor-pointer pr-2"
            >
              <option value="all" className="bg-slate-900 text-white">
                🌐 All Registered VMs ({vms.length} Nodes)
              </option>
              {vms.map((vm) => (
                <option key={vm.id} value={vm.id} className="bg-slate-900 text-white">
                  {vm.status === 'online' ? '🟢' : '🔴'} {vm.name} ({vm.ip}) - {vm.environment}
                </option>
              ))}
            </select>
          </div>

          {/* Spring Boot Live DB Status Badge */}
          <button
            onClick={() => setActiveTab('spring_boot')}
            className={`hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono border transition-colors ${
              isBackendConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
            }`}
            title="Click to view Spring Boot backend connection details"
          >
            <Database className="w-3.5 h-3.5" />
            <span>
              {isBackendConnected ? 'Spring Boot DB Connected' : 'Demo / Standalone'}
            </span>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          
          {/* Refresh / Sync DB button */}
          <button
            onClick={() => fetchFromBackend()}
            disabled={isSyncing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
            title="Sync latest data from Spring Boot REST API"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          {/* Spring Boot Java Code Center */}
          <button
            onClick={() => setActiveTab('spring_boot')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 transition-colors shadow-sm"
            title="Explore Spring Boot 3 Java Backend Architecture & Code"
          >
            <Code2 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Spring Boot API</span>
          </button>

          {/* Add Container */}
          <button
            onClick={() => setIsDeployModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm shadow-emerald-900/30"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Deploy Container</span>
          </button>

          {/* Add VM */}
          <button
            onClick={() => setIsAddVmModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors shadow-sm shadow-cyan-900/30"
          >
            <Server className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Register VM</span>
          </button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Reset Demo Button */}
          <button
            onClick={resetToSampleData}
            title="Reset to Sample Demo State"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

      </div>
    </header>
  );
};

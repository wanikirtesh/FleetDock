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
  AlertTriangle,
  User,
  LogOut
} from 'lucide-react';
import { useFleet, GROUP_PREFIX } from '../../context/FleetContext';
import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '../../context/AuthContext';

export const Header: React.FC = () => {
  const { 
    vms, 
    selectedVmId, 
    setSelectedVmId, 
    clusterStats, 
    setIsAddVmModalOpen, 
    setIsDeployModalOpen,
    setActiveTab,
    isBackendConnected,
    isSyncing,
    fetchFromBackend,
    seedBackendDatabase
  } = useFleet();
  const { user, logout } = useAuth();

  const environmentGroups = Array.from(new Set(vms.map((v) => v.environment))).sort();
  const tagGroups = Array.from(new Set(vms.flatMap((v) => v.tags || []))).sort();

  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-slate-100">
      <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="fd-logo-icon w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/20">
            <Boxes className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="fd-brand-text font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                FleetDock
              </span>
              <span className="sidebar-badge-emerald px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded">
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
              <optgroup label="Groups (Environment)" className="bg-slate-900 text-white">
                {environmentGroups.map((env) => (
                  <option key={env} value={`${GROUP_PREFIX}env:${env}`} className="bg-slate-900 text-white">
                    📁 {env} ({vms.filter((v) => v.environment === env).length} VMs)
                  </option>
                ))}
              </optgroup>
              {tagGroups.length > 0 && (
                <optgroup label="Groups (Label)" className="bg-slate-900 text-white">
                  {tagGroups.map((tag) => (
                    <option key={tag} value={`${GROUP_PREFIX}tag:${tag}`} className="bg-slate-900 text-white">
                      🏷️ {tag} ({vms.filter((v) => v.tags?.includes(tag)).length} VMs)
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Hosts" className="bg-slate-900 text-white">
                {vms.map((vm) => (
                  <option key={vm.id} value={vm.id} className="bg-slate-900 text-white">
                    {vm.status === 'online' ? '🟢' : '🔴'} {vm.name} ({vm.ip}) - {vm.environment}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Backend status badge */}
          <button
            onClick={() => setActiveTab('settings')}
            className={`hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono border transition-colors ${
              isBackendConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 hdr-badge-connected'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 hdr-badge-disconnected'
            }`}
            title="Backend connection settings"
          >
            <Database className="w-3.5 h-3.5" />
            <span>
              {isBackendConnected ? 'Backend Connected' : 'Offline (demo)'}
            </span>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          
          {/* Refresh / Sync DB button */}
          <button
            onClick={() => fetchFromBackend()}
            disabled={isSyncing}
            className="btn-icon-muted p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
            title="Sync latest data from the backend"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          {/* Add Container */}
          <button
            onClick={() => setIsDeployModalOpen(true)}
            className="btn-primary-emerald flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm shadow-emerald-900/30"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Deploy Container</span>
          </button>

          {/* Add VM */}
          <button
            onClick={() => setIsAddVmModalOpen(true)}
            className="btn-primary-cyan flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors shadow-sm shadow-cyan-900/30"
          >
            <Server className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Register VM</span>
          </button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Signed-in user */}
          <div className="flex items-center gap-1.5 pl-2 ml-1 border-l border-slate-800">
            <User className="w-4 h-4 text-slate-400" />
            <span className="hidden md:inline text-xs text-slate-300 max-w-[7rem] truncate">{user?.username}</span>
            <button
              onClick={logout}
              title="Sign out"
              className="btn-icon-muted p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>
    </header>
  );
};

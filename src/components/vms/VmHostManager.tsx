import React, { useState } from 'react';
import { 
  Server, 
  Plus, 
  RotateCw, 
  Trash2, 
  ShieldCheck, 
  Key, 
  Lock, 
  Terminal, 
  HardDrive, 
  Cpu, 
  Boxes,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Edit3,
  Activity,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { VMHost, AuthType } from '../../types';
import { VmMetricsPanel } from './VmMetricsPanel';

export const VmHostManager: React.FC = () => {
  const { 
    vms, 
    containers, 
    setSelectedVmId, 
    setActiveTab, 
    setIsAddVmModalOpen, 
    openEditVmModal,
    deleteVm, 
    testVmConnection,
    isBackendConnected,
  } = useFleet();

  const [testingId, setTestingId] = useState<string | null>(null);
  const [expandedMetricsId, setExpandedMetricsId] = useState<string | null>(null);

  const toggleMetrics = (id: string) => {
    setExpandedMetricsId((prev) => (prev === id ? null : id));
  };

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    await testVmConnection(id);
    setTestingId(null);
  };

  const getAuthIcon = (authType: AuthType) => {
    switch (authType) {
      case 'ssh_key':
        return <Key className="w-3.5 h-3.5 text-cyan-400" />;
      case 'password':
        return <Lock className="w-3.5 h-3.5 text-amber-400" />;
      case 'docker_socket':
        return <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />;
      case 'agent_token':
        return <Terminal className="w-3.5 h-3.5 text-indigo-400" />;
    }
  };

  const getEnvBadge = (env: VMHost['environment']) => {
    switch (env) {
      case 'Production':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'Staging':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'Edge':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      default:
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <div className="space-y-4">
      
      {/* Header bar */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <span>Registered VM Nodes & Docker Daemons</span>
          </h2>
          <p className="text-xs text-slate-400">
            Manage networked virtual machines, credentials, SSH certificates, and Docker engine sockets.
          </p>
        </div>

        <button
          onClick={() => setIsAddVmModalOpen(true)}
          className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm shadow-cyan-900/40"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Register New VM</span>
        </button>
      </div>

      {/* VM List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {vms.map((vm) => {
          const hostContainers = containers.filter((c) => c.vmId === vm.id);
          const runningCount = hostContainers.filter((c) => c.state === 'running').length;
          const isTesting = testingId === vm.id;

          return (
            <div
              key={vm.id}
              className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 shadow-sm relative overflow-hidden"
            >
              {/* Top Row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700">
                    <Server className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-100">{vm.name}</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${getEnvBadge(vm.environment)}`}>
                        {vm.environment}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mt-0.5">
                      <Globe className="w-3 h-3 text-slate-500" />
                      <span>{vm.ip}:{vm.port}</span>
                      <span>•</span>
                      <span>{vm.os}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online ({vm.pingMs}ms)
                  </span>

                  <button
                    onClick={() => openEditVmModal(vm)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700 text-xs flex items-center gap-1 transition-colors"
                    title="Edit VM configuration & credentials"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="hidden sm:inline text-[11px] font-medium">Edit</span>
                  </button>
                </div>
              </div>

              {/* Protocol & Specs bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg bg-slate-950/70 border border-slate-800/80 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Auth Protocol</span>
                  <div className="flex items-center gap-1.5 text-slate-300 mt-0.5">
                    {getAuthIcon(vm.authType)}
                    <span className="uppercase text-[11px]">{vm.authType.replace('_', ' ')}</span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Docker Engine</span>
                  <span className="text-slate-300 truncate block mt-0.5 text-[11px]">{vm.dockerVersion}</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Hardware Compute</span>
                  <span className="text-slate-300 block mt-0.5 text-[11px]">
                    {vm.cpuCores} Cores • {vm.memoryGb} GB
                  </span>
                </div>
              </div>

              {/* Resource meters */}
              <div className="space-y-2 text-xs">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>CPU Load ({vm.cpuUsagePercent}%)</span>
                    <span className="font-mono text-slate-300">{vm.cpuCores} vCPUs active</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-cyan-400 h-full rounded-full" style={{ width: `${vm.cpuUsagePercent}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Memory Allocation ({vm.memoryUsedPercent}%)</span>
                    <span className="font-mono text-slate-300">{Math.round((vm.memoryGb * vm.memoryUsedPercent) / 100)} / {vm.memoryGb} GB</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${vm.memoryUsedPercent}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Disk Storage ({vm.diskUsedPercent}%)</span>
                    <span className="font-mono text-slate-300">{Math.round((vm.diskGb * vm.diskUsedPercent) / 100)} / {vm.diskGb} GB</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-purple-400 h-full rounded-full" style={{ width: `${vm.diskUsedPercent}%` }} />
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {vm.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                    #{t}
                  </span>
                ))}
              </div>

              {/* Real-time Metrics (expandable) */}
              {expandedMetricsId === vm.id && (
                <div className="border-t border-slate-800/60 pt-3 mt-1">
                  <VmMetricsPanel vm={vm} isBackendConnected={isBackendConnected} />
                </div>
              )}

              {/* Actions Footer */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <button
                  onClick={() => {
                    setSelectedVmId(vm.id);
                    setActiveTab('containers');
                  }}
                  className="text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Boxes className="w-3.5 h-3.5" />
                  <span>View Containers ({runningCount}/{hostContainers.length} Up)</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleMetrics(vm.id)}
                    className={`px-2.5 py-1 rounded border flex items-center gap-1 transition-colors text-xs ${
                      expandedMetricsId === vm.id
                        ? 'bg-cyan-950/60 border-cyan-700/50 text-cyan-300'
                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750 hover:text-cyan-300'
                    }`}
                    title="Toggle real-time CPU & memory metrics"
                  >
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Live Metrics</span>
                    {expandedMetricsId === vm.id
                      ? <ChevronUp className="w-3 h-3" />
                      : <ChevronDown className="w-3 h-3" />}
                  </button>

                  <button
                    onClick={() => openEditVmModal(vm)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors text-xs"
                    title="Edit VM configuration"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => handleTestConnection(vm.id)}
                    disabled={isTesting}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors disabled:opacity-50 text-xs"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>{isTesting ? 'Pinging...' : 'Test Handshake'}</span>
                  </button>

                  <button
                    onClick={() => {
                      if (confirm(`Remove VM host '${vm.name}' and all associated container tracking?`)) {
                        deleteVm(vm.id);
                      }
                    }}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                    title="Delete VM"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};

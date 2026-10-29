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
  Boxes,
  Edit3,
  Activity
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { fmtPct } from '../../utils/format';
import { useSort, SortTh } from '../../utils/useSort';
import { VMHost, AuthType } from '../../types';
import { VmMetricsPanel } from './VmMetricsPanel';
import { VmCommandPanel } from './VmCommandPanel';

const COLUMN_COUNT = 8;

const UsageBar: React.FC<{ label: string; value: number; color: string; text: string }> = ({ label, value, color, text }) => (
  <div className="flex items-center gap-2">
    <span className="w-8 text-[10px] text-slate-500 uppercase">{label}</span>
    <div className="w-20 bg-slate-800 h-1.5 rounded-full overflow-hidden">
      <div className={`${color} h-full rounded-full`} style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
    </div>
    <span className="text-[11px] text-slate-300 w-12">{text}</span>
  </div>
);

export const VmHostManager: React.FC = () => {
  const { 
    vms, 
    containers, 
    isInScope,
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
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const scopedVms = vms.filter((vm) => isInScope(vm.id));
  const { sorted: sortedVms, sort, toggle: toggleSort } = useSort(scopedVms, {
    host: (vm) => vm.name,
    status: (vm) => vm.status,
    auth: (vm) => vm.authType,
    docker: (vm) => vm.dockerVersion,
    compute: (vm) => vm.cpuCores,
    usage: (vm) => vm.cpuUsagePercent,
    tags: (vm) => (vm.tags || []).join(','),
  });

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

      {/* VM Table */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px] uppercase">
              <tr>
                <SortTh label="Host" sortKey="host" sort={sort} onToggle={toggleSort} className="py-3 px-4" />
                <SortTh label="Status" sortKey="status" sort={sort} onToggle={toggleSort} className="py-3 px-4" />
                <SortTh label="Auth" sortKey="auth" sort={sort} onToggle={toggleSort} className="py-3 px-4" />
                <SortTh label="Docker" sortKey="docker" sort={sort} onToggle={toggleSort} className="py-3 px-4" />
                <SortTh label="Compute" sortKey="compute" sort={sort} onToggle={toggleSort} className="py-3 px-4" />
                <SortTh label="Usage" sortKey="usage" sort={sort} onToggle={toggleSort} className="py-3 px-4" />
                <SortTh label="Tags" sortKey="tags" sort={sort} onToggle={toggleSort} className="py-3 px-4" />
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {sortedVms.map((vm) => {
                const hostContainers = containers.filter((c) => c.vmId === vm.id);
                const runningCount = hostContainers.filter((c) => c.state === 'running').length;
                const isTesting = testingId === vm.id;
                const metricsOpen = expandedMetricsId === vm.id;
                const terminalOpen = terminalId === vm.id;

                return (
                  <React.Fragment key={vm.id}>
                    <tr className="hover:bg-slate-850/60 transition-colors align-top">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100">{vm.name}</span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${getEnvBadge(vm.environment)}`}>
                            {vm.environment}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-400 mt-0.5">
                          {vm.ip}:{vm.port} • {vm.os}
                        </div>
                        <button
                          onClick={() => {
                            setSelectedVmId(vm.id);
                            setActiveTab('containers');
                          }}
                          className="mt-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 transition-colors"
                        >
                          <Boxes className="w-3 h-3" />
                          <span>Containers ({runningCount}/{hostContainers.length} Up)</span>
                        </button>
                      </td>

                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Online ({vm.pingMs}ms)
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase whitespace-nowrap">
                          {getAuthIcon(vm.authType)}
                          <span>{vm.authType.replace('_', ' ')}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap">{vm.dockerVersion}</td>

                      <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap">
                        {vm.cpuCores} Cores • {vm.memoryGb} GB RAM
                        <div className="text-slate-500">{vm.diskGb} GB Disk</div>
                      </td>

                      <td className="py-3 px-4 font-mono space-y-1">
                        <UsageBar label="CPU" value={vm.cpuUsagePercent} color="bg-cyan-400" text={fmtPct(vm.cpuUsagePercent)} />
                        <UsageBar label="Mem" value={vm.memoryUsedPercent} color="bg-emerald-400" text={fmtPct(vm.memoryUsedPercent)} />
                        <UsageBar
                          label="Disk"
                          value={vm.diskMetricsAvailable === false ? 0 : vm.diskUsedPercent}
                          color="bg-purple-400"
                          text={vm.diskMetricsAvailable === false ? 'N/A' : fmtPct(vm.diskUsedPercent)}
                        />
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1 max-w-[12rem]">
                          {vm.tags.map((t) => (
                            <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                              #{t}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setExpandedMetricsId((prev) => (prev === vm.id ? null : vm.id))}
                            className={`p-1.5 rounded border transition-colors ${
                              metricsOpen
                                ? 'bg-cyan-950/60 border-cyan-700/50 text-cyan-300'
                                : 'bg-slate-800 border-slate-700 text-cyan-400 hover:bg-slate-700'
                            }`}
                            title="Toggle real-time CPU & memory metrics"
                          >
                            <Activity className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setTerminalId((prev) => (prev === vm.id ? null : vm.id))}
                            className={`p-1.5 rounded border transition-colors ${
                              terminalOpen
                                ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300'
                                : 'bg-slate-800 border-slate-700 text-emerald-400 hover:bg-slate-700'
                            }`}
                            title="Run shell commands on this VM"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => openEditVmModal(vm)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 transition-colors"
                            title="Edit VM configuration & credentials"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleTestConnection(vm.id)}
                            disabled={isTesting}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
                            title="Test handshake"
                          >
                            <RotateCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-cyan-400' : ''}`} />
                          </button>

                          <button
                            onClick={() => {
                              if (confirm(`Remove VM host '${vm.name}' and all associated container tracking?`)) {
                                deleteVm(vm.id);
                              }
                            }}
                            className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                            title="Delete VM"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {(metricsOpen || terminalOpen) && (
                      <tr className="bg-slate-950/40">
                        <td colSpan={COLUMN_COUNT} className="px-4 py-3 space-y-3">
                          {metricsOpen && <VmMetricsPanel vm={vm} isBackendConnected={isBackendConnected} />}
                          {terminalOpen && <VmCommandPanel vm={vm} isBackendConnected={isBackendConnected} />}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {scopedVms.length === 0 && (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="py-10 text-center text-sm text-slate-400">
                    No VM hosts found for the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

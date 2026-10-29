import React from 'react';
import { 
  Server, 
  Boxes, 
  Activity, 
  Cpu, 
  HardDrive, 
  Zap, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ExternalLink,
  Shield,
  Layers,
  Play,
  RotateCw,
  Plus,
  Edit3
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { fmtPct } from '../../utils/format';
import { VMHost } from '../../types';

export const ClusterOverview: React.FC = () => {
  const { 
    vms, 
    containers, 
    composeStacks, 
    clusterStats, 
    setSelectedVmId, 
    setActiveTab, 
    setIsAddVmModalOpen,
    openEditVmModal,
    setIsDeployModalOpen,
    testVmConnection 
  } = useFleet();

  const [testingId, setTestingId] = React.useState<string | null>(null);

  const handleTest = async (vmId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTestingId(vmId);
    await testVmConnection(vmId);
    setTestingId(null);
  };

  const getEnvBadgeColor = (env: VMHost['environment']) => {
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

  const getAuthBadge = (authType: VMHost['authType']) => {
    switch (authType) {
      case 'ssh_key':
        return 'SSH Private Key';
      case 'docker_socket':
        return 'Docker TLS Socket';
      case 'agent_token':
        return 'FleetDock Agent';
      case 'password':
        return 'SSH Password';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Quick Cluster Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1: Registered Hosts */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Registered Nodes</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-slate-100">{clusterStats.onlineVms}</span>
              <span className="text-xs text-slate-500">/ {clusterStats.totalVms} total</span>
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              <span>100% network connectivity</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Server className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 2: Containers Status */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Containers Orchestrated</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-emerald-400">{clusterStats.runningContainers}</span>
              <span className="text-xs text-slate-500">running ({clusterStats.stoppedContainers} stopped)</span>
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-cyan-400 font-mono">
              <Activity className="w-3 h-3" />
              <span>{((clusterStats.runningContainers / (clusterStats.totalContainers || 1)) * 100).toFixed(2)}% active uptime</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Boxes className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 3: Cluster Memory Pool */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Cluster Memory</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-slate-100">{clusterStats.usedMemoryGb}</span>
              <span className="text-xs text-slate-500">/ {clusterStats.totalMemoryGb} GB ({fmtPct(clusterStats.avgMemoryPercent)})</span>
            </div>
            <div className="w-36 bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2.5">
              <div 
                className="bg-indigo-400 h-full rounded-full" 
                style={{ width: `${clusterStats.avgMemoryPercent}%` }} 
              />
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Cpu className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 4: Compose Stacks */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active Compose Stacks</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-slate-100">{composeStacks.length}</span>
              <span className="text-xs text-slate-500">multi-container stacks</span>
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-400">
              <Layers className="w-3 h-3" />
              <span>Declarative YAML orchestration</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* VM Nodes Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <span>Registered VM Nodes & Docker Daemons</span>
            </h2>
            <p className="text-xs text-slate-400">
              Remote hosts managed by the FleetDock backend via SSH tunnels and Docker TCP/TLS endpoints.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddVmModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register New VM</span>
            </button>
          </div>
        </div>

        {/* Nodes Grid */}
        {vms.length === 0 ? (
          <div className="p-8 rounded-xl bg-slate-900 border border-slate-800 text-center space-y-3">
            <Server className="w-10 h-10 mx-auto text-cyan-400 opacity-60" />
            <h3 className="text-base font-semibold text-slate-200">
              No Hosts Registered (0 Hosts)
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Your backend is connected. You can register your own VM host or seed the database with initial cluster nodes.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setIsAddVmModalOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Register VM</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {vms.map((vm) => {
            const hostContainers = containers.filter((c) => c.vmId === vm.id);
            const runningCount = hostContainers.filter((c) => c.state === 'running').length;
            const isPinging = testingId === vm.id;

            return (
              <div
                key={vm.id}
                onClick={() => {
                  setSelectedVmId(vm.id);
                  setActiveTab('containers');
                }}
                className="group cursor-pointer p-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition-all duration-200 relative overflow-hidden shadow-lg shadow-black/20"
              >
                {/* Top Row: Name, Status, Env Badge */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-slate-800 border border-slate-700/80 group-hover:border-cyan-500/40 transition-colors">
                      <Server className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-100 group-hover:text-cyan-300 transition-colors">
                          {vm.name}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${getEnvBadgeColor(vm.environment)}`}>
                          {vm.environment}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                        <span>{vm.ip}:{vm.port}</span>
                        <span>•</span>
                        <span>{vm.os}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator, Edit & Ping Buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditVmModal(vm);
                      }}
                      title="Edit VM configuration & credentials"
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700 flex items-center gap-1 transition-colors text-[11px]"
                    >
                      <Edit3 className="w-3 h-3 text-cyan-400" />
                      <span className="hidden sm:inline font-mono">Edit</span>
                    </button>

                    <button
                      onClick={(e) => handleTest(vm.id, e)}
                      disabled={isPinging}
                      title="Test live handshake with remote VM"
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 text-[11px] font-mono border border-slate-700 flex items-center gap-1 transition-colors"
                    >
                      <RotateCw className={`w-3 h-3 ${isPinging ? 'animate-spin text-cyan-400' : ''}`} />
                      <span>{isPinging ? 'Pinging...' : `${vm.pingMs}ms`}</span>
                    </button>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" title="Host Online" />
                  </div>
                </div>

                {/* Specs and Auth row */}
                <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60 font-mono">
                    {vm.cpuCores} vCPUs • {vm.memoryGb} GB RAM • {vm.diskGb} GB Disk
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-indigo-400" />
                    <span>{getAuthBadge(vm.authType)}</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 font-mono">
                    {vm.dockerVersion}
                  </span>
                </div>

                {/* Resource Gauges */}
                <div className="grid grid-cols-3 gap-3 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 mb-3 text-xs">
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>CPU{vm.metricsSource === 'docker_socket' ? ' (containers)' : ''}</span>
                      <span className="font-mono text-slate-200">{fmtPct(vm.cpuUsagePercent)}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-cyan-400 h-full rounded-full" 
                        style={{ width: `${vm.cpuUsagePercent}%` }} 
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>RAM{vm.metricsSource === 'docker_socket' ? ' (containers)' : ''}</span>
                      <span className="font-mono text-slate-200">{fmtPct(vm.memoryUsedPercent)}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-emerald-400 h-full rounded-full" 
                        style={{ width: `${vm.memoryUsedPercent}%` }} 
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Disk</span>
                      <span className="font-mono text-slate-200">
                        {vm.diskMetricsAvailable === false ? 'N/A' : fmtPct(vm.diskUsedPercent)}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-purple-400 h-full rounded-full" 
                        style={{ width: `${vm.diskMetricsAvailable === false ? 0 : vm.diskUsedPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer: Container count and Action */}
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <div className="flex items-center gap-2">
                    <Boxes className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-mono text-slate-300">
                      <strong className="text-emerald-400">{runningCount}</strong> / {hostContainers.length} Containers Active
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-cyan-400 text-[11px] font-medium group-hover:translate-x-0.5 transition-transform">
                    <span>Manage Host Containers</span>
                    <ExternalLink className="w-3 h-3" />
                  </div>
                </div>

              </div>
            );
          })}
          </div>
        )}
      </div>

      {/* System Highlights / Quick Navigation Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Banner 1: Register VM */}
        <div 
          onClick={() => setIsAddVmModalOpen(true)}
          className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/60 to-slate-900 border border-indigo-900/50 hover:border-indigo-700/60 cursor-pointer transition-all space-y-2"
        >
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
            <Cpu className="w-4 h-4" />
            <span>Register a VM</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Add a host over SSH or Docker API; OS, CPU, memory and disk are detected automatically.
          </p>
          <div className="text-xs text-indigo-300 font-medium flex items-center gap-1 pt-1">
            <span>Add VM</span>
            <Plus className="w-3 h-3" />
          </div>
        </div>

        {/* Banner 2: Docker Compose & Variables */}
        <div 
          onClick={() => setActiveTab('compose')}
          className="p-4 rounded-xl bg-gradient-to-br from-cyan-950/60 to-slate-900 border border-cyan-900/50 hover:border-cyan-700/60 cursor-pointer transition-all space-y-2"
        >
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
            <Layers className="w-4 h-4" />
            <span>Compose Stacks & .env Variables</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Manage multi-container stacks, edit raw compose YAMLs, and adjust sensitive runtime environment variables.
          </p>
          <div className="text-xs text-cyan-300 font-medium flex items-center gap-1 pt-1">
            <span>View Compose Stacks</span>
            <ExternalLink className="w-3 h-3" />
          </div>
        </div>

        {/* Banner 3: Deploy New Container */}
        <div 
          onClick={() => setIsDeployModalOpen(true)}
          className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/60 to-slate-900 border border-emerald-900/50 hover:border-emerald-700/60 cursor-pointer transition-all space-y-2"
        >
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
            <Boxes className="w-4 h-4" />
            <span>Container Deployment Wizard</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Quickly spin up any Docker image (Spring Boot, NGINX, Postgres, Redis) with port forwarding and volumes.
          </p>
          <div className="text-xs text-emerald-300 font-medium flex items-center gap-1 pt-1">
            <span>Launch Container Now</span>
            <Plus className="w-3 h-3" />
          </div>
        </div>

      </div>

    </div>
  );
};

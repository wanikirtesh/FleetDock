import React from 'react';
import { 
  LayoutDashboard, 
  Boxes, 
  FileCode2, 
  Server, 
  HardDrive, 
  Cpu, 
  Terminal,
  Activity,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
  Layers
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';

export const Sidebar: React.FC = () => {
  const { 
    activeTab, 
    setActiveTab, 
    vms, 
    containers, 
    composeStacks, 
    volumes, 
    activeVm, 
    selectedVmId, 
    isInScope,
    setSelectedVmId,
    testVmConnection 
  } = useFleet();

  const [isTestingPing, setIsTestingPing] = React.useState(false);

  const filteredContainers = containers.filter(c => isInScope(c.vmId));

  const runningContainersCount = filteredContainers.filter(c => c.state === 'running').length;

  const handleTestActiveHost = async () => {
    if (!activeVm) return;
    setIsTestingPing(true);
    await testVmConnection(activeVm.id);
    setIsTestingPing(false);
  };

  const navItems = [
    {
      id: 'overview',
      label: 'Cluster Overview',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'containers',
      label: 'Containers',
      icon: Boxes,
      badge: `${runningContainersCount}/${filteredContainers.length}`,
      badgeColor: 'sidebar-badge-emerald bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    },
    {
      id: 'compose',
      label: 'Compose & Variables',
      icon: FileCode2,
      badge: `${composeStacks.filter(s => isInScope(s.vmId)).length}`,
      badgeColor: 'sidebar-badge-cyan bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
    },
    {
      id: 'vms',
      label: 'VM Hosts & Auth',
      icon: Server,
      badge: `${vms.length} Nodes`,
      badgeColor: 'sidebar-badge-indigo bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
    },
    {
      id: 'storage_network',
      label: 'Volumes & Networks',
      icon: HardDrive,
      badge: `${volumes.length} vols`,
      badgeColor: 'sidebar-badge-slate bg-slate-700 text-slate-300',
    },
    {
      id: 'spring_boot',
      label: 'Spring Boot Java Backend',
      icon: Cpu,
      badge: 'REST & SSE',
      badgeColor: 'sidebar-badge-amber bg-amber-500/20 text-amber-300 border border-amber-500/30',
    },
  ];

  return (
    <aside className="w-64 shrink-0 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col justify-between hidden md:flex">
      
      {/* Navigation Links */}
      <div className="p-4 space-y-6">
        <div>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
            Orchestration
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    isActive
                      ? 'nav-item-active bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/5 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Target Host Quick Card */}
        {activeVm ? (
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${activeVm.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-xs font-semibold text-slate-200 truncate max-w-[130px]">
                  {activeVm.name}
                </span>
              </div>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/50">
                {activeVm.pingMs}ms
              </span>
            </div>

            <div className="text-[11px] text-slate-400 font-mono space-y-1">
              <div className="flex justify-between">
                <span>IP / Port:</span>
                <span className="text-slate-300">{activeVm.ip}:{activeVm.port}</span>
              </div>
              <div className="flex justify-between">
                <span>Auth:</span>
                <span className="text-slate-300 uppercase">{activeVm.authType.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span>OS:</span>
                <span className="text-slate-300 truncate max-w-[120px]">{activeVm.os}</span>
              </div>
              <div className="flex justify-between">
                <span>Docker:</span>
                <span className="text-slate-300 truncate max-w-[120px]">{activeVm.dockerVersion}</span>
              </div>
            </div>

            {/* Host Load Bars */}
            <div className="space-y-1.5 pt-1 border-t border-slate-800/80 text-[10px]">
              <div>
                <div className="flex justify-between text-slate-400 mb-0.5">
                  <span>CPU Usage</span>
                  <span className="font-mono">{activeVm.cpuUsagePercent}%</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-cyan-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, activeVm.cpuUsagePercent)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-0.5">
                  <span>RAM Usage</span>
                  <span className="font-mono">{activeVm.memoryUsedPercent}%</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, activeVm.memoryUsedPercent)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Test Connection Button */}
            <button
              onClick={handleTestActiveHost}
              disabled={isTestingPing}
              className="w-full py-1.5 px-2 bg-slate-800 hover:bg-slate-700/80 text-cyan-300 hover:text-cyan-200 border border-slate-700 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Activity className={`w-3.5 h-3.5 ${isTestingPing ? 'animate-spin' : ''}`} />
              <span>{isTestingPing ? 'Pinging Host...' : 'Ping & Health Check'}</span>
            </button>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Cluster Scope Active</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Viewing all {vms.length} registered host machines simultaneously. Select a specific VM in the top bar to filter.
            </p>
          </div>
        )}
      </div>

      {/* Spring Boot Engine Info Badge at bottom */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-[11px] text-slate-400">
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-300 font-semibold flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            Backend Protocol
          </span>
          <span className="text-emerald-400 font-mono text-[10px]">SPRING BOOT 3</span>
        </div>
        <p className="text-[10px] text-slate-500 leading-normal">
          Docker-Java 3.4.0 Engine client with secure SSH tunneling & TLS socket adapters.
        </p>
      </div>

    </aside>
  );
};

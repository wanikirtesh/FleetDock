import React, { useState, useMemo } from 'react';
import { 
  Boxes, 
  Search, 
  Filter, 
  Play, 
  Square, 
  RotateCw, 
  Pause, 
  Trash2, 
  FileText, 
  Terminal, 
  Info, 
  Plus, 
  CheckSquare, 
  Square as SquareOutline, 
  Server,
  Layers,
  ArrowUpDown,
  RefreshCw,
  ExternalLink,
  SlidersHorizontal,
  Edit3,
  Loader2
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { Container, ContainerState } from '../../types';

export const ContainerList: React.FC = () => {
  const { 
    containers, 
    vms, 
    selectedVmId, 
    isInScope,
    scopeLabel,
    setSelectedVmId,
    openEditVmModal,
    startContainer, 
    stopContainer, 
    restartContainer, 
    pauseContainer, 
    pendingActions,
    deleteContainer, 
    bulkContainerAction,
    setSelectedContainerForLogs,
    setSelectedContainerForShell,
    setSelectedContainerForInspect,
    setIsDeployModalOpen,
    fetchFromBackend,
    refreshHostResources,
    isSyncing
  } = useFleet();

  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | ContainerState>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const [queryingScope, setQueryingScope] = useState(false);
  const queryScopedHosts = async () => {
    setQueryingScope(true);
    try {
      await Promise.all(vms.filter((v) => isInScope(v.id)).map((v) => refreshHostResources(v.id, true)));
    } finally {
      setQueryingScope(false);
    }
  };

  // Containers within the selected host/group; used for the filter badge counts
  const scopedContainers = useMemo(
    () => containers.filter((c) => isInScope(c.vmId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [containers, vms, selectedVmId]
  );

  // Filtered containers
  const filteredContainers = useMemo(() => {
    return containers.filter((c) => {
      // Host filter
      if (!isInScope(c.vmId)) {
        return false;
      }
      // State filter
      if (stateFilter !== 'all') {
        if (stateFilter === 'stopped' && (c.state === 'stopped' || c.state === 'exited')) {
          // match stopped
        } else if (c.state !== stateFilter) {
          return false;
        }
      }
      // Search term
      if (searchTerm.trim() !== '') {
        const query = searchTerm.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(query);
        const matchesImage = c.image.toLowerCase().includes(query);
        const matchesPort = c.ports.some((p) => p.hostPort.toString().includes(query) || p.containerPort.toString().includes(query));
        const matchesCompose = c.composeStack?.toLowerCase().includes(query);
        if (!matchesName && !matchesImage && !matchesPort && !matchesCompose) {
          return false;
        }
      }
      return true;
    });
  }, [containers, vms, selectedVmId, stateFilter, searchTerm]);

  // Bulk selection logic
  const handleSelectAll = () => {
    if (selectedIds.length === filteredContainers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredContainers.map((c) => c.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const getStateBadge = (state: ContainerState) => {
    switch (state) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Running</span>
          </span>
        );
      case 'stopped':
      case 'exited':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            <span>Stopped</span>
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Paused</span>
          </span>
        );
      case 'restarting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-spin" />
            <span>Restarting</span>
          </span>
        );
    }
  };

  const getHostName = (vmId: string) => {
    const vm = vms.find((v) => v.id === vmId);
    return vm ? vm.name : vmId;
  };

  return (
    <div className="space-y-4">
      
      {/* Top Filter & Search Bar */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-sm">
        
        {/* Left: Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, image, port (e.g. 8080), or stack..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        {/* Right: State Filters & Controls */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* State Filter Pills */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs">
            <button
              onClick={() => setStateFilter('all')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                stateFilter === 'all'
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({scopedContainers.length})
            </button>
            <button
              onClick={() => setStateFilter('running')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                stateFilter === 'running'
                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Running ({scopedContainers.filter((c) => c.state === 'running').length})
            </button>
            <button
              onClick={() => setStateFilter('stopped')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                stateFilter === 'stopped'
                  ? 'bg-rose-950/80 text-rose-400 border border-rose-800/60 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Stopped ({scopedContainers.filter((c) => c.state === 'stopped' || c.state === 'exited').length})
            </button>
            <button
              onClick={() => setStateFilter('paused')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                stateFilter === 'paused'
                  ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Paused ({scopedContainers.filter((c) => c.state === 'paused').length})
            </button>
          </div>

          {/* Edit Host Button (when specific VM selected) */}
          {selectedVmId !== 'all' && !selectedVmId.startsWith('group:') && (
            <button
              onClick={() => {
                const targetVm = vms.find((v) => v.id === selectedVmId);
                if (targetVm) openEditVmModal(targetVm);
              }}
              title="Edit configuration, credentials, or endpoint for this VM"
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-cyan-300 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Edit Host</span>
            </button>
          )}

          {/* Refresh from VM Button */}
          <button
            onClick={() => void queryScopedHosts()}
            disabled={isSyncing || queryingScope}
            title="Query the Docker daemon of the selected/filtered VM host(s) for live container states"
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-cyan-300 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing || queryingScope ? 'animate-spin' : ''}`} />
            <span>{isSyncing || queryingScope ? 'Fetching...' : 'Query VM Daemon'}</span>
          </button>

          {/* Deploy Container Button */}
          <button
            onClick={() => setIsDeployModalOpen(true)}
            className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm shadow-emerald-900/40"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Deploy Container</span>
          </button>
        </div>

      </div>

      {/* Bulk Action Bar (Visible when 1 or more items are selected) */}
      {selectedIds.length > 0 && (
        <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/60 flex items-center justify-between text-xs text-cyan-200 animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="font-semibold bg-cyan-500/20 px-2 py-0.5 rounded font-mono text-cyan-300">
              {selectedIds.length} Selected
            </span>
            <span className="text-slate-400">Bulk action on selected containers in {scopeLabel}:</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                bulkContainerAction('start', selectedIds);
                setSelectedIds([]);
              }}
              className="px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white font-medium flex items-center gap-1 transition-colors"
            >
              <Play className="w-3 h-3" />
              <span>Start</span>
            </button>
            <button
              onClick={() => {
                bulkContainerAction('stop', selectedIds);
                setSelectedIds([]);
              }}
              className="px-2.5 py-1 rounded bg-rose-600/80 hover:bg-rose-600 text-white font-medium flex items-center gap-1 transition-colors"
            >
              <Square className="w-3 h-3" />
              <span>Stop</span>
            </button>
            <button
              onClick={() => {
                bulkContainerAction('restart', selectedIds);
                setSelectedIds([]);
              }}
              className="px-2.5 py-1 rounded bg-cyan-600/80 hover:bg-cyan-600 text-white font-medium flex items-center gap-1 transition-colors"
            >
              <RotateCw className="w-3 h-3" />
              <span>Restart</span>
            </button>
            <button
              onClick={() => {
                if (confirm(`Are you sure you want to delete ${selectedIds.length} containers?`)) {
                  bulkContainerAction('delete', selectedIds);
                  setSelectedIds([]);
                }
              }}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-rose-300 font-medium flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="px-2 py-1 text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Containers Table */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-mono text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.length > 0 && selectedIds.length === filteredContainers.length}
                    onChange={handleSelectAll}
                    className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">Container & Image</th>
                <th className="py-3 px-4">Target Host VM</th>
                <th className="py-3 px-4">State</th>
                <th className="py-3 px-4">Ports</th>
                <th className="py-3 px-4">CPU / RAM</th>
                <th className="py-3 px-4">Uptime</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {isSyncing && filteredContainers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <RotateCw className="w-7 h-7 mx-auto mb-2 animate-spin text-cyan-400" />
                    <p className="text-sm font-medium text-slate-200">Querying live Docker daemon...</p>
                    <p className="text-xs text-slate-400 mt-1">Discovering running & stopped containers on VM host</p>
                  </td>
                </tr>
              ) : filteredContainers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <Boxes className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                    <p className="text-sm">No containers found matching your search or filters.</p>
                    {selectedVmId !== 'all' && (
                      <p className="text-xs text-slate-400 mt-1">
                        Deploy a new container or click "Query VM Daemon" above to re-scan.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredContainers.map((c) => {
                  const isSelected = selectedIds.includes(c.id);
                  const isRunning = c.state === 'running';
                  const pending = pendingActions[c.id];

                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-slate-850/60 transition-colors ${
                        isSelected ? 'bg-cyan-950/20' : ''
                      } ${pending ? 'opacity-70' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(c.id)}
                          className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Name & Image */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-100 hover:text-cyan-300 cursor-pointer"
                              onClick={() => setSelectedContainerForInspect(c)}>
                              {c.name}
                            </span>
                            {c.composeStack && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                                <Layers className="w-2.5 h-2.5" />
                                {c.composeStack}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-slate-400 truncate max-w-xs" title={c.image}>
                            {c.image}
                          </span>
                        </div>
                      </td>

                      {/* Target Host */}
                      <td className="py-3 px-4 font-mono text-xs text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Server className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span className="truncate max-w-[130px]">{getHostName(c.vmId)}</span>
                        </div>
                      </td>

                      {/* State Badge */}
                      <td className="py-3 px-4">
                        {getStateBadge(c.state)}
                      </td>

                      {/* Ports */}
                      <td className="py-3 px-4 font-mono text-xs">
                        {c.ports.length === 0 ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {c.ports.map((p, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] border border-slate-700"
                              >
                                {p.hostPort}:{p.containerPort}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* CPU & RAM */}
                      <td className="py-3 px-4 font-mono text-xs">
                        {isRunning ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="text-cyan-300">{c.cpuPercent}% CPU</div>
                            <div className="text-slate-400 text-[11px]">{c.memUsageMb} MB</div>
                          </div>
                        ) : (
                          <span className="text-slate-600">0% • 0 MB</span>
                        )}
                      </td>

                      {/* Uptime */}
                      <td className="py-3 px-4 text-xs text-slate-400">
                        {c.statusText}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          
                          {/* Start/Stop/Restart toggles */}
                          {pending && (
                            <span className="text-[11px] text-cyan-300 font-mono mr-1 animate-pulse">
                              {{ start: 'Starting…', stop: 'Stopping…', restart: 'Restarting…', delete: 'Removing…' }[pending]}
                            </span>
                          )}
                          {isRunning ? (
                            <>
                              <button
                                onClick={() => stopContainer(c.id)}
                                disabled={!!pending}
                                title="Stop Container (SIGTERM)"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {pending === 'stop' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" /> : <Square className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => restartContainer(c.id)}
                                disabled={!!pending}
                                title="Restart Container"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {pending === 'restart' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" /> : <RotateCw className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => pauseContainer(c.id)}
                                disabled={!!pending}
                                title={c.state === 'paused' ? 'Resume' : 'Pause'}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Pause className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => startContainer(c.id)}
                              disabled={!!pending}
                              title="Start Container"
                              className="p-1.5 rounded-lg text-emerald-400 hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {pending === 'start' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                            </button>
                          )}

                          {/* Logs Streaming */}
                          <button
                            onClick={() => setSelectedContainerForLogs(c)}
                            title="View Real-Time Logs"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          {/* Exec Shell */}
                          <button
                            onClick={() => setSelectedContainerForShell(c)}
                            title="Interactive Exec Console"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition-colors"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                          </button>

                          {/* Inspect details */}
                          <button
                            onClick={() => setSelectedContainerForInspect(c)}
                            title="Inspect Container Config"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition-colors"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete container */}
                          <button
                            onClick={() => {
                              if (confirm(`Remove container '${c.name}'?`)) {
                                deleteContainer(c.id);
                              }
                            }}
                            disabled={!!pending}
                            title="Remove Container"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {pending === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>

                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

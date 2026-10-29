import React, { useState } from 'react';
import { 
  HardDrive, 
  Network, 
  Trash2, 
  Server, 
  Plus, 
  Boxes, 
  Layers, 
  CheckCircle2 
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { useSort, SortTh } from '../../utils/useSort';

export const StorageNetworkView: React.FC = () => {
  const { volumes, networks, vms, isInScope, scopeLabel } = useFleet();
  const [activeSubTab, setActiveSubTab] = useState<'volumes' | 'networks'>('volumes');

  const filteredVolumes = volumes.filter((v) => isInScope(v.vmId));

  const filteredNetworks = networks.filter((n) => isInScope(n.vmId));

  const getHostName = (vmId: string) => {
    return vms.find((v) => v.id === vmId)?.name || vmId;
  };

  const volSort = useSort(filteredVolumes, {
    name: (v) => v.name,
    host: (v) => getHostName(v.vmId),
    driver: (v) => v.driver,
    size: (v) => v.sizeMb,
    usedBy: (v) => v.inUseBy?.length ?? 0,
    created: (v) => v.createdAt,
  });
  const netSort = useSort(filteredNetworks, {
    name: (n) => n.name,
    host: (n) => getHostName(n.vmId),
    driver: (n) => n.driver,
    subnet: (n) => n.subnet,
    gateway: (n) => n.gateway,
    containers: (n) => n.containersCount,
  });

  return (
    <div className="space-y-4">
      
      {/* Top Toggle Bar */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('volumes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeSubTab === 'volumes'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>Docker Volumes ({filteredVolumes.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('networks')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeSubTab === 'networks'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Network className="w-4 h-4" />
            <span>Docker Networks ({filteredNetworks.length})</span>
          </button>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Scope: {scopeLabel}
        </div>
      </div>

      {/* Volumes Table */}
      {activeSubTab === 'volumes' && (
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
          {filteredVolumes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
              <HardDrive className="w-10 h-10 opacity-30" />
              <p className="text-sm font-medium">No volumes found</p>
              <p className="text-xs text-slate-600">Volumes are fetched live from the Docker daemon on each registered host. Make sure the host is online and reachable.</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px] uppercase">
                <tr>
                  <SortTh label="Volume Name" sortKey="name" sort={volSort.sort} onToggle={volSort.toggle} className="py-3 px-4" />
                  <SortTh label="Host Node" sortKey="host" sort={volSort.sort} onToggle={volSort.toggle} className="py-3 px-4" />
                  <SortTh label="Driver" sortKey="driver" sort={volSort.sort} onToggle={volSort.toggle} className="py-3 px-4" />
                  <SortTh label="Allocated Size" sortKey="size" sort={volSort.sort} onToggle={volSort.toggle} className="py-3 px-4" />
                  <SortTh label="Mounted In Containers" sortKey="usedBy" sort={volSort.sort} onToggle={volSort.toggle} className="py-3 px-4" />
                  <SortTh label="Created" sortKey="created" sort={volSort.sort} onToggle={volSort.toggle} className="py-3 px-4 text-right" align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {volSort.sorted.map((vol) => (
                  <tr key={vol.name + vol.vmId} className="hover:bg-slate-850/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-100 flex items-center gap-2">
                      <HardDrive className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>{vol.name}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-400">
                      {getHostName(vol.vmId)}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-300">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                        {vol.driver}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-emerald-400 font-semibold">
                      {vol.sizeMb >= 1024 ? `${(vol.sizeMb / 1024).toFixed(1)} GB` : `${vol.sizeMb.toFixed(0)} MB`}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <div className="flex flex-wrap gap-1">
                        {vol.inUseBy.length === 0 ? (
                          <span className="text-amber-400 font-mono text-[11px]">Dangling (Unused)</span>
                        ) : (
                          vol.inUseBy.map((c) => (
                            <span key={c} className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 text-[11px] font-mono">
                              {c}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-500">
                      {vol.createdAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* Networks Table */}
      {activeSubTab === 'networks' && (
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
          {filteredNetworks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
              <Network className="w-10 h-10 opacity-30" />
              <p className="text-sm font-medium">No networks found</p>
              <p className="text-xs text-slate-600">Networks are fetched live from the Docker daemon on each registered host. Make sure the host is online and reachable.</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px] uppercase">
                <tr>
                  <SortTh label="Network Name & ID" sortKey="name" sort={netSort.sort} onToggle={netSort.toggle} className="py-3 px-4" />
                  <SortTh label="Host Node" sortKey="host" sort={netSort.sort} onToggle={netSort.toggle} className="py-3 px-4" />
                  <SortTh label="Driver" sortKey="driver" sort={netSort.sort} onToggle={netSort.toggle} className="py-3 px-4" />
                  <SortTh label="Subnet (CIDR)" sortKey="subnet" sort={netSort.sort} onToggle={netSort.toggle} className="py-3 px-4" />
                  <SortTh label="Gateway" sortKey="gateway" sort={netSort.sort} onToggle={netSort.toggle} className="py-3 px-4" />
                  <SortTh label="Containers Connected" sortKey="containers" sort={netSort.sort} onToggle={netSort.toggle} className="py-3 px-4 text-right" align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {netSort.sorted.map((net) => (
                  <tr key={net.id} className="hover:bg-slate-850/60 transition-colors">
                    <td className="py-3 px-4 font-mono">
                      <div className="flex items-center gap-2">
                        <Network className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="font-semibold text-slate-100">{net.name}</span>
                      </div>
                      <span className="text-[11px] text-slate-500">{net.id}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-400">
                      {getHostName(net.vmId)}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {net.driver}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-cyan-400">
                      {net.subnet}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-400">
                      {net.gateway}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        {net.containersCount} containers
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

    </div>
  );
};

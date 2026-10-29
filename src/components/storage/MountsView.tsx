import React, { useEffect, useMemo, useState } from 'react';
import { FolderTree, HardDrive, RefreshCw, Search, Server, Database, Loader2 } from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { fmtKb, fmtPct } from '../../utils/format';

type TypeFilter = 'all' | 'bind' | 'volume' | 'tmpfs';

const barColor = (pct: number) => (pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-400' : 'bg-emerald-400');

export const MountsView: React.FC = () => {
  const { vms, isInScope, scopeLabel, isBackendConnected, mounts, mountsLoading, refreshHostMounts } = useFleet();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortBy, setSortBy] = useState<'used' | 'container' | 'host'>('used');

  const scopedHosts = useMemo(
    () => vms.filter((v) => isInScope(v.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vms, isInScope]
  );
  const hostKey = scopedHosts.map((h) => h.id).join(',');
  const hostName = (vmId: string) => vms.find((v) => v.id === vmId)?.name || vmId;
  const rows = useMemo(
    () => mounts.filter((m) => isInScope(m.vmId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mounts, isInScope]
  );
  const loading = scopedHosts.some((h) => mountsLoading[h.id]);

  const rescan = () => scopedHosts.forEach((h) => void refreshHostMounts(h.id, true));

  // Cached data shows instantly; only hosts whose cache has expired are scanned
  useEffect(() => {
    if (!isBackendConnected) return;
    scopedHosts.forEach((h) => void refreshHostMounts(h.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostKey, isBackendConnected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => typeFilter === 'all' || r.type === typeFilter)
      .filter(
        (r) =>
          !q ||
          [r.containerName, r.source, r.target, r.name, hostName(r.vmId)].some((s) => (s || '').toLowerCase().includes(q))
      )
      .sort((a, b) => {
        if (sortBy === 'container') return a.containerName.localeCompare(b.containerName);
        if (sortBy === 'host') return hostName(a.vmId).localeCompare(hostName(b.vmId));
        return (b.usedKb ?? -1) - (a.usedKb ?? -1);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, typeFilter, sortBy, vms]);

  // One entry per physical filesystem backing the mounts
  const filesystems = useMemo(() => {
    const map = new Map<string, { vmId: string; mount: string; total: number; used: number; avail: number; mounts: number }>();
    rows.forEach((r) => {
      if (r.fsTotalKb == null || r.fsUsedKb == null) return;
      const key = `${r.vmId}|${r.fsMount}|${r.fsTotalKb}`;
      const cur = map.get(key);
      if (cur) cur.mounts++;
      else
        map.set(key, {
          vmId: r.vmId,
          mount: r.fsMount || '/',
          total: r.fsTotalKb,
          used: r.fsUsedKb,
          avail: r.fsAvailKb ?? 0,
          mounts: 1,
        });
    });
    return [...map.values()].sort((a, b) => b.used / b.total - a.used / a.total);
  }, [rows]);

  // A source shared by several containers is only counted once
  const totalUsedKb = useMemo(() => {
    const seen = new Set<string>();
    return rows.reduce((sum, r) => {
      const key = `${r.vmId}|${r.source}`;
      if (seen.has(key) || r.usedKb == null) return sum;
      seen.add(key);
      return sum + r.usedKb;
    }, 0);
  }, [rows]);

  const bindCount = rows.filter((r) => r.type === 'bind').length;
  const volumeCount = rows.filter((r) => r.type === 'volume').length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <FolderTree className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Mounts &amp; Usage</h2>
            <p className="text-xs text-slate-400 font-mono">Scope: {scopeLabel}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search container, path, volume…"
              className="pl-8 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 w-64 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="px-2 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200"
          >
            <option value="all">All types</option>
            <option value="bind">Bind</option>
            <option value="volume">Volume</option>
            <option value="tmpfs">tmpfs</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'used' | 'container' | 'host')}
            className="px-2 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200"
          >
            <option value="used">Sort: Usage</option>
            <option value="container">Sort: Container</option>
            <option value="host">Sort: Host</option>
          </select>
          <button
            onClick={rescan}
            disabled={loading || !isBackendConnected}
            title="Re-scan mounts and disk usage on the selected host(s)"
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-cyan-300 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Scanning…' : 'Rescan'}</span>
          </button>
        </div>
      </div>

      {!isBackendConnected && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
          Connect to the Spring Boot backend to read live mount usage from your hosts.
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total mounts', value: String(rows.length), icon: FolderTree, color: 'text-cyan-400' },
          { label: 'Bind / Volume', value: `${bindCount} / ${volumeCount}`, icon: Database, color: 'text-indigo-300' },
          { label: 'Data on mounts', value: fmtKb(totalUsedKb), icon: HardDrive, color: 'text-emerald-400' },
          { label: 'Hosts scanned', value: String(scopedHosts.length), icon: Server, color: 'text-slate-300' },
        ].map((c) => (
          <div key={c.label} className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
            <c.icon className={`w-5 h-5 ${c.color}`} />
            <div>
              <div className="text-[11px] text-slate-400 uppercase font-mono">{c.label}</div>
              <div className="text-base font-semibold text-slate-100 font-mono">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Backing filesystems */}
      {filesystems.length > 0 && (
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Backing filesystems</div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filesystems.map((fs) => {
              const pct = fs.total > 0 ? (fs.used / fs.total) * 100 : 0;
              return (
                <div key={`${fs.vmId}|${fs.mount}|${fs.total}`} className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-200 truncate">
                      {hostName(fs.vmId)} <span className="text-slate-500">{fs.mount}</span>
                    </span>
                    <span className="text-slate-300">{fmtPct(pct)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 mt-2 overflow-hidden">
                    <div className={`h-full ${barColor(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono mt-1.5">
                    <span>{fmtKb(fs.used)} used</span>
                    <span>{fmtKb(fs.avail)} free</span>
                    <span>{fmtKb(fs.total)}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">{fs.mounts} mount(s) on this filesystem</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mounts table */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Scanning mounts and disk usage…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-500">
            <FolderTree className="w-10 h-10 opacity-30" />
            <p className="text-sm font-medium">No mounts found</p>
            <p className="text-xs text-slate-600">Containers in the current scope have no mounts, or no host is reachable.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[11px] uppercase">
                <tr>
                  <th className="py-3 px-4">Container</th>
                  <th className="py-3 px-4">Host</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Source (host)</th>
                  <th className="py-3 px-4">Target (container)</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Used</th>
                  <th className="py-3 px-4">Filesystem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {filtered.map((r, i) => {
                  const fsPct = r.fsTotalKb && r.fsUsedKb != null ? (r.fsUsedKb / r.fsTotalKb) * 100 : null;
                  return (
                    <tr key={`${r.vmId}-${r.containerId}-${r.target}-${i}`} className="hover:bg-slate-850/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-100">{r.containerName}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-400">{hostName(r.vmId)}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-mono border ${
                            r.type === 'volume'
                              ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                              : r.type === 'bind'
                                ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {r.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs max-w-xs">
                        <div className="truncate" title={r.source}>{r.source || '—'}</div>
                        {r.name && <div className="text-[11px] text-slate-500 truncate">{r.name}</div>}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs max-w-xs truncate" title={r.target}>{r.target}</td>
                      <td className="py-3 px-4 font-mono text-xs">
                        <span className={r.mode === 'ro' ? 'text-amber-300' : 'text-emerald-400'}>{r.mode}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-emerald-400 font-semibold">{fmtKb(r.usedKb)}</td>
                      <td className="py-3 px-4 min-w-[150px]">
                        {fsPct === null ? (
                          <span className="text-slate-600 font-mono text-xs">--</span>
                        ) : (
                          <div>
                            <div className="flex justify-between text-[11px] font-mono text-slate-400">
                              <span>{r.fsMount}</span>
                              <span>{fmtPct(fsPct)}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-800 mt-1 overflow-hidden">
                              <div className={`h-full ${barColor(fsPct)}`} style={{ width: `${Math.min(100, fsPct)}%` }} />
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

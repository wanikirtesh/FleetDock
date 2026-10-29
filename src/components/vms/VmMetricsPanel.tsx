import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Cpu, HardDrive, Activity, Wifi, WifiOff, RefreshCw, MemoryStick } from 'lucide-react';
import { api } from '../../services/api';
import { VMHost } from '../../types';
import { useFleet } from '../../context/FleetContext';
import { fmtPct } from '../../utils/format';

interface MetricsSnapshot {
  cpuPercent: number;
  memPercent: number;
  diskPercent: number | null;
  memTotalMb: number;
  memUsedMb: number;
  diskTotalMb: number;
  diskUsedMb: number;
  source: string;
  timestamp: number;
}

interface VmMetricsPanelProps {
  vm: VMHost;
  isBackendConnected: boolean;
}

const MAX_HISTORY = 30;
const POLL_INTERVAL_MS = 3000;

function Sparkline({
  values,
  color,
  height = 40,
  width = 200,
}: {
  values: number[];
  color: string;
  height?: number;
  width?: number;
}) {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} className="w-full h-full">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth="1.5" strokeOpacity="0.3" />
      </svg>
    );
  }

  const pad = 2;
  const usableH = height - pad * 2;
  const step = (width - pad * 2) / (values.length - 1);

  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + usableH - (Math.min(100, Math.max(0, v)) / 100) * usableH;
    return [x, y] as [number, number];
  });

  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const cpx = (px + cx) / 2;
    d += ` C ${cpx},${py} ${cpx},${cy} ${cx},${cy}`;
  }

  const last = points[points.length - 1];
  const first = points[0];
  const fillPath = d + ` L ${last[0]},${height} L ${first[0]},${height} Z`;
  const gradId = `sg-${color.replace(/[^a-z0-9]/gi, '')}-${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  );
}

function MetricCard({
  label,
  icon,
  value,
  history,
  color,
  sub,
}: {
  label: string;
  icon: React.ReactNode;
  value: number | null;
  history: number[];
  color: string;
  sub?: string;
}) {
  const isHigh = value !== null && value >= 85;
  const isMid = value !== null && value >= 60 && value < 85;
  const barColor = isHigh ? '#f87171' : isMid ? '#fb923c' : color;

  return (
    <div
      className="relative rounded-xl border overflow-hidden"
      style={{
        background: 'rgba(15, 23, 42, 0.85)',
        borderColor: isHigh ? 'rgba(248,113,113,0.35)' : 'rgba(51,65,85,0.6)',
        backdropFilter: 'blur(8px)',
        minHeight: '90px',
      }}
    >
      {/* Background sparkline */}
      <div className="absolute inset-0 opacity-50 pointer-events-none">
        <Sparkline values={history} color={barColor} height={90} width={280} />
      </div>

      <div className="relative z-10 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={{ color: barColor }}>{icon}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
          </div>
          {isHigh && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-red-400 bg-red-950/60 border border-red-800/40 px-1.5 py-0.5 rounded animate-pulse">
              High
            </span>
          )}
        </div>

        <div className="flex items-end gap-1">
          <span className="text-3xl font-black tabular-nums leading-none" style={{ color: barColor }}>
            {value === null ? '--' : value.toFixed(2)}
          </span>
          {value !== null && <span className="text-sm font-semibold text-slate-400 mb-0.5">%</span>}
        </div>

        <div className="w-full bg-slate-800/70 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${value === null ? 0 : Math.min(100, value)}%`,
              background: barColor,
              boxShadow: `0 0 6px ${barColor}80`,
            }}
          />
        </div>

        {sub && <p className="text-[10px] font-mono text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

export const VmMetricsPanel: React.FC<VmMetricsPanelProps> = ({ vm, isBackendConnected }) => {
  const [history, setHistory] = useState<MetricsSnapshot[]>([]);
  const [latest, setLatest] = useState<MetricsSnapshot | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const { applyHostMetrics } = useFleet();
  const vmRef = useRef(vm);
  vmRef.current = vm;
  const applyRef = useRef(applyHostMetrics);
  applyRef.current = applyHostMetrics;

  const fetchMetrics = useCallback(async () => {
    if (!isBackendConnected) return;
    setIsPolling(true);
    try {
      const data = await api.getHostMetrics(vm.id);
      if (!mountedRef.current) return;
      if (data.error) {
        setError(data.error);
        return;
      }
      applyRef.current(data);
      const cur = vmRef.current;
      const snap: MetricsSnapshot = {
        cpuPercent: typeof data.cpuPercent === 'number' ? data.cpuPercent : cur.cpuUsagePercent,
        memPercent: typeof data.memPercent === 'number' ? data.memPercent : cur.memoryUsedPercent,
        diskPercent: data.diskAvailable === false
          ? null
          : typeof data.diskPercent === 'number' ? data.diskPercent : cur.diskUsedPercent,
        memTotalMb: typeof data.memTotalMb === 'number' ? data.memTotalMb : cur.memoryGb * 1024,
        memUsedMb: typeof data.memUsedMb === 'number' ? data.memUsedMb : 0,
        diskTotalMb: typeof data.diskTotalMb === 'number' ? data.diskTotalMb : cur.diskGb * 1024,
        diskUsedMb: typeof data.diskUsedMb === 'number'
          ? data.diskUsedMb
          : cur.diskGb * 1024 * cur.diskUsedPercent / 100,
        source: data.source,
        timestamp: Date.now(),
      };

      setLatest(snap);
      setHistory((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snap]);
      setError(data.error || null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err: any) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setIsPolling(false);
    }
  }, [vm.id, isBackendConnected]);

  useEffect(() => {
    mountedRef.current = true;

    if (isBackendConnected) {
      setLatest(null);
      setHistory([]);
      setError(null);
      fetchMetrics();
      intervalRef.current = setInterval(fetchMetrics, POLL_INTERVAL_MS);

      return () => {
        mountedRef.current = false;
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }

    const seedSnap: MetricsSnapshot = {
      cpuPercent: vm.cpuUsagePercent,
      memPercent: vm.memoryUsedPercent,
      diskPercent: vm.diskUsedPercent,
      memTotalMb: vm.memoryGb * 1024,
      memUsedMb: Math.round((vm.memoryGb * 1024 * vm.memoryUsedPercent) / 100),
      diskTotalMb: vm.diskGb * 1024,
      diskUsedMb: Math.round((vm.diskGb * 1024 * vm.diskUsedPercent) / 100),
      source: vm.metricsSource || 'host',
      timestamp: Date.now(),
    };
    setLatest(seedSnap);
    setHistory([seedSnap]);
    setError(null);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [vm.id, isBackendConnected]);

  const cpuHistory = history.map((s) => s.cpuPercent);
  const memHistory = history.map((s) => s.memPercent);
  const diskHistory = history
    .map((s) => s.diskPercent)
    .filter((value): value is number => value !== null);

  const cpu = latest?.cpuPercent ?? (isBackendConnected ? null : vm.cpuUsagePercent);
  const mem = latest?.memPercent ?? (isBackendConnected ? null : vm.memoryUsedPercent);
  const disk = latest
    ? latest.diskPercent
    : isBackendConnected || vm.diskMetricsAvailable === false ? null : vm.diskUsedPercent;
  const memUsedGb = ((latest?.memUsedMb ?? 0) / 1024).toFixed(1);
  const memTotalGb = ((latest?.memTotalMb ?? vm.memoryGb * 1024) / 1024).toFixed(1);
  const diskUsedGb = ((latest?.diskUsedMb ?? 0) / 1024).toFixed(1);
  const diskTotalGb = ((latest?.diskTotalMb ?? vm.diskGb * 1024) / 1024).toFixed(1);
  const containerMetrics = latest?.source === 'docker_socket';
  const memorySub = isBackendConnected && !latest
    ? 'Metrics unavailable'
    : `${memUsedGb} / ${memTotalGb} GB used`;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-bold text-slate-100">Real-Time Metrics</span>
          {isPolling && <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />}
        </div>
        {!isBackendConnected ? (
          <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/50 border border-amber-800/40 px-2 py-0.5 rounded">
            <WifiOff className="w-3 h-3" /> Showing last known
          </span>
        ) : error ? (
          <span
            className="flex items-center gap-1 text-[10px] text-rose-400 bg-rose-950/50 border border-rose-800/40 px-2 py-0.5 rounded"
            title={error}
          >
            <WifiOff className="w-3 h-3" /> Metrics unavailable
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-2 py-0.5 rounded">
            <Wifi className="w-3 h-3" />
            Live &middot; {lastUpdated || 'connecting...'}
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard
          label={containerMetrics ? 'Container CPU' : 'CPU Load'}
          icon={<Cpu className="w-4 h-4" />}
          value={cpu}
          history={cpuHistory}
          color="#22d3ee"
          sub={`${vm.cpuCores} vCPU${vm.cpuCores !== 1 ? 's' : ''} \u00b7 3s refresh`}
        />
        <MetricCard
          label={containerMetrics ? 'Container Memory' : 'Memory'}
          icon={<MemoryStick className="w-4 h-4" />}
          value={mem}
          history={memHistory}
          color="#a78bfa"
          sub={memorySub}
        />
        <MetricCard
          label="Disk Usage"
          icon={<HardDrive className="w-4 h-4" />}
          value={disk}
          history={diskHistory}
          color="#34d399"
          sub={disk === null
            ? containerMetrics || vm.metricsSource === 'docker_socket'
              ? 'Unavailable through Docker API'
              : 'Metrics unavailable'
            : `${diskUsedGb} / ${diskTotalGb} GB used`}
        />
      </div>

      {/* Mini trend graphs */}
      {history.length > 2 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-800/60 bg-slate-900/50 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">CPU Trend</span>
              <span className="text-[10px] font-mono text-cyan-400">
                {cpu === null ? '--' : fmtPct(cpu)}
              </span>
            </div>
            <div style={{ height: '32px' }}>
              <Sparkline values={cpuHistory} color="#22d3ee" height={32} width={240} />
            </div>
          </div>
          <div className="rounded-lg border border-slate-800/60 bg-slate-900/50 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Memory Trend</span>
              <span className="text-[10px] font-mono text-violet-400">
                {mem === null ? '--' : fmtPct(mem)}
              </span>
            </div>
            <div style={{ height: '32px' }}>
              <Sparkline values={memHistory} color="#a78bfa" height={32} width={240} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

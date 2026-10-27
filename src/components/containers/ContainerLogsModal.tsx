import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  Download, 
  Trash2, 
  Search, 
  ArrowDown, 
  Terminal, 
  RotateCw,
  Server,
  Activity,
  AlertCircle,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { api } from '../../services/api';
import { parseRawDockerLogLine, generateInitialLogs } from '../../utils/logsGenerator';
import { LogEntry } from '../../types';

export const ContainerLogsModal: React.FC = () => {
  const { selectedContainerForLogs, setSelectedContainerForLogs, vms } = useFleet();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(true);
  const [streamStatus, setStreamStatus] = useState<'connected' | 'connecting' | 'paused' | 'offline'>('connecting');
  const [streamProtocol, setStreamProtocol] = useState<'WebSocket' | 'SSE' | 'Polling'>('WebSocket');
  const [dataSourceType, setDataSourceType] = useState<'live' | 'mock'>('live');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'>('ALL');
  const [tailCount, setTailCount] = useState<number>(100);

  const logEndRef = useRef<HTMLDivElement>(null);

  const targetVm = vms.find((v) => v.id === selectedContainerForLogs?.vmId);
  const currentContainerId = selectedContainerForLogs?.id;

  // 1. Immediately wipe previous logs and reset state when switching containers!
  useEffect(() => {
    setLogs([]);
    setErrorMessage(null);
    setIsLoading(true);
    setStreamStatus('connecting');
  }, [currentContainerId]);

  // Fetch initial/refreshed logs from backend REST
  const fetchLiveLogs = useCallback(async (tail: number = tailCount) => {
    if (!selectedContainerForLogs) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const rawLines = await api.getContainerLogs(selectedContainerForLogs.vmId, selectedContainerForLogs.id, tail);

      if (rawLines && rawLines.length > 0) {
        const parsed = rawLines.map((line) => parseRawDockerLogLine(line, selectedContainerForLogs.id));
        setLogs(parsed);
        setDataSourceType('live');
      } else {
        setLogs([
          {
            id: `empty-${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            level: 'INFO',
            message: `[docker] Container ${selectedContainerForLogs.name} (${selectedContainerForLogs.id}) has produced no output yet.`,
            containerId: selectedContainerForLogs.id,
          },
        ]);
        setDataSourceType('live');
      }
    } catch (err: any) {
      console.warn('Live logs fetch returned error:', err);
      setErrorMessage(err.message || 'Could not query Docker daemon');

      const fallback = generateInitialLogs(selectedContainerForLogs.name, tail);
      setLogs(fallback);
      setDataSourceType('mock');
    } finally {
      setIsLoading(false);
    }
  }, [selectedContainerForLogs, tailCount]);

  // 2. Real-time WebSocket connection with automatic SSE fallback
  useEffect(() => {
    if (!selectedContainerForLogs) return;

    if (!isStreaming || selectedContainerForLogs.state !== 'running') {
      setStreamStatus(selectedContainerForLogs.state !== 'running' ? 'offline' : 'paused');
      return;
    }

    let isCancelled = false;
    let ws: WebSocket | null = null;
    let es: EventSource | null = null;

    setStreamStatus('connecting');

    // Start with quick REST load so logs render without delay
    fetchLiveLogs(tailCount);

    // Fallback SSE continuous stream
    const startSseFallback = () => {
      if (isCancelled) return;
      try {
        const streamUrl = api.getContainerLogsStreamUrl(selectedContainerForLogs.vmId, selectedContainerForLogs.id, 20);
        es = new EventSource(streamUrl);
        setStreamProtocol('SSE');

        es.onopen = () => {
          if (!isCancelled) {
            setStreamStatus('connected');
            setErrorMessage(null);
            setIsLoading(false);
          }
        };

        es.onmessage = (event) => {
          if (isCancelled || !event.data || !event.data.trim()) return;
          const newEntry = parseRawDockerLogLine(event.data, selectedContainerForLogs.id);
          setLogs((prev) => {
            if (prev.length > 0 && prev[prev.length - 1].message === newEntry.message) {
              return prev;
            }
            return [...prev.slice(-1000), newEntry];
          });
        };

        es.onerror = () => {
          if (!isCancelled) setStreamStatus('paused');
        };
      } catch {
        if (!isCancelled) setStreamStatus('paused');
      }
    };

    // Primary: Native WebSocket real-time log socket
    try {
      const wsUrl = api.getContainerLogsWebSocketUrl(selectedContainerForLogs.vmId, selectedContainerForLogs.id, tailCount);
      ws = new WebSocket(wsUrl);
      setStreamProtocol('WebSocket');

      ws.onopen = () => {
        if (!isCancelled) {
          setStreamStatus('connected');
          setErrorMessage(null);
          setIsLoading(false);
        }
      };

      ws.onmessage = (event) => {
        if (isCancelled) return;
        try {
          const payload = JSON.parse(event.data);

          // Discard packets belonging to a previous container if any delayed message arrives
          if (payload.containerId && payload.containerId !== selectedContainerForLogs.id && !selectedContainerForLogs.id.startsWith(payload.containerId)) {
            return;
          }

          if (payload.type === 'initial' && Array.isArray(payload.logs)) {
            const parsed = payload.logs.map((l: string) => parseRawDockerLogLine(l, selectedContainerForLogs.id));
            setLogs(parsed);
            setIsLoading(false);
            setDataSourceType('live');
          } else if (payload.type === 'log' && payload.line) {
            const newEntry = parseRawDockerLogLine(payload.line, selectedContainerForLogs.id);
            setLogs((prev) => {
              if (prev.length > 0 && prev[prev.length - 1].message === newEntry.message) {
                return prev;
              }
              return [...prev.slice(-1000), newEntry];
            });
          } else if (payload.type === 'error') {
            setErrorMessage(payload.message);
          }
        } catch {
          // Plain text log frame
          if (event.data && typeof event.data === 'string' && event.data.trim()) {
            const newEntry = parseRawDockerLogLine(event.data, selectedContainerForLogs.id);
            setLogs((prev) => [...prev.slice(-1000), newEntry]);
          }
        }
      };

      ws.onerror = () => {
        if (!isCancelled && ws?.readyState !== WebSocket.OPEN) {
          ws?.close();
          ws = null;
          startSseFallback();
        }
      };

      ws.onclose = () => {
        if (!isCancelled && isStreaming) {
          setStreamStatus('paused');
        }
      };
    } catch {
      startSseFallback();
    }

    return () => {
      isCancelled = true;
      if (ws) {
        ws.close();
        ws = null;
      }
      if (es) {
        es.close();
        es = null;
      }
    };
  }, [currentContainerId, isStreaming, tailCount, fetchLiveLogs]);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  if (!selectedContainerForLogs) return null;

  const filteredLogs = logs.filter((log) => {
    if (levelFilter !== 'ALL' && log.level !== levelFilter) return false;
    if (searchTerm.trim() !== '' && !log.message.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const handleDownloadLogs = () => {
    const textContent = logs.map((l) => l.message).join('\n');
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedContainerForLogs.name}-${selectedContainerForLogs.id.substring(0, 8)}-docker.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'ERROR':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      case 'WARN':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'DEBUG':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
      case 'SYSTEM':
        return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
      default:
        return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm text-slate-100 font-mono">
                  {selectedContainerForLogs.name}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  {selectedContainerForLogs.image}
                </span>

                {/* Target VM info badge */}
                {targetVm && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono border border-slate-700 flex items-center gap-1">
                    <Server className="w-2.5 h-2.5" />
                    <span>{targetVm.name} ({targetVm.ip})</span>
                  </span>
                )}

                {/* Real-time Socket Stream status indicator */}
                {streamStatus === 'connected' ? (
                  <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    <Wifi className="w-3 h-3 text-emerald-400 animate-pulse" />
                    <span>Live {streamProtocol} Active</span>
                  </span>
                ) : streamStatus === 'connecting' ? (
                  <span className="flex items-center gap-1.5 text-[10px] text-sky-400 font-mono bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                    <Activity className="w-3 h-3 animate-spin text-sky-400" />
                    <span>Connecting {streamProtocol}...</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                    <WifiOff className="w-3 h-3 text-slate-500" />
                    <span>Stream Paused</span>
                  </span>
                )}

                {/* Data Source pill */}
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  dataSourceType === 'live'
                    ? 'text-emerald-300 bg-emerald-950/60 border border-emerald-800/40'
                    : 'text-amber-300 bg-amber-950/60 border border-amber-800/40'
                }`}>
                  {dataSourceType === 'live' ? 'Docker Daemon Logs' : 'Emulated Logs'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Container ID: {selectedContainerForLogs.id} • State: <span className={selectedContainerForLogs.state === 'running' ? 'text-emerald-400' : 'text-slate-400'}>{selectedContainerForLogs.state}</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => setSelectedContainerForLogs(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error notification banner if any */}
        {errorMessage && (
          <div className="px-4 py-2 bg-amber-950/40 border-b border-amber-800/50 flex items-center gap-2 text-xs text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span className="font-mono">{errorMessage}</span>
            <button
              onClick={() => fetchLiveLogs(tailCount)}
              className="ml-auto underline hover:text-white text-xs"
            >
              Retry
            </button>
          </div>
        )}

        {/* Toolbar: Controls, Filters, Search */}
        <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          
          {/* Left: Stream Toggle, Auto-scroll, Re-fetch, Clear */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsStreaming(!isStreaming)}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
                isStreaming
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {isStreaming ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause Socket</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Resume Socket</span>
                </>
              )}
            </button>

            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
                autoScroll
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Auto-scroll: {autoScroll ? 'ON' : 'OFF'}</span>
            </button>

            {/* Re-fetch latest from Docker daemon */}
            <button
              onClick={() => fetchLiveLogs(tailCount)}
              disabled={isLoading}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-cyan-300 border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Query Docker daemon now for latest logs"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Fetching...' : 'Refresh'}</span>
            </button>

            <button
              onClick={() => setLogs([])}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors"
              title="Clear visible console"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>

          {/* Right: Search, Level filter, Tail, Download */}
          <div className="flex items-center gap-2">
            
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter logs regex/text..."
                className="pl-8 pr-3 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 w-36 sm:w-48"
              />
            </div>

            {/* Log Level Filter */}
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="ALL">All Levels</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
              <option value="DEBUG">DEBUG</option>
            </select>

            {/* Tail count selector */}
            <select
              value={tailCount}
              onChange={(e) => setTailCount(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="50">Tail 50</option>
              <option value="100">Tail 100</option>
              <option value="250">Tail 250</option>
              <option value="500">Tail 500</option>
              <option value="1000">Tail 1000</option>
            </select>

            {/* Download */}
            <button
              onClick={handleDownloadLogs}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors"
              title="Download raw logs file"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>

          </div>

        </div>

        {/* Terminal Log Console */}
        <div className="flex-1 bg-slate-950 p-4 font-mono text-xs overflow-y-auto space-y-1 select-text">
          {isLoading && logs.length === 0 ? (
            <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <RotateCw className="w-6 h-6 animate-spin text-cyan-400" />
              <p>Establishing real-time socket stream with container {selectedContainerForLogs.name}...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-20 text-center text-slate-600">
              <p>No log records matching filter.</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="leading-relaxed hover:bg-slate-900/60 px-1 py-0.5 rounded flex items-start gap-2">
                <span className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold shrink-0 border ${getLevelColor(log.level)}`}>
                  {log.level}
                </span>
                <span className="text-slate-300 break-all whitespace-pre-wrap">
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <span>Showing {filteredLogs.length} lines (buffer max: 1000)</span>
          <span className="text-slate-400 flex items-center gap-2">
            <span>Docker Engine: {targetVm?.dockerVersion || 'Live Client'}</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {streamStatus === 'connected' ? `Real-Time ${streamProtocol} Stream Active` : 'Polling / Static'}
            </span>
          </span>
        </div>

      </div>
    </div>
  );
};


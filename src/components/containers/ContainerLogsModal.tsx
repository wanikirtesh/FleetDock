import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  Download, 
  Trash2, 
  Search, 
  Filter, 
  ArrowDown, 
  Terminal, 
  CheckCircle2, 
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { generateInitialLogs, generateSingleLog } from '../../utils/logsGenerator';
import { LogEntry } from '../../types';

export const ContainerLogsModal: React.FC = () => {
  const { selectedContainerForLogs, setSelectedContainerForLogs } = useFleet();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'>('ALL');
  const [tailCount, setTailCount] = useState<number>(100);

  const logEndRef = useRef<HTMLDivElement>(null);

  // Initialize logs when container is selected
  useEffect(() => {
    if (selectedContainerForLogs) {
      const init = generateInitialLogs(selectedContainerForLogs.name, tailCount);
      setLogs(init);
    }
  }, [selectedContainerForLogs, tailCount]);

  // Streaming log interval
  useEffect(() => {
    if (!selectedContainerForLogs || !isStreaming || selectedContainerForLogs.state !== 'running') {
      return;
    }

    const interval = setInterval(() => {
      const newEntry = generateSingleLog(selectedContainerForLogs.name);
      setLogs((prev) => [...prev.slice(-300), newEntry]);
    }, 2400);

    return () => clearInterval(interval);
  }, [selectedContainerForLogs, isStreaming]);

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
    a.download = `${selectedContainerForLogs.name}-docker.log`;
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
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-100 font-mono">
                  {selectedContainerForLogs.name}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  {selectedContainerForLogs.image}
                </span>
                {isStreaming && selectedContainerForLogs.state === 'running' ? (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Live SSE Stream
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-mono">Stream Paused</span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Container ID: {selectedContainerForLogs.id}
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

        {/* Toolbar: Controls, Filters, Search */}
        <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          
          {/* Left: Stream Toggle, Auto-scroll, Clear */}
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
                  <span>Pause Stream</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Resume Stream</span>
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

            <button
              onClick={() => setLogs([])}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors"
              title="Clear visible logs"
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
          {filteredLogs.length === 0 ? (
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
          <span>Showing {filteredLogs.length} lines</span>
          <span className="text-slate-400">Spring Boot Docker-Java WebSocket / SSE stream active</span>
        </div>

      </div>
    </div>
  );
};

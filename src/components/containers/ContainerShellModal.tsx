import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Terminal, 
  CornerDownLeft, 
  Trash2, 
  Copy,
  Check,
  Server,
  RotateCw,
  AlertCircle
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { api } from '../../services/api';

interface TerminalLine {
  id: string;
  type: 'command' | 'output' | 'error' | 'system';
  text: string;
  exitCode?: number;
}

export const ContainerShellModal: React.FC = () => {
  const { selectedContainerForShell, setSelectedContainerForShell, vms } = useFleet();

  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [copied, setCopied] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const targetVm = vms.find((v) => v.id === selectedContainerForShell?.vmId);

  // Initialize terminal session
  useEffect(() => {
    if (selectedContainerForShell) {
      setLines([
        {
          id: 'sys-1',
          type: 'system',
          text: `Interactive Exec Session established with container ${selectedContainerForShell.name} (${selectedContainerForShell.id})`,
        },
        {
          id: 'sys-2',
          type: 'system',
          text: `Target Host: ${targetVm?.name || 'VM'} (${targetVm?.ip || '127.0.0.1'}) • Engine: ${targetVm?.dockerVersion || 'Docker Engine'}`,
        },
        {
          id: 'sys-3',
          type: 'output',
          text: `Connected to /bin/sh. Run any diagnostic command (e.g., 'ps aux', 'env', 'df -h', 'ls -la', 'netstat -tlpn').`,
        },
      ]);
    }
  }, [selectedContainerForShell, targetVm]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, isExecuting]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedContainerForShell]);

  if (!selectedContainerForShell) return null;

  const quickCommands = [
    'ps aux',
    'env',
    'df -h',
    'ls -la',
    'cat /etc/os-release',
    'netstat -tlpn',
    'uptime',
    'ip a',
    'uname -a',
    'id',
  ];

  const executeCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed || isExecuting) return;

    // Local clear command
    if (trimmed.toLowerCase() === 'clear') {
      setLines([]);
      setInputVal('');
      return;
    }

    // Add to command history
    setHistory((prev) => [...prev, trimmed]);
    setHistoryIdx(-1);
    setInputVal('');

    const cmdLineId = `cmd-${Date.now()}`;
    const cmdLine: TerminalLine = {
      id: cmdLineId,
      type: 'command',
      text: `root@${selectedContainerForShell.name}:/# ${trimmed}`,
    };

    setLines((prev) => [...prev, cmdLine]);
    setIsExecuting(true);

    try {
      const res = await api.execCommand(
        selectedContainerForShell.vmId,
        selectedContainerForShell.id,
        trimmed
      );

      setLines((prev) => [
        ...prev,
        {
          id: `out-${Date.now()}`,
          type: res.exitCode === 0 ? 'output' : 'error',
          text: res.output || '[Command exited with 0 and no output]',
          exitCode: res.exitCode,
        },
      ]);
    } catch (err: any) {
      setLines((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          type: 'error',
          text: `Failed to execute in container: ${err.message || 'Connection failed'}`,
          exitCode: 1,
        },
      ]);
    } finally {
      setIsExecuting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeCommand(inputVal);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const nextIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(nextIdx);
        setInputVal(history[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx !== -1) {
        const nextIdx = historyIdx + 1;
        if (nextIdx >= history.length) {
          setHistoryIdx(-1);
          setInputVal('');
        } else {
          setHistoryIdx(nextIdx);
          setInputVal(history[nextIdx]);
        }
      }
    }
  };

  const handleCopyOutput = () => {
    const fullText = lines.map((l) => l.text).join('\n');
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-4xl h-[82vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm text-slate-100 font-mono">
                  {selectedContainerForShell.name}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/30">
                  Interactive Exec Attached
                </span>
                {targetVm && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono border border-slate-700 flex items-center gap-1">
                    <Server className="w-2.5 h-2.5" />
                    <span>{targetVm.name} ({targetVm.ip})</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Container ID: {selectedContainerForShell.id} • Shell: /bin/sh • User: root
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyOutput}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Copy session output"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setLines([])}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Clear terminal buffer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSelectedContainerForShell(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Diagnostics Bar */}
        <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-slate-500 text-[11px] font-mono shrink-0">Quick Run:</span>
          {quickCommands.map((qc) => (
            <button
              key={qc}
              onClick={() => executeCommand(qc)}
              disabled={isExecuting}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-750 text-cyan-300 font-mono text-[11px] border border-slate-700 shrink-0 transition-colors disabled:opacity-50"
            >
              {qc}
            </button>
          ))}
        </div>

        {/* Console Output Screen */}
        <div 
          onClick={() => inputRef.current?.focus()}
          className="flex-1 bg-slate-950 p-4 font-mono text-xs overflow-y-auto space-y-1.5 text-slate-200 cursor-text select-text"
        >
          {lines.map((line) => {
            if (line.type === 'system') {
              return (
                <div key={line.id} className="text-cyan-400/90 text-[11px] italic">
                  [SYSTEM] {line.text}
                </div>
              );
            }
            if (line.type === 'command') {
              return (
                <div key={line.id} className="text-emerald-400 font-bold mt-2">
                  {line.text}
                </div>
              );
            }
            if (line.type === 'error') {
              return (
                <div key={line.id} className="whitespace-pre-wrap text-rose-400 pl-2 border-l border-rose-800/80 bg-rose-950/20 py-1">
                  {line.text}
                </div>
              );
            }
            return (
              <div key={line.id} className="whitespace-pre-wrap text-slate-300 pl-2 border-l border-slate-800">
                {line.text}
              </div>
            );
          })}

          {isExecuting && (
            <div className="flex items-center gap-2 text-cyan-400 text-[11px] pt-1">
              <RotateCw className="w-3.5 h-3.5 animate-spin" />
              <span>Executing command inside container namespace...</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Interactive CLI Input Line */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2 font-mono text-xs">
          <span className="text-emerald-400 font-bold shrink-0">
            root@{selectedContainerForShell.name}:/#
          </span>
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isExecuting}
            placeholder={isExecuting ? "Executing command..." : "Type container command (e.g., ls -la, ps aux, cat /etc/hosts)..."}
            className="flex-1 bg-transparent text-slate-100 focus:outline-none placeholder-slate-600 disabled:opacity-50"
          />
          <button
            onClick={() => executeCommand(inputVal)}
            disabled={!inputVal.trim() || isExecuting}
            className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 text-white text-xs flex items-center gap-1 transition-colors"
          >
            {isExecuting ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
            <span>{isExecuting ? 'Running' : 'Send'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};


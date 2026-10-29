import React, { useState, useRef, useEffect } from 'react';
import { X, Terminal, Trash2, Copy, Check, Server } from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { api } from '../../services/api';

interface Entry {
  id: number;
  prompt: string;
  command: string;
  output: string;
  exitCode: number | null;
  running: boolean;
}

const QUICK_COMMANDS = ['ps aux', 'env', 'df -h', 'ls -la', 'cat /etc/os-release', 'netstat -tlpn', 'uptime', 'ip a', 'uname -a', 'id'];

export const ContainerShellModal: React.FC = () => {
  const { selectedContainerForShell, setSelectedContainerForShell, vms } = useFleet();

  const [command, setCommand] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cwd, setCwd] = useState('/');
  const [recall, setRecall] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [copied, setCopied] = useState(false);

  const nextId = useRef(1);
  const draft = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  const container = selectedContainerForShell;
  const targetVm = vms.find((v) => v.id === container?.vmId);
  const busy = entries.some((e) => e.running);
  const history = entries.filter((e) => e.command).map((e) => e.command);

  const promptFor = (dir: string) => `root@${container?.name ?? ''}:${dir === '/root' ? '~' : dir}#`;

  useEffect(() => {
    setEntries([]);
    setCommand('');
    setCwd('/');
    setRecall(-1);
  }, [container?.id]);

  useEffect(() => {
    const el = screenRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, command]);

  useEffect(() => {
    if (container && !busy) inputRef.current?.focus();
  }, [container, busy]);

  if (!container) return null;

  const execute = async (raw: string) => {
    const cmd = raw.trim();
    setCommand('');
    setRecall(-1);
    const id = nextId.current++;
    const prompt = promptFor(cwd);

    if (!cmd) {
      setEntries((prev) => [...prev, { id, prompt, command: '', output: '', exitCode: null, running: false }]);
      return;
    }
    if (cmd === 'clear') {
      setEntries([]);
      return;
    }

    setEntries((prev) => [...prev, { id, prompt, command: cmd, output: '', exitCode: null, running: true }]);
    const update = (patch: Partial<Entry>) =>
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

    try {
      const res = await api.execCommand(container.vmId, container.id, cmd, cwd);
      if (res.cwd) setCwd(res.cwd);
      update({ output: res.output ?? '', exitCode: res.exitCode, running: false });
    } catch (err: any) {
      update({ output: `Failed to execute in container: ${err.message || 'Connection failed'}`, exitCode: 1, running: false });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!busy) void execute(command);
    } else if (e.key === 'ArrowUp' && history.length > 0) {
      e.preventDefault();
      if (recall === -1) draft.current = command;
      const next = Math.min(recall + 1, history.length - 1);
      setRecall(next);
      setCommand(history[history.length - 1 - next]);
    } else if (e.key === 'ArrowDown' && recall >= 0) {
      e.preventDefault();
      const next = recall - 1;
      setRecall(next);
      setCommand(next < 0 ? draft.current : history[history.length - 1 - next]);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      setEntries([]);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      setCommand('');
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
      e.preventDefault();
      const id = nextId.current++;
      setEntries((prev) => [...prev, { id, prompt: promptFor(cwd), command: `${command}^C`, output: '', exitCode: null, running: false }]);
      setCommand('');
      setRecall(-1);
    }
  };

  const handleCopyOutput = () => {
    const text = entries
      .map((e) => `${e.prompt} ${e.command}${e.output ? `\n${e.output}` : ''}`)
      .join('\n');
    navigator.clipboard.writeText(text);
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
                <span className="font-semibold text-sm text-slate-100 font-mono">{container.name}</span>
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
                Container ID: {container.id} • Shell: /bin/sh • User: root
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
              onClick={() => setEntries([])}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Clear terminal (Ctrl+L)"
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
          {QUICK_COMMANDS.map((qc) => (
            <button
              key={qc}
              onClick={() => void execute(qc)}
              disabled={busy}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-[11px] border border-slate-700 shrink-0 transition-colors disabled:opacity-50"
            >
              {qc}
            </button>
          ))}
        </div>

        {/* Terminal screen */}
        <div
          ref={screenRef}
          onClick={() => {
            if (!window.getSelection()?.toString()) inputRef.current?.focus();
          }}
          className="flex-1           bg-[#0b0f14] font-mono text-[12px] leading-relaxed overflow-y-auto p-4 cursor-text text-[#e5e7eb]"
        >
          <div className="text-slate-500 mb-1">
            Attached to {container.name} ({container.id}) on {targetVm?.name || 'VM'}. Each command runs in the current directory; ↑/↓ history, Ctrl+L clear.
          </div>

          {entries.map((e) => (
            <div key={e.id}>
              <div className="whitespace-pre-wrap break-all">
                <span className="text-[#4ade80]">{e.prompt}</span> <span className="text-[#f9fafb]">{e.command}</span>
              </div>
              {e.running && <div className="text-slate-500 animate-pulse">…</div>}
              {!e.running && e.output && (
                <pre className={`whitespace-pre-wrap break-words ${e.exitCode ? 'text-[#fda4af]' : 'text-[#e5e7eb]'}`}>
                  {e.output}
                </pre>
              )}
            </div>
          ))}

          <div className="flex items-center whitespace-pre-wrap break-all">
            <span className="text-[#4ade80] shrink-0">{promptFor(cwd)}&nbsp;</span>
            <span className="relative flex-1 min-w-0">
              <span className="whitespace-pre">{command}</span>
              {focused && !busy && <span className="inline-block w-[7px] h-[14px] align-middle bg-[#e5e7eb] animate-pulse" />}
              <input
                ref={inputRef}
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                disabled={busy}
                autoFocus
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Container terminal input"
                className="absolute inset-0 w-full opacity-0 cursor-text"
              />
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};

import React, { useRef, useState, useEffect } from 'react';
import { Play, Trash2, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { VMHost } from '../../types';

interface Entry {
  id: number;
  command: string;
  output: string;
  exitCode: number | null;
  durationMs: number | null;
  running: boolean;
}

interface Props {
  vm: VMHost;
  isBackendConnected: boolean;
}

export const VmCommandPanel: React.FC<Props> = ({ vm, isBackendConnected }) => {
  const [command, setCommand] = useState('');
  const [useSudo, setUseSudo] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [recall, setRecall] = useState(-1);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [entries]);

  const run = async () => {
    const cmd = command.trim();
    if (!cmd) return;
    const id = nextId.current++;
    setEntries((prev) => [...prev, { id, command: cmd, output: '', exitCode: null, durationMs: null, running: true }]);
    setCommand('');
    setRecall(-1);
    const started = Date.now();
    const update = (patch: Partial<Entry>) =>
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

    if (!isBackendConnected) {
      update({ output: 'Backend is offline; commands can only run when connected.', exitCode: 1, running: false });
      return;
    }
    try {
      const res = await api.execHostCommand(vm.id, cmd, useSudo);
      update({ output: res.output ?? '', exitCode: res.exitCode, durationMs: Date.now() - started, running: false });
    } catch (err: any) {
      update({ output: err.message || 'Command failed', exitCode: 1, durationMs: Date.now() - started, running: false });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void run();
    } else if (e.key === 'ArrowUp' && entries.length > 0) {
      e.preventDefault();
      const next = Math.min(recall + 1, entries.length - 1);
      setRecall(next);
      setCommand(entries[entries.length - 1 - next].command);
    } else if (e.key === 'ArrowDown' && recall >= 0) {
      e.preventDefault();
      const next = recall - 1;
      setRecall(next);
      setCommand(next < 0 ? '' : entries[entries.length - 1 - next].command);
    }
  };

  const busy = entries.some((e) => e.running);

  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-black/70 border border-slate-800 font-mono text-[11px] h-48 overflow-y-auto p-2 space-y-2">
        {entries.length === 0 && (
          <div className="text-slate-500">
            Run a shell command on {vm.name} ({vm.ip}). Output appears here.
          </div>
        )}
        {entries.map((e) => (
          <div key={e.id}>
            <div className="text-cyan-300">
              $ {e.command}
            </div>
            {e.running ? (
              <div className="text-slate-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> running...
              </div>
            ) : (
              <>
                {e.output && (
                  <pre className={`whitespace-pre-wrap break-words ${e.exitCode ? 'text-rose-300' : 'text-slate-200'}`}>
                    {e.output}
                  </pre>
                )}
                <div className={e.exitCode ? 'text-rose-400' : 'text-emerald-400'}>
                  exit {e.exitCode}
                  {e.durationMs !== null && ` • ${e.durationMs}ms`}
                </div>
              </>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="e.g. df -h, uptime, docker ps"
          spellCheck={false}
          className="flex-1 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
        />
        <label className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
          <input type="checkbox" checked={useSudo} onChange={(e) => setUseSudo(e.target.checked)} />
          sudo
        </label>
        <button
          onClick={() => void run()}
          disabled={busy || !command.trim()}
          className="px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs flex items-center gap-1 disabled:opacity-50"
        >
          <Play className="w-3 h-3" />
          <span>Run</span>
        </button>
        <button
          onClick={() => setEntries([])}
          title="Clear output"
          className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

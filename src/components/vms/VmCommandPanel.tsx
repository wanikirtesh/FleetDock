import React, { useRef, useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { VMHost } from '../../types';

interface Entry {
  id: number;
  prompt: string;
  command: string;
  output: string;
  exitCode: number | null;
  running: boolean;
}

interface Props {
  vm: VMHost;
  isBackendConnected: boolean;
}

export const VmCommandPanel: React.FC<Props> = ({ vm, isBackendConnected }) => {
  const username = vm.authPayload?.username || 'root';
  const [command, setCommand] = useState('');
  const [useSudo, setUseSudo] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cwd, setCwd] = useState<string | null>(null);
  const [recall, setRecall] = useState(-1);
  const [focused, setFocused] = useState(false);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const draft = useRef('');

  const user = useSudo ? 'root' : username;
  const home = user === 'root' ? '/root' : `/home/${user}`;
  const shownCwd = cwd === null ? '~' : cwd === home ? '~' : cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd;
  const promptFor = (dir: string) => `${user}@${vm.name}:${dir}${user === 'root' ? '#' : '$'}`;
  const prompt = promptFor(shownCwd);

  useEffect(() => {
    const el = screenRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, command]);

  const history = entries.filter((e) => e.command).map((e) => e.command);
  const busy = entries.some((e) => e.running);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);
  const run = async () => {
    const cmd = command.trim();
    setCommand('');
    setRecall(-1);
    const id = nextId.current++;

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

    if (!isBackendConnected) {
      update({ output: 'Backend is offline; commands can only run when connected.', exitCode: 1, running: false });
      return;
    }
    try {
      const res = await api.execHostCommand(vm.id, cmd, useSudo, cwd ?? undefined);
      if (res.cwd) setCwd(res.cwd);
      update({ output: res.output ?? '', exitCode: res.exitCode, running: false });
    } catch (err: any) {
      update({ output: err.message || 'Command failed', exitCode: 1, running: false });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!busy) void run();
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
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      const id = nextId.current++;
      setEntries((prev) => [...prev, { id, prompt, command: `${command}^C`, output: '', exitCode: null, running: false }]);
      setCommand('');
      setRecall(-1);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      setCommand('');
    }
  };

  return (
    <div className="rounded-lg overflow-hidden border border-slate-800 shadow-lg">
      <div className="flex items-center justify-between bg-slate-800 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="ml-2 text-[11px] font-mono text-slate-300">
            {user}@{vm.name} — {vm.ip}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-[11px] text-slate-400">
            <input type="checkbox" checked={useSudo} onChange={(e) => setUseSudo(e.target.checked)} />
            sudo
          </label>
          <button
            onClick={() => setEntries([])}
            title="Clear (Ctrl+L)"
            className="text-slate-400 hover:text-rose-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={screenRef}
        onClick={() => {
          if (!window.getSelection()?.toString()) inputRef.current?.focus();
        }}
        className="bg-[#0b0f14] font-mono text-[12px] leading-relaxed h-64 overflow-y-auto p-3 cursor-text text-[#e5e7eb]"
      >
        {entries.length === 0 && (
          <div className="text-slate-500 mb-1">
            Connected to {vm.name} ({vm.ip}). Each command runs in the current directory; ↑/↓ history, Ctrl+L clear.
          </div>
        )}
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
          <span className="text-[#4ade80] shrink-0">{prompt}&nbsp;</span>
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
              aria-label="Terminal input"
              className="absolute inset-0 w-full opacity-0 cursor-text"
            />
          </span>
        </div>
      </div>
    </div>
  );
};

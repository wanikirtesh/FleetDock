import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Terminal, 
  CornerDownLeft, 
  Trash2, 
  Play, 
  HelpCircle,
  Copy,
  Check
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';

interface TerminalLine {
  id: string;
  type: 'command' | 'output' | 'error' | 'system';
  text: string;
}

export const ContainerShellModal: React.FC = () => {
  const { selectedContainerForShell, setSelectedContainerForShell } = useFleet();

  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [copied, setCopied] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize terminal session
  useEffect(() => {
    if (selectedContainerForShell) {
      setLines([
        {
          id: 'sys-1',
          type: 'system',
          text: `Connected to Docker daemon on target VM. Attached /bin/sh to ${selectedContainerForShell.name} (${selectedContainerForShell.id})`,
        },
        {
          id: 'sys-2',
          type: 'system',
          text: `Linux ${selectedContainerForShell.name} 6.6.137-linuxkit #1 SMP PREEMPT_DYNAMIC aarch64`,
        },
        {
          id: 'sys-3',
          type: 'output',
          text: `Type 'help' for available diagnostic commands or test 'env', 'ps aux', 'df -h', 'actuator/health'.`,
        },
      ]);
    }
  }, [selectedContainerForShell]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedContainerForShell]);

  if (!selectedContainerForShell) return null;

  const quickCommands = [
    'ps aux',
    'env',
    'df -h',
    'top -b -n 1',
    'curl -I localhost:8080/health',
    'cat /etc/os-release',
    'netstat -tlpn',
  ];

  const executeCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    // Add to history
    setHistory((prev) => [...prev, trimmed]);
    setHistoryIdx(-1);

    const cmdLine: TerminalLine = {
      id: `cmd-${Date.now()}`,
      type: 'command',
      text: `root@${selectedContainerForShell.name}:/# ${trimmed}`,
    };

    let responseText = '';
    let responseType: TerminalLine['type'] = 'output';

    const lower = trimmed.toLowerCase();

    if (lower === 'help') {
      responseText = `Available diagnostic commands:
  - ps aux          : Display running processes and PIDs
  - env             : Inspect runtime container environment variables
  - df -h           : Show disk mount capacity and storage usage
  - top -b -n 1     : Snapshot CPU and Memory utilization per process
  - cat /etc/os-release : Display base OS distribution information
  - netstat -tlpn   : List active listening TCP/UDP sockets and ports
  - curl -I localhost:8080/health : Probe internal HTTP endpoints
  - clear           : Wipe terminal screen
  - uptime          : Display container uptime and load average`;
    } else if (lower === 'clear') {
      setLines([]);
      setInputVal('');
      return;
    } else if (lower === 'env') {
      const entries = Object.entries(selectedContainerForShell.envVars);
      if (entries.length === 0) {
        responseText = `HOSTNAME=${selectedContainerForShell.name}
SHLVL=1
HOME=/root
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
TERM=xterm-256color`;
      } else {
        responseText = entries.map(([k, v]) => `${k}=${v}`).join('\n') + `\nHOSTNAME=${selectedContainerForShell.name}\nPATH=/usr/local/bin:/usr/bin:/bin`;
      }
    } else if (lower.startsWith('ps')) {
      if (selectedContainerForShell.image.includes('spring') || selectedContainerForShell.name.includes('billing')) {
        responseText = `USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root           1  3.4 15.2 3824912 496640 ?      Ssl  10:00   4:21 java -jar /app/application.jar --spring.profiles.active=prod
root          42  0.0  0.1   4120  1820 pts/0    Ss+  10:05   0:00 /bin/sh
root          98  0.0  0.0   6200  1240 pts/0    R+   10:45   0:00 ps aux`;
      } else if (selectedContainerForShell.image.includes('postgres')) {
        responseText = `USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
postgres       1 14.2 27.8 8940120 914020 ?      Ssl  Oct07  48:12 postgres -D /var/lib/postgresql/data
postgres      24  0.1  0.2 120400  4120 ?        Ss   Oct07   0:15 postgres: checkpointer
postgres      25  0.2  0.5 124500  8410 ?        Ss   Oct07   1:12 postgres: background writer
postgres      26  0.1  0.3 121000  4900 ?        Ss   Oct07   0:40 postgres: walwriter
postgres      27  0.4  0.8 128000 12400 ?        Ss   Oct07   2:19 postgres: autovacuum launcher`;
      } else {
        responseText = `USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root           1  0.9  1.2  24120 18400 ?        Ss   10:00   0:12 ${selectedContainerForShell.command}
root          55  0.0  0.1   4812  2100 pts/0    R+   10:45   0:00 ps aux`;
      }
    } else if (lower.startsWith('df')) {
      responseText = `Filesystem     1K-blocks      Used Available Use% Mounted on
overlay         61255492  12480120  45638144  22% /
tmpfs              65536         0     65536   0% /dev
shm                65536         0     65536   0% /dev/shm
/dev/vda1       61255492  12480120  45638144  22% /etc/hosts`;
    } else if (lower.startsWith('cat /etc/os-release')) {
      responseText = `NAME="Alpine Linux"
ID=alpine
VERSION_ID=3.20.2
PRETTY_NAME="Alpine Linux v3.20"
HOME_URL="https://alpinelinux.org/"
BUG_REPORT_URL="https://gitlab.alpinelinux.org/alpine/aports/-/issues"`;
    } else if (lower.includes('curl') || lower.includes('health')) {
      responseText = `HTTP/1.1 200 OK
Content-Type: application/vnd.spring-boot.actuator.v3+json
Transfer-Encoding: chunked
Date: ${new Date().toUTCString()}

{"status":"UP","components":{"diskSpace":{"status":"UP","details":{"total":53687091200,"free":41875456000,"threshold":10485760}},"ping":{"status":"UP"}}}`;
    } else if (lower.startsWith('uptime')) {
      responseText = ` 10:45:12 up 14 days, 3:28, 0 users, load average: 0.24, 0.18, 0.15`;
    } else if (lower.startsWith('top')) {
      responseText = `Mem: 485120K used, 538880K free, 31200K shrd, 24100K buff, 184500K cached
CPU:   2.8% usr   1.2% sys   0.0% nic  95.8% idle   0.2% io   0.0% irq   0.0% sirq
Load average: 0.21 0.17 0.14 2/84 102
  PID  PPID USER     STAT   VSZ %VSZ CPU %CPU COMMAND
    1     0 root     S     3.6g  72%   0  3.4% java -jar app.jar
   42     1 root     S     4120   1%   1  0.0% /bin/sh`;
    } else if (lower.startsWith('netstat')) {
      responseText = `Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:${selectedContainerForShell.ports[0]?.containerPort || 8080}       0.0.0.0:*               LISTEN      1/java
tcp        0      0 :::${selectedContainerForShell.ports[0]?.containerPort || 8080}          :::*                    LISTEN      1/java`;
    } else {
      responseText = `Executing: ${trimmed}
[exit code: 0] Done.`;
    }

    setLines((prev) => [
      ...prev,
      cmdLine,
      {
        id: `out-${Date.now()}`,
        type: responseType,
        text: responseText,
      },
    ]);

    setInputVal('');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-100 font-mono">
                  {selectedContainerForShell.name}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/30">
                  TTY Exec Session Active
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Shell: /bin/sh • TTY: pts/0 • User: root
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
          <span className="text-slate-500 text-[11px] font-mono shrink-0">Quick Commands:</span>
          {quickCommands.map((qc) => (
            <button
              key={qc}
              onClick={() => executeCommand(qc)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-750 text-cyan-300 font-mono text-[11px] border border-slate-700 shrink-0 transition-colors"
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
                <div key={line.id} className="text-emerald-400 font-bold">
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
            placeholder="Type container command..."
            className="flex-1 bg-transparent text-slate-100 focus:outline-none placeholder-slate-600"
          />
          <button
            onClick={() => executeCommand(inputVal)}
            disabled={!inputVal.trim()}
            className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 text-white text-xs flex items-center gap-1 transition-colors"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </div>

      </div>
    </div>
  );
};

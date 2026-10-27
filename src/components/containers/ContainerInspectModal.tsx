import React, { useState } from 'react';
import { 
  X, 
  Info, 
  Copy, 
  Check, 
  Layers, 
  HardDrive, 
  Network, 
  Sliders, 
  Code 
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';

export const ContainerInspectModal: React.FC = () => {
  const { selectedContainerForInspect, setSelectedContainerForInspect, vms } = useFleet();
  const [activeTab, setActiveTab] = useState<'overview' | 'env' | 'storage' | 'network' | 'json'>('overview');
  const [copied, setCopied] = useState(false);

  if (!selectedContainerForInspect) return null;

  const targetHost = vms.find((v) => v.id === selectedContainerForInspect.vmId);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(selectedContainerForInspect, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-100 font-mono">
                  {selectedContainerForInspect.name}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">
                  Inspect Metadata
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Host: {targetHost?.name || selectedContainerForInspect.vmId} ({targetHost?.ip})
              </p>
            </div>
          </div>

          <button
            onClick={() => setSelectedContainerForInspect(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800 flex items-center gap-2 text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'overview'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('env')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'env'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Environment ({Object.keys(selectedContainerForInspect.envVars).length})
          </button>
          <button
            onClick={() => setActiveTab('storage')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'storage'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mounts & Storage ({selectedContainerForInspect.mounts.length})
          </button>
          <button
            onClick={() => setActiveTab('network')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'network'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Network & Ports ({selectedContainerForInspect.ports.length})
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'json'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Raw JSON
          </button>
        </div>

        {/* Content body */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4 text-xs sm:text-sm">
          
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">Image Name & Tag</span>
                  <div className="font-mono text-slate-200 break-all">{selectedContainerForInspect.image}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">Status & State</span>
                  <div className="font-mono text-emerald-400 font-semibold">{selectedContainerForInspect.statusText}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">Restart Policy</span>
                  <div className="font-mono text-slate-200 capitalize">{selectedContainerForInspect.restartPolicy}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">Created On</span>
                  <div className="font-mono text-slate-200">{selectedContainerForInspect.created}</div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
                <span className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">Entrypoint Command</span>
                <div className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-xs text-cyan-300 break-all">
                  {selectedContainerForInspect.command}
                </div>
              </div>

              {selectedContainerForInspect.composeStack && (
                <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/40 space-y-1">
                  <span className="text-[11px] text-indigo-300 uppercase tracking-wider font-mono">Orchestrated by Compose Stack</span>
                  <div className="font-mono text-indigo-200 font-semibold">{selectedContainerForInspect.composeStack}</div>
                </div>
              )}
            </div>
          )}

          {/* Environment Variables Tab */}
          {activeTab === 'env' && (
            <div className="space-y-3">
              {Object.keys(selectedContainerForInspect.envVars).length === 0 ? (
                <p className="text-slate-500 text-center py-8">No custom environment variables defined for this container.</p>
              ) : (
                <div className="rounded-lg border border-slate-800 overflow-hidden font-mono text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">Variable Key</th>
                        <th className="p-2.5">Evaluated Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {Object.entries(selectedContainerForInspect.envVars).map(([key, val]) => (
                        <tr key={key} className="hover:bg-slate-950/40">
                          <td className="p-2.5 font-semibold text-cyan-400">{key}</td>
                          <td className="p-2.5 text-slate-300 break-all">{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Mounts & Storage Tab */}
          {activeTab === 'storage' && (
            <div className="space-y-3">
              {selectedContainerForInspect.mounts.length === 0 ? (
                <p className="text-slate-500 text-center py-8">No persistent volumes or host directories mounted.</p>
              ) : (
                <div className="space-y-2">
                  {selectedContainerForInspect.mounts.map((m, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 text-xs font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-cyan-400 font-bold uppercase">{m.type} Mount ({m.mode})</span>
                      </div>
                      <div className="text-slate-400">
                        Host Source: <span className="text-slate-200">{m.source}</span>
                      </div>
                      <div className="text-slate-400">
                        Container Target: <span className="text-slate-200">{m.target}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Network & Ports Tab */}
          {activeTab === 'network' && (
            <div className="space-y-3">
              {selectedContainerForInspect.ports.length === 0 ? (
                <p className="text-slate-500 text-center py-8">No public host ports exposed.</p>
              ) : (
                <div className="rounded-lg border border-slate-800 overflow-hidden font-mono text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">Host Port</th>
                        <th className="p-2.5">Container Port</th>
                        <th className="p-2.5">Protocol</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {selectedContainerForInspect.ports.map((p, idx) => (
                        <tr key={idx} className="hover:bg-slate-950/40">
                          <td className="p-2.5 text-emerald-400 font-semibold">{p.hostPort}</td>
                          <td className="p-2.5 text-slate-200">{p.containerPort}</td>
                          <td className="p-2.5 text-slate-400 uppercase">{p.protocol}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Raw JSON Tab */}
          {activeTab === 'json' && (
            <div className="relative">
              <button
                onClick={handleCopyJson}
                className="absolute top-2 right-2 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 border border-slate-700 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy JSON'}</span>
              </button>
              <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto">
                {JSON.stringify(selectedContainerForInspect, null, 2)}
              </pre>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

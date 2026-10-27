import React, { useState, useEffect } from 'react';
import { 
  X, 
  Info, 
  Copy, 
  Check, 
  Layers, 
  HardDrive, 
  Network, 
  Sliders, 
  Code,
  Loader2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Server
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { api } from '../../services/api';

export const ContainerInspectModal: React.FC = () => {
  const { selectedContainerForInspect, setSelectedContainerForInspect, vms } = useFleet();
  const [activeTab, setActiveTab] = useState<'overview' | 'env' | 'storage' | 'network' | 'json'>('overview');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspectData, setInspectData] = useState<any>(null);

  useEffect(() => {
    if (!selectedContainerForInspect) {
      setInspectData(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    api.inspectContainer(selectedContainerForInspect.vmId, selectedContainerForInspect.id)
      .then((data) => {
        if (isMounted) {
          setInspectData(data);
          setIsLoading(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          console.warn('Live inspect query failed:', err.message);
          setError(err.message || 'Could not fetch live inspection from Docker daemon');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedContainerForInspect?.id, selectedContainerForInspect?.vmId]);

  if (!selectedContainerForInspect) return null;

  const targetHost = vms.find((v) => v.id === selectedContainerForInspect.vmId);

  // Parse Environment Variables from Inspect (Config.Env) or Container summary
  const parsedEnvVars: Record<string, string> = { ...(selectedContainerForInspect.envVars || {}) };
  if (inspectData?.Config?.Env && Array.isArray(inspectData.Config.Env)) {
    for (const item of inspectData.Config.Env) {
      const eqIdx = item.indexOf('=');
      if (eqIdx > 0) {
        const k = item.substring(0, eqIdx);
        const v = item.substring(eqIdx + 1);
        parsedEnvVars[k] = v;
      }
    }
  } else if (inspectData?.envVars && typeof inspectData.envVars === 'object') {
    Object.assign(parsedEnvVars, inspectData.envVars);
  }

  // Parse Mounts & Storage from Inspect (Mounts and HostConfig.Binds)
  interface ParsedMount {
    source: string;
    target: string;
    type: string;
    mode: string;
    driver?: string;
  }
  const parsedMounts: ParsedMount[] = [];
  const seenMountPairs = new Set<string>();

  if (selectedContainerForInspect.mounts) {
    for (const m of selectedContainerForInspect.mounts) {
      const key = `${m.source}->${m.target}`;
      if (!seenMountPairs.has(key)) {
        seenMountPairs.add(key);
        parsedMounts.push({
          source: m.source,
          target: m.target,
          type: m.type,
          mode: m.mode,
        });
      }
    }
  }

  if (inspectData?.Mounts && Array.isArray(inspectData.Mounts)) {
    for (const m of inspectData.Mounts) {
      const src = m.Source || m.source || '';
      const tgt = m.Destination || m.target || '';
      const key = `${src}->${tgt}`;
      if (!seenMountPairs.has(key)) {
        seenMountPairs.add(key);
        parsedMounts.push({
          source: src,
          target: tgt,
          type: m.Type || m.type || 'volume',
          mode: m.Mode || (m.RW ? 'rw' : 'ro'),
          driver: m.Driver,
        });
      }
    }
  }

  if (inspectData?.HostConfig?.Binds && Array.isArray(inspectData.HostConfig.Binds)) {
    for (const bind of inspectData.HostConfig.Binds) {
      const parts = bind.split(':');
      if (parts.length >= 2) {
        const src = parts[0];
        const tgt = parts[1];
        const mode = parts[2] || 'rw';
        const key = `${src}->${tgt}`;
        if (!seenMountPairs.has(key)) {
          seenMountPairs.add(key);
          parsedMounts.push({
            source: src,
            target: tgt,
            type: 'bind',
            mode,
          });
        }
      }
    }
  }

  // Parse Network Settings
  const netSettings = inspectData?.NetworkSettings || {};
  const networksMap = netSettings.Networks || {};
  const primaryIp = netSettings.IPAddress || (Object.values(networksMap)[0] as any)?.IPAddress || '172.19.0.4';
  const primaryGateway = netSettings.Gateway || (Object.values(networksMap)[0] as any)?.Gateway || '172.19.0.1';
  const macAddress = netSettings.MacAddress || (Object.values(networksMap)[0] as any)?.MacAddress || '02:42:ac:13:00:04';

  const fullDataForCopy = inspectData || {
    ...selectedContainerForInspect,
    envVars: parsedEnvVars,
    mounts: parsedMounts,
    networkSettings: {
      ipAddress: primaryIp,
      gateway: primaryGateway,
      macAddress,
      networks: Object.keys(networksMap),
    },
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(fullDataForCopy, null, 2));
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
                  Container Inspect
                </span>
                {isLoading && (
                  <span className="flex items-center gap-1 text-[10px] text-cyan-400 font-mono">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Querying daemon...
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Host: {targetHost?.name || selectedContainerForInspect.vmId} ({targetHost?.ip}) • ID: {selectedContainerForInspect.id}
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
        <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800 flex items-center gap-2 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('env')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeTab === 'env'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Environment ({Object.keys(parsedEnvVars).length})
          </button>
          <button
            onClick={() => setActiveTab('storage')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeTab === 'storage'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mounts & Storage ({parsedMounts.length})
          </button>
          <button
            onClick={() => setActiveTab('network')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeTab === 'network'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Network & Ports ({selectedContainerForInspect.ports.length})
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
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
                  <div className="font-mono text-slate-200 break-all">{inspectData?.Config?.Image || selectedContainerForInspect.image}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">Status & State</span>
                  <div className="font-mono text-emerald-400 font-semibold">{inspectData?.State?.Status || selectedContainerForInspect.statusText}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">Restart Policy</span>
                  <div className="font-mono text-slate-200 capitalize">
                    {inspectData?.HostConfig?.RestartPolicy?.Name || selectedContainerForInspect.restartPolicy}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">Created On</span>
                  <div className="font-mono text-slate-200">
                    {inspectData?.Created ? new Date(inspectData.Created).toLocaleString() : selectedContainerForInspect.created}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
                <span className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">Entrypoint Command</span>
                <div className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-xs text-cyan-300 break-all">
                  {inspectData?.Path ? `${inspectData.Path} ${(inspectData.Args || []).join(' ')}` : selectedContainerForInspect.command}
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
              {Object.keys(parsedEnvVars).length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <Sliders className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
                  <p>No environment variables defined for this container.</p>
                </div>
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
                      {Object.entries(parsedEnvVars).map(([key, val]) => (
                        <tr key={key} className="hover:bg-slate-950/40">
                          <td className="p-2.5 font-semibold text-cyan-400 select-all">{key}</td>
                          <td className="p-2.5 text-slate-300 break-all select-all font-mono">
                            {key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') ? (
                              <span className="text-amber-300/80">{val}</span>
                            ) : (
                              val
                            )}
                          </td>
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
              {parsedMounts.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
                  <p>No persistent volumes or host directories mounted for this container.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {parsedMounts.map((m, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5 text-xs font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-cyan-400 font-bold uppercase tracking-wider">
                          {m.type} Mount {m.driver ? `(${m.driver})` : ''}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${m.mode === 'rw' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-300'}`}>
                          {m.mode.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-slate-400">
                        Host Source: <span className="text-slate-200 select-all break-all">{m.source}</span>
                      </div>
                      <div className="text-slate-400">
                        Container Target: <span className="text-slate-200 select-all break-all">{m.target}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Network & Ports Tab */}
          {activeTab === 'network' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 font-mono text-xs">
                  <span className="text-[10px] text-slate-500 uppercase">IP Address</span>
                  <div className="text-cyan-400 font-semibold">{primaryIp}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 font-mono text-xs">
                  <span className="text-[10px] text-slate-500 uppercase">Gateway</span>
                  <div className="text-slate-300 font-semibold">{primaryGateway}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 font-mono text-xs">
                  <span className="text-[10px] text-slate-500 uppercase">MAC Address</span>
                  <div className="text-slate-300">{macAddress}</div>
                </div>
              </div>

              {Object.keys(networksMap).length > 0 && (
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono">
                  <span className="text-[10px] text-slate-500 uppercase">Attached Docker Networks</span>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(networksMap).map((netName) => (
                      <span key={netName} className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-cyan-300">
                        {netName}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedContainerForInspect.ports.length === 0 ? (
                <p className="text-slate-500 text-center py-4">No public host ports exposed for this container.</p>
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
                className="absolute top-2 right-2 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 border border-slate-700 transition-colors shadow-sm"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy JSON'}</span>
              </button>
              <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto max-h-[50vh]">
                {JSON.stringify(fullDataForCopy, null, 2)}
              </pre>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

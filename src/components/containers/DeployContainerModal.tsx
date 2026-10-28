import React, { useState } from 'react';
import { 
  X, 
  Boxes, 
  Plus, 
  Trash2, 
  Server, 
  Layers, 
  Sliders, 
  Check, 
  Loader2 
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';

export const DeployContainerModal: React.FC = () => {
  const { 
    isDeployModalOpen, 
    setIsDeployModalOpen, 
    vms, 
    selectedVmId, 
    deployContainer 
  } = useFleet();

  const [targetVmId, setTargetVmId] = useState<string>(() => {
    return selectedVmId !== 'all' && !selectedVmId.startsWith('group:') ? selectedVmId : (vms[0]?.id || '');
  });

  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [hostPort, setHostPort] = useState('');
  const [containerPort, setContainerPort] = useState('');
  const [command, setCommand] = useState('');
  const [restartPolicy, setRestartPolicy] = useState<'always' | 'unless-stopped' | 'on-failure' | 'no'>('always');
  const [memLimitMb, setMemLimitMb] = useState(512);

  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>([
    { key: 'ENV', value: 'production' }
  ]);

  const [isDeploying, setIsDeploying] = useState(false);

  if (!isDeployModalOpen) return null;

  const quickPresets = [
    { label: 'Spring Boot App', img: 'registry.internal.net/spring-service:1.0', port: '8080' },
    { label: 'NGINX Alpine', img: 'nginx:1.27-alpine', port: '80' },
    { label: 'Redis 7', img: 'redis:7.2-alpine', port: '6379' },
    { label: 'PostgreSQL 16', img: 'postgres:16-alpine', port: '5432' },
    { label: 'Node.js 20', img: 'node:20-alpine', port: '3000' },
  ];

  const handleApplyPreset = (preset: typeof quickPresets[0]) => {
    setImage(preset.img);
    if (!name) {
      setName(preset.label.toLowerCase().replace(/[^a-z0-9]/g, '-'));
    }
    setContainerPort(preset.port);
    if (!hostPort) {
      setHostPort(preset.port);
    }
  };

  const handleAddEnv = () => {
    setEnvPairs([...envPairs, { key: '', value: '' }]);
  };

  const handleRemoveEnv = (index: number) => {
    setEnvPairs(envPairs.filter((_, i) => i !== index));
  };

  const handleEnvChange = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...envPairs];
    updated[index][field] = val;
    setEnvPairs(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetVmId || !name || !image) return;

    setIsDeploying(true);

    const envMap: Record<string, string> = {};
    envPairs.forEach((p) => {
      if (p.key.trim()) envMap[p.key.trim()] = p.value;
    });

    const ports: { hostPort: number; containerPort: number; protocol: 'tcp' | 'udp' }[] = [];
    if (hostPort && containerPort) {
      ports.push({
        hostPort: parseInt(hostPort, 10),
        containerPort: parseInt(containerPort, 10),
        protocol: 'tcp' as const,
      });
    }

    setTimeout(() => {
      deployContainer({
        vmId: targetVmId,
        name: name.trim(),
        image: image.trim(),
        ports,
        command: command.trim() || undefined,
        envVars: envMap,
        restartPolicy,
        memLimitMb,
      });
      setIsDeploying(false);
      setIsDeployModalOpen(false);
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-100">
                Deploy New Container
              </h3>
              <p className="text-xs text-slate-400">
                Pull and instantiate a container on any registered VM via Docker API
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsDeployModalOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4 text-xs sm:text-sm">
          
          {/* Quick Preset Badges */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Quick Image Templates:
            </label>
            <div className="flex flex-wrap gap-2">
              {quickPresets.map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  onClick={() => handleApplyPreset(preset)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-cyan-300 border border-slate-700 text-xs font-mono transition-colors"
                >
                  + {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target VM Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Target VM Host Node <span className="text-rose-400">*</span>
            </label>
            <select
              value={targetVmId}
              onChange={(e) => setTargetVmId(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs sm:text-sm focus:outline-none focus:border-cyan-500"
            >
              {vms.map((vm) => (
                <option key={vm.id} value={vm.id}>
                  {vm.name} ({vm.ip}) — {vm.os} ({vm.environment})
                </option>
              ))}
            </select>
          </div>

          {/* Container Name & Image */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Container Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. spring-auth-service"
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-600 text-xs sm:text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Docker Image Tag <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="e.g. nginx:alpine or redis:7"
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-600 text-xs sm:text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Port Bindings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Host Port (Public)
              </label>
              <input
                type="number"
                value={hostPort}
                onChange={(e) => setHostPort(e.target.value)}
                placeholder="e.g. 8080"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-600 text-xs sm:text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Container Port
              </label>
              <input
                type="number"
                value={containerPort}
                onChange={(e) => setContainerPort(e.target.value)}
                placeholder="e.g. 80"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-600 text-xs sm:text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Restart Policy & Memory */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Restart Policy
              </label>
              <select
                value={restartPolicy}
                onChange={(e) => setRestartPolicy(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs sm:text-sm focus:outline-none focus:border-cyan-500"
              >
                <option value="always">always (always restart)</option>
                <option value="unless-stopped">unless-stopped (recommended)</option>
                <option value="on-failure">on-failure (restart on error)</option>
                <option value="no">no (do not restart)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Memory Limit (MB)
              </label>
              <input
                type="number"
                value={memLimitMb}
                onChange={(e) => setMemLimitMb(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs sm:text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Environment Variables Table */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Environment Variables
              </label>
              <button
                type="button"
                onClick={handleAddEnv}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Variable</span>
              </button>
            </div>

            <div className="space-y-2">
              {envPairs.map((pair, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={pair.key}
                    onChange={(e) => handleEnvChange(index, 'key', e.target.value)}
                    placeholder="KEY (e.g. SPRING_PROFILES)"
                    className="flex-1 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500 uppercase"
                  />
                  <input
                    type="text"
                    value={pair.value}
                    onChange={(e) => handleEnvChange(index, 'value', e.target.value)}
                    placeholder="VALUE"
                    className="flex-1 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveEnv(index)}
                    className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Submit Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsDeployModalOpen(false)}
              className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isDeploying || !name || !image}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-900/30"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Pulling & Deploying...</span>
                </>
              ) : (
                <>
                  <Boxes className="w-3.5 h-3.5" />
                  <span>Deploy to Host</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

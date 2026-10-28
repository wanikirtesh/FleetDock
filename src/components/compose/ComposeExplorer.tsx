import React, { useState } from 'react';
import { 
  FileCode2, 
  Layers, 
  Play, 
  Square, 
  RotateCw, 
  Save, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  Check, 
  Copy, 
  Server,
  Terminal,
  Activity,
  AlertCircle
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { ComposeVariable } from '../../types';

export const ComposeExplorer: React.FC = () => {
  const { 
    composeStacks, 
    vms, 
    selectedVmId, 
    isInScope,
    setSelectedVmId,
    updateComposeYaml, 
    updateComposeVariables, 
    executeComposeAction 
  } = useFleet();

  const availableStacks = composeStacks.filter((s) => isInScope(s.vmId));

  const [selectedStackId, setSelectedStackId] = useState<string>(() => {
    return availableStacks[0]?.id || composeStacks[0]?.id || '';
  });

  // Ensure active stack selects an available stack for the chosen host
  React.useEffect(() => {
    if (availableStacks.length > 0) {
      const exists = availableStacks.some((s) => s.id === selectedStackId);
      if (!exists) {
        setSelectedStackId(availableStacks[0].id);
      }
    }
  }, [availableStacks, selectedStackId]);

  const activeStack = availableStacks.find((s) => s.id === selectedStackId) || composeStacks.find((s) => s.id === selectedStackId) || availableStacks[0] || composeStacks[0];

  const [activeTab, setActiveTab] = useState<'yaml' | 'variables' | 'services'>('yaml');
  const [editedYaml, setEditedYaml] = useState<string>(activeStack?.rawYaml || '');
  const [variables, setVariables] = useState<ComposeVariable[]>(activeStack?.envVariables || []);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [isExecutingAction, setIsExecutingAction] = useState<string | null>(null);
  const [actionTerminalOutput, setActionTerminalOutput] = useState<string | null>(null);

  // Sync state when active stack changes
  React.useEffect(() => {
    if (activeStack) {
      setEditedYaml(activeStack.rawYaml || '');
      setVariables(activeStack.envVariables || []);
    }
  }, [activeStack?.id, activeStack?.rawYaml, activeStack?.envVariables]);

  if (!activeStack) {
    return (
      <div className="p-12 text-center text-slate-500 rounded-xl bg-slate-900 border border-slate-800">
        <FileCode2 className="w-12 h-12 mx-auto mb-3 opacity-30 text-cyan-400" />
        <h3 className="text-base font-semibold text-slate-300">No Docker Compose Stacks on this Host</h3>
        <p className="text-xs text-slate-500 mt-1">Select another VM host or switch to 'All VMs' in the header.</p>
      </div>
    );
  }

  const targetHost = vms.find((v) => v.id === activeStack.vmId);

  const handleSaveYaml = () => {
    updateComposeYaml(activeStack.id, editedYaml);
  };

  const handleToggleSecret = (key: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddVariable = () => {
    const newVar: ComposeVariable = {
      key: 'NEW_VARIABLE_KEY',
      value: 'value',
      isSecret: false,
      description: 'Custom stack variable',
    };
    const updated = [...variables, newVar];
    setVariables(updated);
    updateComposeVariables(activeStack.id, updated);
  };

  const handleUpdateVar = (index: number, field: keyof ComposeVariable, val: any) => {
    const updated = [...variables];
    updated[index] = { ...updated[index], [field]: val };
    setVariables(updated);
    updateComposeVariables(activeStack.id, updated);
  };

  const handleRemoveVar = (index: number) => {
    const updated = variables.filter((_, i) => i !== index);
    setVariables(updated);
    updateComposeVariables(activeStack.id, updated);
  };

  const handleExecuteAction = (action: 'up' | 'down' | 'restart') => {
    setIsExecutingAction(action);
    const cmd = action === 'up' 
      ? `docker compose -f /stacks/${activeStack.name}/docker-compose.yml up -d --remove-orphans` 
      : action === 'down'
      ? `docker compose -f /stacks/${activeStack.name}/docker-compose.yml down`
      : `docker compose -f /stacks/${activeStack.name}/docker-compose.yml restart`;

    setActionTerminalOutput(`[${new Date().toLocaleTimeString()}] Executing on ${targetHost?.name || activeStack.vmId} (${targetHost?.ip}):\n$ ${cmd}\n\n[+] Running ${activeStack.serviceCount}/${activeStack.serviceCount}\n`);

    setTimeout(() => {
      executeComposeAction(activeStack.id, action);
      setIsExecutingAction(null);
      if (action === 'up') {
        setActionTerminalOutput((prev) => (prev || '') + `✔ Network ${activeStack.name}_default Created\n✔ Container ${activeStack.services.join(' Started\n✔ Container ')} Started\n[+] All services running and healthy.`);
      } else if (action === 'down') {
        setActionTerminalOutput((prev) => (prev || '') + `✔ Container ${activeStack.services.join(' Stopped\n✔ Container ')} Stopped\n✔ Network ${activeStack.name}_default Removed\n[+] Stack torn down successfully.`);
      } else {
        setActionTerminalOutput((prev) => (prev || '') + `✔ Restarted all ${activeStack.serviceCount} services in ${activeStack.name}.`);
      }
    }, 900);
  };

  return (
    <div className="space-y-4">
      
      {/* Top Bar: Stack Selector & Execution Controls */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between shadow-sm">
        
        {/* Left: Stack selector */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Select Stack:</span>
              <select
                value={activeStack.id}
                onChange={(e) => setSelectedStackId(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-100 font-semibold text-sm rounded-lg px-2.5 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                {availableStacks.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.runningCount}/{s.serviceCount} services)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
              <span>Host: {targetHost?.name || activeStack.vmId} ({targetHost?.ip})</span>
              <span>•</span>
              <span className={activeStack.status === 'running' ? 'text-emerald-400' : 'text-amber-400'}>
                {activeStack.status === 'running' ? '● All Services Up' : '▲ Partially Running'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Compose Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          
          <button
            onClick={() => handleExecuteAction('up')}
            disabled={isExecutingAction !== null}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Play className="w-3.5 h-3.5" />
            <span>docker compose up -d</span>
          </button>

          <button
            onClick={() => handleExecuteAction('restart')}
            disabled={isExecutingAction !== null}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>restart</span>
          </button>

          <button
            onClick={() => handleExecuteAction('down')}
            disabled={isExecutingAction !== null}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/80 text-rose-300 border border-slate-700 hover:border-rose-800 disabled:opacity-50 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Square className="w-3.5 h-3.5" />
            <span>down</span>
          </button>

        </div>

      </div>

      {/* Execution Terminal Feedback (if any action ran) */}
      {actionTerminalOutput && (
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 space-y-1 relative">
          <div className="flex items-center justify-between text-slate-500 text-[11px] pb-1 border-b border-slate-800">
            <span className="flex items-center gap-1 text-cyan-400">
              <Terminal className="w-3 h-3" />
              Docker Compose CLI Output
            </span>
            <button
              onClick={() => setActionTerminalOutput(null)}
              className="hover:text-slate-200"
            >
              Dismiss
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-emerald-400/90 text-xs py-1">
            {actionTerminalOutput}
          </pre>
        </div>
      )}

      {/* Tabs: YAML Editor vs Environment Variables vs Stack Services */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
        
        {/* Tab navigation */}
        <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('yaml')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'yaml'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              docker-compose.yml
            </button>
            <button
              onClick={() => setActiveTab('variables')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'variables'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Compose Variables (.env) ({variables.length})
            </button>
            <button
              onClick={() => setActiveTab('services')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'services'
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Defined Services ({activeStack.services.length})
            </button>
          </div>

          {activeTab === 'yaml' && (
            <button
              onClick={handleSaveYaml}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save YAML Changes</span>
            </button>
          )}

          {activeTab === 'variables' && (
            <button
              onClick={handleAddVariable}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Variable</span>
            </button>
          )}
        </div>

        {/* Tab 1: YAML Code Editor */}
        {activeTab === 'yaml' && (
          <div className="p-4 bg-slate-950 font-mono text-xs">
            <textarea
              value={editedYaml}
              onChange={(e) => setEditedYaml(e.target.value)}
              rows={22}
              className="w-full bg-slate-950 text-cyan-300 font-mono text-xs leading-relaxed focus:outline-none resize-y"
              spellCheck={false}
            />
          </div>
        )}

        {/* Tab 2: Compose Variables (.env) */}
        {activeTab === 'variables' && (
          <div className="p-4 space-y-4">
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-300">Environment Interpolation Engine</p>
                <p className="text-[11px] text-slate-500">
                  Variables defined here are automatically injected into <code className="text-cyan-400">\${'{'}VAR_NAME{'}'}</code> placeholders in the docker-compose.yml file during deploy.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 overflow-hidden font-mono text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] uppercase">
                  <tr>
                    <th className="p-3">Variable Key</th>
                    <th className="p-3">Value</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 w-16 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {variables.map((v, idx) => {
                    const isSecret = v.isSecret;
                    const isRevealed = revealedSecrets[v.key];

                    return (
                      <tr key={idx} className="hover:bg-slate-950/40">
                        {/* Key */}
                        <td className="p-3">
                          <input
                            type="text"
                            value={v.key}
                            onChange={(e) => handleUpdateVar(idx, 'key', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-cyan-400 font-semibold focus:outline-none focus:border-cyan-500"
                          />
                        </td>

                        {/* Value */}
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              type={isSecret && !isRevealed ? 'password' : 'text'}
                              value={v.value}
                              onChange={(e) => handleUpdateVar(idx, 'value', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-cyan-500"
                            />
                            {isSecret && (
                              <button
                                type="button"
                                onClick={() => handleToggleSecret(v.key)}
                                className="p-1 rounded text-slate-400 hover:text-slate-200"
                                title={isRevealed ? 'Hide secret' : 'Reveal secret'}
                              >
                                {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Description */}
                        <td className="p-3 text-slate-400 font-sans text-xs">
                          <input
                            type="text"
                            value={v.description || ''}
                            onChange={(e) => handleUpdateVar(idx, 'description', e.target.value)}
                            placeholder="Optional note..."
                            className="w-full bg-transparent border-0 text-slate-400 focus:outline-none text-xs"
                          />
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveVar(idx)}
                            className="p-1.5 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* Tab 3: Defined Services */}
        {activeTab === 'services' && (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {activeStack.services.map((svcName) => (
                <div key={svcName} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 font-mono">{svcName}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    PartOf stack <code className="text-cyan-400">{activeStack.name}</code>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

    </div>
  );
};

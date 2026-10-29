import React, { useState, useEffect } from 'react';
import { 
  X, 
  Server, 
  Key, 
  Lock, 
  ShieldCheck, 
  Terminal, 
  Cpu, 
  HardDrive, 
  Check, 
  Loader2,
  Activity,
  Trash2,
  RotateCw,
  Eye,
  EyeOff,
  AlertTriangle,
  FolderOpen,
  Info
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { AuthType } from '../../types';
import { VmIcon, VmIconPicker, DEFAULT_VM_ICON } from './vmIcons';

export const EditVmModal: React.FC = () => {
  const { 
    isEditVmModalOpen, 
    closeEditVmModal, 
    editingVm, 
    updateVm, 
    deleteVm,
    testVmConnection 
  } = useFleet();

  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [port, setPort] = useState(22);
  const [environment, setEnvironment] = useState<'Production' | 'Staging' | 'Development' | 'Edge'>('Production');
  const [icon, setIcon] = useState(DEFAULT_VM_ICON);
  const [tagsInput, setTagsInput] = useState('');

  // Auth Type
  const [authType, setAuthType] = useState<AuthType>('ssh_key');
  const [sshUser, setSshUser] = useState('ubuntu');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [sshPassphrase, setSshPassphrase] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [tlsCa, setTlsCa] = useState('');
  const [tlsCert, setTlsCert] = useState('');
  const [tlsKey, setTlsKey] = useState('');
  const [agentToken, setAgentToken] = useState('');
  const [useSudo, setUseSudo] = useState(true);

  // States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latency: number; msg: string } | null>(null);

  // Populate form whenever editingVm changes
  useEffect(() => {
    if (editingVm) {
      setName(editingVm.name || '');
      setIp(editingVm.ip || '');
      setPort(editingVm.port || 22);
      setEnvironment(editingVm.environment || 'Production');
      setIcon(editingVm.icon || DEFAULT_VM_ICON);
      setTagsInput(editingVm.tags?.join(', ') || '');
      setAuthType(editingVm.authType || 'ssh_key');
      setUseSudo(editingVm.useSudo ?? editingVm.authPayload?.useSudo ?? true);

      setSshUser(editingVm.authPayload?.username || 'root');
      setSshPrivateKey(editingVm.authPayload?.privateKey || '');
      setSshPassphrase(editingVm.authPayload?.passphrase || '');
      setPassword(editingVm.authPayload?.password || '');
      setTlsCa(editingVm.authPayload?.tlsCa || '');
      setTlsCert(editingVm.authPayload?.tlsCert || '');
      setTlsKey(editingVm.authPayload?.tlsKey || '');
      setAgentToken(editingVm.authPayload?.agentToken || '');
      setTestResult(null);
    }
  }, [editingVm]);

  if (!isEditVmModalOpen || !editingVm) return null;

  const handleAuthTypeChange = (type: AuthType) => {
    setAuthType(type);
    if (type === 'ssh_key' || type === 'password') {
      if (port === 2376 || port === 9443) setPort(22);
    } else if (type === 'docker_socket') {
      if (port === 22 || port === 9443) setPort(2376);
    } else if (type === 'agent_token') {
      if (port === 22 || port === 2376) setPort(9443);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testVmConnection(editingVm.id);
      setTestResult({
        success: res.success,
        latency: res.latency,
        msg: res.message,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        latency: 0,
        msg: err.message || 'Handshake failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !ip.trim()) return;

    setIsSubmitting(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      await updateVm(editingVm.id, {
        name: name.trim(),
        ip: ip.trim(),
        port: Number(port),
        authType,
        useSudo,
        authPayload: {
          ...editingVm.authPayload,
          username: sshUser.trim(),
          privateKey: sshPrivateKey,
          passphrase: sshPassphrase,
          password: password || undefined,
          tlsCa,
          tlsCert,
          tlsKey,
          agentToken,
          useSudo,
        },
        environment,
        icon,
        tags,
      });

      closeEditVmModal();
    } catch (err) {
      console.error('Error saving VM edits:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Permanently remove VM host '${editingVm.name}' and delete its cached configuration?`)) {
      await deleteVm(editingVm.id);
      closeEditVmModal();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <VmIcon icon={icon} className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-slate-100">
                  Edit VM Node: {editingVm.name}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {editingVm.id}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Update connection endpoint, SSH keys, passwords, and hardware specifications
              </p>
            </div>
          </div>

          <button
            onClick={closeEditVmModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-6 text-xs sm:text-sm">
          
          {/* Section 1: Host Network Identity */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <span>1. Network Identity & Endpoint</span>
              </h4>
              <span className="text-[11px] text-slate-500">Node ID: {editingVm.id}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  VM Display Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. mn4sg3xappl101.ideasstg.int or prod-worker-01"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Environment Tier
                </label>
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
                >
                  <option value="Production">Production</option>
                  <option value="Staging">Staging</option>
                  <option value="Development">Development</option>
                  <option value="Edge">Edge</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Icon</label>
              <VmIconPicker value={icon} onChange={setIcon} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  IP Address or Domain Hostname <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="e.g. 172.19.102.9 or docker-host.internal"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Port
                </label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  placeholder="22"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 2: Authentication Protocol & Credentials */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider font-mono">
                2. Authentication Protocol & Credentials
              </h4>
            </div>

            {/* Protocol Selector Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleAuthTypeChange('ssh_key')}
                className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                  authType === 'ssh_key'
                    ? 'bg-cyan-950/40 border-cyan-500 text-cyan-300 ring-1 ring-cyan-500/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <Key className="w-4 h-4" />
                <span className="font-semibold text-xs">SSH Key</span>
                <span className="text-[10px] text-slate-400">RSA / ED25519 / Key file</span>
              </button>

              <button
                type="button"
                onClick={() => handleAuthTypeChange('password')}
                className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                  authType === 'password'
                    ? 'bg-amber-950/40 border-amber-500 text-amber-300 ring-1 ring-amber-500/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <Lock className="w-4 h-4" />
                <span className="font-semibold text-xs">SSH Password</span>
                <span className="text-[10px] text-slate-400">Direct password auth</span>
              </button>

              <button
                type="button"
                onClick={() => handleAuthTypeChange('docker_socket')}
                className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                  authType === 'docker_socket'
                    ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="font-semibold text-xs">Docker Socket</span>
                <span className="text-[10px] text-slate-400">TLS certificates (2376)</span>
              </button>

              <button
                type="button"
                onClick={() => handleAuthTypeChange('agent_token')}
                className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                  authType === 'agent_token'
                    ? 'bg-indigo-950/40 border-indigo-500 text-indigo-300 ring-1 ring-indigo-500/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span className="font-semibold text-xs">Fleet Agent</span>
                <span className="text-[10px] text-slate-400">Lightweight daemon (9443)</span>
              </button>
            </div>

            {/* Auth Form Fields based on authType */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
              
              {/* SSH KEY Form */}
              {authType === 'ssh_key' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        SSH Username
                      </label>
                      <input
                        type="text"
                        value={sshUser}
                        onChange={(e) => setSshUser(e.target.value)}
                        placeholder="root or ubuntu"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Passphrase (Optional)
                      </label>
                      <input
                        type="password"
                        value={sshPassphrase}
                        onChange={(e) => setSshPassphrase(e.target.value)}
                        placeholder="Leave blank if unencrypted"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-cyan-400" />
                        <span>SSH Private Key or Key File Path</span>
                      </label>
                      <span className="text-[11px] text-slate-400 font-mono">
                        RSA / OpenSSH / Ed25519
                      </span>
                    </div>
                    <textarea
                      rows={5}
                      value={sshPrivateKey}
                      onChange={(e) => setSshPrivateKey(e.target.value)}
                      placeholder={`Paste PEM/OpenSSH private key text:
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAA...
-----END OPENSSH PRIVATE KEY-----

OR provide local file path:
C:\\Users\\username\\.ssh\\id_rsa  (Windows)
/home/user/.ssh/id_rsa          (Linux/Mac)`}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                    <div className="flex items-start gap-1.5 mt-1.5 text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/80">
                      <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                      <span>
                        FleetDock automatically supports both raw OpenSSH/PEM key text and local key paths (e.g. <code className="text-cyan-300 font-mono">C:/Users/.../.ssh/id_rsa</code>). If left unchanged, existing stored credentials remain intact.
                      </span>
                    </div>
                  </div>

                  {/* Sudo privileges switch */}
                  <div className="pt-2 flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div>
                      <span className="font-medium text-xs text-slate-200 block">
                        Elevated Privileges (use sudo)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Executes <code className="font-mono text-cyan-300">sudo docker ...</code> with automatic non-sudo fallback
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUseSudo(!useSudo)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        useSudo ? 'bg-cyan-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          useSudo ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* SSH PASSWORD Form */}
              {authType === 'password' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        SSH Username
                      </label>
                      <input
                        type="text"
                        value={sshUser}
                        onChange={(e) => setSshUser(e.target.value)}
                        placeholder="root or ubuntu"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-amber-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter password (or leave untouched)"
                          className="w-full pl-3 pr-10 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Sudo privileges switch */}
                  <div className="pt-2 flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div>
                      <span className="font-medium text-xs text-slate-200 block">
                        Elevated Privileges (use sudo)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Executes docker commands with sudo rights
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUseSudo(!useSudo)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        useSudo ? 'bg-amber-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          useSudo ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* DOCKER SOCKET Form */}
              {authType === 'docker_socket' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      CA Certificate (ca.pem)
                    </label>
                    <textarea
                      rows={2}
                      value={tlsCa}
                      onChange={(e) => setTlsCa(e.target.value)}
                      placeholder="-----BEGIN CERTIFICATE-----"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Client Certificate (cert.pem)
                      </label>
                      <textarea
                        rows={2}
                        value={tlsCert}
                        onChange={(e) => setTlsCert(e.target.value)}
                        placeholder="-----BEGIN CERTIFICATE-----"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Client Key (key.pem)
                      </label>
                      <textarea
                        rows={2}
                        value={tlsKey}
                        onChange={(e) => setTlsKey(e.target.value)}
                        placeholder="-----BEGIN RSA PRIVATE KEY-----"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* AGENT TOKEN Form */}
              {authType === 'agent_token' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    FleetDock Agent Token
                  </label>
                  <input
                    type="text"
                    value={agentToken}
                    onChange={(e) => setAgentToken(e.target.value)}
                    placeholder="fd_agt_live_..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              )}

            </div>
          </div>

          {/* Section 3: Hardware Specs & System Information */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider font-mono">
                3. Labels
              </h4>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Metadata Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. docker, staging, ideasstg, database"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          {/* Section 4: Live Connection Test */}
          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-medium text-slate-200 block">
                Test Connection Handshake
              </span>
              <span className="text-[11px] text-slate-400">
                Pings Docker daemon via {authType === 'ssh_key' ? 'SSH' : authType} on {ip}:{port}
              </span>
            </div>

            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !ip}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 self-start sm:self-auto shrink-0"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{isTesting ? 'Testing Handshake...' : 'Test Handshake'}</span>
            </button>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                testResult.success
                  ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-300'
                  : 'bg-rose-950/50 border-rose-800/80 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold">
                  {testResult.success ? `Connected successfully (${testResult.latency}ms)` : 'Connection Error'}
                </p>
                <p className="text-[11px] opacity-90 font-mono mt-0.5 break-all">
                  {testResult.msg}
                </p>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleDelete}
              className="px-3 py-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/50 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete VM</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeEditVmModal}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              
              <button
                type="submit"
                disabled={isSubmitting || !name || !ip}
                className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm shadow-cyan-900/40 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Changes...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};

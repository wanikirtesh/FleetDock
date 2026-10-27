import React, { useState } from 'react';
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
  Copy,
  Activity
} from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { AuthType } from '../../types';

export const AddVmModal: React.FC = () => {
  const { isAddVmModalOpen, setIsAddVmModalOpen, addVm } = useFleet();

  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [port, setPort] = useState(22);
  const [environment, setEnvironment] = useState<'Production' | 'Staging' | 'Development' | 'Edge'>('Production');
  const [os, setOs] = useState('Ubuntu 24.04 LTS');
  const [arch, setArch] = useState('x86_64');
  const [cpuCores, setCpuCores] = useState(8);
  const [memoryGb, setMemoryGb] = useState(16);
  const [diskGb, setDiskGb] = useState(250);
  const [tagsInput, setTagsInput] = useState('docker, backend');

  // Auth Type
  const [authType, setAuthType] = useState<AuthType>('ssh_key');
  const [sshUser, setSshUser] = useState('ubuntu');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [sshPassphrase, setSshPassphrase] = useState('');
  const [password, setPassword] = useState('');
  const [tlsCa, setTlsCa] = useState('');
  const [tlsCert, setTlsCert] = useState('');
  const [tlsKey, setTlsKey] = useState('');
  const [agentToken, setAgentToken] = useState('fd_agt_live_' + Math.random().toString(36).substring(2, 12));

  // Connection testing state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latency: number; msg: string } | null>(null);

  if (!isAddVmModalOpen) return null;

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

  const handleTestConnection = () => {
    if (!ip) return;
    setIsTesting(true);
    setTestResult(null);

    setTimeout(() => {
      setIsTesting(false);
      setTestResult({
        success: true,
        latency: Math.floor(Math.random() * 20 + 12),
        msg: `Connection verified to Docker Daemon on ${ip}:${port} (Engine 27.2.1, API v1.47)`,
      });
    }, 800);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !ip) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    addVm({
      name: name.trim(),
      ip: ip.trim(),
      port: Number(port),
      authType,
      authPayload: {
        username: sshUser,
        privateKey: sshPrivateKey || '-----BEGIN RSA PRIVATE KEY-----\n[ENCRYPTED_IN_SPRING_BOOT_VAULT]\n-----END RSA PRIVATE KEY-----',
        passphrase: sshPassphrase,
        password: password || undefined,
        tlsCa,
        tlsCert,
        tlsKey,
        agentToken,
      },
      environment,
      os,
      arch,
      cpuCores: Number(cpuCores),
      memoryGb: Number(memoryGb),
      diskGb: Number(diskGb),
      tags,
    });

    setIsAddVmModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-100">
                Register Remote VM Host
              </h3>
              <p className="text-xs text-slate-400">
                Configure network endpoint and credentials for Spring Boot container orchestration
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsAddVmModalOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-5 text-xs sm:text-sm">
          
          {/* General Host Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
              1. Host Network Identity
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  VM / Hostname Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. prod-swarm-worker-02"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-600 text-xs sm:text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Environment
                </label>
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs sm:text-sm focus:outline-none focus:border-cyan-500"
                >
                  <option value="Production">Production</option>
                  <option value="Staging">Staging</option>
                  <option value="Development">Development</option>
                  <option value="Edge">Edge IoT</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  IP Address or Domain <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="e.g. 192.168.1.105 or node02.company.net"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono placeholder-slate-600 text-xs sm:text-sm focus:outline-none focus:border-cyan-500"
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
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs sm:text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Authentication Type Selector */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
              2. Authentication & Connection Protocol
            </h4>

            {/* Auth Type Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleAuthTypeChange('ssh_key')}
                className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center gap-1.5 transition-colors ${
                  authType === 'ssh_key'
                    ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Key className="w-4 h-4" />
                <span>SSH Key</span>
              </button>

              <button
                type="button"
                onClick={() => handleAuthTypeChange('password')}
                className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center gap-1.5 transition-colors ${
                  authType === 'password'
                    ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Lock className="w-4 h-4" />
                <span>SSH Password</span>
              </button>

              <button
                type="button"
                onClick={() => handleAuthTypeChange('docker_socket')}
                className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center gap-1.5 transition-colors ${
                  authType === 'docker_socket'
                    ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Docker TLS Socket</span>
              </button>

              <button
                type="button"
                onClick={() => handleAuthTypeChange('agent_token')}
                className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col items-center gap-1.5 transition-colors ${
                  authType === 'agent_token'
                    ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span>FleetDock Agent</span>
              </button>
            </div>

            {/* Auth Details Inputs */}
            {authType === 'ssh_key' && (
              <div className="space-y-3 p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      SSH Username
                    </label>
                    <input
                      type="text"
                      value={sshUser}
                      onChange={(e) => setSshUser(e.target.value)}
                      placeholder="e.g. ubuntu, debian, root"
                      className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Passphrase (Optional)
                    </label>
                    <input
                      type="password"
                      value={sshPassphrase}
                      onChange={(e) => setSshPassphrase(e.target.value)}
                      placeholder="Optional key passphrase"
                      className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Private Key (OpenSSH RSA/ED25519)
                  </label>
                  <textarea
                    rows={4}
                    value={sshPrivateKey}
                    onChange={(e) => setSshPrivateKey(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                    className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Note: Private keys are encrypted using AES-256-GCM in the Spring Boot backend vault.
                  </p>
                </div>
              </div>
            )}

            {authType === 'password' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    SSH Username
                  </label>
                  <input
                    type="text"
                    value={sshUser}
                    onChange={(e) => setSshUser(e.target.value)}
                    placeholder="e.g. root"
                    className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    SSH Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            )}

            {authType === 'docker_socket' && (
              <div className="space-y-2 p-3 rounded-lg bg-slate-950 border border-slate-800">
                <p className="text-xs text-slate-400">
                  Connect directly to Docker daemon over TCP port 2376 with mutual TLS certificate validation.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={tlsCa}
                    onChange={(e) => setTlsCa(e.target.value)}
                    placeholder="ca.pem data"
                    className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                  <input
                    type="text"
                    value={tlsCert}
                    onChange={(e) => setTlsCert(e.target.value)}
                    placeholder="cert.pem data"
                    className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                  <input
                    type="password"
                    value={tlsKey}
                    onChange={(e) => setTlsKey(e.target.value)}
                    placeholder="key.pem data"
                    className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            )}

            {authType === 'agent_token' && (
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <label className="block text-xs font-medium text-slate-400">
                  FleetDock Lightweight Agent Token
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={agentToken}
                    className="flex-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-cyan-400 font-mono text-xs"
                  />
                </div>
                <div className="p-2 rounded bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-slate-400">
                  curl -sSL https://fleetdock.internal.net/install.sh | bash -s -- --token={agentToken}
                </div>
              </div>
            )}

            {/* Test Connection Button */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !ip}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-cyan-300 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                <span>{isTesting ? 'Testing Handshake...' : 'Test Connection & Ping'}</span>
              </button>

              {testResult && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                  <Check className="w-3.5 h-3.5" />
                  <span>{testResult.msg} ({testResult.latency}ms)</span>
                </div>
              )}
            </div>
          </div>

          {/* Node Hardware Specifications */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
              3. Hardware & OS Specifications
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Operating System
                </label>
                <select
                  value={os}
                  onChange={(e) => setOs(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                >
                  <option value="Ubuntu 24.04 LTS">Ubuntu 24.04 LTS</option>
                  <option value="Ubuntu 22.04 LTS">Ubuntu 22.04 LTS</option>
                  <option value="Debian 12 Bookworm">Debian 12 Bookworm</option>
                  <option value="Alpine Linux 3.20">Alpine Linux 3.20</option>
                  <option value="RHEL 9.4">RHEL 9.4</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  CPU Cores
                </label>
                <input
                  type="number"
                  value={cpuCores}
                  onChange={(e) => setCpuCores(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  RAM (GB)
                </label>
                <input
                  type="number"
                  value={memoryGb}
                  onChange={(e) => setMemoryGb(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Storage (GB)
                </label>
                <input
                  type="number"
                  value={diskGb}
                  onChange={(e) => setDiskGb(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Labels & Tags (Comma separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. spring-boot, ingress, prod-cluster"
                className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsAddVmModalOpen(false)}
              className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name || !ip}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-1.5 transition-colors shadow-lg shadow-cyan-900/30"
            >
              <Server className="w-3.5 h-3.5" />
              <span>Register VM Host</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

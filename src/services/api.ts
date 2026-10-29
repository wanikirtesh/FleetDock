import { VMHost, Container, ComposeStack, DockerVolume, DockerNetwork, HostMount } from '../types';
import { authFetch, AuthUser } from './auth';

// All API calls in this module carry the signed-in user's bearer token.
const fetch = authFetch;

export const getApiBaseUrl = (): string => {
  return localStorage.getItem('fleetdock_backend_url') || '';
};

export const setApiBaseUrl = (url: string) => {
  localStorage.setItem('fleetdock_backend_url', url.trim());
};

const buildUrl = (path: string): string => {
  const base = getApiBaseUrl().replace(/\/$/, '');
  return base ? `${base}${path}` : path;
};

export interface AuthSession {
  token: string;
  expiresAt: number;
  user: AuthUser;
}

const authRequest = async (path: 'login' | 'register', username: string, password: string): Promise<AuthSession> => {
  let res: Response;
  try {
    res = await fetch(buildUrl(`/api/v1/auth/${path}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error('Could not reach the backend. Check the server URL.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as AuthSession;
};

export const api = {
  login: (username: string, password: string) => authRequest('login', username, password),
  register: (username: string, password: string) => authRequest('register', username, password),
  // Health check
  checkHealth: async (overrideUrl?: string) => {
    const url = overrideUrl !== undefined ? `${overrideUrl.replace(/\/$/, '')}/api/v1/health` : buildUrl('/api/v1/health');
    const start = performance.now();
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return {
      ...data,
      latencyMs: Math.round(performance.now() - start),
    };
  },

  // Hosts
  getHosts: async (): Promise<VMHost[]> => {
    const res = await fetch(buildUrl('/api/v1/hosts'));
    if (!res.ok) throw new Error(`Failed to fetch hosts: ${res.status}`);
    const data = await res.json();
    return data.map((item: any) => ({
      id: item.id,
      name: item.name,
      ip: item.ip,
      port: item.port ?? 22,
      authType: (item.authType || 'ssh_key').toLowerCase().replace('ssh_key', 'ssh_key'),
      environment: item.environment || 'Production',
      os: item.os || 'Unknown',
      arch: item.arch || 'Unknown',
      dockerVersion: item.dockerVersion || 'Unknown',
      apiVersion: item.apiVersion || '',
      status: item.status || 'online',
      pingMs: item.pingMs ?? 0,
      cpuCores: item.cpuCores ?? 0,
      memoryGb: item.memoryGb ?? 0,
      diskGb: item.diskGb ?? 0,
      cpuUsagePercent: item.cpuUsagePercent ?? 0,
      memoryUsedPercent: item.memoryUsedPercent ?? 0,
      diskUsedPercent: item.diskUsedPercent ?? 0,
      tags: item.tags || [],
      lastChecked: 'Just now',
      authPayload: {
        username: item.authCredential?.username || 'root',
        agentToken: item.authCredential?.agentToken || '',
      },
    }));
  },

  registerHost: async (hostData: any): Promise<VMHost> => {
    const res = await fetch(buildUrl('/api/v1/hosts/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hostData),
    });
    if (!res.ok) {
      let errorMsg = `Failed to register host: ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.message) errorMsg = errJson.message;
      } catch (_) {}
      throw new Error(errorMsg);
    }
    const item = await res.json();
    return {
      id: item.id,
      name: item.name,
      ip: item.ip,
      port: item.port ?? 22,
      authType: (item.authType || 'ssh_key').toLowerCase() as any,
      useSudo: item.useSudo ?? hostData.useSudo ?? true,
      environment: item.environment || hostData.environment || 'Production',
      os: item.os || 'Unknown',
      arch: item.arch || 'Unknown',
      dockerVersion: item.dockerVersion || 'Unknown',
      apiVersion: item.apiVersion || '',
      status: item.status || 'online',
      pingMs: item.pingMs ?? 0,
      cpuCores: item.cpuCores ?? 0,
      memoryGb: item.memoryGb ?? 0,
      diskGb: item.diskGb ?? 0,
      cpuUsagePercent: item.cpuUsagePercent ?? 0,
      memoryUsedPercent: item.memoryUsedPercent ?? 0,
      diskUsedPercent: item.diskUsedPercent ?? 0,
      tags: item.tags || hostData.tags || [],
      lastChecked: 'Just now',
      authPayload: {
        username: item.authCredential?.username || hostData.username || 'root',
        agentToken: item.authCredential?.agentToken || hostData.agentToken || '',
        useSudo: item.useSudo ?? hostData.useSudo ?? true,
        privateKey: hostData.privateKey,
        password: hostData.password,
        passphrase: hostData.passphrase,
        tlsCa: hostData.tlsCa,
        tlsCert: hostData.tlsCert,
        tlsKey: hostData.tlsKey,
      },
    };
  },

  updateHost: async (hostId: string, hostData: any): Promise<VMHost> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${hostId}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hostData),
    });
    if (!res.ok) {
      let errorMsg = `Failed to update host: ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.message) errorMsg = errJson.message;
      } catch (_) {}
      throw new Error(errorMsg);
    }
    return res.json();
  },

  pingHost: async (hostId: string) => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${hostId}/ping`), {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Ping failed: ${res.status}`);
    return res.json();
  },

  deleteHost: async (hostId: string) => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${hostId}`), {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) throw new Error(`Delete failed: ${res.status}`);
  },

  // Containers
  getContainers: async (vmId: string): Promise<Container[]> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/containers`));
    if (!res.ok) throw new Error(`Failed to fetch containers: ${res.status}`);
    const data = await res.json();
    return data.map((c: any) => ({
      id: c.id,
      vmId: c.vmId || vmId,
      name: c.name,
      image: c.image,
      state: c.state || 'running',
      statusText: c.statusText || 'Up Just now',
      created: c.created || 'Recently',
      command: c.command || 'docker-entrypoint.sh',
      cpuPercent: c.cpuPercent || 1.5,
      memUsageMb: c.memUsageMb || 256,
      memLimitMb: c.memLimitMb || 1024,
      netIo: { rxMb: 10, txMb: 5 },
      ports: c.ports || [],
      envVars: c.envVars || {},
      composeStack: c.composeStack || undefined,
      labels: {},
      restartPolicy: c.restartPolicy || 'always',
      mounts: [],
    }));
  },

  startContainer: async (vmId: string, containerId: string) => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/containers/${containerId}/start`), {
      method: 'POST',
    });
    return res.json();
  },

  stopContainer: async (vmId: string, containerId: string) => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/containers/${containerId}/stop`), {
      method: 'POST',
    });
    return res.json();
  },

  restartContainer: async (vmId: string, containerId: string) => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/containers/${containerId}/restart`), {
      method: 'POST',
    });
    return res.json();
  },

  deleteContainer: async (vmId: string, containerId: string) => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/containers/${containerId}`), {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) throw new Error(`Delete failed: ${res.status}`);
  },

  deployContainer: async (vmId: string, data: any): Promise<Container> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/containers/deploy`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Deploy failed: ${res.status}`);
    return res.json();
  },

  getContainerLogs: async (vmId: string, containerId: string, tail: number = 100): Promise<string[]> => {
    const url = buildUrl(`/api/v1/hosts/${vmId}/containers/${containerId}/logs?tail=${tail}&follow=false`);
    const res = await fetch(url, {
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Failed to fetch logs from Docker daemon`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
      if (data.logs && Array.isArray(data.logs)) return data.logs;
      return [JSON.stringify(data)];
    } else {
      const text = await res.text();
      return text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    }
  },

  getContainerLogsStreamUrl: (vmId: string, containerId: string, tail: number = 100): string => {
    return buildUrl(`/api/v1/hosts/${vmId}/containers/${containerId}/logs?tail=${tail}&follow=true`);
  },

  getContainerLogsWebSocketUrl: (vmId: string, containerId: string, tail: number = 100): string => {
    const base = getApiBaseUrl();
    if (base) {
      const wsBase = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
      return `${wsBase}/api/v1/ws/logs?vmId=${encodeURIComponent(vmId)}&containerId=${encodeURIComponent(containerId)}&tail=${tail}`;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/api/v1/ws/logs?vmId=${encodeURIComponent(vmId)}&containerId=${encodeURIComponent(containerId)}&tail=${tail}`;
  },

  execCommand: async (vmId: string, containerId: string, command: string, cwd?: string): Promise<{ output: string; exitCode: number; cwd?: string }> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/containers/${containerId}/exec`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, cwd }),
    });
    if (!res.ok) {
      throw new Error(`Execution request failed (HTTP ${res.status})`);
    }
    return res.json();
  },

  inspectContainer: async (vmId: string, containerId: string): Promise<any> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/containers/${containerId}/inspect`));
    if (!res.ok) {
      throw new Error(`Inspect failed with status ${res.status}`);
    }
    return res.json();
  },

  getVolumes: async (vmId: string): Promise<DockerVolume[]> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/volumes`));
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((v: any) => ({
      name: v.name || v.Name || '',
      vmId,
      driver: v.driver || v.Driver || 'local',
      sizeMb: typeof v.sizeMb === 'number' ? v.sizeMb : 0,
      scope: v.scope || v.Scope || 'local',
      inUseBy: Array.isArray(v.inUseBy) ? v.inUseBy : [],
      createdAt: v.createdAt || v.CreatedAt || new Date().toISOString().substring(0, 10),
    }));
  },

  getMounts: async (vmId: string): Promise<HostMount[]> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/mounts`));
    if (!res.ok) throw new Error(`Failed to fetch mounts: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((m: any) => ({ ...m, vmId }));
  },

  getNetworks: async (vmId: string): Promise<DockerNetwork[]> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/networks`));
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((n: any) => ({
      id: n.id || n.Id || '',
      vmId,
      name: n.name || n.Name || '',
      driver: n.driver || n.Driver || 'bridge',
      subnet: n.subnet || n.Subnet || (n.IPAM?.Config?.[0]?.Subnet) || 'N/A',
      gateway: n.gateway || n.Gateway || (n.IPAM?.Config?.[0]?.Gateway) || 'N/A',
      containersCount: typeof n.containersCount === 'number' ? n.containersCount : (n.Containers ? Object.keys(n.Containers).length : 0),
      scope: n.scope || n.Scope || 'local',
    }));
  },

  getComposeStacks: async (vmId: string): Promise<ComposeStack[]> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/compose`));
    if (!res.ok) return [];
    const list = await res.json();
    if (!Array.isArray(list)) return [];
    return list.map((item: any) => {
      let envVariables = item.envVariables || [];
      if ((!envVariables || envVariables.length === 0) && item.envVariablesJson) {
        try {
          envVariables = JSON.parse(item.envVariablesJson);
        } catch (_) {}
      }

      let services = item.services || [];
      if ((!services || services.length === 0) && item.rawYaml) {
        const matches = item.rawYaml.match(/^\s{2}([a-zA-Z0-9_-]+):/gm);
        if (matches) {
          services = matches.map((m: string) => m.trim().replace(':', ''));
        }
      }

      return {
        id: item.id,
        vmId: item.vmId || vmId,
        name: item.name,
        status: item.status || 'running',
        rawYaml: item.rawYaml || '',
        services: Array.isArray(services) && services.length > 0 ? services : [item.name + '-service'],
        envVariables: Array.isArray(envVariables) ? envVariables : [],
        lastDeployed: item.lastDeployed ? String(item.lastDeployed).replace('T', ' ').substring(0, 19) : 'Just now',
        serviceCount: item.serviceCount || (services.length > 0 ? services.length : 1),
        runningCount: item.runningCount !== undefined ? item.runningCount : (item.status === 'running' ? (item.serviceCount || services.length || 1) : 0),
      };
    });
  },

  updateComposeYaml: async (vmId: string, stackId: string, rawYaml: string): Promise<any> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/compose/${stackId}/yaml`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawYaml }),
    });
    if (!res.ok) throw new Error(`Failed to save YAML: ${res.status}`);
    return res.json();
  },

  updateComposeVariables: async (vmId: string, stackId: string, variables: any[]): Promise<any> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/compose/${stackId}/variables`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(variables),
    });
    if (!res.ok) throw new Error(`Failed to save variables: ${res.status}`);
    return res.json();
  },

  executeComposeAction: async (vmId: string, stackId: string, action: 'up' | 'down' | 'restart'): Promise<any> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/compose/${stackId}/${action}`), {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Compose action ${action} failed: ${res.status}`);
    return res.json();
  },

  execHostCommand: async (vmId: string, command: string, useSudo: boolean = false, cwd?: string): Promise<{ output: string; exitCode: number; cwd?: string }> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/exec`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, useSudo, cwd }),
    });
    if (!res.ok) {
      throw new Error(`Host command failed with status ${res.status}`);
    }
    return res.json();
  },

  getHostMetrics: async (vmId: string): Promise<{
    vmId: string;
    source: string;
    cpuPercent: number;
    memPercent: number;
    diskPercent?: number;
    memTotalMb: number;
    memUsedMb: number;
    diskTotalMb?: number;
    diskUsedMb?: number;
    diskAvailable?: boolean;
    cpuCores?: number;
    error?: string;
  }> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/metrics`));
    if (!res.ok) throw new Error(`Metrics fetch failed: ${res.status}`);
    return res.json();
  },
};

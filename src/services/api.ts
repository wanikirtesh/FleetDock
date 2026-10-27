import { VMHost, Container, ComposeStack } from '../types';

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

export const api = {
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
      port: item.port || 22,
      authType: (item.authType || 'ssh_key').toLowerCase().replace('ssh_key', 'ssh_key'),
      environment: item.environment || 'Production',
      os: item.os || 'Ubuntu 24.04 LTS',
      arch: item.arch || 'x86_64',
      dockerVersion: item.dockerVersion || 'Docker Engine 27.2.1',
      apiVersion: item.apiVersion || '1.47',
      status: item.status || 'online',
      pingMs: item.pingMs || 15,
      cpuCores: item.cpuCores || 4,
      memoryGb: item.memoryGb || 16,
      diskGb: item.diskGb || 250,
      cpuUsagePercent: item.cpuUsagePercent || 20,
      memoryUsedPercent: item.memoryUsedPercent || 50,
      diskUsedPercent: item.diskUsedPercent || 35,
      tags: item.tags || ['docker', 'backend'],
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
      port: item.port || 22,
      authType: (item.authType || 'ssh_key').toLowerCase() as any,
      useSudo: item.useSudo ?? hostData.useSudo ?? true,
      environment: item.environment || hostData.environment || 'Production',
      os: item.os || hostData.os || 'Ubuntu 24.04 LTS',
      arch: item.arch || hostData.arch || 'x86_64',
      dockerVersion: item.dockerVersion || 'Docker Engine',
      apiVersion: item.apiVersion || '1.47',
      status: item.status || 'online',
      pingMs: item.pingMs || 0,
      cpuCores: item.cpuCores || hostData.cpuCores || 4,
      memoryGb: item.memoryGb || hostData.memoryGb || 16,
      diskGb: item.diskGb || hostData.diskGb || 250,
      cpuUsagePercent: item.cpuUsagePercent || 0,
      memoryUsedPercent: item.memoryUsedPercent || 0,
      diskUsedPercent: item.diskUsedPercent || 0,
      tags: hostData.tags || item.tags || ['docker'],
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

  execCommand: async (vmId: string, containerId: string, command: string): Promise<{ output: string; exitCode: number }> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/containers/${containerId}/exec`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    if (!res.ok) {
      throw new Error(`Execution request failed (HTTP ${res.status})`);
    }
    return res.json();
  },

  getVolumes: async (vmId: string): Promise<any[]> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/volumes`));
    if (!res.ok) return [];
    return res.json();
  },

  getNetworks: async (vmId: string): Promise<any[]> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/networks`));
    if (!res.ok) return [];
    return res.json();
  },

  getComposeStacks: async (vmId: string): Promise<any[]> => {
    const res = await fetch(buildUrl(`/api/v1/hosts/${vmId}/compose`));
    if (!res.ok) return [];
    return res.json();
  },
};

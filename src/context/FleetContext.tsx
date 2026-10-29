import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import { VMHost, Container, ComposeStack, DockerVolume, DockerNetwork, ComposeVariable, ClusterStats } from '../types';
import { INITIAL_VMS, INITIAL_CONTAINERS, INITIAL_COMPOSE_STACKS, INITIAL_VOLUMES, INITIAL_NETWORKS } from '../data/initialData';
import { api, getApiBaseUrl, setApiBaseUrl } from '../services/api';

interface ActivityAlert {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
}

interface FleetContextType {
  vms: VMHost[];
  containers: Container[];
  composeStacks: ComposeStack[];
  volumes: DockerVolume[];
  networks: DockerNetwork[];
  selectedVmId: string;
  setSelectedVmId: (id: string) => void;
  /** VM ids matched by the current selection (host or group); null means all VMs. */
  scopeVmIds: string[] | null;
  isInScope: (vmId: string) => boolean;
  scopeLabel: string;
  applyHostMetrics: (metric: any) => void;
  activeVm: VMHost | undefined;
  activeTab: 'overview' | 'containers' | 'compose' | 'vms' | 'storage_network' | 'settings';
  setActiveTab: (tab: 'overview' | 'containers' | 'compose' | 'vms' | 'storage_network' | 'settings') => void;
  selectedContainerForLogs: Container | null;
  setSelectedContainerForLogs: (c: Container | null) => void;
  selectedContainerForShell: Container | null;
  setSelectedContainerForShell: (c: Container | null) => void;
  selectedContainerForInspect: Container | null;
  setSelectedContainerForInspect: (c: Container | null) => void;
  isAddVmModalOpen: boolean;
  setIsAddVmModalOpen: (open: boolean) => void;
  isEditVmModalOpen: boolean;
  setIsEditVmModalOpen: (open: boolean) => void;
  editingVm: VMHost | null;
  setEditingVm: (vm: VMHost | null) => void;
  openEditVmModal: (vm: VMHost) => void;
  closeEditVmModal: () => void;
  isDeployModalOpen: boolean;
  setIsDeployModalOpen: (open: boolean) => void;
  clusterStats: ClusterStats;
  alerts: ActivityAlert[];
  dismissAlert: (id: string) => void;

  // Backend Integration
  dataSource: 'spring_boot' | 'mock';
  setDataSource: (source: 'spring_boot' | 'mock') => void;
  backendUrl: string;
  setBackendUrl: (url: string) => void;
  isBackendConnected: boolean;
  isSyncing: boolean;
  backendEngineInfo: string;
  connectToBackend: (url?: string) => Promise<boolean>;
  seedBackendDatabase: () => Promise<void>;
  fetchFromBackend: (opts?: { force?: boolean }) => Promise<void>;
  refreshHostResources: (hostId: string, force?: boolean) => Promise<number>;

  // Actions
  addVm: (newVm: Omit<VMHost, 'id' | 'status' | 'pingMs' | 'lastChecked' | 'cpuUsagePercent' | 'memoryUsedPercent' | 'diskUsedPercent' | 'dockerVersion' | 'apiVersion'>) => Promise<void>;
  updateVm: (id: string, updates: Partial<VMHost>) => void;
  deleteVm: (id: string) => Promise<void>;
  testVmConnection: (id: string) => Promise<{ success: boolean; latency: number; message: string }>;

  startContainer: (id: string) => Promise<void>;
  pendingActions: Record<string, ContainerAction>;
  stopContainer: (id: string) => Promise<void>;
  restartContainer: (id: string) => Promise<void>;
  pauseContainer: (id: string) => void;
  deleteContainer: (id: string) => Promise<void>;
  deployContainer: (containerData: {
    vmId: string;
    name: string;
    image: string;
    ports: { hostPort: number; containerPort: number; protocol: 'tcp' | 'udp' }[];
    command?: string;
    envVars: Record<string, string>;
    restartPolicy: Container['restartPolicy'];
    memLimitMb?: number;
  }) => Promise<void>;
  bulkContainerAction: (action: 'start' | 'stop' | 'restart' | 'delete', ids: string[]) => void;

  updateComposeYaml: (stackId: string, newYaml: string) => void;
  updateComposeVariables: (stackId: string, variables: ComposeVariable[]) => void;
  executeComposeAction: (stackId: string, action: 'up' | 'down' | 'restart') => void;
  resetToSampleData: () => void;
}

const FleetContext = createContext<FleetContextType | undefined>(undefined);

export const GROUP_PREFIX = 'group:';
export type ContainerAction = 'start' | 'stop' | 'restart' | 'delete';
const RESOURCE_TTL_MS = 60_000;
const POLL_CHECK_MS = 30_000;
const FETCH_TIMES_KEY = 'fleetdock_fetch_times';

// A VM belongs to a group per environment and per tag, e.g. "group:env:Production", "group:tag:backend"
export const vmGroupKeys = (vm: VMHost): string[] => [
  `${GROUP_PREFIX}env:${vm.environment}`,
  ...(vm.tags || []).map((t) => `${GROUP_PREFIX}tag:${t}`),
];

export const FleetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [backendUrl, setBackendUrlState] = useState<string>(() => getApiBaseUrl());
  const [dataSource, setDataSourceState] = useState<'spring_boot' | 'mock'>(() => {
    return (localStorage.getItem('fleetdock_datasource') as any) || 'spring_boot';
  });
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [backendEngineInfo, setBackendEngineInfo] = useState<string>('Detecting Spring Boot backend...');

  const [vms, setVms] = useState<VMHost[]>(() => {
    try {
      const isMock = localStorage.getItem('fleetdock_datasource') === 'mock';
      const saved = localStorage.getItem('fleetdock_vms');
      if (saved) {
        const parsed = JSON.parse(saved);
        // If saved data was the old mock dataset and not explicitly mock mode, clear it
        if (!isMock && parsed.some((p: any) => p.id === 'vm-prod-01')) {
          localStorage.removeItem('fleetdock_vms');
          return [];
        }
        return parsed;
      }
      return isMock ? INITIAL_VMS : [];
    } catch {
      return [];
    }
  });

  const [containers, setContainers] = useState<Container[]>(() => {
    try {
      const isMock = localStorage.getItem('fleetdock_datasource') === 'mock';
      const saved = localStorage.getItem('fleetdock_containers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!isMock && parsed.some((p: any) => p.id === 'c-sp-billing-01')) {
          localStorage.removeItem('fleetdock_containers');
          return [];
        }
        return parsed;
      }
      return isMock ? INITIAL_CONTAINERS : [];
    } catch {
      return [];
    }
  });

  const [composeStacks, setComposeStacks] = useState<ComposeStack[]>(() => {
    try {
      const isMock = localStorage.getItem('fleetdock_datasource') === 'mock';
      const saved = localStorage.getItem('fleetdock_compose');
      return saved ? JSON.parse(saved) : (isMock ? INITIAL_COMPOSE_STACKS : []);
    } catch {
      return [];
    }
  });

  const [volumes, setVolumes] = useState<DockerVolume[]>(() => {
    try {
      const isMock = localStorage.getItem('fleetdock_datasource') === 'mock';
      const saved = localStorage.getItem('fleetdock_volumes');
      return saved ? JSON.parse(saved) : (isMock ? INITIAL_VOLUMES : []);
    } catch {
      return [];
    }
  });

  const [networks, setNetworks] = useState<DockerNetwork[]>(() => {
    try {
      const isMock = localStorage.getItem('fleetdock_datasource') === 'mock';
      const saved = localStorage.getItem('fleetdock_networks');
      return saved ? JSON.parse(saved) : (isMock ? INITIAL_NETWORKS : []);
    } catch {
      return [];
    }
  });

  const [selectedVmId, setSelectedVmId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'overview' | 'containers' | 'compose' | 'vms' | 'storage_network' | 'settings'>('overview');

  const [selectedContainerForLogs, setSelectedContainerForLogs] = useState<Container | null>(null);
  const [selectedContainerForShell, setSelectedContainerForShell] = useState<Container | null>(null);
  const [selectedContainerForInspect, setSelectedContainerForInspect] = useState<Container | null>(null);

  const [isAddVmModalOpen, setIsAddVmModalOpen] = useState(false);
  const [isEditVmModalOpen, setIsEditVmModalOpen] = useState(false);
  const [editingVm, setEditingVm] = useState<VMHost | null>(null);

  const openEditVmModal = (vm: VMHost) => {
    setEditingVm(vm);
    setIsEditVmModalOpen(true);
  };

  const closeEditVmModal = () => {
    setIsEditVmModalOpen(false);
    setEditingVm(null);
  };

  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [alerts, setAlerts] = useState<ActivityAlert[]>([]);

  const addAlert = (type: ActivityAlert['type'], title: string, message: string) => {
    const newAlert: ActivityAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      type,
      title,
      message,
      timestamp: new Date().toLocaleTimeString(),
    };
    setAlerts((prev) => [newAlert, ...prev.slice(0, 5)]);
    setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== newAlert.id));
    }, 6000);
  };

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const setBackendUrl = (url: string) => {
    setBackendUrlState(url);
    setApiBaseUrl(url);
  };

  const setDataSource = (source: 'spring_boot' | 'mock') => {
    setDataSourceState(source);
    localStorage.setItem('fleetdock_datasource', source);
    if (source === 'mock') {
      setVms(INITIAL_VMS);
      setContainers(INITIAL_CONTAINERS);
      addAlert('info', 'Demo Mode Activated', 'Showing demo sample dataset.');
    } else {
      fetchFromBackend();
    }
  };

  // Fetch real data from Spring Boot REST API
  const clearHostScopedData = () => {
    setContainers([]);
    setComposeStacks([]);
    setVolumes([]);
    setNetworks([]);
    ['containers', 'compose', 'volumes', 'networks'].forEach((k) =>
      localStorage.setItem(`fleetdock_${k}`, '[]')
    );
  };

  // Drop containers, stacks, volumes and networks whose VM no longer exists
  useEffect(() => {
    const ids = new Set(vms.map((v) => v.id));
    const prune = <T extends { vmId: string }>(key: string, prev: T[]): T[] => {
      const next = prev.filter((i) => ids.has(i.vmId));
      if (next.length === prev.length) return prev;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    };
    setContainers((p) => prune('fleetdock_containers', p));
    setComposeStacks((p) => prune('fleetdock_compose', p));
    setVolumes((p) => prune('fleetdock_volumes', p));
    setNetworks((p) => prune('fleetdock_networks', p));
  }, [vms]);
  // Hosts tagged before tags were persisted in the DB have none server-side; fall back to the local labels
  const withLocalTags = (hosts: VMHost[]): VMHost[] => {
    const known = new Map<string, string[]>();
    try {
      const stored: VMHost[] = JSON.parse(localStorage.getItem('fleetdock_vms') || '[]');
      stored.forEach((v) => known.set(v.id, v.tags || []));
    } catch {
      // ignore corrupt cache
    }
    vms.forEach((v) => known.set(v.id, v.tags || []));
    return hosts.map((h) =>
      h.tags && h.tags.length > 0 ? h : { ...h, tags: known.get(h.id) ?? [] }
    );
  };

  // Per-host freshness cache: resources fetched within RESOURCE_TTL_MS are reused (also across page reloads)
  const lastFetchRef = useRef<Record<string, number>>(
    (() => {
      try { return JSON.parse(localStorage.getItem(FETCH_TIMES_KEY) || '{}'); } catch { return {}; }
    })()
  );

  // Returns the number of containers fetched, or -1 when served from cache
  const refreshHostResources = useCallback(async (hostId: string, force = false): Promise<number> => {
    const age = Date.now() - (lastFetchRef.current[hostId] || 0);
    if (!force && age < RESOURCE_TTL_MS) return -1;
    lastFetchRef.current[hostId] = Date.now();
    try { localStorage.setItem(FETCH_TIMES_KEY, JSON.stringify(lastFetchRef.current)); } catch { /* ignore */ }

    // Replace this host's items on success; keep the cached ones if the call fails
    const swap = async <T extends { vmId: string }>(
      load: Promise<T[]>,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      key: string
    ): Promise<number> => {
      try {
        const fresh = await load;
        setter((prev) => {
          const updated = [...prev.filter((i) => i.vmId !== hostId), ...fresh];
          try { localStorage.setItem(key, JSON.stringify(updated)); } catch { /* ignore */ }
          return updated;
        });
        return fresh.length;
      } catch (err) {
        console.warn(`Could not refresh ${key} for host ${hostId}:`, err);
        delete lastFetchRef.current[hostId];
        return 0;
      }
    };

    const [count] = await Promise.all([
      swap(api.getContainers(hostId), setContainers, 'fleetdock_containers'),
      swap(api.getComposeStacks(hostId), setComposeStacks, 'fleetdock_compose'),
      swap(api.getVolumes(hostId), setVolumes, 'fleetdock_volumes'),
      swap(api.getNetworks(hostId), setNetworks, 'fleetdock_networks'),
    ]);
    return count;
  }, []);

  const fetchFromBackend = async (opts?: { force?: boolean }) => {
    const force = opts?.force ?? true;
    setIsSyncing(true);
    try {
      const health = await api.checkHealth();
      setIsBackendConnected(true);
      setBackendEngineInfo(health.backendEngine || 'Spring Boot 3.3.4 (Java 21)');

      const remoteHosts = withLocalTags(await api.getHosts());
      setVms(remoteHosts);
      localStorage.setItem('fleetdock_vms', JSON.stringify(remoteHosts));

      if (remoteHosts.length > 0) {
        const counts = await Promise.all(remoteHosts.map((h) => refreshHostResources(h.id, force)));
        if (force) {
          const total = counts.reduce((sum, n) => sum + Math.max(n, 0), 0);
          addAlert('success', 'Spring Boot Synced', `Connected to backend database: ${remoteHosts.length} VM host(s) and ${total} live container(s).`);
        }
      } else {
        // Backend DB has 0 registered hosts
        clearHostScopedData();
        addAlert('info', 'Spring Boot Connected', 'Database currently has 0 registered hosts. Click "+ Register VM" to add a host or "Seed Spring Boot DB".');
      }
    } catch (err: any) {
      setIsBackendConnected(false);
      setBackendEngineInfo('Could not reach backend');
      console.warn('Backend sync error:', err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Connect to Spring Boot backend and fetch
  const connectToBackend = async (url?: string): Promise<boolean> => {
    if (url !== undefined) {
      setBackendUrl(url);
    }
    setIsSyncing(true);
    try {
      const health = await api.checkHealth(url);
      setIsBackendConnected(true);
      setBackendEngineInfo(health.backendEngine || 'Spring Boot 3.3.4 (Java 21)');
      setDataSourceState('spring_boot');
      localStorage.setItem('fleetdock_datasource', 'spring_boot');

      const remoteHosts = withLocalTags(await api.getHosts());
      setVms(remoteHosts);
      localStorage.setItem('fleetdock_vms', JSON.stringify(remoteHosts));

      if (remoteHosts.length > 0) {
        const containerPromises = remoteHosts.map((h) =>
          api.getContainers(h.id).catch(() => [])
        );
        const containerLists = await Promise.all(containerPromises);
        const mergedContainers = containerLists.flat();
        setContainers(mergedContainers);
        localStorage.setItem('fleetdock_containers', JSON.stringify(mergedContainers));

        // Fetch volumes and networks
        const volumePromises = remoteHosts.map((h) =>
          api.getVolumes(h.id).catch(() => [])
        );
        const volumeLists = await Promise.all(volumePromises);
        const mergedVolumes = volumeLists.flat();
        setVolumes(mergedVolumes);
        localStorage.setItem('fleetdock_volumes', JSON.stringify(mergedVolumes));

        const networkPromises = remoteHosts.map((h) =>
          api.getNetworks(h.id).catch(() => [])
        );
        const networkLists = await Promise.all(networkPromises);
        const mergedNetworks = networkLists.flat();
        setNetworks(mergedNetworks);
        localStorage.setItem('fleetdock_networks', JSON.stringify(mergedNetworks));

        addAlert('success', 'Connected to Spring Boot', `Handshake verified (${health.latencyMs}ms). Loaded ${remoteHosts.length} host(s) and ${mergedContainers.length} container(s) from database.`);
      } else {
        clearHostScopedData();
        addAlert('info', 'Connected to Spring Boot', `Handshake verified (${health.latencyMs}ms). Database currently has 0 hosts. Click "Seed Demo Hosts" or "+ Register VM" to populate it.`);
      }
      return true;
    } catch (err: any) {
      setIsBackendConnected(false);
      addAlert('error', 'Connection Failed', `Could not reach Spring Boot backend at ${url || 'default endpoint'}. Ensure server is running on port 8080.`);
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  // Seed demo hosts straight into Spring Boot backend database via POST /api/v1/hosts/register
  const seedBackendDatabase = async () => {
    setIsSyncing(true);
    try {
      for (const vm of INITIAL_VMS) {
        await api.registerHost({
          name: vm.name,
          ip: vm.ip,
          port: vm.port,
          authType: vm.authType.toUpperCase(),
          environment: vm.environment,
          os: vm.os,
          arch: vm.arch,
          cpuCores: vm.cpuCores,
          memoryGb: vm.memoryGb,
          diskGb: vm.diskGb,
          username: vm.authPayload.username,
          agentToken: vm.authPayload.agentToken,
        });
      }

      await fetchFromBackend();
      addAlert('success', 'Database Populated', 'Successfully seeded initial VM hosts directly into your Spring Boot database!');
    } catch (err: any) {
      addAlert('error', 'Seed Error', `Failed to seed Spring Boot DB: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // On initial mount: test backend connection; cached resources younger than the TTL are reused
  useEffect(() => {
    fetchFromBackend({ force: false });
  }, []);

  // Selecting a host or group refreshes only the hosts whose cache is stale
  const groupHostIdsKey = selectedVmId.startsWith(GROUP_PREFIX)
    ? vms.filter((v) => vmGroupKeys(v).includes(selectedVmId)).map((v) => v.id).join(',')
    : '';
  const scopeHostIds = (): string[] =>
    selectedVmId === 'all'
      ? vmsRef.current.map((v) => v.id)
      : selectedVmId.startsWith(GROUP_PREFIX)
        ? groupHostIdsKey.split(',').filter(Boolean)
        : [selectedVmId];
  const vmsRef = useRef(vms);
  vmsRef.current = vms;
  const scopeHostIdsRef = useRef(scopeHostIds);
  scopeHostIdsRef.current = scopeHostIds;

  useEffect(() => {
    if (!isBackendConnected || !selectedVmId || selectedVmId === 'all') return;
    scopeHostIdsRef.current().forEach((id) => void refreshHostResources(id));
  }, [selectedVmId, isBackendConnected, groupHostIdsKey, refreshHostResources]);

  // Background refresh: only while the tab is visible, only the hosts in scope, and only when stale
  useEffect(() => {
    if (!isBackendConnected) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      scopeHostIdsRef.current().forEach((id) => void refreshHostResources(id));
    };
    const timer = setInterval(tick, POLL_CHECK_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [isBackendConnected, refreshHostResources]);

  // Called by the live metrics panel (only while it is expanded) to sync readings into shared state
  const applyHostMetrics = useCallback((metric: any) => {
    setVms((current) => {
      const updated = current.map((vm) => {
        if (vm.id !== metric.vmId) return vm;
        return {
          ...vm,
          metricsSource: metric.source,
          cpuUsagePercent: metric.cpuPercent,
          memoryUsedPercent: metric.memPercent,
          cpuCores: metric.cpuCores ?? vm.cpuCores,
          memoryGb: metric.memTotalMb > 0 ? Number((metric.memTotalMb / 1024).toFixed(1)) : vm.memoryGb,
          diskGb: metric.diskTotalMb && metric.diskTotalMb > 0
            ? Number((metric.diskTotalMb / 1024).toFixed(1))
            : vm.diskGb,
          diskUsedPercent: metric.diskAvailable && typeof metric.diskPercent === 'number'
            ? metric.diskPercent
            : vm.diskUsedPercent,
          diskMetricsAvailable: metric.diskAvailable ?? typeof metric.diskPercent === 'number',
        };
      });
      localStorage.setItem('fleetdock_vms', JSON.stringify(updated));
      return updated;
    });
  }, []);


  const activeVm = useMemo(() => {
    return vms.find((v) => v.id === selectedVmId);
  }, [vms, selectedVmId]);

  const scopeVmIds = useMemo<string[] | null>(() => {
    if (selectedVmId === 'all') return null;
    if (selectedVmId.startsWith(GROUP_PREFIX)) {
      return vms.filter((v) => vmGroupKeys(v).includes(selectedVmId)).map((v) => v.id);
    }
    return [selectedVmId];
  }, [vms, selectedVmId]);

  const isInScope = (vmId: string) => scopeVmIds === null || scopeVmIds.includes(vmId);

  const scopeLabel = selectedVmId === 'all'
    ? 'All Registered Hosts'
    : selectedVmId.startsWith(GROUP_PREFIX)
      ? `Group ${selectedVmId.slice(GROUP_PREFIX.length)} (${scopeVmIds?.length ?? 0} VMs)`
      : vms.find((v) => v.id === selectedVmId)?.name || selectedVmId;

  // Compute cluster statistics
  const clusterStats = useMemo<ClusterStats>(() => {
    const totalVms = vms.length;
    const onlineVms = vms.filter((v) => v.status === 'online').length;

    const filteredContainers = scopeVmIds === null
      ? containers
      : containers.filter((c) => scopeVmIds.includes(c.vmId));

    const totalContainers = filteredContainers.length;
    const runningContainers = filteredContainers.filter((c) => c.state === 'running').length;
    const stoppedContainers = filteredContainers.filter((c) => c.state === 'stopped' || c.state === 'exited').length;

    const activeVmList = scopeVmIds === null ? vms : vms.filter((v) => scopeVmIds.includes(v.id));
    const totalMemoryGb = activeVmList.reduce((acc, v) => acc + v.memoryGb, 0);
    const totalCpuCores = activeVmList.reduce((acc, v) => acc + v.cpuCores, 0);
    const avgCpu = totalCpuCores > 0
      ? activeVmList.reduce((acc, v) => acc + v.cpuUsagePercent * v.cpuCores, 0) / totalCpuCores
      : 0;
    const usedMemoryGb = activeVmList.reduce(
      (acc, v) => acc + (v.memoryGb * v.memoryUsedPercent) / 100,
      0
    );
    const avgMem = totalMemoryGb > 0 ? (usedMemoryGb / totalMemoryGb) * 100 : 0;

    return {
      totalVms,
      onlineVms,
      totalContainers,
      runningContainers,
      stoppedContainers,
      avgCpuPercent: Number(avgCpu.toFixed(1)),
      avgMemoryPercent: Number(avgMem.toFixed(1)),
      totalMemoryGb,
      usedMemoryGb: Number(usedMemoryGb.toFixed(1)),
    };
  }, [vms, containers, scopeVmIds]);

  // Actions with backend persistence
  const addVm = async (newVm: any) => {
    if (isBackendConnected) {
      try {
        const created = await api.registerHost({
          name: newVm.name,
          ip: newVm.ip,
          port: newVm.port,
          authType: newVm.authType.toUpperCase(),
          environment: newVm.environment,
          username: newVm.authPayload?.username,
          privateKey: newVm.authPayload?.privateKey,
          password: newVm.authPayload?.password,
          passphrase: newVm.authPayload?.passphrase,
          tlsCa: newVm.authPayload?.tlsCa,
          tlsCert: newVm.authPayload?.tlsCert,
          tlsKey: newVm.authPayload?.tlsKey,
          agentToken: newVm.authPayload?.agentToken,
          useSudo: newVm.useSudo ?? newVm.authPayload?.useSudo ?? true,
          tags: newVm.tags,
        });

        // 1. Immediately update VM state & persist
        setVms((prev) => {
          const updated = [...prev.filter((v) => v.id !== created.id), created];
          localStorage.setItem('fleetdock_vms', JSON.stringify(updated));
          return updated;
        });

        // 2. Select this VM immediately so views focus on the newly added host
        setSelectedVmId(created.id);
        setActiveTab('containers');

        addAlert('success', 'Host Persisted in Spring Boot DB', `Registered VM ${newVm.name} (${newVm.ip}). Querying Docker daemon...`);

        // 3. Immediately query Docker daemon for live containers on this new host
        try {
          const liveContainers = await api.getContainers(created.id);
          setContainers((prev) => {
            const updated = [...prev.filter((c) => c.vmId !== created.id), ...liveContainers];
            localStorage.setItem('fleetdock_containers', JSON.stringify(updated));
            return updated;
          });
          if (liveContainers.length > 0) {
            addAlert('success', 'Docker Containers Discovered', `Discovered ${liveContainers.length} container(s) running on ${newVm.name}.`);
          } else {
            addAlert('info', 'Docker Daemon Connected', `Host ${newVm.name} is online with 0 active containers.`);
          }
        } catch (containerErr: any) {
          console.warn('Could not auto-fetch containers for new host:', containerErr);
          addAlert('warning', 'Container Fetch Warning', `Host registered, but Docker container query failed: ${containerErr.message}`);
        }

        // 4. Fetch compose stacks for this new host
        try {
          const liveStacks = await api.getComposeStacks(created.id);
          if (liveStacks && liveStacks.length > 0) {
            setComposeStacks((prev) => [...prev.filter((s) => s.vmId !== created.id), ...liveStacks]);
          }
        } catch (_) {}

        // 5. Background ping to verify latency and Docker engine version
        api.pingHost(created.id).then((pingRes) => {
          if (pingRes && pingRes.status === 'online') {
            setVms((prev) =>
              prev.map((v) =>
                v.id === created.id
                  ? {
                      ...v,
                      status: 'online',
                      pingMs: pingRes.latencyMs || v.pingMs,
                      dockerVersion: pingRes.dockerVersion ? `Docker Engine ${pingRes.dockerVersion}` : v.dockerVersion,
                      os: pingRes.os || v.os,
                      arch: pingRes.arch || v.arch,
                      cpuCores: pingRes.cpuCores || v.cpuCores,
                      memoryGb: pingRes.memoryGb || v.memoryGb,
                      diskGb: pingRes.diskGb || v.diskGb,
                    }
                  : v
              )
            );
          }
        }).catch(() => {});

        return;
      } catch (err: any) {
        console.warn('Backend register failed, falling back to local state:', err);
        addAlert('error', 'Backend Registration Failed', err.message || 'Could not register host with backend. Falling back to local mode.');
      }
    }

    const id = `vm-${Date.now().toString(36)}`;
    const vmRecord: VMHost = {
      ...newVm,
      id,
      dockerVersion: 'Docker Engine 27.2.1',
      apiVersion: '1.47',
      status: 'online',
      pingMs: Math.floor(Math.random() * 20 + 8),
      cpuUsagePercent: Math.floor(Math.random() * 25 + 10),
      memoryUsedPercent: Math.floor(Math.random() * 40 + 20),
      diskUsedPercent: Math.floor(Math.random() * 30 + 15),
      lastChecked: 'Just now',
    };
    setVms((prev) => {
      const updated = [...prev, vmRecord];
      localStorage.setItem('fleetdock_vms', JSON.stringify(updated));
      return updated;
    });
    setSelectedVmId(vmRecord.id);
    setActiveTab('containers');

    // In demo/local mode, generate sample containers for the new host
    const sampleContainers: Container[] = [
      {
        id: `c-${id}-01`,
        vmId: id,
        name: `${vmRecord.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-web-app`,
        image: 'nginx:alpine',
        state: 'running',
        statusText: 'Up Just now',
        created: 'Just now',
        ports: [{ hostPort: 80, containerPort: 80, protocol: 'tcp' }],
        command: 'nginx -g "daemon off;"',
        cpuPercent: 0.5,
        memUsageMb: 32,
        memLimitMb: 512,
        netIo: { rxMb: 0.5, txMb: 0.2 },
        envVars: { APP_ENV: vmRecord.environment.toLowerCase() },
        labels: {},
        restartPolicy: 'always',
        mounts: [],
      },
      {
        id: `c-${id}-02`,
        vmId: id,
        name: `${vmRecord.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-worker`,
        image: 'redis:7.2-alpine',
        state: 'running',
        statusText: 'Up Just now',
        created: 'Just now',
        ports: [{ hostPort: 6379, containerPort: 6379, protocol: 'tcp' }],
        command: 'redis-server',
        cpuPercent: 0.8,
        memUsageMb: 48,
        memLimitMb: 1024,
        netIo: { rxMb: 1.1, txMb: 0.7 },
        envVars: {},
        labels: {},
        restartPolicy: 'unless-stopped',
        mounts: [],
      }
    ];
    setContainers((prev) => {
      const updated = [...prev, ...sampleContainers];
      localStorage.setItem('fleetdock_containers', JSON.stringify(updated));
      return updated;
    });

    addAlert('success', 'Host Registered', `Added VM ${vmRecord.name} (${vmRecord.ip}) with live container tracking.`);
  };

  const updateVm = async (id: string, updates: Partial<VMHost>) => {
    if (isBackendConnected) {
      try {
        const payload: any = {
          name: updates.name,
          ip: updates.ip,
          port: updates.port,
          authType: updates.authType ? updates.authType.toUpperCase() : undefined,
          useSudo: updates.useSudo ?? updates.authPayload?.useSudo ?? true,
          environment: updates.environment,
          tags: updates.tags,
          os: updates.os,
          arch: updates.arch,
          cpuCores: updates.cpuCores,
          memoryGb: updates.memoryGb,
          diskGb: updates.diskGb,
          username: updates.authPayload?.username,
          privateKey: updates.authPayload?.privateKey,
          password: updates.authPayload?.password,
          passphrase: updates.authPayload?.passphrase,
          tlsCa: updates.authPayload?.tlsCa,
          tlsCert: updates.authPayload?.tlsCert,
          tlsKey: updates.authPayload?.tlsKey,
          agentToken: updates.authPayload?.agentToken,
        };
        const updated = await api.updateHost(id, payload);
        setVms((prev) =>
          prev.map((v) => {
            if (v.id === id) {
              return {
                ...v,
                ...updates,
                name: updated.name || updates.name || v.name,
                ip: updated.ip || updates.ip || v.ip,
                port: updated.port || updates.port || v.port,
                useSudo: updated.useSudo ?? updates.useSudo ?? v.useSudo,
                environment: updated.environment || updates.environment || v.environment,
                os: updated.os || updates.os || v.os,
                arch: updated.arch || updates.arch || v.arch,
                cpuCores: updated.cpuCores || v.cpuCores,
                memoryGb: updated.memoryGb || v.memoryGb,
                diskGb: updated.diskGb || v.diskGb,
                tags: updates.tags || v.tags,
                authType: (updated.authType ? (updated.authType.toLowerCase() as any) : updates.authType) || v.authType,
                authPayload: {
                  ...v.authPayload,
                  ...updates.authPayload,
                },
                lastChecked: 'Just now',
              };
            }
            return v;
          })
        );

        // Immediately re-query containers for the updated host
        try {
          const liveContainers = await api.getContainers(id);
          setContainers((prev) => {
            const updated = [...prev.filter((c) => c.vmId !== id), ...liveContainers];
            localStorage.setItem('fleetdock_containers', JSON.stringify(updated));
            return updated;
          });
        } catch (_) {}

        addAlert('success', 'Host Persisted in Spring Boot DB', `Updated VM ${updates.name || id} settings in backend database.`);
        return;
      } catch (err: any) {
        console.warn('Backend update failed, falling back to local state:', err);
        addAlert('warning', 'Backend Update Warning', `Could not persist to backend (${err.message}). Local state updated.`);
      }
    }

    setVms((prev) =>
      prev.map((v) =>
        v.id === id
          ? {
              ...v,
              ...updates,
              tags: updates.tags || v.tags,
              authPayload: {
                ...v.authPayload,
                ...updates.authPayload,
              },
              lastChecked: 'Just now',
            }
          : v
      )
    );
    addAlert('info', 'Host Updated', `Configuration updated.`);
  };

  const deleteVm = async (id: string) => {
    const target = vms.find((v) => v.id === id);
    if (isBackendConnected) {
      try {
        await api.deleteHost(id);
      } catch (err) {
        console.warn('Backend delete failed:', err);
      }
    }
    setVms((prev) => prev.filter((v) => v.id !== id));
    setContainers((prev) => prev.filter((c) => c.vmId !== id));
    const persist = (key: string, items: any[]) => {
      try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* ignore */ }
    };
    setComposeStacks((prev) => {
      const next = prev.filter((s) => s.vmId !== id);
      persist('fleetdock_compose', next);
      return next;
    });
    setVolumes((prev) => {
      const next = prev.filter((v) => v.vmId !== id);
      persist('fleetdock_volumes', next);
      return next;
    });
    setNetworks((prev) => {
      const next = prev.filter((n) => n.vmId !== id);
      persist('fleetdock_networks', next);
      return next;
    });
    if (selectedVmId === id) setSelectedVmId('all');
    addAlert('warning', 'Host Removed', `VM ${target?.name || id} removed from backend.`);
  };

  const testVmConnection = async (id: string): Promise<{ success: boolean; latency: number; message: string }> => {
    const host = vms.find((v) => v.id === id);
    if (!host) return { success: false, latency: 0, message: 'Host not found' };

    try {
      const res = await api.pingHost(id);

      if (res.status === 'error') {
        setVms((prev) =>
          prev.map((v) =>
            v.id === id ? { ...v, status: 'error', pingMs: 0, lastChecked: 'Just now' } : v
          )
        );
        addAlert('error', 'Docker Daemon Unreachable', res.message || `Could not connect to Docker daemon on ${host.ip}:${host.port}`);
        return {
          success: false,
          latency: 0,
          message: res.message || `Connection failed on ${host.ip}:${host.port}`,
        };
      }

      const latency = res.latencyMs || 1;
      setVms((prev) =>
        prev.map((v) =>
          v.id === id
            ? {
                ...v,
                status: 'online',
                pingMs: latency,
                dockerVersion: res.dockerVersion || v.dockerVersion,
                apiVersion: res.apiVersion || v.apiVersion,
                os: res.os || v.os,
                arch: res.arch || v.arch,
                cpuCores: res.cpuCores || v.cpuCores,
                memoryGb: res.memoryGb || v.memoryGb,
                diskGb: res.diskGb || v.diskGb,
                lastChecked: 'Just now',
              }
            : v
        )
      );

      addAlert('success', 'Docker Daemon Handshake Verified', `Verified connection to ${host.name} (${host.ip}:${host.port}) in ${latency}ms.`);

      // Query real live running and stopped containers from the daemon
      try {
        const liveContainers = await api.getContainers(id);
        setContainers((prev) => [
          ...prev.filter((c) => c.vmId !== id),
          ...liveContainers,
        ]);
      } catch (cErr) {
        console.warn('Failed to query containers after ping:', cErr);
      }

      return {
        success: true,
        latency,
        message: res.message || `Connected to Docker daemon on ${host.ip}:${host.port} (${latency}ms)`,
      };
    } catch (err: any) {
      setVms((prev) =>
        prev.map((v) =>
          v.id === id ? { ...v, status: 'error', pingMs: 0, lastChecked: 'Just now' } : v
        )
      );
      const msg = err.message || `Failed to connect to ${host.ip}:${host.port}`;
      addAlert('error', 'Connection Error', msg);
      return {
        success: false,
        latency: 0,
        message: msg,
      };
    }
  };

  // After a mutating action, reconcile that host with the daemon once it has settled
  const syncHostSoon = (vmId: string) => {
    setTimeout(() => void refreshHostResources(vmId, true), 1500);
  };

  // One in-flight action per container: blocks double clicks and drives the spinner in the UI
  const pendingRef = useRef<Set<string>>(new Set());
  const [pendingActions, setPendingActions] = useState<Record<string, ContainerAction>>({});
  const runExclusive = async (id: string, action: ContainerAction, fn: () => Promise<void>) => {
    if (pendingRef.current.has(id)) return;
    pendingRef.current.add(id);
    setPendingActions((p) => ({ ...p, [id]: action }));
    try {
      await fn();
    } finally {
      pendingRef.current.delete(id);
      setPendingActions((p) => {
        const { [id]: _done, ...rest } = p;
        return rest;
      });
    }
  };

  const startContainer = (id: string) => runExclusive(id, 'start', () => doStartContainer(id));
  const stopContainer = (id: string) => runExclusive(id, 'stop', () => doStopContainer(id));
  const restartContainer = (id: string) => runExclusive(id, 'restart', () => doRestartContainer(id));
  const deleteContainer = (id: string) => runExclusive(id, 'delete', () => doDeleteContainer(id));

  const doStartContainer = async (id: string) => {
    const target = containers.find((c) => c.id === id);
    if (isBackendConnected && target) {
      try {
        await api.startContainer(target.vmId, target.id);
        syncHostSoon(target.vmId);
      } catch (err: any) {
        addAlert('error', 'Start Failed', `Could not start '${target.name}': ${err?.message || 'backend error'}`);
        return;
      }
    }

    setContainers((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            state: 'running',
            statusText: 'Up Just now',
            cpuPercent: 2.5,
            memUsageMb: c.memUsageMb || 128,
          };
        }
        return c;
      })
    );
    addAlert('success', 'Container Started', `Container '${target?.name || id}' is now running.`);
  };

  const doStopContainer = async (id: string) => {
    const target = containers.find((c) => c.id === id);
    if (isBackendConnected && target) {
      try {
        await api.stopContainer(target.vmId, target.id);
        syncHostSoon(target.vmId);
      } catch (err: any) {
        addAlert('error', 'Stop Failed', `Could not stop '${target.name}': ${err?.message || 'backend error'}`);
        return;
      }
    }

    setContainers((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            state: 'stopped',
            statusText: 'Exited (0) Just now',
            cpuPercent: 0,
            memUsageMb: 0,
          };
        }
        return c;
      })
    );
    addAlert('warning', 'Container Stopped', `Sent SIGTERM to container '${target?.name || id}'. Stopped.`);
  };

  const doRestartContainer = async (id: string) => {
    const target = containers.find((c) => c.id === id);
    if (isBackendConnected && target) {
      try {
        await api.restartContainer(target.vmId, target.id);
        syncHostSoon(target.vmId);
      } catch (err: any) {
        addAlert('error', 'Restart Failed', `Could not restart '${target.name}': ${err?.message || 'backend error'}`);
        return;
      }
    }

    setContainers((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            state: 'running',
            statusText: 'Up 1 second (restarted)',
            cpuPercent: 4.8,
          };
        }
        return c;
      })
    );
    addAlert('info', 'Container Restarted', `Container '${target?.name || id}' restarted.`);
  };

  const pauseContainer = (id: string) => {
    setContainers((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const nextState = c.state === 'paused' ? 'running' : 'paused';
          return {
            ...c,
            state: nextState,
            statusText: nextState === 'paused' ? 'Paused' : 'Up 1 minute (unpaused)',
            cpuPercent: nextState === 'paused' ? 0.05 : 2.0,
          };
        }
        return c;
      })
    );
    const target = containers.find((c) => c.id === id);
    addAlert('info', 'State Updated', `'${target?.name}' pause state updated.`);
  };

  const doDeleteContainer = async (id: string) => {
    const target = containers.find((c) => c.id === id);
    if (isBackendConnected && target) {
      try {
        await api.deleteContainer(target.vmId, target.id);
        syncHostSoon(target.vmId);
      } catch (err: any) {
        addAlert('error', 'Delete Failed', `Could not remove '${target.name}': ${err?.message || 'backend error'}`);
        return;
      }
    }

    setContainers((prev) => prev.filter((c) => c.id !== id));
    if (selectedContainerForLogs?.id === id) setSelectedContainerForLogs(null);
    if (selectedContainerForShell?.id === id) setSelectedContainerForShell(null);
    if (selectedContainerForInspect?.id === id) setSelectedContainerForInspect(null);
    addAlert('error', 'Container Deleted', `Container '${target?.name || id}' was removed.`);
  };

  const deployContainer = async (data: any) => {
    if (isBackendConnected) {
      try {
        const created = await api.deployContainer(data.vmId, data);
        setContainers((prev) => [created, ...prev]);
        syncHostSoon(data.vmId);
        addAlert('success', 'Container Deployed', `New container '${created.name}' launched via Spring Boot API.`);
        return;
      } catch (err) {
        console.warn('Backend deploy failed:', err);
      }
    }

    const newId = `c-${data.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36).substring(4)}`;
    const newContainer: Container = {
      id: newId,
      vmId: data.vmId,
      name: data.name,
      image: data.image,
      state: 'running',
      statusText: 'Up Just now',
      created: new Date().toISOString().replace('T', ' ').substring(0, 19),
      ports: data.ports,
      command: data.command || 'docker-entrypoint.sh',
      cpuPercent: 1.5,
      memUsageMb: 140,
      memLimitMb: data.memLimitMb || 1024,
      netIo: { rxMb: 0.1, txMb: 0.1 },
      envVars: data.envVars,
      labels: { 'orchestrated.by': 'FleetDock' },
      restartPolicy: data.restartPolicy,
      mounts: [],
    };

    setContainers((prev) => [newContainer, ...prev]);
    addAlert('success', 'Container Deployed', `Container '${newContainer.name}' launched.`);
  };

  const bulkContainerAction = (action: 'start' | 'stop' | 'restart' | 'delete', ids: string[]) => {
    if (isBackendConnected) {
      const run = { start: startContainer, stop: stopContainer, restart: restartContainer, delete: deleteContainer }[action];
      Promise.allSettled(ids.map((id) => run(id))).then((results) => {
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) addAlert('warning', 'Bulk ' + action, `${failed} of ${ids.length} containers failed.`);
      });
      return;
    }
    if (action === 'delete') {
      setContainers((prev) => prev.filter((c) => !ids.includes(c.id)));
      addAlert('warning', 'Bulk Remove', `Removed ${ids.length} containers.`);
    } else if (action === 'start') {
      setContainers((prev) =>
        prev.map((c) =>
          ids.includes(c.id) ? { ...c, state: 'running', statusText: 'Up Just now', cpuPercent: 2.1 } : c
        )
      );
      addAlert('success', 'Bulk Start', `Started ${ids.length} containers.`);
    } else if (action === 'stop') {
      setContainers((prev) =>
        prev.map((c) =>
          ids.includes(c.id) ? { ...c, state: 'stopped', statusText: 'Exited (0) Just now', cpuPercent: 0 } : c
        )
      );
      addAlert('warning', 'Bulk Stop', `Stopped ${ids.length} containers.`);
    } else if (action === 'restart') {
      setContainers((prev) =>
        prev.map((c) =>
          ids.includes(c.id) ? { ...c, state: 'running', statusText: 'Up Just now (restarted)' } : c
        )
      );
      addAlert('info', 'Bulk Restart', `Restarted ${ids.length} containers.`);
    }
  };

  const updateComposeYaml = async (stackId: string, newYaml: string) => {
    const stack = composeStacks.find((s) => s.id === stackId);
    setComposeStacks((prev) => {
      const updated = prev.map((s) => (s.id === stackId ? { ...s, rawYaml: newYaml } : s));
      localStorage.setItem('fleetdock_compose', JSON.stringify(updated));
      return updated;
    });

    if (isBackendConnected && stack) {
      try {
        await api.updateComposeYaml(stack.vmId, stackId, newYaml);
      } catch (err: any) {
        console.warn('Backend updateComposeYaml error:', err.message);
      }
    }
    addAlert('success', 'Compose YAML Saved', `Updated docker-compose.yml.`);
  };

  const updateComposeVariables = async (stackId: string, variables: ComposeVariable[]) => {
    const stack = composeStacks.find((s) => s.id === stackId);
    setComposeStacks((prev) => {
      const updated = prev.map((s) => (s.id === stackId ? { ...s, envVariables: variables } : s));
      localStorage.setItem('fleetdock_compose', JSON.stringify(updated));
      return updated;
    });

    if (isBackendConnected && stack) {
      try {
        await api.updateComposeVariables(stack.vmId, stackId, variables);
      } catch (err: any) {
        console.warn('Backend updateComposeVariables error:', err.message);
      }
    }
    addAlert('success', 'Environment Updated', `Updated compose .env variables.`);
  };

  const executeComposeAction = async (stackId: string, action: 'up' | 'down' | 'restart') => {
    const stack = composeStacks.find((s) => s.id === stackId);
    if (!stack) return;

    if (action === 'up') {
      setComposeStacks((prev) =>
        prev.map((s) =>
          s.id === stackId
            ? { ...s, status: 'running', runningCount: s.serviceCount, lastDeployed: 'Just now' }
            : s
        )
      );
      setContainers((prev) =>
        prev.map((c) => (c.composeStack === stack.name ? { ...c, state: 'running', statusText: 'Up Just now' } : c))
      );
      addAlert('success', 'Compose Up', `docker compose up -d executed.`);
    } else if (action === 'down') {
      setComposeStacks((prev) =>
        prev.map((s) =>
          s.id === stackId ? { ...s, status: 'stopped', runningCount: 0 } : s
        )
      );
      setContainers((prev) =>
        prev.map((c) => (c.composeStack === stack.name ? { ...c, state: 'stopped', statusText: 'Exited (0)' } : c))
      );
      addAlert('warning', 'Compose Down', `docker compose down executed.`);
    } else if (action === 'restart') {
      setComposeStacks((prev) =>
        prev.map((s) =>
          s.id === stackId ? { ...s, status: 'running', runningCount: s.serviceCount, lastDeployed: 'Just now' } : s
        )
      );
      setContainers((prev) =>
        prev.map((c) => (c.composeStack === stack.name ? { ...c, state: 'running', statusText: 'Up Just now (restarted)' } : c))
      );
      addAlert('info', 'Compose Restart', `Restarted stack '${stack.name}'.`);
    }

    if (isBackendConnected) {
      try {
        await api.executeComposeAction(stack.vmId, stackId, action);
      } catch (err: any) {
        console.warn('Backend executeComposeAction error:', err.message);
      }
    }
  };

  const resetToSampleData = () => {
    localStorage.removeItem('fleetdock_vms');
    localStorage.removeItem('fleetdock_containers');
    localStorage.removeItem('fleetdock_compose');
    localStorage.removeItem('fleetdock_volumes');
    localStorage.removeItem('fleetdock_networks');
    localStorage.removeItem(FETCH_TIMES_KEY);
    lastFetchRef.current = {};
    setVms(INITIAL_VMS);
    setContainers(INITIAL_CONTAINERS);
    setComposeStacks(INITIAL_COMPOSE_STACKS);
    setVolumes(INITIAL_VOLUMES);
    setNetworks(INITIAL_NETWORKS);
    setSelectedVmId('all');
    addAlert('info', 'Reset to Sample Data', 'Reset all hosts and containers to initial dataset.');
  };

  return (
    <FleetContext.Provider
      value={{
        vms,
        containers,
        composeStacks,
        volumes,
        networks,
        selectedVmId,
        scopeVmIds,
        isInScope,
        scopeLabel,
        applyHostMetrics,
        setSelectedVmId,
        activeVm,
        activeTab,
        setActiveTab,
        selectedContainerForLogs,
        setSelectedContainerForLogs,
        selectedContainerForShell,
        setSelectedContainerForShell,
        selectedContainerForInspect,
        setSelectedContainerForInspect,
        isAddVmModalOpen,
        setIsAddVmModalOpen,
        isEditVmModalOpen,
        setIsEditVmModalOpen,
        editingVm,
        setEditingVm,
        openEditVmModal,
        closeEditVmModal,
        isDeployModalOpen,
        setIsDeployModalOpen,
        clusterStats,
        alerts,
        dismissAlert,
        dataSource,
        setDataSource,
        backendUrl,
        setBackendUrl,
        isBackendConnected,
        isSyncing,
        backendEngineInfo,
        connectToBackend,
        seedBackendDatabase,
        fetchFromBackend,
        refreshHostResources,
        addVm,
        updateVm,
        deleteVm,
        testVmConnection,
        startContainer,
        pendingActions,
        stopContainer,
        restartContainer,
        pauseContainer,
        deleteContainer,
        deployContainer,
        bulkContainerAction,
        updateComposeYaml,
        updateComposeVariables,
        executeComposeAction,
        resetToSampleData,
      }}
    >
      {children}
    </FleetContext.Provider>
  );
};

export const useFleet = () => {
  const context = useContext(FleetContext);
  if (!context) {
    throw new Error('useFleet must be used within a FleetProvider');
  }
  return context;
};

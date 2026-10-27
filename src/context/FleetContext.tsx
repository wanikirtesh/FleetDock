import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { VMHost, Container, ComposeStack, DockerVolume, DockerNetwork, ComposeVariable, ClusterStats } from '../types';
import { INITIAL_VMS, INITIAL_CONTAINERS, INITIAL_COMPOSE_STACKS, INITIAL_VOLUMES, INITIAL_NETWORKS } from '../data/initialData';

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
  selectedVmId: string; // 'all' or specific VM id
  setSelectedVmId: (id: string) => void;
  activeVm: VMHost | undefined;
  activeTab: 'overview' | 'containers' | 'compose' | 'vms' | 'storage_network' | 'spring_boot';
  setActiveTab: (tab: 'overview' | 'containers' | 'compose' | 'vms' | 'storage_network' | 'spring_boot') => void;
  selectedContainerForLogs: Container | null;
  setSelectedContainerForLogs: (c: Container | null) => void;
  selectedContainerForShell: Container | null;
  setSelectedContainerForShell: (c: Container | null) => void;
  selectedContainerForInspect: Container | null;
  setSelectedContainerForInspect: (c: Container | null) => void;
  isAddVmModalOpen: boolean;
  setIsAddVmModalOpen: (open: boolean) => void;
  isDeployModalOpen: boolean;
  setIsDeployModalOpen: (open: boolean) => void;
  clusterStats: ClusterStats;
  alerts: ActivityAlert[];
  dismissAlert: (id: string) => void;

  // Actions
  addVm: (newVm: Omit<VMHost, 'id' | 'status' | 'pingMs' | 'lastChecked' | 'cpuUsagePercent' | 'memoryUsedPercent' | 'diskUsedPercent' | 'dockerVersion' | 'apiVersion'>) => void;
  updateVm: (id: string, updates: Partial<VMHost>) => void;
  deleteVm: (id: string) => void;
  testVmConnection: (id: string) => Promise<{ success: boolean; latency: number; message: string }>;

  startContainer: (id: string) => void;
  stopContainer: (id: string) => void;
  restartContainer: (id: string) => void;
  pauseContainer: (id: string) => void;
  deleteContainer: (id: string) => void;
  deployContainer: (containerData: {
    vmId: string;
    name: string;
    image: string;
    ports: { hostPort: number; containerPort: number; protocol: 'tcp' | 'udp' }[];
    command?: string;
    envVars: Record<string, string>;
    restartPolicy: Container['restartPolicy'];
    memLimitMb?: number;
  }) => void;
  bulkContainerAction: (action: 'start' | 'stop' | 'restart' | 'delete', ids: string[]) => void;

  updateComposeYaml: (stackId: string, newYaml: string) => void;
  updateComposeVariables: (stackId: string, variables: ComposeVariable[]) => void;
  executeComposeAction: (stackId: string, action: 'up' | 'down' | 'restart') => void;
  resetToSampleData: () => void;
}

const FleetContext = createContext<FleetContextType | undefined>(undefined);

export const FleetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [vms, setVms] = useState<VMHost[]>(() => {
    try {
      const saved = localStorage.getItem('fleetdock_vms');
      return saved ? JSON.parse(saved) : INITIAL_VMS;
    } catch {
      return INITIAL_VMS;
    }
  });

  const [containers, setContainers] = useState<Container[]>(() => {
    try {
      const saved = localStorage.getItem('fleetdock_containers');
      return saved ? JSON.parse(saved) : INITIAL_CONTAINERS;
    } catch {
      return INITIAL_CONTAINERS;
    }
  });

  const [composeStacks, setComposeStacks] = useState<ComposeStack[]>(() => {
    try {
      const saved = localStorage.getItem('fleetdock_compose');
      return saved ? JSON.parse(saved) : INITIAL_COMPOSE_STACKS;
    } catch {
      return INITIAL_COMPOSE_STACKS;
    }
  });

  const [volumes, setVolumes] = useState<DockerVolume[]>(() => {
    try {
      const saved = localStorage.getItem('fleetdock_volumes');
      return saved ? JSON.parse(saved) : INITIAL_VOLUMES;
    } catch {
      return INITIAL_VOLUMES;
    }
  });

  const [networks, setNetworks] = useState<DockerNetwork[]>(() => {
    try {
      const saved = localStorage.getItem('fleetdock_networks');
      return saved ? JSON.parse(saved) : INITIAL_NETWORKS;
    } catch {
      return INITIAL_NETWORKS;
    }
  });

  const [selectedVmId, setSelectedVmId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'overview' | 'containers' | 'compose' | 'vms' | 'storage_network' | 'spring_boot'>('overview');

  const [selectedContainerForLogs, setSelectedContainerForLogs] = useState<Container | null>(null);
  const [selectedContainerForShell, setSelectedContainerForShell] = useState<Container | null>(null);
  const [selectedContainerForInspect, setSelectedContainerForInspect] = useState<Container | null>(null);

  const [isAddVmModalOpen, setIsAddVmModalOpen] = useState(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);

  const [alerts, setAlerts] = useState<ActivityAlert[]>([]);

  // Auto-sync state to localStorage
  useEffect(() => {
    localStorage.setItem('fleetdock_vms', JSON.stringify(vms));
  }, [vms]);

  useEffect(() => {
    localStorage.setItem('fleetdock_containers', JSON.stringify(containers));
  }, [containers]);

  useEffect(() => {
    localStorage.setItem('fleetdock_compose', JSON.stringify(composeStacks));
  }, [composeStacks]);

  useEffect(() => {
    localStorage.setItem('fleetdock_volumes', JSON.stringify(volumes));
  }, [volumes]);

  useEffect(() => {
    localStorage.setItem('fleetdock_networks', JSON.stringify(networks));
  }, [networks]);

  const addAlert = (type: ActivityAlert['type'], title: string, message: string) => {
    const newAlert: ActivityAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      type,
      title,
      message,
      timestamp: new Date().toLocaleTimeString(),
    };
    setAlerts((prev) => [newAlert, ...prev.slice(0, 5)]);

    // auto dismiss after 5 seconds
    setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== newAlert.id));
    }, 5000);
  };

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const activeVm = useMemo(() => {
    return vms.find((v) => v.id === selectedVmId);
  }, [vms, selectedVmId]);

  // Compute cluster statistics
  const clusterStats = useMemo<ClusterStats>(() => {
    const totalVms = vms.length;
    const onlineVms = vms.filter((v) => v.status === 'online').length;

    const filteredContainers = selectedVmId === 'all' 
      ? containers 
      : containers.filter((c) => c.vmId === selectedVmId);

    const totalContainers = filteredContainers.length;
    const runningContainers = filteredContainers.filter((c) => c.state === 'running').length;
    const stoppedContainers = filteredContainers.filter((c) => c.state === 'stopped' || c.state === 'exited').length;

    const activeVmList = selectedVmId === 'all' ? vms : vms.filter((v) => v.id === selectedVmId);
    const totalMemoryGb = activeVmList.reduce((acc, v) => acc + v.memoryGb, 0);
    const avgCpu = activeVmList.length > 0 
      ? activeVmList.reduce((acc, v) => acc + v.cpuUsagePercent, 0) / activeVmList.length 
      : 0;
    const avgMem = activeVmList.length > 0 
      ? activeVmList.reduce((acc, v) => acc + v.memoryUsedPercent, 0) / activeVmList.length 
      : 0;
    const usedMemoryGb = (totalMemoryGb * avgMem) / 100;

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
  }, [vms, containers, selectedVmId]);

  // Periodic metric jitter for realism
  useEffect(() => {
    const interval = setInterval(() => {
      setContainers((prev) =>
        prev.map((c) => {
          if (c.state !== 'running') return c;
          const cpuDelta = (Math.random() - 0.5) * 0.8;
          const newCpu = Math.max(0.1, Math.min(99.0, Number((c.cpuPercent + cpuDelta).toFixed(1))));
          return {
            ...c,
            cpuPercent: newCpu,
          };
        })
      );
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // VM actions
  const addVm: FleetContextType['addVm'] = (newVm) => {
    const id = `vm-${Date.now().toString(36)}`;
    const vmRecord: VMHost = {
      ...newVm,
      id,
      dockerVersion: 'Docker Engine 27.2.0',
      apiVersion: '1.47',
      status: 'online',
      pingMs: Math.floor(Math.random() * 20 + 8),
      cpuUsagePercent: Math.floor(Math.random() * 25 + 10),
      memoryUsedPercent: Math.floor(Math.random() * 40 + 20),
      diskUsedPercent: Math.floor(Math.random() * 30 + 15),
      lastChecked: 'Just now',
    };

    setVms((prev) => [...prev, vmRecord]);
    addAlert('success', 'Host Registered', `Successfully added VM ${vmRecord.name} (${vmRecord.ip}) to FleetDock.`);
  };

  const updateVm = (id: string, updates: Partial<VMHost>) => {
    setVms((prev) => prev.map((v) => (v.id === id ? { ...v, ...updates } : v)));
    addAlert('info', 'Host Updated', `Configuration updated for host.`);
  };

  const deleteVm = (id: string) => {
    const target = vms.find((v) => v.id === id);
    setVms((prev) => prev.filter((v) => v.id !== id));
    setContainers((prev) => prev.filter((c) => c.vmId !== id));
    setComposeStacks((prev) => prev.filter((s) => s.vmId !== id));
    if (selectedVmId === id) setSelectedVmId('all');
    addAlert('warning', 'Host Removed', `VM ${target?.name || id} and its associated containers were deleted.`);
  };

  const testVmConnection = async (id: string): Promise<{ success: boolean; latency: number; message: string }> => {
    const host = vms.find((v) => v.id === id);
    if (!host) return { success: false, latency: 0, message: 'Host not found' };

    // Simulate real handshake
    return new Promise((resolve) => {
      setTimeout(() => {
        const latency = Math.floor(Math.random() * 22 + 9);
        setVms((prev) =>
          prev.map((v) =>
            v.id === id
              ? { ...v, status: 'online', pingMs: latency, lastChecked: 'Just now' }
              : v
          )
        );
        addAlert('success', 'Handshake Successful', `Connected to ${host.name} via ${host.authType.toUpperCase()} in ${latency}ms.`);
        resolve({
          success: true,
          latency,
          message: `Successfully connected to Docker Daemon on ${host.ip}:${host.port} (Docker Engine 27.2.x, API v1.47)`,
        });
      }, 700);
    });
  };

  // Container actions
  const startContainer = (id: string) => {
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
    const target = containers.find((c) => c.id === id);
    addAlert('success', 'Container Started', `Container '${target?.name || id}' is now running.`);
  };

  const stopContainer = (id: string) => {
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
    const target = containers.find((c) => c.id === id);
    addAlert('warning', 'Container Stopped', `Sent SIGTERM (15) to container '${target?.name || id}'. Stopped.`);
  };

  const restartContainer = (id: string) => {
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
    const target = containers.find((c) => c.id === id);
    addAlert('info', 'Container Restarted', `Container '${target?.name || id}' restarted successfully.`);
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
    const isPaused = target?.state !== 'paused';
    addAlert('info', isPaused ? 'Container Paused' : 'Container Resumed', `'${target?.name}' state updated.`);
  };

  const deleteContainer = (id: string) => {
    const target = containers.find((c) => c.id === id);
    setContainers((prev) => prev.filter((c) => c.id !== id));
    if (selectedContainerForLogs?.id === id) setSelectedContainerForLogs(null);
    if (selectedContainerForShell?.id === id) setSelectedContainerForShell(null);
    if (selectedContainerForInspect?.id === id) setSelectedContainerForInspect(null);
    addAlert('error', 'Container Deleted', `Container '${target?.name || id}' was removed from Docker host.`);
  };

  const deployContainer: FleetContextType['deployContainer'] = (data) => {
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
    addAlert('success', 'Container Deployed', `New container '${newContainer.name}' successfully pulled and launched.`);
  };

  const bulkContainerAction = (action: 'start' | 'stop' | 'restart' | 'delete', ids: string[]) => {
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

  // Compose actions
  const updateComposeYaml = (stackId: string, newYaml: string) => {
    setComposeStacks((prev) =>
      prev.map((s) => (s.id === stackId ? { ...s, rawYaml: newYaml } : s))
    );
    addAlert('success', 'Compose YAML Saved', `Updated docker-compose.yml for stack.`);
  };

  const updateComposeVariables = (stackId: string, variables: ComposeVariable[]) => {
    setComposeStacks((prev) =>
      prev.map((s) => (s.id === stackId ? { ...s, envVariables: variables } : s))
    );
    addAlert('success', 'Environment Updated', `Updated compose .env variables.`);
  };

  const executeComposeAction = (stackId: string, action: 'up' | 'down' | 'restart') => {
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
      // start services associated with compose
      setContainers((prev) =>
        prev.map((c) => (c.composeStack === stack.name ? { ...c, state: 'running', statusText: 'Up Just now' } : c))
      );
      addAlert('success', 'Compose Up', `docker compose up -d executed on VM. All ${stack.serviceCount} services healthy.`);
    } else if (action === 'down') {
      setComposeStacks((prev) =>
        prev.map((s) =>
          s.id === stackId ? { ...s, status: 'stopped', runningCount: 0 } : s
        )
      );
      setContainers((prev) =>
        prev.map((c) => (c.composeStack === stack.name ? { ...c, state: 'stopped', statusText: 'Exited (0)' } : c))
      );
      addAlert('warning', 'Compose Down', `docker compose down executed. Services torn down gracefully.`);
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
  };

  const resetToSampleData = () => {
    localStorage.removeItem('fleetdock_vms');
    localStorage.removeItem('fleetdock_containers');
    localStorage.removeItem('fleetdock_compose');
    localStorage.removeItem('fleetdock_volumes');
    localStorage.removeItem('fleetdock_networks');
    setVms(INITIAL_VMS);
    setContainers(INITIAL_CONTAINERS);
    setComposeStacks(INITIAL_COMPOSE_STACKS);
    setVolumes(INITIAL_VOLUMES);
    setNetworks(INITIAL_NETWORKS);
    setSelectedVmId('all');
    addAlert('info', 'Demo Data Reset', 'Reset all hosts, containers, and compose stacks to factory demo data.');
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
        isDeployModalOpen,
        setIsDeployModalOpen,
        clusterStats,
        alerts,
        dismissAlert,
        addVm,
        updateVm,
        deleteVm,
        testVmConnection,
        startContainer,
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

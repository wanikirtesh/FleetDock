export type AuthType = 'ssh_key' | 'password' | 'docker_socket' | 'agent_token';

export type HostStatus = 'online' | 'offline' | 'connecting' | 'error';

export type ContainerState = 'running' | 'stopped' | 'paused' | 'restarting' | 'exited';

export interface VMHost {
  id: string;
  name: string;
  ip: string;
  port: number;
  authType: AuthType;
  useSudo?: boolean;
  authPayload: {
    username?: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    tlsCert?: string;
    tlsKey?: string;
    tlsCa?: string;
    agentToken?: string;
    useSudo?: boolean;
  };
  environment: 'Production' | 'Staging' | 'Development' | 'Edge';
  os: string;
  arch: string;
  dockerVersion: string;
  apiVersion: string;
  status: HostStatus;
  cpuCores: number;
  memoryGb: number;
  diskGb: number;
  memoryUsedPercent: number;
  cpuUsagePercent: number;
  diskUsedPercent: number;
  pingMs: number;
  tags: string[];
  lastChecked: string;
  isDefault?: boolean;
}

export interface ContainerPort {
  hostPort: number;
  containerPort: number;
  protocol: 'tcp' | 'udp';
  ip?: string;
}

export interface ContainerMount {
  source: string;
  target: string;
  type: 'bind' | 'volume' | 'tmpfs';
  mode: 'ro' | 'rw';
}

export interface Container {
  id: string;
  vmId: string;
  name: string;
  image: string;
  state: ContainerState;
  statusText: string;
  created: string;
  ports: ContainerPort[];
  command: string;
  cpuPercent: number;
  memUsageMb: number;
  memLimitMb: number;
  netIo: {
    rxMb: number;
    txMb: number;
  };
  envVars: Record<string, string>;
  composeStack?: string;
  labels: Record<string, string>;
  restartPolicy: 'no' | 'always' | 'unless-stopped' | 'on-failure';
  mounts: ContainerMount[];
}

export interface ComposeVariable {
  key: string;
  value: string;
  isSecret?: boolean;
  description?: string;
}

export interface ComposeStack {
  id: string;
  vmId: string;
  name: string;
  status: 'running' | 'partially_running' | 'stopped';
  rawYaml: string;
  services: string[];
  envVariables: ComposeVariable[];
  lastDeployed: string;
  serviceCount: number;
  runningCount: number;
}

export interface DockerVolume {
  name: string;
  vmId: string;
  driver: string;
  sizeMb: number;
  scope: string;
  inUseBy: string[];
  createdAt: string;
}

export interface DockerNetwork {
  id: string;
  vmId: string;
  name: string;
  driver: string;
  subnet: string;
  gateway: string;
  containersCount: number;
  scope: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'SYSTEM';
  message: string;
  containerId: string;
  source?: string;
}

export interface ClusterStats {
  totalVms: number;
  onlineVms: number;
  totalContainers: number;
  runningContainers: number;
  stoppedContainers: number;
  avgCpuPercent: number;
  avgMemoryPercent: number;
  totalMemoryGb: number;
  usedMemoryGb: number;
}

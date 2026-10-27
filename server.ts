import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// In-memory state mirroring the Spring Boot backend
let mockVms = [
  {
    id: 'vm-prod-01',
    name: 'prod-app-swarm-01',
    ip: '192.168.1.101',
    port: 22,
    authType: 'SSH_KEY',
    environment: 'Production',
    os: 'Ubuntu 24.04 LTS',
    arch: 'x86_64',
    dockerVersion: 'Docker Engine 27.2.1',
    apiVersion: '1.47',
    status: 'online',
    pingMs: 14,
    cpuCores: 8,
    memoryGb: 32,
    diskGb: 500,
    cpuUsagePercent: 28.5,
    memoryUsedPercent: 64.2,
    diskUsedPercent: 48.0,
  },
  {
    id: 'vm-db-02',
    name: 'prod-db-cluster-02',
    ip: '192.168.1.102',
    port: 2376,
    authType: 'DOCKER_SOCKET',
    environment: 'Production',
    os: 'Debian 12 Bookworm',
    arch: 'x86_64',
    dockerVersion: 'Docker Engine 27.1.0-ce',
    apiVersion: '1.46',
    status: 'online',
    pingMs: 18,
    cpuCores: 16,
    memoryGb: 64,
    diskGb: 1024,
    cpuUsagePercent: 42.1,
    memoryUsedPercent: 78.4,
    diskUsedPercent: 62.3,
  },
];

let mockContainers = [
  {
    id: 'c-sp-billing-01',
    vmId: 'vm-prod-01',
    name: 'spring-billing-service',
    image: 'registry.internal.net/microservices/billing-service:2.4.1',
    state: 'running',
    statusText: 'Up 3 days (healthy)',
    created: '2026-10-23 09:15:00',
    command: 'java -jar app.jar --spring.profiles.active=prod',
    cpuPercent: 3.4,
    memUsageMb: 485,
    memLimitMb: 1024,
    ports: [
      { hostPort: 8080, containerPort: 8080, protocol: 'tcp' },
      { hostPort: 8081, containerPort: 8081, protocol: 'tcp' },
    ],
    envVars: {
      SPRING_PROFILES_ACTIVE: 'prod',
      DB_HOST: '192.168.1.102',
    },
    composeStack: 'core-microservices',
    restartPolicy: 'always',
  },
];

// --- REST API Endpoints (Parity with Spring Boot Controllers) ---

// Healthcheck
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'fleetdock-spring-orchestrator',
    backendEngine: 'Spring Boot 3.3.4 (Java 21) & Fullstack Proxy',
    timestamp: new Date().toISOString(),
    dockerJavaClientVersion: '3.4.0',
  });
});

// Host management
app.get('/api/v1/hosts', (req, res) => {
  res.json(mockVms);
});

app.post('/api/v1/hosts/register', (req, res) => {
  const { name, ip, port, authType, environment, os, arch, cpuCores, memoryGb, diskGb } = req.body;
  const newVm = {
    id: `vm-${Date.now().toString(36)}`,
    name: name || 'new-host',
    ip: ip || '127.0.0.1',
    port: port || 22,
    authType: authType || 'SSH_KEY',
    environment: environment || 'Production',
    os: os || 'Ubuntu 24.04 LTS',
    arch: arch || 'x86_64',
    dockerVersion: 'Docker Engine 27.2.1',
    apiVersion: '1.47',
    status: 'online',
    pingMs: Math.floor(Math.random() * 20 + 10),
    cpuCores: cpuCores || 4,
    memoryGb: memoryGb || 16,
    diskGb: diskGb || 250,
    cpuUsagePercent: Math.floor(Math.random() * 20 + 10),
    memoryUsedPercent: Math.floor(Math.random() * 30 + 30),
    diskUsedPercent: Math.floor(Math.random() * 25 + 20),
  };
  mockVms.push(newVm);
  res.status(201).json(newVm);
});

app.post('/api/v1/hosts/:id/ping', (req, res) => {
  const host = mockVms.find((v) => v.id === req.params.id);
  if (!host) {
    return res.status(404).json({ error: 'Host not found' });
  }
  const latency = Math.floor(Math.random() * 20 + 10);
  res.json({
    status: 'online',
    latencyMs: latency,
    dockerVersion: host.dockerVersion,
    apiVersion: host.apiVersion,
    message: `Connected successfully to Docker daemon on ${host.ip}:${host.port}`,
  });
});

app.delete('/api/v1/hosts/:id', (req, res) => {
  mockVms = mockVms.filter((v) => v.id !== req.params.id);
  res.status(204).send();
});

// Container management
app.get('/api/v1/hosts/:vmId/containers', (req, res) => {
  const list = mockContainers.filter((c) => c.vmId === req.params.vmId);
  res.json(list);
});

app.post('/api/v1/hosts/:vmId/containers/:cid/start', (req, res) => {
  const c = mockContainers.find((x) => x.id === req.params.cid);
  if (c) {
    c.state = 'running';
    c.statusText = 'Up Just now';
  }
  res.json({ status: 'success', message: 'Container started' });
});

app.post('/api/v1/hosts/:vmId/containers/:cid/stop', (req, res) => {
  const c = mockContainers.find((x) => x.id === req.params.cid);
  if (c) {
    c.state = 'stopped';
    c.statusText = 'Exited (0) Just now';
  }
  res.json({ status: 'success', message: 'Container stopped gracefully' });
});

app.post('/api/v1/hosts/:vmId/containers/:cid/restart', (req, res) => {
  const c = mockContainers.find((x) => x.id === req.params.cid);
  if (c) {
    c.state = 'running';
    c.statusText = 'Up Just now (restarted)';
  }
  res.json({ status: 'success', message: 'Container restarted' });
});

app.delete('/api/v1/hosts/:vmId/containers/:cid', (req, res) => {
  mockContainers = mockContainers.filter((x) => x.id !== req.params.cid);
  res.status(204).send();
});

// Live SSE Logs Stream
app.get('/api/v1/hosts/:vmId/containers/:cid/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendLog = () => {
    const time = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logData = `${time} [INFO] [container=${req.params.cid}] Spring Boot actuator probe status=UP latency=${Math.floor(Math.random() * 20 + 5)}ms\n\n`;
    res.write(`data: ${logData}`);
  };

  const interval = setInterval(sendLog, 2000);
  req.on('close', () => clearInterval(interval));
});

// --- Frontend Mounting (Vite dev or production static) ---
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FleetDock] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

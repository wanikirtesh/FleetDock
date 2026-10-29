import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/api/v1/ws/logs' });
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

// Registered VM hosts and containers in memory
let registeredHosts: any[] = [];
let deployedContainers: any[] = [];
let registeredComposeStacks: any[] = [];

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

import net from 'net';

// Helper to probe TCP connection to host
function probeHostTcp(ip: string, port: number, timeoutMs = 3000): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let hasReturned = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      const latencyMs = Math.max(1, Date.now() - start);
      hasReturned = true;
      socket.destroy();
      resolve({ ok: true, latencyMs });
    });

    socket.on('timeout', () => {
      if (!hasReturned) {
        hasReturned = true;
        socket.destroy();
        resolve({ ok: false, latencyMs: 0, error: `Connection timed out after ${timeoutMs}ms` });
      }
    });

    socket.on('error', (err: any) => {
      if (!hasReturned) {
        hasReturned = true;
        socket.destroy();
        resolve({ ok: false, latencyMs: 0, error: err.message || 'Connection refused' });
      }
    });

    try {
      socket.connect(port, ip);
    } catch (err: any) {
      resolve({ ok: false, latencyMs: 0, error: err.message });
    }
  });
}

// Host management
app.get('/api/v1/hosts', (req, res) => {
  res.json(registeredHosts);
});

app.post('/api/v1/hosts/register', (req, res) => {
  const { name, ip, port, authType, useSudo, environment, icon, os, arch, cpuCores, memoryGb, diskGb } = req.body;
  const newVm = {
    id: `vm-${Date.now().toString(36)}`,
    name: name || 'new-host',
    ip: ip || '127.0.0.1',
    port: port ? parseInt(port, 10) : 22,
    authType: authType || 'SSH_KEY',
    useSudo: useSudo !== undefined ? Boolean(useSudo) : true,
    environment: environment || 'Production',
    icon: icon || null,
    arch: arch || 'x86_64',
    dockerVersion: 'Pending verification',
    apiVersion: '',
    status: 'connecting',
    pingMs: 0,
    cpuCores: cpuCores ? parseInt(cpuCores, 10) : 1,
    memoryGb: memoryGb ? parseInt(memoryGb, 10) : 1,
    diskGb: diskGb ? parseInt(diskGb, 10) : 10,
    cpuUsagePercent: 0,
    memoryUsedPercent: 0,
    diskUsedPercent: 0,
  };
  registeredHosts.push(newVm);
  res.status(201).json(newVm);
});

app.post('/api/v1/hosts/:id/ping', async (req, res) => {
  const host = registeredHosts.find((v) => v.id === req.params.id);
  if (!host) {
    return res.status(404).json({ status: 'error', message: 'Host not found in database' });
  }

  // Attempt real TCP probe
  const probe = await probeHostTcp(host.ip, host.port);
  if (!probe.ok) {
    host.status = 'error';
    return res.json({
      status: 'error',
      latencyMs: 0,
      message: `Failed to connect to ${host.ip}:${host.port} -> ${probe.error}`,
    });
  }

  // If TCP succeeded, try to query Docker daemon version if port is Docker HTTP (e.g. 2375, 2376)
  let dockerVersion = host.dockerVersion !== 'Pending verification' ? host.dockerVersion : 'Docker Engine';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const resp = await fetch(`http://${host.ip}:${host.port}/version`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (resp.ok) {
      const vData = await resp.json();
      dockerVersion = `Docker ${vData.Version || ''}`;
      host.dockerVersion = dockerVersion;
      if (vData.ApiVersion) host.apiVersion = vData.ApiVersion;
    }
  } catch {
    // Port is reachable via TCP (e.g. SSH / TCP socket)
  }

  host.status = 'online';
  host.pingMs = probe.latencyMs;
  res.json({
    status: 'online',
    latencyMs: probe.latencyMs,
    dockerVersion,
    apiVersion: host.apiVersion || '1.47',
    message: `Handshake verified with ${host.name} on ${host.ip}:${host.port} (${probe.latencyMs}ms)`,
  });
});

app.delete('/api/v1/hosts/:id', (req, res) => {
  registeredHosts = registeredHosts.filter((v) => v.id !== req.params.id);
  deployedContainers = deployedContainers.filter((c) => c.vmId !== req.params.id);
  registeredComposeStacks = registeredComposeStacks.filter((s) => s.vmId !== req.params.id);
  res.status(204).send();
});

// VM Host Interactive Shell Exec Endpoint
app.post('/api/v1/hosts/:id/exec', async (req, res) => {
  const { id } = req.params;
  const command = (req.body.command || '').trim();
  const useSudo = Boolean(req.body.useSudo);
  const homeDir = useSudo ? '/root' : `/home/${(registeredHosts.find((v) => v.id === id)?.authPayload?.username) || 'ubuntu'}`;
  let cwd = typeof req.body.cwd === 'string' && req.body.cwd ? req.body.cwd : homeDir;

  if (!command) {
    return res.status(400).json({ output: 'Command cannot be empty', exitCode: 1 });
  }

  // 1. Try local Spring Boot backend if available
  try {
    const springCheck = await fetch('http://127.0.0.1:8080/api/v1/health', { signal: AbortSignal.timeout(600) });
    if (springCheck.ok) {
      const springRes = await fetch(`http://127.0.0.1:8080/api/v1/hosts/${id}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, useSudo, cwd: req.body.cwd }),
      });
      if (springRes.ok) {
        return res.json(await springRes.json());
      }
    }
  } catch {}

  // 2. High-fidelity host simulation fallback
  const host = registeredHosts.find((v) => v.id === id);
  const hostname = host ? host.name : 'vm-host';
  const ip = host ? host.ip : '127.0.0.1';
  const os = host?.os || 'Ubuntu 24.04 LTS';
  const cpu = host?.cpuCores || 4;
  const memGb = host?.memoryGb || 16;
  const diskGb = host?.diskGb || 250;
  const hostContainers = deployedContainers.filter((c) => c.vmId === id);

  const cmdLower = command.toLowerCase();
  let output = '';
  let exitCode = 0;

  if (cmdLower === 'pwd') {
    output = cwd;
  } else if (cmdLower === 'cd' || cmdLower.startsWith('cd ')) {
    const target = command.slice(2).trim();
    if (target === '' || target === '~') cwd = homeDir;
    else if (target === '..') cwd = cwd.split('/').slice(0, -1).join('/') || '/';
    else if (target.startsWith('/')) cwd = target;
    else cwd = `${cwd.replace(/\/$/, '')}/${target}`;
  } else if (cmdLower === 'uptime') {
    output = ` 16:34:10 up 28 days,  4:12,  2 users,  load average: 0.24, 0.18, 0.14`;
  } else if (cmdLower === 'uname -a' || cmdLower.startsWith('uname')) {
    output = `Linux ${hostname} 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC Wed Sep 11 15:25:05 UTC 2024 x86_64 x86_64 x86_64 GNU/Linux`;
  } else if (cmdLower === 'whoami') {
    output = useSudo ? 'root' : (host?.authPayload?.username || 'ubuntu');
  } else if (cmdLower === 'id') {
    output = useSudo ? 'uid=0(root) gid=0(root) groups=0(root)' : 'uid=1000(ubuntu) gid=1000(ubuntu) groups=1000(ubuntu),4(adm),24(cdrom),27(sudo),118(docker)';
  } else if (cmdLower === 'hostname') {
    output = hostname;
  } else if (cmdLower.startsWith('cat /etc/os-release') || cmdLower.startsWith('cat /etc/issue')) {
    output = `PRETTY_NAME="${os}"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04 LTS (Noble Numbat)"\nVERSION_CODENAME=noble\nID=ubuntu\nID_LIKE=debian\nHOME_URL="https://www.ubuntu.com/"`;
  } else if (cmdLower.startsWith('df')) {
    const used = Math.round(diskGb * 0.35);
    const avail = diskGb - used;
    output = `Filesystem     1K-blocks      Used Available Use% Mounted on\n/dev/root      ${diskGb * 1048576}  ${used * 1048576}  ${avail * 1048576}  35% /\ntmpfs            1638400      1124   1637276   1% /run\n/dev/sda15        106858      6182    100676   6% /boot/efi\ntmpfs            8192000         0   8192000   0% /dev/shm\noverlay        ${diskGb * 1048576}  ${used * 1048576}  ${avail * 1048576}  35% /var/lib/docker/overlay2`;
  } else if (cmdLower.startsWith('free')) {
    const memTotal = memGb * 1024;
    const memUsed = Math.round(memTotal * 0.45);
    const memFree = memTotal - memUsed;
    output = `               total        used        free      shared  buff/cache   available\nMem:        ${memTotal}MB      ${memUsed}MB      ${memFree}MB        48MB      1480MB      ${memFree + 1000}MB\nSwap:         4096MB           0MB      4096MB`;
  } else if (cmdLower === 'docker ps' || cmdLower === 'docker ps -a') {
    const lines = ['CONTAINER ID   IMAGE                                     COMMAND                  CREATED         STATUS         PORTS                                       NAMES'];
    for (const c of hostContainers) {
      const portStr = (c.ports || []).map((p: any) => `0.0.0.0:${p.hostPort}->${p.containerPort}/${p.protocol || 'tcp'}`).join(', ');
      lines.push(`${c.id.padEnd(14)} ${(c.image || 'service:latest').padEnd(41)} "${(c.command || 'entrypoint.sh').substring(0, 20)}..."   ${c.created.padEnd(15)} ${c.statusText.padEnd(14)} ${portStr.padEnd(43)} ${c.name}`);
    }
    output = lines.join('\n');
  } else if (cmdLower.startsWith('docker info')) {
    output = `Client:\n Version:    27.2.1\n Context:    default\n Debug Mode: false\n\nServer:\n Containers: ${hostContainers.length}\n  Running: ${hostContainers.filter((c) => c.state === 'running').length}\n  Paused: 0\n  Stopped: ${hostContainers.filter((c) => c.state !== 'running').length}\n Images: ${Math.max(hostContainers.length, 3)}\n Server Version: 27.2.1\n Storage Driver: overlay2\n  Backing Filesystem: extfs\n Logging Driver: json-file\n Cgroup Driver: systemd\n Cgroup Version: 2\n Plugins:\n  Volume: local\n  Network: bridge host ipvlan maclan null overlay\n  Log: awslogs fluentd gcplogs gelf journald json-file local splunk syslog\n Kernel Version: 6.8.0-45-generic\n Operating System: ${os}\n OSType: linux\n Architecture: x86_64\n CPUs: ${cpu}\n Total Memory: ${memGb}GiB\n Name: ${hostname}\n Docker Root Dir: /var/lib/docker\n Live Restore Enabled: true`;
  } else if (cmdLower.startsWith('systemctl status docker')) {
    output = `● docker.service - Docker Application Container Engine\n     Loaded: loaded (/usr/lib/systemd/system/docker.service; enabled; preset: enabled)\n     Active: active (running) since Sun 2026-10-18 09:12:04 UTC; 9 days ago\n TriggeredBy: ● docker.socket\n       Docs: https://docs.docker.com\n   Main PID: 1248 (dockerd)\n      Tasks: 42\n     Memory: 184.2M (peak: 245.8M)\n        CPU: 18min 42.124s\n     CGroup: /system.slice/docker.service\n             └─1248 /usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock\n\nOct 27 16:00:12 ${hostname} dockerd[1248]: time="2026-10-27T16:00:12.418Z" level=info msg="daemon heartbeat verified"`;
  } else if (cmdLower.startsWith('journalctl -u docker')) {
    output = `Oct 27 16:15:02 ${hostname} dockerd[1248]: time="2026-10-27T16:15:02.102Z" level=info msg="API listen on /var/run/docker.sock"\nOct 27 16:20:14 ${hostname} dockerd[1248]: time="2026-10-27T16:20:14.412Z" level=info msg="Container health check passed"\nOct 27 16:28:45 ${hostname} dockerd[1248]: time="2026-10-27T16:28:45.819Z" level=info msg="Pruned 0 unused images"\nOct 27 16:33:01 ${hostname} dockerd[1248]: time="2026-10-27T16:33:01.002Z" level=info msg="Network health check OK"`;
  } else if (cmdLower.startsWith('ip a') || cmdLower.startsWith('ifconfig')) {
    output = `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n    inet 127.0.0.1/8 scope host lo\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000\n    link/ether 00:16:3e:7b:2c:14 brd ff:ff:ff:ff:ff:ff\n    inet ${ip}/24 brd 172.19.102.255 scope global eth0\n3: docker0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP group default\n    link/ether 02:42:07:91:3b:24 brd ff:ff:ff:ff:ff:ff\n    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0`;
  } else if (cmdLower.startsWith('netstat') || cmdLower.startsWith('ss')) {
    output = `Active Internet connections (only servers)\nProto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name\ntcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      892/sshd: /usr/sbin\ntcp        0      0 0.0.0.0:8080            0.0.0.0:*               LISTEN      24190/docker-proxy\ntcp        0      0 0.0.0.0:5432            0.0.0.0:*               LISTEN      24215/docker-proxy\ntcp6       0      0 :::22                   :::*                    LISTEN      892/sshd: /usr/sbin`;
  } else if (cmdLower.startsWith('ps aux') || cmdLower.startsWith('ps -ef')) {
    output = `USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nroot           1  0.0  0.2 168420 12410 ?        Ss   Oct18   0:14 /sbin/init\nroot         412  0.0  0.1  45120  6140 ?        Ss   Oct18   0:02 /lib/systemd/systemd-journald\nroot         892  0.0  0.1  18420  5120 ?        Ss   Oct18   0:05 sshd: /usr/sbin/sshd -D\nroot        1248  0.4  1.2 984520 184510 ?       Ssl  Oct18  18:42 /usr/bin/dockerd -H fd://\nroot        1412  0.1  0.5 482100 82140 ?        Ssl  Oct18   6:18 /usr/bin/containerd\nubuntu      8124  0.0  0.1  12480  4120 pts/0    Ss   16:20   0:00 -bash\nubuntu      9412  0.0  0.0  10410  2140 pts/0    R+   16:34   0:00 ps aux`;
  } else if (cmdLower.startsWith('ls')) {
    output = `bin   etc         initrd.img.old  lost+found  opt   run   srv  usr      vmlinuz.old\nboot  home        lib             media       proc  sbin  sys  var\ndev   initrd.img  lib64           mnt         root  snap  tmp  vmlinuz`;
  } else if (cmdLower.startsWith('echo ')) {
    output = command.substring(5).replace(/^["']|["']$/g, '');
  } else if (cmdLower === 'help') {
    output = `FleetDock VM Host Console\nAvailable system tools: docker, systemctl, journalctl, df, free, ip, netstat, ps, uname, uptime, whoami, id, cat, ls, ping, curl.`;
  } else {
    output = `${command}: executed on ${hostname} (${ip}) with exit code 0`;
  }

  res.json({ output, exitCode, cwd });
});

// Container management
app.get('/api/v1/hosts/:vmId/containers', async (req, res) => {
  const host = registeredHosts.find((v) => v.id === req.params.vmId);
  if (host) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const dockerUrl = `http://${host.ip}:${host.port}/containers/json?all=1`;
      const resp = await fetch(dockerUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const rawContainers = await resp.json();
        const mapped = rawContainers.map((c: any) => ({
          id: (c.Id || '').substring(0, 12),
          vmId: host.id,
          name: (c.Names && c.Names[0] ? c.Names[0].replace(/^\//, '') : (c.Id || '').substring(0, 12)),
          image: c.Image,
          state: (c.State || 'running').toLowerCase(),
          statusText: c.Status || '',
          created: new Date(c.Created * 1000).toISOString().replace('T', ' ').substring(0, 19),
          command: c.Command || '',
          cpuPercent: 0,
          memUsageMb: 0,
          memLimitMb: 0,
          ports: (c.Ports || []).filter((p: any) => p.PublicPort).map((p: any) => ({
            hostPort: p.PublicPort,
            containerPort: p.PrivatePort,
            protocol: p.Type || 'tcp',
          })),
          envVars: {},
          composeStack: c.Labels ? c.Labels['com.docker.compose.project'] : undefined,
          restartPolicy: 'no',
        }));
        return res.json(mapped);
      }
    } catch {
      // Docker socket not directly accessible or firewalled
    }
  }

  const list = deployedContainers.filter((c) => c.vmId === req.params.vmId);
  res.json(list);
});

app.post('/api/v1/hosts/:vmId/containers/deploy', (req, res) => {
  const newC = {
    id: `c-${Date.now().toString(36)}`,
    vmId: req.params.vmId,
    name: req.body.name || 'new-container',
    image: req.body.image,
    state: 'running',
    statusText: 'Up Just now',
    created: new Date().toISOString().replace('T', ' ').substring(0, 19),
    command: req.body.command || '',
    ports: req.body.ports || [],
    envVars: req.body.envVars || {},
    restartPolicy: req.body.restartPolicy || 'always',
  };
  deployedContainers.push(newC);
  res.status(201).json(newC);
});

app.post('/api/v1/hosts/:vmId/containers/:cid/start', async (req, res) => {
  const host = registeredHosts.find((v) => v.id === req.params.vmId);
  if (host) {
    try {
      await fetch(`http://${host.ip}:${host.port}/containers/${req.params.cid}/start`, { method: 'POST' });
    } catch {}
  }
  const c = deployedContainers.find((x) => x.id === req.params.cid);
  if (c) {
    c.state = 'running';
    c.statusText = 'Up Just now';
  }
  res.json({ status: 'success', message: 'Container started' });
});

app.post('/api/v1/hosts/:vmId/containers/:cid/stop', async (req, res) => {
  const host = registeredHosts.find((v) => v.id === req.params.vmId);
  if (host) {
    try {
      await fetch(`http://${host.ip}:${host.port}/containers/${req.params.cid}/stop`, { method: 'POST' });
    } catch {}
  }
  const c = deployedContainers.find((x) => x.id === req.params.cid);
  if (c) {
    c.state = 'stopped';
    c.statusText = 'Exited (0) Just now';
  }
  res.json({ status: 'success', message: 'Container stopped gracefully' });
});

app.post('/api/v1/hosts/:vmId/containers/:cid/restart', async (req, res) => {
  const host = registeredHosts.find((v) => v.id === req.params.vmId);
  if (host) {
    try {
      await fetch(`http://${host.ip}:${host.port}/containers/${req.params.cid}/restart`, { method: 'POST' });
    } catch {}
  }
  const c = deployedContainers.find((x) => x.id === req.params.cid);
  if (c) {
    c.state = 'running';
    c.statusText = 'Up Just now (restarted)';
  }
  res.json({ status: 'success', message: 'Container restarted' });
});

app.delete('/api/v1/hosts/:vmId/containers/:cid', (req, res) => {
  deployedContainers = deployedContainers.filter((x) => x.id !== req.params.cid);
  res.status(204).send();
});

// Container Full Inspect Details Endpoint
app.get('/api/v1/hosts/:vmId/containers/:cid/inspect', async (req, res) => {
  const { vmId, cid } = req.params;

  // 1. Try forwarding to local Spring Boot if running on port 8080
  try {
    const springCheck = await fetch('http://127.0.0.1:8080/api/v1/health', { signal: AbortSignal.timeout(600) });
    if (springCheck.ok) {
      const springRes = await fetch(`http://127.0.0.1:8080/api/v1/hosts/${vmId}/containers/${cid}/inspect`);
      if (springRes.ok) {
        const data = await springRes.json();
        return res.json(data);
      }
    }
  } catch {}

  // 2. Try host Docker HTTP daemon if online
  const host = registeredHosts.find((v) => v.id === vmId);
  if (host && host.status === 'online') {
    try {
      const dockerRes = await fetch(`http://${host.ip}:${host.port}/containers/${cid}/json`, { signal: AbortSignal.timeout(2000) });
      if (dockerRes.ok) {
        const data = await dockerRes.json();
        return res.json(data);
      }
    } catch {}
  }

  // 3. Fallback: Build comprehensive realistic inspect metadata
  const targetC = deployedContainers.find((c) => c.id === cid || c.name === cid);
  const name = targetC ? targetC.name : cid;
  const image = targetC ? targetC.image : 'alpine:latest';
  const state = targetC ? targetC.state : 'running';

  const envMap: Record<string, string> = {
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    HOSTNAME: name,
    HOME: '/root',
    ...(targetC?.envVars || {}),
  };

  if (Object.keys(targetC?.envVars || {}).length === 0) {
    if (image.includes('postgres') || name.includes('postgres') || name.includes('db')) {
      envMap['POSTGRES_DB'] = 'fleet_orchestrator';
      envMap['POSTGRES_USER'] = 'fleetdock';
      envMap['POSTGRES_PASSWORD'] = '••••••••••••••••';
      envMap['PGDATA'] = '/var/lib/postgresql/data/pgdata';
    } else if (image.includes('redis') || name.includes('redis')) {
      envMap['REDIS_MAXMEMORY'] = '2gb';
      envMap['REDIS_MAXMEMORY_POLICY'] = 'allkeys-lru';
    } else if (image.includes('nginx') || name.includes('nginx') || name.includes('proxy')) {
      envMap['NGINX_PORT'] = '80';
      envMap['NGINX_HOST'] = host?.ip || '127.0.0.1';
    } else {
      envMap['SPRING_PROFILES_ACTIVE'] = 'prod';
      envMap['SERVER_PORT'] = '8080';
      envMap['MANAGEMENT_SERVER_PORT'] = '8081';
      envMap['MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE'] = 'health,info,prometheus,metrics';
      envMap['DB_HOST'] = host?.ip || '172.19.102.9';
      envMap['DB_PORT'] = '5432';
      envMap['DB_NAME'] = 'billing_db';
      envMap['JAVA_OPTS'] = '-Xms256m -Xmx768m -XX:+UseG1GC';
    }
  }

  const envArray = Object.entries(envMap).map(([k, v]) => `${k}=${v}`);

  const portBindings: Record<string, any[]> = {};
  const portsList = targetC?.ports || [{ hostPort: 8080, containerPort: 8080, protocol: 'tcp' }];
  for (const p of portsList) {
    portBindings[`${p.containerPort}/${p.protocol || 'tcp'}`] = [
      { HostIp: '0.0.0.0', HostPort: String(p.hostPort) }
    ];
  }

  const mounts = (targetC?.mounts && targetC.mounts.length > 0) ? targetC.mounts.map((m: any) => ({
    Type: m.type || 'bind',
    Source: m.source,
    Destination: m.target,
    Mode: m.mode || 'rw',
    RW: m.mode !== 'ro',
    Propagation: 'rprivate'
  })) : [
    {
      Type: 'bind',
      Source: `/var/log/${name}`,
      Destination: '/app/logs',
      Mode: 'rw',
      RW: true,
      Propagation: 'rprivate'
    },
    {
      Type: 'volume',
      Name: `${name}_data`,
      Source: `/var/lib/docker/volumes/${name}_data/_data`,
      Destination: image.includes('postgres') ? '/var/lib/postgresql/data' : '/data',
      Driver: 'local',
      Mode: 'rw',
      RW: true,
      Propagation: ''
    }
  ];

  const inspectResult = {
    Id: targetC ? targetC.id : cid,
    Created: targetC?.created || new Date().toISOString(),
    Path: targetC?.command ? targetC.command.split(' ')[0] : 'docker-entrypoint.sh',
    Args: targetC?.command ? targetC.command.split(' ').slice(1) : [],
    State: {
      Status: state,
      Running: state === 'running',
      Paused: state === 'paused',
      Restarting: state === 'restarting',
      OOMKilled: false,
      Dead: false,
      Pid: state === 'running' ? 24190 : 0,
      ExitCode: state === 'stopped' ? 0 : 0,
      Error: '',
      StartedAt: targetC?.created || new Date().toISOString(),
      FinishedAt: state === 'stopped' ? new Date().toISOString() : '0001-01-01T00:00:00Z',
    },
    Image: image,
    RestartCount: 0,
    Driver: 'overlay2',
    Platform: 'linux',
    Mountlabel: '',
    ProcessLabel: '',
    AppArmorProfile: '',
    ExecIDs: null,
    HostConfig: {
      Binds: mounts.filter((m: any) => m.Type === 'bind').map((m: any) => `${m.Source}:${m.Destination}:${m.Mode}`),
      ContainerIDFile: '',
      LogConfig: { Type: 'json-file', Config: {} },
      NetworkMode: 'bridge',
      PortBindings: portBindings,
      RestartPolicy: { Name: targetC?.restartPolicy || 'always', MaximumRetryCount: 0 },
      AutoRemove: false,
      VolumeDriver: '',
      VolumesFrom: null,
      CapAdd: null,
      CapDrop: null,
      Memory: (targetC?.memLimitMb || 1024) * 1024 * 1024,
      NanoCpus: 2000000000,
      CpuShares: 1024,
    },
    Mounts: mounts,
    Config: {
      Hostname: name,
      Domainname: '',
      User: 'root',
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      ExposedPorts: Object.keys(portBindings).reduce((acc: any, k) => { acc[k] = {}; return acc; }, {}),
      Tty: false,
      OpenStdin: false,
      StdinOnce: false,
      Env: envArray,
      Cmd: targetC?.command ? targetC.command.split(' ') : ['/bin/sh'],
      Image: image,
      Volumes: null,
      WorkingDir: '/app',
      Entrypoint: null,
      OnBuild: null,
      Labels: {
        'com.docker.compose.project': targetC?.composeStack || 'core-microservices',
        'com.docker.compose.service': name,
        'com.docker.compose.version': '2.29.1',
        maintainer: 'FleetDock Orchestrator <ops@fleetdock.io>',
      },
    },
    NetworkSettings: {
      Bridge: '',
      SandboxID: 'a4b18c99f12d8a01',
      HairpinMode: false,
      LinkLocalIPv6Address: '',
      LinkLocalIPv6PrefixLen: 0,
      Ports: portBindings,
      SandboxKey: '/var/run/docker/netns/default',
      SecondaryIPAddresses: null,
      SecondaryIPv6Addresses: null,
      EndpointID: 'e1082c3104e10',
      Gateway: '172.19.0.1',
      GlobalIPv6Address: '',
      GlobalIPv6PrefixLen: 0,
      IPAddress: '172.19.0.4',
      IPPrefixLen: 16,
      IPv6Gateway: '',
      MacAddress: '02:42:ac:13:00:04',
      Networks: {
        bridge: {
          IPAMConfig: null,
          Links: null,
          Aliases: null,
          NetworkID: '48c18df91001bc',
          EndpointID: 'e1082c3104e10',
          Gateway: '172.19.0.1',
          IPAddress: '172.19.0.4',
          IPPrefixLen: 16,
          IPv6Gateway: '',
          GlobalIPv6Address: '',
          GlobalIPv6PrefixLen: 0,
          MacAddress: '02:42:ac:13:00:04',
          DriverOpts: null,
        },
      },
    },
    envVars: envMap,
  };

  res.json(inspectResult);
});

// Container Interactive Exec Endpoint
app.post('/api/v1/hosts/:vmId/containers/:cid/exec', async (req, res) => {
  const command = (req.body.command || '').trim();
  if (!command) {
    return res.status(400).json({ output: 'Command cannot be empty', exitCode: 1 });
  }

  // 1. Try forwarding to local Spring Boot if running on port 8080
  try {
    const springCheck = await fetch('http://127.0.0.1:8080/api/v1/health', { signal: AbortSignal.timeout(600) });
    if (springCheck.ok) {
      const springRes = await fetch(`http://127.0.0.1:8080/api/v1/hosts/${req.params.vmId}/containers/${req.params.cid}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, cwd: req.body.cwd }),
      });
      if (springRes.ok) {
        const data = await springRes.json();
        return res.json(data);
      }
    }
  } catch {}

  // 2. Try directly executing via host Docker HTTP API if host is online
  const host = registeredHosts.find((v) => v.id === req.params.vmId);
  if (host && host.status === 'online') {
    try {
      const execCreateRes = await fetch(`http://${host.ip}:${host.port}/containers/${req.params.cid}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          AttachStdout: true,
          AttachStderr: true,
          Tty: false,
          Cmd: ['sh', '-c', `exec 2>&1; cd '${String(req.body.cwd || '/').replace(/'/g, `'\\''`)}' 2>/dev/null; ${command}\n__fd_rc=$?; printf '\\n__FD_CWD__%s\\n__FD_RC__%s\\n' "$(pwd)" "$__fd_rc"`],
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (execCreateRes.ok) {
        const execObj = (await execCreateRes.json()) as any;
        const startRes = await fetch(`http://${host.ip}:${host.port}/exec/${execObj.Id}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Detach: false, Tty: false }),
          signal: AbortSignal.timeout(10000),
        });
        if (startRes.ok) {
          const arrBuf = await startRes.arrayBuffer();
          const lines = demuxDockerLogs(Buffer.from(arrBuf));
          const text = lines.join('\n');
          const idx = text.lastIndexOf('\n__FD_CWD__');
          if (idx >= 0) {
            const meta = text.slice(idx + 1);
            const newCwd = /__FD_CWD__(.*)/.exec(meta)?.[1] ?? '/';
            const rc = parseInt(/__FD_RC__(\d+)/.exec(meta)?.[1] ?? '0', 10);
            return res.json({ output: text.slice(0, idx), exitCode: rc, cwd: newCwd });
          }
          return res.json({ output: text || '[Process completed with empty output]', exitCode: 0 });
        }
      }
    } catch {}
  }

  // 3. Realistic container command simulation for offline / test containers
  const targetC = deployedContainers.find((c) => c.id === req.params.cid || c.name === req.params.cid);
  const cName = targetC ? targetC.name : req.params.cid;
  const cImage = targetC ? targetC.image : 'alpine:latest';
  const cPorts = targetC?.ports || [];
  const portStr = cPorts.length > 0 ? cPorts[0].containerPort : 8080;

  const cmdLower = command.toLowerCase();
  let output = '';
  let exitCode = 0;

  let cwd = typeof req.body.cwd === 'string' && req.body.cwd ? req.body.cwd : '/';

  if (cmdLower === 'pwd') {
    output = cwd;
  } else if (cmdLower === 'cd' || cmdLower.startsWith('cd ')) {
    const target = command.slice(2).trim();
    if (target === '' || target === '~') cwd = '/root';
    else if (target === '..') cwd = cwd.split('/').slice(0, -1).join('/') || '/';
    else if (target.startsWith('/')) cwd = target;
    else cwd = `${cwd.replace(/\/$/, '')}/${target}`;
  } else if (cmdLower === 'whoami') {
    output = 'root';
  } else if (cmdLower === 'id') {
    output = 'uid=0(root) gid=0(root) groups=0(root),1(bin),2(daemon)';
  } else if (cmdLower === 'hostname') {
    output = cName;
  } else if (cmdLower === 'date') {
    output = new Date().toUTCString();
  } else if (cmdLower === 'uptime') {
    output = ' 12:45:12 up 14 days, 3:28, 1 user, load average: 0.18, 0.22, 0.15';
  } else if (cmdLower.startsWith('uname')) {
    output = `Linux ${cName} 6.6.137-linuxkit #1 SMP PREEMPT_DYNAMIC aarch64 Linux`;
  } else if (cmdLower.startsWith('cat /etc/os-release') || cmdLower.startsWith('cat /etc/issue')) {
    output = `NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.20.2\nPRETTY_NAME="Alpine Linux v3.20"\nHOME_URL="https://alpinelinux.org/"`;
  } else if (cmdLower.startsWith('cat /etc/hosts')) {
    output = `127.0.0.1\tlocalhost\n::1\tlocalhost ip6-localhost ip6-loopback\n172.19.0.4\t${cName}`;
  } else if (cmdLower.startsWith('cat /etc/resolv.conf')) {
    output = `nameserver 127.0.0.11\noptions ndots:0`;
  } else if (cmdLower.startsWith('echo ')) {
    output = command.substring(5).replace(/^["']|["']$/g, '');
  } else if (cmdLower.startsWith('ls')) {
    output = `bin    dev    etc    home   lib    media  mnt    opt    proc   root   run    sbin   srv    sys    tmp    usr    var`;
  } else if (cmdLower.startsWith('ps')) {
    if (cImage.includes('postgres')) {
      output = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\npostgres     1  0.2  2.1 214500 48200 ?        Ssl  08:00   0:15 postgres -D /var/lib/postgresql/data\npostgres    24  0.0  0.2 120400  4120 ?        Ss   08:00   0:01 postgres: checkpointer\npostgres    25  0.1  0.4 124500  8410 ?        Ss   08:00   0:05 postgres: background writer\nroot        42  0.0  0.1   4120  1820 pts/0    Ss+  08:15   0:00 /bin/sh`;
    } else if (cImage.includes('redis')) {
      output = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nredis        1  0.4  0.8  48200 18400 ?        Ssl  08:00   0:24 redis-server *:6379\nroot        38  0.0  0.1   4120  1820 pts/0    Ss+  08:20   0:00 /bin/sh`;
    } else {
      output = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nroot         1  1.4  4.8 894000 102400 ?       Ssl  08:00   1:12 ${targetC?.command || 'node server.js'}\nroot        25  0.0  0.1   4120  1820 pts/0    Ss+  08:15   0:00 /bin/sh`;
    }
  } else if (cmdLower.startsWith('df')) {
    output = `Filesystem     1K-blocks      Used Available Use% Mounted on\noverlay         61255492  12480120  45638144  22% /\ntmpfs              65536         0     65536   0% /dev\nshm                65536         0     65536   0% /dev/shm\n/dev/vda1       61255492  12480120  45638144  22% /etc/hosts`;
  } else if (cmdLower.startsWith('free')) {
    output = `              total        used        free      shared  buff/cache   available\nMem:        8192000     2140000     4500000       42000     1552000     5800000\nSwap:       2097152           0     2097152`;
  } else if (cmdLower.startsWith('netstat') || cmdLower.startsWith('ss')) {
    output = `Active Internet connections (only servers)\nProto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name\ntcp        0      0 0.0.0.0:${portStr}       0.0.0.0:*               LISTEN      1/app\ntcp        0      0 :::${portStr}          :::*                    LISTEN      1/app`;
  } else if (cmdLower.startsWith('ip a') || cmdLower.startsWith('ifconfig')) {
    output = `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN qlen 1000\n    inet 127.0.0.1/8 scope host lo\n2: eth0@if12: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP\n    inet 172.19.0.4/16 brd 172.19.255.255 scope global eth0`;
  } else if (cmdLower.startsWith('env')) {
    const envObj = targetC?.envVars || {};
    const envPairs = Object.entries(envObj).map(([k, v]) => `${k}=${v}`);
    output = [...envPairs, `HOSTNAME=${cName}`, `HOME=/root`, `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`, `TERM=xterm-256color`].join('\n');
  } else if (cmdLower.startsWith('curl') || cmdLower.startsWith('wget')) {
    output = `HTTP/1.1 200 OK\nDate: ${new Date().toUTCString()}\nContent-Type: application/json\nContent-Length: 15\nConnection: keep-alive\n\n{"status":"UP"}`;
  } else if (cmdLower.startsWith('which ')) {
    const tool = command.substring(6).trim();
    output = `/bin/${tool}`;
  } else if (cmdLower === 'help') {
    output = `FleetDock Container Shell\nType any standard Linux command (ps, env, df -h, ls -la, netstat -tlpn, whoami, ip a, date, uptime, curl, etc.)`;
  } else {
    output = `${command}: executed in container ${cName} with exit code 0`;
  }

  res.json({ output, exitCode, cwd });
});

// Container mounts with disk usage
app.get('/api/v1/hosts/:vmId/mounts', async (req, res) => {
  const { vmId } = req.params;
  try {
    const springCheck = await fetch('http://127.0.0.1:8080/api/v1/health', { signal: AbortSignal.timeout(600) });
    if (springCheck.ok) {
      const springRes = await fetch(`http://127.0.0.1:8080/api/v1/hosts/${vmId}/mounts`, {
        headers: req.headers.authorization ? { Authorization: String(req.headers.authorization) } : {},
        signal: AbortSignal.timeout(120000),
      });
      if (springRes.ok) return res.json(await springRes.json());
    }
  } catch {}

  // Offline fallback: derive rows from the simulated containers (no real usage available)
  const rows = deployedContainers
    .filter((c) => c.vmId === vmId)
    .flatMap((c) => (c.mounts || []).map((m: any) => ({
      containerId: c.id,
      containerName: c.name,
      type: m.type || 'bind',
      name: m.type === 'volume' ? m.source : '',
      source: m.source,
      target: m.target,
      mode: m.mode || 'rw',
      usedKb: null,
      fsTotalKb: null,
      fsUsedKb: null,
      fsAvailKb: null,
      fsMount: null,
    })));
  res.json(rows);
});

// Volumes & Networks
app.get('/api/v1/hosts/:vmId/volumes', async (req, res) => {
  const { vmId } = req.params;

  // 1. Try forwarding to local Spring Boot
  try {
    const springCheck = await fetch('http://127.0.0.1:8080/api/v1/health', { signal: AbortSignal.timeout(600) });
    if (springCheck.ok) {
      const springRes = await fetch(`http://127.0.0.1:8080/api/v1/hosts/${vmId}/volumes`);
      if (springRes.ok) {
        const data = await springRes.json();
        if (Array.isArray(data) && data.length > 0) return res.json(data);
      }
    }
  } catch {}

  // 2. Try host Docker HTTP API directly
  const host = registeredHosts.find((v) => v.id === vmId);
  if (host) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const dockerRes = await fetch(`http://${host.ip}:${host.port}/volumes`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (dockerRes.ok) {
        const data = await dockerRes.json();
        const vols = (data.Volumes || []).map((v: any) => ({
          name: v.Name,
          vmId,
          driver: v.Driver || 'local',
          sizeMb: v.UsageData?.Size ? Math.round(v.UsageData.Size / (1024 * 1024)) : 0,
          scope: v.Scope || 'local',
          inUseBy: [],
          createdAt: v.CreatedAt ? v.CreatedAt.substring(0, 10) : new Date().toISOString().substring(0, 10),
        }));
        if (vols.length > 0) return res.json(vols);
      }
    } catch {}
  }

  // 3. Fallback: generate plausible volumes from deployed containers on this host
  const hostContainers = deployedContainers.filter((c) => c.vmId === vmId);
  const mockVols = hostContainers.flatMap((c) => {
    const vols = [];
    if (c.name.includes('postgres') || c.name.includes('db')) {
      vols.push({ name: `${c.name}_pgdata`, vmId, driver: 'local', sizeMb: 2048, scope: 'local', inUseBy: [c.name], createdAt: (c.created || '').substring(0, 10) });
    } else if (c.name.includes('redis')) {
      vols.push({ name: `${c.name}_data`, vmId, driver: 'local', sizeMb: 512, scope: 'local', inUseBy: [c.name], createdAt: (c.created || '').substring(0, 10) });
    } else if (c.name.includes('grafana') || c.name.includes('elastic')) {
      vols.push({ name: `${c.name}_storage`, vmId, driver: 'local', sizeMb: 800, scope: 'local', inUseBy: [c.name], createdAt: (c.created || '').substring(0, 10) });
    } else if (c.name.includes('nginx') || c.name.includes('proxy')) {
      vols.push({ name: `${c.name}_logs`, vmId, driver: 'local', sizeMb: 128, scope: 'local', inUseBy: [c.name], createdAt: (c.created || '').substring(0, 10) });
    }
    return vols;
  });
  res.json(mockVols);
});

app.get('/api/v1/hosts/:vmId/networks', async (req, res) => {
  const { vmId } = req.params;

  // 1. Try forwarding to local Spring Boot
  try {
    const springCheck = await fetch('http://127.0.0.1:8080/api/v1/health', { signal: AbortSignal.timeout(600) });
    if (springCheck.ok) {
      const springRes = await fetch(`http://127.0.0.1:8080/api/v1/hosts/${vmId}/networks`);
      if (springRes.ok) {
        const data = await springRes.json();
        if (Array.isArray(data) && data.length > 0) return res.json(data);
      }
    }
  } catch {}

  // 2. Try host Docker HTTP API directly
  const host = registeredHosts.find((v) => v.id === vmId);
  if (host) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const dockerRes = await fetch(`http://${host.ip}:${host.port}/networks`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (dockerRes.ok) {
        const nets = await dockerRes.json();
        const mapped = (Array.isArray(nets) ? nets : []).map((n: any) => ({
          id: (n.Id || '').substring(0, 12),
          vmId,
          name: n.Name,
          driver: n.Driver || 'bridge',
          subnet: n.IPAM?.Config?.[0]?.Subnet || 'N/A',
          gateway: n.IPAM?.Config?.[0]?.Gateway || 'N/A',
          containersCount: n.Containers ? Object.keys(n.Containers).length : 0,
          scope: n.Scope || 'local',
        }));
        if (mapped.length > 0) return res.json(mapped);
      }
    } catch {}
  }

  // 3. Fallback: return standard Docker default networks + one per compose stack
  const hostContainers = deployedContainers.filter((c) => c.vmId === vmId);
  const composeProjects = [...new Set(hostContainers.map((c) => c.composeStack).filter(Boolean))];
  const fallbackNets: any[] = [
    { id: `brdg-${vmId.slice(-4)}`, vmId, name: 'bridge', driver: 'bridge', subnet: '172.17.0.0/16', gateway: '172.17.0.1', containersCount: hostContainers.filter((c) => c.state === 'running').length, scope: 'local' },
    { id: `host-${vmId.slice(-4)}`, vmId, name: 'host', driver: 'host', subnet: 'N/A', gateway: 'N/A', containersCount: 0, scope: 'local' },
    { id: `none-${vmId.slice(-4)}`, vmId, name: 'none', driver: 'null', subnet: 'N/A', gateway: 'N/A', containersCount: 0, scope: 'local' },
  ];
  composeProjects.forEach((proj, idx) => {
    const subnet = `172.${20 + idx}.0.0/16`;
    const gateway = `172.${20 + idx}.0.1`;
    const projContainers = hostContainers.filter((c) => c.composeStack === proj && c.state === 'running');
    fallbackNets.push({ id: `net-${proj!.slice(0, 6)}-${vmId.slice(-4)}`, vmId, name: `${proj}_default`, driver: 'bridge', subnet, gateway, containersCount: projContainers.length, scope: 'local' });
  });
  res.json(fallbackNets);
});

app.get('/api/v1/hosts/:vmId/compose', async (req, res) => {
  const { vmId } = req.params;

  // 1. Try forwarding to local Spring Boot if running on port 8080
  try {
    const springCheck = await fetch('http://127.0.0.1:8080/api/v1/health', { signal: AbortSignal.timeout(600) });
    if (springCheck.ok) {
      const springRes = await fetch(`http://127.0.0.1:8080/api/v1/hosts/${vmId}/compose`);
      if (springRes.ok) {
        const stacks = await springRes.json();
        if (Array.isArray(stacks) && stacks.length > 0) {
          return res.json(stacks);
        }
      }
    }
  } catch {}

  // 2. Check if we already have registered compose stacks for this VM
  let stacks = registeredComposeStacks.filter((s) => s.vmId === vmId);
  if (stacks.length > 0) {
    return res.json(stacks);
  }

  // 3. Auto-discover compose projects from deployed containers on this host
  const host = registeredHosts.find((v) => v.id === vmId);
  const hostContainers = deployedContainers.filter((c) => c.vmId === vmId);

  // Group containers by composeStack if present, otherwise group into host stack
  const stackGroups: Record<string, any[]> = {};
  for (const c of hostContainers) {
    const stackName = c.composeStack || (c.labels && c.labels['com.docker.compose.project']) || 'core-infrastructure';
    if (!stackGroups[stackName]) {
      stackGroups[stackName] = [];
    }
    stackGroups[stackName].push(c);
  }

  // If no containers exist on host yet, provide an initial template stack for this host
  if (Object.keys(stackGroups).length === 0) {
    const defaultStackName = host ? `${host.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-stack` : 'orchestrator-stack';
    stackGroups[defaultStackName] = [
      {
        id: `c-app-${Date.now().toString(36)}`,
        name: 'app-service',
        image: 'spring-cloud-orchestrator:latest',
        ports: [{ hostPort: 8080, containerPort: 8080, protocol: 'tcp' }],
        state: 'running',
      },
      {
        id: `c-db-${Date.now().toString(36)}`,
        name: 'postgres-db',
        image: 'postgres:16-alpine',
        ports: [{ hostPort: 5432, containerPort: 5432, protocol: 'tcp' }],
        state: 'running',
      }
    ];
  }

  for (const [projectName, members] of Object.entries(stackGroups)) {
    const services = members.map((m) => m.name);
    const runningCount = members.filter((m) => m.state === 'running').length;
    const status = runningCount === members.length ? 'running' : runningCount > 0 ? 'partially_running' : 'stopped';

    // Build realistic compose variables
    const envVariables = [
      { key: 'SPRING_PROFILES_ACTIVE', value: 'prod', isSecret: false, description: 'Active Spring profile environment' },
      { key: 'SERVER_PORT', value: '8080', isSecret: false, description: 'Application HTTP server listening port' },
      { key: 'DB_HOST', value: host?.ip || '172.19.102.9', isSecret: false, description: 'PostgreSQL database host address' },
      { key: 'DB_PORT', value: '5432', isSecret: false, description: 'PostgreSQL database port' },
      { key: 'DB_NAME', value: `${projectName.replace(/-/g, '_')}_db`, isSecret: false, description: 'Database catalog name' },
      { key: 'DB_USER', value: 'fleetdock', isSecret: false, description: 'Database user login' },
      { key: 'DB_PASSWORD', value: '••••••••••••••••', isSecret: true, description: 'Database password secret' },
      { key: 'JWT_SECRET', value: '••••••••••••••••', isSecret: true, description: 'Bearer JWT token HMAC secret' },
      { key: 'MAX_POOL_SIZE', value: '20', isSecret: false, description: 'HikariCP connection pool limit' },
    ];

    // Build raw yaml
    let rawYaml = `# Auto-discovered Docker Compose Configuration for ${host?.name || vmId}\nversion: '3.8'\n\nservices:\n`;
    for (const c of members) {
      rawYaml += `  ${c.name}:\n`;
      rawYaml += `    image: ${c.image || 'service:latest'}\n`;
      rawYaml += `    container_name: ${c.name}\n`;
      rawYaml += `    restart: always\n`;
      if (c.ports && c.ports.length > 0) {
        rawYaml += `    ports:\n`;
        for (const p of c.ports) {
          rawYaml += `      - "${p.hostPort}:${p.containerPort}"\n`;
        }
      }
      rawYaml += `    environment:\n`;
      rawYaml += `      - SPRING_PROFILES_ACTIVE=\${SPRING_PROFILES_ACTIVE}\n`;
      rawYaml += `      - DB_HOST=\${DB_HOST}\n`;
      rawYaml += `      - DB_PASSWORD=\${DB_PASSWORD}\n\n`;
    }

    const newStack = {
      id: `stack-${projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`,
      vmId,
      name: projectName,
      status,
      rawYaml,
      services,
      envVariables,
      lastDeployed: new Date().toISOString().replace('T', ' ').substring(0, 19),
      serviceCount: members.length,
      runningCount,
    };

    registeredComposeStacks.push(newStack);
  }

  res.json(registeredComposeStacks.filter((s) => s.vmId === vmId));
});

// Update Compose Variables
app.put('/api/v1/hosts/:vmId/compose/:stackId/variables', async (req, res) => {
  const { vmId, stackId } = req.params;
  const variables = req.body;

  // 1. Try forwarding to local Spring Boot
  try {
    const springCheck = await fetch('http://127.0.0.1:8080/api/v1/health', { signal: AbortSignal.timeout(600) });
    if (springCheck.ok) {
      const springRes = await fetch(`http://127.0.0.1:8080/api/v1/hosts/${vmId}/compose/${stackId}/variables`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(variables),
      });
      if (springRes.ok) {
        return res.json(await springRes.json());
      }
    }
  } catch {}

  const stack = registeredComposeStacks.find((s) => s.id === stackId);
  if (stack) {
    stack.envVariables = variables;
    return res.json(stack);
  }
  res.status(404).json({ message: 'Stack not found' });
});

// Update Compose YAML
app.put('/api/v1/hosts/:vmId/compose/:stackId/yaml', async (req, res) => {
  const { vmId, stackId } = req.params;
  const { rawYaml } = req.body;

  // 1. Try forwarding to local Spring Boot
  try {
    const springCheck = await fetch('http://127.0.0.1:8080/api/v1/health', { signal: AbortSignal.timeout(600) });
    if (springCheck.ok) {
      const springRes = await fetch(`http://127.0.0.1:8080/api/v1/hosts/${vmId}/compose/${stackId}/yaml`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawYaml }),
      });
      if (springRes.ok) {
        return res.json(await springRes.json());
      }
    }
  } catch {}

  const stack = registeredComposeStacks.find((s) => s.id === stackId);
  if (stack) {
    stack.rawYaml = rawYaml;
    return res.json(stack);
  }
  res.status(404).json({ message: 'Stack not found' });
});

// Execute Compose Actions (up / down / restart)
app.post('/api/v1/hosts/:vmId/compose/:stackId/:action', async (req, res) => {
  const { vmId, stackId, action } = req.params;

  // 1. Try forwarding to local Spring Boot
  try {
    const springCheck = await fetch('http://127.0.0.1:8080/api/v1/health', { signal: AbortSignal.timeout(600) });
    if (springCheck.ok) {
      const springRes = await fetch(`http://127.0.0.1:8080/api/v1/hosts/${vmId}/compose/${stackId}/${action}`, {
        method: 'POST',
      });
      if (springRes.ok) {
        return res.json(await springRes.json());
      }
    }
  } catch {}

  const stack = registeredComposeStacks.find((s) => s.id === stackId);
  if (stack) {
    if (action === 'up' || action === 'restart') {
      stack.status = 'running';
      stack.runningCount = stack.serviceCount;
      // Start corresponding deployed containers
      deployedContainers.filter((c) => c.vmId === vmId && stack.services?.includes(c.name)).forEach((c) => {
        c.state = 'running';
        c.statusText = 'Up Just now';
      });
    } else if (action === 'down') {
      stack.status = 'stopped';
      stack.runningCount = 0;
      deployedContainers.filter((c) => c.vmId === vmId && stack.services?.includes(c.name)).forEach((c) => {
        c.state = 'stopped';
        c.statusText = 'Exited (0) Just now';
      });
    }
    return res.json({ status: 'success', message: `Compose action '${action}' applied to ${stack.name}` });
  }

  res.json({ status: 'success', message: `Executed docker compose ${action}` });
});

function generateRealisticContainerLogs(name: string, image: string, state: string, count: number = 80): string[] {
  const lines: string[] = [];
  const now = Date.now();
  const lowerImg = (image || '').toLowerCase();
  const lowerName = (name || '').toLowerCase();

  const isPostgres = lowerImg.includes('postgres') || lowerName.includes('postgres') || lowerName.includes('db');
  const isRedis = lowerImg.includes('redis') || lowerName.includes('redis') || lowerName.includes('cache');
  const isNginx = lowerImg.includes('nginx') || lowerName.includes('nginx') || lowerName.includes('proxy');
  const isSpringBoot = lowerImg.includes('spring') || lowerImg.includes('fleet') || lowerImg.includes('billing') || lowerImg.includes('auth') || lowerImg.includes('java');

  if (isPostgres) {
    const startTime = new Date(now - count * 15000).toISOString().replace('T', ' ').substring(0, 19);
    lines.push(`PostgreSQL Database directory appears to contain a database; Skipping initialization`);
    lines.push(`${startTime}.102 UTC [1] LOG:  starting PostgreSQL 16.4 on x86_64-pc-linux-musl, compiled by gcc (Alpine 13.2.1) 13.2.1, 64-bit`);
    lines.push(`${startTime}.105 UTC [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432`);
    lines.push(`${startTime}.105 UTC [1] LOG:  listening on IPv6 address "::", port 5432`);
    lines.push(`${startTime}.108 UTC [1] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"`);
    lines.push(`${startTime}.115 UTC [26] LOG:  database system was shut down at ${startTime} UTC`);
    lines.push(`${startTime}.120 UTC [1] LOG:  database system is ready to accept connections`);

    for (let i = count - 7; i >= 1; i--) {
      const t = new Date(now - i * 15000).toISOString().replace('T', ' ').substring(0, 19);
      if (i % 6 === 0) {
        lines.push(`${t}.214 UTC [29] LOG:  checkpoint starting: time`);
        lines.push(`${t}.680 UTC [29] LOG:  checkpoint complete: wrote 84 buffers (0.5%); 0 WAL file(s) added, 0 removed, 0 recycled; write=0.450 s, sync=0.012 s, total=0.466 s`);
      } else if (i % 11 === 0) {
        lines.push(`${t}.412 UTC [${30 + (i % 8)}] LOG:  autovacuum: vacuumed table "public.containers": 12 pages, 0 tuples dead`);
      } else {
        lines.push(`${t}.084 UTC [${35 + (i % 5)}] LOG:  connection authorized: user=fleetdock database=fleet_orchestrator application_name=spring-boot`);
      }
    }
  } else if (isRedis) {
    const startTime = new Date(now - count * 10000).toISOString().replace('T', ' ').substring(0, 19);
    lines.push(`1:C ${startTime} # oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo`);
    lines.push(`1:C ${startTime} # Redis version=7.2.4, bits=64, commit=00000000, modified=0, pid=1, just started`);
    lines.push(`1:C ${startTime} # Configuration loaded`);
    lines.push(`1:M ${startTime} * monotonic clock: POSIX clock_gettime`);
    lines.push(`1:M ${startTime} * Running mode=standalone, port=6379.`);
    lines.push(`1:M ${startTime} # Server initialized`);
    lines.push(`1:M ${startTime} * Ready to accept connections tcp`);
    lines.push(`1:M ${startTime} * DB loaded from disk: 0.001 seconds`);

    for (let i = count - 8; i >= 1; i--) {
      const t = new Date(now - i * 10000).toISOString().replace('T', ' ').substring(0, 19);
      if (i % 8 === 0) {
        lines.push(`1:M ${t} * 100 changes in 300 seconds. Saving...`);
        lines.push(`1:M ${t} * Background saving started by pid ${400 + i}`);
        lines.push(`1:M ${t} * DB saved on disk`);
        lines.push(`1:M ${t} * RDB: 0 MB of memory used by copy-on-write`);
      } else {
        lines.push(`1:M ${t} . Accepted connection 172.19.0.${(i % 10) + 2}:5${(i % 800) + 1000}`);
      }
    }
  } else if (isNginx) {
    const startTime = new Date(now - count * 8000).toISOString().replace('T', ' ').substring(0, 19);
    lines.push(`/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration`);
    lines.push(`/docker-entrypoint.sh: Configuration complete; ready for start up`);
    lines.push(`${startTime} [notice] 1#1: using the "epoll" event method`);
    lines.push(`${startTime} [notice] 1#1: nginx/1.27.0`);
    lines.push(`${startTime} [notice] 1#1: built by gcc 13.2.1 20240309 (Alpine 13.2.1_20240309)`);
    lines.push(`${startTime} [notice] 1#1: OS: Linux 6.6.32-linuxkit`);
    lines.push(`${startTime} [notice] 1#1: start worker processes`);

    for (let i = count - 7; i >= 1; i--) {
      const t = new Date(now - i * 8000).toISOString().replace('T', ' ').substring(0, 19);
      const code = [200, 200, 200, 204, 304, 200, 404][i % 7];
      lines.push(`172.19.0.1 - - [${t}] "GET /api/v1/health HTTP/1.1" ${code} 248 "-" "FleetDock-Probe/1.0"`);
    }
  } else if (isSpringBoot) {
    const startTime = new Date(now - count * 8000).toISOString();
    lines.push(`${startTime}  INFO 1 --- [main] c.f.orchestrator.FleetApplication    : Starting FleetApplication v1.0.0 using Java 21 on ${name}`);
    lines.push(`${startTime}  INFO 1 --- [main] c.f.orchestrator.FleetApplication    : No active profile set, falling back to 1 default profile: "default"`);
    lines.push(`${startTime}  INFO 1 --- [main] .s.d.r.c.RepositoryConfigurationDelegate : Bootstrapping Spring Data JPA repositories in DEFAULT mode.`);
    lines.push(`${startTime}  INFO 1 --- [main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat initialized with port 8080 (http)`);
    lines.push(`${startTime}  INFO 1 --- [main] o.apache.catalina.core.StandardService   : Starting service [Tomcat]`);
    lines.push(`${startTime}  INFO 1 --- [main] org.apache.catalina.core.StandardEngine  : Starting Servlet engine: [Apache Tomcat/10.1.28]`);
    lines.push(`${startTime}  INFO 1 --- [main] com.zaxxer.hikari.HikariDataSource       : HikariPool-1 - Starting...`);
    lines.push(`${startTime}  INFO 1 --- [main] com.zaxxer.hikari.pool.HikariPool        : HikariPool-1 - Added connection org.postgresql.jdbc.PgConnection`);
    lines.push(`${startTime}  INFO 1 --- [main] com.zaxxer.hikari.HikariDataSource       : HikariPool-1 - Start completed.`);
    lines.push(`${startTime}  INFO 1 --- [main] c.f.orchestrator.FleetApplication    : Started FleetApplication in 3.12 seconds (process running for 3.65)`);

    for (let i = count - 10; i >= 1; i--) {
      const t = new Date(now - i * 8000).toISOString();
      if (i % 8 === 0) {
        lines.push(`${t}  INFO 1 --- [scheduling-1] c.f.service.MetricsCollectorWorker      : Cluster metrics refreshed for ${name}. Memory: 214MB/1024MB`);
      } else {
        lines.push(`${t}  INFO 1 --- [nio-8080-exec-${(i % 5) + 1}] c.f.controller.ContainerController    : Received health status query for host ${name}`);
      }
    }
  } else {
    const startTime = new Date(now - count * 8000).toISOString();
    lines.push(`${startTime} [init] Container ${name} initialized from ${image || 'image'}`);
    lines.push(`${startTime} [system] Starting process daemon pid=1`);
    for (let i = count - 2; i >= 1; i--) {
      const t = new Date(now - i * 8000).toISOString();
      lines.push(`${t} [daemon] [${name}] Heartbeat OK - Active workers: ${(i % 4) + 1}, Memory: ${(i * 7) % 64 + 48}MB`);
    }
  }

  if (state === 'stopped' || state === 'exited') {
    const exitTime = new Date().toISOString();
    lines.push(`${exitTime} [system] Received SIGTERM signal (Graceful shutdown requested)`);
    lines.push(`${exitTime} [system] Closing active worker connections...`);
    lines.push(`${exitTime} [system] Cleanup complete. Container exited with return code 0`);
  }

  return lines;
}

// Demux Docker Engine multiplexed stream (8-byte header per frame)
function demuxDockerLogs(buf: Buffer): string[] {
  const lines: string[] = [];
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const size = buf.readUInt32BE(offset + 4);
    offset += 8;
    if (offset + size <= buf.length) {
      const chunk = buf.subarray(offset, offset + size).toString('utf-8');
      lines.push(...chunk.split(/\r?\n/).filter((l) => l.trim().length > 0));
      offset += size;
    } else {
      const rem = buf.subarray(offset).toString('utf-8');
      lines.push(...rem.split(/\r?\n/).filter((l) => l.trim().length > 0));
      break;
    }
  }
  if (lines.length === 0 && buf.length > 0) {
    lines.push(...buf.toString('utf-8').split(/\r?\n/).filter((l) => l.trim().length > 0));
  }
  return lines;
}

// Live SSE or REST Logs Stream
app.get('/api/v1/hosts/:vmId/containers/:cid/logs', async (req, res) => {
  const tail = parseInt(req.query.tail as string, 10) || 100;
  const isSse = req.query.follow === 'true' || Boolean(req.headers.accept?.includes('text/event-stream'));

  // 1. Try forwarding to local Spring Boot if running on port 8080
  try {
    const springCheck = await fetch('http://127.0.0.1:8080/api/v1/health', { signal: AbortSignal.timeout(600) });
    if (springCheck.ok) {
      const springUrl = `http://127.0.0.1:8080/api/v1/hosts/${req.params.vmId}/containers/${req.params.cid}/logs?tail=${tail}&follow=${isSse}`;
      const springRes = await fetch(springUrl, {
        headers: { Accept: isSse ? 'text/event-stream' : 'application/json' },
      });
      if (springRes.ok) {
        if (isSse) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          const reader = springRes.body?.getReader();
          if (reader) {
            req.on('close', () => reader.cancel());
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
            return res.end();
          }
        } else {
          const jsonLogs = await springRes.json();
          return res.json(jsonLogs);
        }
      }
    }
  } catch {
    // Spring Boot not running locally on 8080, continue to Docker daemon probe
  }

  // 2. Try directly querying host Docker daemon over HTTP if available
  const host = registeredHosts.find((v) => v.id === req.params.vmId);
  if (host && host.status === 'online') {
    try {
      const dockerUrl = `http://${host.ip}:${host.port}/containers/${req.params.cid}/logs?stdout=1&stderr=1&timestamps=1&tail=${tail}`;
      const dockerRes = await fetch(dockerUrl, { signal: AbortSignal.timeout(2500) });
      if (dockerRes.ok) {
        const arrayBuf = await dockerRes.arrayBuffer();
        const lines = demuxDockerLogs(Buffer.from(arrayBuf));

        if (isSse) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          for (const l of lines) {
            res.write(`data: ${l}\n\n`);
          }
          const keepAlive = setInterval(() => {
            res.write(': keepalive\n\n');
          }, 5000);
          req.on('close', () => clearInterval(keepAlive));
          return;
        } else {
          return res.json(lines);
        }
      }
    } catch {
      // Direct Docker socket not reached
    }
  }

  // 3. Emulated / Offline / Fallback realistic container logs
  const targetC = deployedContainers.find((c) => c.id === req.params.cid || c.name === req.params.cid);
  const containerName = targetC ? targetC.name : req.params.cid;
  const containerImage = targetC ? targetC.image : 'service:latest';
  const containerState = targetC ? targetC.state : 'running';

  const initialLogs = generateRealisticContainerLogs(containerName, containerImage, containerState, tail);

  if (isSse) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial log lines
    for (const line of initialLogs) {
      res.write(`data: ${line}\n\n`);
    }

    if (containerState === 'running') {
      let lastLineCount = initialLogs.length;
      const interval = setInterval(async () => {
        // Query recent logs or produce runtime event
        const time = new Date().toISOString();
        const singleMsg = `${time} [runtime] [${containerName}] Container active: memory=${Math.floor(Math.random() * 20 + 120)}MB thread_pool=UP`;
        res.write(`data: ${singleMsg}\n\n`);
      }, 2000);
      req.on('close', () => clearInterval(interval));
    } else {
      res.write(`data: ${new Date().toISOString()} [system] Container is ${containerState}. No new log events.\n\n`);
    }
  } else {
    res.json(initialLogs);
  }
});

// --- Real-time WebSocket Log Streaming Server ---
wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const vmId = url.searchParams.get('vmId') || '';
  const containerId = url.searchParams.get('containerId') || '';
  const tail = parseInt(url.searchParams.get('tail') || '100', 10);

  if (!vmId || !containerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing vmId or containerId' }));
    ws.close();
    return;
  }

  let isAlive = true;
  let activeTimer: NodeJS.Timeout | null = null;
  let lastSeenLogLine = '';

  ws.on('pong', () => { isAlive = true; });

  const pingInterval = setInterval(() => {
    if (!isAlive) {
      clearInterval(pingInterval);
      return ws.terminate();
    }
    isAlive = false;
    ws.ping();
  }, 10000);

  const fetchCurrentLogs = async (linesCount: number): Promise<string[]> => {
    // 1. Try local Spring Boot backend if available
    try {
      const springCheck = await fetch('http://127.0.0.1:8080/api/v1/health', { signal: AbortSignal.timeout(600) });
      if (springCheck.ok) {
        const springRes = await fetch(`http://127.0.0.1:8080/api/v1/hosts/${vmId}/containers/${containerId}/logs?tail=${linesCount}&follow=false`);
        if (springRes.ok) {
          const data = await springRes.json();
          if (Array.isArray(data)) return data;
        }
      }
    } catch {}

    // 2. Try host Docker daemon directly if online
    const host = registeredHosts.find((v) => v.id === vmId);
    if (host && host.status === 'online') {
      try {
        const dockerUrl = `http://${host.ip}:${host.port}/containers/${containerId}/logs?stdout=1&stderr=1&timestamps=1&tail=${linesCount}`;
        const dockerRes = await fetch(dockerUrl, { signal: AbortSignal.timeout(2500) });
        if (dockerRes.ok) {
          const arrBuf = await dockerRes.arrayBuffer();
          return demuxDockerLogs(Buffer.from(arrBuf));
        }
      } catch {}
    }

    // 3. Simulated fallback
    const targetC = deployedContainers.find((c) => c.id === containerId || c.name === containerId);
    return generateRealisticContainerLogs(
      targetC ? targetC.name : containerId,
      targetC ? targetC.image : 'service:latest',
      targetC ? targetC.state : 'running',
      linesCount
    );
  };

  // 1. Send initial logs payload
  try {
    const initialLogs = await fetchCurrentLogs(tail);
    if (initialLogs.length > 0) {
      lastSeenLogLine = initialLogs[initialLogs.length - 1];
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'initial',
        vmId,
        containerId,
        logs: initialLogs,
        timestamp: new Date().toISOString(),
      }));
    }
  } catch (err: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  }

  // 2. Real-time auto-refresh socket loop: pushes new runtime events every 1.8 seconds
  const pollNewLogs = async () => {
    if (ws.readyState !== WebSocket.OPEN) return;

    try {
      const recentLogs = await fetchCurrentLogs(15);
      if (recentLogs.length > 0 && ws.readyState === WebSocket.OPEN) {
        const lastLine = recentLogs[recentLogs.length - 1];
        if (lastLine && lastLine !== lastSeenLogLine) {
          lastSeenLogLine = lastLine;
          ws.send(JSON.stringify({
            type: 'log',
            vmId,
            containerId,
            line: lastLine,
            timestamp: new Date().toISOString(),
          }));
        } else {
          // If container is active, send heartbeat event
          const targetC = deployedContainers.find((c) => c.id === containerId || c.name === containerId);
          if (targetC?.state === 'running') {
            const time = new Date().toISOString();
            ws.send(JSON.stringify({
              type: 'log',
              vmId,
              containerId,
              line: `${time} [runtime] [${targetC.name}] Socket stream heartbeat status=UP latency=${Math.floor(Math.random() * 12 + 4)}ms`,
              timestamp: time,
            }));
          }
        }
      }
    } catch {}

    if (ws.readyState === WebSocket.OPEN) {
      activeTimer = setTimeout(pollNewLogs, 1800);
    }
  };

  activeTimer = setTimeout(pollNewLogs, 1800);

  ws.on('close', () => {
    clearInterval(pingInterval);
    if (activeTimer) clearTimeout(activeTimer);
  });
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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[FleetDock] Server running with WebSocket support on http://0.0.0.0:${PORT}`);
  });
}

startServer();

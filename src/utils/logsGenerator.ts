import { LogEntry } from '../types';

export function generateInitialLogs(containerName: string, count: number = 80): LogEntry[] {
  const logs: LogEntry[] = [];
  const now = Date.now();

  const isSpringBoot = containerName.includes('spring') || containerName.includes('billing') || containerName.includes('auth');
  const isPostgres = containerName.includes('postgres');
  const isRedis = containerName.includes('redis');
  const isNginx = containerName.includes('nginx');

  for (let i = count; i >= 1; i--) {
    const time = new Date(now - i * 4200);
    const timeStr = time.toISOString().replace('T', ' ').substring(0, 19);
    const id = `log-${containerName}-${i}-${Math.random().toString(36).substring(7)}`;

    let level: LogEntry['level'] = 'INFO';
    let message = '';

    if (isSpringBoot) {
      const springLogs = [
        { lvl: 'INFO', msg: `[http-nio-8080-exec-${(i % 10) + 1}] c.f.b.c.PaymentTransactionController : Handled checkout request from ip=10.244.0.${(i * 3) % 250 + 1} trace_id=tr_${Math.random().toString(36).substring(2, 10)} - status=200 in ${Math.floor(Math.random() * 85 + 12)}ms` },
        { lvl: 'INFO', msg: `[scheduling-pool-2] c.f.b.service.BillingReconcileWorker : Running automated ledger settlement batch #${1000 + i}. Processed 42 journal records.` },
        { lvl: 'DEBUG', msg: `[HikariPool-1 connection-adder] com.zaxxer.hikari.pool.HikariPool : Pool stats (total=20, active=${(i % 8) + 2}, idle=${18 - (i % 8)}, waiting=0)` },
        { lvl: 'WARN', msg: `[http-nio-8080-exec-${(i % 5) + 1}] c.f.b.security.JwtAuthenticationFilter : Token cache near eviction limit (size=950/1000 items). Triggering lazy cleanup.` },
        { lvl: 'INFO', msg: `[kafka-producer-network-thread] org.apache.kafka.clients.Metadata : [Producer clientId=billing-svc-prod] Cluster ID: kf-east-cluster-9817` },
        { lvl: 'INFO', msg: `[http-nio-8080-exec-${(i % 8) + 1}] c.f.b.service.StripeWebhookHandler : Received event 'payment_intent.succeeded' for customer cust_${Math.random().toString(36).substring(2, 8)}` },
        { lvl: 'ERROR', msg: `[http-nio-8080-exec-4] c.f.b.client.TaxEngineFeignClient : Transient HTTP 504 Gateway Timeout while calling https://tax-api.service.internal. Backing off with retry 1/3...` },
      ];
      const selected = springLogs[i % springLogs.length];
      level = selected.lvl as LogEntry['level'];
      message = `${timeStr} [${level.padEnd(5)}] ${selected.msg}`;
    } else if (isPostgres) {
      const pgLogs = [
        { lvl: 'INFO', msg: `checkpoint starting: time` },
        { lvl: 'INFO', msg: `checkpoint complete: wrote 412 buffers (2.5%); 0 WAL file(s) added, 1 removed, 0 recycled; write=4.120 s, sync=0.045 s, total=4.180 s` },
        { lvl: 'DEBUG', msg: `statement: SELECT id, status, amount, created_at FROM billing_orders WHERE status = 'PENDING' LIMIT 50;` },
        { lvl: 'INFO', msg: `autovacuum: vacuumed table "app_production.public.transactions": 482 pages, 19 tuples dead` },
        { lvl: 'WARN', msg: `could not connect to standby cluster node replica-02 at 192.168.1.103: connection refused. Retrying in 5s` },
      ];
      const selected = pgLogs[i % pgLogs.length];
      level = selected.lvl as LogEntry['level'];
      message = `${timeStr} UTC [${100 + (i % 15)}] LOG:  ${selected.msg}`;
    } else if (isRedis) {
      const redisLogs = [
        { lvl: 'INFO', msg: `1:M ${timeStr} * 1000 changes in 60 seconds. Saving...` },
        { lvl: 'INFO', msg: `1:M ${timeStr} * Background saving started by pid 8492` },
        { lvl: 'INFO', msg: `1:M ${timeStr} * DB saved on disk` },
        { lvl: 'DEBUG', msg: `1:M ${timeStr} . Accepted 192.168.1.101:54992` },
        { lvl: 'WARN', msg: `1:M ${timeStr} # Memory eviction: evicted 12 keys using volatile-lru policy` },
      ];
      const selected = redisLogs[i % redisLogs.length];
      level = selected.lvl as LogEntry['level'];
      message = selected.msg;
    } else if (isNginx) {
      const status = [200, 200, 200, 204, 304, 200, 404, 502][i % 8];
      level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
      message = `192.168.1.${(i % 50) + 1} - - [${timeStr}] "GET /api/v1/orders HTTP/1.1" ${status} ${Math.floor(Math.random() * 4000 + 350)} "https://dashboard.company.com/" "Mozilla/5.0" rt=0.0${Math.floor(Math.random() * 80 + 10)}`;
    } else {
      level = i % 12 === 0 ? 'WARN' : i % 25 === 0 ? 'ERROR' : 'INFO';
      message = `${timeStr} [${level}] [${containerName}] Worker routine heartbeat: ping OK. Active task queue size: ${(i % 6)}`;
    }

    logs.push({
      id,
      timestamp: timeStr,
      level,
      message,
      containerId: containerName,
    });
  }

  return logs;
}

export function generateSingleLog(containerName: string): LogEntry {
  const now = new Date();
  const timeStr = now.toISOString().replace('T', ' ').substring(0, 19);
  const id = `log-${containerName}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  const templates = [
    { level: 'INFO', text: `Handling inbound keep-alive payload from gateway probe. Latency: ${Math.floor(Math.random() * 8 + 2)}ms` },
    { level: 'INFO', text: `Dispatched background healthcheck task #task_${Math.random().toString(36).substring(2, 7)} to executor pool` },
    { level: 'DEBUG', text: `Syncing state vector with master registry node. Delta size: ${Math.floor(Math.random() * 256 + 64)} bytes` },
    { level: 'INFO', text: `HTTP 200 OK - GET /actuator/health {"status":"UP","components":{"diskSpace":{"status":"UP"},"db":{"status":"UP"}}}` },
    { level: 'WARN', text: `High I/O latency detected on mount point /data/cache (${Math.floor(Math.random() * 45 + 55)}ms > 50ms)` },
    { level: 'INFO', text: `Completed periodic connection pool sweep: 0 stale sockets pruned.` },
  ];

  const roll = Math.floor(Math.random() * templates.length);
  const item = templates[roll];

  return {
    id,
    timestamp: timeStr,
    level: item.level as LogEntry['level'],
    message: `${timeStr} [${item.level.padEnd(5)}] [${containerName}] ${item.text}`,
    containerId: containerName,
  };
}

export function parseRawDockerLogLine(rawLine: string, containerId: string): LogEntry {
  const trimmed = rawLine.trim();
  const id = `log-${containerId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  // Docker logs formatted with timestamps start with ISO-8601 string, e.g. 2026-10-27T08:30:00.123456789Z
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+(.*)$/);

  let timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  let content = trimmed;

  if (isoMatch) {
    timestamp = isoMatch[1].replace('T', ' ').substring(0, 19);
    content = isoMatch[2];
  }

  // Detect log level
  let level: LogEntry['level'] = 'INFO';
  if (/\[error\]|\berror\b|\bfatal\b|\bexception\b|\berr\b|\bfailed\b/i.test(content)) {
    level = 'ERROR';
  } else if (/\[warn\]|\bwarn\b|\bwarning\b/i.test(content)) {
    level = 'WARN';
  } else if (/\[debug\]|\bdebug\b|\btrace\b/i.test(content)) {
    level = 'DEBUG';
  } else if (/\[system\]|systemd/i.test(content)) {
    level = 'SYSTEM';
  }

  return {
    id,
    timestamp,
    level,
    message: trimmed,
    containerId,
  };
}

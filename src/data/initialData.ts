import { VMHost, Container, ComposeStack, DockerVolume, DockerNetwork } from '../types';

export const INITIAL_VMS: VMHost[] = [
  {
    id: 'vm-prod-01',
    name: 'prod-app-swarm-01',
    ip: '192.168.1.101',
    port: 22,
    authType: 'ssh_key',
    authPayload: {
      username: 'ubuntu',
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn\nNhAAAAAwEAAQAAAYEAv88rY1...[CONFIGURED_IN_VAULT]...==\n-----END OPENSSH PRIVATE KEY-----',
      passphrase: '••••••••',
    },
    environment: 'Production',
    os: 'Ubuntu 24.04 LTS',
    arch: 'x86_64',
    dockerVersion: 'Docker Engine 27.2.1',
    apiVersion: '1.47',
    status: 'online',
    cpuCores: 8,
    memoryGb: 32,
    diskGb: 500,
    memoryUsedPercent: 64.2,
    cpuUsagePercent: 28.5,
    diskUsedPercent: 48.0,
    pingMs: 14,
    tags: ['web', 'spring-boot', 'ingress', 'us-east'],
    lastChecked: 'Just now',
    isDefault: true,
  },
  {
    id: 'vm-db-02',
    name: 'prod-db-cluster-02',
    ip: '192.168.1.102',
    port: 2376,
    authType: 'docker_socket',
    authPayload: {
      tlsCa: '-----BEGIN CERTIFICATE-----\nMIIDQjCCAiqgAwIBAgIUW8d0...[CA_CERT]...\n-----END CERTIFICATE-----',
      tlsCert: '-----BEGIN CERTIFICATE-----\nMIIC5zCCAc+gAwIBAgIUZ7x1...[CLIENT_CERT]...\n-----END CERTIFICATE-----',
      tlsKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0kM9...[CLIENT_KEY]...\n-----END RSA PRIVATE KEY-----',
    },
    environment: 'Production',
    os: 'Debian 12 Bookworm',
    arch: 'x86_64',
    dockerVersion: 'Docker Engine 27.1.0-ce',
    apiVersion: '1.46',
    status: 'online',
    cpuCores: 16,
    memoryGb: 64,
    diskGb: 1024,
    memoryUsedPercent: 78.4,
    cpuUsagePercent: 42.1,
    diskUsedPercent: 62.3,
    pingMs: 18,
    tags: ['database', 'cache', 'persistent', 'high-iops'],
    lastChecked: '1 min ago',
  },
  {
    id: 'vm-staging-03',
    name: 'staging-sandbox-node',
    ip: '192.168.2.45',
    port: 22,
    authType: 'password',
    authPayload: {
      username: 'devops-admin',
      password: '••••••••••••',
    },
    environment: 'Staging',
    os: 'Ubuntu 22.04.4 LTS',
    arch: 'x86_64',
    dockerVersion: 'Docker Engine 26.1.4',
    apiVersion: '1.45',
    status: 'online',
    cpuCores: 4,
    memoryGb: 16,
    diskGb: 250,
    memoryUsedPercent: 41.0,
    cpuUsagePercent: 12.8,
    diskUsedPercent: 33.5,
    pingMs: 25,
    tags: ['qa', 'ci-cd', 'testing'],
    lastChecked: '2 mins ago',
  },
  {
    id: 'vm-edge-04',
    name: 'edge-gateway-eu',
    ip: '10.0.14.88',
    port: 9443,
    authType: 'agent_token',
    authPayload: {
      agentToken: 'fd_agt_live_99f28a71b30c45de821e90a5b',
    },
    environment: 'Edge',
    os: 'Alpine Linux 3.20 (musl)',
    arch: 'aarch64',
    dockerVersion: 'Docker Engine 27.0.3',
    apiVersion: '1.47',
    status: 'online',
    cpuCores: 4,
    memoryGb: 8,
    diskGb: 128,
    memoryUsedPercent: 32.7,
    cpuUsagePercent: 9.4,
    diskUsedPercent: 21.0,
    pingMs: 44,
    tags: ['iot', 'arm64', 'vpn-tunnel'],
    lastChecked: 'Just now',
  },
];

export const INITIAL_CONTAINERS: Container[] = [
  // VM 1: prod-app-swarm-01
  {
    id: 'c-sp-billing-01',
    vmId: 'vm-prod-01',
    name: 'spring-billing-service',
    image: 'registry.internal.net/microservices/billing-service:2.4.1',
    state: 'running',
    statusText: 'Up 3 days (healthy)',
    created: '2026-10-23 09:15:00',
    command: 'java -jar app.jar --spring.profiles.active=prod',
    ports: [
      { hostPort: 8080, containerPort: 8080, protocol: 'tcp' },
      { hostPort: 8081, containerPort: 8081, protocol: 'tcp' },
    ],
    cpuPercent: 3.4,
    memUsageMb: 485,
    memLimitMb: 1024,
    netIo: { rxMb: 124.5, txMb: 88.2 },
    envVars: {
      SPRING_PROFILES_ACTIVE: 'prod',
      JAVA_OPTS: '-Xms256m -Xmx768m -XX:+UseG1GC',
      DB_HOST: '192.168.1.102',
      DB_PORT: '5432',
      DB_NAME: 'billing_db',
      REDIS_HOST: '192.168.1.102',
      SERVER_PORT: '8080',
      MANAGEMENT_SERVER_PORT: '8081',
      MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE: 'health,info,prometheus,metrics',
    },
    composeStack: 'core-microservices',
    labels: {
      'maintainer': 'Billing Team <fin-eng@company.com>',
      'com.docker.compose.project': 'core-microservices',
      'com.docker.compose.service': 'billing-service',
      'version': '2.4.1',
    },
    restartPolicy: 'always',
    mounts: [
      { source: '/var/log/billing-app', target: '/app/logs', type: 'bind', mode: 'rw' },
      { source: 'billing_certs', target: '/app/certs', type: 'volume', mode: 'ro' },
    ],
  },
  {
    id: 'c-sp-auth-02',
    vmId: 'vm-prod-01',
    name: 'spring-auth-gateway',
    image: 'registry.internal.net/microservices/auth-gateway:3.1.0',
    state: 'running',
    statusText: 'Up 5 days (healthy)',
    created: '2026-10-21 14:20:00',
    command: 'java -XX:MaxRAMPercentage=75.0 -jar /gateway.jar',
    ports: [
      { hostPort: 443, containerPort: 8443, protocol: 'tcp' },
      { hostPort: 80, containerPort: 8080, protocol: 'tcp' },
    ],
    cpuPercent: 5.8,
    memUsageMb: 612,
    memLimitMb: 2048,
    netIo: { rxMb: 890.1, txMb: 1420.4 },
    envVars: {
      SPRING_APPLICATION_NAME: 'auth-gateway',
      JWT_SECRET: 'k8s_vault_jwt_sec_991823102_secure',
      JWT_EXPIRATION_MS: '86400000',
      SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_JWK_SET_URI: 'https://auth.company.com/.well-known/jwks.json',
      CORS_ALLOWED_ORIGINS: 'https://app.company.com,https://admin.company.com',
    },
    composeStack: 'core-microservices',
    labels: {
      'com.docker.compose.project': 'core-microservices',
      'com.docker.compose.service': 'auth-gateway',
      'tier': 'ingress',
    },
    restartPolicy: 'unless-stopped',
    mounts: [
      { source: '/etc/ssl/gateway-certs', target: '/etc/ssl/certs', type: 'bind', mode: 'ro' },
    ],
  },
  {
    id: 'c-nginx-rev-03',
    vmId: 'vm-prod-01',
    name: 'nginx-reverse-proxy',
    image: 'nginx:1.27-alpine',
    state: 'running',
    statusText: 'Up 12 days',
    created: '2026-10-14 02:00:00',
    command: 'nginx -g "daemon off;"',
    ports: [
      { hostPort: 8000, containerPort: 80, protocol: 'tcp' },
    ],
    cpuPercent: 0.9,
    memUsageMb: 42,
    memLimitMb: 256,
    netIo: { rxMb: 1420.0, txMb: 2100.8 },
    envVars: {
      NGINX_WORKER_PROCESSES: 'auto',
      NGINX_CLIENT_MAX_BODY_SIZE: '50M',
    },
    composeStack: 'core-microservices',
    labels: {
      'app': 'nginx',
      'com.docker.compose.project': 'core-microservices',
    },
    restartPolicy: 'always',
    mounts: [
      { source: '/opt/nginx/conf.d', target: '/etc/nginx/conf.d', type: 'bind', mode: 'ro' },
      { source: 'nginx_logs', target: '/var/log/nginx', type: 'volume', mode: 'rw' },
    ],
  },
  {
    id: 'c-grafana-04',
    vmId: 'vm-prod-01',
    name: 'monitoring-grafana',
    image: 'grafana/grafana:11.2.0',
    state: 'running',
    statusText: 'Up 12 days',
    created: '2026-10-14 02:10:00',
    command: '/run.sh',
    ports: [
      { hostPort: 3000, containerPort: 3000, protocol: 'tcp' },
    ],
    cpuPercent: 1.2,
    memUsageMb: 184,
    memLimitMb: 1024,
    netIo: { rxMb: 68.2, txMb: 94.6 },
    envVars: {
      GF_SECURITY_ADMIN_USER: 'admin',
      GF_SECURITY_ADMIN_PASSWORD: '••••••••••••',
      GF_USERS_ALLOW_SIGN_UP: 'false',
      GF_SERVER_DOMAIN: 'metrics.internal.net',
    },
    composeStack: 'observability-stack',
    labels: {
      'tier': 'monitoring',
      'com.docker.compose.project': 'observability-stack',
    },
    restartPolicy: 'unless-stopped',
    mounts: [
      { source: 'grafana_storage', target: '/var/lib/grafana', type: 'volume', mode: 'rw' },
    ],
  },
  {
    id: 'c-batch-export-05',
    vmId: 'vm-prod-01',
    name: 'nightly-data-exporter',
    image: 'registry.internal.net/jobs/exporter:v1.9',
    state: 'stopped',
    statusText: 'Exited (0) 6 hours ago',
    created: '2026-10-26 02:00:00',
    command: 'python run_batch_sync.py --mode=nightly',
    ports: [],
    cpuPercent: 0.0,
    memUsageMb: 0,
    memLimitMb: 2048,
    netIo: { rxMb: 420.1, txMb: 390.8 },
    envVars: {
      EXPORT_DESTINATION: 's3://company-datalake-prod/nightly/',
      SYNC_RETRIES: '3',
    },
    labels: {
      'cron': 'daily_0200',
      'type': 'job',
    },
    restartPolicy: 'no',
    mounts: [
      { source: '/mnt/storage/exports', target: '/data/exports', type: 'bind', mode: 'rw' },
    ],
  },

  // VM 2: prod-db-cluster-02
  {
    id: 'c-postgres-06',
    vmId: 'vm-db-02',
    name: 'postgresql-primary-16',
    image: 'postgres:16.4-alpine',
    state: 'running',
    statusText: 'Up 19 days (healthy)',
    created: '2026-10-07 11:00:00',
    command: 'postgres -c max_connections=250 -c shared_buffers=8GB',
    ports: [
      { hostPort: 5432, containerPort: 5432, protocol: 'tcp' },
    ],
    cpuPercent: 14.2,
    memUsageMb: 8940,
    memLimitMb: 16384,
    netIo: { rxMb: 4210.0, txMb: 5890.3 },
    envVars: {
      POSTGRES_DB: 'app_production',
      POSTGRES_USER: 'postgres_admin',
      POSTGRES_PASSWORD: '••••••••••••••••',
      PGDATA: '/var/lib/postgresql/data/pgdata',
    },
    composeStack: 'db-infrastructure',
    labels: {
      'database': 'primary',
      'cluster': 'east-cluster',
    },
    restartPolicy: 'always',
    mounts: [
      { source: 'pg_data_nvme', target: '/var/lib/postgresql/data', type: 'volume', mode: 'rw' },
      { source: '/opt/postgres/conf/custom.conf', target: '/etc/postgresql/postgresql.conf', type: 'bind', mode: 'ro' },
    ],
  },
  {
    id: 'c-redis-07',
    vmId: 'vm-db-02',
    name: 'redis-cache-cluster',
    image: 'redis:7.2.5-alpine',
    state: 'running',
    statusText: 'Up 19 days',
    created: '2026-10-07 11:05:00',
    command: 'redis-server --save 60 1 --loglevel notice --maxmemory 4gb',
    ports: [
      { hostPort: 6379, containerPort: 6379, protocol: 'tcp' },
    ],
    cpuPercent: 4.1,
    memUsageMb: 3120,
    memLimitMb: 4096,
    netIo: { rxMb: 3200.5, txMb: 4890.0 },
    envVars: {
      REDIS_MAXMEMORY: '4gb',
      REDIS_MAXMEMORY_POLICY: 'allkeys-lru',
    },
    composeStack: 'db-infrastructure',
    labels: {
      'role': 'cache',
      'cache_type': 'session_and_queries',
    },
    restartPolicy: 'always',
    mounts: [
      { source: 'redis_data', target: '/data', type: 'volume', mode: 'rw' },
    ],
  },
  {
    id: 'c-elastic-08',
    vmId: 'vm-db-02',
    name: 'elasticsearch-search-node',
    image: 'docker.elastic.co/elasticsearch/elasticsearch:8.15.0',
    state: 'paused',
    statusText: 'Paused (maintenance)',
    created: '2026-10-18 16:30:00',
    command: '/usr/local/bin/docker-entrypoint.sh eswrapper',
    ports: [
      { hostPort: 9200, containerPort: 9200, protocol: 'tcp' },
      { hostPort: 9300, containerPort: 9300, protocol: 'tcp' },
    ],
    cpuPercent: 0.1,
    memUsageMb: 4120,
    memLimitMb: 8192,
    netIo: { rxMb: 110.0, txMb: 85.0 },
    envVars: {
      'discovery.type': 'single-node',
      'ES_JAVA_OPTS': '-Xms4g -Xmx4g',
      'xpack.security.enabled': 'true',
    },
    labels: {
      'service': 'search-indexing',
    },
    restartPolicy: 'unless-stopped',
    mounts: [
      { source: 'es_data_volume', target: '/usr/share/elasticsearch/data', type: 'volume', mode: 'rw' },
    ],
  },

  // VM 3: staging-sandbox-node
  {
    id: 'c-stg-app-09',
    vmId: 'vm-staging-03',
    name: 'staging-spring-monolith',
    image: 'registry.internal.net/apps/spring-monolith:PR-482-SNAPSHOT',
    state: 'running',
    statusText: 'Up 4 hours',
    created: '2026-10-26 16:00:00',
    command: 'java -jar /target/app.jar',
    ports: [
      { hostPort: 8080, containerPort: 8080, protocol: 'tcp' },
    ],
    cpuPercent: 6.2,
    memUsageMb: 720,
    memLimitMb: 2048,
    netIo: { rxMb: 45.1, txMb: 28.3 },
    envVars: {
      SPRING_PROFILES_ACTIVE: 'staging',
      LOG_LEVEL: 'DEBUG',
      ENABLE_SWAGGER_UI: 'true',
    },
    composeStack: 'staging-env',
    labels: {
      'pr': '482',
      'branch': 'feature/payment-v2',
    },
    restartPolicy: 'on-failure',
    mounts: [],
  },
  {
    id: 'c-stg-pg-10',
    vmId: 'vm-staging-03',
    name: 'staging-postgres-mock',
    image: 'postgres:16-alpine',
    state: 'running',
    statusText: 'Up 1 day',
    created: '2026-10-25 10:00:00',
    command: 'postgres',
    ports: [
      { hostPort: 5432, containerPort: 5432, protocol: 'tcp' },
    ],
    cpuPercent: 1.1,
    memUsageMb: 240,
    memLimitMb: 1024,
    netIo: { rxMb: 18.4, txMb: 12.1 },
    envVars: {
      POSTGRES_DB: 'staging_db',
      POSTGRES_PASSWORD: 'dev_test_password',
    },
    composeStack: 'staging-env',
    labels: {},
    restartPolicy: 'always',
    mounts: [
      { source: 'stg_pg_vol', target: '/var/lib/postgresql/data', type: 'volume', mode: 'rw' },
    ],
  },

  // VM 4: edge-gateway-eu
  {
    id: 'c-edge-mosquitto-11',
    vmId: 'vm-edge-04',
    name: 'edge-mqtt-broker',
    image: 'eclipse-mosquitto:2.0',
    state: 'running',
    statusText: 'Up 10 days',
    created: '2026-10-16 08:00:00',
    command: '/usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf',
    ports: [
      { hostPort: 1883, containerPort: 1883, protocol: 'tcp' },
      { hostPort: 9001, containerPort: 9001, protocol: 'tcp' },
    ],
    cpuPercent: 0.8,
    memUsageMb: 34,
    memLimitMb: 256,
    netIo: { rxMb: 340.2, txMb: 520.6 },
    envVars: {},
    composeStack: 'edge-telemetry',
    labels: {
      'edge-device': 'gateway-arm64',
    },
    restartPolicy: 'always',
    mounts: [
      { source: '/etc/mosquitto/config', target: '/mosquitto/config', type: 'bind', mode: 'ro' },
    ],
  },
  {
    id: 'c-edge-collector-12',
    vmId: 'vm-edge-04',
    name: 'sensor-telemetry-collector',
    image: 'registry.internal.net/edge/telemetry-agent:1.2.0-arm64',
    state: 'running',
    statusText: 'Up 10 days',
    created: '2026-10-16 08:15:00',
    command: './telemetry-daemon --buffer=5000',
    ports: [],
    cpuPercent: 2.1,
    memUsageMb: 76,
    memLimitMb: 512,
    netIo: { rxMb: 180.0, txMb: 290.0 },
    envVars: {
      BROKER_URL: 'tcp://edge-mqtt-broker:1883',
      CLOUD_INGEST_URL: 'https://ingest.cloud.company.com/v1/telemetry',
      DEVICE_ID: 'EDGE_GW_EU_04',
    },
    composeStack: 'edge-telemetry',
    labels: {},
    restartPolicy: 'unless-stopped',
    mounts: [],
  },
];

export const INITIAL_COMPOSE_STACKS: ComposeStack[] = [
  {
    id: 'stack-core-01',
    vmId: 'vm-prod-01',
    name: 'core-microservices',
    status: 'running',
    serviceCount: 3,
    runningCount: 3,
    lastDeployed: '2026-10-23 09:14:00',
    services: ['spring-billing-service', 'spring-auth-gateway', 'nginx-reverse-proxy'],
    envVariables: [
      { key: 'SPRING_PROFILES_ACTIVE', value: 'prod', description: 'Active Spring runtime profile' },
      { key: 'SERVER_PORT', value: '8080', description: 'HTTP listen port for Spring Boot services' },
      { key: 'DB_HOST', value: '192.168.1.102', description: 'Remote PostgreSQL host IP' },
      { key: 'DB_PASSWORD', value: '••••••••••••••••', isSecret: true, description: 'Postgres master database password' },
      { key: 'JWT_SECRET', value: '••••••••••••••••••••••••••••••', isSecret: true, description: 'HMAC-SHA256 signing key' },
      { key: 'MAX_POOL_SIZE', value: '30', description: 'HikariCP connection pool limit' },
      { key: 'ACTUATOR_METRICS_ENABLED', value: 'true', description: 'Prometheus endpoint exporter toggle' },
    ],
    rawYaml: `version: '3.8'

services:
  spring-billing-service:
    image: registry.internal.net/microservices/billing-service:2.4.1
    container_name: spring-billing-service
    restart: always
    ports:
      - "\${SERVER_PORT:-8080}:8080"
      - "8081:8081"
    environment:
      - SPRING_PROFILES_ACTIVE=\${SPRING_PROFILES_ACTIVE}
      - DB_HOST=\${DB_HOST}
      - DB_PORT=5432
      - DB_NAME=billing_db
      - DB_PASSWORD=\${DB_PASSWORD}
      - SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=\${MAX_POOL_SIZE}
    volumes:
      - /var/log/billing-app:/app/logs
      - billing_certs:/app/certs:ro
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1024M

  spring-auth-gateway:
    image: registry.internal.net/microservices/auth-gateway:3.1.0
    container_name: spring-auth-gateway
    restart: unless-stopped
    ports:
      - "443:8443"
      - "80:8080"
    environment:
      - JWT_SECRET=\${JWT_SECRET}
      - SPRING_PROFILES_ACTIVE=\${SPRING_PROFILES_ACTIVE}
    volumes:
      - /etc/ssl/gateway-certs:/etc/ssl/certs:ro

  nginx-reverse-proxy:
    image: nginx:1.27-alpine
    container_name: nginx-reverse-proxy
    restart: always
    ports:
      - "8000:80"
    volumes:
      - /opt/nginx/conf.d:/etc/nginx/conf.d:ro
      - nginx_logs:/var/log/nginx

volumes:
  billing_certs:
  nginx_logs:
`,
  },
  {
    id: 'stack-db-02',
    vmId: 'vm-db-02',
    name: 'db-infrastructure',
    status: 'partially_running',
    serviceCount: 3,
    runningCount: 2,
    lastDeployed: '2026-10-18 16:29:00',
    services: ['postgresql-primary-16', 'redis-cache-cluster', 'elasticsearch-search-node'],
    envVariables: [
      { key: 'POSTGRES_DB', value: 'app_production' },
      { key: 'POSTGRES_USER', value: 'postgres_admin' },
      { key: 'POSTGRES_PASSWORD', value: '••••••••••••••••', isSecret: true },
      { key: 'REDIS_MAXMEMORY', value: '4gb' },
      { key: 'ELASTIC_HEAP_SIZE', value: '4g' },
    ],
    rawYaml: `version: '3.8'

services:
  postgresql-primary-16:
    image: postgres:16.4-alpine
    container_name: postgresql-primary-16
    restart: always
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: \${POSTGRES_DB}
      POSTGRES_USER: \${POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - pg_data_nvme:/var/lib/postgresql/data

  redis-cache-cluster:
    image: redis:7.2.5-alpine
    container_name: redis-cache-cluster
    restart: always
    ports:
      - "6379:6379"
    command: redis-server --maxmemory \${REDIS_MAXMEMORY} --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data

  elasticsearch-search-node:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.15.0
    container_name: elasticsearch-search-node
    restart: unless-stopped
    ports:
      - "9200:9200"
    environment:
      - discovery.type=single-node
      - ES_JAVA_OPTS=-Xms\${ELASTIC_HEAP_SIZE} -Xmx\${ELASTIC_HEAP_SIZE}
    volumes:
      - es_data_volume:/usr/share/elasticsearch/data

volumes:
  pg_data_nvme:
  redis_data:
  es_data_volume:
`,
  },
  {
    id: 'stack-edge-03',
    vmId: 'vm-edge-04',
    name: 'edge-telemetry',
    status: 'running',
    serviceCount: 2,
    runningCount: 2,
    lastDeployed: '2026-10-16 07:55:00',
    services: ['edge-mqtt-broker', 'sensor-telemetry-collector'],
    envVariables: [
      { key: 'MQTT_PORT', value: '1883' },
      { key: 'DEVICE_ID', value: 'EDGE_GW_EU_04' },
      { key: 'CLOUD_TOKEN', value: '••••••••••••••••••••', isSecret: true },
    ],
    rawYaml: `version: '3.8'

services:
  edge-mqtt-broker:
    image: eclipse-mosquitto:2.0
    container_name: edge-mqtt-broker
    restart: always
    ports:
      - "\${MQTT_PORT:-1883}:1883"
      - "9001:9001"
    volumes:
      - /etc/mosquitto/config:/mosquitto/config:ro

  sensor-telemetry-collector:
    image: registry.internal.net/edge/telemetry-agent:1.2.0-arm64
    container_name: sensor-telemetry-collector
    restart: unless-stopped
    environment:
      BROKER_URL: "tcp://edge-mqtt-broker:1883"
      DEVICE_ID: "\${DEVICE_ID}"
      CLOUD_TOKEN: "\${CLOUD_TOKEN}"
`,
  },
];

export const INITIAL_VOLUMES: DockerVolume[] = [
  { name: 'billing_certs', vmId: 'vm-prod-01', driver: 'local', sizeMb: 12.4, scope: 'local', inUseBy: ['spring-billing-service'], createdAt: '2026-10-14' },
  { name: 'nginx_logs', vmId: 'vm-prod-01', driver: 'local', sizeMb: 245.8, scope: 'local', inUseBy: ['nginx-reverse-proxy'], createdAt: '2026-10-14' },
  { name: 'grafana_storage', vmId: 'vm-prod-01', driver: 'local', sizeMb: 410.2, scope: 'local', inUseBy: ['monitoring-grafana'], createdAt: '2026-10-14' },
  { name: 'pg_data_nvme', vmId: 'vm-db-02', driver: 'local (direct-nvme)', sizeMb: 18400.0, scope: 'local', inUseBy: ['postgresql-primary-16'], createdAt: '2026-10-07' },
  { name: 'redis_data', vmId: 'vm-db-02', driver: 'local', sizeMb: 1250.0, scope: 'local', inUseBy: ['redis-cache-cluster'], createdAt: '2026-10-07' },
  { name: 'es_data_volume', vmId: 'vm-db-02', driver: 'local', sizeMb: 8900.0, scope: 'local', inUseBy: ['elasticsearch-search-node'], createdAt: '2026-10-18' },
  { name: 'stg_pg_vol', vmId: 'vm-staging-03', driver: 'local', sizeMb: 350.0, scope: 'local', inUseBy: ['staging-postgres-mock'], createdAt: '2026-10-25' },
];

export const INITIAL_NETWORKS: DockerNetwork[] = [
  { id: 'net-bridge-01', vmId: 'vm-prod-01', name: 'bridge', driver: 'bridge', subnet: '172.17.0.0/16', gateway: '172.17.0.1', containersCount: 2, scope: 'local' },
  { id: 'net-micro-02', vmId: 'vm-prod-01', name: 'core-microservices_default', driver: 'bridge', subnet: '172.22.0.0/16', gateway: '172.22.0.1', containersCount: 3, scope: 'local' },
  { id: 'net-obs-03', vmId: 'vm-prod-01', name: 'observability-net', driver: 'bridge', subnet: '172.25.0.0/16', gateway: '172.25.0.1', containersCount: 2, scope: 'local' },
  { id: 'net-db-04', vmId: 'vm-db-02', name: 'db_tier_isolated', driver: 'bridge', subnet: '172.28.0.0/16', gateway: '172.28.0.1', containersCount: 3, scope: 'local' },
  { id: 'net-host-05', vmId: 'vm-edge-04', name: 'host', driver: 'host', subnet: 'N/A', gateway: 'N/A', containersCount: 2, scope: 'local' },
];

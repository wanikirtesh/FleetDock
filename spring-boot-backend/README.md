# FleetDock - Spring Boot 3 Java Backend

Production-ready Spring Boot backend for centralized multi-VM host registration, credential storage (AES-256-GCM), and remote Docker engine orchestration.

## 🚀 Quick Start

### Prerequisites
- Java 21 JDK
- Maven 3.9+ (or use Docker)
- Docker Engine installed locally or on remote VMs

### 1. Run Locally with MySQL
Start a local MySQL server. The backend connects to `localhost:3306`, creates the `fleetdock` database if needed, and uses `root` with a blank password by default. Override the connection settings if your local MySQL uses different credentials:
```bash
# PowerShell
$env:SPRING_DATASOURCE_USERNAME = "your-mysql-user"
$env:SPRING_DATASOURCE_PASSWORD = "your-mysql-password"

# macOS/Linux
export SPRING_DATASOURCE_USERNAME="your-mysql-user"
export SPRING_DATASOURCE_PASSWORD="your-mysql-password"
```

```bash
cd spring-boot-backend
mvn clean spring-boot:run
```
The server will start on port `http://localhost:8080`. You can override `SPRING_DATASOURCE_URL` to connect to another MySQL instance or database.

To use the embedded H2 database instead, set `SPRING_DATASOURCE_URL=jdbc:h2:mem:fleetdock;DB_CLOSE_DELAY=-1;MODE=PostgreSQL`, `SPRING_DATASOURCE_USERNAME=sa`, and leave the password blank. Its console is available at `http://localhost:8080/h2-console`.

### 2. Run with Docker Compose (Spring Boot + PostgreSQL)
```bash
docker compose up --build -d
```

### Run with MySQL instead
Set the required secrets, then start the MySQL compose file:
```bash
$env:MYSQL_ROOT_PASSWORD = "your-root-password"
$env:MYSQL_PASSWORD = "your-app-password"
$env:VAULT_MASTER_KEY = "your-long-random-vault-key"
docker compose -f docker-compose.mysql.yml up --build -d
```
On macOS/Linux, export the same three environment variables before running Compose. The MySQL database persists in the `fleetdock_mysql_data` volume. You can also connect to an existing MySQL instance by setting `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD`; the JDBC driver is selected from the URL.

### 3. Connect from FleetDock Web Dashboard
In the FleetDock web dashboard, toggle the backend connection to `http://localhost:8080` (or leave on the built-in full-stack API).

---

## 📡 REST & SSE Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Healthcheck and engine version |
| `GET` | `/api/v1/hosts` | List all registered VM hosts |
| `POST` | `/api/v1/hosts/register` | Register a new VM with SSH/TLS/Agent credentials |
| `POST` | `/api/v1/hosts/{id}/ping` | Test live handshake latency |
| `GET` | `/api/v1/hosts/{id}/containers` | List running & stopped containers on host |
| `POST` | `/api/v1/hosts/{id}/containers/deploy` | Deploy a new container |
| `POST` | `/api/v1/hosts/{id}/containers/{cid}/start` | Start container |
| `POST` | `/api/v1/hosts/{id}/containers/{cid}/stop` | Stop container (SIGTERM) |
| `POST` | `/api/v1/hosts/{id}/containers/{cid}/restart` | Restart container |
| `DELETE` | `/api/v1/hosts/{id}/containers/{cid}` | Remove container |
| `GET` | `/api/v1/hosts/{id}/containers/{cid}/logs` | Server-Sent Events (SSE) live logs |
| `GET` | `/api/v1/hosts/{id}/compose` | List Docker Compose stacks |
| `POST` | `/api/v1/hosts/{id}/compose/{sid}/up` | `docker compose up -d` |
| `POST` | `/api/v1/hosts/{id}/compose/{sid}/down` | `docker compose down` |
| `PUT` | `/api/v1/hosts/{id}/compose/{sid}/variables` | Update `.env` variables |
| `PUT` | `/api/v1/hosts/{id}/compose/{sid}/yaml` | Update `docker-compose.yml` |

---

## 🔒 Security
- All sensitive credentials (SSH private keys, passwords, TLS keys, tokens) are encrypted before persisting into the database using AES-256-GCM via `VaultEncryptionService`.
- Master key can be set via `VAULT_MASTER_KEY` environment variable.

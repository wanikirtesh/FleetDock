# FleetDock - Spring Boot 3 Java Backend

Production-ready Spring Boot backend for centralized multi-VM host registration, credential storage (AES-256-GCM), and remote Docker engine orchestration.

## 🚀 Quick Start

### Prerequisites
- Java 21 JDK
- Maven 3.9+ (or use Docker)
- Docker Engine installed locally or on remote VMs

### 1. Run Locally with Embedded H2 (Zero Setup)
```bash
cd spring-boot-backend
mvn clean spring-boot:run
```
The server will start on port `http://localhost:8080`.
The H2 Database web console is available at `http://localhost:8080/h2-console`.

### 2. Run with Docker Compose (Spring Boot + PostgreSQL)
```bash
docker compose up --build -d
```

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

# FleetDock - Multi-VM & Container Orchestration Hub

A centralized web dashboard and Java Spring Boot backend for registering remote VM nodes (via SSH / Docker TLS / Agent), orchestrating containers (start, stop, restart, deploy), streaming real-time logs, exploring Docker Compose stacks, and managing `.env` variables.

---

## 🚀 Quick Start Guide (Run Locally)

You can run both the **Web Dashboard** (Node.js/React/Express) and the **Java Spring Boot Backend** on your local machine.

---

### Step 1: Run the Web Dashboard & Fullstack API

Requirements: **Node.js 20+** and **npm**

```bash
# 1. Install dependencies
npm install

# (Note: If using an older npm version, run: npm install --legacy-peer-deps)

# 2. Start the dev server
npm run dev
```

Open your browser at:
👉 **`http://localhost:3000`**

The dashboard includes full container orchestration, live log streaming, VM registration, and interactive shells right out of the box.

---

### Step 2: Run the Java Spring Boot Backend (Optional / Standalone)

The Java Spring Boot backend is located in the `/spring-boot-backend` directory.

Requirements: **Java 21 JDK** and **Maven 3.9+** (or Docker)

#### Option A: Quick run with local MySQL
The backend defaults to MySQL at `localhost:3306`, database `fleetdock`, user `root`, and a blank password. Set `SPRING_DATASOURCE_USERNAME` and `SPRING_DATASOURCE_PASSWORD` before starting Maven if your local credentials differ.
```bash
cd spring-boot-backend

# Run Spring Boot app
mvn clean spring-boot:run
```
The Spring Boot server will start at:
👉 **`http://localhost:8080`**
- Actuator Health check: `http://localhost:8080/api/v1/health`

#### Option B: Run with Docker Compose (Spring Boot + PostgreSQL 16)
```bash
cd spring-boot-backend
docker compose up --build -d
```

#### Option C: Run with Docker Compose (Spring Boot + MySQL 8.4)
Set `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, and `VAULT_MASTER_KEY`, then run:
```bash
docker compose -f docker-compose.mysql.yml up --build -d
```
The backend can also connect to an existing MySQL instance using the standard `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD` settings.

---

### Step 3: Connect Dashboard to your Local Java Spring Boot Instance

1. Open `http://localhost:3000` in your browser.
2. Click the **Spring Boot API** tab in the sidebar or top header.
3. In the **Backend API Status** bar at the top, enter:
   ```
   http://localhost:8080
   ```
4. Click **Test Ping** — the dashboard will verify the live connection, Docker-Java engine version, and handshake latency!

---

## 📁 Repository Structure

```text
├── index.html                   # HTML entry point
├── package.json                 # Node dependencies & run scripts
├── server.ts                    # Express full-stack proxy & Vite middleware
├── src/                         # React TypeScript Frontend
│   ├── components/
│   │   ├── layout/              # Header, Sidebar, Activity Alerts
│   │   ├── dashboard/           # Cluster Overview & Node Health Gauges
│   │   ├── containers/          # Container Table, Live Logs, Exec Shell, Deploy Modal
│   │   ├── compose/             # docker-compose.yml Editor & .env Variable Manager
│   │   ├── vms/                 # VM Host Registry & Connection Handshake Tester
│   │   ├── storage/             # Docker Volumes & Networks Inspector
│   │   └── springboot/          # Java Source Viewer, Architecture & ZIP Downloader
│   ├── context/FleetContext.tsx # Centralized state & orchestration logic
│   └── data/                    # Initial seed data and Java code templates
└── spring-boot-backend/         # Complete Java 21 / Spring Boot 3.3.4 Application
    ├── pom.xml                  # Maven build file (Spring Boot 3, docker-java, JPA)
    ├── Dockerfile               # Production multi-stage Alpine container build
    ├── docker-compose.yml       # Docker Compose setup with PostgreSQL
    └── src/
        └── main/
            ├── java/com/fleetdock/
            │   ├── FleetDockApplication.java   # Spring Boot Main
            │   ├── controller/                 # REST & SSE Controllers
            │   ├── service/                    # Docker engine, VM host, AES-256 Vault
            │   ├── entity/                     # JPA Entities (VmHost, AuthCredential)
            │   ├── dto/                        # Request/Response DTOs
            │   └── config/                     # DockerClientFactory, CORS
            └── resources/
                └── application.yml             # Spring Boot configuration
```

---

## 🛠 Available NPM Scripts

| Command | Action |
|---|---|
| `npm run dev` | Starts the full-stack server on `http://localhost:3000` (runs `tsx server.ts`) |
| `npm run build` | Compiles frontend assets into `dist/` |
| `npm start` | Runs production server (`node server.ts`) |
| `npm run lint` | Type checks codebase (`tsc --noEmit`) |

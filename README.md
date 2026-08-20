# Five9 Profile Automation - Linux/Docker

Migracion de [five9-schedule](https://github.com/gonzaloq28250) (PowerShell/Windows) a **Node.js + Docker**, listo para correr en [Coolify](https://coolify.io) o cualquier servicio de containers.

## Que hace

Administra **User Profiles, usuarios y skills de Five9** (plataforma de contact center) desde una interfaz web, con un **Automation Engine** que ejecuta acciones programadas o basadas en volumen de cola.

### Funcionalidades

- **Mover usuarios entre perfiles** con verificacion y rollback automatico
- **Administrar skills de perfiles** (agregar/remover) con verificacion
- **Automation Engine** con jobs persistentes:
  - **Por horario**: una vez, diario, o semanal
  - **Por volumen de queue**: monitoreo con histéresis, persistencia, cooldown y recuperacion
- **3 tipos de accion**: profile_skill, move_users, agent_active_skill
- **Rate limit coordinator**: proteccion contra 429 de Five9, cache compartido, jitter

## Arquitectura

```
Frontend (HTML/CSS/JS)  →  Express.js API  →  Five9 SOAP + REST APIs
                              ↕
                      Automation Engine (tick cada 1s)
                              ↕
                      data/jobs.json, logs/*.csv
```

## Stack

- **Backend**: Node.js + Express
- **Frontend**: HTML/CSS/JS vanilla (sin framework)
- **APIs Five9**: SOAP v13 (configuracion) + REST Supervisor (agentes/colas)
- **Container**: Docker (node:22-alpine, ~50MB)
- **Encriptacion**: AES-256-GCM con variable de entorno

## Quick Start (desarrollo local)

```bash
# Instalar dependencias
npm install

# Generar key de encriptacion (opcional pero recomendado)
export FIVE9_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Correr
npm start
```

Abrir `http://localhost:8765`

## Docker

```bash
# Build
docker build -t five9-schedule-linux .

# Run
docker run -d \
  -p 8765:8765 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -e FIVE9_ENCRYPTION_KEY=$(openssl rand -hex 32) \
  five9-schedule-linux
```

## Docker Compose

```bash
# Generar key
echo "FIVE9_ENCRYPTION_KEY=$(openssl rand -hex 32)" > .env

# Correr
docker compose up -d
```

## Variables de entorno

| Variable | Requerida | Default | Descripcion |
|----------|-----------|---------|-------------|
| `PORT` | No | `8765` | Puerto del servidor |
| `FIVE9_ENCRYPTION_KEY` | Recomendada | - | Key de 32 bytes (64 hex chars) para AES-256-GCM |

Generar key:
```bash
openssl rand -hex 32
```

## Volumenes persistentes

| Ruta en container | Contenido |
|-------------------|-----------|
| `/app/data` | `jobs.json`, credenciales encriptadas, settings |
| `/app/logs` | CSVs de auditoria diarios |

## Coolify - Deployment Guide

### Paso 1: Preparar el repo

1. Crear repo en GitHub (o usar existente)
2. Push de este proyecto:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/TU_USUARIO/five9-schedule-linux.git
   git branch -M main
   git push -u origin main
   ```

### Paso 2: Configurar en Coolify

1. Ir a **Applications** → **New Application**
2. Seleccionar **Git Repository** y conectar tu repo
3. Configurar:
   - **Build Pack**: `Dockerfile`
   - **Port**: `8765`
4. Ir a **Environment Variables** y agregar:
   ```
   FIVE9_ENCRYPTION_KEY=<generar con: openssl rand -hex 32>
   ```
5. Ir a **Volumes** y agregar:
   | Source | Destination |
   |--------|-------------|
   | `five9-data` | `/app/data` |
   | `five9-logs` | `/app/logs` |
6. **Deploy**

### Paso 3: Acceder

Coolify asignara una URL automatica (ej: `https://five9-tu-app.coolify.app`). Abrir en el navegador.

### Paso 4: Configuracion inicial

1. **SOAP**: Click "Conectar" → ingresar Data Center, API version, usuario, password
2. **REST** (para automatizacion): Click "Conectar REST" → ingresar credenciales de Supervisor
3. Crear jobs de automatizacion desde la pestaña "Automatizacion"

## API Endpoints

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/health` | Estado de conexiones y jobs |
| POST | `/api/connect` | Login SOAP Five9 |
| POST | `/api/disconnect` | Desconectar SOAP |
| GET | `/api/profiles` | Listar perfiles |
| GET | `/api/profile?name=X` | Detalle de perfil |
| GET | `/api/skills` | Listar skills del dominio |
| POST | `/api/move` | Mover usuarios entre perfiles |
| POST | `/api/profile-skills` | Agregar/remover skills |
| POST | `/api/rest/connect` | Login REST Supervisor |
| POST | `/api/rest/disconnect` | Desconectar REST |
| POST | `/api/rest/refresh` | Refrescar catalogo |
| GET | `/api/automation/catalog` | Estado completo del dashboard |
| POST | `/api/jobs/create` | Crear job |
| POST | `/api/jobs/toggle` | Habilitar/deshabilitar job |
| POST | `/api/jobs/delete` | Eliminar job |
| POST | `/api/jobs/run` | Ejecutar job ahora |
| POST | `/api/queue/snapshot` | Obtener snapshot de cola |
| POST | `/api/automation/settings` | Actualizar configuracion |
| POST | `/api/credentials/forget` | Eliminar credenciales guardadas |

## Estructura del proyecto

```
five9-schedule-linux/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── src/
│   ├── index.js              # Express server + engine tick
│   ├── soap/client.js        # Five9 SOAP API
│   ├── soap/xml.js           # XML builders
│   ├── rest/client.js        # Five9 REST Supervisor API
│   ├── rest/protection.js    # Rate limit coordinator
│   ├── engine/scheduler.js   # Automation engine
│   ├── engine/actions.js     # 3 tipos de accion
│   ├── engine/jobs.js        # CRUD de jobs
│   ├── engine/settings.js    # Configuracion
│   ├── auth/credentials.js   # AES-256-GCM encryption
│   ├── api/routes.js         # Express routes
│   └── utils/                # Helpers, logger CSV
├── public/                   # Frontend (sin cambios del original)
└── data/, logs/              # Volumenes persistentes
```

## Migracion desde Windows

Si vienes de la version PowerShell:

1. Las credenciales encriptadas con **DPAPI** no son compatibles. Necesitas reconectar manualmente en la version Linux (las credenciales se encriptan con AES usando la env var `FIVE9_ENCRYPTION_KEY`).
2. Los `jobs.json` y CSVs de log **son compatibles** - se copian tal cual al volumen `/app/data`.
3. El frontend es **identico** - la interfaz no cambia.

## License

ISC

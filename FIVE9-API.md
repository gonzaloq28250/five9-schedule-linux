# Five9 API Reference

Este documento describe todas las llamadas a la API de Five9 que utiliza esta aplicación.

---

## Conexión

### SOAP (Admin Web Service)

| Campo | Valor |
|---|---|
| **Base URL** | `https://{datacenter}.five9.com/wsadmin/v13/AdminWebService` |
| **Auth** | Basic Auth (`username:password` en Base64) |
| **Headers** | `Authorization: Basic xxx`, `SOAPAction: ""`, `Content-Type: text/xml` |
| **Data Centers** | US → `app.five9.com`, UK → `app.five9.eu`, Canada → `app.five9.ca`, Frankfurt → `eu.five9.com` |
| **Versiones** | `default`, `v12`, `v13` |

### REST (Supervisor Web Service)

| Campo | Valor |
|---|---|
| **Base URL** | Se obtiene dinámicamente del login (`apiUrls[].host`) |
| **Auth** | `Authorization: Bearer-{tokenId}` + `farmId` header |
| **Timeout** | 30s por request |
| **Rate Limit** | Manejo automático de HTTP 429 con pausa y reintento |

---

## SOAP — Operaciones

### 1. getUserProfiles (listar perfiles)

```xml
<ser:getUserProfiles>
  <userProfileNamePatern>.*</userProfileNamePatern>
</ser:getUserProfiles>
```

**Uso:** Carga todos los perfiles del dominio con sus usuarios y skills. Se cachea internamente para evitar llamar a `getUserProfile` individual (que falla para algunos perfiles como "Administrador Global").

**Respuesta:** Lista de objetos `userProfile` con `name`, `users[]`, `skills[]`.

---

### 2. getUserProfile (obtener un perfil)

```xml
<ser:getUserProfile>
  <userProfileName>{name}</userProfileName>
</ser:getUserProfile>
```

> ⚠️ **Known issue:** Este endpoint falla con `ObjectNotFoundFault` para algunos perfiles que sí existen. La app resuelve esto cacheando la respuesta de `getUserProfiles()` y buscando en el cache.

---

### 3. getSkills (listar skills)

```xml
<ser:getSkills>
  <skillNamePattern>.*</skillNamePattern>
</ser:getSkills>
```

**Uso:** Carga todas las skills del dominio. Se usa para validar que las skills que se quieren agregar existen.

**Respuesta:** Lista de objetos con `name`, `description`, `id`.

---

### 4. modifyUserProfileUserList (mover usuarios entre perfiles)

```xml
<ser:modifyUserProfileUserList>
  <userProfileName>{perfil}</userProfileName>
  <addUsers>{usuario}</addUsers>
  <removeUsers>{usuario}</removeUsers>
</ser:modifyUserProfileUserList>
```

**Uso:** Agrega o remueve usuarios de un perfil. La app ejecuta esto en dos pasos para mover usuarios:
1. Remueve del origen
2. Agrega al destino
3. Si falla el paso 2, ejecuta rollback (vuelve a agregar al origen)

**Verificación:** Después de mover, vuelve a consultar el perfil para confirmar que los usuarios cambiaron correctamente.

---

### 5. modifyUserProfileSkills (modificar skills de un perfil)

```xml
<ser:modifyUserProfileSkills>
  <userProfileName>{perfil}</userProfileName>
  <addSkills>{skill}</addSkills>
  <removeSkills>{skill}</removeSkills>
</ser:modifyUserProfileSkills>
```

**Uso:** Agrega o remueve skills de un perfil. La app verifica antes y después, y ejecuta rollback si la verificación falla.

---

## REST — Operaciones

### 1. Login

```
POST {regionBase}/appsvcs/rs/svc/auth/login
```

```json
{
  "passwordCredentials": { "username": "...", "password": "..." },
  "appKey": "web-ui",
  "policy": "ForceIn"
}
```

**Respuesta:** `tokenId`, `orgId`, `userId`, `context.farmId`, `apiUrls[]`

---

### 2. Metadata (opcional)

```
GET {baseUrl}/appsvcs/rs/svc/auth/metadata
```

**Uso:** Actualiza `tokenId`, `farmId`, `baseUrl` si Five9 responde con valores más recientes.

---

### 3. Session Start (iniciar sesión de supervisor)

```
PUT {baseUrl}/supsvcs/rs/svc/supervisors/{userId}/session_start?force=true
```

```json
{ "stationId": "", "stationType": "EMPTY" }
```

**Uso:** Activa la sesión del supervisor para poder usar los endpoints de monitoreo.

---

### 4. Session Stop

```
PUT {baseUrl}/supsvcs/rs/svc/supervisors/{userId}/session_stop
```

**Uso:** Cierra la sesión del supervisor al desconectar.

---

### 5. Get Supervisor Skills (colas asignadas)

```
GET {baseUrl}/supsvcs/rs/svc/supervisors/{userId}/skills
```

**Uso:** Obtiene las queues/skills asignadas al supervisor. Se usa para popular el selector de queues en la UI y para los triggers de monitoreo.

---

### 6. Get Supervisor Agents (agentes visibles)

```
GET {baseUrl}/supsvcs/rs/svc/supervisors/{userId}/agents
```

**Uso:** Obtiene los agentes que el supervisor puede ver y controlar. Se usa para el selector de agentes en la UI.

---

### 7. Get Org Skills (todas las queues del dominio)

```
GET {baseUrl}/supsvcs/rs/svc/orgs/{orgId}/skills
```

**Uso:** Obtiene todas las queues del dominio (no solo las asignadas al supervisor). Se usa como referencia diagnóstica.

---

### 8. Get ACD Snapshot (estado de una queue)

```
GET {baseUrl}/supsvcs/rs/svc/supervisors/{userId}/skills/{skillId}/snapshot
```

**Uso:** Consulta el estado actual de una queue (llamadas en cola, callbacks, agentes ready, espera máxima). Es el endpoint principal para los triggers de tipo "queue".

**Metricas extraídas:**
- `inQueueCalls` / `inQueueCallCount` → llamadas en cola
- `inQueueCallbackCount` → callbacks en cola
- `maxQueueDuration` → tiempo de espera máximo (en ms)
- `readyForCallAgentsIds` → agentes disponibles

**Cache:** Se comparte entre jobs que monitorean la misma queue. TTL configurable (default 2s). Se invalida si Five9 devuelve 429.

---

### 9. Get Agent Info (detalles de un agente)

```
GET {baseUrl}/supsvcs/rs/svc/supervisors/{userId}/agents/{agentId}?include=skills
```

**Uso:** Obtiene la información de un agente incluyendo sus skills activas. Se usa antes de modificar active skills para capturar el estado original (rollback).

---

### 10. Set Active Skills (modificar skills activas de un agente)

```
PUT {baseUrl}/supsvcs/rs/svc/supervisors/{userId}/agents/{agentId}/active_skills
```

```json
["skillId1", "skillId2"]
```

**Uso:** Reemplaza completamente la lista de skills activas de un agente. La app:
1. Captura el estado original (`getAgent` → `getAgentActiveSkillIds`)
2. Calcula la nueva lista (agrega o remueve la skill objetivo)
3. Aplica con `setActiveSkills`
4. Si falla, ejecuta rollback restaurando el estado original
5. Soporta multi-agente con rollback secuencial en orden inverso de prioridad

---

## Flujo de datos

```
UI (index.html + automation.js)
  ↓ HTTP fetch
Express Router (routes.js)
  ↓
┌─────────────────┬──────────────────┐
│   SOAP Client   │   REST Client    │
│   (client.js)   │   (client.js)    │
│                 │                  │
│  getUserProfiles│  login           │
│  getSkills      │  session_start   │
│  modifyProfile* │  getSnapshot     │
│                 │  getAgent        │
│                 │  setActiveSkills │
└────────┬────────┴────────┬─────────┘
         │                 │
    Five9 SOAP         Five9 REST
    Admin WS           Supervisor WS
```

## Rate Limiting

Five9 aplica rate limits no documentados oficialmente. La app maneja:

1. **HTTP 429**: Pausa automática hasta el tiempo indicado por Five9
2. **Límite interno**: Configurable (default 60 req/min), con cooldown y jitter
3. **Cache de snapshots**: Compartido entre jobs, reduce llamadas repetitivas
4. **Protección por minuto**: Conteo de requests en ventana móvil de 60s

## Errores comunes

| Error | Causa | Solución |
|---|---|---|
| `ObjectNotFoundFault` | `getUserProfile` falla para perfiles que existen | Se usa cache de `getUserProfiles` |
| `HTTP 429` | Rate limit de Five9 | Pausa automática + reintento |
| `HTTP 401` | Token expirado | Desconexión automática, requiere reconectar |
| `ECONNABORTED` | Timeout de conexión | Timeout de 30s configurado |

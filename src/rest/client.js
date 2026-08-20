const axios = require('axios');
const { getPropertyValue, toStringArray } = require('../utils/helpers');

const REGION_MAP = {
  US: 'https://app.five9.com',
  UK: 'https://app.five9.eu',
  Canada: 'https://app.five9.ca',
  Frankfurt: 'https://eu.five9.com'
};

function extractBaseUrl(response, fallback) {
  const candidates = [];
  const find = (obj, depth) => {
    if (!obj || depth > 5 || typeof obj === 'string' || typeof obj === 'number') return;
    for (const key of Object.keys(obj)) {
      if (key === 'apiUrls' && Array.isArray(obj[key])) {
        candidates.push(...obj[key]);
        continue;
      }
      const val = obj[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) val.forEach(v => find(v, depth + 1));
        else find(val, depth + 1);
      }
    }
  };
  find(response, 0);
  for (const c of candidates) {
    const host = getPropertyValue(c, 'host', '');
    const port = getPropertyValue(c, 'port', '443');
    if (host) return `https://${host}:${port}`;
  }
  return fallback.replace(/\/+$/, '');
}

function normalizeCollection(response, wrapperNames = []) {
  if (response === null || response === undefined) return [];
  if (typeof response === 'string') {
    const trimmed = response.trim();
    if (!trimmed || ['[]', '{}', 'null'].includes(trimmed)) return [];
    try { return normalizeCollection(JSON.parse(trimmed), wrapperNames); } catch { return []; }
  }
  for (const name of wrapperNames) {
    if (response[name] !== undefined && response[name] !== null) {
      return normalizeCollection(response[name], wrapperNames);
    }
  }
  if (Array.isArray(response)) return response.filter(x => x !== null && x !== undefined);
  return [response];
}

function convertQueueCatalog(response) {
  const items = normalizeCollection(response, ['skills', 'queues', 'items', 'results', 'data', 'content', 'value']);
  const result = [];
  const seen = new Set();
  for (const item of items) {
    if (!item) continue;
    let id = String(getPropertyValue(item, 'id', '') || getPropertyValue(item, 'skillId', '') || getPropertyValue(item, 'queueId', '')).trim();
    let name = String(getPropertyValue(item, 'name', '') || getPropertyValue(item, 'skillName', '') || getPropertyValue(item, 'queueName', '')).trim();
    if (!id && !name) continue;
    if (!name) name = `Queue ${id}`;
    const key = `${name}|${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ id, name });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function convertAgentCatalog(response) {
  const items = normalizeCollection(response, ['agents', 'users', 'items', 'results', 'data', 'content', 'value']);
  const result = [];
  const seen = new Set();
  for (const item of items) {
    if (!item) continue;
    let id = String(getPropertyValue(item, 'id', '') || getPropertyValue(item, 'agentId', '') || getPropertyValue(item, 'userId', '')).trim();
    let userName = String(getPropertyValue(item, 'userName', '') || getPropertyValue(item, 'username', '')).trim();
    if (!id && !userName) continue;
    const firstName = String(getPropertyValue(item, 'firstName', '')).trim();
    const lastName = String(getPropertyValue(item, 'lastName', '')).trim();
    const key = `${userName}|${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ id, userName, firstName, lastName });
  }
  return result.sort((a, b) => a.userName.localeCompare(b.userName) || a.id.localeCompare(b.id));
}

function getCatalogWarnings(assignedQueues, domainQueues, agents) {
  const warnings = [];
  if (assignedQueues.length === 0) {
    if (domainQueues.length > 0) {
      warnings.push(`El login REST funciona y el dominio contiene ${domainQueues.length} queue(s), pero ninguna está asignada al rol Supervisor de este usuario.`);
    } else {
      warnings.push('Five9 no devolvió queues para este supervisor ni para el dominio.');
    }
  }
  if (agents.length === 0) {
    warnings.push('Five9 no devolvió agentes visibles. Revisa los Agent Groups asignados al rol Supervisor.');
  }
  return warnings;
}

function getSnapshotMetrics(snapshot) {
  if (!snapshot) return { callsInQueue: 0, callbacksInQueue: 0, longestWaitSeconds: 0, readyAgents: 0, observedAt: new Date().toISOString() };
  let callsInQueue = 0;
  const inQueueCalls = getPropertyValue(snapshot, 'inQueueCalls', null);
  const callCountValue = getPropertyValue(snapshot, 'inQueueCallCount', null);
  if (inQueueCalls !== null && inQueueCalls !== undefined) {
    callsInQueue = Array.isArray(inQueueCalls) ? inQueueCalls.length : Number(inQueueCalls) || 0;
  } else if (callCountValue !== null && callCountValue !== undefined) {
    callsInQueue = Number(callCountValue) || 0;
  }
  const callbackCount = Number(getPropertyValue(snapshot, 'inQueueCallbackCount', 0)) || 0;
  const maxQueueDuration = Number(getPropertyValue(snapshot, 'maxQueueDuration', 0)) || 0;
  const readyIds = getPropertyValue(snapshot, 'readyForCallAgentsIds', null);
  const readyAgents = readyIds ? (Array.isArray(readyIds) ? readyIds.length : 1) : 0;
  return {
    callsInQueue,
    callbacksInQueue: callbackCount,
    longestWaitSeconds: Math.round((maxQueueDuration / 1000) * 10) / 10,
    readyAgents,
    observedAt: new Date().toISOString()
  };
}

function getAgentActiveSkillIds(agentInfo) {
  if (!agentInfo) return [];
  const skills = getPropertyValue(agentInfo, 'skills', null);
  if (skills) {
    const activeIds = [];
    for (const skill of (Array.isArray(skills) ? skills : [skills])) {
      const isActive = Boolean(getPropertyValue(skill, 'isActive', false));
      const id = String(getPropertyValue(skill, 'id', '')).trim();
      if (isActive && id) activeIds.push(id);
    }
    return [...new Set(activeIds)];
  }
  for (const name of ['activeSkills', 'activeSkillIds', 'activeQueues', 'selectedSkills']) {
    const val = getPropertyValue(agentInfo, name);
    if (val !== null && val !== undefined) {
      return toStringArray(val);
    }
  }
  return [];
}

class RestClient {
  constructor(protection) {
    this.protection = protection;
    this.connected = false;
    this.username = '';
    this.dataCenter = '';
    this.tokenId = '';
    this.farmId = '';
    this.orgId = '';
    this.supervisorId = '';
    this.baseUrl = '';
    this.headers = {};
    this.queues = [];
    this.domainQueues = [];
    this.agents = [];
    this.warnings = [];
    this.lastError = '';
  }

  async connect(dataCenter, username, password) {
    const regionBase = REGION_MAP[dataCenter];
    if (!regionBase) throw new Error('Data center REST inválido.');
    if (!username || !password) throw new Error('El usuario y la contraseña del Supervisor REST son obligatorios.');

    const loginUri = `${regionBase}/appsvcs/rs/svc/auth/login`;
    let login;
    try {
      const resp = await axios.post(loginUri, {
        passwordCredentials: { username, password },
        appKey: 'web-ui',
        policy: 'ForceIn'
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
      login = resp.data;
    } catch (err) {
      const body = err.response?.data ? JSON.stringify(err.response.data) : '';
      throw new Error(`No fue posible iniciar sesión en Supervisor REST: ${err.message}${body ? ' | ' + body : ''}`);
    }

    let tokenId = String(getPropertyValue(login, 'tokenId', '') || '');
    let orgId = String(getPropertyValue(login, 'orgId', '') || '');
    let userId = String(getPropertyValue(login, 'userId', '') || '');
    const context = getPropertyValue(login, 'context', {});
    let farmId = String(getPropertyValue(context, 'farmId', '') || '');
    let baseUrl = extractBaseUrl(login, regionBase);

    if (!tokenId || !userId) throw new Error('Five9 no devolvió tokenId o userId durante el login REST.');

    let headers = {
      'Authorization': `Bearer-${tokenId}`,
      'farmId': farmId,
      'Accept': 'application/json'
    };

    // Metadata call (try GET then POST)
    const metadataUri = `${baseUrl.replace(/\/+$/, '')}/appsvcs/rs/svc/auth/metadata`;
    let metadata = null;
    try {
      const resp = await axios.get(metadataUri, { headers, timeout: 30000 });
      metadata = resp.data;
    } catch {
      try {
        const resp = await axios.post(metadataUri, {}, { headers, timeout: 30000 });
        metadata = resp.data;
      } catch { metadata = null; }
    }

    if (metadata) {
      const mt = String(getPropertyValue(metadata, 'tokenId', '') || '');
      const mc = getPropertyValue(metadata, 'context', {});
      const mf = String(getPropertyValue(mc, 'farmId', '') || '');
      const mo = String(getPropertyValue(metadata, 'orgId', '') || '');
      const mu = String(getPropertyValue(metadata, 'userId', '') || '');
      if (mt) tokenId = mt;
      if (mf) farmId = mf;
      if (mo) orgId = mo;
      if (mu) userId = mu;
      baseUrl = extractBaseUrl(metadata, baseUrl);
      headers['Authorization'] = `Bearer-${tokenId}`;
      headers['farmId'] = farmId;
    }

    this.connected = true;
    this.username = username;
    this.dataCenter = dataCenter;
    this.tokenId = tokenId;
    this.farmId = farmId;
    this.orgId = orgId;
    this.supervisorId = userId;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.headers = headers;
    this.lastError = '';

    this.protection.clearSnapshotCache();

    try {
      await this.invoke('PUT', `/supsvcs/rs/svc/supervisors/${userId}/session_start?force=true`, { stationId: '', stationType: 'EMPTY' });
      await this.refreshCatalog();
    } catch (err) {
      this.connected = false;
      this.lastError = err.message;
      throw err;
    }
  }

  async disconnect() {
    if (this.connected) {
      try {
        await this.invoke('PUT', `/supsvcs/rs/svc/supervisors/${this.supervisorId}/session_stop`);
      } catch { /* session cleaned up regardless */ }
    }
    this.connected = false;
    this.username = '';
    this.tokenId = '';
    this.farmId = '';
    this.orgId = '';
    this.supervisorId = '';
    this.baseUrl = '';
    this.headers = {};
    this.queues = [];
    this.domainQueues = [];
    this.agents = [];
    this.warnings = [];
    this.protection.clearSnapshotCache();
  }

  async refreshCatalog() {
    if (!this.connected) return;
    const queueResp = await this.invoke('GET', `/supsvcs/rs/svc/supervisors/${this.supervisorId}/skills`);
    const agentResp = await this.invoke('GET', `/supsvcs/rs/svc/supervisors/${this.supervisorId}/agents`);

    let domainQueueResp = null;
    if (this.orgId) {
      try { domainQueueResp = await this.invoke('GET', `/supsvcs/rs/svc/orgs/${this.orgId}/skills`); } catch { domainQueueResp = null; }
    }

    this.queues = convertQueueCatalog(queueResp);
    this.domainQueues = convertQueueCatalog(domainQueueResp);
    this.agents = convertAgentCatalog(agentResp);
    this.warnings = getCatalogWarnings(this.queues, this.domainQueues, this.agents);
  }

  async invoke(method, path, body = null) {
    if (!this.connected) throw new Error('La conexión Supervisor REST no está activa.');
    this.protection.assertAllowed();

    const url = `${this.baseUrl}${path}`;
    try {
      const config = {
        method,
        url,
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        timeout: 30000
      };
      if (body !== null && body !== undefined) config.data = body;
      const resp = await axios(config);
      this.protection.lastSuccessfulRequestAt = new Date();
      return resp.data;
    } catch (err) {
      const status = err.response?.status || 0;
      const bodyText = err.response?.data ? (typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data)) : '';

      if (status === 429) {
        const rateInfo = this.protection.extractRateLimitInfo(err.response);
        let reason = 'Five9 respondió 429 Too Many Requests.';
        if (rateInfo.rateLimitType) reason += ` Tipo: ${rateInfo.rateLimitType}.`;
        if (rateInfo.rateLimit) reason += ` Límite reportado: ${rateInfo.rateLimit}${rateInfo.rateLimitPeriod ? ' por ' + rateInfo.rateLimitPeriod : ''}.`;
        this.protection.setGlobalPause(rateInfo.resetAt, reason, 'FIVE9_429', rateInfo);
        throw new Error(`${reason} El sensor se reanudará automáticamente a las ${rateInfo.resetAt}.`);
      }

      if (status === 401) this.connected = false;

      const msg = bodyText
        ? `Supervisor REST rechazó la solicitud: ${err.message} | ${bodyText}`
        : `Supervisor REST rechazó la solicitud: ${err.message}`;
      throw new Error(msg);
    }
  }

  async getSnapshot(skillId) {
    return this.invoke('GET', `/supsvcs/rs/svc/supervisors/${this.supervisorId}/skills/${skillId}/snapshot`);
  }

  async getSharedSnapshot(skillId, maxAgeSeconds = 2, forceRefresh = false) {
    return this.protection.getSnapshotShared(skillId, maxAgeSeconds, forceRefresh, () => this.getSnapshot(skillId));
  }

  async getAgent(agentId) {
    return this.invoke('GET', `/supsvcs/rs/svc/supervisors/${this.supervisorId}/agents/${agentId}?include=skills`);
  }

  async setActiveSkills(agentId, skillIds) {
    const unique = [...new Set(skillIds)];
    return this.invoke('PUT', `/supsvcs/rs/svc/supervisors/${this.supervisorId}/agents/${agentId}/active_skills`, unique);
  }
}

module.exports = { RestClient, getSnapshotMetrics, getAgentActiveSkillIds };

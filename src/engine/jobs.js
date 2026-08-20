const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const { DATA_DIR, getPropertyValue } = require('../utils/helpers');

const JOBS_PATH = path.join(DATA_DIR, 'jobs.json');

const MAX_HISTORY = 50;

const DEFAULT_JOB_STATE = {
  phase: 'idle',
  conditionSince: '',
  recoverySince: '',
  lastCheck: '',
  nextPollAt: '',
  lastRun: '',
  cooldownUntil: '',
  nextRun: '',
  lastResult: 'Esperando ejecucion',
  lastMetrics: null,
  originalActiveSkills: [],
  originalActiveSkillsByAgent: [],
  hasOriginalActiveSkillsSnapshot: false,
  pendingActiveSkillRollback: false,
  executionCount: 0,
  history: []
};

function addMissingJobState(job) {
  if (!job.state) job.state = {};
  for (const [key, val] of Object.entries(DEFAULT_JOB_STATE)) {
    if (job.state[key] === undefined) job.state[key] = val;
  }
  if (!Array.isArray(job.state.history)) job.state.history = [];
  return job;
}

function addHistoryEntry(job, status, trigger, message, metrics = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    status,
    trigger,
    message: String(message || '').substring(0, 500),
    metrics
  };
  job.state.history.unshift(entry);
  if (job.state.history.length > MAX_HISTORY) {
    job.state.history = job.state.history.slice(0, MAX_HISTORY);
  }
}

function loadJobs() {
  if (!fs.existsSync(JOBS_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(JOBS_PATH, 'utf8'));
    if (!Array.isArray(data)) return [];
    return data.map(addMissingJobState);
  } catch {
    return [];
  }
}

function saveJobs(jobs) {
  fs.writeFileSync(JOBS_PATH, JSON.stringify(jobs, null, 2), 'utf8');
}

function createJob(payload) {
  const id = uuid().replace(/-/g, '');
  const now = new Date().toISOString();
  const job = {
    id,
    name: payload.name || 'Job sin nombre',
    enabled: payload.enabled !== false,
    dryRun: payload.dryRun !== false,
    triggerType: payload.triggerType || 'schedule',
    schedule: payload.triggerType === 'schedule' ? {
      recurrence: getPropertyValue(payload.schedule, 'recurrence', 'once'),
      time: getPropertyValue(payload.schedule, 'time', '00:00'),
      date: getPropertyValue(payload.schedule, 'date', ''),
      days: getPropertyValue(payload.schedule, 'days', []),
      graceMinutes: Number(getPropertyValue(payload.schedule, 'graceMinutes', 15)) || 15
    } : null,
    queue: payload.triggerType === 'queue' ? {
      skillId: getPropertyValue(payload.queue, 'skillId', ''),
      skillName: getPropertyValue(payload.queue, 'skillName', ''),
      activateAt: Number(getPropertyValue(payload.queue, 'activateAt', 1)) || 1,
      recoverAt: Number(getPropertyValue(payload.queue, 'recoverAt', 0)) || 0,
      persistenceSeconds: Number(getPropertyValue(payload.queue, 'persistenceSeconds', 30)) || 30,
      recoverySeconds: Number(getPropertyValue(payload.queue, 'recoverySeconds', 120)) || 120,
      pollSeconds: Math.max(5, Number(getPropertyValue(payload.queue, 'pollSeconds', 10)) || 10),
      cooldownSeconds: Math.max(0, Number(getPropertyValue(payload.queue, 'cooldownSeconds', 300)) || 300)
    } : null,
    action: payload.action || { type: 'profile_skill' },
    createdAt: now,
    state: { ...DEFAULT_JOB_STATE }
  };
  return job;
}

function findJob(jobs, id) {
  return jobs.find(j => j.id === id);
}

function removeJob(jobs, id) {
  const idx = jobs.findIndex(j => j.id === id);
  if (idx >= 0) jobs.splice(idx, 1);
  return jobs;
}

module.exports = { loadJobs, saveJobs, createJob, findJob, removeJob, addMissingJobState, addHistoryEntry };

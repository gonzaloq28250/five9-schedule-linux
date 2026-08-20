const { getPropertyValue, getWeekdayCode } = require('../utils/helpers');
const { logAutomationJob } = require('../utils/logger');
const { invokeJobAction } = require('./actions');
const { addHistoryEntry } = require('./jobs');

function getNextScheduleRun(job, from = new Date()) {
  const schedule = job.schedule;
  const recurrence = String(getPropertyValue(schedule, 'recurrence', 'once'));
  const timeText = String(getPropertyValue(schedule, 'time', '00:00'));
  const [hours, minutes] = timeText.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) throw new Error('La hora del job no tiene un formato valido.');

  const timeMs = (hours * 3600 + minutes * 60) * 1000;

  if (recurrence === 'once') {
    const dateText = String(getPropertyValue(schedule, 'date', ''));
    if (!dateText) throw new Error('El job necesita una fecha.');
    const [y, m, d] = dateText.split('-').map(Number);
    const target = new Date(y, m - 1, d, hours, minutes, 0, 0);
    return target;
  }

  if (recurrence === 'daily') {
    const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hours, minutes, 0, 0);
    if (candidate <= from) candidate.setDate(candidate.getDate() + 1);
    return candidate;
  }

  if (recurrence === 'weekly') {
    const days = getPropertyValue(schedule, 'days', []);
    if (days.length === 0) throw new Error('El job semanal necesita al menos un dia.');
    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(from);
      candidate.setDate(candidate.getDate() + offset);
      candidate.setHours(hours, minutes, 0, 0);
      const code = getWeekdayCode(candidate);
      if (days.includes(code) && candidate > from) return candidate;
    }
    throw new Error('No se encontro un dia valido en la ventana de 8 dias.');
  }

  throw new Error(`Recurrence no soportada: ${recurrence}`);
}

function getNextRuns(job, count = 5) {
  if (job.triggerType !== 'schedule') return [];
  if (!job.schedule) return [];
  const runs = [];
  let from = new Date();
  for (let i = 0; i < count; i++) {
    try {
      const next = getNextScheduleRun(job, from);
      runs.push(next.toISOString());
      from = next;
    } catch {
      break;
    }
  }
  return runs;
}

function initializeNextRun(job) {
  if (job.triggerType !== 'schedule') return;
  try {
    const from = new Date(Date.now() - 1000);
    const nextRun = getNextScheduleRun(job, from);
    job.state.nextRun = nextRun.toISOString();
  } catch (err) {
    job.state.lastResult = `Error calculando nextRun: ${err.message}`;
    job.enabled = false;
  }
}

function runScheduleJob(job, soapClient, restClient, restProtection, settings) {
  const now = new Date();
  if (!job.state.nextRun) initializeNextRun(job);
  if (!job.state.nextRun) return;

  const nextRun = new Date(job.state.nextRun);
  const graceMinutes = Number(getPropertyValue(job.schedule, 'graceMinutes', 15)) || 15;

  if (now < nextRun) return;

  if (now > new Date(nextRun.getTime() + graceMinutes * 60000)) {
    job.state.lastResult = `MISFIRE: ventana de ejecucion perdida (grace ${graceMinutes}m).`;
    logAutomationJob(job, 'scheduled', 'MISFIRE', job.state.lastResult, job.state.lastMetrics, restProtection, settings);
    addHistoryEntry(job, 'MISFIRE', 'scheduled', job.state.lastResult);
    if (job.schedule.recurrence === 'once') {
      job.enabled = false;
      job.state.nextRun = '';
    } else {
      try {
        const next = getNextScheduleRun(job, new Date(Date.now() + 1000));
        job.state.nextRun = next.toISOString();
      } catch { job.state.nextRun = ''; }
    }
    return;
  }

  // Execute
  invokeJobAction(job, 'scheduled', soapClient, restClient, restProtection, settings)
    .then(result => {
      job.state.executionCount++;
      job.state.lastRun = now.toISOString();
      job.state.lastResult = result.message;
      logAutomationJob(job, 'scheduled', 'SUCCESS', result.message, job.state.lastMetrics, restProtection, settings);
      addHistoryEntry(job, 'SUCCESS', 'scheduled', result.message, job.state.lastMetrics);

      if (job.schedule.recurrence === 'once') {
        job.enabled = false;
        job.state.nextRun = '';
      } else {
        try {
          const next = getNextScheduleRun(job, new Date(Date.now() + 1000));
          job.state.nextRun = next.toISOString();
        } catch { job.state.nextRun = ''; }
      }
    })
    .catch(err => {
      job.state.lastResult = err.message;
      logAutomationJob(job, 'scheduled', 'FAILED', err.message, job.state.lastMetrics, restProtection, settings);
      addHistoryEntry(job, 'FAILED', 'scheduled', err.message, job.state.lastMetrics);
      if (job.schedule.recurrence === 'once') {
        job.enabled = false;
        job.state.nextRun = '';
      } else {
        try {
          const next = getNextScheduleRun(job, new Date(Date.now() + 1000));
          job.state.nextRun = next.toISOString();
        } catch { job.state.nextRun = ''; }
      }
    });
}

function getQueuePollJitterSeconds(pollSeconds, settings) {
  const percent = settings.pollJitterPercent;
  const maximum = Math.floor(pollSeconds * (percent / 100));
  if (maximum <= 0) return 0;
  return Math.floor(Math.random() * (maximum + 1));
}

function runQueueJob(job, restClient, restProtection, settings, soapClient) {
  const now = new Date();
  const pollSeconds = Number(getPropertyValue(job.queue, 'pollSeconds', 10)) || 10;
  const cooldownSeconds = Number(getPropertyValue(job.queue, 'cooldownSeconds', 300)) || 300;

  if (!restClient.connected) {
    job.state.lastResult = 'Esperando conexion REST...';
    return;
  }

  if (restProtection.pausedUntil) {
    job.state.lastResult = 'Pausa REST activa...';
    return;
  }

  if (job.state.nextPollAt && now < new Date(job.state.nextPollAt)) return;

  job.state.lastCheck = now.toISOString();
  const jitter = getQueuePollJitterSeconds(pollSeconds, settings);
  job.state.nextPollAt = new Date(now.getTime() + (pollSeconds + jitter) * 1000).toISOString();

  let metrics;
  try {
    const skillId = job.queue.skillId;
    const snapResult = restClient.getSharedSnapshot ? restClient.getSharedSnapshot(skillId, pollSeconds, false) : restClient.getSnapshot(skillId);
    Promise.resolve(snapResult).then(snap => {
      const { getSnapshotMetrics } = require('../rest/client');
      metrics = getSnapshotMetrics(snap);
      job.state.lastMetrics = metrics;
      processQueuePhase(job, metrics, restClient, restProtection, settings, soapClient);
    }).catch(err => {
      job.state.lastResult = err.message;
      logAutomationJob(job, 'queue_check', 'FAILED', err.message, job.state.lastMetrics, restProtection, settings);
      addHistoryEntry(job, 'FAILED', 'queue_check', err.message, job.state.lastMetrics);
    });
  } catch (err) {
    job.state.lastResult = err.message;
    logAutomationJob(job, 'queue_check', 'FAILED', err.message, job.state.lastMetrics, restProtection, settings);
    addHistoryEntry(job, 'FAILED', 'queue_check', err.message, job.state.lastMetrics);
  }
}

function processQueuePhase(job, metrics, restClient, restProtection, settings, soapClient) {
  const now = new Date();
  const calls = metrics.callsInQueue;
  const activateAt = Number(getPropertyValue(job.queue, 'activateAt', 1)) || 1;
  const recoverAt = Number(getPropertyValue(job.queue, 'recoverAt', 0)) || 0;
  const persistenceSeconds = Number(getPropertyValue(job.queue, 'persistenceSeconds', 30)) || 30;
  const recoverySeconds = Number(getPropertyValue(job.queue, 'recoverySeconds', 120)) || 120;
  const cooldownSeconds = Number(getPropertyValue(job.queue, 'cooldownSeconds', 300)) || 300;

  // Check cooldown
  let cooldownActive = false;
  if (job.state.cooldownUntil) {
    const cooldownUntil = new Date(job.state.cooldownUntil);
    if (now < cooldownUntil) {
      cooldownActive = true;
    } else {
      job.state.cooldownUntil = '';
    }
  }

  if (job.state.phase === 'active') {
    job.state.conditionSince = '';
    if (calls <= recoverAt) {
      if (!job.state.recoverySince) job.state.recoverySince = now.toISOString();
      const elapsed = (now - new Date(job.state.recoverySince)) / 1000;
      if (elapsed >= recoverySeconds) {
        if (cooldownActive) {
          job.state.lastResult = `En cooldown. Recuperacion lista (${Math.ceil((new Date(job.state.cooldownUntil) - now) / 1000)}s).`;
          return;
        }
        invokeJobAction(job, 'recover', soapClient, restClient, restProtection, settings)
          .then(result => {
            job.state.phase = 'idle';
            job.state.recoverySince = '';
            job.state.lastRun = now.toISOString();
            job.state.executionCount++;
            job.state.lastResult = result.message;
            if (cooldownSeconds > 0) job.state.cooldownUntil = new Date(now.getTime() + cooldownSeconds * 1000).toISOString();
            logAutomationJob(job, 'recovery', 'SUCCESS', result.message, metrics, restProtection, settings);
            addHistoryEntry(job, 'SUCCESS', 'recover', result.message, metrics);
          })
          .catch(err => {
            job.state.recoverySince = '';
            if (cooldownSeconds > 0) job.state.cooldownUntil = new Date(now.getTime() + cooldownSeconds * 1000).toISOString();
            job.state.lastResult = err.message;
            logAutomationJob(job, 'recovery', 'FAILED', err.message, metrics, restProtection, settings);
            addHistoryEntry(job, 'FAILED', 'recover', err.message, metrics);
          });
      } else {
        const remaining = Math.ceil(recoverySeconds - elapsed);
        job.state.lastResult = `Recuperacion observada (${Math.round(elapsed)}s / ${recoverySeconds}s). Quedan ${remaining}s.`;
      }
    } else {
      job.state.recoverySince = '';
      job.state.lastResult = `Refuerzo activo. ${calls} llamada(s) en cola (umbral recuperacion: ${recoverAt}).`;
    }
    return;
  }

  // Phase: idle
  job.state.recoverySince = '';
  if (calls >= activateAt) {
    if (!job.state.conditionSince) job.state.conditionSince = now.toISOString();
    const elapsed = (now - new Date(job.state.conditionSince)) / 1000;
    if (elapsed >= persistenceSeconds) {
      if (cooldownActive) {
        job.state.lastResult = `En cooldown. Condicion de activacion cumplida (${Math.ceil((new Date(job.state.cooldownUntil) - now) / 1000)}s).`;
        return;
      }
      invokeJobAction(job, 'activate', soapClient, restClient, restProtection, settings)
        .then(result => {
          job.state.phase = 'active';
          job.state.conditionSince = '';
          job.state.lastRun = now.toISOString();
          job.state.executionCount++;
          job.state.lastResult = result.message;
          if (cooldownSeconds > 0) job.state.cooldownUntil = new Date(now.getTime() + cooldownSeconds * 1000).toISOString();
          logAutomationJob(job, 'activation', 'SUCCESS', result.message, metrics, restProtection, settings);
          addHistoryEntry(job, 'SUCCESS', 'activate', result.message, metrics);
        })
        .catch(err => {
          job.state.conditionSince = '';
          if (cooldownSeconds > 0) job.state.cooldownUntil = new Date(now.getTime() + cooldownSeconds * 1000).toISOString();
          job.state.lastResult = err.message;
          logAutomationJob(job, 'activation', 'FAILED', err.message, metrics, restProtection, settings);
          addHistoryEntry(job, 'FAILED', 'activate', err.message, metrics);
        });
    } else {
      const remaining = Math.ceil(persistenceSeconds - elapsed);
      job.state.lastResult = `Condicion de activacion observada (${Math.round(elapsed)}s / ${persistenceSeconds}s). Quedan ${remaining}s.`;
    }
  } else {
    job.state.conditionSince = '';
    job.state.lastResult = `Queue estable. ${calls} llamada(s) en cola (umbral activacion: ${activateAt}).`;
  }
}

class AutomationEngine {
  constructor(jobs, soapClient, restClient, restProtection, settings) {
    this.jobs = jobs;
    this.soapClient = soapClient;
    this.restClient = restClient;
    this.restProtection = restProtection;
    this.settings = settings;
    this.lastTick = 0;
    this.changed = false;
    this.interval = null;
  }

  tick() {
    const now = Date.now();
    if (now - this.lastTick < 900) return;
    this.lastTick = now;

    this.restProtection.clearIfExpired();
    this.changed = false;

    for (const job of this.jobs) {
      if (!job.enabled) continue;

      const before = JSON.stringify(job.state);
      try {
        if (job.triggerType === 'schedule') {
          runScheduleJob(job, this.soapClient, this.restClient, this.restProtection, this.settings);
        } else if (job.triggerType === 'queue') {
          runQueueJob(job, this.restClient, this.restProtection, this.settings, this.soapClient);
        }
      } catch (err) {
        job.state.lastResult = err.message;
        logAutomationJob(job, 'engine', 'FAILED', err.message, job.state.lastMetrics, this.restProtection, this.settings);
        addHistoryEntry(job, 'FAILED', 'engine', err.message, job.state.lastMetrics);
      }

      if (JSON.stringify(job.state) !== before) this.changed = true;
    }

    return this.changed;
  }

  start(getSaveFn) {
    this.interval = setInterval(() => {
      this.tick();
      if (this.changed) {
        this.changed = false;
        getSaveFn()();
      }
    }, 1000);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }
}

module.exports = { AutomationEngine, getNextScheduleRun, getNextRuns, initializeNextRun };

const express = require('express');
const { DATA_DIR } = require('../utils/helpers');
const { saveCredential, loadCredential, deleteCredential } = require('../auth/credentials');
const { logMoveAudit, logSkillAudit } = require('../utils/logger');
const { moveUsers, setProfileSkills } = require('../engine/actions');
const { createJob, findJob, removeJob, saveJobs } = require('../engine/jobs');
const { updateSettings } = require('../engine/settings');

const SOAP_CREDS = require('path').join(DATA_DIR, 'soap-credentials.json');
const REST_CREDS = require('path').join(DATA_DIR, 'rest-credentials.json');

module.exports = function createRouter(state) {
  const router = express.Router();
  const { soapClient, restClient, restProtection, settings, jobs } = state;

  function assertSoapConnected() {
    if (!soapClient.connected) throw new Error('Debes conectarte a Five9 antes de usar esta funcion.');
  }

  // Health
  router.get('/api/health', (req, res) => {
    res.json({
      soapConnected: soapClient.connected,
      restConnected: restClient.connected,
      engineJobs: jobs.length,
      restProtection: restProtection.getStatus(),
      automationSettings: settings
    });
  });

  // SOAP Connect
  router.post('/api/connect', async (req, res, next) => {
    try {
      const { dataCenter, apiVersion, username, password, saveCredentials } = req.body;
      console.log(`[SOAP] Conectando: dc=${dataCenter}, ver=${apiVersion}, user=${username}`);
      soapClient.connect(dataCenter, apiVersion, username, password);
      console.log(`[SOAP] URL: ${soapClient.apiUrl}`);
      const profiles = await soapClient.getProfiles();
      console.log(`[SOAP] Conectado. ${profiles.length} perfiles.`);
      soapClient.connected = true;
      if (saveCredentials) saveCredential(SOAP_CREDS, { username, password, dataCenter, apiVersion });
      res.json({ success: true, profiles, username, dataCenter, apiVersion });
    } catch (e) {
      console.error(`[SOAP] Error:`, e.message);
      next(e);
    }
  });

  // SOAP Disconnect
  router.post('/api/disconnect', (req, res) => {
    soapClient.disconnect();
    res.json({ success: true });
  });

  // Profiles list
  router.get('/api/profiles', async (req, res, next) => {
    try {
      assertSoapConnected();
      const profiles = await soapClient.getProfiles();
      res.json({ success: true, profiles });
    } catch (e) { next(e); }
  });

  // Single profile
  router.get('/api/profile', async (req, res, next) => {
    try {
      assertSoapConnected();
      const name = req.query.name;
      if (!name) throw new Error('Falta el nombre del perfil.');
      const profile = await soapClient.getProfile(name);
      res.json({ success: true, profile });
    } catch (e) { next(e); }
  });

  // Skills list
  router.get('/api/skills', async (req, res, next) => {
    try {
      assertSoapConnected();
      const skills = await soapClient.getSkills();
      res.json({ success: true, skills });
    } catch (e) { next(e); }
  });

  // Move users
  router.post('/api/move', async (req, res, next) => {
    try {
      assertSoapConnected();
      const result = await moveUsers(req.body, soapClient);
      logMoveAudit(result.movedUsers, req.body.sourceProfile, req.body.targetProfile, result.verificationOk ? 'SUCCESS' : 'VERIFICATION_FAILED', result.message, soapClient.username);
      res.json({ success: true, ...result });
    } catch (e) { next(e); }
  });

  // Profile skills
  router.post('/api/profile-skills', async (req, res, next) => {
    try {
      assertSoapConnected();
      const result = await setProfileSkills(req.body, soapClient);
      logSkillAudit(req.body.profileName, result.addedSkills, result.removedSkills, result.verificationOk ? 'SUCCESS' : 'VERIFICATION_FAILED', result.message, soapClient.username);
      res.json({ success: true, ...result });
    } catch (e) { next(e); }
  });

  // REST Connect
  router.post('/api/rest/connect', async (req, res, next) => {
    try {
      const { dataCenter, username, password, saveCredentials } = req.body;
      await restClient.connect(dataCenter, username, password);
      if (saveCredentials) saveCredential(REST_CREDS, { username, password, dataCenter });
      res.json({
        success: true,
        queues: restClient.queues,
        agents: restClient.agents,
        username,
        dataCenter,
        warnings: restClient.warnings
      });
    } catch (e) { next(e); }
  });

  // REST Disconnect
  router.post('/api/rest/disconnect', async (req, res, next) => {
    try {
      await restClient.disconnect();
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  // REST Refresh catalog
  router.post('/api/rest/refresh', async (req, res, next) => {
    try {
      await restClient.refreshCatalog();
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  // Queue snapshot
  router.post('/api/queue/snapshot', async (req, res, next) => {
    try {
      const { skillId } = req.body;
      const snap = await restClient.getSharedSnapshot(skillId, 2, true);
      const { getSnapshotMetrics } = require('../rest/client');
      const metrics = getSnapshotMetrics(snap);
      res.json({ success: true, metrics });
    } catch (e) { next(e); }
  });

  // Automation catalog (full state for dashboard)
  router.get('/api/automation/catalog', async (req, res, next) => {
    try {
      let profiles = [], skills = [];
      if (soapClient.connected) {
        try { profiles = await soapClient.getProfiles(); } catch { profiles = []; }
        try { skills = await soapClient.getSkills(); } catch { skills = []; }
      }
      res.json({
        success: true,
        profiles,
        skills,
        queues: restClient.queues,
        agents: restClient.agents,
        domainQueues: restClient.domainQueues,
        soapConnected: soapClient.connected,
        restConnected: restClient.connected,
        restWarnings: restClient.warnings,
        restProtection: restProtection.getStatus(),
        automationSettings: settings,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        jobs: jobs.map(j => ({
          id: j.id, name: j.name, triggerType: j.triggerType, dryRun: j.dryRun, enabled: j.enabled,
          schedule: j.schedule, queue: j.queue, action: j.action,
          state: j.state
        }))
      });
    } catch (e) { next(e); }
  });

  // Jobs CRUD
  router.get('/api/jobs', (req, res) => {
    res.json({ success: true, jobs });
  });

  router.post('/api/jobs/create', (req, res, next) => {
    try {
      const job = createJob(req.body);
      if (job.triggerType === 'schedule') {
        const { initializeNextRun } = require('../engine/scheduler');
        initializeNextRun(job);
      }
      jobs.push(job);
      saveJobs(jobs);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  router.post('/api/jobs/toggle', (req, res, next) => {
    try {
      const job = findJob(jobs, req.body.id);
      if (!job) throw new Error('Job no encontrado.');
      job.enabled = Boolean(req.body.enabled);
      if (job.enabled && job.triggerType === 'schedule' && !job.state.nextRun) {
        const { initializeNextRun } = require('../engine/scheduler');
        initializeNextRun(job);
      }
      if (!job.enabled) job.state.nextRun = '';
      saveJobs(jobs);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  router.post('/api/jobs/delete', (req, res, next) => {
    try {
      removeJob(jobs, req.body.id);
      saveJobs(jobs);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  router.post('/api/jobs/run', async (req, res, next) => {
    try {
      const job = findJob(jobs, req.body.id);
      if (!job) throw new Error('Job no encontrado.');
      const { invokeJobAction } = require('../engine/actions');
      const result = await invokeJobAction(job, 'scheduled', soapClient, restClient, restProtection, settings);
      job.state.lastRun = new Date().toISOString();
      job.state.executionCount++;
      job.state.lastResult = result.message;
      saveJobs(jobs);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  // Automation settings
  router.post('/api/automation/settings', (req, res, next) => {
    try {
      Object.assign(settings, updateSettings(req.body, settings));
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  // Credentials forget
  router.post('/api/credentials/forget', (req, res, next) => {
    try {
      deleteCredential(SOAP_CREDS);
      deleteCredential(REST_CREDS);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  return router;
};

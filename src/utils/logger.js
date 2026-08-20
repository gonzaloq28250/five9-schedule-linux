const fs = require('fs');
const path = require('path');
const { LOG_DIR, todayString } = require('./helpers');

function appendCsv(filePath, headers, row) {
  const needsHeader = !fs.existsSync(filePath);
  const lines = [];
  if (needsHeader) lines.push(headers.join(','));
  const values = headers.map(h => {
    const v = row[h] ?? '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return `"${String(s).replace(/"/g, '""')}"`;
  });
  lines.push(values.join(','));
  fs.appendFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

function logSkillAudit(profileName, addedSkills, removedSkills, status, message, adminUser) {
  const logPath = path.join(LOG_DIR, `profile-skills-${todayString()}.csv`);
  const changes = [];
  for (const s of (addedSkills || [])) changes.push({ Action: 'ADD', Skill: s });
  for (const s of (removedSkills || [])) changes.push({ Action: 'REMOVE', Skill: s });
  if (changes.length === 0) changes.push({ Action: 'NONE', Skill: '' });

  const headers = ['Timestamp', 'AdminUser', 'ProfileName', 'Action', 'Skill', 'Status', 'Message'];
  for (const c of changes) {
    appendCsv(logPath, headers, {
      Timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      AdminUser: adminUser || '',
      ProfileName: profileName,
      Action: c.Action,
      Skill: c.Skill,
      Status: status,
      Message: message
    });
  }
}

function logMoveAudit(users, sourceProfile, targetProfile, status, message, adminUser) {
  const logPath = path.join(LOG_DIR, `profile-moves-${todayString()}.csv`);
  const headers = ['Timestamp', 'AdminUser', 'User', 'SourceProfile', 'TargetProfile', 'Status', 'Message'];
  for (const user of (users || [])) {
    appendCsv(logPath, headers, {
      Timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      AdminUser: adminUser || '',
      User: user,
      SourceProfile: sourceProfile,
      TargetProfile: targetProfile,
      Status: status,
      Message: message
    });
  }
}

function logAutomationJob(job, event, status, message, metrics, restRateState, settings) {
  const logPath = path.join(LOG_DIR, `automation-jobs-${todayString()}.csv`);
  const headers = ['Timestamp', 'JobId', 'JobName', 'TriggerType', 'Event', 'Status', 'Message', 'Metrics'];
  appendCsv(logPath, headers, {
    Timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    JobId: job.id,
    JobName: job.name,
    TriggerType: job.triggerType,
    Event: event,
    Status: status,
    Message: message,
    Metrics: metrics ? JSON.stringify(metrics) : ''
  });
}

function logRestProtection(event, status, message, restRateState, settings) {
  const logPath = path.join(LOG_DIR, `rest-protection-${todayString()}.csv`);
  const headers = ['Timestamp', 'Event', 'Status', 'Message', 'PauseSource', 'PausedUntil', 'RequestsLastMinute', 'InternalLimit', 'TotalRequests'];
  appendCsv(logPath, headers, {
    Timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    Event: event,
    Status: status,
    Message: message,
    PauseSource: restRateState?.pauseSource || '',
    PausedUntil: restRateState?.pausedUntil || '',
    RequestsLastMinute: restRateState ? restRateState.getRequestCount() : 0,
    InternalLimit: settings?.restMaxRequestsPerMinute || 60,
    TotalRequests: restRateState?.totalRequests || 0
  });
}

module.exports = { logSkillAudit, logMoveAudit, logAutomationJob, logRestProtection };

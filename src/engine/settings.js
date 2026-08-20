const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../utils/helpers');

const SETTINGS_PATH = path.join(DATA_DIR, 'automation-settings.json');

const DEFAULTS = {
  restMaxRequestsPerMinute: 60,
  restRateLimitFallbackSeconds: 60,
  snapshotCacheMinimumSeconds: 2,
  pollJitterPercent: 20
};

const RANGES = {
  restMaxRequestsPerMinute: { min: 10, max: 300 },
  restRateLimitFallbackSeconds: { min: 15, max: 900 },
  snapshotCacheMinimumSeconds: { min: 1, max: 30 },
  pollJitterPercent: { min: 0, max: 50 }
};

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function loadSettings() {
  const settings = { ...DEFAULTS };
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const stored = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      for (const key of Object.keys(DEFAULTS)) {
        if (stored[key] !== undefined) {
          const range = RANGES[key];
          settings[key] = clamp(Number(stored[key]) || DEFAULTS[key], range.min, range.max);
        }
      }
    } catch {
      saveSettings(settings);
    }
  } else {
    saveSettings(settings);
  }
  return settings;
}

function saveSettings(settings) {
  const payload = {
    restMaxRequestsPerMinute: settings.restMaxRequestsPerMinute,
    restRateLimitFallbackSeconds: settings.restRateLimitFallbackSeconds,
    snapshotCacheMinimumSeconds: settings.snapshotCacheMinimumSeconds,
    pollJitterPercent: settings.pollJitterPercent,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(payload, null, 2), 'utf8');
}

function updateSettings(data, current) {
  const settings = { ...current };
  if (data.restMaxRequestsPerMinute !== undefined) {
    settings.restMaxRequestsPerMinute = clamp(Number(data.restMaxRequestsPerMinute) || 60, 10, 300);
  }
  saveSettings(settings);
  return settings;
}

module.exports = { loadSettings, saveSettings, updateSettings };

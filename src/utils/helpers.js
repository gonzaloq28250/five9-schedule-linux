const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const LOG_DIR = path.join(ROOT, 'logs');

function ensureDirs() {
  for (const dir of [DATA_DIR, LOG_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function escapeXml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const WEEKDAY_MAP = {
  Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED',
  Thursday: 'THU', Friday: 'FRI', Saturday: 'SAT', Sunday: 'SUN'
};

const WEEKDAY_MAP_REVERSE = {
  MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 0
};

function getWeekdayCode(date) {
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return days[date.getDay()];
}

function getPropertyValue(obj, name, defaultValue = null) {
  if (obj === null || obj === undefined) return defaultValue;
  if (!(name in obj)) return defaultValue;
  return obj[name];
}

function toStringArray(value) {
  if (value === null || value === undefined) return [];
  const items = Array.isArray(value) ? value : [value];
  const result = [];
  for (const item of items) {
    if (item === null || item === undefined) continue;
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) result.push(trimmed);
      continue;
    }
    if (typeof item === 'object') {
      let candidate = item.id ?? item.skillId ?? null;
      if (candidate === null && item.skill) candidate = item.skill.id;
      if (candidate !== null && candidate !== undefined) {
        const s = String(candidate).trim();
        if (s) result.push(s);
      }
    }
  }
  return [...new Set(result)];
}

function todayString() {
  const d = new Date();
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

module.exports = {
  ROOT, DATA_DIR, LOG_DIR,
  ensureDirs,
  escapeXml,
  WEEKDAY_MAP, WEEKDAY_MAP_REVERSE,
  getWeekdayCode,
  getPropertyValue,
  toStringArray,
  todayString
};

const { logRestProtection } = require('../utils/logger');

class RestProtection {
  constructor(settings) {
    this.settings = settings;
    this.pausedUntil = null;
    this.pauseReason = '';
    this.pauseSource = '';
    this.requestTimestamps = [];
    this.totalRequests = 0;
    this.snapshotNetworkRequests = 0;
    this.snapshotCacheHits = 0;
    this.lastSuccessfulRequestAt = null;
    this.snapshotCache = new Map();
  }

  assertAllowed() {
    this.clearIfExpired();
    if (this.pausedUntil) {
      throw new Error(`Pausa REST activa: ${this.pauseReason}`);
    }
    this.pruneOldTimestamps();
    if (this.requestTimestamps.length >= this.settings.restMaxRequestsPerMinute) {
      const until = new Date(Date.now() + 60000);
      this.setGlobalPause(until, 'Límite interno de requests por minuto alcanzado.', 'INTERNAL', {});
      throw new Error(`Límite interno de ${this.settings.restMaxRequestsPerMinute} req/min alcanzado.`);
    }
    this.requestTimestamps.push(new Date());
    this.totalRequests++;
  }

  pruneOldTimestamps() {
    const cutoff = Date.now() - 60000;
    this.requestTimestamps = this.requestTimestamps.filter(t => t.getTime() >= cutoff);
  }

  getRequestCount() {
    this.pruneOldTimestamps();
    return this.requestTimestamps.length;
  }

  clearIfExpired() {
    if (this.pausedUntil && new Date() >= this.pausedUntil) {
      this.pausedUntil = null;
      this.pauseReason = '';
      this.pauseSource = '';
      logRestProtection('AUTO_RESUME', 'RESUMED', 'Pausa REST expirada.', this, this.settings);
    }
  }

  setGlobalPause(until, reason, source, rateInfo = {}) {
    const untilDate = until instanceof Date ? until : new Date(until);
    if (!this.pausedUntil || untilDate > this.pausedUntil) {
      this.pausedUntil = untilDate;
      this.pauseReason = reason;
      this.pauseSource = source;
      logRestProtection('PAUSE', 'PAUSED', reason, this, this.settings);
    }
  }

  extractRateLimitInfo(response) {
    const headers = response?.headers || {};
    const body = response?.data || {};
    let resetEpochSeconds = Number(body.resetEpochSeconds || 0);
    const rateLimit = body.rateLimit || '';
    const rateLimitPeriod = body.rateLimitPeriod || '';
    const rateLimitType = body.rateLimitType || '';

    let resetAt;
    if (resetEpochSeconds > 0) {
      resetAt = new Date(resetEpochSeconds * 1000);
    } else {
      const retryAfter = headers['retry-after'];
      if (retryAfter) {
        const parsed = parseInt(retryAfter, 10);
        if (!isNaN(parsed) && parsed > 0) {
          resetAt = new Date(Date.now() + parsed * 1000);
        }
      }
    }

    if (!resetAt || isNaN(resetAt.getTime())) {
      resetAt = new Date(Date.now() + this.settings.restRateLimitFallbackSeconds * 1000);
    }

    return {
      resetAt: resetAt.toISOString().slice(0, 19).replace('T', ' '),
      resetEpochSeconds,
      rateLimit,
      rateLimitPeriod,
      rateLimitType
    };
  }

  getSnapshotShared(skillId, maxAgeSeconds, forceRefresh, fetchFn) {
    const key = skillId.trim();
    if (!key) throw new Error('El skillId de la queue es obligatorio.');

    const minimumCache = this.settings.snapshotCacheMinimumSeconds;
    const allowedAge = Math.max(minimumCache, maxAgeSeconds);

    if (!forceRefresh && this.snapshotCache.has(key)) {
      const cached = this.snapshotCache.get(key);
      const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
      if (ageMs < allowedAge * 1000) {
        this.snapshotCacheHits++;
        return { snapshot: cached.snapshot, metrics: cached.metrics, fetchedAt: cached.fetchedAt, cacheHit: true };
      }
    }

    const snapshot = fetchFn();
    return Promise.resolve(snapshot).then(snap => {
      const { getSnapshotMetrics } = require('./client');
      const metrics = getSnapshotMetrics(snap);
      const record = { snapshot: snap, metrics, fetchedAt: new Date().toISOString() };
      this.snapshotCache.set(key, record);
      this.snapshotNetworkRequests++;
      return { snapshot: snap, metrics, fetchedAt: record.fetchedAt, cacheHit: false };
    });
  }

  clearSnapshotCache() {
    this.snapshotCache.clear();
  }

  getStatus() {
    this.pruneOldTimestamps();
    return {
      maxRequestsPerMinute: this.settings.restMaxRequestsPerMinute,
      requestsLastMinute: this.requestTimestamps.length,
      paused: !!this.pausedUntil,
      pausedUntil: this.pausedUntil ? this.pausedUntil.toISOString() : null,
      source: this.pauseSource || null,
      reason: this.pauseReason || null,
      snapshotNetworkRequests: this.snapshotNetworkRequests,
      snapshotCacheHits: this.snapshotCacheHits
    };
  }

  static extractRateLimitInfoFromResponse(response) {
    const headers = response?.headers || {};
    const body = response?.data || {};
    let resetEpochSeconds = Number(body.resetEpochSeconds || 0);
    const rateLimit = body.rateLimit || '';
    const rateLimitPeriod = body.rateLimitPeriod || '';
    const rateLimitType = body.rateLimitType || '';
    let resetAt;
    if (resetEpochSeconds > 0) {
      resetAt = new Date(resetEpochSeconds * 1000);
    } else {
      const retryAfter = headers['retry-after'];
      if (retryAfter) {
        const parsed = parseInt(retryAfter, 10);
        if (!isNaN(parsed) && parsed > 0) resetAt = new Date(Date.now() + parsed * 1000);
      }
    }
    return { resetEpochSeconds, rateLimit, rateLimitPeriod, rateLimitType, resetAt };
  }
}

module.exports = RestProtection;

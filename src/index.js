const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { ensureDirs, DATA_DIR } = require('./utils/helpers');
const SoapClient = require('./soap/client');
const { RestClient } = require('./rest/client');
const RestProtection = require('./rest/protection');
const { loadSettings } = require('./engine/settings');
const { loadJobs, saveJobs } = require('./engine/jobs');
const { AutomationEngine } = require('./engine/scheduler');
const createRouter = require('./api/routes');
const { loadCredential } = require('./auth/credentials');

const PORT = process.env.PORT || 8765;
const SOAP_CREDS = path.join(DATA_DIR, 'soap-credentials.json');
const REST_CREDS = path.join(DATA_DIR, 'rest-credentials.json');
const RUNTIME_PATH = path.join(DATA_DIR, 'runtime.json');

async function main() {
  ensureDirs();

  const settings = loadSettings();
  const jobs = loadJobs();
  const soapClient = new SoapClient();
  const restProtection = new RestProtection(settings);
  const restClient = new RestClient(restProtection);

  const state = { soapClient, restClient, restProtection, settings, jobs };

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(createRouter(state));

  // Error handler
  app.use((err, req, res, next) => {
    res.status(400).json({ success: false, error: err.message || 'Error interno.' });
  });

  const server = http.createServer(app);

  // Engine
  const engine = new AutomationEngine(jobs, soapClient, restClient, restProtection, settings);
  engine.start(() => () => saveJobs(jobs));

  // Runtime lock
  fs.writeFileSync(RUNTIME_PATH, JSON.stringify({
    pid: process.pid,
    port: PORT,
    startedAt: new Date().toISOString()
  }, null, 2), 'utf8');

  // Try auto-connect saved credentials
  const soapCreds = loadCredential(SOAP_CREDS);
  if (soapCreds) {
    try {
      soapClient.connect(soapCreds.dataCenter, soapCreds.apiVersion, soapCreds.username, soapCreds.password);
      await soapClient.getProfiles();
      soapClient.connected = true;
      console.log(`[SOAP] Auto-conectado como ${soapCreds.username}`);
    } catch (e) {
      console.log(`[SOAP] Auto-connect fallido: ${e.message}`);
      soapClient.disconnect();
    }
  }

  const restCreds = loadCredential(REST_CREDS);
  if (restCreds) {
    try {
      await restClient.connect(restCreds.dataCenter, restCreds.username, restCreds.password);
      console.log(`[REST] Auto-conectado como ${restCreds.username}`);
    } catch (e) {
      console.log(`[REST] Auto-connect fallido: ${e.message}`);
      restClient.connected = false;
    }
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Five9 Schedule Linux escuchando en http://0.0.0.0:${PORT}`);
  });

  const shutdown = () => {
    engine.stop();
    try { fs.unlinkSync(RUNTIME_PATH); } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

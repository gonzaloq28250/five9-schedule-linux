const knex = require('knex');
const knexConfig = require('../../knexfile');

const env = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[env]);

async function runMigrations() {
  console.log('[DB] Ejecutando migraciones...');
  const [batchNo, log] = await db.migrate.latest();
  if (log.length === 0) {
    console.log('[DB] Migraciones al día.');
  } else {
    console.log(`[DB] Batch ${batchNo}: ${log.length} migración(es) aplicada(s).`);
  }
}

async function seedAdmin() {
  const hasUsers = await db('users').first();
  if (hasUsers) return;

  const bcrypt = require('bcrypt');
  const { v4: uuid } = require('uuid');
  const id = uuid();
  const passwordHash = await bcrypt.hash('admin', 10);

  await db('users').insert({
    id,
    username: 'admin',
    email: 'admin@five9.local',
    password_hash: passwordHash,
    display_name: 'Administrador',
    is_active: true
  });

  await db('user_roles').insert({ user_id: id, role: 'admin' });
  console.log('[DB] Usuario admin creado (admin/admin).');
}

async function initDatabase() {
  await runMigrations();
  await seedAdmin();
  console.log('[DB] Base de datos lista.');
}

module.exports = { db, initDatabase };

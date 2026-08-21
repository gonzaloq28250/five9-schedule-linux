const bcrypt = require('bcrypt');
const { v4: uuid } = require('uuid');
const { db } = require('../db');

const VALID_ROLES = ['admin', 'operator', 'viewer'];

async function listUsers() {
  const users = await db('users')
    .select('id', 'username', 'email', 'display_name', 'is_active', 'created_at', 'updated_at')
    .orderBy('username');

  const roleRows = await db('user_roles').select('user_id', 'role');
  const roleMap = {};
  for (const row of roleRows) {
    if (!roleMap[row.user_id]) roleMap[row.user_id] = [];
    roleMap[row.user_id].push(row.role);
  }

  return users.map(u => ({ ...u, roles: roleMap[u.id] || [] }));
}

async function getUserById(id) {
  const user = await db('users')
    .select('id', 'username', 'email', 'display_name', 'is_active', 'created_at')
    .where('id', id)
    .first();
  if (!user) return null;

  const roles = await db('user_roles').where('user_id', id).pluck('role');
  return { ...user, roles };
}

async function getUserByUsername(username) {
  const user = await db('users').where('username', username).first();
  if (!user) return null;
  const roles = await db('user_roles').where('user_id', user.id).pluck('role');
  return { ...user, roles };
}

async function createUser({ username, email, password, displayName, roles = [] }) {
  if (!username || !email || !password) throw new Error('username, email y password son obligatorios.');
  const validRoles = roles.filter(r => VALID_ROLES.includes(r));
  if (validRoles.length === 0) validRoles.push('viewer');

  const id = uuid();
  const passwordHash = await bcrypt.hash(password, 10);

  await db('users').insert({
    id,
    username: username.toLowerCase().trim(),
    email: email.toLowerCase().trim(),
    password_hash: passwordHash,
    display_name: displayName || username,
    is_active: true
  });

  if (validRoles.length > 0) {
    await db('user_roles').insert(validRoles.map(role => ({ user_id: id, role })));
  }

  return getUserById(id);
}

async function updateUser(id, { email, displayName, isActive, roles }) {
  const updates = {};
  if (email !== undefined) updates.email = email.toLowerCase().trim();
  if (displayName !== undefined) updates.display_name = displayName;
  if (isActive !== undefined) updates.is_active = isActive;
  updates.updated_at = new Date();

  await db('users').where('id', id).update(updates);

  if (Array.isArray(roles)) {
    const validRoles = roles.filter(r => VALID_ROLES.includes(r));
    await db('user_roles').where('user_id', id).del();
    if (validRoles.length > 0) {
      await db('user_roles').insert(validRoles.map(role => ({ user_id: id, role })));
    }
  }

  return getUserById(id);
}

async function resetPassword(id, newPassword) {
  if (!newPassword || newPassword.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres.');
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db('users').where('id', id).update({ password_hash: passwordHash, updated_at: new Date() });
}

async function deleteUser(id) {
  await db('user_roles').where('user_id', id).del();
  await db('user_sessions').where('user_id', id).del();
  await db('users').where('id', id).del();
}

async function validatePassword(username, password) {
  const user = await db('users').where('username', username.toLowerCase().trim()).first();
  if (!user) return null;
  if (!user.is_active) return null;
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;
  const roles = await db('user_roles').where('user_id', user.id).pluck('role');
  return { id: user.id, username: user.username, email: user.email, display_name: user.display_name, roles };
}

module.exports = { listUsers, getUserById, getUserByUsername, createUser, updateUser, resetPassword, deleteUser, validatePassword, VALID_ROLES };

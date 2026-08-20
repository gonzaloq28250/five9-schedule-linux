const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX = process.env.FIVE9_ENCRYPTION_KEY;

function getKey() {
  if (!KEY_HEX) return null;
  const buf = Buffer.from(KEY_HEX, 'hex');
  if (buf.length !== 32) return null;
  return buf;
}

function encrypt(plaintext) {
  const key = getKey();
  if (!key) throw new Error('FIVE9_ENCRYPTION_KEY not set or invalid (must be 64 hex chars / 32 bytes)');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted.toString('hex')
  };
}

function decrypt(enc) {
  const key = getKey();
  if (!key) throw new Error('FIVE9_ENCRYPTION_KEY not set or invalid');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(enc.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(enc.authTag, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(enc.data, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

function saveCredential(filePath, data) {
  const key = getKey();
  const payload = {
    username: data.username,
    dataCenter: data.dataCenter,
    apiVersion: data.apiVersion || '',
    savedAt: new Date().toISOString()
  };
  if (key && data.password) {
    payload.password = encrypt(data.password);
  } else {
    payload.password = data.password || '';
  }
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function loadCredential(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let password = raw.password;
    if (typeof password === 'object' && password.iv && password.authTag && password.data) {
      password = decrypt(password);
    }
    return {
      username: String(raw.username || ''),
      password: String(password || ''),
      dataCenter: String(raw.dataCenter || ''),
      apiVersion: String(raw.apiVersion || '')
    };
  } catch {
    return null;
  }
}

function deleteCredential(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

module.exports = { encrypt, decrypt, saveCredential, loadCredential, deleteCredential };

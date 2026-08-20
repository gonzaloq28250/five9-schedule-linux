const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const { wrapEnvelope, buildGetUserProfiles, buildGetUserProfile, buildGetSkills, buildModifyUserProfileUserList, buildModifyUserProfileSkills } = require('./xml');

const HOST_MAP = {
  US: 'api.five9.com',
  UK: 'api.five9.eu',
  Canada: 'api.five9.ca',
  Frankfurt: 'api.eu.five9.com'
};

const VALID_VERSIONS = ['v13', 'v12', 'v11', 'v10_2', 'v10', 'v9_5', 'v9_3', 'v4', 'v3', 'v2', 'default'];

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: () => false,
  parseTagValue: true,
  trimValues: true
};

const parser = new XMLParser(parserOptions);

function extractLocal(element, localName) {
  if (!element) return null;
  for (const key of Object.keys(element)) {
    const base = key.split(':').pop();
    if (base === localName) return element[key];
  }
  return null;
}

function extractAllLocal(element, localName) {
  if (!element) return [];
  const results = [];
  for (const key of Object.keys(element)) {
    const base = key.split(':').pop();
    if (base === localName) {
      const val = element[key];
      if (Array.isArray(val)) results.push(...val);
      else results.push(val);
    }
  }
  return results;
}

function extractText(element, localName) {
  const node = extractLocal(element, localName);
  if (!node) return '';
  if (typeof node === 'string') return node.trim();
  if (typeof node === 'object' && '#text' in node) return String(node['#text']).trim();
  return String(node).trim();
}

function extractTextArray(element, localName) {
  const nodes = extractAllLocal(element, localName);
  const result = [];
  for (const node of nodes) {
    let val = '';
    if (typeof node === 'string') val = node.trim();
    else if (typeof node === 'object' && '#text' in node) val = String(node['#text']).trim();
    else val = String(node).trim();
    if (val) result.push(val);
  }
  return result.sort();
}

function findSoapFault(xmlObj) {
  const body = extractLocal(xmlObj, 'Body');
  if (!body) return null;
  const fault = extractLocal(body, 'Fault');
  if (!fault) return null;
  const faultstring = extractText(fault, 'faultstring');
  const detail = extractText(fault, 'detail');
  return [faultstring, detail].filter(Boolean).join('\n');
}

class SoapClient {
  constructor() {
    this.connected = false;
    this.apiUrl = '';
    this.headers = {};
    this.username = '';
    this.dataCenter = '';
    this.version = '';
  }

  connect(dataCenter, apiVersion, username, password) {
    const host = HOST_MAP[dataCenter];
    if (!host) throw new Error('Data center inválido.');
    if (!username || !password) throw new Error('El username y la contraseña son obligatorios.');
    if (!VALID_VERSIONS.includes(apiVersion.toLowerCase())) throw new Error('Versión de API inválida.');

    const base64 = Buffer.from(`${username}:${password}`).toString('base64');
    const url = apiVersion.toLowerCase() === 'default'
      ? `https://${host}/wsadmin/AdminWebService`
      : `https://${host}/wsadmin/${apiVersion}/AdminWebService`;

    this.apiUrl = url;
    this.headers = {
      'Authorization': `Basic ${base64}`,
      'SOAPAction': '""',
      'Accept': 'text/xml',
      'Content-Type': 'text/xml;charset=UTF-8'
    };
    this.username = username;
    this.dataCenter = dataCenter;
    this.version = apiVersion;
    this.connected = true;
  }

  disconnect() {
    this.connected = false;
    this.apiUrl = '';
    this.headers = {};
    this.username = '';
    this.dataCenter = '';
    this.version = '';
  }

  async _invoke(operationXml) {
    if (!this.connected || !this.apiUrl) {
      throw new Error('La conexión con Five9 no ha sido inicializada.');
    }
    const envelope = wrapEnvelope(operationXml);
    try {
      const response = await axios.post(this.apiUrl, envelope, {
        headers: this.headers,
        timeout: 30000,
        responseType: 'text',
        validateStatus: () => true
      });
      if (response.status >= 400) {
        let errorBody = response.data || '';
        let errorMsg = `Error HTTP de Five9: ${response.status}`;
        if (errorBody) {
          try {
            const errorXml = parser.parse(errorBody);
            const faultMsg = findSoapFault(errorXml);
            if (faultMsg) throw new Error(faultMsg);
          } catch (e) {
            if (e.message && !e.message.includes('Error HTTP')) throw e;
          }
          errorMsg += `\n${errorBody}`;
        }
        throw new Error(errorMsg);
      }
      const content = response.data;
      if (!content || !content.trim()) {
        throw new Error('Five9 devolvió una respuesta vacía.');
      }
      let xmlObj;
      try {
        xmlObj = parser.parse(content);
      } catch {
        throw new Error('Five9 devolvió una respuesta que no es XML válido.');
      }
      const faultMsg = findSoapFault(xmlObj);
      if (faultMsg) throw new Error(faultMsg);
      return xmlObj;
    } catch (err) {
      if (err.code === 'ECONNABORTED') throw new Error('Timeout de conexión con Five9.');
      throw err;
    }
  }

  _getResponseBody(xmlObj) {
    const body = extractLocal(xmlObj, 'Envelope');
    return body ? extractLocal(body, 'Body') || {} : {};
  }

  async getProfiles() {
    const xmlObj = await this._invoke(buildGetUserProfiles());
    const body = this._getResponseBody(xmlObj);
    const responseNode = extractLocal(body, 'getUserProfilesResponse');
    const returnNodes = extractAllLocal(responseNode, 'return');
    const profiles = [];
    for (const node of returnNodes) {
      const name = extractText(node, 'name');
      if (!name) continue;
      const users = extractTextArray(node, 'users');
      const skills = extractTextArray(node, 'skills');
      profiles.push({ name, userCount: users.length, skillCount: skills.length });
    }
    return profiles.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProfile(profileName) {
    const xmlObj = await this._invoke(buildGetUserProfile(profileName));
    const body = this._getResponseBody(xmlObj);
    const responseNode = extractLocal(body, 'getUserProfileResponse');
    const node = extractLocal(responseNode, 'return');
    if (!node) throw new Error(`No se encontró información para el perfil '${profileName}'.`);
    const name = extractText(node, 'name') || profileName;
    const users = extractTextArray(node, 'users');
    const skills = extractTextArray(node, 'skills');
    return { name, userCount: users.length, users, skillCount: skills.length, skills };
  }

  async getSkills() {
    const xmlObj = await this._invoke(buildGetSkills());
    const body = this._getResponseBody(xmlObj);
    const responseNode = extractLocal(body, 'getSkillsResponse');
    const returnNodes = extractAllLocal(responseNode, 'return');
    const skills = [];
    for (const node of returnNodes) {
      const name = extractText(node, 'name');
      if (!name) continue;
      const description = extractText(node, 'description');
      let id = null;
      const idText = extractText(node, 'id');
      if (idText) {
        const parsed = parseInt(idText, 10);
        if (!isNaN(parsed)) id = parsed;
      }
      skills.push({ name, description, id });
    }
    return skills.sort((a, b) => a.name.localeCompare(b.name));
  }

  async modifyProfileUsers(profileName, addUsers = [], removeUsers = []) {
    const addList = addUsers.filter(u => u && u.trim());
    const removeList = removeUsers.filter(u => u && u.trim());
    if (addList.length === 0 && removeList.length === 0) {
      throw new Error('Debes indicar al menos un usuario para agregar o remover.');
    }
    await this._invoke(buildModifyUserProfileUserList(profileName, addList, removeList));
  }

  async modifyProfileSkills(profileName, addSkills = [], removeSkills = []) {
    const addList = [...new Set(addSkills.filter(s => s && s.trim()))];
    const removeList = [...new Set(removeSkills.filter(s => s && s.trim()))];
    if (addList.length === 0 && removeList.length === 0) {
      throw new Error('Debes indicar al menos un skill para agregar o remover.');
    }
    await this._invoke(buildModifyUserProfileSkills(profileName, addList, removeList));
  }
}

module.exports = SoapClient;

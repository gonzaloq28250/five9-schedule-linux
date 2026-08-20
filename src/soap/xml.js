const { escapeXml } = require('../utils/helpers');

const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/';
const SERVICE_NS = 'http://service.admin.ws.five9.com/';

function wrapEnvelope(operationXml) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="${SOAP_NS}" xmlns:ser="${SERVICE_NS}">
  <soapenv:Header/>
  <soapenv:Body>
${operationXml}
  </soapenv:Body>
</soapenv:Envelope>`;
}

function buildGetUserProfiles() {
  return `<ser:getUserProfiles>
  <userProfileNamePatern>.*</userProfileNamePatern>
</ser:getUserProfiles>`;
}

function buildGetUserProfile(profileName) {
  return `<ser:getUserProfile>
  <userProfileName>${escapeXml(profileName)}</userProfileName>
</ser:getUserProfile>`;
}

function buildGetSkills() {
  return `<ser:getSkills>
  <skillNamePattern>.*</skillNamePattern>
</ser:getSkills>`;
}

function buildModifyUserProfileUserList(profileName, addUsers, removeUsers) {
  const lines = ['<ser:modifyUserProfileUserList>'];
  lines.push(`  <userProfileName>${escapeXml(profileName)}</userProfileName>`);
  for (const u of addUsers) lines.push(`  <addUsers>${escapeXml(u)}</addUsers>`);
  for (const u of removeUsers) lines.push(`  <removeUsers>${escapeXml(u)}</removeUsers>`);
  lines.push('</ser:modifyUserProfileUserList>');
  return lines.join('\n');
}

function buildModifyUserProfileSkills(profileName, addSkills, removeSkills) {
  const lines = ['<ser:modifyUserProfileSkills>'];
  lines.push(`  <userProfileName>${escapeXml(profileName)}</userProfileName>`);
  for (const s of addSkills) lines.push(`  <addSkills>${escapeXml(s)}</addSkills>`);
  for (const s of removeSkills) lines.push(`  <removeSkills>${escapeXml(s)}</removeSkills>`);
  lines.push('</ser:modifyUserProfileSkills>');
  return lines.join('\n');
}

module.exports = {
  wrapEnvelope,
  buildGetUserProfiles,
  buildGetUserProfile,
  buildGetSkills,
  buildModifyUserProfileUserList,
  buildModifyUserProfileSkills
};

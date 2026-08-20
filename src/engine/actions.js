const { getPropertyValue } = require('../utils/helpers');
const { logAutomationJob } = require('../utils/logger');

function getJobActionAgents(action) {
  const resolved = [];
  const rawAgents = getPropertyValue(action, 'agents', null);

  if (rawAgents) {
    for (const item of (Array.isArray(rawAgents) ? rawAgents : [rawAgents])) {
      const id = String(getPropertyValue(item, 'id', '') || getPropertyValue(item, 'agentId', '')).trim();
      if (!id) continue;
      const name = String(getPropertyValue(item, 'name', '') || getPropertyValue(item, 'agentName', '') || id).trim();
      let priority = 9999;
      const pv = getPropertyValue(item, 'priority', 9999);
      const parsed = parseInt(String(pv), 10);
      if (!isNaN(parsed)) priority = parsed;
      resolved.push({ id, name: name || id, priority });
    }
  }

  if (resolved.length === 0) {
    const legacyId = String(getPropertyValue(action, 'agentId', '')).trim();
    if (legacyId) {
      const legacyName = String(getPropertyValue(action, 'agentName', '') || legacyId).trim();
      resolved.push({ id: legacyId, name: legacyName || legacyId, priority: 1 });
    }
  }

  const seen = new Set();
  return resolved
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
    .filter(a => {
      const key = a.id.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function invokeJobAction(job, direction, soapClient, restClient, restProtection, settings) {
  const action = job.action;
  const actionType = action.type;
  const dryRun = Boolean(getPropertyValue(job, 'dryRun', false));

  if (dryRun) {
    const message = 'DRY RUN: la accion no fue enviada a Five9.';
    logAutomationJob(job, direction, 'DRY_RUN', message, job.state.lastMetrics, restProtection, settings);
    return { success: true, message };
  }

  if (actionType === 'profile_skill') {
    if (!soapClient.connected) throw new Error('Se requiere conexion SOAP.');
    let operation = String(getPropertyValue(action, 'operation', 'add'));
    if (direction === 'recover') operation = operation === 'add' ? 'remove' : 'add';

    const payload = {
      profileName: String(action.profileName),
      addSkills: operation === 'add' ? [...(action.skills || [])] : [],
      removeSkills: operation === 'remove' ? [...(action.skills || [])] : []
    };
    const result = await setProfileSkills(payload, soapClient);
    return { success: result.verificationOk, message: result.message };
  }

  if (actionType === 'move_users') {
    if (!soapClient.connected) throw new Error('Se requiere conexion SOAP.');
    let source = String(action.sourceProfile);
    let target = String(action.targetProfile);
    if (direction === 'recover') { const tmp = source; source = target; target = tmp; }

    const result = await moveUsers({ sourceProfile: source, targetProfile: target, users: [...(action.users || [])] }, soapClient);
    return { success: result.verificationOk, message: result.message };
  }

  if (actionType === 'agent_active_skill') {
    if (!restClient.connected) throw new Error('El job necesita una conexion Supervisor REST activa.');

    const agents = getJobActionAgents(action);
    if (agents.length === 0) throw new Error('La accion de active queue no tiene agentes seleccionados.');

    const skillId = String(action.skillId);
    const operation = String(getPropertyValue(action, 'operation', 'add'));

    // Pending rollback handling
    if (direction !== 'recover' && job.state.pendingActiveSkillRollback) {
      const pendingSnapshots = job.state.originalActiveSkillsByAgent || [];
      const pendingFailures = [];
      for (const snap of pendingSnapshots) {
        const pAgentId = String(getPropertyValue(snap, 'agentId', ''));
        const pAgentName = String(getPropertyValue(snap, 'agentName', '') || pAgentId);
        const pOriginal = getPropertyValue(snap, 'skillIds', []);
        try { await restClient.setActiveSkills(pAgentId, pOriginal); }
        catch (e) { pendingFailures.push(`${pAgentName}: ${e.message}`); }
      }
      if (pendingFailures.length > 0) {
        return { success: false, message: 'Existe un rollback multiagente pendiente y todavia no pudo completarse. ' + pendingFailures.join(' | ') };
      }
      job.state.originalActiveSkills = [];
      job.state.originalActiveSkillsByAgent = [];
      job.state.hasOriginalActiveSkillsSnapshot = false;
      job.state.pendingActiveSkillRollback = false;
      return { success: false, message: 'Rollback multiagente pendiente completado. La activacion se reintentara en el proximo ciclo seguro.' };
    }

    // Recovery
    if (direction === 'recover') {
      let snapshots = job.state.originalActiveSkillsByAgent || [];
      if (snapshots.length === 0 && job.state.hasOriginalActiveSkillsSnapshot && agents.length === 1) {
        snapshots = [{ agentId: agents[0].id, agentName: agents[0].name, priority: 1, skillIds: [...(job.state.originalActiveSkills || [])] }];
      }
      if (snapshots.length === 0 || !job.state.hasOriginalActiveSkillsSnapshot) {
        throw new Error('No existe un snapshot de active skills para restaurar de forma segura.');
      }
      const failures = [];
      for (const snap of [...snapshots].sort((a, b) => (a.priority || 9999) - (b.priority || 9999))) {
        const aId = String(getPropertyValue(snap, 'agentId', ''));
        const aName = String(getPropertyValue(snap, 'agentName', '') || aId);
        const original = getPropertyValue(snap, 'skillIds', []);
        try { await restClient.setActiveSkills(aId, original); }
        catch (e) { failures.push(`${aName}: ${e.message}`); }
      }
      if (failures.length > 0) {
        return { success: false, message: 'No se pudieron restaurar todos los agentes. ' + failures.join(' | ') };
      }
      job.state.originalActiveSkills = [];
      job.state.originalActiveSkillsByAgent = [];
      job.state.hasOriginalActiveSkillsSnapshot = false;
      job.state.pendingActiveSkillRollback = false;
      return { success: true, message: `Active queues restauradas para ${snapshots.length} agente(s).` };
    }

    // Activation: capture snapshots
    const { getAgentActiveSkillIds } = require('../rest/client');
    const snapshots = [];
    for (const agent of agents) {
      const agentInfo = await restClient.getAgent(agent.id);
      const current = getAgentActiveSkillIds(agentInfo);
      snapshots.push({ agentId: agent.id, agentName: agent.name, priority: agent.priority, skillIds: [...current] });
    }

    job.state.originalActiveSkillsByAgent = snapshots;
    job.state.originalActiveSkills = snapshots.length === 1 ? [...snapshots[0].skillIds] : [];
    job.state.hasOriginalActiveSkillsSnapshot = true;
    job.state.pendingActiveSkillRollback = false;

    const completed = [];
    try {
      for (const agent of agents) {
        const snapshot = snapshots.find(s => s.agentId === agent.id);
        if (!snapshot) throw new Error(`No se encontro el snapshot original del agente ${agent.name}.`);
        const current = [...(snapshot.skillIds || [])];
        const desired = operation === 'add' ? [...new Set([...current, skillId])] : current.filter(id => id !== skillId);
        await restClient.setActiveSkills(agent.id, desired);
        completed.push(agent);
      }
    } catch (err) {
      const primaryError = err.message;
      const rollbackFailures = [];
      for (const agent of [...completed].sort((a, b) => b.priority - a.priority)) {
        const snapshot = snapshots.find(s => s.agentId === agent.id);
        try { await restClient.setActiveSkills(agent.id, [...(snapshot.skillIds || [])]); }
        catch (e) { rollbackFailures.push(`${agent.name}: ${e.message}`); }
      }
      if (rollbackFailures.length === 0) {
        job.state.originalActiveSkills = [];
        job.state.originalActiveSkillsByAgent = [];
        job.state.hasOriginalActiveSkillsSnapshot = false;
        job.state.pendingActiveSkillRollback = false;
        return { success: false, message: `La accion multiagente fallo y los agentes ya modificados fueron restaurados. Error: ${primaryError}` };
      }
      job.state.pendingActiveSkillRollback = true;
      return { success: false, message: `La accion multiagente fallo y el rollback quedo pendiente. Error: ${primaryError}. Rollback: ${rollbackFailures.join(' | ')}` };
    }

    return { success: true, message: `Active queues actualizadas para ${agents.length} agente(s) en orden de prioridad.`, agents };
  }

  throw new Error(`Tipo de accion no soportado: ${actionType}`);
}

async function moveUsers(payload, soapClient) {
  const sourceProfile = String(payload.sourceProfile).trim();
  const targetProfile = String(payload.targetProfile).trim();
  const requestedUsers = [...new Set((payload.users || []).map(u => String(u).trim()).filter(Boolean))];

  if (!sourceProfile || !targetProfile) throw new Error('Debes indicar el perfil origen y el perfil destino.');
  if (sourceProfile.toLowerCase() === targetProfile.toLowerCase()) throw new Error('El perfil origen y el perfil destino no pueden ser el mismo.');
  if (requestedUsers.length === 0) throw new Error('Debes seleccionar al menos un usuario.');

  const sourceBefore = await soapClient.getProfile(sourceProfile);
  const targetBefore = await soapClient.getProfile(targetProfile);

  const validUsers = requestedUsers.filter(u => sourceBefore.users.some(su => su.toLowerCase() === u.toLowerCase()));
  const notInSource = requestedUsers.filter(u => !sourceBefore.users.some(su => su.toLowerCase() === u.toLowerCase()));
  const alreadyInTarget = validUsers.filter(u => targetBefore.users.some(tu => tu.toLowerCase() === u.toLowerCase()));
  const usersToMove = validUsers.filter(u => !alreadyInTarget.some(a => a.toLowerCase() === u.toLowerCase()));

  if (usersToMove.length === 0) {
    return { success: true, movedUsers: [], skippedUsers: alreadyInTarget, notInSource, verificationOk: true, message: 'No habia usuarios pendientes de mover.' };
  }

  try {
    await soapClient.modifyProfileUsers(sourceProfile, [], usersToMove);
  } catch (err) {
    throw new Error(`No se pudieron remover los usuarios del perfil origen: ${err.message}`);
  }

  try {
    await soapClient.modifyProfileUsers(targetProfile, usersToMove, []);
  } catch (err) {
    const targetError = err.message;
    try {
      await soapClient.modifyProfileUsers(sourceProfile, usersToMove, []);
      throw new Error(`Fallo la asignacion al destino. El rollback fue completado: ${targetError}`);
    } catch (rollbackErr) {
      if (rollbackErr.message.includes('rollback fue completado')) throw rollbackErr;
      throw new Error(`ERROR CRITICO: fallo el destino y tambien el rollback. Destino: ${targetError}. Rollback: ${rollbackErr.message}`);
    }
  }

  const sourceAfter = await soapClient.getProfile(sourceProfile);
  const targetAfter = await soapClient.getProfile(targetProfile);
  const verificationFailures = usersToMove.filter(u =>
    sourceAfter.users.some(su => su.toLowerCase() === u.toLowerCase()) ||
    !targetAfter.users.some(tu => tu.toLowerCase() === u.toLowerCase())
  );

  return {
    success: verificationFailures.length === 0,
    movedUsers: usersToMove,
    skippedUsers: alreadyInTarget,
    notInSource,
    verificationFailures,
    verificationOk: verificationFailures.length === 0,
    sourceAfterCount: sourceAfter.userCount,
    targetAfterCount: targetAfter.userCount,
    message: verificationFailures.length === 0 ? 'Movimiento completado y verificado.' : 'Five9 recibio los cambios, pero la verificacion detecto inconsistencias.'
  };
}

async function setProfileSkills(payload, soapClient) {
  const profileName = String(payload.profileName).trim();
  if (!profileName) throw new Error('Debes indicar el User Profile que deseas modificar.');

  const requestedAdd = [...new Set((payload.addSkills || []).map(s => String(s).trim()).filter(Boolean))];
  const requestedRemove = [...new Set((payload.removeSkills || []).map(s => String(s).trim()).filter(Boolean))];
  if (requestedAdd.length === 0 && requestedRemove.length === 0) throw new Error('Selecciona al menos un skill para agregar o remover.');

  const profileBefore = await soapClient.getProfile(profileName);
  const allSkills = await soapClient.getSkills();
  const allSkillNames = allSkills.map(s => s.name.toLowerCase());

  const unknownSkills = requestedAdd.filter(s => !allSkillNames.includes(s.toLowerCase()));
  if (unknownSkills.length > 0) throw new Error(`Estos skills no existen en el dominio: ${unknownSkills.join(', ')}`);

  const addSkills = requestedAdd.filter(s => !profileBefore.skills.some(ps => ps.toLowerCase() === s.toLowerCase()));
  const removeSkills = requestedRemove.filter(s => profileBefore.skills.some(ps => ps.toLowerCase() === s.toLowerCase()));
  const skippedAlreadyAssigned = requestedAdd.filter(s => profileBefore.skills.some(ps => ps.toLowerCase() === s.toLowerCase()));
  const skippedNotAssigned = requestedRemove.filter(s => !profileBefore.skills.some(ps => ps.toLowerCase() === s.toLowerCase()));

  if (addSkills.length === 0 && removeSkills.length === 0) {
    return { success: true, verificationOk: true, addedSkills: [], removedSkills: [], skippedAlreadyAssigned, skippedNotAssigned, profile: profileBefore, message: 'No habia cambios pendientes para aplicar.' };
  }

  try {
    await soapClient.modifyProfileSkills(profileName, addSkills, removeSkills);
  } catch (err) {
    throw new Error(`Five9 no pudo actualizar los skills del perfil: ${err.message}`);
  }

  const profileAfter = await soapClient.getProfile(profileName);
  const failedAdditions = addSkills.filter(s => !profileAfter.skills.some(ps => ps.toLowerCase() === s.toLowerCase()));
  const failedRemovals = removeSkills.filter(s => profileAfter.skills.some(ps => ps.toLowerCase() === s.toLowerCase()));
  const verificationOk = failedAdditions.length === 0 && failedRemovals.length === 0;

  if (verificationOk) {
    return { success: true, verificationOk: true, addedSkills: addSkills, removedSkills: removeSkills, skippedAlreadyAssigned, skippedNotAssigned, profile: profileAfter, message: 'Skills actualizados y verificados.' };
  }

  // Rollback
  const skillsToRestore = profileBefore.skills.filter(s => !profileAfter.skills.some(ps => ps.toLowerCase() === s.toLowerCase()));
  const skillsToRemoveForRollback = profileAfter.skills.filter(s => !profileBefore.skills.some(ps => ps.toLowerCase() === s.toLowerCase()));
  let rollbackOk = false;
  let rollbackMessage = '';

  try {
    if (skillsToRestore.length > 0 || skillsToRemoveForRollback.length > 0) {
      await soapClient.modifyProfileSkills(profileName, skillsToRestore, skillsToRemoveForRollback);
      const profileRollback = await soapClient.getProfile(profileName);
      const rbFailedAdd = skillsToRestore.filter(s => !profileRollback.skills.some(ps => ps.toLowerCase() === s.toLowerCase()));
      const rbFailedRem = skillsToRemoveForRollback.filter(s => profileRollback.skills.some(ps => ps.toLowerCase() === s.toLowerCase()));
      rollbackOk = rbFailedAdd.length === 0 && rbFailedRem.length === 0;
      rollbackMessage = rollbackOk ? 'Rollback completado.' : 'Rollback intentado con inconsistencias.';
    } else {
      rollbackOk = true;
      rollbackMessage = 'No hubo cambios que revertir.';
    }
  } catch (rbErr) {
    rollbackOk = false;
    rollbackMessage = `Rollback fallo: ${rbErr.message}`;
  }

  return {
    success: false,
    verificationOk: false,
    addedSkills: addSkills.filter(s => !failedAdditions.includes(s)),
    removedSkills: removeSkills.filter(s => !failedRemovals.includes(s)),
    rollbackOk,
    profile: profileAfter,
    message: `Verificacion inconsistente. ${rollbackMessage}`
  };
}

module.exports = { invokeJobAction, moveUsers, setProfileSkills, getJobActionAgents };

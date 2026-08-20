(() => {
  const automationState = {
    catalog: null,
    jobs: [],
    refreshTimer: null,
    rateCountdownTimer: null,
    loading: false,
    moveSourceProfileName: "",
    moveSourceLoaded: false,
    moveSourceUsers: [],
    selectedMoveUsers: [],
    selectedActiveAgentIds: []
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  const el = {
    section: $("#automationSection"),
    jumpButton: $("#automationJumpButton"),
    soapStatus: $("#automationSoapStatus"),
    restStatus: $("#automationRestStatus"),
    jobsCount: $("#automationJobsCount"),
    enabledCount: $("#automationEnabledCount"),
    nextRun: $("#automationNextRun"),
    nextRunJob: $("#automationNextRunJob"),
    timezone: $("#engineTimezone"),
    jobName: $("#jobName"),
    triggerType: $("#jobTriggerType"),
    actionType: $("#jobActionType"),
    scheduleFields: $("#scheduleTriggerFields"),
    queueFields: $("#queueTriggerFields"),
    recurrence: $("#jobRecurrence"),
    dateField: $("#jobDateField"),
    date: $("#jobDate"),
    time: $("#jobTime"),
    graceMinutes: $("#jobGraceMinutes"),
    weekdays: $("#jobWeekdays"),
    queue: $("#jobQueue"),
    activateAt: $("#jobActivateAt"),
    recoverAt: $("#jobRecoverAt"),
    persistence: $("#jobPersistence"),
    recovery: $("#jobRecovery"),
    pollSeconds: $("#jobPollSeconds"),
    cooldownSeconds: $("#jobCooldownSeconds"),
    testQueueButton: $("#testQueueButton"),
    queueSnapshotResult: $("#queueSnapshotResult"),
    profileSkillFields: $("#profileSkillActionFields"),
    moveUsersFields: $("#moveUsersActionFields"),
    activeSkillFields: $("#activeSkillActionFields"),
    profile: $("#jobProfile"),
    profileSkillOperation: $("#jobProfileSkillOperation"),
    skills: $("#jobSkills"),
    sourceProfile: $("#jobSourceProfile"),
    targetProfile: $("#jobTargetProfile"),
    moveUserSearch: $("#jobMoveUserSearch"),
    moveAvailableUsers: $("#jobMoveAvailableUsers"),
    moveSelectVisible: $("#jobMoveSelectVisible"),
    moveClearUsers: $("#jobMoveClearUsers"),
    moveSelectedCount: $("#jobMoveSelectedCount"),
    activeSkill: $("#jobActiveSkill"),
    activeOperation: $("#jobActiveOperation"),
    activeAgentSearch: $("#jobActiveAgentSearch"),
    activeAvailableAgents: $("#jobActiveAvailableAgents"),
    activeSelectedAgents: $("#jobActiveSelectedAgents"),
    activeClearAgents: $("#jobActiveClearAgents"),
    activeSelectedCount: $("#jobActiveSelectedCount"),
    dryRun: $("#jobDryRun"),
    enabled: $("#jobEnabled"),
    resetButton: $("#resetJobFormButton"),
    createButton: $("#createJobButton"),
    refreshJobsButton: $("#refreshJobsButton"),
    jobsList: $("#jobsList"),
    restDataCenter: $("#restDataCenter"),
    restUsername: $("#restUsername"),
    restPassword: $("#restPassword"),
    restSave: $("#saveRestCredentials"),
    restConnectButton: $("#restConnectButton"),
    restDisconnectButton: $("#restDisconnectButton"),
    restIndicator: $("#restConnectionIndicator"),
    restDetails: $("#restConnectionDetails"),
    restWarning: $("#restConnectionWarning"),
    rateStatus: $("#automationRateStatus"),
    rateDetails: $("#automationRateDetails"),
    restProtectionState: $("#restProtectionState"),
    restProtectionBadge: $("#restProtectionBadge"),
    restProtectionMessage: $("#restProtectionMessage"),
    restRequestsMinute: $("#restRequestsMinute"),
    restSnapshotRequests: $("#restSnapshotRequests"),
    restSnapshotCacheHits: $("#restSnapshotCacheHits"),
    restMaxRequestsPerMinute: $("#restMaxRequestsPerMinute"),
    saveRestProtectionButton: $("#saveRestProtectionButton"),
    calculatorButton: $("#apiCalculatorButton"),
    calculatorModal: $("#apiCalculatorModal"),
    closeCalculatorButton: $("#closeApiCalculatorButton"),
    closeCalculatorFooterButton: $("#closeApiCalculatorFooterButton"),
    resetCalculatorButton: $("#resetApiCalculatorButton"),
    loadCurrentJobsCalculator: $("#loadCurrentJobsCalculator"),
    calcQueueJobs: $("#calcQueueJobs"),
    calcDistinctQueues: $("#calcDistinctQueues"),
    calcPollSeconds: $("#calcPollSeconds"),
    calcHoursDay: $("#calcHoursDay"),
    calcInternalLimit: $("#calcInternalLimit"),
    calcActiveActivations: $("#calcActiveActivations"),
    calcActiveRecoveries: $("#calcActiveRecoveries"),
    calcAgentsPerEvent: $("#calcAgentsPerEvent"),
    calcProfileSkillChanges: $("#calcProfileSkillChanges"),
    calcProfileMoves: $("#calcProfileMoves"),
    calcUiOpenHours: $("#calcUiOpenHours"),
    calcRestResultCard: $("#calcRestResultCard"),
    calcRestPerMinute: $("#calcRestPerMinute"),
    calcRestDetail: $("#calcRestDetail"),
    calcRestDayCard: $("#calcRestDayCard"),
    calcRestPerDay: $("#calcRestPerDay"),
    calcRestActionDetail: $("#calcRestActionDetail"),
    calcSoapQueryCard: $("#calcSoapQueryCard"),
    calcSoapQueries: $("#calcSoapQueries"),
    calcSoapQueryPercent: $("#calcSoapQueryPercent"),
    calcSoapModifyCard: $("#calcSoapModifyCard"),
    calcSoapModifies: $("#calcSoapModifies"),
    calcSoapModifyPercent: $("#calcSoapModifyPercent"),
    calcRecommendation: $("#calcRecommendation")
  };

  function valueOf(object, ...names) {
    for (const name of names) {
      const value = object?.[name];
      if (value !== undefined && value !== null && String(value) !== "") return value;
    }
    return "";
  }

  function queueId(queue) {
    return String(valueOf(queue, "id", "skillId", "queueId")).trim();
  }

  function queueName(queue) {
    return String(valueOf(queue, "name", "skillName", "queueName")).trim();
  }

  function validQueues(queues) {
    return (queues || []).filter(queue => queueId(queue) || queueName(queue));
  }

  function validAgents(agents) {
    return (agents || []).filter(agent => agentId(agent) || valueOf(agent, "userName", "username", "login"));
  }

  function agentId(agent) {
    return String(valueOf(agent, "id", "agentId", "userId"));
  }

  function agentName(agent) {
    const username = String(valueOf(agent, "userName", "username", "login"));
    const fullName = [valueOf(agent, "firstName"), valueOf(agent, "lastName")]
      .filter(Boolean)
      .join(" ")
      .trim();
    return fullName ? `${fullName} · ${username || agentId(agent)}` : username || agentId(agent);
  }


  function moveUserKey(user) {
    return String(user || "").trim().toLowerCase();
  }

  async function loadMoveSourceUsers(profileName, { force = false } = {}) {
    const name = String(profileName || "").trim();
    if (!name) {
      automationState.moveSourceProfileName = "";
      automationState.moveSourceLoaded = false;
      automationState.moveSourceUsers = [];
      automationState.selectedMoveUsers = [];
      renderMoveUserPicker();
      return;
    }

    if (!force && automationState.moveSourceProfileName === name && automationState.moveSourceLoaded) {
      renderMoveUserPicker();
      return;
    }

    try {
      const result = await api(`/api/profile?name=${encodeURIComponent(name)}`);
      automationState.moveSourceProfileName = name;
      automationState.moveSourceLoaded = true;
      automationState.moveSourceUsers = [...(result.profile?.users || [])].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
      const valid = new Set(automationState.moveSourceUsers.map(moveUserKey));
      automationState.selectedMoveUsers = automationState.selectedMoveUsers.filter(user => valid.has(moveUserKey(user)));
      renderMoveUserPicker();
    } catch (error) {
      automationState.moveSourceProfileName = name;
      automationState.moveSourceLoaded = false;
      automationState.moveSourceUsers = [];
      automationState.selectedMoveUsers = [];
      renderMoveUserPicker(error.message);
      throw error;
    }
  }

  function moveUserIsSelected(user) {
    const key = moveUserKey(user);
    return automationState.selectedMoveUsers.some(item => moveUserKey(item) === key);
  }

  function toggleMoveUser(user, selected) {
    const key = moveUserKey(user);
    automationState.selectedMoveUsers = automationState.selectedMoveUsers.filter(item => moveUserKey(item) !== key);
    if (selected) automationState.selectedMoveUsers.push(user);
    renderMoveUserPicker();
  }

  function renderMoveUserPicker(errorMessage = "") {
    if (!el.moveAvailableUsers) return;
    const query = (el.moveUserSearch?.value || "").trim().toLowerCase();
    const users = automationState.moveSourceUsers.filter(user => user.toLowerCase().includes(query));
    const targetProfile = el.targetProfile?.value || "";

    if (el.moveSelectedCount) {
      el.moveSelectedCount.textContent = `${automationState.selectedMoveUsers.length} seleccionado${automationState.selectedMoveUsers.length === 1 ? "" : "s"}`;
    }

    if (errorMessage) {
      el.moveAvailableUsers.innerHTML = `<div class="picker-empty"><strong>No se pudo cargar el perfil</strong><span>${escapeHtml(errorMessage)}</span></div>`;
      return;
    }
    if (!automationState.moveSourceProfileName) {
      el.moveAvailableUsers.innerHTML = `<div class="picker-empty"><strong>Selecciona un perfil origen</strong><span>Los agentes se cargarán desde Five9.</span></div>`;
      return;
    }
    if (!automationState.moveSourceUsers.length) {
      el.moveAvailableUsers.innerHTML = `<div class="picker-empty"><strong>Perfil sin agentes</strong><span>No hay usuarios para seleccionar.</span></div>`;
      return;
    }
    if (!users.length) {
      el.moveAvailableUsers.innerHTML = `<div class="picker-empty"><strong>Sin coincidencias</strong><span>Cambia el filtro de búsqueda.</span></div>`;
      return;
    }

    el.moveAvailableUsers.innerHTML = users.map(user => {
      const selected = moveUserIsSelected(user);
      return `
        <label class="job-agent-row ${selected ? "selected" : ""}">
          <input type="checkbox" data-move-user="${escapeHtml(user)}" ${selected ? "checked" : ""}>
          <span class="job-agent-row-copy"><strong>${escapeHtml(user)}</strong><small>${escapeHtml(automationState.moveSourceProfileName)} → ${escapeHtml(targetProfile || "destino")}</small></span>
          <span class="selection-order">${selected ? "✓" : ""}</span>
        </label>`;
    }).join("");

    el.moveAvailableUsers.querySelectorAll("[data-move-user]").forEach(input => {
      input.addEventListener("change", event => toggleMoveUser(event.target.dataset.moveUser, event.target.checked));
    });
  }

  function activeAgentsCatalog() {
    return validAgents(automationState.catalog?.agents || []);
  }

  function activeAgentById(id) {
    return activeAgentsCatalog().find(agent => agentId(agent) === String(id));
  }

  function renderActiveAgentPicker() {
    if (!el.activeAvailableAgents || !el.activeSelectedAgents) return;
    const agents = activeAgentsCatalog();
    const availableIds = new Set(agents.map(agentId));
    automationState.selectedActiveAgentIds = automationState.selectedActiveAgentIds.filter(id => availableIds.has(String(id)));
    const selectedSet = new Set(automationState.selectedActiveAgentIds.map(String));
    const query = (el.activeAgentSearch?.value || "").trim().toLowerCase();
    const filtered = agents.filter(agent => agentName(agent).toLowerCase().includes(query));

    if (el.activeSelectedCount) {
      el.activeSelectedCount.textContent = `${automationState.selectedActiveAgentIds.length} seleccionado${automationState.selectedActiveAgentIds.length === 1 ? "" : "s"}`;
    }

    if (!automationState.catalog?.restConnected) {
      el.activeAvailableAgents.innerHTML = `<div class="picker-empty"><strong>Supervisor REST requerido</strong><span>Conecta REST para cargar los agentes y sus IDs.</span></div>`;
    } else if (!filtered.length) {
      el.activeAvailableAgents.innerHTML = `<div class="picker-empty"><strong>Sin agentes</strong><span>No hay agentes visibles con ese filtro.</span></div>`;
    } else {
      el.activeAvailableAgents.innerHTML = filtered.map(agent => {
        const id = agentId(agent);
        const selected = selectedSet.has(id);
        return `
          <label class="job-agent-row ${selected ? "selected" : ""}">
            <input type="checkbox" data-active-agent="${escapeHtml(id)}" ${selected ? "checked" : ""}>
            <span class="job-agent-row-copy"><strong>${escapeHtml(agentName(agent))}</strong><small>ID ${escapeHtml(id)}</small></span>
          </label>`;
      }).join("");
      el.activeAvailableAgents.querySelectorAll("[data-active-agent]").forEach(input => {
        input.addEventListener("change", event => {
          const id = String(event.target.dataset.activeAgent);
          automationState.selectedActiveAgentIds = automationState.selectedActiveAgentIds.filter(item => String(item) !== id);
          if (event.target.checked) automationState.selectedActiveAgentIds.push(id);
          renderActiveAgentPicker();
        });
      });
    }

    if (!automationState.selectedActiveAgentIds.length) {
      el.activeSelectedAgents.innerHTML = `<div class="picker-empty"><strong>Sin agentes seleccionados</strong><span>Selecciona agentes a la izquierda. Podrás ordenar la prioridad aquí.</span></div>`;
      return;
    }

    el.activeSelectedAgents.innerHTML = automationState.selectedActiveAgentIds.map((id, index) => {
      const agent = activeAgentById(id);
      const label = agent ? agentName(agent) : id;
      return `
        <div class="priority-agent-row" data-priority-agent="${escapeHtml(id)}">
          <span class="priority-number">${index + 1}</span>
          <span class="priority-agent-copy"><strong>${escapeHtml(label)}</strong><small>Prioridad ${index + 1}</small></span>
          <div class="priority-controls">
            <button type="button" data-priority-up title="Subir prioridad" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" data-priority-down title="Bajar prioridad" ${index === automationState.selectedActiveAgentIds.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" data-priority-remove title="Quitar">×</button>
          </div>
        </div>`;
    }).join("");

    el.activeSelectedAgents.querySelectorAll("[data-priority-agent]").forEach(row => {
      const id = row.dataset.priorityAgent;
      row.querySelector("[data-priority-up]")?.addEventListener("click", () => moveActiveAgentPriority(id, -1));
      row.querySelector("[data-priority-down]")?.addEventListener("click", () => moveActiveAgentPriority(id, 1));
      row.querySelector("[data-priority-remove]")?.addEventListener("click", () => {
        automationState.selectedActiveAgentIds = automationState.selectedActiveAgentIds.filter(item => String(item) !== String(id));
        renderActiveAgentPicker();
      });
    });
  }

  function moveActiveAgentPriority(id, direction) {
    const index = automationState.selectedActiveAgentIds.findIndex(item => String(item) === String(id));
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= automationState.selectedActiveAgentIds.length) return;
    const next = [...automationState.selectedActiveAgentIds];
    [next[index], next[target]] = [next[target], next[index]];
    automationState.selectedActiveAgentIds = next;
    renderActiveAgentPicker();
  }

  function setDefaultDate() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const today = local.toISOString().slice(0, 10);
    el.date.value = today;
    el.date.min = today;
  }

  function optionMarkup(value, label) {
    return `<option value="${escapeHtml(String(value))}">${escapeHtml(String(label))}</option>`;
  }

  function populateSelect(select, items, getValue, getLabel, { preserve = true, emptyLabel = "Sin opciones disponibles" } = {}) {
    if (!select) return;
    const previous = preserve ? select.value : "";
    if (!items?.length) {
      select.innerHTML = optionMarkup("", emptyLabel);
      select.disabled = true;
      return;
    }

    select.disabled = false;
    select.innerHTML = items.map(item => optionMarkup(getValue(item), getLabel(item))).join("");
    if (previous && items.some(item => String(getValue(item)) === previous)) select.value = previous;
  }

  function formatCountdown(seconds) {
    const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
    const minutes = Math.floor(safe / 60);
    const remaining = safe % 60;
    return minutes ? `${minutes}m ${String(remaining).padStart(2, "0")}s` : `${remaining}s`;
  }

  function renderRestProtection() {
    const catalog = automationState.catalog;
    if (!catalog) return;

    const protection = catalog.restProtection || {};
    const settings = catalog.automationSettings || {};
    const maxRequests = Number(protection.maxRequestsPerMinute ?? settings.restMaxRequestsPerMinute ?? 60);
    const requests = Number(protection.requestsLastMinute || 0);
    const pausedUntil = protection.pausedUntil ? new Date(protection.pausedUntil) : null;
    const remaining = pausedUntil ? Math.max(0, Math.ceil((pausedUntil.getTime() - Date.now()) / 1000)) : 0;
    const paused = Boolean(protection.paused && remaining > 0);

    if (el.restMaxRequestsPerMinute && document.activeElement !== el.restMaxRequestsPerMinute) {
      el.restMaxRequestsPerMinute.value = String(maxRequests);
    }

    el.restRequestsMinute.textContent = `${requests} / ${maxRequests}`;
    el.restSnapshotRequests.textContent = String(protection.snapshotNetworkRequests || 0);
    el.restSnapshotCacheHits.textContent = String(protection.snapshotCacheHits || 0);
    el.rateDetails.textContent = `${requests} / ${maxRequests} req/min`;

    if (paused) {
      const sourceLabel = protection.source === "FIVE9_429" ? "Rate limit Five9" : "Límite interno";
      el.rateStatus.textContent = "Pausado";
      el.rateStatus.className = "status-bad";
      el.restProtectionState.textContent = `${sourceLabel} · ${formatCountdown(remaining)}`;
      el.restProtectionBadge.textContent = "Pausado";
      el.restProtectionBadge.className = "connection-state offline";
      el.restProtectionMessage.textContent =
        `${protection.reason || "Requests temporalmente detenidos."} Reanudación automática: ${pausedUntil.toLocaleTimeString()}.`;
    } else {
      el.rateStatus.textContent = "Normal";
      el.rateStatus.className = "status-good";
      el.restProtectionState.textContent = "Sensor disponible";
      el.restProtectionBadge.textContent = "Normal";
      el.restProtectionBadge.className = "connection-state online";
      el.restProtectionMessage.textContent =
        `Sin pausa activa. ${requests} request${requests === 1 ? "" : "s"} en el último minuto.`;
    }
  }

  function populateCatalog() {
    const catalog = automationState.catalog;
    if (!catalog) return;

    const profiles = catalog.profiles || [];
    const skills = catalog.skills || [];
    const queues = validQueues(catalog.queues);
    const agents = validAgents(catalog.agents);

    [el.profile, el.sourceProfile, el.targetProfile].forEach(select =>
      populateSelect(select, profiles, item => item.name, item => `${item.name} · ${item.userCount ?? 0} usuarios`)
    );

    if (el.sourceProfile.value === el.targetProfile.value && profiles.length > 1) {
      el.targetProfile.value = profiles.find(profile => profile.name !== el.sourceProfile.value)?.name || profiles[1].name;
    }

    const previousSkills = new Set([...el.skills.selectedOptions].map(option => option.value));
    el.skills.innerHTML = skills.map(skill => optionMarkup(skill.name, skill.description ? `${skill.name} · ${skill.description}` : skill.name)).join("");
    [...el.skills.options].forEach(option => {
      option.selected = previousSkills.has(option.value);
    });
    el.skills.disabled = !skills.length;

    const queueLabel = queue => {
      const id = queueId(queue);
      const name = queueName(queue) || (id ? `Queue ${id}` : "Queue sin nombre");
      return id ? `${name} · ID ${id}` : name;
    };

    populateSelect(el.queue, queues, queueId, queueLabel, {
      emptyLabel: catalog.restConnected ? "Supervisor sin queues asignadas" : "Conecta Supervisor REST"
    });
    populateSelect(el.activeSkill, queues, queueId, queueLabel, {
      emptyLabel: catalog.restConnected ? "Supervisor sin queues asignadas" : "Conecta Supervisor REST"
    });
    renderActiveAgentPicker();
    renderMoveUserPicker();

    el.timezone.textContent = catalog.timezone || "Zona horaria local";
    renderConnectionStatus();
    renderRestProtection();
  }

  function renderConnectionStatus() {
    const catalog = automationState.catalog;
    if (!catalog) return;

    el.soapStatus.textContent = catalog.soapConnected ? "Conectado" : "Desconectado";
    el.soapStatus.className = catalog.soapConnected ? "status-good" : "status-bad";
    el.restStatus.textContent = catalog.restConnected ? "Conectado" : "No conectado";
    el.restStatus.className = catalog.restConnected ? "status-good" : "status-bad";
    el.restIndicator.textContent = catalog.restConnected ? "Online" : "Offline";
    el.restIndicator.className = `connection-state ${catalog.restConnected ? "online" : "offline"}`;
    const assignedQueues = validQueues(catalog.queues);
    const visibleAgents = validAgents(catalog.agents);
    const domainQueueCount = validQueues(catalog.domainQueues).length;

    el.restDetails.textContent = catalog.restConnected
      ? `${assignedQueues.length} queues asignadas · ${visibleAgents.length} agentes visibles${domainQueueCount ? ` · ${domainQueueCount} queues en el dominio` : ""}.`
      : "Conecta un usuario Supervisor REST para activar triggers de queue y active skills.";

    const warnings = catalog.restWarnings || [];
    if (el.restWarning) {
      if (catalog.restConnected && warnings.length) {
        el.restWarning.classList.remove("hidden");
        el.restWarning.innerHTML = warnings.map(message => `<p>${escapeHtml(message)}</p>`).join("");
      } else {
        el.restWarning.classList.add("hidden");
        el.restWarning.textContent = "";
      }
    }

    el.restConnectButton.disabled = catalog.restConnected;
    el.restDisconnectButton.disabled = !catalog.restConnected;
  }

  function updateTriggerFields() {
    const isSchedule = el.triggerType.value === "schedule";
    el.scheduleFields.classList.toggle("hidden", !isSchedule);
    el.queueFields.classList.toggle("hidden", isSchedule);
    if (!isSchedule && !automationState.catalog?.restConnected) {
      showToast("error", "Supervisor REST requerido", "Puedes diseñar el job, pero no podrá evaluar la queue hasta conectar Supervisor REST.");
    }
  }

  function updateRecurrenceFields() {
    const recurrence = el.recurrence.value;
    el.dateField.classList.toggle("hidden", recurrence !== "once");
    el.weekdays.classList.toggle("hidden", recurrence !== "weekly");
  }

  function updateActionFields() {
    const type = el.actionType.value;
    el.profileSkillFields.classList.toggle("hidden", type !== "profile_skill");
    el.moveUsersFields.classList.toggle("hidden", type !== "move_users");
    el.activeSkillFields.classList.toggle("hidden", type !== "agent_active_skill");

    if (type === "agent_active_skill" && !automationState.catalog?.restConnected) {
      showToast("error", "Supervisor REST requerido", "Esta acción necesita un supervisor REST conectado.");
    }
  }

  function selectedWeekdays() {
    return $$("#jobWeekdays input:checked").map(input => input.value);
  }

  function selectedSkills() {
    return [...el.skills.selectedOptions].map(option => option.value).filter(Boolean);
  }

  function numberValue(input, fallback = 0) {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function buildJobPayload() {
    const triggerType = el.triggerType.value;
    const actionType = el.actionType.value;
    const payload = {
      name: el.jobName.value.trim(),
      triggerType,
      dryRun: el.dryRun.checked,
      enabled: el.enabled.checked,
      schedule: null,
      queue: null,
      action: { type: actionType }
    };

    if (!payload.name) throw new Error("Escribe un nombre para el job.");

    if (triggerType === "schedule") {
      const recurrence = el.recurrence.value;
      if (!el.time.value) throw new Error("Selecciona una hora.");
      if (recurrence === "once" && !el.date.value) throw new Error("Selecciona una fecha.");
      if (recurrence === "weekly" && !selectedWeekdays().length) throw new Error("Selecciona al menos un día de la semana.");
      payload.schedule = {
        recurrence,
        date: el.date.value,
        time: el.time.value,
        days: selectedWeekdays(),
        graceMinutes: numberValue(el.graceMinutes, 15)
      };
    } else {
      if (!el.queue.value) throw new Error("Selecciona la queue que será monitoreada.");
      const activateAt = numberValue(el.activateAt, 5);
      const recoverAt = numberValue(el.recoverAt, 2);
      if (recoverAt >= activateAt) throw new Error("El umbral de recuperación debe ser menor que el de activación.");
      payload.queue = {
        skillId: el.queue.value,
        skillName: el.queue.selectedOptions[0]?.textContent || el.queue.value,
        activateAt,
        recoverAt,
        persistenceSeconds: numberValue(el.persistence, 30),
        recoverySeconds: numberValue(el.recovery, 120),
        pollSeconds: Math.max(5, numberValue(el.pollSeconds, 10)),
        cooldownSeconds: Math.max(0, numberValue(el.cooldownSeconds, 300))
      };
    }

    if (actionType === "profile_skill") {
      const skills = selectedSkills();
      if (!el.profile.value) throw new Error("Selecciona el User Profile.");
      if (!skills.length) throw new Error("Selecciona al menos un skill.");
      payload.action = {
        type: actionType,
        profileName: el.profile.value,
        operation: el.profileSkillOperation.value,
        skills
      };
    } else if (actionType === "move_users") {
      const users = [...automationState.selectedMoveUsers];
      if (!el.sourceProfile.value || !el.targetProfile.value) throw new Error("Selecciona los perfiles origen y destino.");
      if (el.sourceProfile.value === el.targetProfile.value) throw new Error("El perfil origen y destino no pueden ser el mismo.");
      if (!users.length) throw new Error("Selecciona al menos un agente del perfil origen.");
      payload.action = {
        type: actionType,
        sourceProfile: el.sourceProfile.value,
        targetProfile: el.targetProfile.value,
        users
      };
    } else {
      if (!el.activeSkill.value) throw new Error("Selecciona la queue que se activará o desactivará.");
      if (!automationState.selectedActiveAgentIds.length) throw new Error("Selecciona al menos un agente y define su prioridad.");
      const agents = automationState.selectedActiveAgentIds.map((id, index) => {
        const agent = activeAgentById(id);
        return {
          id,
          name: agent ? agentName(agent) : id,
          priority: index + 1
        };
      });
      payload.action = {
        type: actionType,
        agents,
        skillId: el.activeSkill.value,
        skillName: el.activeSkill.selectedOptions[0]?.textContent || el.activeSkill.value,
        operation: el.activeOperation.value
      };
    }

    return payload;
  }

  function resetForm() {
    el.jobName.value = "";
    el.triggerType.value = "schedule";
    el.actionType.value = "profile_skill";
    el.recurrence.value = "once";
    setDefaultDate();
    el.time.value = "17:00";
    el.graceMinutes.value = "15";
    $$("#jobWeekdays input").forEach(input => {
      input.checked = ["MON", "TUE", "WED", "THU", "FRI"].includes(input.value);
    });
    el.activateAt.value = "5";
    el.recoverAt.value = "2";
    el.persistence.value = "30";
    el.recovery.value = "120";
    el.pollSeconds.value = "10";
    el.cooldownSeconds.value = "300";
    el.profileSkillOperation.value = "add";
    [...el.skills.options].forEach(option => { option.selected = false; });
    automationState.selectedMoveUsers = [];
    automationState.selectedActiveAgentIds = [];
    if (el.moveUserSearch) el.moveUserSearch.value = "";
    if (el.activeAgentSearch) el.activeAgentSearch.value = "";
    el.activeOperation.value = "add";
    renderMoveUserPicker();
    renderActiveAgentPicker();
    el.dryRun.checked = true;
    el.enabled.checked = true;
    updateTriggerFields();
    updateRecurrenceFields();
    updateActionFields();
  }

  async function createJob() {
    let payload;
    try {
      payload = buildJobPayload();
    } catch (error) {
      showToast("error", "Revisa el formulario", error.message);
      return;
    }

    showLoading("Creando Automation Job", "Guardando la regla y calculando su próxima ejecución.");
    try {
      await api("/api/jobs/create", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      showToast("success", "Job creado", payload.dryRun ? "Se creó en Dry Run para una prueba segura." : "El motor comenzará a evaluarlo.");
      addActivity("success", "Automation Job creado", payload.name);
      resetForm();
      await loadCatalog({ quiet: true });
    } catch (error) {
      showToast("error", "No se pudo crear", error.message);
    } finally {
      hideLoading();
    }
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("es", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function relativeTime(value) {
    if (!value) return "Nunca";
    const date = new Date(value);
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
    if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 48) return formatter.format(hours, "hour");
    return formatter.format(Math.round(hours / 24), "day");
  }

  function triggerSummary(job) {
    if (job.triggerType === "schedule") {
      const schedule = job.schedule || {};
      const recurrence = {
        once: `Una vez · ${schedule.date || "sin fecha"} ${schedule.time || ""}`,
        daily: `Diario · ${schedule.time || ""}`,
        weekly: `Semanal ${schedule.days?.join(", ") || ""} · ${schedule.time || ""}`
      }[schedule.recurrence] || "Horario";
      return recurrence;
    }
    const queue = job.queue || {};
    return `${queue.skillName || queue.skillId} · activar ≥ ${queue.activateAt}, recuperar ≤ ${queue.recoverAt}`;
  }

  function actionSummary(job) {
    const action = job.action || {};
    if (action.type === "profile_skill") {
      return `${action.operation === "remove" ? "Remover" : "Agregar"} ${action.skills?.join(", ") || "skills"} ${action.operation === "remove" ? "de" : "a"} ${action.profileName}`;
    }
    if (action.type === "move_users") {
      return `Mover ${action.users?.length || 0} usuario(s): ${action.sourceProfile} → ${action.targetProfile}`;
    }
    const agents = action.agents?.length
      ? action.agents
      : action.agentId
        ? [{ id: action.agentId, name: action.agentName || action.agentId, priority: 1 }]
        : [];
    const preview = agents.slice(0, 3).map(agent => agent.name || agent.id).join(" → ");
    const suffix = agents.length > 3 ? ` +${agents.length - 3}` : "";
    return `${action.operation === "remove" ? "Desactivar" : "Activar"} ${action.skillName || action.skillId} para ${agents.length} agente(s)${preview ? ` · ${preview}${suffix}` : ""}`;
  }

  function jobMetricsMarkup(job) {
    const metrics = job.state?.lastMetrics;
    if (!metrics) return "";
    return `
      <div class="job-metrics">
        <span><strong>${metrics.callsInQueue ?? 0}</strong> llamadas</span>
        <span><strong>${metrics.callbacksInQueue ?? 0}</strong> callbacks</span>
        <span><strong>${metrics.longestWaitSeconds ?? 0}s</strong> espera máx.</span>
        <span><strong>${metrics.readyAgents ?? 0}</strong> ready</span>
      </div>`;
  }

  function historyStatusClass(status) {
    if (status === "SUCCESS") return "status-good";
    if (status === "MISFIRE") return "status-warn";
    return "status-bad";
  }

  function historyTriggerLabel(trigger) {
    const labels = { scheduled: "Programada", queue_check: "Cola", recover: "Recuperación", activate: "Activación", manual: "Manual", engine: "Motor" };
    return labels[trigger] || trigger;
  }

  async function loadJobHistory(jobId) {
    const container = document.querySelector(`[data-history-panel="${jobId}"]`);
    if (!container) return;
    container.innerHTML = `<div class="job-detail-loading">Cargando historial...</div>`;
    try {
      const result = await api(`/api/jobs/${jobId}/history`);
      const history = result.history || [];
      if (!history.length) {
        container.innerHTML = `<div class="job-history-empty">Sin ejecuciones registradas.</div>`;
        return;
      }
      container.innerHTML = history.map(entry => {
        const time = formatDateTime(entry.timestamp);
        const statusClass = historyStatusClass(entry.status);
        const trigger = historyTriggerLabel(entry.trigger);
        const msg = escapeHtml(entry.message || "");
        return `
          <div class="job-history-row">
            <span class="history-time">${escapeHtml(time)}</span>
            <span class="history-trigger">${escapeHtml(trigger)}</span>
            <span class="history-status ${statusClass}">${escapeHtml(entry.status)}</span>
            <span class="history-message">${msg}</span>
          </div>`;
      }).join("");
    } catch (error) {
      container.innerHTML = `<div class="job-history-empty">Error: ${escapeHtml(error.message)}</div>`;
    }
  }

  async function loadJobPending(jobId) {
    const container = document.querySelector(`[data-pending-panel="${jobId}"]`);
    if (!container) return;
    container.innerHTML = `<div class="job-detail-loading">Calculando próximas ejecuciones...</div>`;
    try {
      const result = await api(`/api/jobs/${jobId}/pending?count=5`);
      const pending = result.pending || [];
      if (!pending.length) {
        container.innerHTML = `<div class="job-history-empty">Sin ejecuciones pendientes (recurring o sin schedule).</div>`;
        return;
      }
      container.innerHTML = pending.map((ts, i) => {
        const time = formatDateTime(ts);
        const relative = relativeTime(ts);
        return `
          <div class="job-history-row">
            <span class="history-time">${escapeHtml(time)}</span>
            <span class="history-status status-scheduled">${escapeHtml(relative)}</span>
          </div>`;
      }).join("");
    } catch (error) {
      container.innerHTML = `<div class="job-history-empty">Error: ${escapeHtml(error.message)}</div>`;
    }
  }

  function renderJobs() {
    const jobs = automationState.jobs || [];
    el.jobsCount.textContent = String(jobs.length);
    const enabled = jobs.filter(job => job.enabled).length;
    el.enabledCount.textContent = `${enabled} habilitado${enabled === 1 ? "" : "s"}`;

    const scheduled = jobs
      .filter(job => job.enabled && job.state?.nextRun)
      .sort((a, b) => new Date(a.state.nextRun) - new Date(b.state.nextRun));
    if (scheduled.length) {
      el.nextRun.textContent = relativeTime(scheduled[0].state.nextRun);
      el.nextRunJob.textContent = `${scheduled[0].name} · ${formatDateTime(scheduled[0].state.nextRun)}`;
    } else {
      el.nextRun.textContent = "—";
      el.nextRunJob.textContent = jobs.some(job => job.enabled && job.triggerType === "queue")
        ? "Jobs de queue en monitoreo"
        : "Sin jobs agendados";
    }

    if (!jobs.length) {
      el.jobsList.innerHTML = `
        <div class="empty-state compact-empty">
          <div class="empty-icon">⌁</div>
          <h3>No hay jobs</h3>
          <p>Crea la primera automatización con el formulario superior.</p>
        </div>`;
      return;
    }

    el.jobsList.innerHTML = jobs.map(job => {
      const phase = job.state?.phase || "idle";
      const stateClass = !job.enabled ? "paused" : phase === "active" ? "active" : "idle";
      const stateLabel = !job.enabled ? "Pausado" : phase === "active" ? "Refuerzo activo" : "Evaluando";
      const lastResult = job.state?.lastResult || "Esperando ejecución";
      const nextRun = job.state?.nextRun ? formatDateTime(job.state.nextRun) : job.triggerType === "queue" ? "Monitoreo continuo" : "—";
      const historyCount = job.state?.history?.length || 0;
      return `
        <article class="job-card ${stateClass}" data-job-id="${escapeHtml(job.id)}">
          <div class="job-card-top">
            <div class="job-title-area">
              <div class="job-status-line">
                <span class="job-state ${stateClass}">${escapeHtml(stateLabel)}</span>
                ${job.dryRun ? '<span class="dry-run-badge">DRY RUN</span>' : ""}
              </div>
              <h4>${escapeHtml(job.name)}</h4>
              <p>${escapeHtml(triggerSummary(job))}</p>
            </div>
            <label class="job-toggle" title="Habilitar o pausar job">
              <input type="checkbox" data-job-toggle ${job.enabled ? "checked" : ""}>
              <span></span>
            </label>
          </div>
          <div class="job-action-copy">
            <span>Acción</span>
            <strong>${escapeHtml(actionSummary(job))}</strong>
          </div>
          ${jobMetricsMarkup(job)}
          <div class="job-runtime-grid">
            <div><span>Próxima ejecución</span><strong>${escapeHtml(nextRun)}</strong></div>
            <div><span>Última ejecución</span><strong>${escapeHtml(formatDateTime(job.state?.lastRun))}</strong></div>
            <div><span>Ejecuciones</span><strong>${job.state?.executionCount || 0}</strong></div>
          </div>
          <div class="job-result ${lastResult.toLowerCase().includes("error") || lastResult.toLowerCase().includes("fall") ? "error" : ""}">${escapeHtml(lastResult)}</div>
          <div class="job-actions">
            <button class="secondary-button compact" type="button" data-job-run>${phase === "active" && job.triggerType === "queue" ? "Recuperar ahora" : "Ejecutar ahora"}</button>
            <button class="ghost-button compact" type="button" data-job-history>Historial${historyCount ? ` (${historyCount})` : ""}</button>
            ${job.triggerType === "schedule" ? '<button class="ghost-button compact" type="button" data-job-pending>Próximas</button>' : ""}
            <button class="ghost-button compact danger-text" type="button" data-job-delete>Eliminar</button>
          </div>
          <div class="job-detail-panel hidden" data-history-panel="${escapeHtml(job.id)}"></div>
          <div class="job-detail-panel hidden" data-pending-panel="${escapeHtml(job.id)}"></div>
        </article>`;
    }).join("");

    el.jobsList.querySelectorAll("[data-job-toggle]").forEach(toggle => {
      toggle.addEventListener("change", event => toggleJob(event.target.closest(".job-card").dataset.jobId, event.target.checked));
    });
    el.jobsList.querySelectorAll("[data-job-run]").forEach(button => {
      button.addEventListener("click", event => runJob(event.target.closest(".job-card").dataset.jobId));
    });
    el.jobsList.querySelectorAll("[data-job-delete]").forEach(button => {
      button.addEventListener("click", event => deleteJob(event.target.closest(".job-card").dataset.jobId));
    });
    el.jobsList.querySelectorAll("[data-job-history]").forEach(button => {
      button.addEventListener("click", async event => {
        const card = event.target.closest(".job-card");
        const jobId = card.dataset.jobId;
        const panel = card.querySelector(`[data-history-panel="${jobId}"]`);
        const pendingPanel = card.querySelector(`[data-pending-panel="${jobId}"]`);
        if (pendingPanel) pendingPanel.classList.add("hidden");
        panel.classList.toggle("hidden");
        if (!panel.classList.contains("hidden")) await loadJobHistory(jobId);
      });
    });
    el.jobsList.querySelectorAll("[data-job-pending]").forEach(button => {
      button.addEventListener("click", async event => {
        const card = event.target.closest(".job-card");
        const jobId = card.dataset.jobId;
        const panel = card.querySelector(`[data-pending-panel="${jobId}"]`);
        const historyPanel = card.querySelector(`[data-history-panel="${jobId}"]`);
        if (historyPanel) historyPanel.classList.add("hidden");
        panel.classList.toggle("hidden");
        if (!panel.classList.contains("hidden")) await loadJobPending(jobId);
      });
    });
  }

  async function loadCatalog({ quiet = false } = {}) {
    if (automationState.loading) return;
    automationState.loading = true;
    try {
      const catalog = await api("/api/automation/catalog");
      automationState.catalog = catalog;
      automationState.jobs = catalog.jobs || [];
      populateCatalog();
      if (el.sourceProfile?.value) {
        await loadMoveSourceUsers(el.sourceProfile.value);
      }
      renderJobs();
    } catch (error) {
      if (!quiet) showToast("error", "Automation Engine", error.message);
    } finally {
      automationState.loading = false;
    }
  }

  async function toggleJob(id, enabled) {
    try {
      await api("/api/jobs/toggle", {
        method: "POST",
        body: JSON.stringify({ id, enabled })
      });
      showToast("success", enabled ? "Job habilitado" : "Job pausado", "El cambio fue guardado.");
      await loadCatalog({ quiet: true });
    } catch (error) {
      showToast("error", "No se pudo actualizar", error.message);
      await loadCatalog({ quiet: true });
    }
  }

  async function runJob(id) {
    const job = automationState.jobs.find(item => item.id === id);
    if (!job) return;
    if (!window.confirm(`¿Ejecutar ahora el job "${job.name}"?${job.dryRun ? " Se encuentra en Dry Run." : ""}`)) return;

    showLoading("Ejecutando job", "Aplicando la acción y verificando la respuesta de Five9.");
    try {
      await api("/api/jobs/run", {
        method: "POST",
        body: JSON.stringify({ id })
      });
      showToast("success", "Job ejecutado", job.dryRun ? "Simulación completada." : "La acción fue procesada.");
      await loadCatalog({ quiet: true });
    } catch (error) {
      showToast("error", "Ejecución fallida", error.message);
    } finally {
      hideLoading();
    }
  }

  async function deleteJob(id) {
    const job = automationState.jobs.find(item => item.id === id);
    if (!job || !window.confirm(`Eliminar definitivamente el job "${job.name}"?`)) return;
    try {
      await api("/api/jobs/delete", {
        method: "POST",
        body: JSON.stringify({ id })
      });
      showToast("success", "Job eliminado", job.name);
      await loadCatalog({ quiet: true });
    } catch (error) {
      showToast("error", "No se pudo eliminar", error.message);
    }
  }

  async function connectRest() {
    const payload = {
      dataCenter: el.restDataCenter.value,
      username: el.restUsername.value.trim(),
      password: el.restPassword.value,
      saveCredentials: el.restSave.checked
    };
    if (!payload.username || !payload.password) {
      showToast("error", "Credenciales requeridas", "Ingresa el username y password del supervisor.");
      return;
    }

    showLoading("Conectando Supervisor REST", "Iniciando sesión, metadata y sesión de supervisor.");
    try {
      const result = await api("/api/rest/connect", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      el.restPassword.value = "";
      const queueCount = validQueues(result.queues).length;
      const agentCount = validAgents(result.agents).length;
      const warningCount = result.warnings?.length || 0;

      showToast(
        warningCount ? "error" : "success",
        warningCount ? "REST conectado con configuración pendiente" : "Supervisor REST conectado",
        warningCount
          ? `${queueCount} queues asignadas y ${agentCount} agentes visibles. Revisa el diagnóstico del panel.`
          : `${queueCount} queues y ${agentCount} agentes.`
      );
      addActivity("success", "Supervisor REST conectado", `${result.username} · ${result.dataCenter}`);
      await loadCatalog({ quiet: true });
    } catch (error) {
      showToast("error", "Conexión REST fallida", error.message);
    } finally {
      hideLoading();
    }
  }

  async function disconnectRest() {
    try {
      await api("/api/rest/disconnect", { method: "POST", body: "{}" });
      showToast("success", "Supervisor REST desconectado", "Los jobs de queue quedarán esperando conexión.");
      await loadCatalog({ quiet: true });
    } catch (error) {
      showToast("error", "No se pudo desconectar", error.message);
    }
  }

  async function testQueueSnapshot() {
    if (!el.queue.value) {
      showToast("error", "Selecciona una queue", "Conecta Supervisor REST y elige una queue.");
      return;
    }
    showLoading("Consultando ACD Snapshot", "Leyendo el estado actual de la queue.");
    try {
      const result = await api("/api/queue/snapshot", {
        method: "POST",
        body: JSON.stringify({ skillId: el.queue.value })
      });
      const metrics = result.metrics;
      el.queueSnapshotResult.classList.remove("hidden");
      el.queueSnapshotResult.innerHTML = `
        <strong>Snapshot recibido</strong>
        <span>${metrics.callsInQueue} llamadas · ${metrics.callbacksInQueue} callbacks · ${metrics.longestWaitSeconds}s de espera máxima · ${metrics.readyAgents} agentes Ready</span>`;
      showToast("success", "Snapshot recibido", `${metrics.callsInQueue} llamadas esperando · consulta REST protegida.`);
      await loadCatalog({ quiet: true });
    } catch (error) {
      showToast("error", "No se pudo leer la queue", error.message);
    } finally {
      hideLoading();
    }
  }


  function calculatorNumber(input, fallback = 0) {
    const value = Number(input?.value);
    return Number.isFinite(value) ? Math.max(0, value) : fallback;
  }

  function setCalculatorCardState(card, state) {
    if (!card) return;
    card.classList.remove("safe", "warning", "danger");
    card.classList.add(state);
  }

  function percent(value, total) {
    if (!total) return 0;
    return (value / total) * 100;
  }

  function roundUpToFive(value) {
    return Math.max(5, Math.ceil(value / 5) * 5);
  }

  function calculateApiLoad() {
    if (!el.calcQueueJobs) return;
    const jobs = calculatorNumber(el.calcQueueJobs, 0);
    const requestedQueues = calculatorNumber(el.calcDistinctQueues, jobs);
    const distinctQueues = jobs > 0 ? Math.min(jobs, requestedQueues) : 0;
    const pollSeconds = Math.max(5, calculatorNumber(el.calcPollSeconds, 10));
    const hoursDay = Math.min(24, calculatorNumber(el.calcHoursDay, 8));
    const internalLimit = Math.max(10, calculatorNumber(el.calcInternalLimit, 60));
    const activations = calculatorNumber(el.calcActiveActivations, 0);
    const recoveries = calculatorNumber(el.calcActiveRecoveries, 0);
    const agentsPerEvent = calculatorNumber(el.calcAgentsPerEvent, 1);
    const skillChanges = calculatorNumber(el.calcProfileSkillChanges, 0);
    const profileMoves = calculatorNumber(el.calcProfileMoves, 0);
    const uiOpenHours = Math.min(24, calculatorNumber(el.calcUiOpenHours, 0));

    const sensorPerMinute = distinctQueues * (60 / pollSeconds);
    const sensorPerHour = sensorPerMinute * 60;
    const sensorPerDay = sensorPerHour * hoursDay;
    const theoreticalWithoutCache = jobs * (60 / pollSeconds);
    const cacheSavingsPerMinute = Math.max(0, theoreticalWithoutCache - sensorPerMinute);
    const restActionRequestsDay = (activations * agentsPerEvent * 2) + (recoveries * agentsPerEvent);
    const totalRestDay = sensorPerDay + restActionRequestsDay;
    const utilization = percent(sensorPerMinute, internalLimit);

    // Documented domain limits for Configuration Web Services.
    const soapDailyLimit = 172800;
    const uiCatalogQueriesDay = uiOpenHours * 60 * (60 / 5) * 2;
    const soapQueryDay = (skillChanges * 3) + (profileMoves * 4) + uiCatalogQueriesDay;
    const soapModifyDay = skillChanges + (profileMoves * 2);
    const soapQueryPct = percent(soapQueryDay, soapDailyLimit);
    const soapModifyPct = percent(soapModifyDay, soapDailyLimit);

    const restState = utilization <= 75 ? "safe" : utilization <= 100 ? "warning" : "danger";
    setCalculatorCardState(el.calcRestResultCard, restState);
    setCalculatorCardState(el.calcRestDayCard, restState);
    setCalculatorCardState(el.calcSoapQueryCard, soapQueryPct <= 50 ? "safe" : soapQueryPct <= 80 ? "warning" : "danger");
    setCalculatorCardState(el.calcSoapModifyCard, soapModifyPct <= 50 ? "safe" : soapModifyPct <= 80 ? "warning" : "danger");

    el.calcRestPerMinute.textContent = `${sensorPerMinute.toFixed(sensorPerMinute % 1 ? 1 : 0)} req/min`;
    el.calcRestDetail.textContent = `${utilization.toFixed(1)}% del límite interno · ${sensorPerHour.toLocaleString(undefined, { maximumFractionDigits: 0 })}/hora · cache evita ≈ ${cacheSavingsPerMinute.toFixed(1)}/min`;
    el.calcRestPerDay.textContent = Math.round(totalRestDay).toLocaleString();
    el.calcRestActionDetail.textContent = `${Math.round(sensorPerDay).toLocaleString()} snapshots + ${Math.round(restActionRequestsDay).toLocaleString()} requests por acciones`;
    el.calcSoapQueries.textContent = `${Math.round(soapQueryDay).toLocaleString()} / día`;
    el.calcSoapQueryPercent.textContent = `${soapQueryPct.toFixed(2)}% de 172,800/día · incluye ${Math.round(uiCatalogQueriesDay).toLocaleString()} por UI · 450/min y 15,000/h`;
    el.calcSoapModifies.textContent = `${Math.round(soapModifyDay).toLocaleString()} / día`;
    el.calcSoapModifyPercent.textContent = `${soapModifyPct.toFixed(2)}% de 172,800/día · límite adicional 140/min y 7,200/h`;

    const targetBudget = internalLimit * 0.75;
    const recommendedPollRaw = distinctQueues > 0 ? (distinctQueues * 60) / Math.max(1, targetBudget) : 5;
    const recommendedPoll = roundUpToFive(recommendedPollRaw);
    const burstRest = agentsPerEvent * 2;
    const suggestions = [];

    if (utilization > 100) {
      suggestions.push(`<strong>Riesgo alto:</strong> el sensor intentaría ${sensorPerMinute.toFixed(1)} req/min, por encima del límite interno de ${internalLimit}.`);
    } else if (utilization > 75) {
      suggestions.push(`<strong>Margen bajo:</strong> el sensor usaría ${utilization.toFixed(1)}% del presupuesto interno.`);
    } else {
      suggestions.push(`<strong>Sensor saludable:</strong> el uso continuo queda en ${utilization.toFixed(1)}% del límite preventivo.`);
    }

    if (distinctQueues > 0) {
      suggestions.push(`Para dejar aproximadamente 25% de margen, usa <strong>${recommendedPoll} segundos o más</strong> con ${distinctQueues} queue${distinctQueues === 1 ? "" : "s"} diferentes.`);
    }
    if (jobs > distinctQueues) {
      suggestions.push(`El cache compartido puede ahorrar cerca de <strong>${cacheSavingsPerMinute.toFixed(1)} snapshots/min</strong> porque ${jobs - distinctQueues} job(s) reutilizan queues.`);
    }
    if (burstRest > 0) {
      suggestions.push(`Una activación de ${agentsPerEvent} agente(s) requiere aproximadamente <strong>${burstRest} requests REST</strong> además del sensor; la protección v4.3 los contabiliza.`);
      if (sensorPerMinute + burstRest > internalLimit) {
        suggestions.push(`<strong>Atención al burst:</strong> sensor (${sensorPerMinute.toFixed(1)}) + una activación (${burstRest}) podría superar ${internalLimit} requests dentro de la misma ventana móvil. El motor puede pausar y continuar cuando vuelva a existir presupuesto.`);
      }
    }
    suggestions.push(`REST Five9 no tiene aquí un número fijo publicado: si aparece <strong>HTTP 429</strong>, la app pausa hasta el reset indicado por Five9.`);

    el.calcRecommendation.innerHTML = `<div class="calculator-recommendation-title">Recomendación automática</div><ul>${suggestions.map(item => `<li>${item}</li>`).join("")}</ul>`;
  }

  function openApiCalculator() {
    const internal = Number(automationState.catalog?.restProtection?.maxRequestsPerMinute || automationState.catalog?.automationSettings?.restMaxRequestsPerMinute || 60);
    if (el.calcInternalLimit) el.calcInternalLimit.value = String(internal);
    calculateApiLoad();
    el.calculatorModal?.classList.remove("hidden");
  }

  function closeApiCalculator() {
    el.calculatorModal?.classList.add("hidden");
  }

  function resetApiCalculator() {
    const internal = Number(automationState.catalog?.restProtection?.maxRequestsPerMinute || 60);
    el.calcQueueJobs.value = "20";
    el.calcDistinctQueues.value = "20";
    el.calcPollSeconds.value = "10";
    el.calcHoursDay.value = "8";
    el.calcInternalLimit.value = String(internal);
    el.calcActiveActivations.value = "0";
    el.calcActiveRecoveries.value = "0";
    el.calcAgentsPerEvent.value = "1";
    el.calcProfileSkillChanges.value = "80";
    el.calcProfileMoves.value = "0";
    el.calcUiOpenHours.value = "0";
    calculateApiLoad();
  }

  function loadCurrentJobsIntoCalculator() {
    const jobs = automationState.jobs || [];
    const queueJobs = jobs.filter(job => job.enabled && job.triggerType === "queue");
    const uniqueQueues = new Set(queueJobs.map(job => String(job.queue?.skillId || "")).filter(Boolean));
    const polls = queueJobs.map(job => Number(job.queue?.pollSeconds || 10)).filter(Number.isFinite);
    const activeJobs = jobs.filter(job => job.enabled && job.action?.type === "agent_active_skill");
    const activeAgentCounts = activeJobs.map(job => job.action?.agents?.length || (job.action?.agentId ? 1 : 0));

    el.calcQueueJobs.value = String(queueJobs.length);
    el.calcDistinctQueues.value = String(uniqueQueues.size);
    el.calcPollSeconds.value = String(polls.length ? Math.min(...polls) : 10);
    el.calcHoursDay.value = "24";
    if (activeAgentCounts.length) el.calcAgentsPerEvent.value = String(Math.max(...activeAgentCounts));
    calculateApiLoad();
    showToast("success", "Sensor actual cargado", "Se cargaron queues, polling y prioridad máxima de agentes. Las ejecuciones diarias SOAP/REST quedan manuales porque dependen de cuántas veces se dispare cada job.");
  }

  async function saveRestProtectionSettings() {
    const value = Number(el.restMaxRequestsPerMinute.value);

    if (!Number.isInteger(value) || value < 10 || value > 300) {
      showToast("error", "Límite inválido", "Usa un valor entero entre 10 y 300 requests por minuto.");
      return;
    }

    try {
      await api("/api/automation/settings", {
        method: "POST",
        body: JSON.stringify({ restMaxRequestsPerMinute: value })
      });
      showToast("success", "Protección actualizada", `Límite interno: ${value} requests por minuto.`);
      await loadCatalog({ quiet: true });
    } catch (error) {
      showToast("error", "No se pudo guardar", error.message);
    }
  }

  function scheduleRefresh() {
    if (automationState.refreshTimer) clearInterval(automationState.refreshTimer);
    if (automationState.rateCountdownTimer) clearInterval(automationState.rateCountdownTimer);

    automationState.refreshTimer = window.setInterval(() => {
      if (!$("#dashboardView")?.classList.contains("hidden")) loadCatalog({ quiet: true });
    }, 5000);

    automationState.rateCountdownTimer = window.setInterval(() => {
      if (!$("#dashboardView")?.classList.contains("hidden")) renderRestProtection();
    }, 1000);
  }

  function initializeEvents() {
    el.jumpButton?.addEventListener("click", () => {
      if (typeof window.selectDashboardSection === "function") {
        window.selectDashboardSection("automation");
      }
      el.section?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    el.triggerType?.addEventListener("change", updateTriggerFields);
    el.recurrence?.addEventListener("change", updateRecurrenceFields);
    el.actionType?.addEventListener("change", updateActionFields);
    el.sourceProfile?.addEventListener("change", async () => {
      if (el.sourceProfile.value === el.targetProfile.value) {
        const alternative = [...el.targetProfile.options].find(option => option.value !== el.sourceProfile.value);
        if (alternative) el.targetProfile.value = alternative.value;
      }
      automationState.selectedMoveUsers = [];
      try {
        await loadMoveSourceUsers(el.sourceProfile.value, { force: true });
      } catch (error) {
        showToast("error", "No se pudieron cargar los agentes", error.message);
      }
    });
    el.targetProfile?.addEventListener("change", renderMoveUserPicker);
    el.moveUserSearch?.addEventListener("input", renderMoveUserPicker);
    el.moveSelectVisible?.addEventListener("click", () => {
      const query = (el.moveUserSearch?.value || "").trim().toLowerCase();
      const selected = new Set(automationState.selectedMoveUsers.map(moveUserKey));
      automationState.moveSourceUsers
        .filter(user => user.toLowerCase().includes(query))
        .forEach(user => { if (!selected.has(moveUserKey(user))) automationState.selectedMoveUsers.push(user); });
      renderMoveUserPicker();
    });
    el.moveClearUsers?.addEventListener("click", () => {
      automationState.selectedMoveUsers = [];
      renderMoveUserPicker();
    });
    el.activeAgentSearch?.addEventListener("input", renderActiveAgentPicker);
    el.activeClearAgents?.addEventListener("click", () => {
      automationState.selectedActiveAgentIds = [];
      renderActiveAgentPicker();
    });
    el.createButton?.addEventListener("click", createJob);
    el.resetButton?.addEventListener("click", resetForm);
    el.refreshJobsButton?.addEventListener("click", () => loadCatalog());
    el.restConnectButton?.addEventListener("click", connectRest);
    el.restDisconnectButton?.addEventListener("click", disconnectRest);
    el.testQueueButton?.addEventListener("click", testQueueSnapshot);
    el.saveRestProtectionButton?.addEventListener("click", saveRestProtectionSettings);
    el.calculatorButton?.addEventListener("click", openApiCalculator);
    el.closeCalculatorButton?.addEventListener("click", closeApiCalculator);
    el.closeCalculatorFooterButton?.addEventListener("click", closeApiCalculator);
    el.resetCalculatorButton?.addEventListener("click", resetApiCalculator);
    el.loadCurrentJobsCalculator?.addEventListener("click", loadCurrentJobsIntoCalculator);
    [
      el.calcQueueJobs, el.calcDistinctQueues, el.calcPollSeconds, el.calcHoursDay, el.calcInternalLimit,
      el.calcActiveActivations, el.calcActiveRecoveries, el.calcAgentsPerEvent,
      el.calcProfileSkillChanges, el.calcProfileMoves, el.calcUiOpenHours
    ].forEach(input => input?.addEventListener("input", calculateApiLoad));
    el.calculatorModal?.addEventListener("click", event => {
      if (event.target === el.calculatorModal) closeApiCalculator();
    });

    window.addEventListener("five9-connected", () => loadCatalog());
    window.addEventListener("five9-catalog-updated", () => {
      automationState.moveSourceUsers = [];
      automationState.moveSourceProfileName = "";
      automationState.moveSourceLoaded = false;
      loadCatalog({ quiet: true });
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !el.calculatorModal?.classList.contains("hidden")) closeApiCalculator();
    });

    window.addEventListener("five9-disconnected", () => {
      automationState.catalog = null;
      automationState.jobs = [];
      automationState.moveSourceUsers = [];
      automationState.moveSourceProfileName = "";
      automationState.moveSourceLoaded = false;
      automationState.selectedMoveUsers = [];
      automationState.selectedActiveAgentIds = [];
      renderMoveUserPicker();
      renderActiveAgentPicker();
    });
  }

  setDefaultDate();
  resetForm();
  initializeEvents();
  scheduleRefresh();
})();

const state = {
  connected: false,
  profiles: [],
  source: null,
  target: null,
  selectedUsers: new Set(),
  visibleUsers: [],
  visibleTargetUsers: [],
  allSkills: [],
  skillProfile: null,
  skillsToAdd: new Set(),
  skillsToRemove: new Set(),
  visibleAssignedSkills: [],
  visibleAvailableSkills: []
};

const elements = {
  loginView: document.querySelector("#loginView"),
  dashboardView: document.querySelector("#dashboardView"),
  loginForm: document.querySelector("#loginForm"),
  loginButton: document.querySelector("#loginButton"),
  dataCenter: document.querySelector("#dataCenter"),
  apiVersion: document.querySelector("#apiVersion"),
  username: document.querySelector("#username"),
  password: document.querySelector("#password"),
  togglePassword: document.querySelector("#togglePassword"),
  connectedUser: document.querySelector("#connectedUser"),
  connectedMeta: document.querySelector("#connectedMeta"),
  navMoveUsersButton: document.querySelector("#navMoveUsersButton"),
  navProfileSkillsButton: document.querySelector("#navProfileSkillsButton"),
  navAutomationButton: document.querySelector("#navAutomationButton"),
  dashboardNavButtons: [...document.querySelectorAll(".sidebar-nav-button")],
  dashboardConfigViews: [...document.querySelectorAll(".dashboard-config-view")],
  refreshButton: document.querySelector("#refreshButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  profilesCount: document.querySelector("#profilesCount"),
  sourceCount: document.querySelector("#sourceCount"),
  selectedCount: document.querySelector("#selectedCount"),
  targetCount: document.querySelector("#targetCount"),
  sourceCountLabel: document.querySelector("#sourceCountLabel"),
  targetCountLabel: document.querySelector("#targetCountLabel"),
  sourceProfile: document.querySelector("#sourceProfile"),
  targetProfile: document.querySelector("#targetProfile"),
  userSearch: document.querySelector("#userSearch"),
  targetUserSearch: document.querySelector("#targetUserSearch"),
  usersList: document.querySelector("#usersList"),
  targetUsersList: document.querySelector("#targetUsersList"),
  selectVisibleButton: document.querySelector("#selectVisibleButton"),
  clearSelectionButton: document.querySelector("#clearSelectionButton"),
  moveButton: document.querySelector("#moveButton"),
  moveSummaryText: document.querySelector("#moveSummaryText"),
  moveProjectionText: document.querySelector("#moveProjectionText"),
  sourcePanelCount: document.querySelector("#sourcePanelCount"),
  targetPanelCount: document.querySelector("#targetPanelCount"),
  transferBridgeCount: document.querySelector("#transferBridgeCount"),
  activityList: document.querySelector("#activityList"),
  clearActivityButton: document.querySelector("#clearActivityButton"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  loadingTitle: document.querySelector("#loadingTitle"),
  loadingMessage: document.querySelector("#loadingMessage"),
  confirmModal: document.querySelector("#confirmModal"),
  closeModalButton: document.querySelector("#closeModalButton"),
  cancelMoveButton: document.querySelector("#cancelMoveButton"),
  confirmMoveButton: document.querySelector("#confirmMoveButton"),
  confirmationInput: document.querySelector("#confirmationInput"),
  confirmDescription: document.querySelector("#confirmDescription"),
  confirmSource: document.querySelector("#confirmSource"),
  confirmTarget: document.querySelector("#confirmTarget"),
  confirmUsers: document.querySelector("#confirmUsers"),
  skillProfileSelect: document.querySelector("#skillProfileSelect"),
  domainSkillsCount: document.querySelector("#domainSkillsCount"),
  assignedSkillsCount: document.querySelector("#assignedSkillsCount"),
  skillsToAddCount: document.querySelector("#skillsToAddCount"),
  skillsToRemoveCount: document.querySelector("#skillsToRemoveCount"),
  assignedSkillSearch: document.querySelector("#assignedSkillSearch"),
  availableSkillSearch: document.querySelector("#availableSkillSearch"),
  assignedSkillsList: document.querySelector("#assignedSkillsList"),
  availableSkillsList: document.querySelector("#availableSkillsList"),
  selectAssignedVisibleButton: document.querySelector("#selectAssignedVisibleButton"),
  selectAvailableVisibleButton: document.querySelector("#selectAvailableVisibleButton"),
  clearSkillChangesButton: document.querySelector("#clearSkillChangesButton"),
  applySkillChangesButton: document.querySelector("#applySkillChangesButton"),
  skillsChangeSummary: document.querySelector("#skillsChangeSummary"),
  skillsConfirmModal: document.querySelector("#skillsConfirmModal"),
  closeSkillsModalButton: document.querySelector("#closeSkillsModalButton"),
  cancelSkillsButton: document.querySelector("#cancelSkillsButton"),
  confirmSkillsButton: document.querySelector("#confirmSkillsButton"),
  skillsConfirmationInput: document.querySelector("#skillsConfirmationInput"),
  skillsConfirmDescription: document.querySelector("#skillsConfirmDescription"),
  confirmAddSkillsCount: document.querySelector("#confirmAddSkillsCount"),
  confirmRemoveSkillsCount: document.querySelector("#confirmRemoveSkillsCount"),
  confirmAddSkills: document.querySelector("#confirmAddSkills"),
  confirmRemoveSkills: document.querySelector("#confirmRemoveSkills"),
  toastContainer: document.querySelector("#toastContainer")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    cache: "no-store",
    ...options
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`El servidor local devolvió una respuesta inválida (${response.status}).`);
  }

  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || payload.message || `Error HTTP ${response.status}`);
  }

  return payload;
}

function showLoading(title, message) {
  elements.loadingTitle.textContent = title;
  elements.loadingMessage.textContent = message;
  elements.loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  elements.loadingOverlay.classList.add("hidden");
}

function setDashboardSection(sectionName) {
  const validSections = new Set(["move-users", "profile-skills", "automation"]);
  const target = validSections.has(sectionName) ? sectionName : "move-users";

  elements.dashboardNavButtons.forEach(button => {
    const active = button.dataset.dashboardTarget === target;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  elements.dashboardConfigViews.forEach(view => {
    view.classList.toggle("is-active", view.dataset.dashboardSection === target);
  });

  try {
    window.localStorage.setItem("five9-dashboard-section", target);
  } catch {}
}

function restoreDashboardSectionPreference() {
  let preferred = "move-users";
  try {
    preferred = window.localStorage.getItem("five9-dashboard-section") || preferred;
  } catch {}
  setDashboardSection(preferred);
}

window.selectDashboardSection = setDashboardSection;

function showToast(type, title, message) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-symbol">${type === "success" ? "✓" : "!"}</span>
    <div>
      <strong></strong>
      <span></span>
    </div>
  `;
  toast.querySelector("strong").textContent = title;
  toast.querySelector("div span").textContent = message;
  elements.toastContainer.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 5600);
}

function addActivity(type, title, detail) {
  const item = document.createElement("div");
  item.className = `activity-item ${type}`;
  item.innerHTML = `
    <span class="activity-symbol">${type === "success" ? "✓" : type === "error" ? "!" : "•"}</span>
    <div>
      <strong></strong>
      <small></small>
    </div>
  `;
  item.querySelector("strong").textContent = title;
  item.querySelector("small").textContent = detail;
  elements.activityList.prepend(item);
}

function normalizeProfiles(profiles) {
  return [...profiles].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

function renderProfileSelects({ preserve = true } = {}) {
  const previousSource = preserve ? elements.sourceProfile.value : "";
  const previousTarget = preserve ? elements.targetProfile.value : "";

  const optionsHtml = state.profiles
    .map(profile => `<option value="${escapeHtml(profile.name)}">${escapeHtml(profile.name)} · ${profile.userCount} usuarios</option>`)
    .join("");

  const previousSkillProfile = preserve ? elements.skillProfileSelect.value : "";

  elements.sourceProfile.innerHTML = optionsHtml;
  elements.targetProfile.innerHTML = optionsHtml;
  elements.skillProfileSelect.innerHTML = optionsHtml;

  if (previousSource && state.profiles.some(profile => profile.name === previousSource)) {
    elements.sourceProfile.value = previousSource;
  }

  if (previousTarget && state.profiles.some(profile => profile.name === previousTarget)) {
    elements.targetProfile.value = previousTarget;
  }

  if (!elements.sourceProfile.value && state.profiles.length) {
    elements.sourceProfile.value = state.profiles[0].name;
  }

  if ((!elements.targetProfile.value || elements.targetProfile.value === elements.sourceProfile.value) && state.profiles.length > 1) {
    const alternative = state.profiles.find(profile => profile.name !== elements.sourceProfile.value);
    if (alternative) {
      elements.targetProfile.value = alternative.name;
    }
  }

  if (previousSkillProfile && state.profiles.some(profile => profile.name === previousSkillProfile)) {
    elements.skillProfileSelect.value = previousSkillProfile;
  }

  if (!elements.skillProfileSelect.value && state.profiles.length) {
    elements.skillProfileSelect.value = state.profiles[0].name;
  }

  elements.profilesCount.textContent = String(state.profiles.length);
}

async function loadProfile(profileName, kind) {
  if (!profileName) {
    return;
  }

  const result = await api(`/api/profile?name=${encodeURIComponent(profileName)}`);
  const profile = result.profile;

  if (kind === "source") {
    state.source = profile;
    state.selectedUsers.clear();
    elements.userSearch.value = "";
    renderSourceUsers();
    renderTargetUsers();
  } else {
    state.target = profile;
    if (elements.targetUserSearch) elements.targetUserSearch.value = "";
    // Al cambiar el destino, un usuario que ya exista allí deja de ser movible.
    const targetLookup = new Set((profile.users || []).map(user => user.toLowerCase()));
    [...state.selectedUsers].forEach(user => {
      if (targetLookup.has(user.toLowerCase())) state.selectedUsers.delete(user);
    });
    renderSourceUsers();
    renderTargetUsers();
  }

  updateStats();
}

function targetUserLookup() {
  return new Set((state.target?.users || []).map(user => user.toLowerCase()));
}

function pendingMoveUsers() {
  const targetLookup = targetUserLookup();
  return [...state.selectedUsers].filter(user => !targetLookup.has(user.toLowerCase()));
}

function renderSourceUsers() {
  const users = state.source?.users || [];
  const query = elements.userSearch.value.trim().toLowerCase();
  const targetLookup = targetUserLookup();

  state.visibleUsers = users.filter(user => user.toLowerCase().includes(query));

  if (!state.source) {
    elements.usersList.innerHTML = emptyState("Selecciona un perfil origen", "Los usuarios aparecerán aquí para que puedas elegirlos.");
    return;
  }

  if (!users.length) {
    elements.usersList.innerHTML = emptyState("Perfil sin usuarios", "Este perfil no tiene usuarios asignados.");
    return;
  }

  if (!state.visibleUsers.length) {
    elements.usersList.innerHTML = emptyState("Sin coincidencias", "No encontramos usernames que coincidan con tu búsqueda.");
    return;
  }

  const fragment = document.createDocumentFragment();

  state.visibleUsers.forEach((user, index) => {
    const alreadyInTarget = targetLookup.has(user.toLowerCase());
    if (alreadyInTarget) state.selectedUsers.delete(user);

    const row = document.createElement("label");
    row.className = `user-row ${state.selectedUsers.has(user) ? "selected" : ""} ${alreadyInTarget ? "already-target" : ""}`;
    row.innerHTML = `
      <input class="user-checkbox" type="checkbox">
      <span class="user-details">
        <strong></strong>
        <small>${alreadyInTarget ? "Ya pertenece al perfil destino" : "Usuario Five9"}</small>
      </span>
      <span class="user-position"></span>
    `;

    const checkbox = row.querySelector("input");
    checkbox.checked = state.selectedUsers.has(user);
    checkbox.disabled = alreadyInTarget;
    row.querySelector("strong").textContent = user;
    row.querySelector(".user-position").textContent = alreadyInTarget ? "Ya en destino" : `${index + 1} / ${state.visibleUsers.length}`;

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedUsers.add(user);
      } else {
        state.selectedUsers.delete(user);
      }
      row.classList.toggle("selected", checkbox.checked);
      renderTargetUsers();
      updateStats();
    });

    fragment.appendChild(row);
  });

  elements.usersList.replaceChildren(fragment);
}

function renderTargetUsers() {
  if (!elements.targetUsersList) return;
  const profile = state.target;

  if (!profile) {
    elements.targetUsersList.innerHTML = emptyState("Selecciona un perfil destino", "Verás los agentes actuales y la vista previa del movimiento.");
    return;
  }

  const query = (elements.targetUserSearch?.value || "").trim().toLowerCase();
  const currentUsers = profile.users || [];
  const currentLookup = new Set(currentUsers.map(user => user.toLowerCase()));
  const pending = [...state.selectedUsers].filter(user => !currentLookup.has(user.toLowerCase()));

  const pendingRows = pending
    .filter(user => user.toLowerCase().includes(query))
    .map(user => ({ user, status: "pending" }));
  const currentRows = currentUsers
    .filter(user => user.toLowerCase().includes(query))
    .map(user => ({ user, status: "current" }));

  state.visibleTargetUsers = [...pendingRows, ...currentRows];

  if (!state.visibleTargetUsers.length) {
    elements.targetUsersList.innerHTML = emptyState(
      query ? "Sin coincidencias" : "Perfil destino vacío",
      query ? "No encontramos agentes con ese filtro." : "Los agentes seleccionados en origen aparecerán aquí como vista previa."
    );
    return;
  }

  elements.targetUsersList.innerHTML = state.visibleTargetUsers.map((item, index) => `
    <div class="user-row target-preview-row ${item.status === "pending" ? "pending-move" : "current-target"}">
      <span class="target-user-status ${item.status}" aria-hidden="true">${item.status === "pending" ? "+" : "•"}</span>
      <span class="user-details">
        <strong>${escapeHtml(item.user)}</strong>
        <small>${item.status === "pending" ? "Se agregará al confirmar" : "Actualmente en el perfil"}</small>
      </span>
      <span class="target-status-badge ${item.status}">${item.status === "pending" ? "Se agregará" : "Actual"}</span>
    </div>
  `).join("");
}

function updateStats() {
  const selected = state.selectedUsers.size;
  const pending = pendingMoveUsers();
  const sourceTotal = Number(state.source?.userCount || 0);
  const targetTotal = Number(state.target?.userCount || 0);
  const projectedTarget = targetTotal + pending.length;

  elements.sourceCount.textContent = String(sourceTotal);
  elements.targetCount.textContent = String(targetTotal);
  elements.selectedCount.textContent = String(selected);
  elements.sourceCountLabel.textContent = state.source?.name || "Selecciona un perfil";
  elements.targetCountLabel.textContent = state.target?.name || "Selecciona un perfil";

  if (elements.sourcePanelCount) elements.sourcePanelCount.textContent = String(sourceTotal);
  if (elements.targetPanelCount) elements.targetPanelCount.textContent = state.target ? `${targetTotal} → ${projectedTarget}` : "0";
  if (elements.transferBridgeCount) elements.transferBridgeCount.textContent = String(pending.length);

  elements.moveSummaryText.textContent = pending.length
    ? `${pending.length} usuario${pending.length === 1 ? "" : "s"} listo${pending.length === 1 ? "" : "s"} para mover`
    : "Ningún usuario seleccionado";

  if (elements.moveProjectionText) {
    elements.moveProjectionText.textContent = state.target
      ? pending.length
        ? `Vista previa: ${targetTotal} actual${targetTotal === 1 ? "" : "es"} + ${pending.length} nuevo${pending.length === 1 ? "" : "s"} = ${projectedTarget} en destino.`
        : `Destino actual: ${targetTotal} usuario${targetTotal === 1 ? "" : "s"}. Sin cambios pendientes.`
      : "Selecciona un perfil destino.";
  }

  const sameProfile = elements.sourceProfile.value === elements.targetProfile.value;
  elements.moveButton.disabled = !pending.length || sameProfile || !state.source || !state.target;
}

function emptyState(title, copy) {
  return `
    <div class="empty-state">
      <div class="empty-icon">◎</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(copy)}</p>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeSkills(skills) {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

async function loadDomainSkills() {
  const result = await api("/api/skills");
  state.allSkills = normalizeSkills(result.skills || []);
  elements.domainSkillsCount.textContent = String(state.allSkills.length);
}

async function loadSkillProfile(profileName) {
  if (!profileName) {
    state.skillProfile = null;
    renderSkillLists();
    return;
  }

  const result = await api(`/api/profile?name=${encodeURIComponent(profileName)}`);
  state.skillProfile = result.profile;
  state.skillsToAdd.clear();
  state.skillsToRemove.clear();
  elements.assignedSkillSearch.value = "";
  elements.availableSkillSearch.value = "";
  renderSkillLists();
}

function skillMetadata(skillName) {
  return state.allSkills.find(skill => skill.name.toLowerCase() === skillName.toLowerCase()) || {
    name: skillName,
    description: ""
  };
}

function renderSkillRows(container, skills, mode) {
  if (!skills.length) {
    container.innerHTML = emptyState(
      mode === "remove" ? "No hay skills asignados" : "No hay skills disponibles",
      mode === "remove"
        ? "Este User Profile no tiene skills asignados."
        : "Todos los skills del dominio ya están asignados o no coinciden con la búsqueda."
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  const selectedSet = mode === "remove" ? state.skillsToRemove : state.skillsToAdd;

  skills.forEach(skill => {
    const row = document.createElement("label");
    const selected = selectedSet.has(skill.name);
    row.className = `skill-row ${selected ? (mode === "remove" ? "selected-remove" : "selected-add") : ""}`;
    row.innerHTML = `
      <input class="user-checkbox ${mode === "remove" ? "remove-checkbox" : "add-checkbox"}" type="checkbox">
      <span class="skill-row-details">
        <strong></strong>
        <small></small>
      </span>
      <span class="skill-action-label ${mode === "remove" ? "remove" : "add"}">
        ${mode === "remove" ? "Remover" : "Agregar"}
      </span>
    `;

    const checkbox = row.querySelector("input");
    checkbox.checked = selected;
    row.querySelector("strong").textContent = skill.name;
    row.querySelector("small").textContent = skill.description || "Skill de Five9";

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedSet.add(skill.name);
      } else {
        selectedSet.delete(skill.name);
      }

      row.classList.toggle(mode === "remove" ? "selected-remove" : "selected-add", checkbox.checked);
      updateSkillStats();
    });

    fragment.appendChild(row);
  });

  container.replaceChildren(fragment);
}

function renderSkillLists() {
  const assignedNames = state.skillProfile?.skills || [];
  const assignedLookup = new Set(assignedNames.map(name => name.toLowerCase()));
  const assignedQuery = elements.assignedSkillSearch.value.trim().toLowerCase();
  const availableQuery = elements.availableSkillSearch.value.trim().toLowerCase();

  const assignedSkills = assignedNames
    .map(skillMetadata)
    .filter(skill =>
      skill.name.toLowerCase().includes(assignedQuery) ||
      (skill.description || "").toLowerCase().includes(assignedQuery)
    );

  const availableSkills = state.allSkills
    .filter(skill => !assignedLookup.has(skill.name.toLowerCase()))
    .filter(skill =>
      skill.name.toLowerCase().includes(availableQuery) ||
      (skill.description || "").toLowerCase().includes(availableQuery)
    );

  state.visibleAssignedSkills = assignedSkills.map(skill => skill.name);
  state.visibleAvailableSkills = availableSkills.map(skill => skill.name);

  renderSkillRows(elements.assignedSkillsList, assignedSkills, "remove");
  renderSkillRows(elements.availableSkillsList, availableSkills, "add");
  updateSkillStats();
}

function updateSkillStats() {
  const addCount = state.skillsToAdd.size;
  const removeCount = state.skillsToRemove.size;

  elements.assignedSkillsCount.textContent = String(state.skillProfile?.skillCount || 0);
  elements.skillsToAddCount.textContent = String(addCount);
  elements.skillsToRemoveCount.textContent = String(removeCount);

  if (!addCount && !removeCount) {
    elements.skillsChangeSummary.textContent = "No hay cambios pendientes";
  } else {
    elements.skillsChangeSummary.textContent =
      `${addCount} para agregar · ${removeCount} para remover`;
  }

  elements.applySkillChangesButton.disabled =
    !state.skillProfile || (!addCount && !removeCount);
}

function clearSkillChanges() {
  state.skillsToAdd.clear();
  state.skillsToRemove.clear();
  renderSkillLists();
}

function openSkillsConfirmModal() {
  if (!state.skillProfile || (!state.skillsToAdd.size && !state.skillsToRemove.size)) {
    return;
  }

  const additions = [...state.skillsToAdd];
  const removals = [...state.skillsToRemove];

  elements.skillsConfirmDescription.textContent =
    `Se actualizará el perfil "${state.skillProfile.name}". Five9 aplicará ${additions.length} adición(es) y ${removals.length} remoción(es).`;
  elements.confirmAddSkillsCount.textContent = String(additions.length);
  elements.confirmRemoveSkillsCount.textContent = String(removals.length);
  elements.confirmAddSkills.innerHTML = additions.length
    ? additions.map(skill => `<span class="confirm-user-chip">${escapeHtml(skill)}</span>`).join("")
    : `<span class="muted-copy">Ninguno</span>`;
  elements.confirmRemoveSkills.innerHTML = removals.length
    ? removals.map(skill => `<span class="confirm-user-chip">${escapeHtml(skill)}</span>`).join("")
    : `<span class="muted-copy">Ninguno</span>`;

  elements.skillsConfirmationInput.value = "";
  elements.confirmSkillsButton.disabled = true;
  elements.skillsConfirmModal.classList.remove("hidden");
  window.setTimeout(() => elements.skillsConfirmationInput.focus(), 50);
}

function closeSkillsConfirmModal() {
  elements.skillsConfirmModal.classList.add("hidden");
  elements.skillsConfirmationInput.value = "";
  elements.confirmSkillsButton.disabled = true;
}

async function executeSkillChanges() {
  const profileName = state.skillProfile.name;
  const additions = [...state.skillsToAdd];
  const removals = [...state.skillsToRemove];

  closeSkillsConfirmModal();
  showLoading(
    "Actualizando skills",
    "Five9 está modificando el User Profile y verificando el estado final."
  );

  try {
    const result = await api("/api/profile-skills", {
      method: "POST",
      body: JSON.stringify({
        profileName,
        addSkills: additions,
        removeSkills: removals
      })
    });

    if (result.verificationOk) {
      showToast(
        "success",
        "Skills actualizados",
        `${result.addedSkills.length} agregado(s) y ${result.removedSkills.length} removido(s).`
      );
      addActivity(
        "success",
        "Skills del perfil actualizados",
        `${profileName}: +${result.addedSkills.length} / -${result.removedSkills.length}.`
      );
    } else {
      const rollbackText = result.rollbackOk
        ? "El sistema restauró el estado anterior."
        : "Revisa el perfil inmediatamente en Five9.";
      showToast("error", "Verificación fallida", `${result.message} ${rollbackText}`);
      addActivity("error", "Actualización de skills incompleta", result.message);
    }

    state.skillsToAdd.clear();
    state.skillsToRemove.clear();
    await refreshProfiles({ quiet: true });
  } catch (error) {
    showToast("error", "No se pudieron actualizar los skills", error.message);
    addActivity("error", "Error actualizando skills", error.message);
  } finally {
    hideLoading();
    updateSkillStats();
  }
}

async function refreshProfiles({ quiet = false } = {}) {
  if (!quiet) {
    showLoading("Actualizando perfiles", "Consultando la configuración más reciente de Five9.");
  }

  try {
    const result = await api("/api/profiles");
    state.profiles = normalizeProfiles(result.profiles);
    renderProfileSelects();

    await Promise.all([
      loadProfile(elements.sourceProfile.value, "source"),
      loadProfile(elements.targetProfile.value, "target"),
      loadDomainSkills()
    ]);

    await loadSkillProfile(elements.skillProfileSelect.value);

    addActivity("neutral", "Perfiles actualizados", `${state.profiles.length} perfiles disponibles.`);
    window.dispatchEvent(new CustomEvent("five9-catalog-updated"));
  } finally {
    if (!quiet) {
      hideLoading();
    }
  }
}

function openConfirmModal() {
  if (!state.selectedUsers.size || !state.source || !state.target) {
    return;
  }

  const users = [...state.selectedUsers];
  elements.confirmSource.textContent = state.source.name;
  elements.confirmTarget.textContent = state.target.name;
  elements.confirmDescription.textContent =
    `Se removerán ${users.length} usuario${users.length === 1 ? "" : "s"} de "${state.source.name}" y se agregarán a "${state.target.name}".`;

  elements.confirmUsers.innerHTML = users
    .map(user => `<span class="confirm-user-chip">${escapeHtml(user)}</span>`)
    .join("");

  elements.confirmationInput.value = "";
  elements.confirmMoveButton.disabled = true;
  elements.confirmModal.classList.remove("hidden");
  window.setTimeout(() => elements.confirmationInput.focus(), 50);
}

function closeConfirmModal() {
  elements.confirmModal.classList.add("hidden");
  elements.confirmationInput.value = "";
  elements.confirmMoveButton.disabled = true;
}

async function executeMove() {
  const users = [...state.selectedUsers];
  const sourceName = state.source.name;
  const targetName = state.target.name;

  closeConfirmModal();
  showLoading("Moviendo usuarios", "Five9 está actualizando los perfiles y verificando el resultado.");

  try {
    const result = await api("/api/move", {
      method: "POST",
      body: JSON.stringify({
        sourceProfile: sourceName,
        targetProfile: targetName,
        users
      })
    });

    if (result.verificationOk) {
      showToast(
        "success",
        "Movimiento completado",
        `${result.movedUsers.length} usuario${result.movedUsers.length === 1 ? "" : "s"} movido${result.movedUsers.length === 1 ? "" : "s"} y verificado${result.movedUsers.length === 1 ? "" : "s"}.`
      );
      addActivity(
        "success",
        "Movimiento verificado",
        `${result.movedUsers.length} usuario(s): ${sourceName} → ${targetName}.`
      );
    } else {
      showToast(
        "error",
        "Verificación incompleta",
        `${result.verificationFailures.length} usuario(s) presentan inconsistencias. Revisa Five9 y el archivo de log.`
      );
      addActivity(
        "error",
        "Verificación incompleta",
        `${result.verificationFailures.length} usuario(s) requieren revisión.`
      );
    }

    if (result.skippedUsers?.length) {
      addActivity(
        "neutral",
        "Usuarios omitidos",
        `${result.skippedUsers.length} usuario(s) ya aparecían en el perfil destino.`
      );
    }

    if (result.notInSource?.length) {
      addActivity(
        "neutral",
        "Usuarios no encontrados",
        `${result.notInSource.length} usuario(s) ya no aparecían en el perfil origen.`
      );
    }

    state.selectedUsers.clear();
    await refreshProfiles({ quiet: true });
  } catch (error) {
    showToast("error", "No se pudo completar", error.message);
    addActivity("error", "Movimiento fallido", error.message);
  } finally {
    hideLoading();
    updateStats();
  }
}

async function connect(event) {
  event.preventDefault();

  const payload = {
    dataCenter: elements.dataCenter.value,
    apiVersion: elements.apiVersion.value,
    username: elements.username.value.trim(),
    password: elements.password.value,
    saveCredentials: Boolean(document.querySelector("#saveSoapCredentials")?.checked)
  };

  showLoading("Conectando con Five9", "Validando credenciales y consultando los User Profiles.");

  try {
    const result = await api("/api/connect", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    state.connected = true;
    state.profiles = normalizeProfiles(result.profiles);
    elements.password.value = "";
    elements.connectedUser.textContent = result.username;
    elements.connectedMeta.textContent = `${result.dataCenter} · ${result.apiVersion}`;

    elements.loginView.classList.add("hidden");
    elements.dashboardView.classList.remove("hidden");
    restoreDashboardSectionPreference();

    renderProfileSelects({ preserve: false });

    await Promise.all([
      loadProfile(elements.sourceProfile.value, "source"),
      loadProfile(elements.targetProfile.value, "target"),
      loadDomainSkills()
    ]);

    await loadSkillProfile(elements.skillProfileSelect.value);

    addActivity("success", "Conexión establecida", `${result.dataCenter} · ${result.apiVersion} · ${state.profiles.length} perfiles.`);
    showToast("success", "Conectado", `Five9 devolvió ${state.profiles.length} perfiles.`);
    window.dispatchEvent(new CustomEvent("five9-connected", { detail: result }));
  } catch (error) {
    showToast("error", "Conexión fallida", error.message);
  } finally {
    hideLoading();
  }
}

async function disconnect() {
  showLoading("Cerrando sesión", "Eliminando las credenciales de la memoria local.");

  try {
    await api("/api/disconnect", {
      method: "POST",
      body: "{}"
    });
  } catch {
    // La interfaz se reinicia aunque el servidor no responda.
  } finally {
    state.connected = false;
    state.profiles = [];
    state.source = null;
    state.target = null;
    state.skillProfile = null;
    state.allSkills = [];
    state.selectedUsers.clear();
    state.visibleTargetUsers = [];
    state.skillsToAdd.clear();
    state.skillsToRemove.clear();

    elements.dashboardView.classList.add("hidden");
    elements.loginView.classList.remove("hidden");
    setDashboardSection("move-users");
    elements.username.focus();
    window.dispatchEvent(new CustomEvent("five9-disconnected"));
    hideLoading();
  }
}

elements.loginForm.addEventListener("submit", connect);

elements.togglePassword.addEventListener("click", () => {
  const showing = elements.password.type === "text";
  elements.password.type = showing ? "password" : "text";
  elements.togglePassword.textContent = showing ? "Ver" : "Ocultar";
});

elements.sourceProfile.addEventListener("change", async () => {
  if (elements.sourceProfile.value === elements.targetProfile.value) {
    const alternative = state.profiles.find(profile => profile.name !== elements.sourceProfile.value);
    if (alternative) {
      elements.targetProfile.value = alternative.name;
    }
  }

  showLoading("Cargando perfil origen", "Consultando los usuarios asignados.");
  try {
    await Promise.all([
      loadProfile(elements.sourceProfile.value, "source"),
      loadProfile(elements.targetProfile.value, "target")
    ]);
  } catch (error) {
    showToast("error", "No se pudo cargar", error.message);
  } finally {
    hideLoading();
  }
});

elements.targetProfile.addEventListener("change", async () => {
  if (elements.sourceProfile.value === elements.targetProfile.value) {
    showToast("error", "Perfiles iguales", "Selecciona un perfil destino diferente al origen.");
    updateStats();
    return;
  }

  showLoading("Cargando perfil destino", "Consultando los usuarios asignados.");
  try {
    await loadProfile(elements.targetProfile.value, "target");
  } catch (error) {
    showToast("error", "No se pudo cargar", error.message);
  } finally {
    hideLoading();
  }
});

elements.userSearch.addEventListener("input", renderSourceUsers);
elements.targetUserSearch?.addEventListener("input", renderTargetUsers);

elements.selectVisibleButton.addEventListener("click", () => {
  const targetLookup = targetUserLookup();
  state.visibleUsers.forEach(user => {
    if (!targetLookup.has(user.toLowerCase())) state.selectedUsers.add(user);
  });
  renderSourceUsers();
  renderTargetUsers();
  updateStats();
});

elements.clearSelectionButton.addEventListener("click", () => {
  state.selectedUsers.clear();
  renderSourceUsers();
  renderTargetUsers();
  updateStats();
});

elements.moveButton.addEventListener("click", openConfirmModal);
elements.closeModalButton.addEventListener("click", closeConfirmModal);
elements.cancelMoveButton.addEventListener("click", closeConfirmModal);

elements.confirmationInput.addEventListener("input", () => {
  elements.confirmMoveButton.disabled = elements.confirmationInput.value.trim().toUpperCase() !== "MOVER";
});

elements.confirmationInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !elements.confirmMoveButton.disabled) {
    executeMove();
  }
});

elements.confirmMoveButton.addEventListener("click", executeMove);
elements.refreshButton.addEventListener("click", () => refreshProfiles().catch(error => {
  hideLoading();
  showToast("error", "No se pudo actualizar", error.message);
}));
elements.disconnectButton.addEventListener("click", disconnect);

elements.dashboardNavButtons.forEach(button => {
  button.addEventListener("click", () => {
    setDashboardSection(button.dataset.dashboardTarget || "move-users");
  });
});

elements.clearActivityButton.addEventListener("click", () => {
  elements.activityList.innerHTML = "";
  addActivity("neutral", "Actividad limpiada", "La sesión y los logs del disco no fueron modificados.");
});

elements.skillProfileSelect.addEventListener("change", async () => {
  showLoading("Cargando skills del perfil", "Consultando la asignación actual en Five9.");
  try {
    await loadSkillProfile(elements.skillProfileSelect.value);
  } catch (error) {
    showToast("error", "No se pudo cargar el perfil", error.message);
  } finally {
    hideLoading();
  }
});

elements.assignedSkillSearch.addEventListener("input", renderSkillLists);
elements.availableSkillSearch.addEventListener("input", renderSkillLists);

elements.selectAssignedVisibleButton.addEventListener("click", () => {
  state.visibleAssignedSkills.forEach(skill => state.skillsToRemove.add(skill));
  renderSkillLists();
});

elements.selectAvailableVisibleButton.addEventListener("click", () => {
  state.visibleAvailableSkills.forEach(skill => state.skillsToAdd.add(skill));
  renderSkillLists();
});

elements.clearSkillChangesButton.addEventListener("click", clearSkillChanges);
elements.applySkillChangesButton.addEventListener("click", openSkillsConfirmModal);
elements.closeSkillsModalButton.addEventListener("click", closeSkillsConfirmModal);
elements.cancelSkillsButton.addEventListener("click", closeSkillsConfirmModal);

elements.skillsConfirmationInput.addEventListener("input", () => {
  elements.confirmSkillsButton.disabled =
    elements.skillsConfirmationInput.value.trim().toUpperCase() !== "ACTUALIZAR";
});

elements.skillsConfirmationInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !elements.confirmSkillsButton.disabled) {
    executeSkillChanges();
  }
});

elements.confirmSkillsButton.addEventListener("click", executeSkillChanges);

elements.skillsConfirmModal.addEventListener("click", event => {
  if (event.target === elements.skillsConfirmModal) {
    closeSkillsConfirmModal();
  }
});

elements.confirmModal.addEventListener("click", event => {
  if (event.target === elements.confirmModal) {
    closeConfirmModal();
  }
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") {
    return;
  }

  if (!elements.confirmModal.classList.contains("hidden")) {
    closeConfirmModal();
  }

  if (!elements.skillsConfirmModal.classList.contains("hidden")) {
    closeSkillsConfirmModal();
  }
});

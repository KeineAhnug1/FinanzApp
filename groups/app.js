const SESSION_USER = "anna";

const sessionUserBadge = document.getElementById("sessionUserBadge");
const groupsList = document.getElementById("groupsList");
const groupForm = document.getElementById("groupForm");
const nameInput = document.getElementById("nameInput");
const addressInput = document.getElementById("addressInput");
const formStatus = document.getElementById("formStatus");

const groupDetailEmpty = document.getElementById("groupDetailEmpty");
const groupDetailContent = document.getElementById("groupDetailContent");
const groupDetailName = document.getElementById("groupDetailName");
const groupDetailAddress = document.getElementById("groupDetailAddress");
const groupDetailCreated = document.getElementById("groupDetailCreated");
const membersList = document.getElementById("membersList");
const adminPanel = document.getElementById("adminPanel");
const inviteForm = document.getElementById("inviteForm");
const inviteUsernameInput = document.getElementById("inviteUsernameInput");
const deleteGroupButton = document.getElementById("deleteGroupButton");
const detailStatus = document.getElementById("detailStatus");

let groupsState = [];
let selectedGroupId = null;
let selectedGroupDetail = null;

function formatDate(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function setDetailStatus(message, type = "") {
  detailStatus.className = "form-status";
  if (type) {
    detailStatus.classList.add(type);
  }
  detailStatus.textContent = message || "";
}

function renderGroups(groups) {
  groupsList.innerHTML = "";

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No memberships found for your session user.";
    groupsList.appendChild(empty);
    return;
  }

  for (const group of groups) {
    const card = document.createElement("article");
    card.className = "group-card";
    if (group.group_id === selectedGroupId) {
      card.classList.add("is-active");
    }
    card.innerHTML = `
      <h3>${group.name}</h3>
      <p class="meta"><strong>Role:</strong> ${group.role}</p>
      <p class="meta"><strong>Address:</strong> ${group.address || "n/a"}</p>
      <p class="meta"><strong>Joined:</strong> ${formatDate(group.joined_at)}</p>
      <button type="button" class="select-group-button" data-group-id="${group.group_id}">Open details</button>
    `;
    groupsList.appendChild(card);
  }
}

function renderGroupDetail(detail) {
  selectedGroupDetail = detail;

  if (!detail) {
    groupDetailEmpty.hidden = false;
    groupDetailContent.hidden = true;
    return;
  }

  groupDetailEmpty.hidden = true;
  groupDetailContent.hidden = false;
  groupDetailName.textContent = detail.group.name;
  groupDetailAddress.textContent = `Address: ${detail.group.address || "n/a"}`;
  groupDetailCreated.textContent = `Created: ${formatDate(detail.group.created_at)}`;
  adminPanel.hidden = !detail.is_admin;
  membersList.innerHTML = "";

  for (const member of detail.members) {
    const item = document.createElement("li");
    item.className = "member-item";
    const isSessionUser = member.user_id === detail.session_user_id;
    const fullName = `${member.first_name || ""} ${member.last_name || ""}`.trim();

    const identity = fullName
      ? `${member.username} (${fullName})`
      : member.username;
    item.innerHTML = `
      <div>
        <p class="member-name">${identity}${isSessionUser ? " (you)" : ""}</p>
        <p class="meta">Role: ${member.role} | Joined: ${formatDate(member.joined_at)}</p>
      </div>
    `;

    if (detail.is_admin && !isSessionUser) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "small-danger-button";
      button.dataset.userId = member.user_id;
      button.textContent = "Remove";
      item.appendChild(button);
    }

    membersList.appendChild(item);
  }
}

async function loadSession() {
  const response = await fetch("/api/session");
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not load session");
  }
  sessionUserBadge.textContent = `Session: ${payload.session_user.username}`;
}

async function fetchGroupDetail(groupId) {
  const response = await fetch(`/api/groups/${groupId}`);
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not load group detail");
  }
  return payload;
}

async function loadGroupDetail(groupId) {
  if (!groupId) {
    renderGroupDetail(null);
    return;
  }
  const detail = await fetchGroupDetail(groupId);
  renderGroupDetail(detail);
}

async function loadGroups(preferredGroupId = selectedGroupId) {
  const response = await fetch("/api/groups");
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not load groups");
  }

  groupsState = payload.groups || [];

  if (!groupsState.length) {
    selectedGroupId = null;
    renderGroups(groupsState);
    renderGroupDetail(null);
    return;
  }

  if (preferredGroupId && groupsState.some((group) => group.group_id === preferredGroupId)) {
    selectedGroupId = preferredGroupId;
  } else {
    selectedGroupId = groupsState[0].group_id;
  }

  renderGroups(groupsState);
  await loadGroupDetail(selectedGroupId);
}

async function createGroup(name, address) {
  const response = await fetch("/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, address, session_user: SESSION_USER })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not create group");
  }
  return payload.group;
}

async function inviteUserToGroup(groupId, username) {
  const response = await fetch(`/api/groups/${groupId}/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not invite user");
  }
}

async function removeMember(groupId, userId) {
  const response = await fetch(`/api/groups/${groupId}/members/${userId}`, {
    method: "DELETE"
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not remove participant");
  }
}

async function deleteGroup(groupId) {
  const response = await fetch(`/api/groups/${groupId}`, {
    method: "DELETE"
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not delete group");
  }
}

groupsList.addEventListener("click", async (event) => {
  const button = event.target.closest(".select-group-button");
  if (!button) return;

  const groupId = button.dataset.groupId;
  if (!groupId) return;

  selectedGroupId = groupId;
  renderGroups(groupsState);
  setDetailStatus("");

  try {
    await loadGroupDetail(groupId);
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

membersList.addEventListener("click", async (event) => {
  const button = event.target.closest(".small-danger-button");
  if (!button || !selectedGroupDetail || !selectedGroupId) return;

  const userId = button.dataset.userId;
  if (!userId) return;

  setDetailStatus("Removing participant...");
  try {
    await removeMember(selectedGroupId, userId);
    await loadGroupDetail(selectedGroupId);
    setDetailStatus("Participant removed.", "ok");
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

inviteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedGroupId) return;

  setDetailStatus("Sending invitation...");
  try {
    await inviteUserToGroup(selectedGroupId, inviteUsernameInput.value);
    inviteForm.reset();
    await loadGroupDetail(selectedGroupId);
    setDetailStatus("User invited successfully.", "ok");
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

deleteGroupButton.addEventListener("click", async () => {
  if (!selectedGroupId) return;

  const confirmed = window.confirm("Delete this group and all linked group data?");
  if (!confirmed) return;

  setDetailStatus("Deleting group...");
  try {
    await deleteGroup(selectedGroupId);
    selectedGroupId = null;
    await loadGroups();
    setDetailStatus("Group deleted.", "ok");
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

groupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  formStatus.className = "form-status";
  formStatus.textContent = "Creating group...";

  try {
    const created = await createGroup(nameInput.value, addressInput.value);
    formStatus.classList.add("ok");
    formStatus.textContent = "Group created and you were added as admin.";
    groupForm.reset();
    await loadGroups(created.group_id);
  } catch (error) {
    formStatus.classList.add("error");
    formStatus.textContent = error.message;
  }
});

Promise.all([loadSession(), loadGroups()]).catch((error) => {
  formStatus.className = "form-status error";
  formStatus.textContent = error.message;
});

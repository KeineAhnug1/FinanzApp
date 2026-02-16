const sessionUserBadge = document.getElementById("sessionUserBadge");
const groupsList = document.getElementById("groupsList");
const mainView = document.getElementById("mainView");
const detailView = document.getElementById("detailView");

const openInboxButton = document.getElementById("openInboxButton");
const inboxIndicator = document.getElementById("inboxIndicator");
const openCreateGroupButton = document.getElementById("openCreateGroupButton");
const backToGroupsButton = document.getElementById("backToGroupsButton");
const leaveGroupButton = document.getElementById("leaveGroupButton");
const openInviteWindowButton = document.getElementById("openInviteWindowButton");

const inboxModal = document.getElementById("inboxModal");
const closeInboxButton = document.getElementById("closeInboxButton");
const inboxInvitations = document.getElementById("inboxInvitations");
const inboxStatus = document.getElementById("inboxStatus");

const createGroupModal = document.getElementById("createGroupModal");
const closeCreateGroupButton = document.getElementById("closeCreateGroupButton");
const groupForm = document.getElementById("groupForm");
const nameInput = document.getElementById("nameInput");
const addressInput = document.getElementById("addressInput");
const formStatus = document.getElementById("formStatus");

const inviteModal = document.getElementById("inviteModal");
const closeInviteButton = document.getElementById("closeInviteButton");
const inviteForm = document.getElementById("inviteForm");
const inviteUsernameInput = document.getElementById("inviteUsernameInput");

const groupDetailEmpty = document.getElementById("groupDetailEmpty");
const groupDetailContent = document.getElementById("groupDetailContent");
const groupDetailName = document.getElementById("groupDetailName");
const groupDetailAddress = document.getElementById("groupDetailAddress");
const groupDetailCreated = document.getElementById("groupDetailCreated");
const membersList = document.getElementById("membersList");
const groupActivitiesList = document.getElementById("groupActivitiesList");
const groupFundingsList = document.getElementById("groupFundingsList");
const groupExpensesList = document.getElementById("groupExpensesList");
const fundingTransactionsList = document.getElementById("fundingTransactionsList");
const fundingDetailEmpty = document.getElementById("fundingDetailEmpty");
const fundingDetailContent = document.getElementById("fundingDetailContent");
const fundingDetailTitle = document.getElementById("fundingDetailTitle");
const fundingDetailMeta = document.getElementById("fundingDetailMeta");
const memberActionsPanel = document.getElementById("memberActionsPanel");
const adminPanel = document.getElementById("adminPanel");
const expensePanel = document.getElementById("expensePanel");
const deleteGroupButton = document.getElementById("deleteGroupButton");
const detailStatus = document.getElementById("detailStatus");

const activityForm = document.getElementById("activityForm");
const activityInfoInput = document.getElementById("activityInfoInput");
const activityDateInput = document.getElementById("activityDateInput");

const fundingForm = document.getElementById("fundingForm");
const fundingInfoInput = document.getElementById("fundingInfoInput");
const fundingActivitySelect = document.getElementById("fundingActivitySelect");

const donationForm = document.getElementById("donationForm");
const donationFundingSelect = document.getElementById("donationFundingSelect");
const donationAmountInput = document.getElementById("donationAmountInput");

const expenseForm = document.getElementById("expenseForm");
const expenseFundingSelect = document.getElementById("expenseFundingSelect");
const expenseAmountInput = document.getElementById("expenseAmountInput");
const expenseInfoInput = document.getElementById("expenseInfoInput");
const expenseDueDateInput = document.getElementById("expenseDueDateInput");

const detailTabButtons = Array.from(document.querySelectorAll("[data-detail-tab-target]"));
const detailTabPanels = Array.from(document.querySelectorAll("[data-detail-tab-content]"));

let groupsState = [];
let invitationsState = [];
let selectedGroupId = null;
let selectedGroupDetail = null;
let selectedFundingId = null;
let activeDetailTab = "members";
let sessionUser = null;

function normalizeMemberStatus(status) {
  if (status === "active") return "accepted";
  if (status === "denialed") return "denied";
  return status || "accepted";
}

function formatDate(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatAmount(value) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value));
}

function setDetailStatus(message, type = "") {
  detailStatus.className = "form-status";
  if (type) {
    detailStatus.classList.add(type);
  }
  detailStatus.textContent = message || "";
}

function setInboxStatus(message, type = "") {
  inboxStatus.className = "form-status";
  if (type) {
    inboxStatus.classList.add(type);
  }
  inboxStatus.textContent = message || "";
}

function updateInboxIndicator(invitations = []) {
  const count = invitations.length;
  const hasInvitations = count > 0;

  openInboxButton.classList.toggle("has-pending", hasInvitations);
  openInboxButton.setAttribute("aria-label", hasInvitations ? `Inbox with ${count} pending invitations` : "Inbox");

  if (!inboxIndicator) return;
  inboxIndicator.hidden = !hasInvitations;
  inboxIndicator.textContent = count > 9 ? "9+" : String(count);
}

function switchDetailTab(tabName) {
  activeDetailTab = tabName;
  for (const button of detailTabButtons) {
    button.classList.toggle("is-active", button.dataset.detailTabTarget === tabName);
  }
  for (const panel of detailTabPanels) {
    panel.classList.toggle("is-active", panel.dataset.detailTabContent === tabName);
  }
}

function showMainView() {
  mainView.hidden = false;
  detailView.hidden = true;
}

function showDetailView() {
  mainView.hidden = true;
  detailView.hidden = false;
}

function openModal(modal) {
  modal.hidden = false;
}

function closeModal(modal) {
  modal.hidden = true;
}

function formatActivityOption(activity) {
  if (!activity) return "";
  const info = activity.info || "Untitled activity";
  if (!activity.date) return info;
  return `${info} (${formatDate(activity.date)})`;
}

function renderFundingActivityOptions(activities = []) {
  fundingActivitySelect.innerHTML = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "No linked activity";
  fundingActivitySelect.appendChild(emptyOption);

  for (const activity of activities) {
    const option = document.createElement("option");
    option.value = activity.activity_id;
    option.textContent = formatActivityOption(activity);
    fundingActivitySelect.appendChild(option);
  }
}

function renderFundingSelects(fundings = []) {
  donationFundingSelect.innerHTML = "";
  expenseFundingSelect.innerHTML = "";

  const donationEmpty = document.createElement("option");
  donationEmpty.value = "";
  donationEmpty.textContent = "Select funding";
  donationFundingSelect.appendChild(donationEmpty);

  const expenseEmpty = document.createElement("option");
  expenseEmpty.value = "";
  expenseEmpty.textContent = "Select funding";
  expenseFundingSelect.appendChild(expenseEmpty);

  for (const funding of fundings) {
    const label = `${funding.info || "Funding entry"} (${formatAmount(funding.amount)})`;

    const donationOption = document.createElement("option");
    donationOption.value = funding.funding_id;
    donationOption.textContent = label;
    donationFundingSelect.appendChild(donationOption);

    const expenseOption = document.createElement("option");
    expenseOption.value = funding.funding_id;
    expenseOption.textContent = label;
    expenseFundingSelect.appendChild(expenseOption);
  }
}

function renderActivities(activities = []) {
  groupActivitiesList.innerHTML = "";

  if (!activities.length) {
    const empty = document.createElement("li");
    empty.className = "member-item";
    empty.innerHTML = "<p class=\"meta\">No activities yet.</p>";
    groupActivitiesList.appendChild(empty);
    return;
  }

  for (const activity of activities) {
    const item = document.createElement("li");
    item.className = "member-item";
    item.innerHTML = `
      <div>
        <p class="member-name">${activity.info || "Untitled activity"}</p>
        <p class="meta">Date: ${formatDate(activity.date)}</p>
        <p class="meta">Created: ${formatDate(activity.created_at)}</p>
      </div>
    `;
    groupActivitiesList.appendChild(item);
  }
}

function renderFundings(fundings = []) {
  groupFundingsList.innerHTML = "";

  if (!fundings.length) {
    const empty = document.createElement("li");
    empty.className = "member-item";
    empty.innerHTML = "<p class=\"meta\">No fundings yet.</p>";
    groupFundingsList.appendChild(empty);
    return;
  }

  for (const funding of fundings) {
    const item = document.createElement("li");
    item.className = "member-item funding-item";
    if (funding.funding_id === selectedFundingId) {
      item.classList.add("is-active");
    }

    item.innerHTML = `
      <div>
        <p class="member-name">${funding.info || "Funding entry"}</p>
        <p class="meta">Current balance: ${formatAmount(funding.amount)}</p>
        <p class="meta">Total donated: ${formatAmount(funding.total_donated)}</p>
        <p class="meta">Created: ${formatDate(funding.created_at)}</p>
      </div>
      <button type="button" class="select-funding-button" data-funding-id="${funding.funding_id}">Open details</button>
    `;
    groupFundingsList.appendChild(item);
  }
}

function renderFundingDetail(detail) {
  const fundings = detail?.fundings || [];
  const selectedFunding = fundings.find((funding) => funding.funding_id === selectedFundingId) || null;

  if (!selectedFunding) {
    fundingDetailEmpty.hidden = false;
    fundingDetailContent.hidden = true;
    groupExpensesList.innerHTML = "";
    fundingTransactionsList.innerHTML = "";
    return;
  }

  const linkedActivity = selectedFunding.linked_activity
    ? formatActivityOption(selectedFunding.linked_activity)
    : "No linked activity";
  const contributions = (selectedFunding.contributions || [])
    .map((entry) => `${entry.username}: ${formatAmount(entry.amount)}`)
    .join(", ");

  fundingDetailEmpty.hidden = true;
  fundingDetailContent.hidden = false;
  fundingDetailTitle.textContent = selectedFunding.info || "Funding entry";
  fundingDetailMeta.textContent = `Balance: ${formatAmount(selectedFunding.amount)} | Linked activity: ${linkedActivity} | Donors: ${contributions || "No donations yet"}`;

  const selectedExpenses = (detail.expenses || [])
    .filter((expense) => expense.group_funding_id === selectedFunding.funding_id);
  const selectedTransactions = (detail.funding_transactions || [])
    .filter((transaction) => transaction.group_funding_id === selectedFunding.funding_id);

  renderExpenses(selectedExpenses);
  renderFundingTransactions(selectedTransactions);
}

function renderExpenses(expenses = []) {
  groupExpensesList.innerHTML = "";

  if (!expenses.length) {
    const empty = document.createElement("li");
    empty.className = "member-item";
    empty.innerHTML = "<p class=\"meta\">No expenses paid from fundings yet.</p>";
    groupExpensesList.appendChild(empty);
    return;
  }

  for (const expense of expenses) {
    const item = document.createElement("li");
    item.className = "member-item";
    item.innerHTML = `
      <div>
        <p class="member-name">${expense.info || "Group expense"}</p>
        <p class="meta">Funding: ${expense.funding_info || "n/a"}</p>
        <p class="meta">Amount: ${formatAmount(expense.amount)}</p>
        <p class="meta">State: ${expense.state || "n/a"}</p>
        <p class="meta">Due date: ${formatDate(expense.due_date)}</p>
        <p class="meta">Created: ${formatDate(expense.created_at)}</p>
      </div>
    `;
    groupExpensesList.appendChild(item);
  }
}

function renderFundingTransactions(transactions = []) {
  fundingTransactionsList.innerHTML = "";

  if (!transactions.length) {
    const empty = document.createElement("li");
    empty.className = "member-item";
    empty.innerHTML = "<p class=\"meta\">No funding payments yet.</p>";
    fundingTransactionsList.appendChild(empty);
    return;
  }

  for (const transaction of transactions) {
    const item = document.createElement("li");
    item.className = "member-item";
    item.innerHTML = `
      <div>
        <p class="member-name">${transaction.expense_info || "Funding payment"}</p>
        <p class="meta">Funding: ${transaction.funding_info || "n/a"}</p>
        <p class="meta">Paid amount: ${formatAmount(transaction.amount)}</p>
        <p class="meta">Transaction date: ${formatDate(transaction.created_at)}</p>
      </div>
    `;
    fundingTransactionsList.appendChild(item);
  }
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
      <p class="meta"><strong>Status:</strong> ${normalizeMemberStatus(group.status)}</p>
      <p class="meta"><strong>Address:</strong> ${group.address || "n/a"}</p>
      <button type="button" class="select-group-button" data-group-id="${group.group_id}">Open details</button>
    `;
    groupsList.appendChild(card);
  }
}

function renderInvitations(invitations) {
  inboxInvitations.innerHTML = "";

  if (!invitations.length) {
    const empty = document.createElement("li");
    empty.className = "member-item";
    empty.innerHTML = "<p class=\"meta\">No pending invitations.</p>";
    inboxInvitations.appendChild(empty);
    return;
  }

  for (const invitation of invitations) {
    const item = document.createElement("li");
    item.className = "member-item";
    item.innerHTML = `
      <div>
        <p class="member-name">${invitation.group_name}</p>
        <p class="meta">Status: ${normalizeMemberStatus(invitation.status)} | Role: ${invitation.role}</p>
        <p class="meta">Address: ${invitation.group_address || "n/a"}</p>
      </div>
      <div class="inbox-actions">
        <button type="button" class="accept-invite-button" data-group-id="${invitation.group_id}">Accept</button>
        <button type="button" class="small-danger-button deny-invite-button" data-group-id="${invitation.group_id}">Deny</button>
      </div>
    `;
    inboxInvitations.appendChild(item);
  }
}

function renderGroupDetail(detail) {
  selectedGroupDetail = detail;

  if (!detail) {
    groupDetailEmpty.hidden = false;
    groupDetailContent.hidden = true;
    openInviteWindowButton.hidden = true;
    leaveGroupButton.hidden = true;
    selectedFundingId = null;
    groupActivitiesList.innerHTML = "";
    groupFundingsList.innerHTML = "";
    fundingDetailEmpty.hidden = false;
    fundingDetailContent.hidden = true;
    renderFundingActivityOptions([]);
    renderFundingSelects([]);
    return;
  }

  groupDetailEmpty.hidden = true;
  groupDetailContent.hidden = false;
  groupDetailName.textContent = detail.group.name;
  groupDetailAddress.textContent = `Address: ${detail.group.address || "n/a"}`;
  groupDetailCreated.textContent = `Created: ${formatDate(detail.group.created_at)}`;
  leaveGroupButton.hidden = false;

  memberActionsPanel.hidden = false;
  adminPanel.hidden = !detail.is_admin;
  expensePanel.hidden = !detail.is_admin;
  openInviteWindowButton.hidden = !detail.is_admin;

  renderFundingActivityOptions(detail.activities || []);
  renderFundingSelects(detail.fundings || []);
  renderActivities(detail.activities || []);
  if (selectedFundingId && !(detail.fundings || []).some((funding) => funding.funding_id === selectedFundingId)) {
    selectedFundingId = null;
  }
  renderFundings(detail.fundings || []);
  renderFundingDetail(detail);

  membersList.innerHTML = "";

  for (const member of detail.members) {
    const item = document.createElement("li");
    item.className = "member-item";
    const isSessionUser = member.user_id === detail.session_user_id;
    const fullName = `${member.first_name || ""} ${member.last_name || ""}`.trim();
    const identity = fullName ? `${member.username} (${fullName})` : member.username;

    item.innerHTML = `
      <div>
        <p class="member-name">${identity}${isSessionUser ? " (you)" : ""}</p>
        <p class="meta">Role: ${member.role} | Status: ${normalizeMemberStatus(member.status)}</p>
      </div>
    `;

    if (detail.is_admin && !isSessionUser) {
      if (member.role !== "admin" && normalizeMemberStatus(member.status) === "accepted") {
        const promoteButton = document.createElement("button");
        promoteButton.type = "button";
        promoteButton.className = "small-secondary-button promote-admin-button";
        promoteButton.dataset.userId = member.user_id;
        promoteButton.textContent = "Make admin";
        item.appendChild(promoteButton);
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "small-danger-button remove-member-button";
      button.dataset.userId = member.user_id;
      button.textContent = "Kick out";
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
  sessionUser = payload.session_user || null;
  if (sessionUserBadge) {
    const username = sessionUser?.username || "unknown";
    sessionUserBadge.textContent = `Session: ${username}`;
  }
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
  }

  renderGroups(groupsState);
}

async function loadInvitations() {
  const response = await fetch("/api/inbox/invitations");
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not load invitations");
  }

  invitationsState = payload.invitations || [];
  updateInboxIndicator(invitationsState);
  renderInvitations(invitationsState);
}

async function createGroup(name, address) {
  const response = await fetch("/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, address })
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

async function createGroupActivity(groupId, info, date) {
  const response = await fetch(`/api/groups/${groupId}/activities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ info, date: date || null })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not create activity");
  }
}

async function createGroupFunding(groupId, info, groupActivityId) {
  const response = await fetch(`/api/groups/${groupId}/funding`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      info: info || null,
      group_activity_id: groupActivityId || null
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not create funding");
  }
}

async function promoteMemberToAdmin(groupId, userId) {
  const response = await fetch(`/api/groups/${groupId}/members/${userId}/promote-admin`, {
    method: "POST"
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not promote participant to admin");
  }
}

async function donateToFunding(groupId, fundingId, amount) {
  const response = await fetch(`/api/groups/${groupId}/funding/${fundingId}/donate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not process donation");
  }
}

async function createGroupExpense(groupId, groupFundingId, amount, info, dueDate) {
  const response = await fetch(`/api/groups/${groupId}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      group_funding_id: groupFundingId,
      amount,
      info: info || null,
      due_date: dueDate || null
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not create paid expense");
  }
}

async function acceptInvitation(groupId) {
  const response = await fetch(`/api/inbox/invitations/${groupId}/accept`, {
    method: "POST"
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not accept invitation");
  }
}

async function denyInvitation(groupId) {
  const response = await fetch(`/api/inbox/invitations/${groupId}/deny`, {
    method: "POST"
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not deny invitation");
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

async function leaveGroup(groupId) {
  const response = await fetch(`/api/groups/${groupId}/leave`, {
    method: "POST"
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Could not leave group");
  }
}

async function openGroupDetail(groupId) {
  selectedGroupId = groupId;
  selectedFundingId = null;
  renderGroups(groupsState);
  setDetailStatus("");
  switchDetailTab("members");
  showDetailView();
  await loadGroupDetail(groupId);
}

for (const button of detailTabButtons) {
  button.addEventListener("click", () => {
    const tabName = button.dataset.detailTabTarget;
    if (!tabName || tabName === activeDetailTab) return;
    switchDetailTab(tabName);
  });
}

openInboxButton.addEventListener("click", async () => {
  try {
    await loadInvitations();
    setInboxStatus("");
    openModal(inboxModal);
  } catch (error) {
    setInboxStatus(error.message, "error");
    openModal(inboxModal);
  }
});

openCreateGroupButton.addEventListener("click", () => {
  formStatus.className = "form-status";
  formStatus.textContent = "";
  openModal(createGroupModal);
});

backToGroupsButton.addEventListener("click", () => {
  showMainView();
});

openInviteWindowButton.addEventListener("click", () => {
  if (!selectedGroupDetail || !selectedGroupDetail.is_admin) return;
  openModal(inviteModal);
});

closeInboxButton.addEventListener("click", () => closeModal(inboxModal));
closeCreateGroupButton.addEventListener("click", () => closeModal(createGroupModal));
closeInviteButton.addEventListener("click", () => closeModal(inviteModal));

for (const modal of [inboxModal, createGroupModal, inviteModal]) {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal(modal);
    }
  });
}

groupsList.addEventListener("click", async (event) => {
  const button = event.target.closest(".select-group-button");
  if (!button) return;

  const groupId = button.dataset.groupId;
  if (!groupId) return;

  try {
    await openGroupDetail(groupId);
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

groupFundingsList.addEventListener("click", (event) => {
  const button = event.target.closest(".select-funding-button");
  if (!button || !selectedGroupDetail) return;
  const fundingId = button.dataset.fundingId;
  if (!fundingId) return;

  selectedFundingId = fundingId;
  renderFundings(selectedGroupDetail.fundings || []);
  renderFundingDetail(selectedGroupDetail);
});

inboxInvitations.addEventListener("click", async (event) => {
  const acceptButton = event.target.closest(".accept-invite-button");
  const denyButton = event.target.closest(".deny-invite-button");
  const button = acceptButton || denyButton;
  if (!button) return;

  const groupId = button.dataset.groupId;
  if (!groupId) return;

  const isAccept = button.classList.contains("accept-invite-button");
  setInboxStatus(isAccept ? "Accepting invitation..." : "Denying invitation...");

  try {
    if (isAccept) {
      await acceptInvitation(groupId);
      setInboxStatus("Invitation accepted.", "ok");
    } else {
      await denyInvitation(groupId);
      setInboxStatus("Invitation denied.", "ok");
    }
    await Promise.all([loadInvitations(), loadGroups()]);
  } catch (error) {
    setInboxStatus(error.message, "error");
  }
});

membersList.addEventListener("click", async (event) => {
  const removeButton = event.target.closest(".remove-member-button");
  const promoteButton = event.target.closest(".promote-admin-button");
  const button = removeButton || promoteButton;
  if (!button || !selectedGroupDetail || !selectedGroupId) return;

  const userId = button.dataset.userId;
  if (!userId) return;

  const isPromote = button.classList.contains("promote-admin-button");
  setDetailStatus(isPromote ? "Promoting participant to admin..." : "Removing participant...");
  try {
    if (isPromote) {
      await promoteMemberToAdmin(selectedGroupId, userId);
    } else {
      await removeMember(selectedGroupId, userId);
    }
    await loadGroupDetail(selectedGroupId);
    setDetailStatus(isPromote ? "Participant is now admin." : "Participant removed from group.", "ok");
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
    closeModal(inviteModal);
    await Promise.all([loadGroupDetail(selectedGroupId), loadInvitations()]);
    setDetailStatus("User invited successfully.", "ok");
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

activityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedGroupId) return;

  setDetailStatus("Creating activity...");
  try {
    await createGroupActivity(selectedGroupId, activityInfoInput.value, activityDateInput.value);
    activityForm.reset();
    await loadGroupDetail(selectedGroupId);
    setDetailStatus("Group activity created.", "ok");
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

fundingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedGroupId) return;

  setDetailStatus("Creating funding...");
  try {
    await createGroupFunding(
      selectedGroupId,
      fundingInfoInput.value.trim(),
      fundingActivitySelect.value
    );
    fundingForm.reset();
    await loadGroupDetail(selectedGroupId);
    setDetailStatus("Group funding created.", "ok");
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

donationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedGroupId) return;

  setDetailStatus("Saving donation...");
  try {
    await donateToFunding(selectedGroupId, donationFundingSelect.value, donationAmountInput.value.trim());
    donationForm.reset();
    await loadGroupDetail(selectedGroupId);
    setDetailStatus("Donation was added to the funding.", "ok");
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedGroupId) return;
  if (!selectedGroupDetail?.is_admin) {
    setDetailStatus("Only admins can create group expenses.", "error");
    return;
  }

  setDetailStatus("Creating paid group expense...");
  try {
    await createGroupExpense(
      selectedGroupId,
      expenseFundingSelect.value,
      expenseAmountInput.value.trim(),
      expenseInfoInput.value.trim(),
      expenseDueDateInput.value
    );
    expenseForm.reset();
    await loadGroupDetail(selectedGroupId);
    setDetailStatus("Group expense created and booked as funding payment.", "ok");
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

deleteGroupButton.addEventListener("click", async () => {
  if (!selectedGroupId) return;
  if (!selectedGroupDetail?.is_admin) {
    setDetailStatus("Only admins can delete groups.", "error");
    return;
  }

  const confirmed = window.confirm("Delete this group and all linked group data?");
  if (!confirmed) return;

  setDetailStatus("Deleting group...");
  try {
    await deleteGroup(selectedGroupId);
    selectedGroupId = null;
    renderGroupDetail(null);
    await loadGroups();
    showMainView();
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

leaveGroupButton.addEventListener("click", async () => {
  if (!selectedGroupId) return;

  const confirmed = window.confirm("Leave this group?");
  if (!confirmed) return;

  setDetailStatus("Leaving group...");
  try {
    await leaveGroup(selectedGroupId);
    selectedGroupId = null;
    renderGroupDetail(null);
    await loadGroups();
    showMainView();
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
    groupForm.reset();
    closeModal(createGroupModal);
    await loadGroups(created.group_id);
    await openGroupDetail(created.group_id);
    formStatus.classList.add("ok");
    formStatus.textContent = "Group created and you were added as admin.";
  } catch (error) {
    formStatus.classList.add("error");
    formStatus.textContent = error.message;
  }
});

switchDetailTab(activeDetailTab);
showMainView();

Promise.all([loadSession(), loadGroups(), loadInvitations()]).catch((error) => {
  formStatus.className = "form-status error";
  formStatus.textContent = error.message;
});

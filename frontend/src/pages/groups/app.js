import "@shared/js/topbar.js";
import { createT, getLocale } from "@shared/js/language-utils.js";
import { getCurrentUserFromStorage } from "@shared/js/session-utils.js";
import { requestJson, requestJsonMerged, toastSuccess, toastError } from "@shared/js/api-client.js";
import { formatFromEur } from "@shared/js/currency-utils.js";
import { escapeHtml } from "@shared/js/html-utils.js";

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
const groupChatViewport = document.getElementById("groupChatViewport");
const groupChatMessages = document.getElementById("groupChatMessages");
const groupChatForm = document.getElementById("groupChatForm");
const groupChatInput = document.getElementById("groupChatInput");
const groupChatStatus = document.getElementById("groupChatStatus");
const fundingDetailEmpty = document.getElementById("fundingDetailEmpty");
const fundingDetailContent = document.getElementById("fundingDetailContent");
const fundingDetailTitle = document.getElementById("fundingDetailTitle");
const fundingDetailMeta = document.getElementById("fundingDetailMeta");
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

const DETAIL_TAB_OPTIONS = new Set(["members", "activities", "fundings", "chat"]);
const SETTINGS_STORAGE_PREFIX = "finanzapp.dashboardSettings";
const GROUPS_VIEW_STORAGE_PREFIX = "finanzapp.groupsView";
const SETTINGS_LOCALE_OPTIONS = new Set(["de-DE", "en-US"]);
const DEFAULT_GROUPS_VIEW_STATE = {
  isDetailOpen: false,
  selectedGroupId: "",
  activeDetailTab: "members",
};
const initialGroupsViewState = loadGroupsViewState(getCurrentUserFromStorage()?.id);

let groupsState = [];
let invitationsState = [];
let selectedGroupId = null;
let selectedGroupDetail = null;
let selectedFundingId = null;
let activeDetailTab = "members";
let sessionUser = null;
let groupChatState = {
  groupId: "",
  messages: [],
  hasOlder: false,
  oldestMessageId: null,
  loadingOlder: false,
  readyForOlderLoad: false,
  hasLoadedOlderHistory: false,
  refreshing: false,
};
const GROUP_CHAT_REFRESH_INTERVAL_MS = 3000;
let groupChatRefreshTimer = null;
const DEFAULT_GROUP_LOCALE_SETTINGS = {
  locale: "de-DE",
};
let groupLocaleSettings = { ...DEFAULT_GROUP_LOCALE_SETTINGS };

const t = createT();

function groupsViewStorageKey(userId) {
  return `${GROUPS_VIEW_STORAGE_PREFIX}.${userId || "anonymous"}`;
}

function normalizeGroupsViewState(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  const tab = String(base.activeDetailTab || "").trim();
  return {
    isDetailOpen: Boolean(base.isDetailOpen),
    selectedGroupId: String(base.selectedGroupId || "").trim(),
    activeDetailTab: DETAIL_TAB_OPTIONS.has(tab) ? tab : "members",
  };
}

function loadGroupsViewState(userId) {
  const raw = window.localStorage.getItem(groupsViewStorageKey(userId));
  if (!raw) return { ...DEFAULT_GROUPS_VIEW_STATE };
  try {
    return normalizeGroupsViewState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GROUPS_VIEW_STATE };
  }
}

function saveGroupsViewState(userId, state) {
  const normalized = normalizeGroupsViewState(state);
  window.localStorage.setItem(groupsViewStorageKey(userId), JSON.stringify(normalized));
}

function persistGroupsViewState(override = {}) {
  const userId = sessionUser?.id || getCurrentUserFromStorage()?.id;
  const current = {
    isDetailOpen: !detailView.hidden,
    selectedGroupId: selectedGroupId ? String(selectedGroupId) : "",
    activeDetailTab,
  };
  saveGroupsViewState(userId, { ...current, ...override });
}

function sanitizeSettingChoice(value, allowedValues, fallback) {
  const normalized = String(value || "").trim();
  return allowedValues.has(normalized) ? normalized : fallback;
}

function normalizeGroupLocaleSettings(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  return {
    locale: sanitizeSettingChoice(
      base.locale,
      SETTINGS_LOCALE_OPTIONS,
      DEFAULT_GROUP_LOCALE_SETTINGS.locale
    ),
  };
}

function settingsStorageKey(userId) {
  return `${SETTINGS_STORAGE_PREFIX}.${userId || "anonymous"}`;
}

function loadGroupLocaleSettings(userId) {
  const raw = window.localStorage.getItem(settingsStorageKey(userId));
  if (!raw) return { ...DEFAULT_GROUP_LOCALE_SETTINGS };
  try {
    return normalizeGroupLocaleSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GROUP_LOCALE_SETTINGS };
  }
}

function applyGroupLocaleSettings(userId) {
  groupLocaleSettings = loadGroupLocaleSettings(userId);
  groupLocaleSettings.locale = getLocale(userId);
  document.documentElement.lang = groupLocaleSettings.locale;
}

function rerenderAfterLocaleChange() {
  renderGroups(groupsState);
  renderInvitations(invitationsState);
  if (selectedGroupDetail) {
    renderGroupDetail(selectedGroupDetail);
  }
}

function normalizeMemberStatus(status) {
  if (status === "active") return "accepted";
  if (status === "denialed") return "denied";
  return status || "accepted";
}

function formatMemberStatus(status) {
  const normalized = normalizeMemberStatus(status);
  if (normalized === "accepted") return t("groups.status.accepted");
  if (normalized === "denied") return t("groups.status.denied");
  if (normalized === "pending") return t("groups.status.pending");
  return normalized;
}

function formatDate(value) {
  if (!value) return t("groups.na");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("groups.na");
  return new Intl.DateTimeFormat(groupLocaleSettings.locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatAmount(value) {
  if (value == null || Number.isNaN(Number(value))) return t("groups.na");
  return formatFromEur(Number(value), {
    locale: groupLocaleSettings.locale,
  });
}

function setDetailStatus(message, type = "") {
  detailStatus.className = "form-status";
  if (type) {
    detailStatus.classList.add(type);
  }
  detailStatus.textContent = message || "";
  if (type === "ok" && message) toastSuccess(message);
  if (type === "error" && message) toastError(message);
}

function setInboxStatus(message, type = "") {
  inboxStatus.className = "form-status";
  if (type) {
    inboxStatus.classList.add(type);
  }
  inboxStatus.textContent = message || "";
  if (type === "ok" && message) toastSuccess(message);
  if (type === "error" && message) toastError(message);
}

function setGroupChatStatus(message, type = "") {
  groupChatStatus.className = "form-status";
  if (type) {
    groupChatStatus.classList.add(type);
  }
  groupChatStatus.textContent = message || "";
  if (type === "ok" && message) toastSuccess(message);
  if (type === "error" && message) toastError(message);
}

function resetGroupChatState(groupId = "") {
  groupChatState = {
    groupId: String(groupId || ""),
    messages: [],
    hasOlder: false,
    oldestMessageId: null,
    loadingOlder: false,
    readyForOlderLoad: false,
    hasLoadedOlderHistory: false,
    refreshing: false,
  };
}

function stopGroupChatLiveUpdates() {
  if (groupChatRefreshTimer) {
    clearInterval(groupChatRefreshTimer);
    groupChatRefreshTimer = null;
  }
}

function isGroupChatNearBottom() {
  const threshold = 64;
  const distanceToBottom =
    groupChatViewport.scrollHeight - groupChatViewport.scrollTop - groupChatViewport.clientHeight;
  return distanceToBottom <= threshold;
}

function mergeChatMessages(existing = [], incoming = []) {
  const mergedById = new Map();
  for (const entry of existing) {
    mergedById.set(String(entry.message_id), entry);
  }
  for (const entry of incoming) {
    mergedById.set(String(entry.message_id), entry);
  }

  return [...mergedById.values()].sort((left, right) => {
    const leftTime = new Date(left.created_at || 0).getTime();
    const rightTime = new Date(right.created_at || 0).getTime();
    if (leftTime !== rightTime) return leftTime - rightTime;
    return String(left.message_id || "").localeCompare(String(right.message_id || ""));
  });
}

async function refreshGroupChatLiveMessages(options = {}) {
  const { silent = true } = options;
  if (!selectedGroupId || !groupChatState.groupId) return;
  if (String(selectedGroupId) !== groupChatState.groupId) return;
  if (groupChatState.loadingOlder || groupChatState.refreshing) return;

  groupChatState.refreshing = true;
  try {
    const payload = await fetchGroupMessages(selectedGroupId, { limit: 40 });
    if (String(selectedGroupId || "") !== groupChatState.groupId) return;

    const latestMessages = Array.isArray(payload.messages) ? payload.messages : [];
    const nextMessages = mergeChatMessages(groupChatState.messages, latestMessages);
    const hadMessagesBefore = groupChatState.messages.length > 0;
    const wasNearBottom = isGroupChatNearBottom();
    groupChatState.messages = nextMessages;

    if (!groupChatState.hasLoadedOlderHistory) {
      groupChatState.hasOlder = Boolean(payload.has_older);
      groupChatState.oldestMessageId = groupChatState.messages.length
        ? String(groupChatState.messages[0].message_id || "")
        : null;
    }

    renderGroupChatMessages();
    if (!hadMessagesBefore || wasNearBottom) {
      requestAnimationFrame(() => {
        groupChatViewport.scrollTop = groupChatViewport.scrollHeight;
      });
    }
  } catch (error) {
    if (!silent) {
      setGroupChatStatus(error.message, "error");
    }
  } finally {
    groupChatState.refreshing = false;
  }
}

function startGroupChatLiveUpdates() {
  stopGroupChatLiveUpdates();
  if (!selectedGroupId || !groupChatState.groupId) return;
  if (String(selectedGroupId || "") !== groupChatState.groupId) return;
  groupChatRefreshTimer = setInterval(() => {
    refreshGroupChatLiveMessages({ silent: true });
  }, GROUP_CHAT_REFRESH_INTERVAL_MS);
}

function renderGroupChatMessages() {
  groupChatMessages.innerHTML = "";
  const currentUserId = String(selectedGroupDetail?.session_user_id || sessionUser?.id || "");

  if (!groupChatState.messages.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "chat-item";
    const emptyBubble = document.createElement("div");
    emptyBubble.className = "chat-bubble";
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "chat-message";
    emptyMessage.textContent = t(
      "groups.no_chat_messages",
      "Noch keine Nachrichten im Gruppenchat."
    );
    emptyBubble.appendChild(emptyMessage);
    emptyItem.appendChild(emptyBubble);
    groupChatMessages.appendChild(emptyItem);
    return;
  }

  for (const entry of groupChatState.messages) {
    const item = document.createElement("li");
    item.className = "chat-item";
    const isOwn = String(entry.from_user_id) === currentUserId;
    if (isOwn) {
      item.classList.add("is-own");
    }

    const nameParts = [entry.first_name, entry.last_name].filter(Boolean);
    const displayName = nameParts.length
      ? `${entry.username} (${nameParts.join(" ")})`
      : entry.username || t("groups.unknown_user", "unbekannt");
    const editedSuffix = entry.edited ? ` • ${t("groups.edited", "bearbeitet")}` : "";

    const chatInitial = (entry.username || "?")[0].toUpperCase();
    const chatAvatarHtml = entry.profileImage
      ? `<div class="chat-avatar"><img src="${escapeHtml(entry.profileImage)}" alt="" /></div>`
      : `<div class="chat-avatar">${escapeHtml(chatInitial)}</div>`;

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";

    const author = document.createElement("p");
    author.className = "chat-author";
    author.textContent = displayName;
    bubble.appendChild(author);

    const message = document.createElement("p");
    if (entry.deleted_at) {
      message.className = "chat-message is-deleted";
      message.textContent = t("groups.message_deleted", "Nachricht gelöscht");
    } else {
      message.className = "chat-message";
      message.textContent = String(entry.message || "");
    }
    bubble.appendChild(message);

    const meta = document.createElement("p");
    meta.className = "chat-meta";
    meta.textContent = `${formatDate(entry.created_at)}${editedSuffix}`;
    bubble.appendChild(meta);

    if (isOwn && !entry.deleted_at) {
      const menu = document.createElement("div");
      menu.className = "msg-context-menu";
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "msg-context-delete";
      deleteBtn.textContent = t("groups.delete_message", "Löschen");
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteGroupChatMessage(entry.message_id);
        menu.hidden = true;
      });
      menu.appendChild(deleteBtn);
      menu.hidden = true;
      bubble.appendChild(menu);

      bubble.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = !menu.hidden;
        groupChatMessages.querySelectorAll(".msg-context-menu").forEach((m) => {
          m.hidden = true;
        });
        menu.hidden = isOpen;
      });
    }

    item.innerHTML = chatAvatarHtml;
    item.appendChild(bubble);
    groupChatMessages.appendChild(item);
  }
}

async function deleteGroupChatMessage(messageId) {
  const groupId = groupChatState.groupId;
  if (!groupId || !messageId) return;
  const result = await requestJson(
    `/api/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}`,
    { method: "DELETE" }
  );
  if (result.ok) {
    await refreshGroupChatLiveMessages({ silent: true });
  }
}

function updateInboxIndicator(invitations = []) {
  const count = invitations.length;
  const hasInvitations = count > 0;

  openInboxButton.classList.toggle("has-pending", hasInvitations);
  openInboxButton.setAttribute(
    "aria-label",
    hasInvitations
      ? t("groups.inbox.aria", "Posteingang mit {count} offenen Einladungen", { count })
      : t("groups.inbox.default", "Posteingang")
  );

  if (!inboxIndicator) return;
  inboxIndicator.hidden = !hasInvitations;
  inboxIndicator.textContent = count > 9 ? "9+" : String(count);
}

function switchDetailTab(tabName) {
  activeDetailTab = DETAIL_TAB_OPTIONS.has(tabName) ? tabName : "members";
  groupDetailContent.classList.toggle("is-chat-tab-active", activeDetailTab === "chat");
  for (const button of detailTabButtons) {
    const isActive = button.dataset.detailTabTarget === activeDetailTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.setAttribute("role", "tab");
  }
  for (const panel of detailTabPanels) {
    const isActive = panel.dataset.detailTabContent === activeDetailTab;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
    panel.setAttribute("role", "tabpanel");
  }
  persistGroupsViewState({ activeDetailTab });
}

function showMainView() {
  mainView.hidden = false;
  detailView.hidden = true;
  stopGroupChatLiveUpdates();
  persistGroupsViewState({ isDetailOpen: false });
}

function showDetailView() {
  mainView.hidden = true;
  detailView.hidden = false;
  persistGroupsViewState({ isDetailOpen: true });
}

function openModal(modal) {
  modal.hidden = false;
}

function closeModal(modal) {
  modal.hidden = true;
}

function formatActivityOption(activity) {
  if (!activity) return "";
  const info = activity.info || t("groups.activity_unnamed", "Unbenannte Aktivitaet");
  if (!activity.date) return info;
  return `${info} (${formatDate(activity.date)})`;
}

function renderFundingActivityOptions(activities = []) {
  if (!fundingActivitySelect) return;
  fundingActivitySelect.innerHTML = "";
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = t("select_activity", "Keine Aktivitaet");
  fundingActivitySelect.appendChild(emptyOption);
  for (const activity of activities) {
    const option = document.createElement("option");
    option.value = activity.group_activity_id;
    option.textContent = formatActivityOption(activity);
    fundingActivitySelect.appendChild(option);
  }
}

function renderFundingSelects(fundings = []) {
  donationFundingSelect.innerHTML = "";
  expenseFundingSelect.innerHTML = "";

  const donationEmpty = document.createElement("option");
  donationEmpty.value = "";
  donationEmpty.textContent = t("select_funding", "Finanzierung waehlen");
  donationFundingSelect.appendChild(donationEmpty);

  const expenseEmpty = document.createElement("option");
  expenseEmpty.value = "";
  expenseEmpty.textContent = t("select_funding", "Finanzierung waehlen");
  expenseFundingSelect.appendChild(expenseEmpty);

  for (const funding of fundings) {
    const label = `${funding.info || t("funding_entry", "Finanzierungseintrag")} (${formatAmount(funding.amount)})`;

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

function createEmptyBlock(icon, title, hint) {
  const wrap = document.createElement("div");
  wrap.className = "empty-block";
  const iconEl = document.createElement("span");
  iconEl.className = "empty-block-icon";
  iconEl.setAttribute("aria-hidden", "true");
  iconEl.textContent = icon;
  const titleEl = document.createElement("p");
  titleEl.className = "empty-block-title";
  titleEl.textContent = title;
  wrap.append(iconEl, titleEl);
  if (hint) {
    const hintEl = document.createElement("p");
    hintEl.className = "empty-block-hint";
    hintEl.textContent = hint;
    wrap.appendChild(hintEl);
  }
  return wrap;
}

function renderActivities(activities = []) {
  if (!groupActivitiesList) return;
  groupActivitiesList.innerHTML = "";

  if (!activities.length) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "member-item";
    emptyLi.appendChild(
      createEmptyBlock(
        "📅",
        t("no_activities_yet", "Keine Aktivitaeten"),
        "Erstelle eine Aktivitaet fuer diese Gruppe."
      )
    );
    groupActivitiesList.appendChild(emptyLi);
    return;
  }

  for (const activity of activities) {
    const info = escapeHtml(activity.info || t("groups.activity_unnamed", "Unbenannte Aktivitaet"));
    const date = escapeHtml(formatDate(activity.date));
    const createdAt = escapeHtml(formatDate(activity.created_at));
    const item = document.createElement("li");
    item.className = "member-item";
    item.innerHTML = `
      <div>
        <p class="member-name">${info}</p>
        <p class="meta">${escapeHtml(t("groups.date", "Datum"))}: ${date}</p>
        <p class="meta">${escapeHtml(t("groups.created", "Erstellt: {value}", { value: createdAt }))}</p>
      </div>
    `;
    groupActivitiesList.appendChild(item);
  }
}

function renderFundings(fundings = []) {
  groupFundingsList.innerHTML = "";

  if (!fundings.length) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "member-item";
    emptyLi.appendChild(
      createEmptyBlock(
        "💰",
        t("no_fundings_yet", "Keine Finanzierungen"),
        "Erstelle eine Finanzierung für diese Gruppe."
      )
    );
    groupFundingsList.appendChild(emptyLi);
    return;
  }

  for (const funding of fundings) {
    const safeFundingId = escapeHtml(String(funding.funding_id || ""));
    const infoLabel = escapeHtml(funding.info || t("funding_entry", "Finanzierungseintrag"));
    const currentAmount = escapeHtml(formatAmount(funding.amount));
    const donatedAmount = escapeHtml(formatAmount(funding.total_donated));
    const createdAt = escapeHtml(formatDate(funding.created_at));
    const item = document.createElement("li");
    item.className = "member-item funding-item";
    if (funding.funding_id === selectedFundingId) {
      item.classList.add("is-active");
    }

    item.innerHTML = `
      <div>
        <p class="member-name">${infoLabel}</p>
        <p class="meta">${escapeHtml(t("groups.current_balance", "Aktueller Kontostand"))}: ${currentAmount}</p>
        <p class="meta">${escapeHtml(t("groups.total_donated", "Insgesamt gespendet"))}: ${donatedAmount}</p>
        <p class="meta">${escapeHtml(t("groups.created", "Erstellt: {value}", { value: createdAt }))}</p>
      </div>
      <button type="button" class="select-funding-button" data-funding-id="${safeFundingId}">${escapeHtml(t("groups.open_details", "Details oeffnen"))}</button>
    `;
    groupFundingsList.appendChild(item);
  }
}

function renderFundingDetail(detail) {
  const fundings = detail?.fundings || [];
  const selectedFunding =
    fundings.find((funding) => funding.funding_id === selectedFundingId) || null;

  if (!selectedFunding) {
    fundingDetailEmpty.hidden = false;
    fundingDetailContent.hidden = true;
    groupExpensesList.innerHTML = "";
    fundingTransactionsList.innerHTML = "";
    return;
  }

  const linkedActivity = selectedFunding.linked_activity
    ? formatActivityOption(selectedFunding.linked_activity)
    : t("linked_activity_none", "Keine verknuepfte Aktivitaet");
  const contributions = (selectedFunding.contributions || [])
    .map((entry) => `${entry.username}: ${formatAmount(entry.amount)}`)
    .join(", ");

  fundingDetailEmpty.hidden = true;
  fundingDetailContent.hidden = false;
  fundingDetailTitle.textContent =
    selectedFunding.info || t("funding_entry", "Finanzierungseintrag");
  fundingDetailMeta.textContent = `${t("groups.balance", "Kontostand")}: ${formatAmount(selectedFunding.amount)} | ${t("groups.linked_activity", "Verknuepfte Aktivitaet")}: ${linkedActivity} | ${t("groups.donors", "Spender")}: ${contributions || t("groups.no_donations_yet", "Noch keine Spenden")}`;

  const selectedExpenses = (detail.expenses || []).filter(
    (expense) => expense.group_funding_id === selectedFunding.funding_id
  );
  const selectedTransactions = (detail.funding_transactions || []).filter(
    (transaction) => transaction.group_funding_id === selectedFunding.funding_id
  );

  renderExpenses(selectedExpenses);
  renderFundingTransactions(selectedTransactions);
}

function renderExpenses(expenses = []) {
  groupExpensesList.innerHTML = "";

  if (!expenses.length) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "member-item";
    emptyLi.appendChild(
      createEmptyBlock(
        "🧾",
        t("no_paid_expenses_yet", "Keine Ausgaben"),
        "Ausgaben erscheinen hier sobald Zahlungen vorhanden sind."
      )
    );
    groupExpensesList.appendChild(emptyLi);
    return;
  }

  for (const expense of expenses) {
    const infoLabel = escapeHtml(expense.info || t("group_expense", "Gruppenausgabe"));
    const fundingInfo = escapeHtml(expense.funding_info || t("groups.na", "k. A."));
    const amount = escapeHtml(formatAmount(expense.amount));
    const state = escapeHtml(expense.state || t("groups.na", "k. A."));
    const dueDate = escapeHtml(formatDate(expense.due_date));
    const createdAt = escapeHtml(formatDate(expense.created_at));
    const item = document.createElement("li");
    item.className = "member-item";
    item.innerHTML = `
      <div>
        <p class="member-name">${infoLabel}</p>
        <p class="meta">${escapeHtml(t("groups.funding", "Finanzierung"))}: ${fundingInfo}</p>
        <p class="meta">${escapeHtml(t("groups.amount", "Betrag"))}: ${amount}</p>
        <p class="meta">${escapeHtml(t("status", "Status"))}: ${state}</p>
        <p class="meta">${escapeHtml(t("groups.due_on", "Faellig am"))}: ${dueDate}</p>
        <p class="meta">${escapeHtml(t("groups.created", "Erstellt: {value}", { value: createdAt }))}</p>
      </div>
    `;
    groupExpensesList.appendChild(item);
  }
}

function renderFundingTransactions(transactions = []) {
  fundingTransactionsList.innerHTML = "";

  if (!transactions.length) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "member-item";
    emptyLi.appendChild(createEmptyBlock("📋", t("no_funding_payments_yet", "Keine Zahlungen")));
    fundingTransactionsList.appendChild(emptyLi);
    return;
  }

  for (const transaction of transactions) {
    const expenseInfo = escapeHtml(
      transaction.expense_info || t("funding_payment", "Finanzierungszahlung")
    );
    const fundingInfo = escapeHtml(transaction.funding_info || t("groups.na", "k. A."));
    const amount = escapeHtml(formatAmount(transaction.amount));
    const createdAt = escapeHtml(formatDate(transaction.created_at));
    const item = document.createElement("li");
    item.className = "member-item";
    item.innerHTML = `
      <div>
        <p class="member-name">${expenseInfo}</p>
        <p class="meta">${escapeHtml(t("groups.funding", "Finanzierung"))}: ${fundingInfo}</p>
        <p class="meta">${escapeHtml(t("groups.paid_amount", "Gezahlter Betrag"))}: ${amount}</p>
        <p class="meta">${escapeHtml(t("groups.transaction_date", "Transaktionsdatum"))}: ${createdAt}</p>
      </div>
    `;
    fundingTransactionsList.appendChild(item);
  }
}

function renderGroups(groups) {
  groupsList.innerHTML = "";

  if (!groups.length) {
    groupsList.appendChild(
      createEmptyBlock(
        "🏘",
        t("no_memberships_for_user", "Noch keine Gruppen"),
        "Erstelle eine Gruppe oder warte auf eine Einladung."
      )
    );
    return;
  }

  for (const group of groups) {
    const safeGroupId = escapeHtml(String(group.group_id || ""));
    const groupName = escapeHtml(group.name);
    const role = escapeHtml(group.role);
    const memberStatus = escapeHtml(formatMemberStatus(group.status));
    const address = escapeHtml(group.address || t("groups.na", "k. A."));
    const card = document.createElement("article");
    card.className = "group-card";
    if (String(group.group_id) === String(selectedGroupId || "")) {
      card.classList.add("is-active");
    }
    card.innerHTML = `
      <h3>${groupName}</h3>
      <p class="meta"><strong>${escapeHtml(t("groups.role", "Rolle"))}:</strong> ${role}</p>
      <p class="meta"><strong>${escapeHtml(t("status", "Status"))}:</strong> ${memberStatus}</p>
      <p class="meta"><strong>${escapeHtml(t("groups.address_label", "Adresse"))}:</strong> ${address}</p>
      <button type="button" class="select-group-button" data-group-id="${safeGroupId}">${escapeHtml(t("groups.open_details", "Details oeffnen"))}</button>
    `;
    groupsList.appendChild(card);
  }
}

function renderInvitations(invitations) {
  inboxInvitations.innerHTML = "";

  if (!invitations.length) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "member-item";
    emptyLi.appendChild(
      createEmptyBlock("✉", t("no_open_invitations", "Keine offenen Einladungen"))
    );
    inboxInvitations.appendChild(emptyLi);
    return;
  }

  for (const invitation of invitations) {
    const safeGroupId = escapeHtml(String(invitation.group_id || ""));
    const groupName = escapeHtml(invitation.group_name);
    const status = escapeHtml(formatMemberStatus(invitation.status));
    const role = escapeHtml(invitation.role);
    const address = escapeHtml(invitation.group_address || t("groups.na", "k. A."));
    const item = document.createElement("li");
    item.className = "member-item";
    item.innerHTML = `
      <div>
        <p class="member-name">${groupName}</p>
        <p class="meta">${escapeHtml(t("status", "Status"))}: ${status} | ${escapeHtml(t("groups.role", "Rolle"))}: ${role}</p>
        <p class="meta">${escapeHtml(t("groups.address_label", "Adresse"))}: ${address}</p>
      </div>
      <div class="inbox-actions">
        <button type="button" class="accept-invite-button" data-group-id="${safeGroupId}">${escapeHtml(t("groups.accept", "Annehmen"))}</button>
        <button type="button" class="small-danger-button deny-invite-button" data-group-id="${safeGroupId}">${escapeHtml(t("groups.deny", "Ablehnen"))}</button>
      </div>
    `;
    inboxInvitations.appendChild(item);
  }
}

function renderGroupDetail(detail) {
  selectedGroupDetail = detail;

  if (!detail) {
    stopGroupChatLiveUpdates();
    groupDetailEmpty.hidden = false;
    groupDetailContent.hidden = true;
    openInviteWindowButton.hidden = true;
    leaveGroupButton.hidden = true;
    selectedFundingId = null;
    groupFundingsList.innerHTML = "";
    if (groupActivitiesList) groupActivitiesList.innerHTML = "";
    fundingDetailEmpty.hidden = false;
    fundingDetailContent.hidden = true;
    renderFundingActivityOptions([]);
    renderFundingSelects([]);
    resetGroupChatState("");
    renderGroupChatMessages();
    setGroupChatStatus("");
    return;
  }

  groupDetailEmpty.hidden = true;
  groupDetailContent.hidden = false;
  groupDetailName.textContent = detail.group.name;
  groupDetailAddress.textContent = t("groups.address", "Adresse: {value}", {
    value: detail.group.address || t("groups.na", "k. A."),
  });
  groupDetailCreated.textContent = t("groups.created", "Erstellt: {value}", {
    value: formatDate(detail.group.created_at),
  });
  leaveGroupButton.hidden = false;

  adminPanel.hidden = !detail.is_admin;
  expensePanel.hidden = !detail.is_admin;
  openInviteWindowButton.hidden = !detail.is_admin;

  renderFundingActivityOptions(detail.activities || []);
  renderFundingSelects(detail.fundings || []);
  renderActivities(detail.activities || []);
  if (
    selectedFundingId &&
    !(detail.fundings || []).some((funding) => funding.funding_id === selectedFundingId)
  ) {
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
    const safeIdentity = escapeHtml(
      `${identity}${isSessionUser ? ` ${t("groups.you", "(du)")}` : ""}`
    );
    const safeRole = escapeHtml(member.role);
    const safeStatus = escapeHtml(formatMemberStatus(member.status));
    const userId = String(member.user_id || "");
    const memberInitials = escapeHtml(
      member.first_name && member.last_name
        ? `${member.first_name[0]}${member.last_name[0]}`.toUpperCase()
        : (member.first_name || member.last_name || member.username || "?")[0].toUpperCase()
    );
    const memberAvatarHtml = member.profileImage
      ? `<div class="member-avatar"><img src="${escapeHtml(member.profileImage)}" alt="" /></div>`
      : `<div class="member-avatar">${memberInitials}</div>`;

    item.innerHTML = `
      ${memberAvatarHtml}
      <div>
        <p class="member-name">${safeIdentity}</p>
        <p class="meta">${escapeHtml(t("groups.role", "Rolle"))}: ${safeRole} | ${escapeHtml(t("status", "Status"))}: ${safeStatus}</p>
      </div>
    `;

    if (detail.is_admin && !isSessionUser) {
      if (member.role !== "admin" && normalizeMemberStatus(member.status) === "accepted") {
        const promoteButton = document.createElement("button");
        promoteButton.type = "button";
        promoteButton.className = "small-secondary-button promote-admin-button";
        promoteButton.dataset.userId = userId;
        promoteButton.textContent = t("groups.make_admin", "Zum Admin machen");
        item.appendChild(promoteButton);
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "small-danger-button remove-member-button";
      button.dataset.userId = userId;
      button.textContent = t("groups.remove_member", "Entfernen");
      item.appendChild(button);
    }

    membersList.appendChild(item);
  }
}

async function requestApi(path, options = {}) {
  const payload = await requestJsonMerged(path, {
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body,
  });
  if (payload?.ok) {
    return payload;
  }

  if (payload?.status === 0) {
    throw new Error(t("groups.server_unreachable", "Server nicht erreichbar"));
  }
  throw new Error(
    String(
      payload?.message ||
        options.defaultMessage ||
        t("groups.request_failed", "Anfrage fehlgeschlagen")
    )
  );
}

async function loadSession() {
  const payload = await requestApi("/api/session", {
    defaultMessage: t("groups.session_load_failed", "Sitzung konnte nicht geladen werden"),
  });
  sessionUser = payload.session_user || null;
  applyGroupLocaleSettings(sessionUser?.id);
  rerenderAfterLocaleChange();
  if (sessionUserBadge) {
    const username = sessionUser?.username || t("groups.unknown_user", "unbekannt");
    sessionUserBadge.textContent = `${t("groups.session", "Sitzung")}: ${username}`;
  }
}

async function fetchGroupDetail(groupId) {
  return await requestApi(`/api/groups/${groupId}`, {
    defaultMessage: t("groups.detail_load_failed", "Gruppendetails konnten nicht geladen werden"),
  });
}

async function fetchGroupMessages(groupId, options = {}) {
  const params = new URLSearchParams();
  if (options.beforeMessageId) params.set("before_message_id", String(options.beforeMessageId));
  if (options.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const suffix = query ? `?${query}` : "";
  return await requestApi(`/api/groups/${groupId}/messages${suffix}`, {
    defaultMessage: t("groups.chat_load_failed", "Gruppenchat konnte nicht geladen werden"),
  });
}

async function createGroupMessage(groupId, message) {
  return await requestApi(`/api/groups/${groupId}/messages`, {
    method: "POST",
    body: { message },
    defaultMessage: t("groups.chat_send_failed", "Nachricht konnte nicht gesendet werden"),
  });
}

async function loadGroupDetail(groupId) {
  if (!groupId) {
    renderGroupDetail(null);
    resetGroupChatState("");
    renderGroupChatMessages();
    return;
  }
  const detail = await fetchGroupDetail(groupId);
  renderGroupDetail(detail);
  await loadInitialGroupMessages(groupId);
}

async function loadInitialGroupMessages(groupId) {
  if (!groupId) {
    resetGroupChatState("");
    renderGroupChatMessages();
    return;
  }

  const requestedGroupId = String(groupId);
  resetGroupChatState(requestedGroupId);
  renderGroupChatMessages();
  setGroupChatStatus("");

  const payload = await fetchGroupMessages(requestedGroupId, { limit: 40 });
  if (String(selectedGroupId || "") !== requestedGroupId) {
    return;
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  groupChatState.messages = messages;
  groupChatState.hasOlder = Boolean(payload.has_older);
  groupChatState.oldestMessageId = messages.length ? String(messages[0].message_id || "") : null;
  groupChatState.hasLoadedOlderHistory = false;
  renderGroupChatMessages();
  requestAnimationFrame(() => {
    groupChatViewport.scrollTop = groupChatViewport.scrollHeight;
    requestAnimationFrame(() => {
      groupChatViewport.scrollTop = groupChatViewport.scrollHeight;
      groupChatState.readyForOlderLoad = true;
      startGroupChatLiveUpdates();
    });
  });
}

async function loadOlderGroupMessages() {
  if (!selectedGroupId || !groupChatState.groupId) return;
  if (groupChatState.groupId !== String(selectedGroupId)) return;
  if (!groupChatState.hasOlder || groupChatState.loadingOlder || !groupChatState.oldestMessageId)
    return;

  groupChatState.loadingOlder = true;
  const previousHeight = groupChatViewport.scrollHeight;
  const previousTop = groupChatViewport.scrollTop;

  try {
    const payload = await fetchGroupMessages(selectedGroupId, {
      beforeMessageId: groupChatState.oldestMessageId,
      limit: 40,
    });
    if (String(selectedGroupId || "") !== groupChatState.groupId) {
      return;
    }

    const olderMessages = Array.isArray(payload.messages) ? payload.messages : [];
    if (olderMessages.length) {
      const existingIds = new Set(groupChatState.messages.map((entry) => String(entry.message_id)));
      const dedupedOlder = olderMessages.filter(
        (entry) => !existingIds.has(String(entry.message_id))
      );
      groupChatState.messages = [...dedupedOlder, ...groupChatState.messages];
      if (dedupedOlder.length) {
        groupChatState.hasLoadedOlderHistory = true;
      }
    }

    groupChatState.hasOlder = Boolean(payload.has_older);
    groupChatState.oldestMessageId = groupChatState.messages.length
      ? String(groupChatState.messages[0].message_id || "")
      : null;
    renderGroupChatMessages();

    const nextHeight = groupChatViewport.scrollHeight;
    groupChatViewport.scrollTop = previousTop + (nextHeight - previousHeight);
  } catch (error) {
    setGroupChatStatus(error.message, "error");
  } finally {
    groupChatState.loadingOlder = false;
  }
}

async function loadGroups(preferredGroupId = selectedGroupId) {
  const payload = await requestApi("/api/groups", {
    defaultMessage: t("groups.list_load_failed", "Gruppen konnten nicht geladen werden"),
  });

  groupsState = payload.groups || [];

  if (!groupsState.length) {
    selectedGroupId = null;
    renderGroups(groupsState);
    renderGroupDetail(null);
    persistGroupsViewState({ selectedGroupId: "", isDetailOpen: false });
    return;
  }

  if (
    preferredGroupId &&
    groupsState.some((group) => String(group.group_id) === String(preferredGroupId))
  ) {
    selectedGroupId = String(preferredGroupId);
  } else if (
    !groupsState.some((group) => String(group.group_id) === String(selectedGroupId || ""))
  ) {
    selectedGroupId = null;
  }

  renderGroups(groupsState);
  persistGroupsViewState({ selectedGroupId: selectedGroupId ? String(selectedGroupId) : "" });
}

async function loadInvitations() {
  const payload = await requestApi("/api/inbox/invitations", {
    defaultMessage: t("groups.invitations_load_failed", "Einladungen konnten nicht geladen werden"),
  });

  invitationsState = payload.invitations || [];
  updateInboxIndicator(invitationsState);
  renderInvitations(invitationsState);
}

async function createGroup(name, address) {
  const payload = await requestApi("/api/groups", {
    method: "POST",
    body: { name, address },
    defaultMessage: t("groups.create_failed", "Gruppe konnte nicht erstellt werden"),
  });
  return payload.group;
}

async function inviteUserToGroup(groupId, username) {
  await requestApi(`/api/groups/${groupId}/invite`, {
    method: "POST",
    body: { username },
    defaultMessage: t("groups.invite_failed", "Nutzer konnte nicht eingeladen werden"),
  });
}

async function removeMember(groupId, userId) {
  await requestApi(`/api/groups/${groupId}/members/${userId}`, {
    method: "DELETE",
    defaultMessage: t("groups.remove_member_failed", "Teilnehmende konnten nicht entfernt werden"),
  });
}

async function createGroupActivity(groupId, info, date) {
  await requestApi(`/api/groups/${groupId}/activities`, {
    method: "POST",
    body: { info, date: date || null },
    defaultMessage: t("groups.activity_create_failed", "Aktivitaet konnte nicht erstellt werden"),
  });
}

async function createGroupFunding(groupId, info, groupActivityId) {
  await requestApi(`/api/groups/${groupId}/funding`, {
    method: "POST",
    body: {
      info: info || null,
      group_activity_id: groupActivityId || null,
    },
    defaultMessage: t("groups.funding_create_failed", "Finanzierung konnte nicht erstellt werden"),
  });
}

async function promoteMemberToAdmin(groupId, userId) {
  await requestApi(`/api/groups/${groupId}/members/${userId}/promote-admin`, {
    method: "POST",
    defaultMessage: t(
      "groups.promote_failed",
      "Teilnehmende konnten nicht zum Admin gemacht werden"
    ),
  });
}

async function donateToFunding(groupId, fundingId, amount) {
  await requestApi(`/api/groups/${groupId}/funding/${fundingId}/donate`, {
    method: "POST",
    body: { amount },
    defaultMessage: t("groups.donation_failed", "Spende konnte nicht verarbeitet werden"),
  });
}

async function createGroupExpense(groupId, groupFundingId, amount, info, dueDate) {
  await requestApi(`/api/groups/${groupId}/expenses`, {
    method: "POST",
    body: {
      group_funding_id: groupFundingId,
      amount,
      info: info || null,
      due_date: dueDate || null,
    },
    defaultMessage: t(
      "groups.paid_expense_create_failed",
      "Bezahlte Ausgabe konnte nicht erstellt werden"
    ),
  });
}

async function acceptInvitation(groupId) {
  await requestApi(`/api/inbox/invitations/${groupId}/accept`, {
    method: "POST",
    defaultMessage: t(
      "groups.invitation_accept_failed",
      "Einladung konnte nicht angenommen werden"
    ),
  });
}

async function denyInvitation(groupId) {
  await requestApi(`/api/inbox/invitations/${groupId}/deny`, {
    method: "POST",
    defaultMessage: t("groups.invitation_deny_failed", "Einladung konnte nicht abgelehnt werden"),
  });
}

async function deleteGroup(groupId) {
  await requestApi(`/api/groups/${groupId}`, {
    method: "DELETE",
    defaultMessage: t("groups.delete_failed", "Gruppe konnte nicht geloescht werden"),
  });
}

async function leaveGroup(groupId) {
  await requestApi(`/api/groups/${groupId}/leave`, {
    method: "POST",
    defaultMessage: t("groups.leave_failed", "Gruppe konnte nicht verlassen werden"),
  });
}

async function openGroupDetail(groupId, options = {}) {
  const { resetTab = true } = options;
  stopGroupChatLiveUpdates();
  selectedGroupId = String(groupId || "");
  if (!selectedGroupId) return;
  selectedFundingId = null;
  resetGroupChatState(selectedGroupId);
  renderGroupChatMessages();
  setGroupChatStatus("");
  renderGroups(groupsState);
  setDetailStatus("");
  switchDetailTab(resetTab ? "members" : activeDetailTab);
  showDetailView();
  persistGroupsViewState({ selectedGroupId, isDetailOpen: true });
  await loadGroupDetail(selectedGroupId);
}

for (const button of detailTabButtons) {
  button.addEventListener("click", () => {
    const tabName = button.dataset.detailTabTarget;
    if (!tabName || tabName === activeDetailTab) return;
    switchDetailTab(tabName);
  });
}

groupChatViewport.addEventListener("scroll", () => {
  if (!groupChatState.readyForOlderLoad) return;
  if (groupChatViewport.scrollTop > 80) return;
  loadOlderGroupMessages();
});

document.addEventListener("click", () => {
  if (groupChatMessages) {
    groupChatMessages.querySelectorAll(".msg-context-menu").forEach((m) => {
      m.hidden = true;
    });
  }
});

groupChatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedGroupId) return;

  const content = groupChatInput.value.trim();
  if (!content) return;

  const sendBtn = groupChatForm.querySelector("button[type=submit]");
  groupChatInput.disabled = true;
  sendBtn?.classList.add("btn-loading");
  setGroupChatStatus(t("groups.chat_sending", "Nachricht wird gesendet..."));
  try {
    const payload = await createGroupMessage(selectedGroupId, content);
    if (String(selectedGroupId || "") !== groupChatState.groupId) return;

    const createdMessage = payload.message || null;
    if (createdMessage) {
      const exists = groupChatState.messages.some(
        (entry) => String(entry.message_id) === String(createdMessage.message_id)
      );
      if (!exists) {
        groupChatState.messages = [...groupChatState.messages, createdMessage];
      }
      if (!groupChatState.oldestMessageId && groupChatState.messages.length) {
        groupChatState.oldestMessageId = String(groupChatState.messages[0].message_id || "");
      }
      renderGroupChatMessages();
      requestAnimationFrame(() => {
        groupChatViewport.scrollTop = groupChatViewport.scrollHeight;
      });
    }

    groupChatForm.reset();
    setGroupChatStatus(t("groups.chat_sent", "Nachricht gesendet."), "ok");
  } catch (error) {
    setGroupChatStatus(error.message, "error");
  } finally {
    groupChatInput.disabled = false;
    sendBtn?.classList.remove("btn-loading");
    groupChatInput.focus();
  }
});

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
  setInboxStatus(
    isAccept
      ? t("groups.invitation_accepting", "Einladung wird angenommen...")
      : t("groups.invitation_denying", "Einladung wird abgelehnt...")
  );

  try {
    if (isAccept) {
      await acceptInvitation(groupId);
      setInboxStatus(t("groups.invitation_accepted", "Einladung angenommen."), "ok");
    } else {
      await denyInvitation(groupId);
      setInboxStatus(t("groups.invitation_denied", "Einladung abgelehnt."), "ok");
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
  setDetailStatus(
    isPromote
      ? t("groups.promoting", "Teilnehmende werden zum Admin gemacht...")
      : t("groups.removing_members", "Teilnehmende werden entfernt...")
  );
  try {
    if (isPromote) {
      await promoteMemberToAdmin(selectedGroupId, userId);
    } else {
      await removeMember(selectedGroupId, userId);
    }
    await loadGroupDetail(selectedGroupId);
    setDetailStatus(
      isPromote
        ? t("groups.promoted", "Teilnehmende sind jetzt Admin.")
        : t("groups.removed", "Teilnehmende wurden aus der Gruppe entfernt."),
      "ok"
    );
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

inviteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedGroupId) return;

  setDetailStatus(t("groups.invitation_sending", "Einladung wird gesendet..."));
  try {
    await inviteUserToGroup(selectedGroupId, inviteUsernameInput.value);
    inviteForm.reset();
    closeModal(inviteModal);
    await Promise.all([loadGroupDetail(selectedGroupId), loadInvitations()]);
    setDetailStatus(t("groups.invited_success", "Nutzer erfolgreich eingeladen."), "ok");
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

activityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedGroupId) return;

  setDetailStatus(t("groups.activity_creating", "Aktivitaet wird erstellt..."));
  try {
    await createGroupActivity(
      selectedGroupId,
      activityInfoInput.value.trim(),
      activityDateInput.value || null
    );
    activityForm.reset();
    await loadGroupDetail(selectedGroupId);
    setDetailStatus(t("groups.activity_created", "Gruppenaktivitaet erstellt."), "ok");
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

fundingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedGroupId) return;

  setDetailStatus(t("groups.funding_creating", "Finanzierung wird erstellt..."));
  try {
    await createGroupFunding(
      selectedGroupId,
      fundingInfoInput.value.trim(),
      fundingActivitySelect.value || null
    );
    fundingForm.reset();
    await loadGroupDetail(selectedGroupId);
    setDetailStatus(t("groups.funding_created", "Gruppenfinanzierung erstellt."), "ok");
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

donationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedGroupId) return;

  setDetailStatus(t("groups.donation_saving", "Spende wird gespeichert..."));
  try {
    await donateToFunding(
      selectedGroupId,
      donationFundingSelect.value,
      donationAmountInput.value.trim()
    );
    donationForm.reset();
    await loadGroupDetail(selectedGroupId);
    setDetailStatus(
      t("groups.donation_saved", "Spende wurde der Finanzierung hinzugefuegt."),
      "ok"
    );
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedGroupId) return;
  if (!selectedGroupDetail?.is_admin) {
    setDetailStatus(
      t("groups.admin_only_expenses", "Nur Admins koennen Gruppenausgaben erstellen."),
      "error"
    );
    return;
  }

  setDetailStatus(t("groups.group_expense_creating", "Bezahlte Gruppenausgabe wird erstellt..."));
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
    setDetailStatus(
      t(
        "groups.group_expense_created",
        "Gruppenausgabe erstellt und als Finanzierungszahlung verbucht."
      ),
      "ok"
    );
  } catch (error) {
    setDetailStatus(error.message, "error");
  }
});

deleteGroupButton.addEventListener("click", async () => {
  if (!selectedGroupId) return;
  if (!selectedGroupDetail?.is_admin) {
    setDetailStatus(t("groups.admin_only_delete", "Nur Admins koennen Gruppen loeschen."), "error");
    return;
  }

  const confirmed = window.confirm(
    t("groups.confirm_delete_group", "Diese Gruppe und alle verknuepften Gruppendaten loeschen?")
  );
  if (!confirmed) return;

  setDetailStatus(t("groups.deleting", "Gruppe wird geloescht..."));
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

  const confirmed = window.confirm(t("groups.confirm_leave_group", "Diese Gruppe verlassen?"));
  if (!confirmed) return;

  setDetailStatus(t("groups.leaving", "Gruppe wird verlassen..."));
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
  formStatus.textContent = t("create_group_now", "Gruppe wird erstellt...");

  try {
    const created = await createGroup(nameInput.value, addressInput.value);
    groupForm.reset();
    closeModal(createGroupModal);
    await loadGroups(created.group_id);
    await openGroupDetail(created.group_id);
    formStatus.classList.add("ok");
    formStatus.textContent = t(
      "group_created_with_admin",
      "Gruppe erstellt und du wurdest als Admin hinzugefuegt."
    );
  } catch (error) {
    formStatus.classList.add("error");
    formStatus.textContent = error.message;
  }
});

switchDetailTab("members");
showMainView();
applyGroupLocaleSettings(getCurrentUserFromStorage()?.id);

window.addEventListener("finanzapp:locale-changed", () => {
  applyGroupLocaleSettings(sessionUser?.id || getCurrentUserFromStorage()?.id);
  rerenderAfterLocaleChange();
});

async function bootstrap() {
  await Promise.all([loadSession(), loadGroups(), loadInvitations()]);
  const canRestoreSelection = Boolean(
    initialGroupsViewState.selectedGroupId &&
    groupsState.some(
      (group) => String(group.group_id) === String(initialGroupsViewState.selectedGroupId)
    )
  );

  if (canRestoreSelection) {
    selectedGroupId = String(initialGroupsViewState.selectedGroupId);
    activeDetailTab = initialGroupsViewState.activeDetailTab || "members";

    if (initialGroupsViewState.isDetailOpen) {
      await openGroupDetail(selectedGroupId, { resetTab: false });
    } else {
      renderGroups(groupsState);
      switchDetailTab(activeDetailTab);
      showMainView();
      persistGroupsViewState({ selectedGroupId, isDetailOpen: false, activeDetailTab });
    }
  } else {
    showMainView();
    persistGroupsViewState({
      selectedGroupId: selectedGroupId ? String(selectedGroupId) : "",
      isDetailOpen: false,
      activeDetailTab: "members",
    });
  }
  document.documentElement.classList.remove("groups-view-preload");
}

bootstrap().catch((error) => {
  document.documentElement.classList.remove("groups-view-preload");
  formStatus.className = "form-status error";
  formStatus.textContent = error.message;
});

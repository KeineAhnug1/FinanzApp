/**
 * nachrichten.js – Conversation list, polling, and orchestration.
 * Depends on: chat.js, user-search.js (loaded before this file)
 */
(function initNachrichten() {
  const POLL_INTERVAL_MS = 5_000;

  let currentPartnerId = null;
  let pollTimer = null;

  // ── DOM refs ──────────────────────────────────────────────
  const convList = document.getElementById("conversationList");
  const noConvEl = document.getElementById("noConversations");
  const newConvBtn = document.getElementById("newConversationBtn");
  const sidebar = document.getElementById("msgSidebar");
  const chatArea = document.getElementById("msgChatArea");
  const backBtn = document.getElementById("backBtn");

  function t(key, fallback) {
    const translated = window.FinanzAppLanguage?.t?.(key);
    if (translated && translated !== key) return translated;
    return fallback;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatConvTime(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (isYesterday) return t("messages.yesterday", "Gestern");
    return date.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
  }

  function renderConvItem(conv) {
    const li = document.createElement("li");
    li.className = "msg-conv-item";
    li.dataset.partnerId = conv.partnerId;
    li.setAttribute("role", "button");
    li.setAttribute("tabindex", "0");

    const initial = escapeHtml((conv.partnerUsername || "?")[0].toUpperCase());
    const avatarHtml = conv.partnerProfileImage
      ? `<div class="msg-conv-avatar"><img src="${escapeHtml(conv.partnerProfileImage)}" alt="" /></div>`
      : `<div class="msg-conv-avatar">${initial}</div>`;
    const name = escapeHtml(conv.partnerUsername || conv.partnerId);
    const preview = escapeHtml(conv.lastMessage || "");
    const time = escapeHtml(formatConvTime(conv.lastMessageAt));
    const badgeHtml = conv.unreadCount > 0
      ? `<span class="msg-conv-badge">${conv.unreadCount > 99 ? "99+" : conv.unreadCount}</span>`
      : "";

    li.innerHTML = `
      ${avatarHtml}
      <div class="msg-conv-body">
        <div class="msg-conv-header">
          <span class="msg-conv-name">${name}</span>
          <span class="msg-conv-time">${time}</span>
        </div>
        <div class="msg-conv-preview">${preview}</div>
      </div>
      ${badgeHtml}
    `;

    li.addEventListener("click", () => openConversation(conv.partnerId, conv.partnerUsername));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openConversation(conv.partnerId, conv.partnerUsername);
      }
    });

    return li;
  }

  async function loadConversations() {
    const result = await window.FinanzAppApi.requestJson("/api/messages/conversations");
    if (!result.ok) return;

    const conversations = result.data?.conversations ?? [];

    // Preserve active state
    convList.innerHTML = "";
    conversations.forEach((conv) => {
      const li = renderConvItem(conv);
      if (conv.partnerId === currentPartnerId) li.classList.add("is-active");
      convList.appendChild(li);
    });

    noConvEl.hidden = conversations.length > 0;
  }

  function openConversation(partnerId, partnerUsername) {
    currentPartnerId = partnerId;

    // Mark active in list
    for (const item of convList.querySelectorAll(".msg-conv-item")) {
      item.classList.toggle("is-active", item.dataset.partnerId === partnerId);
    }

    // Mobile: show chat, hide sidebar
    sidebar.classList.add("is-hidden-mobile");
    chatArea.classList.remove("is-hidden-mobile");

    window.FinanzAppChat?.openChat(partnerId, partnerUsername);

    // Reset poll so we poll immediately on open
    startPolling();
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      loadConversations();
      if (currentPartnerId) {
        window.FinanzAppChat?.pollMessages(currentPartnerId);
      }
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // ── Back button (mobile) ──────────────────────────────────
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      currentPartnerId = null;
      chatArea.classList.add("is-hidden-mobile");
      sidebar.classList.remove("is-hidden-mobile");
      window.FinanzAppChat?.closeChat();
    });
  }

  // ── New conversation button ───────────────────────────────
  if (newConvBtn) {
    newConvBtn.addEventListener("click", () => {
      window.FinanzAppUserSearch?.toggle();
    });
  }

  // ── Called from user-search.js when a user is selected ───
  window.FinanzAppNachrichten = {
    openConversation,
    refreshConversations: loadConversations
  };

  // ── Init ──────────────────────────────────────────────────
  async function init() {
    try {
      await window.FinanzAppSession.fetchSessionUser();
    } catch {
      window.location.assign("/");
      return;
    }

    await loadConversations();
    startPolling();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

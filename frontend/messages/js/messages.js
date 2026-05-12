/**
 * messages.js – Conversation list, SSE real-time updates, and orchestration.
 * Depends on: chat.js, user-search.js (loaded before this file)
 */
import { t as translate } from "/shared/js/language-utils.js";
import { fetchSessionUser } from "/shared/js/session-utils.js";
import { requestJson } from "/shared/js/api-client.js";
import { openChat, closeChat, pollMessages } from "./chat.js";
import { toggle as toggleUserSearch } from "./user-search.js";

const FALLBACK_POLL_INTERVAL_MS = 15_000;

let currentPartnerId = null;
let pollTimer = null;
let eventSource = null;

// ── DOM refs ──────────────────────────────────────────────
const convList = document.getElementById("conversationList");
const noConvEl = document.getElementById("noConversations");
const newConvBtn = document.getElementById("newConversationBtn");
const sidebar = document.getElementById("msgSidebar");
const chatArea = document.getElementById("msgChatArea");
const backBtn = document.getElementById("backBtn");

function t(key, fallback) {
  const translated = translate(key);
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

  li.addEventListener("click", () => openConversation(conv.partnerId, conv.partnerUsername, conv.partnerProfileImage));
  li.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openConversation(conv.partnerId, conv.partnerUsername, conv.partnerProfileImage);
    }
  });

  return li;
}

async function loadConversations() {
  const result = await requestJson("/api/messages/conversations");
  if (!result.ok) return;

  const conversations = result.data?.conversations ?? [];

  convList.innerHTML = "";
  conversations.forEach((conv) => {
    const li = renderConvItem(conv);
    if (conv.partnerId === currentPartnerId) li.classList.add("is-active");
    convList.appendChild(li);
  });

  noConvEl.hidden = conversations.length > 0;
}

export function openConversation(partnerId, partnerUsername, partnerProfileImage) {
  currentPartnerId = partnerId;

  for (const item of convList.querySelectorAll(".msg-conv-item")) {
    item.classList.toggle("is-active", item.dataset.partnerId === partnerId);
  }

  sidebar.classList.add("is-hidden-mobile");
  chatArea.classList.remove("is-hidden-mobile");

  openChat(partnerId, partnerUsername, partnerProfileImage);
}

export function refreshConversations() {
  loadConversations();
}

// ── SSE (Server-Sent Events) ─────────────────────────────
function connectSSE() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  try {
    eventSource = new EventSource("/api/messages/stream");

    eventSource.addEventListener("new_message", (event) => {
      try {
        const data = JSON.parse(event.data);
        loadConversations();
        if (currentPartnerId && String(data.partnerId) === String(currentPartnerId)) {
          pollMessages(currentPartnerId);
        }
      } catch { /* malformed event data */ }
    });

    eventSource.addEventListener("open", () => {
      stopFallbackPolling();
    });

    eventSource.addEventListener("error", () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      startFallbackPolling();
    });
  } catch {
    startFallbackPolling();
  }
}

// ── Fallback polling (used when SSE is unavailable) ──────
function startFallbackPolling() {
  stopFallbackPolling();
  pollTimer = setInterval(() => {
    loadConversations();
    if (currentPartnerId) {
      pollMessages(currentPartnerId);
    }
  }, FALLBACK_POLL_INTERVAL_MS);
}

function stopFallbackPolling() {
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
    closeChat();
  });
}

// ── New conversation button ───────────────────────────────
if (newConvBtn) {
  newConvBtn.addEventListener("click", () => {
    toggleUserSearch();
  });
}

// ── Init ──────────────────────────────────────────────────
export async function init() {
  try {
    await fetchSessionUser();
  } catch {
    window.location.assign("/");
    return;
  }

  await loadConversations();
  connectSSE();
}

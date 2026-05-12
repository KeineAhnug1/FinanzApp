/**
 * chat.js – Chat viewport: load messages, send, auto-scroll, date separators.
 * Exposes window.FinanzAppChat for orchestration by messages.js.
 */
import { t as translate } from "/shared/js/language-utils.js";
import { requestJson } from "/shared/js/api-client.js";
import { refreshConversations } from "./messages.js";

let activePartnerId = null;
let lastMessageCount = 0;
let activePartnerImage = null;
let activePartnerInitial = "?";

// ── DOM refs ──────────────────────────────────────────────
const chatEmpty = document.getElementById("chatEmpty");
const chatContent = document.getElementById("chatContent");
const chatPartnerName = document.getElementById("chatPartnerName");
const chatViewport = document.getElementById("chatViewport");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatStatus = document.getElementById("chatStatus");

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

function formatMsgTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return t("messages.today", "Heute");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return t("messages.yesterday", "Gestern");
  return date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

function setStatus(msg) {
  if (chatStatus) chatStatus.textContent = msg;
}

function scrollToBottom(smooth = false) {
  if (!chatViewport) return;
  chatViewport.scrollTo({
    top: chatViewport.scrollHeight,
    behavior: smooth ? "smooth" : "auto"
  });
}

function renderMessages(messages) {
  if (!chatMessages) return;
  chatMessages.innerHTML = "";

  let lastDateLabel = null;

  for (const msg of messages) {
    // Date separator
    const dateLabel = formatDateLabel(msg.sent_at);
    if (dateLabel && dateLabel !== lastDateLabel) {
      lastDateLabel = dateLabel;
      const sep = document.createElement("li");
      sep.className = "msg-date-separator";
      const span = document.createElement("span");
      span.textContent = dateLabel;
      sep.appendChild(span);
      chatMessages.appendChild(sep);
    }

    const li = document.createElement("li");
    li.className = "msg-bubble-row" + (msg.isOwn ? " is-own" : "");
    if (msg._id) li.dataset.messageId = msg._id;

    if (!msg.isOwn) {
      const avatar = document.createElement("div");
      avatar.className = "msg-bubble-avatar";
      if (activePartnerImage) {
        const img = document.createElement("img");
        img.src = escapeHtml(activePartnerImage);
        img.alt = "";
        avatar.appendChild(img);
      } else {
        avatar.textContent = activePartnerInitial;
      }
      li.appendChild(avatar);
    }

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    if (msg.deleted_at) {
      const deletedSpan = document.createElement("span");
      deletedSpan.className = "msg-deleted";
      deletedSpan.textContent = t("messages.deleted", "Nachricht gelöscht");
      bubble.appendChild(deletedSpan);
    } else {
      // Use textContent to prevent XSS — no innerHTML with user content
      bubble.textContent = msg.content;
    }

    const meta = document.createElement("div");
    meta.className = "msg-bubble-meta";
    const timeStr = formatMsgTime(msg.sent_at);
    if (msg.isOwn && msg.read_at) {
      meta.textContent = `${timeStr} ✓`;
    } else {
      meta.textContent = timeStr;
    }

    li.appendChild(bubble);
    li.appendChild(meta);

    if (msg.isOwn && !msg.deleted_at && msg._id) {
      const menu = document.createElement("div");
      menu.className = "msg-context-menu";
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "msg-context-delete";
      deleteBtn.textContent = t("messages.delete", "Löschen");
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteMessage(msg._id);
        menu.hidden = true;
      });
      menu.appendChild(deleteBtn);
      menu.hidden = true;
      li.appendChild(menu);

      bubble.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = !menu.hidden;
        // Close all other open menus
        chatMessages.querySelectorAll(".msg-context-menu").forEach((m) => { m.hidden = true; });
        menu.hidden = isOpen;
      });
    }

    chatMessages.appendChild(li);
  }
}

async function deleteMessage(messageId) {
  const result = await requestJson(
    `/api/messages/${encodeURIComponent(messageId)}`,
    { method: "DELETE" }
  );
  if (result.ok && activePartnerId) {
    await loadMessages(activePartnerId, false);
  }
}

async function loadMessages(partnerId, isPolling = false) {
  const result = await requestJson(`/api/messages/conversation/${encodeURIComponent(partnerId)}`);
  if (!result.ok) {
    if (!isPolling) setStatus(result.data?.message || "Fehler beim Laden der Nachrichten.");
    return;
  }

  const messages = result.data?.messages ?? [];
  const atBottom = chatViewport
    ? chatViewport.scrollHeight - chatViewport.scrollTop - chatViewport.clientHeight < 60
    : true;
  const hadNewMessages = messages.length > lastMessageCount;
  lastMessageCount = messages.length;

  renderMessages(messages);
  setStatus("");

  if (!isPolling || hadNewMessages) {
    scrollToBottom(isPolling && hadNewMessages);
  } else if (atBottom) {
    scrollToBottom(false);
  }
}

async function sendMessage(partnerId, content) {
  setStatus("");
  const result = await requestJson("/api/messages/send", {
    method: "POST",
    body: { recipientId: partnerId, content }
  });

  if (!result.ok) {
    setStatus(result.data?.message || "Fehler beim Senden.");
    return false;
  }

  return true;
}

// ── Close context menus on outside click ──────────────────
document.addEventListener("click", () => {
  if (chatMessages) {
    chatMessages.querySelectorAll(".msg-context-menu").forEach((m) => { m.hidden = true; });
  }
});

// ── Form submit ───────────────────────────────────────────
if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activePartnerId) return;

    const content = String(chatInput?.value || "").trim();
    if (!content) return;

    const btn = chatForm.querySelector("button[type=submit]");
    if (btn) btn.disabled = true;

    const ok = await sendMessage(activePartnerId, content);
    if (ok) {
      if (chatInput) chatInput.value = "";
      await loadMessages(activePartnerId, false);
      // Refresh conversation list to update last-message preview
      refreshConversations();
    }

    if (btn) btn.disabled = false;
    chatInput?.focus();
  });
}

// ── Public API ────────────────────────────────────────────
export function openChat(partnerId, partnerUsername, partnerProfileImage) {
  activePartnerId = partnerId;
  lastMessageCount = 0;
  activePartnerImage = partnerProfileImage || null;
  activePartnerInitial = (partnerUsername || partnerId || "?")[0].toUpperCase();

  if (chatEmpty) chatEmpty.hidden = true;
  if (chatContent) chatContent.hidden = false;
  if (chatPartnerName) chatPartnerName.textContent = partnerUsername || partnerId;
  if (chatInput) {
    chatInput.value = "";
    chatInput.focus();
  }
  setStatus("");

  loadMessages(partnerId, false);
}

export function closeChat() {
  activePartnerId = null;
  lastMessageCount = 0;
  activePartnerImage = null;
  activePartnerInitial = "?";
  if (chatEmpty) chatEmpty.hidden = false;
  if (chatContent) chatContent.hidden = true;
  if (chatMessages) chatMessages.innerHTML = "";
  setStatus("");
}

export function pollMessages(partnerId) {
  if (partnerId === activePartnerId) {
    loadMessages(partnerId, true);
  }
}

window.FinanzAppChat = { openChat, closeChat, pollMessages };

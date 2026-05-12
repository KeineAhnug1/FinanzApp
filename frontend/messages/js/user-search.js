/**
 * user-search.js – User search panel for starting new conversations.
 */
import { requestJson } from "/shared/js/api-client.js";
import { openConversation } from "./messages.js";

let searchTimer = null;
const DEBOUNCE_MS = 280;

// ── DOM refs ──────────────────────────────────────────────
const searchPanel = document.getElementById("userSearchPanel");
const searchInput = document.getElementById("userSearchInput");
const searchResults = document.getElementById("userSearchResults");
const searchStatus = document.getElementById("userSearchStatus");

function setStatus(msg) {
  if (searchStatus) searchStatus.textContent = msg;
}

function clearResults() {
  if (searchResults) searchResults.innerHTML = "";
}


function renderResults(users) {
  clearResults();
  if (!searchResults) return;

  for (const user of users) {
    const li = document.createElement("li");
    li.className = "msg-search-result-item";
    li.setAttribute("role", "option");
    li.setAttribute("tabindex", "0");
    li.textContent = user.username;

    li.addEventListener("click", () => selectUser(user));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectUser(user);
      }
    });

    searchResults.appendChild(li);
  }
}

function selectUser(user) {
  hide();
  openConversation(user._id, user.username);
}

async function runSearch(q) {
  if (!q) {
    clearResults();
    setStatus("");
    return;
  }

  const result = await requestJson(
    `/api/users/search?q=${encodeURIComponent(q)}`
  );

  if (!result.ok) {
    clearResults();
    setStatus(result.data?.message || "Suche fehlgeschlagen.");
    return;
  }

  const users = result.data?.users ?? [];
  renderResults(users);
  setStatus(users.length === 0 ? "Keine Nutzer gefunden." : "");
}

export function show() {
  if (!searchPanel) return;
  searchPanel.hidden = false;
  searchInput?.focus();
}

export function hide() {
  if (!searchPanel) return;
  searchPanel.hidden = true;
  if (searchInput) searchInput.value = "";
  clearResults();
  setStatus("");
}

export function toggle() {
  if (!searchPanel) return;
  if (searchPanel.hidden) {
    show();
  } else {
    hide();
  }
}

// ── Input debounce ────────────────────────────────────────
if (searchInput) {
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      runSearch(searchInput.value.trim());
    }, DEBOUNCE_MS);
  });

  // Close panel on Escape
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
}


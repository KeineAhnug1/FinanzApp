const QUESTION_TOPIC_MAX_LENGTH = 80;

const state = {
  user: null,
  questions: [],
  search: "",
  editingQuestionId: null
};

function t(key, fallback, params = {}) {
  const translated = window.FinanzAppLanguage?.t?.(key, params);
  if (translated && translated !== key) return translated;
  if (!params || !Object.keys(params).length) return fallback;
  return String(fallback || "").replaceAll(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const locale = window.FinanzAppLanguage?.getLocale?.() || "de-DE";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function setStatus(type, text) {
  const node = document.getElementById("question-form-status");
  if (!node) return;
  node.textContent = text || "";
  node.classList.remove("is-error", "is-success");
  if (type === "error") node.classList.add("is-error");
  if (type === "success") node.classList.add("is-success");
}

async function requestJson(url, options) {
  try {
    const response = await fetch(url, { credentials: "same-origin", ...options });
    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }
    return { ok: response.ok && Boolean(data.ok), status: response.status, ...data };
  } catch {
    return { ok: false, status: 0, message: t("questions.server_unreachable", "Server nicht erreichbar.") };
  }
}

async function loadQuestions() {
  const trimmed = state.search.trim();
  if (!trimmed) return [];
  const suffix = `?search=${encodeURIComponent(trimmed)}`;
  const result = await requestJson(`/api/questions${suffix}`);
  if (!result.ok) return [];
  return Array.isArray(result.questions) ? result.questions : [];
}

function updateTopicCounter() {
  const topic = document.getElementById("question-topic");
  const counter = document.getElementById("question-topic-counter");
  if (!topic || !counter) return;
  counter.textContent = `${String(topic.value || "").length}/${QUESTION_TOPIC_MAX_LENGTH}`;
}

function setCreateMode() {
  state.editingQuestionId = null;
  const form = document.getElementById("question-form");
  const submitBtn = document.getElementById("question-submit-btn");
  const cancelBtn = document.getElementById("question-cancel-btn");
  if (form) form.reset();
  updateTopicCounter();
  if (submitBtn) submitBtn.textContent = t("questions.submit_create", "Frage erstellen");
  if (cancelBtn) cancelBtn.hidden = true;
}

function setEditMode(question) {
  state.editingQuestionId = question.id;
  const topic = document.getElementById("question-topic");
  const message = document.getElementById("question-message");
  const submitBtn = document.getElementById("question-submit-btn");
  const cancelBtn = document.getElementById("question-cancel-btn");
  if (topic) topic.value = question.thema || "";
  if (message) message.value = question.message || "";
  updateTopicCounter();
  if (submitBtn) submitBtn.textContent = t("questions.submit_save", "Frage speichern");
  if (cancelBtn) cancelBtn.hidden = false;
}

function toQuestionLink(questionId) {
  return `/fragen/question.html?id=${encodeURIComponent(questionId)}`;
}

function renderQuestion(question) {
  return `
    <li class="question-item">
      <a class="question-link" href="${toQuestionLink(question.id)}" data-open-question="${question.id}" aria-label="Frage öffnen: ${escapeHtml(question.thema)}">
        <div class="question-head">
          <div>
            <p class="question-topic">${escapeHtml(question.thema)}</p>
            <p class="meta">
              ${escapeHtml(question.author_username || question.author_first_name || t("questions.author_unknown", "Unbekannt"))} • ${formatDate(question.created_at)}
              ${question.edited ? ` • ${t("questions.edited", "Bearbeitet")}` : ""}
            </p>
          </div>
          <span class="badge ${question.answered ? "is-answered" : "is-open"}">${question.answered ? t("questions.status_answered", "Beantwortet") : t("questions.status_new", "Neu")}</span>
        </div>
        <p class="question-text">${escapeHtml(question.message)}</p>
        <p class="meta">
          ${t("questions.answers_title", "Antworten ({count})", { count: question.answers?.length || 0 })} •
          ${t("questions.like", "Like")} ${question.likes_count || 0}
        </p>
      </a>
      <div class="inline-actions">
        ${question.can_edit ? `<button class="inline-btn" type="button" data-action="edit-question" data-question-id="${question.id}">${t("questions.edit", "Bearbeiten")}</button>` : ""}
      </div>
    </li>
  `;
}

function renderQuestions() {
  const list = document.getElementById("question-list");
  if (!list) return;

  const trimmed = state.search.trim();
  if (!trimmed) {
    list.innerHTML = `<li><p class="empty">${t("questions.empty_search_hint", "Bitte Suchbegriff eingeben.")}</p></li>`;
    return;
  }

  if (!state.questions.length) {
    list.innerHTML = `<li><p class="empty">${t("questions.empty_search", "Keine Fragen gefunden.")}</p></li>`;
    return;
  }

  list.innerHTML = state.questions.map((question) => renderQuestion(question)).join("");
}

async function refreshQuestions() {
  state.questions = await loadQuestions();
  renderQuestions();
}

async function handleQuestionSubmit(event) {
  event.preventDefault();
  const form = document.getElementById("question-form");
  const submitBtn = document.getElementById("question-submit-btn");
  if (!form || !submitBtn) return;

  submitBtn.disabled = true;
  const wasEditing = Boolean(state.editingQuestionId);
  const formData = new FormData(form);
  const payload = {
    thema: String(formData.get("thema") || "").trim(),
    message: String(formData.get("message") || "").trim()
  };

  const result = state.editingQuestionId
    ? await requestJson(`/api/questions/${encodeURIComponent(state.editingQuestionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    : await requestJson("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

  if (!result.ok) {
    setStatus("error", result.message || t("questions.save_failed", "Konnte nicht gespeichert werden."));
    submitBtn.disabled = false;
    return;
  }

  const createdQuestionId = result.question?.id ? String(result.question.id) : "";
  const shouldRefreshList = Boolean(state.search.trim());

  setCreateMode();
  if (shouldRefreshList) await refreshQuestions();
  setStatus("success", wasEditing ? t("questions.updated", "Frage aktualisiert.") : t("questions.created", "Frage erstellt."));
  submitBtn.disabled = false;

  if (!wasEditing && createdQuestionId) {
    window.location.assign(toQuestionLink(createdQuestionId));
  }
}

async function handleListClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  if (!action) return;

  if (action === "edit-question") {
    const questionId = target.dataset.questionId;
    const question = state.questions.find((item) => item.id === questionId);
    if (!question) return;
    setEditMode(question);
    setStatus("", t("questions.editing_active", "Bearbeitung aktiv."));
  }
}

function wireSearchInput() {
  const search = document.getElementById("question-search");
  if (!search) return;

  search.addEventListener("input", async () => {
    state.search = String(search.value || "");
    await refreshQuestions();
  });
}

async function bootstrap() {
  const session = await requestJson("/api/session");
  if (!session.ok || !session.session_user) {
    window.location.assign("/");
    return;
  }
  state.user = session.session_user;

  const topic = document.getElementById("question-topic");
  const form = document.getElementById("question-form");
  const cancelBtn = document.getElementById("question-cancel-btn");
  const list = document.getElementById("question-list");

  if (topic) topic.addEventListener("input", updateTopicCounter);
  if (form) form.addEventListener("submit", handleQuestionSubmit);
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      setCreateMode();
      setStatus("", t("questions.editing_cancelled", "Bearbeitung abgebrochen."));
    });
  }
  wireSearchInput();
  if (list) list.addEventListener("click", handleListClick);

  setCreateMode();
  renderQuestions();
}

bootstrap();

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
  const suffix = state.search.trim() ? `?search=${encodeURIComponent(state.search.trim())}` : "";
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

function renderAnswer(questionId, answer) {
  return `
    <li class="answer-item">
      <p class="answer-text">${escapeHtml(answer.message)}</p>
      <p class="meta">
        ${escapeHtml(answer.author_username || answer.author_first_name || t("questions.author_unknown", "Unbekannt"))} • ${formatDate(answer.created_at)}
        ${answer.edited ? ` • ${t("questions.edited", "Bearbeitet")}` : ""}
      </p>
      <div class="inline-actions">
        <button class="inline-btn" type="button" data-action="like-answer" data-answer-id="${answer.id}">
          ${answer.liked_by_me ? t("questions.unlike", "Unlike") : t("questions.like", "Like")} (${answer.likes_count || 0})
        </button>
        ${answer.can_edit ? `<button class="inline-btn" type="button" data-action="edit-answer" data-question-id="${questionId}" data-answer-id="${answer.id}">${t("questions.edit", "Bearbeiten")}</button>` : ""}
        ${answer.can_edit ? `<button class="inline-btn" type="button" data-action="delete-answer" data-answer-id="${answer.id}">${t("questions.delete", "Löschen")}</button>` : ""}
      </div>
    </li>
  `;
}

function renderQuestion(question) {
  return `
    <li class="question-item">
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
      <div class="inline-actions">
        <button class="inline-btn" type="button" data-action="like-question" data-question-id="${question.id}">
          ${question.liked_by_me ? t("questions.unlike", "Unlike") : t("questions.like", "Like")} (${question.likes_count || 0})
        </button>
        ${question.can_edit ? `<button class="inline-btn" type="button" data-action="edit-question" data-question-id="${question.id}">${t("questions.edit", "Bearbeiten")}</button>` : ""}
      </div>
      <div class="answers-wrap">
        <p class="answers-title">${t("questions.answers_title", "Antworten ({count})", { count: question.answers?.length || 0 })}</p>
        <ul class="answer-list">
          ${Array.isArray(question.answers) && question.answers.length
            ? question.answers.map((answer) => renderAnswer(question.id, answer)).join("")
            : `<li><p class="empty">${t("questions.no_answers", "Noch keine Antworten.")}</p></li>`}
        </ul>
        <form class="answer-form" data-answer-form="${question.id}">
          <textarea class="field-input field-textarea" name="message" maxlength="4000" rows="2" required placeholder="${t("questions.answer_placeholder", "Antwort schreiben...")}"></textarea>
          <button class="submit-btn" type="submit">${t("questions.answer_submit", "Antworten")}</button>
        </form>
      </div>
    </li>
  `;
}

function renderQuestions() {
  const list = document.getElementById("question-list");
  if (!list) return;
  if (!state.questions.length) {
    list.innerHTML = `<li><p class="empty">${state.search ? t("questions.empty_search", "Keine Fragen gefunden.") : t("questions.empty", "Noch keine Fragen vorhanden.")}</p></li>`;
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

  setCreateMode();
  await refreshQuestions();
  setStatus("success", wasEditing ? t("questions.updated", "Frage aktualisiert.") : t("questions.created", "Frage erstellt."));
  submitBtn.disabled = false;
}

function findAnswer(questionId, answerId) {
  const question = state.questions.find((item) => item.id === questionId);
  if (!question) return null;
  return question.answers?.find((answer) => answer.id === answerId) || null;
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
    return;
  }

  if (action === "like-question") {
    const questionId = target.dataset.questionId;
    if (!questionId) return;
    await requestJson(`/api/questions/${encodeURIComponent(questionId)}/like`, { method: "POST" });
    await refreshQuestions();
    return;
  }

  if (action === "like-answer") {
    const answerId = target.dataset.answerId;
    if (!answerId) return;
    await requestJson(`/api/answers/${encodeURIComponent(answerId)}/like`, { method: "POST" });
    await refreshQuestions();
    return;
  }

  if (action === "edit-answer") {
    const questionId = String(target.dataset.questionId || "");
    const answerId = String(target.dataset.answerId || "");
    const answer = findAnswer(questionId, answerId);
    if (!answer) return;
    const nextMessage = window.prompt(t("questions.answer_edit_prompt", "Antwort bearbeiten:"), answer.message || "");
    if (nextMessage == null) return;
    const message = String(nextMessage).trim();
    if (!message) return;
    const result = await requestJson(`/api/answers/${encodeURIComponent(answerId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    if (!result.ok) {
      setStatus("error", result.message || t("questions.answer_update_failed", "Antwort konnte nicht bearbeitet werden."));
      return;
    }
    await refreshQuestions();
    setStatus("success", t("questions.answer_updated", "Antwort aktualisiert."));
    return;
  }

  if (action === "delete-answer") {
    const answerId = String(target.dataset.answerId || "");
    if (!answerId) return;
    const shouldDelete = window.confirm(t("questions.answer_delete_confirm", "Antwort wirklich löschen?"));
    if (!shouldDelete) return;
    const result = await requestJson(`/api/answers/${encodeURIComponent(answerId)}`, { method: "DELETE" });
    if (!result.ok) {
      setStatus("error", result.message || t("questions.answer_delete_failed", "Antwort konnte nicht gelöscht werden."));
      return;
    }
    await refreshQuestions();
    setStatus("success", t("questions.answer_deleted", "Antwort gelöscht."));
  }
}

async function handleAnswerSubmit(event) {
  const target = event.target;
  if (!(target instanceof HTMLFormElement)) return;
  const questionId = String(target.dataset.answerForm || "");
  if (!questionId) return;
  event.preventDefault();

  const formData = new FormData(target);
  const message = String(formData.get("message") || "").trim();
  if (!message) return;

  const result = await requestJson(`/api/questions/${encodeURIComponent(questionId)}/answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  if (!result.ok) {
    setStatus("error", result.message || t("questions.answer_save_failed", "Antwort konnte nicht gespeichert werden."));
    return;
  }
  target.reset();
  await refreshQuestions();
  setStatus("success", t("questions.answer_saved", "Antwort gespeichert."));
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
  const search = document.getElementById("question-search");
  const list = document.getElementById("question-list");

  if (topic) topic.addEventListener("input", updateTopicCounter);
  if (form) form.addEventListener("submit", handleQuestionSubmit);
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      setCreateMode();
      setStatus("", t("questions.editing_cancelled", "Bearbeitung abgebrochen."));
    });
  }
  if (search) {
    search.addEventListener("input", async () => {
      state.search = search.value;
      await refreshQuestions();
    });
  }
  if (list) {
    list.addEventListener("click", handleListClick);
    list.addEventListener("submit", handleAnswerSubmit);
  }

  setCreateMode();
  await refreshQuestions();
}

bootstrap();

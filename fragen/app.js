const QUESTION_TOPIC_MAX_LENGTH = 80;

const state = {
  user: null,
  questions: [],
  search: "",
  editingQuestionId: null
};

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
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(date);
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
    return { ok: false, status: 0, message: "Server nicht erreichbar." };
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
  if (submitBtn) submitBtn.textContent = "Frage erstellen";
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
  if (submitBtn) submitBtn.textContent = "Frage speichern";
  if (cancelBtn) cancelBtn.hidden = false;
}

function renderAnswer(questionId, answer) {
  return `
    <li class="answer-item">
      <p class="answer-text">${escapeHtml(answer.message)}</p>
      <p class="meta">
        ${escapeHtml(answer.author_username || answer.author_first_name || "Unbekannt")} • ${formatDate(answer.created_at)}
        ${answer.edited ? " • Bearbeitet" : ""}
      </p>
      <div class="inline-actions">
        <button class="inline-btn" type="button" data-action="like-answer" data-answer-id="${answer.id}">
          ${answer.liked_by_me ? "Unlike" : "Like"} (${answer.likes_count || 0})
        </button>
        ${answer.can_edit ? `<button class="inline-btn" type="button" data-action="edit-answer" data-question-id="${questionId}" data-answer-id="${answer.id}">Bearbeiten</button>` : ""}
        ${answer.can_edit ? `<button class="inline-btn" type="button" data-action="delete-answer" data-answer-id="${answer.id}">Loeschen</button>` : ""}
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
            ${escapeHtml(question.author_username || question.author_first_name || "Unbekannt")} • ${formatDate(question.created_at)}
            ${question.edited ? " • Bearbeitet" : ""}
          </p>
        </div>
        <span class="badge ${question.answered ? "is-answered" : "is-open"}">${question.answered ? "Beantwortet" : "Neu"}</span>
      </div>
      <p class="question-text">${escapeHtml(question.message)}</p>
      <div class="inline-actions">
        <button class="inline-btn" type="button" data-action="like-question" data-question-id="${question.id}">
          ${question.liked_by_me ? "Unlike" : "Like"} (${question.likes_count || 0})
        </button>
        ${question.can_edit ? `<button class="inline-btn" type="button" data-action="edit-question" data-question-id="${question.id}">Bearbeiten</button>` : ""}
      </div>
      <div class="answers-wrap">
        <p class="answers-title">Antworten (${question.answers?.length || 0})</p>
        <ul class="answer-list">
          ${Array.isArray(question.answers) && question.answers.length
            ? question.answers.map((answer) => renderAnswer(question.id, answer)).join("")
            : '<li><p class="empty">Noch keine Antworten.</p></li>'}
        </ul>
        <form class="answer-form" data-answer-form="${question.id}">
          <textarea class="field-input field-textarea" name="message" maxlength="4000" rows="2" required placeholder="Antwort schreiben..."></textarea>
          <button class="submit-btn" type="submit">Antworten</button>
        </form>
      </div>
    </li>
  `;
}

function renderQuestions() {
  const list = document.getElementById("question-list");
  if (!list) return;
  if (!state.questions.length) {
    list.innerHTML = `<li><p class="empty">${state.search ? "Keine Fragen gefunden." : "Noch keine Fragen vorhanden."}</p></li>`;
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
    setStatus("error", result.message || "Konnte nicht gespeichert werden.");
    submitBtn.disabled = false;
    return;
  }

  setCreateMode();
  await refreshQuestions();
  setStatus("success", wasEditing ? "Frage aktualisiert." : "Frage erstellt.");
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
    setStatus("", "Bearbeitung aktiv.");
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
    const nextMessage = window.prompt("Antwort bearbeiten:", answer.message || "");
    if (nextMessage == null) return;
    const message = String(nextMessage).trim();
    if (!message) return;
    const result = await requestJson(`/api/answers/${encodeURIComponent(answerId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    if (!result.ok) {
      setStatus("error", result.message || "Antwort konnte nicht bearbeitet werden.");
      return;
    }
    await refreshQuestions();
    setStatus("success", "Antwort aktualisiert.");
    return;
  }

  if (action === "delete-answer") {
    const answerId = String(target.dataset.answerId || "");
    if (!answerId) return;
    const shouldDelete = window.confirm("Antwort wirklich loeschen?");
    if (!shouldDelete) return;
    const result = await requestJson(`/api/answers/${encodeURIComponent(answerId)}`, { method: "DELETE" });
    if (!result.ok) {
      setStatus("error", result.message || "Antwort konnte nicht geloescht werden.");
      return;
    }
    await refreshQuestions();
    setStatus("success", "Antwort geloescht.");
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
    setStatus("error", result.message || "Antwort konnte nicht gespeichert werden.");
    return;
  }
  target.reset();
  await refreshQuestions();
  setStatus("success", "Antwort gespeichert.");
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
      setStatus("", "Bearbeitung abgebrochen.");
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

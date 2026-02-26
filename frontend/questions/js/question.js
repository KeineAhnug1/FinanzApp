const detailState = {
  user: null,
  questionId: "",
  question: null
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
  const node = document.getElementById("question-detail-status");
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

function renderAnswer(answer) {
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
        ${answer.can_edit ? `<button class="inline-btn" type="button" data-action="edit-answer" data-answer-id="${answer.id}">${t("questions.edit", "Bearbeiten")}</button>` : ""}
        ${answer.can_edit ? `<button class="inline-btn" type="button" data-action="delete-answer" data-answer-id="${answer.id}">${t("questions.delete", "Löschen")}</button>` : ""}
      </div>
    </li>
  `;
}

function renderQuestionDetail(question) {
  return `
    <article class="question-item question-detail-item">
      <div class="question-head">
        <div>
          <h1 class="question-topic">${escapeHtml(question.thema)}</h1>
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
      </div>

      <div class="answers-wrap">
        <p class="answers-title">${t("questions.answers_title", "Antworten ({count})", { count: question.answers?.length || 0 })}</p>
        <ul class="answer-list">
          ${Array.isArray(question.answers) && question.answers.length
            ? question.answers.map((answer) => renderAnswer(answer)).join("")
            : `<li><p class="empty">${t("questions.no_answers", "Noch keine Antworten.")}</p></li>`}
        </ul>

        <form class="answer-form" id="answer-form">
          <textarea class="field-input field-textarea" name="message" maxlength="4000" rows="3" required placeholder="${t("questions.answer_placeholder", "Antwort schreiben...")}"></textarea>
          <button class="submit-btn" type="submit">${t("questions.answer_submit", "Antworten")}</button>
        </form>
      </div>
    </article>
  `;
}

function renderNotFound() {
  const root = document.getElementById("question-detail");
  if (!root) return;
  root.innerHTML = `<p class="empty">${t("questions.not_found", "Frage nicht gefunden.")}</p>`;
}

function renderDetail() {
  const root = document.getElementById("question-detail");
  if (!root) return;
  if (!detailState.question) {
    renderNotFound();
    return;
  }

  root.innerHTML = renderQuestionDetail(detailState.question);
  const answerForm = document.getElementById("answer-form");
  if (answerForm) answerForm.addEventListener("submit", handleAnswerSubmit);
}

async function refreshQuestion() {
  if (!detailState.questionId) return;
  const result = await requestJson(`/api/questions/${encodeURIComponent(detailState.questionId)}`);
  if (!result.ok || !result.question) {
    detailState.question = null;
    renderDetail();
    return;
  }
  detailState.question = result.question;
  renderDetail();
}

async function handleAnswerSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  const formData = new FormData(form);
  const message = String(formData.get("message") || "").trim();
  if (!message) return;

  const result = await requestJson(`/api/questions/${encodeURIComponent(detailState.questionId)}/answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  if (!result.ok) {
    setStatus("error", result.message || t("questions.answer_save_failed", "Antwort konnte nicht gespeichert werden."));
    return;
  }

  form.reset();
  setStatus("success", t("questions.answer_saved", "Antwort gespeichert."));
  await refreshQuestion();
}

async function handleDetailClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const action = target.dataset.action;
  if (!action) return;

  if (action === "like-question") {
    const result = await requestJson(`/api/questions/${encodeURIComponent(detailState.questionId)}/like`, { method: "POST" });
    if (!result.ok) {
      setStatus("error", result.message || t("questions.like_failed", "Like konnte nicht gespeichert werden."));
      return;
    }
    await refreshQuestion();
    return;
  }

  if (action === "like-answer") {
    const answerId = String(target.dataset.answerId || "");
    if (!answerId) return;
    const result = await requestJson(`/api/answers/${encodeURIComponent(answerId)}/like`, { method: "POST" });
    if (!result.ok) {
      setStatus("error", result.message || t("questions.like_failed", "Like konnte nicht gespeichert werden."));
      return;
    }
    await refreshQuestion();
    return;
  }

  if (action === "edit-answer") {
    const answerId = String(target.dataset.answerId || "");
    if (!answerId || !detailState.question?.answers) return;
    const answer = detailState.question.answers.find((item) => String(item.id) === answerId);
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
    setStatus("success", t("questions.answer_updated", "Antwort aktualisiert."));
    await refreshQuestion();
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
    setStatus("success", t("questions.answer_deleted", "Antwort gelöscht."));
    await refreshQuestion();
  }
}

function resolveQuestionIdFromUrl() {
  const url = new URL(window.location.href);
  return String(url.searchParams.get("id") || "").trim();
}

async function bootstrap() {
  const session = await requestJson("/api/session");
  if (!session.ok || !session.session_user) {
    window.location.assign("/");
    return;
  }
  detailState.user = session.session_user;

  detailState.questionId = resolveQuestionIdFromUrl();
  if (!detailState.questionId) {
    renderNotFound();
    return;
  }

  document.addEventListener("click", handleDetailClick);
  await refreshQuestion();
}

bootstrap();

import{c as e,u as t}from"./theme-utils-BcoEdm65.js";import{n}from"./api-client-DDiDqhTa.js";import"./topbar-DB7avXqK.js";/* empty css              */import{t as r}from"./html-utils-CvLa23M7.js";var i={user:null,questionId:``,question:null};function a(e,n,r={}){let i=t(e,r);return i&&i!==e?i:!r||!Object.keys(r).length?n:String(n||``).replaceAll(/\{(\w+)\}/g,(e,t)=>String(r[t]??``))}function o(t){let n=new Date(t);if(Number.isNaN(n.getTime()))return`-`;let r=e(i.user?.id)||`de-DE`;return new Intl.DateTimeFormat(r,{dateStyle:`medium`,timeStyle:`short`}).format(n)}function s(e,t){let n=document.getElementById(`question-detail-status`);n&&(n.textContent=t||``,n.classList.remove(`is-error`,`is-success`),e===`error`&&n.classList.add(`is-error`),e===`success`&&n.classList.add(`is-success`))}async function c(e,t){return await n(e,t)}function l(e){return`
    <li class="answer-item">
      <p class="answer-text">${r(e.message)}</p>
      <p class="meta">
        ${r(e.author_username||e.author_first_name||a(`questions.author_unknown`,`Unbekannt`))} • ${o(e.created_at)}
        ${e.edited?` • ${a(`questions.edited`,`Bearbeitet`)}`:``}
      </p>
      <div class="inline-actions">
        <button class="inline-btn" type="button" data-action="like-answer" data-answer-id="${e.id}">
          ${e.liked_by_me?a(`questions.unlike`,`Unlike`):a(`questions.like`,`Like`)} (${e.likes_count||0})
        </button>
        ${e.can_edit?`<button class="inline-btn" type="button" data-action="edit-answer" data-answer-id="${e.id}">${a(`questions.edit`,`Bearbeiten`)}</button>`:``}
        ${e.can_edit?`<button class="inline-btn" type="button" data-action="delete-answer" data-answer-id="${e.id}">${a(`questions.delete`,`Löschen`)}</button>`:``}
      </div>
    </li>
  `}function u(e){return`
    <article class="question-item question-detail-item">
      <div class="question-head">
        <div>
          <h1 class="question-topic">${r(e.thema)}</h1>
          <p class="meta">
            ${r(e.author_username||e.author_first_name||a(`questions.author_unknown`,`Unbekannt`))} • ${o(e.created_at)}
            ${e.edited?` • ${a(`questions.edited`,`Bearbeitet`)}`:``}
          </p>
        </div>
        <span class="badge ${e.answered?`is-answered`:`is-open`}">${e.answered?a(`questions.status_answered`,`Beantwortet`):a(`questions.status_new`,`Neu`)}</span>
      </div>

      <p class="question-text">${r(e.message)}</p>

      <div class="inline-actions">
        <button class="inline-btn" type="button" data-action="like-question" data-question-id="${e.id}">
          ${e.liked_by_me?a(`questions.unlike`,`Unlike`):a(`questions.like`,`Like`)} (${e.likes_count||0})
        </button>
        ${e.can_edit?`<button class="inline-btn inline-btn--danger" type="button" data-action="delete-question" data-question-id="${e.id}">${a(`questions.delete`,`Löschen`)}</button>`:``}
      </div>

      <div class="answers-wrap">
        <p class="answers-title">${a(`questions.answers_title`,`Antworten ({count})`,{count:e.answers?.length||0})}</p>
        <ul class="answer-list">
          ${Array.isArray(e.answers)&&e.answers.length?e.answers.map(e=>l(e)).join(``):`<li><p class="empty">${a(`questions.no_answers`,`Noch keine Antworten.`)}</p></li>`}
        </ul>

        <form class="answer-form" id="answer-form">
          <textarea class="field-input field-textarea" name="message" maxlength="4000" rows="3" required placeholder="${a(`questions.answer_placeholder`,`Antwort schreiben...`)}"></textarea>
          <button class="submit-btn" type="submit">${a(`questions.answer_submit`,`Antworten`)}</button>
        </form>
      </div>
    </article>
  `}function d(){let e=document.getElementById(`question-detail`);e&&(e.innerHTML=`<p class="empty">${a(`questions.not_found`,`Frage nicht gefunden.`)}</p>`)}function f(){let e=document.getElementById(`question-detail`);if(!e)return;if(!i.question){d();return}e.innerHTML=u(i.question);let t=document.getElementById(`answer-form`);t&&t.addEventListener(`submit`,m)}async function p(){if(!i.questionId)return;let e=await c(`/api/questions/${encodeURIComponent(i.questionId)}`);if(!e.ok||!e.question){i.question=null,f();return}i.question=e.question,f()}async function m(e){e.preventDefault();let t=e.target;if(!(t instanceof HTMLFormElement))return;let n=new FormData(t),r=String(n.get(`message`)||``).trim();if(!r)return;let o=await c(`/api/questions/${encodeURIComponent(i.questionId)}/answers`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({message:r})});if(!o.ok){s(`error`,o.message||a(`questions.answer_save_failed`,`Antwort konnte nicht gespeichert werden.`));return}t.reset(),s(`success`,a(`questions.answer_saved`,`Antwort gespeichert.`)),await p()}async function h(e){let t=e.target;if(!(t instanceof HTMLElement))return;let n=t.dataset.action;if(n){if(n===`like-question`){let e=await c(`/api/questions/${encodeURIComponent(i.questionId)}/like`,{method:`POST`});if(!e.ok){s(`error`,e.message||a(`questions.like_failed`,`Like konnte nicht gespeichert werden.`));return}await p();return}if(n===`delete-question`){if(!window.confirm(a(`questions.delete_confirm`,`Frage wirklich löschen? Alle Antworten werden ebenfalls gelöscht.`)))return;let e=await c(`/api/questions/${encodeURIComponent(i.questionId)}`,{method:`DELETE`});if(!e.ok){s(`error`,e.message||a(`questions.delete_failed`,`Frage konnte nicht gelöscht werden.`));return}window.location.assign(`/pages/questions/`);return}if(n===`like-answer`){let e=String(t.dataset.answerId||``);if(!e)return;let n=await c(`/api/answers/${encodeURIComponent(e)}/like`,{method:`POST`});if(!n.ok){s(`error`,n.message||a(`questions.like_failed`,`Like konnte nicht gespeichert werden.`));return}await p();return}if(n===`edit-answer`){let e=String(t.dataset.answerId||``);if(!e||!i.question?.answers)return;let n=i.question.answers.find(t=>String(t.id)===e);if(!n)return;let r=window.prompt(a(`questions.answer_edit_prompt`,`Antwort bearbeiten:`),n.message||``);if(r==null)return;let o=String(r).trim();if(!o)return;let l=await c(`/api/answers/${encodeURIComponent(e)}`,{method:`PATCH`,headers:{"Content-Type":`application/json`},body:JSON.stringify({message:o})});if(!l.ok){s(`error`,l.message||a(`questions.answer_update_failed`,`Antwort konnte nicht bearbeitet werden.`));return}s(`success`,a(`questions.answer_updated`,`Antwort aktualisiert.`)),await p();return}if(n===`delete-answer`){let e=String(t.dataset.answerId||``);if(!e||!window.confirm(a(`questions.answer_delete_confirm`,`Antwort wirklich löschen?`)))return;let n=await c(`/api/answers/${encodeURIComponent(e)}`,{method:`DELETE`});if(!n.ok){s(`error`,n.message||a(`questions.answer_delete_failed`,`Antwort konnte nicht gelöscht werden.`));return}s(`success`,a(`questions.answer_deleted`,`Antwort gelöscht.`)),await p()}}}function g(){let e=new URL(window.location.href);return String(e.searchParams.get(`id`)||``).trim()}async function _(){let e=await c(`/api/session`);if(!e.ok||!e.session_user){window.location.assign(`/`);return}if(i.user=e.session_user,i.questionId=g(),!i.questionId){d();return}document.addEventListener(`click`,h),window.addEventListener(`finanzapp:locale-changed`,async()=>{await p()}),await p()}_();
import{a as e,u as t}from"./theme-utils-BcoEdm65.js";import{o as n}from"./session-utils-DITT7YtH.js";import{n as r,t as i}from"./api-client-DDiDqhTa.js";function a(e,n,r={}){let i=t(e,r);return i&&i!==e?i:!r||!Object.keys(r).length?n:String(n||``).replaceAll(/\{(\w+)\}/g,(e,t)=>String(r[t]??``))}var o=class extends HTMLElement{constructor(){super(),this.mode=`login`,this.pendingEmail=``,this.flash=null,this.codeExpiryRemaining=0,this.codeExpiryInterval=null,this.localeListener=()=>{this.render(),this.bindEvents()}}connectedCallback(){this.render(),this.bindEvents(),window.addEventListener(`finanzapp:locale-changed`,this.localeListener)}disconnectedCallback(){window.removeEventListener(`finanzapp:locale-changed`,this.localeListener),this.stopCodeExpiry()}startCodeExpiry(e){this.stopCodeExpiry(),this.codeExpiryRemaining=Math.max(1,Math.ceil(e)),this.updateExpiryDisplay(),this.codeExpiryInterval=setInterval(()=>{this.codeExpiryRemaining--,this.codeExpiryRemaining<=0&&this.stopCodeExpiry(),this.updateExpiryDisplay()},1e3)}stopCodeExpiry(){this.codeExpiryInterval&&=(clearInterval(this.codeExpiryInterval),null)}updateExpiryDisplay(){let e=this.querySelector(`#code-expiry`);if(!e)return;if(this.codeExpiryRemaining<=0){e.textContent=a(`auth.code_expired`,`Code abgelaufen. Bitte neuen Code anfordern.`),e.classList.remove(`is-warning`),e.classList.add(`is-expired`);return}let t=Math.floor(this.codeExpiryRemaining/60),n=this.codeExpiryRemaining%60;e.textContent=a(`auth.code_expires_in`,`Code gültig für {time}`,{time:t>0?`${t}:${String(n).padStart(2,`0`)}`:`${n}s`}),e.classList.remove(`is-expired`),e.classList.add(`is-warning`)}bindEvents(){let e=this.querySelector(`form`),t=this.querySelector(`#login-status`),n=this.querySelector(`button[type="submit"]`),r=this.querySelectorAll(`[data-auth-mode]`);for(let e of r)e.addEventListener(`click`,()=>{let t=e.dataset.authMode;(t===`login`||t===`register`||t===`verify`||t===`forgot`||t===`reset`)&&(this.mode=t,this.flash=null,this.render(),this.bindEvents())});if(this.mode===`login`&&this.pendingEmail){let e=this.querySelector(`#email`);e&&(e.value=this.pendingEmail)}this.flash&&=(l(t,this.flash.type,this.flash.text),null),(this.codeExpiryRemaining>0||this.codeExpiryInterval)&&this.updateExpiryDisplay(),e.addEventListener(`submit`,async r=>{r.preventDefault(),n.disabled=!0;try{if(this.mode===`login`){l(t,`idle`,a(`auth.checking_login`,`Prüfe Login...`)),await this.submitLogin(e,t);return}if(this.mode===`register`){l(t,`idle`,a(`auth.preparing_account`,`Konto wird vorbereitet...`)),await this.submitRegister(e,t);return}if(this.mode===`forgot`){l(t,`idle`,`Code wird angefordert...`),await this.submitForgot(e,t);return}if(this.mode===`reset`){l(t,`idle`,`Passwort wird zurückgesetzt...`),await this.submitReset(e,t);return}l(t,`idle`,a(`auth.verifying_code`,`Code wird geprüft...`)),await this.submitVerify(e,t)}finally{n.disabled=!1}})}async submitLogin(e,t){let r=new FormData(e),i=await s(`/api/login`,{email:String(r.get(`email`)||``).trim().toLowerCase(),password:String(r.get(`password`)||``)});if(i.status===429){c(this,t,i.retryAfter??60);return}if(!i.ok){l(t,`error`,i.message||a(`auth.login_failed`,`E-Mail oder Passwort ist falsch.`));return}l(t,`success`,a(`auth.login_success`,`Login erfolgreich: {email}`,{email:i.user.email})),n({...i.user,logged_in_at:new Date().toISOString()}),window.setTimeout(()=>{window.location.assign(`/pages/dashboard/dashboard.html`)},240)}async submitRegister(e,t){let n=new FormData(e),r=String(n.get(`first_name`)||``).trim(),i=String(n.get(`last_name`)||``).trim(),o=String(n.get(`username`)||``).trim().toLowerCase(),u=String(n.get(`email`)||``).trim().toLowerCase(),d=String(n.get(`password`)||``);if(d!==String(n.get(`confirm_password`)||``)){l(t,`error`,a(`auth.password_mismatch`,`Passwort und Passwort-Wiederholung stimmen nicht überein.`));return}let f=await s(`/api/register`,{first_name:r,last_name:i,username:o,email:u,password:d});if(f.status===429){c(this,t,f.retryAfter??60);return}if(!f.ok){l(t,`error`,f.message||a(`auth.register_failed`,`Konto konnte nicht erstellt werden.`));return}this.pendingEmail=f.pending_email||u,this.mode=`verify`,this.flash={type:`success`,text:f.message||a(`auth.verify_sent`,`Verifizierungscode wurde versendet.`)},this.render(),this.bindEvents();let p=Number(f.expires_in_seconds);p>0&&this.startCodeExpiry(p)}async submitVerify(e,t){let n=new FormData(e),r=String(n.get(`email`)||``).trim().toLowerCase(),i=await s(`/api/register/verify`,{email:r,code:String(n.get(`code`)||``).trim()});if(!i.ok){l(t,`error`,i.message||a(`auth.verify_failed`,`Code konnte nicht verifiziert werden.`));return}this.pendingEmail=i.user?.email||r,this.mode=`login`,this.flash={type:`success`,text:a(`auth.account_verified`,`Konto erstellt und verifiziert. Bitte jetzt einloggen.`)},this.render(),this.bindEvents()}async submitForgot(e,t){let n=new FormData(e),r=String(n.get(`email`)||``).trim().toLowerCase(),i=await s(`/api/password/forgot`,{email:r});if(i.status===429){c(this,t,i.retryAfter??60);return}this.pendingEmail=r,this.mode=`reset`,this.flash={type:`success`,text:i.message||`Falls ein Konto existiert, wurde ein Code versendet.`},this.render(),this.bindEvents();let a=Number(i.expires_in_seconds);a>0&&this.startCodeExpiry(a)}async submitReset(e,t){let n=new FormData(e),r=String(n.get(`email`)||``).trim().toLowerCase(),i=String(n.get(`code`)||``).trim(),a=String(n.get(`new_password`)||``);if(a!==String(n.get(`confirm_password`)||``)){l(t,`error`,`Die neuen Passwörter stimmen nicht überein.`);return}if(a.length<8){l(t,`error`,`Neues Passwort muss mindestens 8 Zeichen haben.`);return}let o=await s(`/api/password/reset`,{email:r,code:i,new_password:a});if(o.status===429){c(this,t,o.retryAfter??60);return}if(!o.ok){l(t,`error`,o.message||`Fehler beim Zurücksetzen.`);return}this.pendingEmail=r,this.mode=`login`,this.flash={type:`success`,text:`Passwort erfolgreich zurückgesetzt. Bitte jetzt einloggen.`},this.render(),this.bindEvents()}render(){let e=this.mode===`login`,t=this.mode===`register`,n=this.mode===`forgot`,r=this.mode===`reset`,i,o,s,c;e?(i=a(`auth.title_login`,`Willkommen zurück`),o=a(`auth.subtitle_login`,`Melde dich mit deiner E-Mail und deinem Passwort an.`),s=this.renderLoginFields(),c=a(`auth.submit_login`,`Einloggen`)):t?(i=a(`auth.title_register`,`Konto erstellen`),o=a(`auth.subtitle_register`,`Füll das Formular aus. Du erhältst danach einen Code per E-Mail.`),s=this.renderRegisterFields(),c=a(`auth.submit_register`,`Konto erstellen`)):n?(i=`Passwort vergessen`,o=`Gib deine E-Mail-Adresse ein. Wir senden dir einen Code zum Zurücksetzen.`,s=this.renderForgotFields(),c=`Code anfordern`):r?(i=`Neues Passwort setzen`,o=`Gib den Code aus der E-Mail und dein neues Passwort ein.`,s=this.renderResetFields(),c=`Passwort zurücksetzen`):(i=a(`auth.title_verify`,`E-Mail bestätigen`),o=a(`auth.subtitle_verify`,`Wir haben dir einen 6-stelligen Code gesendet. Bitte hier eingeben.`),s=this.renderVerifyFields(),c=a(`auth.submit_verify`,`Code bestätigen`)),this.innerHTML=`
      <section class="login-card">
        <h1 class="login-title">${i}</h1>
        <p class="login-subtitle">${o}</p>

        <form class="login-form">
          ${s}
          <button class="login-button" type="submit">${c}</button>
        </form>

        <p id="login-status" class="login-status"></p>
        <div class="auth-divider"></div>
        ${this.renderModeActions()}
      </section>
    `}renderLoginFields(){return`
      <div>
        <label class="login-label" for="email">${a(`auth.email`,`E-Mail`)}</label>
        <input class="login-input" id="email" name="email" type="email" required autocomplete="email" placeholder="name@beispiel.de" />
      </div>
      <div>
        <div class="login-label-row">
          <label class="login-label" for="password">${a(`auth.password`,`Passwort`)}</label>
          <button class="auth-mode-link auth-mode-link--inline" type="button" tabindex="-1" data-auth-mode="forgot">Vergessen?</button>
        </div>
        <input class="login-input" id="password" name="password" type="password" required autocomplete="current-password" placeholder="${a(`auth.password_placeholder`,`Passwort eingeben`)}" />
      </div>
    `}renderForgotFields(){return`
      <div>
        <label class="login-label" for="email">${a(`auth.email`,`E-Mail`)}</label>
        <input class="login-input" id="email" name="email" type="email" required autocomplete="email" placeholder="name@beispiel.de" value="${u(this.pendingEmail)}" />
      </div>
    `}renderResetFields(){return`
      <div>
        <label class="login-label" for="email">${a(`auth.email`,`E-Mail`)}</label>
        <input class="login-input" id="email" name="email" type="email" required autocomplete="email" value="${u(this.pendingEmail)}" />
      </div>
      <div>
        <label class="login-label" for="code">Code aus der E-Mail</label>
        <input class="login-input verify-code-input" id="code" name="code" type="text" inputmode="numeric" maxlength="6" required placeholder="123456" />
      </div>
      <p id="code-expiry" class="code-expiry"></p>
      <div>
        <label class="login-label" for="new_password">Neues Passwort</label>
        <input class="login-input" id="new_password" name="new_password" type="password" required minlength="8" autocomplete="new-password" placeholder="${a(`auth.password_min`,`mind. 8 Zeichen`)}" />
      </div>
      <div>
        <label class="login-label" for="confirm_password">Neues Passwort bestätigen</label>
        <input class="login-input" id="confirm_password" name="confirm_password" type="password" required minlength="8" autocomplete="new-password" placeholder="wiederholen" />
      </div>
    `}renderRegisterFields(){return`
      <div class="form-row">
        <div>
          <label class="login-label" for="first_name">${a(`auth.first_name`,`Vorname`)}</label>
          <input class="login-input" id="first_name" name="first_name" type="text" required placeholder="Anna" />
        </div>
        <div>
          <label class="login-label" for="last_name">${a(`auth.last_name`,`Nachname`)}</label>
          <input class="login-input" id="last_name" name="last_name" type="text" required placeholder="Schmidt" />
        </div>
      </div>
      <div>
        <label class="login-label" for="username">${a(`auth.username`,`Username`)}</label>
        <input class="login-input" id="username" name="username" type="text" required placeholder="anna" />
      </div>
      <div>
        <label class="login-label" for="email">${a(`auth.email`,`E-Mail`)}</label>
        <input class="login-input" id="email" name="email" type="email" required placeholder="name@beispiel.de" />
      </div>
      <div class="form-row">
        <div>
          <label class="login-label" for="password">${a(`auth.password`,`Passwort`)}</label>
          <input class="login-input" id="password" name="password" type="password" required minlength="8" placeholder="${a(`auth.password_min`,`mind. 8 Zeichen`)}" />
        </div>
        <div>
          <label class="login-label" for="confirm_password">${a(`auth.password_repeat`,`Passwort wiederholen`)}</label>
          <input class="login-input" id="confirm_password" name="confirm_password" type="password" required minlength="8" placeholder="${a(`auth.password_repeat_placeholder`,`wiederholen`)}" />
        </div>
      </div>
    `}renderVerifyFields(){return`
      <div>
        <label class="login-label" for="email">${a(`auth.email`,`E-Mail`)}</label>
        <input class="login-input" id="email" name="email" type="email" required readonly value="${u(this.pendingEmail)}" />
      </div>
      <div>
        <label class="login-label" for="code">${a(`auth.verification_code`,`Verifizierungscode`)}</label>
        <input class="login-input verify-code-input" id="code" name="code" type="text" inputmode="numeric" maxlength="6" required placeholder="123456" />
      </div>
      <p id="code-expiry" class="code-expiry"></p>
    `}renderModeActions(){return this.mode===`login`?`<button class="auth-mode-link" type="button" data-auth-mode="register">${a(`auth.switch_to_register`,`Kein Konto? Jetzt registrieren`)}</button>`:this.mode===`register`?`<button class="auth-mode-link" type="button" data-auth-mode="login">${a(`auth.switch_to_login`,`Schon ein Konto? Zum Login`)}</button>`:this.mode===`forgot`?`<button class="auth-mode-link" type="button" data-auth-mode="login">${a(`auth.back_to_login`,`Zurück zum Login`)}</button>`:this.mode===`reset`?`
        <div class="auth-mode-row">
          <button class="auth-mode-link" type="button" data-auth-mode="forgot">Code erneut anfordern</button>
          <button class="auth-mode-link" type="button" data-auth-mode="login">${a(`auth.back_to_login`,`Zurück zum Login`)}</button>
        </div>
      `:`
      <div class="auth-mode-row">
        <button class="auth-mode-link" type="button" data-auth-mode="register">${a(`auth.verify_not_received`,`Code nicht erhalten? Neu registrieren`)}</button>
        <button class="auth-mode-link" type="button" data-auth-mode="login">${a(`auth.back_to_login`,`Zurück zum Login`)}</button>
      </div>
    `}};async function s(e,t){try{let n=await i(e,{method:`POST`,credentials:`same-origin`,body:t}),r=Number(n.retryAfter)||null,a=n.data?.message||n.message;return{...n.data,ok:n.ok,status:n.status,retryAfter:r,message:a}}catch{return{ok:!1,status:0,message:a(`auth.server_unreachable`,`Server nicht erreichbar.`)}}}function c(e,t,n){let r=e.querySelector(`button[type="submit"]`),i=Math.max(1,Math.ceil(n)),o=()=>{l(t,`error`,a(`auth.rate_limited`,`Zu viele Versuche. Bitte warte {s} Sekunde(n).`,{s:i})),r&&(r.disabled=!0,r.textContent=a(`auth.rate_limited_btn`,`Warte {s}s…`,{s:i}))};o();let s=setInterval(()=>{i--,i<=0?(clearInterval(s),l(t,`idle`,``),r&&(r.disabled=!1,r.textContent=e.mode===`login`?a(`auth.submit_login`,`Einloggen`):a(`auth.submit_register`,`Konto erstellen`))):o()},1e3)}function l(e,t,n){e.textContent=n,e.classList.remove(`is-success`,`is-error`),t===`success`&&e.classList.add(`is-success`),t===`error`&&e.classList.add(`is-error`)}function u(e){return String(e||``).replaceAll(`&`,`&amp;`).replaceAll(`"`,`&quot;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`)}customElements.define(`users-login`,o),e(),(async()=>{try{let e=await r(`/api/session`,{credentials:`same-origin`});e?.ok&&e.session_user&&(n(e.session_user),window.location.assign(`/pages/dashboard/dashboard.html`))}catch{}})();
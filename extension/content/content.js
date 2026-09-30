// Runs on covered AI services. Stops sign-in when the email entered is not in an allowed
// domain, and stops "Sign in with ..." buttons for identity providers that are not allowed.
//
// Works generically rather than with per-site selectors: sign-in forms are recognized by
// their email field, and actions are intercepted in the capture phase (before the page's
// own handlers) for submit, button clicks, and Enter in an email field.
(function () {
  "use strict";

  const G = globalThis.AIGuard;
  const provider = G.providerForHost(location.hostname);
  if (!provider) return;

  let state = null; // { config, source }
  let ready = requestConfig();

  function requestConfig() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "getConfig" }, (result) => {
        state = chrome.runtime.lastError || !result ? { config: G.normalizeConfig({}), source: "default" } : result;
        resolve(state);
      });
    });
  }

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "managed" || area === "local") ready = requestConfig();
  });

  const EMAIL_SELECTOR = [
    'input[type="email"]',
    'input[autocomplete~="email"]',
    'input[autocomplete~="username"]',
    'input[name*="email" i]',
    'input[id*="email" i]',
    'input[name="username" i]',
    'input[name="identifier" i]',
  ].join(",");

  const SSO_VERB = /\b(continue|sign\s*-?\s*(in|up|on)|log\s*-?\s*in|login|register|connect)\s+(with|using|via|through)\b/i;
  const ENTERPRISE_SSO = /\b(sso|single\s+sign[\s-]*on|saml|enterprise|work\s+account|organization)\b/i;
  const ACTION_SELECTOR = 'button, [role="button"], input[type="submit"], input[type="button"], a[href]';

  // Collects inputs from the document and any open shadow roots.
  function allEmailInputs(root = document) {
    const found = [...root.querySelectorAll(EMAIL_SELECTOR)];
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) found.push(...allEmailInputs(el.shadowRoot));
    }
    return found;
  }

  function isVisible(el) {
    if (!el.isConnected || el.type === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // Returns the first entered email that is not allowed, or null.
  function disallowedEmail(scope) {
    const inputs = scope ? [...scope.querySelectorAll(EMAIL_SELECTOR)] : allEmailInputs();
    for (const input of inputs) {
      const value = String(input.value || "").trim();
      if (!value.includes("@") || !isVisible(input)) continue;
      if (!G.isEmailAllowed(value, state.config)) return value;
    }
    return null;
  }

  function actionElement(event) {
    for (const node of event.composedPath()) {
      if (node instanceof Element && node.matches(ACTION_SELECTOR)) return node;
    }
    return null;
  }

  function labelOf(el) {
    return [el.getAttribute("aria-label"), el.getAttribute("title"), el.value, el.textContent]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  }

  // Classifies a clicked element as a third-party sign-in button. Returns the identity
  // provider object, "enterprise" for company SSO buttons, or null if it isn't one.
  function signInMethod(el) {
    const label = labelOf(el);
    if (!SSO_VERB.test(label)) return null;
    if (ENTERPRISE_SSO.test(label)) return "enterprise";
    if (/\bemail\b/i.test(label)) return null;
    return G.IDENTITY_PROVIDERS.find((p) => p.match && p.match.test(label.replace(SSO_VERB, " "))) || null;
  }

  function stop(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function check(event, action) {
    if (!state) {
      // Config has not arrived yet (first few ms of page load). Fail closed for sign-in
      // actions and let the user retry once it has loaded.
      if (action && (signInMethod(action) || disallowedEmailFallback())) {
        stop(event);
        ready.then(() => showBlocked({ kind: "loading" }));
      }
      return;
    }
    if (state.config.ProviderModes[provider.id] !== "enforce") return;

    if (action) {
      const method = signInMethod(action);
      if (method && method !== "enterprise" && !G.identityProviderAllowed(method.id, state.config)) {
        stop(event);
        showBlocked({ kind: "sso", idp: method });
        return;
      }
    }

    const email = disallowedEmail();
    if (email) {
      stop(event);
      showBlocked({ kind: "email", email });
    }
  }

  function disallowedEmailFallback() {
    return allEmailInputs().some((i) => String(i.value || "").includes("@"));
  }

  // Capture phase on window runs before the page's own listeners.
  window.addEventListener("submit", (e) => check(e, null), true);

  window.addEventListener("click", (e) => {
    const action = actionElement(e);
    if (action) check(e, action);
  }, true);

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    const target = e.composedPath()[0];
    if (target instanceof HTMLInputElement) check(e, null);
  }, true);

  // ---- Block notice -------------------------------------------------------------------

  let host = null;

  function showBlocked(info) {
    if (host) host.remove();
    host = document.createElement("ai-account-guard");
    const shadow = host.attachShadow({ mode: "closed" });
    const c = state ? state.config : G.normalizeConfig({});
    const org = c.OrganizationName || "Your organization";
    const domains = c.AllowedDomains.map((d) => "@" + d.replace(/^\*\./, "*.")).join(", ");

    let title;
    let body;
    if (info.kind === "loading") {
      title = "One moment";
      body = "Account protection is still loading. Please try again.";
    } else if (info.kind === "sso") {
      title = `Signing in with ${info.idp.name} isn't allowed`;
      body = `${org} only allows ${provider.name} with your work account.`;
    } else {
      title = "Personal accounts aren't allowed";
      body = `${org} only allows ${provider.name} with your work account. ` +
        `“${info.email}” isn't an approved address.`;
    }

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .backdrop { position: fixed; inset: 0; z-index: 2147483647; background: rgba(15, 23, 42, .55);
          display: flex; align-items: center; justify-content: center; padding: 16px;
          font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
        .card { background: #fff; color: #0f172a; max-width: 440px; width: 100%; border-radius: 14px;
          padding: 24px; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
        h2 { margin: 0 0 8px; font-size: 19px; line-height: 1.3; }
        p { margin: 0 0 12px; }
        .muted { color: #475569; font-size: 14px; }
        .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; flex-wrap: wrap; }
        a, button { font: inherit; border-radius: 8px; padding: 8px 14px; cursor: pointer; text-decoration: none; }
        a { background: #1d4ed8; color: #fff; border: 1px solid #1d4ed8; }
        button { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; }
        @media (prefers-color-scheme: dark) {
          .card { background: #1e293b; color: #f1f5f9; }
          .muted { color: #94a3b8; }
          button { background: #1e293b; color: #f1f5f9; border-color: #475569; }
        }
      </style>
      <div class="backdrop" role="alertdialog" aria-modal="true" aria-labelledby="t">
        <div class="card">
          <h2 id="t"></h2>
          <p class="body"></p>
          <p class="muted domains"></p>
          <p class="muted support"></p>
          <div class="actions">
            <button type="button" class="close">Close</button>
          </div>
        </div>
      </div>`;

    // Text is set with textContent so config values and typed emails can't inject markup.
    shadow.getElementById("t").textContent = title;
    shadow.querySelector(".body").textContent = body;
    const domainsEl = shadow.querySelector(".domains");
    if (info.kind !== "loading" && domains) domainsEl.textContent = `Approved: ${domains}`;
    else domainsEl.remove();
    const supportEl = shadow.querySelector(".support");
    if (c.SupportMessage) supportEl.textContent = c.SupportMessage;
    else supportEl.remove();

    if (c.SsoPortalUrl && info.kind !== "loading") {
      const link = document.createElement("a");
      link.href = c.SsoPortalUrl;
      link.textContent = "Go to company sign-in";
      shadow.querySelector(".actions").append(link);
    }

    const close = () => {
      host.remove();
      host = null;
    };
    shadow.querySelector(".close").addEventListener("click", close);
    shadow.querySelector(".backdrop").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) close();
    });
    document.documentElement.append(host);
    shadow.querySelector(c.SsoPortalUrl && info.kind !== "loading" ? "a" : ".close").focus();
  }
})();

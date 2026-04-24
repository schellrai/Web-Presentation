(function () {
  const STORAGE_KEY = "appLang";
  const FALLBACK_LANG = "en";
  const LANG_LABELS = {
    en: "English",
    de: "German",
    it: "Italian",
    es: "Spanish",
    el: "Greek"
  };
  const AVAILABLE_LANGS = ["en", "de", "it", "es", "el"];

  const sourceByKey = {};
  const cache = {};
  const pendingByLang = {};
  let activeLang = FALLBACK_LANG;
  let languageRequestId = 0;

  function getSavedLang() {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return AVAILABLE_LANGS.includes(saved) ? saved : FALLBACK_LANG;
  }

  function getNodes() {
    return Array.from(document.querySelectorAll("[data-i18n]"));
  }

  function captureSourceTexts() {
    getNodes().forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (!key) return;
      if (!sourceByKey[key]) {
        sourceByKey[key] = node.textContent.trim();
      }
    });
    sourceByKey["lang.label"] = "Language";
    sourceByKey["lang.en"] = "English";
    sourceByKey["lang.de"] = "German";
    sourceByKey["lang.it"] = "Italian";
    sourceByKey["lang.es"] = "Spanish";
    sourceByKey["lang.el"] = "Greek";
    sourceByKey["lang.ai_notice"] = "Translation generated with AI.";
    sourceByKey["theme.bright"] = "Bright Mode";
    sourceByKey["theme.dark"] = "Dark Mode";
    sourceByKey["theme.aria_bright"] = "Enable bright mode";
    sourceByKey["theme.aria_dark"] = "Enable dark mode";
  }

  async function translateText(text, targetLang) {
    if (!text || targetLang === FALLBACK_LANG) return text;

    const params = new URLSearchParams();
    params.set("client", "gtx");
    params.set("sl", "en");
    params.set("tl", targetLang);
    params.set("dt", "t");
    params.set("q", text);

    const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) return text;
    const data = await response.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) return text;
    return data[0].map((part) => part[0]).join("");
  }

  async function translateTextWithRetry(text, targetLang) {
    try {
      return await translateText(text, targetLang);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
      try {
        return await translateText(text, targetLang);
      } catch {
        return text;
      }
    }
  }

  async function ensureLanguageCache(lang) {
    if (!cache[lang]) cache[lang] = {};
    if (!pendingByLang[lang]) pendingByLang[lang] = {};
    const keys = Object.keys(sourceByKey);
    const missing = keys.filter((key) => cache[lang][key] == null);
    if (!missing.length) return;

    await Promise.all(missing.map(async (key) => {
      if (!pendingByLang[lang][key]) {
        pendingByLang[lang][key] = translateTextWithRetry(sourceByKey[key], lang)
          .then((value) => {
            cache[lang][key] = value;
          })
          .finally(() => {
            delete pendingByLang[lang][key];
          });
      }
      await pendingByLang[lang][key];
    }));
  }

  function getText(key) {
    if (activeLang === FALLBACK_LANG) return sourceByKey[key] ?? key;
    return cache[activeLang]?.[key] ?? sourceByKey[key] ?? key;
  }

  function applyNodeTexts() {
    getNodes().forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (!key) return;
      node.textContent = getText(key);
    });
  }

  function updateLanguageMenuText() {
    const select = document.querySelector("#language-select");
    if (!select) return;
    select.setAttribute("aria-label", getText("lang.label"));

    Array.from(select.options).forEach((option) => {
      option.textContent = LANG_LABELS[option.value] ?? option.value;
    });
    select.value = activeLang;
  }

  function updateTranslationNotice() {
    const note = document.querySelector(".language-note");
    if (!note) return;
    if (activeLang === FALLBACK_LANG) {
      note.textContent = "Original";
      note.hidden = false;
      return;
    }
    note.textContent = getText("lang.ai_notice");
    note.hidden = false;
  }

  function refreshThemeButtonText() {
    const bright = document.body.classList.contains("bright-mode");
    const iconGlyph = bright ? "\uD83C\uDF19" : "\u2600";
    const ariaKey = bright ? "theme.aria_dark" : "theme.aria_bright";
    document.querySelectorAll(".theme-toggle").forEach((button) => {
      let icon = button.querySelector(".theme-toggle-icon");
      if (!icon) {
        icon = document.createElement("span");
        icon.className = "theme-toggle-icon";
        icon.setAttribute("aria-hidden", "true");
        button.textContent = "";
        button.appendChild(icon);
      }
      icon.textContent = iconGlyph;
      button.setAttribute("aria-label", getText(ariaKey));
    });
  }

  function injectLanguageMenu() {
    if (document.querySelector(".language-menu")) return;

    const style = document.createElement("style");
    style.textContent = `
      .language-menu {
        position: fixed;
        top: calc(14px * var(--screen-fit-scale, 1));
        right: var(--utility-stack-right, 20px);
        z-index: 45;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: calc(4px * var(--screen-fit-scale, 1));
        width: var(--utility-stack-width, 172px);
        box-sizing: border-box;
        padding: calc(8px * var(--screen-fit-scale, 1));
        border-radius: calc(12px * var(--screen-fit-scale, 1));
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(18, 24, 32, 0.88);
        box-shadow: 0 10px 22px rgba(0, 0, 0, 0.36);
        font-size: calc(15px * var(--screen-fit-scale, 1));
        color: inherit;
        opacity: 1;
        transform: translateY(0);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      .language-menu.is-hidden {
        opacity: 0;
        transform: translateY(-10px);
        pointer-events: none;
      }
      .language-menu-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .language-menu select {
        width: 100%;
        height: calc(42px * var(--screen-fit-scale, 1));
        box-sizing: border-box;
        border-radius: calc(8px * var(--screen-fit-scale, 1));
        border: 1px solid #3b3f46;
        background: #222a34;
        color: #f3f4f6;
        padding: calc(7px * var(--screen-fit-scale, 1)) calc(14px * var(--screen-fit-scale, 1));
        line-height: 1.3;
        font-size: calc(15px * var(--screen-fit-scale, 1));
        transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
      }
      .language-menu select option {
        line-height: 1.3;
      }
      .language-note {
        font-size: calc(13px * var(--screen-fit-scale, 1));
        line-height: 1.35;
        margin-top: calc(2px * var(--screen-fit-scale, 1));
        opacity: 0.8;
        overflow-wrap: anywhere;
      }
      body.bright-mode .language-menu {
        border-color: #cdbca6;
        background: rgba(247, 240, 228, 0.94);
      }
      body.bright-mode .language-menu select {
        border-color: #cdbca6;
        background: #f7f0e4;
        color: #2f2a22;
      }
      @media (max-width: 768px) {
        .language-menu {
          right: var(--utility-stack-right, 14px);
        }
        .language-menu select {
          width: var(--utility-stack-width, 154px);
        }
      }
    `;
    document.head.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.className = "language-menu";

    const select = document.createElement("select");
    select.id = "language-select";
    AVAILABLE_LANGS.forEach((code) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = LANG_LABELS[code];
      select.appendChild(option);
    });
    select.value = activeLang;
    select.addEventListener("change", async () => {
      await setLanguage(select.value);
    });

    wrapper.appendChild(select);

    const note = document.createElement("div");
    note.className = "language-note";
    note.hidden = true;
    wrapper.appendChild(note);

    document.body.appendChild(wrapper);
    setupLanguageMenuScrollBehavior(wrapper);
  }

  function getLanguageMenuScrollTop() {
    const page = document.querySelector(".page");
    if (page) return page.scrollTop;
    return window.scrollY || document.documentElement.scrollTop || 0;
  }

  function setupLanguageMenuScrollBehavior(wrapper) {
    const updateVisibility = () => {
      wrapper.classList.toggle("is-hidden", getLanguageMenuScrollTop() > 8);
    };

    const page = document.querySelector(".page");
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility, { passive: true });
    if (page) {
      page.addEventListener("scroll", updateVisibility, { passive: true });
    }

    updateVisibility();
  }

  async function setLanguage(lang) {
    const requestId = ++languageRequestId;
    activeLang = AVAILABLE_LANGS.includes(lang) ? lang : FALLBACK_LANG;
    window.localStorage.setItem(STORAGE_KEY, activeLang);
    updateLanguageMenuText();
    updateTranslationNotice();
    applyNodeTexts();
    refreshThemeButtonText();

    const select = document.querySelector("#language-select");
    if (select) select.disabled = true;

    if (activeLang !== FALLBACK_LANG) {
      await ensureLanguageCache(activeLang);
    }

    if (requestId !== languageRequestId) return;
    applyNodeTexts();
    updateLanguageMenuText();
    updateTranslationNotice();
    refreshThemeButtonText();
    if (select) select.disabled = false;
  }

  window.refreshI18nThemeButtons = refreshThemeButtonText;

  document.addEventListener("DOMContentLoaded", async () => {
    captureSourceTexts();
    activeLang = getSavedLang();
    injectLanguageMenu();
    await setLanguage(activeLang);
  });
})();


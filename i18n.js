(function () {
  const STORAGE_KEY = "appLang";
  const FALLBACK_LANG = "en";
  const LANG_LABELS = {
    en: "English (Original)",
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
    sourceByKey["lang.en"] = "English (Original)";
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
      note.textContent = "";
      note.hidden = true;
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
        top: 14px;
        right: var(--utility-stack-right, 20px);
        z-index: 45;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        font-size: 15px;
        color: inherit;
      }
      .language-menu-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .language-menu select {
        width: var(--utility-stack-width, 172px);
        height: 42px;
        box-sizing: border-box;
        border-radius: 8px;
        border: 1px solid #3b3f46;
        background: #222a34;
        color: #f3f4f6;
        padding: 7px 14px;
        line-height: 1.3;
        font-size: 15px;
        transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
      }
      .language-menu select option {
        line-height: 1.3;
      }
      .language-note {
        font-size: 13px;
        opacity: 0.8;
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


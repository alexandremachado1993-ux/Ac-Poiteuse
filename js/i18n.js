/* =============================================================
   i18n.js — translation engine (FR / EN / ES / DE)
   Same principle as CONGER PAYER (Traduction.js):
   - static HTML text: data-i18n="key" (and data-i18n-placeholder,
     data-i18n-title, data-i18n-aria-label);
   - dynamic text: I18n.t("key") or I18n.t("key", { name: "…" });
   - the language is stored on the device (key acp_language); with
     no explicit choice it follows the browser language, else French;
   - changing the language reloads the page (simplest and safest:
     every screen is rebuilt in the new language).
   The dictionary lives in translations.js (TRANSLATIONS):
     key: [French, English, Spanish, German]
   ============================================================= */

const I18n = (() => {
    "use strict";

    const STORAGE_KEY = "acp_language";
    const DEFAULT_LANGUAGE = "fr";
    const LANGUAGES = ["fr", "en", "es", "de"];   /* order = column order in TRANSLATIONS */
    const LOCALES = { fr: "fr-FR", en: "en-GB", es: "es-ES", de: "de-DE" };
    const NAMES = { fr: "Français", en: "English", es: "Español", de: "Deutsch" };

    function language() {
        let stored = null;
        stored = StorageAdapter.get(STORAGE_KEY);
        if (stored && LOCALES[stored]) return stored;
        const nav = (typeof navigator !== "undefined" && navigator.language || "").slice(0, 2).toLowerCase();
        return LOCALES[nav] ? nav : DEFAULT_LANGUAGE;
    }

    function setLanguage(code, reload) {
        if (!LOCALES[code]) return;
        StorageAdapter.set(STORAGE_KEY, code);
        if (reload !== false) window.location.reload();
    }

    function locale() {
        return LOCALES[language()];
    }

    /* Text in a given language (used by imports to recognise all languages) */
    function tIn(lang, key, params) {
        const entry = TRANSLATIONS[key];
        const index = Math.max(0, LANGUAGES.indexOf(lang));
        let text = entry ? (entry[index] || entry[0]) : key;
        if (params) {
            Object.keys(params).forEach(p => { text = text.split("{" + p + "}").join(params[p]); });
        }
        return text;
    }

    function t(key, params) {
        return tIn(language(), key, params);
    }

    /* Every translation of a key (to recognise imported files written in any language) */
    function allTranslations(key) {
        const entry = TRANSLATIONS[key];
        return entry ? entry.slice() : [key];
    }

    function apply(root) {
        const scope = root || document;
        if (!root) document.documentElement.lang = language();
        scope.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
        scope.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
        scope.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = t(el.dataset.i18nTitle); });
        scope.querySelectorAll("[data-i18n-aria-label]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel)); });
    }

    /* <option> list for a language <select> */
    function optionsHtml(selected) {
        return LANGUAGES.map(code => '<option value="' + code + '"' + (code === selected ? " selected" : "") + ">" +
            code.toUpperCase() + " — " + NAMES[code] + "</option>").join("");
    }

    return { LANGUAGES, NAMES, language, setLanguage, locale, t, tIn, allTranslations, apply, optionsHtml };
})();

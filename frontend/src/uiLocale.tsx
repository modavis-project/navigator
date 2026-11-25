import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createIntl, createIntlCache } from "react-intl";

export type UiLocale = "en" | "de";
export const UI_LOCALE_KEY = "modavis.ui-locale.v1";
type Values = Record<string, string | number>;
export type UiText = (id: string, english: string, german: string, values?: Values) => string;
const locales = { en: "en-GB", de: "de-DE" } as const;
const cache = createIntlCache();

export function readUiLocale(storage?: Pick<Storage, "getItem">): UiLocale {
  try {
    return (storage ?? window.localStorage).getItem(UI_LOCALE_KEY) === "de" ? "de" : "en";
  } catch {
    return "en";
  }
}

function languagePresentation(locale: UiLocale) {
  const intlLocale = locales[locale];
  const intl = createIntl({ locale: intlLocale, defaultLocale: intlLocale }, cache);
  const t: UiText = (id, english, german, values) =>
    intl.formatMessage({ id, defaultMessage: locale === "de" ? german : english }, values);
  return { locale, intlLocale, t, formatNumber: intl.formatNumber };
}

const englishPresentation = languagePresentation("en");
const UiLocaleContext = createContext({
  ...englishPresentation,
  available: false,
  setLocale: (_locale: UiLocale) => {},
});

export function UiLocaleProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const [preference, setPreference] = useState<UiLocale>(() => enabled ? readUiLocale() : "en");
  const locale = enabled ? preference : "en";
  const value = useMemo(() => ({
    ...languagePresentation(locale),
    available: enabled,
    setLocale: (choice: UiLocale) => {
      if (!enabled) return;
      setPreference(choice);
      try { window.localStorage.setItem(UI_LOCALE_KEY, choice); }
      catch { /* Session selection still works with storage disabled. */ }
    },
  }), [enabled, locale]);
  useEffect(() => {
    document.documentElement.lang = value.intlLocale;
  }, [value.intlLocale]);
  return <UiLocaleContext.Provider value={value}>{children}</UiLocaleContext.Provider>;
}

export function useUiLocale() {
  return useContext(UiLocaleContext);
}

export function UiLanguageSelector() {
  const { locale, setLocale, t, available } = useUiLocale();
  if (!available) return null;
  return <div className="ui-language-selector" role="group" aria-label={t("shell.language", "Interface language", "Sprache der Benutzeroberfläche")}>
    <button type="button" lang="en" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>English</button>
    <button type="button" lang="de" aria-pressed={locale === "de"} onClick={() => setLocale("de")}>Deutsch</button>
  </div>;
}

export function UiLanguagePreviewNotice() {
  const { locale } = useUiLocale();
  if (locale !== "de") return null;
  return <p className="ui-language-preview" lang="de">
    Deutsche Vorschau. Einige Ansichten und Fachwerkzeuge sind noch auf Englisch verfügbar.
  </p>;
}

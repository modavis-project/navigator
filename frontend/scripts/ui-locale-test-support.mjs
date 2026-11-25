import { createIntl, createIntlCache } from "react-intl";

export function testUiLocale(locale = "en") {
  const intlLocale = locale === "de" ? "de-DE" : "en-GB";
  const intl = createIntl({ locale: intlLocale, defaultLocale: intlLocale }, createIntlCache());
  return {
    locale, intlLocale, formatNumber: intl.formatNumber,
    t: (id, english, german, values) => intl.formatMessage({ id, defaultMessage: locale === "de" ? german : english }, values),
  };
}

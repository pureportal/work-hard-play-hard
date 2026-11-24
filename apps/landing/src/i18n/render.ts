import { copy, languagePaths, languages, type Language } from "./copy.ts";

const alternates = [...languages.map((language) => [language, languagePaths[language]]), ["x-default", languagePaths.en]]
  .map(([language, path]) => `<link rel="alternate" hreflang="${language}" href="${path}" />`).join("");

export function renderPage(template: string, language: Language): string {
  const other: Language = language === "en" ? "de" : "en";
  const values: Record<string, string> = {
    ...copy[language],
    lang: language,
    alternates,
    switchLang: other,
    switchHref: languagePaths[other],
    homeHref: languagePaths[language],
  };
  return template.replace(/\{\{(\w+)\}\}/g, (placeholder, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`Missing landing copy for ${placeholder}`);
    return value;
  });
}

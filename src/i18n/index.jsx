import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ar from './ar.json';
import en from './en.json';

const dictionaries = { ar, en };
const STORAGE_KEY = 'pt.lang';

function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return 'ar';
}

export function translate(lang, key, vars) {
  const template = dictionaries[lang]?.[key] ?? dictionaries.ar[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`));
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = translate(lang, 'app.name');
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  const setLang = useCallback((next) => {
    if (next === 'ar' || next === 'en') setLangState(next);
  }, []);

  const value = useMemo(() => {
    const locale = lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB';
    const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
    return {
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      formatDate: (iso) => {
        if (!iso) return '';
        const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
        return dateFmt.format(new Date(y, m - 1, d));
      },
      formatDateTime: (ts) => (ts ? dateTimeFmt.format(new Date(ts)) : ''),
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { eventLabel, formatDate, statusLabel, translate, type Locale } from '../lib/translations';

const LocaleContext = createContext<{ locale: Locale; setLocale: (value: Locale) => void }>({
  locale: 'en',
  setLocale: () => {},
});
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem('jobhunt.locale');
      if (stored === 'en' || stored === 'ru' || stored === 'uk') setLocale(stored);
    } catch {
      /* Browsing restrictions must not prevent language selection. */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    document.documentElement.lang = locale;
    try {
      localStorage.setItem('jobhunt.locale', locale);
    } catch {
      /* Language remains usable for the current session. */
    }
  }, [locale, loaded]);
  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}
export function useLocale() {
  const context = useContext(LocaleContext);
  return {
    ...context,
    t: (key: string, values?: Record<string, string | number>) =>
      translate(context.locale, key, values),
    label: (value: string) => statusLabel(context.locale, value),
    date: (value?: string) => formatDate(context.locale, value),
    event: (value: Parameters<typeof eventLabel>[1]) => eventLabel(context.locale, value),
    known: (value: string) =>
      value === 'Manual'
        ? translate(context.locale, 'Source') === 'Source'
          ? 'Manual'
          : context.locale === 'ru'
            ? 'Вручную'
            : 'Вручну'
        : value === 'Unknown'
          ? statusLabel(context.locale, 'unknown')
          : value,
  };
}
export function LanguagePicker() {
  const { locale, setLocale, t } = useLocale();
  return (
    <select
      className="language-picker"
      data-testid="language-switch"
      aria-label={t('Language')}
      value={locale}
      onChange={(event) => setLocale(event.target.value as Locale)}
    >
      <option value="en">English</option>
      <option value="ru">Русский</option>
      <option value="uk">Українська</option>
    </select>
  );
}

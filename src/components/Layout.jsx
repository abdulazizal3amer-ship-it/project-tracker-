import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../i18n/index.jsx';
import NotificationBell from './NotificationBell.jsx';
import { Avatar } from './ui.jsx';

export default function Layout() {
  const { profile, signOut, updateProfile } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { to: '/', label: t('nav.dashboard'), end: true },
    { to: '/projects', label: t('nav.projects') },
    { to: '/my-tasks', label: t('nav.myTasks') },
    ...(profile.role === 'admin' ? [{ to: '/users', label: t('nav.users') }] : []),
  ];

  const toggleLang = () => {
    const next = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    updateProfile({ language: next }).catch(() => {});
  };

  const linkClass = ({ isActive }) =>
    `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100'}`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <button className="btn-ghost md:hidden" onClick={() => setMenuOpen((o) => !o)} aria-label="menu">
            ☰
          </button>
          <NavLink to="/" className="flex items-center gap-2 font-bold text-brand-800">
            <img src="./favicon.svg" alt="" className="h-7 w-7" />
            <span className="hidden sm:inline">{t('app.name')}</span>
          </NavLink>
          <nav className="ms-4 hidden gap-1 md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-1">
            <button className="btn-ghost text-xs" onClick={toggleLang}>
              {t('nav.language')}
            </button>
            <NotificationBell />
            <NavLink to="/profile" className="rounded-full p-1 hover:bg-slate-100" title={t('nav.profile')}>
              <Avatar userId={profile.id} />
            </NavLink>
            <button className="btn-ghost hidden text-xs sm:inline-flex" onClick={signOut}>
              {t('nav.signOut')}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="space-y-1 border-t border-slate-100 px-4 py-2 md:hidden" onClick={() => setMenuOpen(false)}>
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                {l.label}
              </NavLink>
            ))}
            <button className="block w-full rounded-lg px-3 py-2 text-start text-sm text-red-600 hover:bg-red-50" onClick={signOut}>
              {t('nav.signOut')}
            </button>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

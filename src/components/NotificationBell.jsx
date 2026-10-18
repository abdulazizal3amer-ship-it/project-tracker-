import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listNotifications, markNotificationsRead, subscribe } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useUsers } from '../lib/users.jsx';
import { useI18n } from '../i18n/index.jsx';

// FR-22: in-app notifications pushed live through Supabase Realtime.
export default function NotificationBell() {
  const { profile } = useAuth();
  const { nameOf } = useUsers();
  const { t, formatDateTime } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    listNotifications().then(setItems).catch(() => {});
    return subscribe(`notifications-${profile.id}`, 'notifications', `user_id=eq.${profile.id}`, (payload) => {
      if (payload.eventType === 'INSERT') setItems((list) => [payload.new, ...list].slice(0, 50));
      if (payload.eventType === 'UPDATE') setItems((list) => list.map((n) => (n.id === payload.new.id ? payload.new : n)));
    });
  }, [profile.id]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const unread = items.filter((n) => !n.is_read);

  const markRead = async (ids) => {
    setItems((list) => list.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)));
    await markNotificationsRead(ids).catch(() => {});
  };

  const openItem = (n) => {
    if (!n.is_read) markRead([n.id]);
    setOpen(false);
    if (n.task_id) navigate(`/task/${n.task_id}`);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('notifications.title')}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0m6 0H9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unread.length > 0 && (
          <span className="absolute -top-0.5 end-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 z-30 mt-2 w-[min(92vw,22rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <span className="font-semibold">{t('notifications.title')}</span>
            {unread.length > 0 && (
              <button className="text-xs text-brand-700 hover:underline" onClick={() => markRead(unread.map((n) => n.id))}>
                {t('notifications.markAll')}
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && <li className="p-6 text-center text-sm text-slate-500">{t('notifications.empty')}</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => openItem(n)}
                  className={`block w-full px-4 py-3 text-start text-sm hover:bg-slate-50 ${n.is_read ? 'text-slate-500' : 'bg-brand-50/60 text-slate-800'}`}
                >
                  <span className="block">
                    {t(`notifications.${n.type}`, { actor: n.actor_id ? nameOf(n.actor_id) : t('activity.system'), message: n.message })}
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">{formatDateTime(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

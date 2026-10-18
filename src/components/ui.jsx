import { useEffect, useId } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { initials, isOverdue } from '../lib/logic.js';
import { useUsers } from '../lib/users.jsx';

const AVATAR_COLORS = ['bg-teal-600', 'bg-sky-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600', 'bg-emerald-600', 'bg-indigo-600'];

function colorFor(id = '') {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ userId, size = 'md', ring = false }) {
  const { byId } = useUsers();
  const { t } = useI18n();
  const user = byId[userId];
  const name = user?.full_name ?? '?';
  const sizes = { sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' };
  const title = user && !user.is_active ? `${name} (${t('common.deactivated')})` : name;
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white ${sizes[size]} ${colorFor(userId)} ${ring ? 'ring-2 ring-white' : ''} ${user && !user.is_active ? 'opacity-40 grayscale' : ''}`}
    >
      {user?.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

export function AvatarStack({ userIds = [], max = 4, size = 'sm' }) {
  const shown = userIds.slice(0, max);
  const extra = userIds.length - shown.length;
  return (
    <span className="flex -space-x-2 rtl:space-x-reverse">
      {shown.map((id) => (
        <Avatar key={id} userId={id} size={size} ring />
      ))}
      {extra > 0 && (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 ring-2 ring-white">
          +{extra}
        </span>
      )}
    </span>
  );
}

export function UserName({ userId }) {
  const { byId } = useUsers();
  const { t } = useI18n();
  const u = byId[userId];
  if (!u) return <span>…</span>;
  return (
    <span>
      {u.full_name}
      {!u.is_active && <span className="ms-1 rounded bg-slate-200 px-1 text-[10px] text-slate-600">{t('common.deactivated')}</span>}
    </span>
  );
}

const STATUS_STYLES = {
  new: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-sky-100 text-sky-800',
  in_review: 'bg-amber-100 text-amber-800',
  done: 'bg-emerald-100 text-emerald-800',
};

export function StatusBadge({ status }) {
  const { t } = useI18n();
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>{t(`status.${status}`)}</span>;
}

const PRIORITY_STYLES = {
  low: 'text-slate-500',
  medium: 'text-sky-700',
  high: 'text-orange-600',
  urgent: 'text-red-700 font-semibold',
};
const PRIORITY_DOTS = { low: 'bg-slate-400', medium: 'bg-sky-500', high: 'bg-orange-500', urgent: 'bg-red-600' };

export function PriorityBadge({ priority }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${PRIORITY_STYLES[priority]}`}>
      <span className={`h-2 w-2 rounded-full ${PRIORITY_DOTS[priority]}`} />
      {t(`priority.${priority}`)}
    </span>
  );
}

// FR-25: overdue dates are red everywhere.
export function DueDate({ task }) {
  const { t, formatDate } = useI18n();
  if (!task.due_date) return <span className="text-xs text-slate-400">{t('tasks.noDue')}</span>;
  const late = isOverdue(task);
  return (
    <span className={`relative inline-flex items-center gap-1 text-xs ${late ? 'font-semibold text-red-600' : 'text-slate-600'}`}>
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
        <path d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm10 6H4v8h12V8Z" />
      </svg>
      {formatDate(task.due_date)}
      {late && <span className="sr-only">({t('tasks.overdueBadge')})</span>}
    </span>
  );
}

export function ProgressBar({ value }) {
  const color = value >= 100 ? 'bg-emerald-500' : 'bg-brand-600';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
    </div>
  );
}

export function Spinner() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {t('common.loading')}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
      <span>{t('common.error', { message: errorMessage(error, t) })}</span>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

// Map database / function errors to readable text.
export function errorMessage(error, t) {
  const msg = error?.message ?? String(error);
  if (error?.code === '42501' || /row-level security|not allowed|permission/i.test(msg)) return t('errors.forbidden');
  const key = `errors.${msg}`;
  const translated = t(key);
  return translated === key ? msg : translated;
}

export function Modal({ open, onClose, title, children, wide = false }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button className="btn-ghost" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ children }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Field({ label, error, children, htmlFor }) {
  const { t } = useI18n();
  return (
    <div>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error && <p className="field-error">{t(`errors.${error}`)}</p>}
    </div>
  );
}

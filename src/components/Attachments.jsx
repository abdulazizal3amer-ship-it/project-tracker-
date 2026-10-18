import { useRef, useState } from 'react';
import * as api from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatBytes, MAX_ATTACHMENT_BYTES } from '../lib/logic.js';
import { useAsync } from '../lib/useAsync.js';
import { useUsers } from '../lib/users.jsx';
import { useI18n } from '../i18n/index.jsx';
import { ErrorBox, Spinner } from './ui.jsx';

function FileIcon({ name }) {
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
  const color =
    ext === 'pdf' ? 'bg-red-100 text-red-700'
    : ['doc', 'docx'].includes(ext) ? 'bg-sky-100 text-sky-700'
    : ['xls', 'xlsx', 'csv'].includes(ext) ? 'bg-emerald-100 text-emerald-700'
    : ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? 'bg-violet-100 text-violet-700'
    : 'bg-slate-100 text-slate-600';
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold uppercase ${color}`}>
      {ext.slice(0, 4) || 'FILE'}
    </span>
  );
}

// Upload / list / download / delete files for a project or one task.
// canManage: the viewer manages the project and may delete any file.
export default function Attachments({ projectId, taskId, canManage, readOnly, compact, taskTitles }) {
  const { t, formatDateTime } = useI18n();
  const { profile } = useAuth();
  const { nameOf } = useUsers();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  const { data: files, loading, error: loadError, reload } = useAsync(
    () => api.listAttachments({ projectId, taskId }),
    [projectId, taskId],
  );

  const upload = async (fileList) => {
    const list = Array.from(fileList ?? []);
    if (!list.length) return;
    const tooBig = list.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig) {
      setError(new Error(t('attachments.tooBig', { name: tooBig.name, max: formatBytes(MAX_ATTACHMENT_BYTES) })));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const file of list) await api.uploadAttachment({ projectId, taskId, file, userId: profile.id });
      await reload({ silent: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const open = async (file) => {
    setError(null);
    try {
      window.open(await api.attachmentUrl(file), '_blank', 'noopener');
    } catch (err) {
      setError(err);
    }
  };

  const remove = async (file) => {
    if (!window.confirm(t('attachments.confirmDelete', { name: file.file_name }))) return;
    setError(null);
    try {
      await api.deleteAttachment(file);
      await reload({ silent: true });
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            upload(e.dataTransfer.files);
          }}
          className={`flex flex-wrap items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm text-slate-500 transition ${
            compact ? 'p-3' : 'p-5'
          } ${dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300'}`}
        >
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? t('attachments.uploading') : `📎 ${t('attachments.add')}`}
          </button>
          <span>{t('attachments.dropHint', { max: formatBytes(MAX_ATTACHMENT_BYTES) })}</span>
        </div>
      )}

      <ErrorBox error={error || loadError} />
      {loading && !files ? (
        <Spinner />
      ) : files?.length ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2">
              <FileIcon name={f.file_name} />
              <div className="min-w-0 flex-1">
                <button className="block max-w-full truncate text-start text-sm font-medium text-brand-800 hover:underline" onClick={() => open(f)}>
                  {f.file_name}
                </button>
                <div className="text-xs text-slate-500">
                  {f.task_id && taskTitles?.[f.task_id] && (
                    <span className="me-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                      {t('attachments.task')}: {taskTitles[f.task_id]}
                    </span>
                  )}
                  {formatBytes(f.size)} · {nameOf(f.uploaded_by)} · {formatDateTime(f.created_at)}
                </div>
              </div>
              {!readOnly && (canManage || f.uploaded_by === profile.id) && (
                <button className="btn-ghost text-xs text-red-600 hover:bg-red-50" onClick={() => remove(f)} aria-label={t('common.delete')}>
                  {t('common.delete')}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{t('attachments.empty')}</p>
      )}
    </div>
  );
}

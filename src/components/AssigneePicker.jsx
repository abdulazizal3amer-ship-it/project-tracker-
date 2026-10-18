import { useI18n } from '../i18n/index.jsx';
import { useUsers } from '../lib/users.jsx';
import { Avatar, JobLabel } from './ui.jsx';

// FR-09: pick one or many members, or "all project members" in one click.
export default function AssigneePicker({ memberIds, value, onChange, disabled }) {
  const { t } = useI18n();
  const { byId } = useUsers();
  const selectable = memberIds.filter((id) => byId[id]?.is_active);
  const allSelected = selectable.length > 0 && selectable.every((id) => value.includes(id));

  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="rounded-lg border border-slate-300">
      {selectable.length > 1 && (
        <label className="flex cursor-pointer items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-700"
            checked={allSelected}
            disabled={disabled}
            onChange={() => onChange(allSelected ? [] : selectable)}
          />
          {t('tasks.allMembers')}
        </label>
      )}
      <div className="max-h-48 overflow-y-auto p-1">
        {selectable.map((id) => (
          <label key={id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-700"
              checked={value.includes(id)}
              disabled={disabled}
              onChange={() => toggle(id)}
            />
            <Avatar userId={id} size="sm" />
            {byId[id]?.full_name}
            <JobLabel userId={id} />
          </label>
        ))}
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import { activeMentionQuery, insertMention, parseMentions } from '../lib/logic.js';
import { useUsers } from '../lib/users.jsx';
import { Avatar } from './ui.jsx';

// Textarea with an @-mention picker limited to project members (US-05).
export function MentionInput({ value, onChange, memberIds, placeholder, onSubmit, disabled }) {
  const { byId } = useUsers();
  const ref = useRef(null);
  const [mention, setMention] = useState(null);
  const [active, setActive] = useState(0);

  const candidates = mention
    ? memberIds
        .map((id) => byId[id])
        .filter((u) => u?.is_active && u.role !== 'member' && u.full_name.toLowerCase().includes(mention.query.toLowerCase()))
        .slice(0, 6)
    : [];

  const update = (text, caret) => {
    onChange(text);
    setMention(activeMentionQuery(text, caret));
    setActive(0);
  };

  const choose = (user) => {
    const caret = ref.current.selectionStart;
    const next = insertMention(value, mention.start, caret, user);
    onChange(next.text);
    setMention(null);
    requestAnimationFrame(() => {
      ref.current.focus();
      ref.current.setSelectionRange(next.caret, next.caret);
    });
  };

  const onKeyDown = (e) => {
    if (candidates.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => (a + 1) % candidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        choose(candidates[active]);
        return;
      }
      if (e.key === 'Escape') {
        setMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSubmit?.();
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        className="input min-h-20"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => update(e.target.value, e.target.selectionStart)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setMention(null), 150)}
      />
      {candidates.length > 0 && (
        <ul className="absolute bottom-full start-0 z-10 mb-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {candidates.map((u, i) => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(u);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-start text-sm ${i === active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
              >
                <Avatar userId={u.id} size="sm" />
                {u.full_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Renders a stored comment. Text is rendered as React text nodes, never as
// HTML, so user input cannot inject markup (NFR-07).
export function CommentBody({ body }) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm text-slate-700">
      {parseMentions(body).map((part, i) =>
        part.type === 'mention' ? (
          <span key={i} className="rounded bg-brand-50 px-1 font-medium text-brand-800">
            @{part.name}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}

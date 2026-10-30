import { useCallback, useEffect, useRef, useState } from 'react';
import { Skeleton } from '../../components/ui.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { appendPage, rowsMoved } from '../../lib/care.js';

// Pieces every Care tab shares: loading a tab's data when it opens, a card
// section, the inline "really delete?" question and a few icons the shared
// set does not have.

const svg = (d) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{d}</svg>
);

export const CareIcon = {
  heart: svg(<><path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" /><path d="M17.5 3.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" /></>),
  shield: svg(<><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M8.8 12.2l2.2 2.2 4.2-4.4" /></>),
  calendar: svg(<><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17M8 14h3" /></>),
  edit: svg(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>),
  trash: svg(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" /></>),
  clock: svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  bulb: svg(<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 00-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0012 3z" /></>),
  flag: svg(<><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>),
};

const IDLE = { data: null, error: null, loading: true };

// Loads data when the component mounts, and again whenever key changes;
// reload() fetches again on demand. A response that lands after a newer
// request, or after the tab closed, is dropped, so a slow answer can never
// overwrite a fresh one.
export function useLoad(load, key = '') {
  const loader = useRef(load);
  // Declared first, so the loading effect below sees this render's loader.
  useEffect(() => {
    loader.current = load;
  });
  const [state, setState] = useState(IDLE);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loader.current();
      if (n === seq.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (n === seq.current) setState((s) => ({ ...s, error, loading: false }));
      return null;
    }
  }, []);

  useEffect(() => {
    reload();
    return () => {
      seq.current += 1;
    };
  }, [key, reload]);

  const setData = useCallback((next) => setState((s) => ({ ...s, data: typeof next === 'function' ? next(s.data) : next })), []);
  return { ...state, reload, setData };
}

// A list that pages with { data, next_cursor }: the first page loads like
// useLoad, loadMore() appends the next one. backend-v2's cursor is an
// offset, good only while the rows before it stay put: a page that repeats
// rows already shown keeps them once, and a local add or delete while more
// pages wait loads the first page again rather than follow a cursor that
// would now skip or repeat a row.
export function usePaged(fetchPage, key = '') {
  const pager = useRef(fetchPage);
  useEffect(() => {
    pager.current = fetchPage;
  });
  // Bumped by every first-page load, so a next page still on its way from
  // before is dropped instead of being appended to the new list.
  const round = useRef(0);
  const state = useLoad(async () => {
    round.current += 1;
    const out = await pager.current(null);
    return { items: out?.data ?? [], next: out?.next_cursor ?? null, moved: 0 };
  }, key);
  const [more, setMore] = useState(false);
  const { setData, reload } = state;

  const loadMore = useCallback(async (cursor) => {
    if (!cursor) return;
    const mine = round.current;
    setMore(true);
    try {
      const out = await pager.current(cursor);
      if (mine === round.current) setData((d) => ({ ...d, items: appendPage(d?.items, out?.data), next: out?.next_cursor ?? null }));
    } catch {
      // The button stays, so the parent can simply try again.
    } finally {
      setMore(false);
    }
  }, [setData]);

  // moved counts the local adds and deletes since the first page loaded;
  // each one while a cursor waits reloads, so the newest change is in it.
  const setItems = useCallback((fn) => setData((d) => {
    const before = d?.items ?? [];
    const items = fn(before);
    return { items, next: d?.next ?? null, moved: (d?.moved ?? 0) + (rowsMoved(before, items) ? 1 : 0) };
  }), [setData]);
  const moved = state.data?.moved ?? 0;
  const paged = Boolean(state.data?.next);
  useEffect(() => {
    if (moved && paged) reload();
  }, [moved, paged, reload]);

  return {
    ...state,
    items: state.data?.items ?? [],
    next: state.data?.next ?? null,
    loadingMore: more,
    // The reload after a local change can fail and leave the old cursor
    // behind; following it would skip or repeat a row, so the button loads
    // the first page instead.
    loadMore: () => (moved ? reload() : loadMore(state.data?.next)),
    setItems,
  };
}

// A card with a heading, an optional count and a line of help under it.
export function Section({ id, title, count = 0, hint, action, className = '', children }) {
  return (
    <section id={id} className={['card', 'care-section', className].filter(Boolean).join(' ')} aria-labelledby={`${id}-title`}>
      <div className="card-head care-section-head">
        <h3 id={`${id}-title`} className="card-title" tabIndex={-1}>
          {title}
          {count > 0 && <span className="care-count">{count}</span>}
        </h3>
        {action}
      </div>
      {hint && <p className="muted small">{hint}</p>}
      {children}
    </section>
  );
}

// Loading, failed, or the content: the same in every section. Data already
// on screen stays while a reload runs.
export function Loadable({ state, rows = 2, children }) {
  const { t } = useI18n();
  if (state.data == null && state.loading) {
    return (
      <div className="care-skel" aria-busy="true">
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={48} r={18} />)}
      </div>
    );
  }
  if (state.data == null && state.error) {
    return (
      <div className="care-failed" role="alert">
        <p className="msg msg--bad">{t('careLoadFailed')}</p>
        <button type="button" className="btn btn-soft btn-sm" onClick={state.reload}>{t('tryAgain')}</button>
      </div>
    );
  }
  return children;
}

// Waits while the first page reloads, since the cursor it holds is about to
// be replaced.
export function MoreButton({ list }) {
  const { t } = useI18n();
  if (!list.next) return null;
  return (
    <button type="button" className="btn btn-soft btn-sm care-more" disabled={list.loadingMore || list.loading} onClick={list.loadMore}>
      {list.loadingMore ? t('wait') : t('careMore')}
    </button>
  );
}

// When an inline question or form closes, focus goes back to what opened it
// (target is a ref or an element id), instead of falling to the page.
export function useFocusBack(open, target) {
  const was = useRef(open);
  useEffect(() => {
    if (was.current && !open) {
      const el = typeof target === 'string' ? document.getElementById(target) : target?.current;
      el?.focus();
    }
    was.current = open;
  }, [open, target]);
}

// A delete that asks once, inline, so nothing goes on a stray tap. Focus
// moves to the "yes" button when the question opens and back to the trash
// can when it closes without deleting. onConfirm handles its own errors.
export function DeleteButton({ label, question, yes, onConfirm }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const yesRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (asking) yesRef.current?.focus();
  }, [asking]);
  useFocusBack(asking, triggerRef);

  if (!asking) {
    return (
      <button ref={triggerRef} type="button" className="round round--sm care-round-bad" aria-label={label} onClick={() => setAsking(true)}>
        {CareIcon.trash}
      </button>
    );
  }
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };
  return (
    <div className="care-ask" role="group" aria-label={label}>
      <span>{question}</span>
      <button ref={yesRef} type="button" className="btn btn-danger-solid btn-sm" disabled={busy} onClick={confirm}>{busy ? t('wait') : (yes ?? t('careDeleteYes'))}</button>
      <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => setAsking(false)}>{t('cancel')}</button>
    </div>
  );
}

// After an inline edit form closes, focus goes back to the edit button that
// opened it (each has the id `${prefix}-${item id}`). editing is the id of
// the item being edited, or null.
export function useReturnFocus(editing, prefix) {
  const last = useRef(null);
  useEffect(() => {
    if (editing) {
      last.current = editing;
      return;
    }
    if (last.current) document.getElementById(`${prefix}-${last.current}`)?.focus();
    last.current = null;
  }, [editing, prefix]);
}

// Focuses the first field of a form as it opens.
export function useAutoFocus() {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

// Shows the first n items, with a button for the rest.
export function useCapped(items, n = 6) {
  const [all, setAll] = useState(false);
  const list = items ?? [];
  return { shown: all || list.length <= n ? list : list.slice(0, n), hidden: all ? 0 : Math.max(0, list.length - n), showAll: () => setAll(true) };
}

export function ShowAll({ capped }) {
  const { t } = useI18n();
  if (!capped.hidden) return null;
  return <button type="button" className="link care-showall" onClick={capped.showAll}>{t('careShowAll', { n: capped.hidden })}</button>;
}

export const initialOf = (name) => (String(name ?? '').trim().slice(0, 1) || '?').toUpperCase();

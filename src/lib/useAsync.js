import { useCallback, useEffect, useRef, useState } from 'react';

// Runs an async loader on mount / when deps change; exposes reload().
export function useAsync(loader, deps) {
  const [state, setState] = useState({ loading: true, error: null, data: undefined });
  const latest = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(
    async ({ silent = false } = {}) => {
      const id = ++latest.current;
      if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await run();
        if (id === latest.current) setState({ loading: false, error: null, data });
      } catch (error) {
        if (id === latest.current) setState((s) => ({ ...s, loading: false, error }));
      }
    },
    [run],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const setData = useCallback((update) => {
    setState((s) => ({ ...s, data: typeof update === 'function' ? update(s.data) : update }));
  }, []);

  return { ...state, reload, setData };
}

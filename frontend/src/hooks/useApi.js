import { useCallback, useEffect, useRef, useState } from 'react';
import { errorInfo } from '../lib/api.js';

/**
 * Loads data with explicit loading, error, and retry states. `deps` re-runs the load.
 * The loader is read from a ref, so an inline function does not cause a reload loop, and stale
 * responses are ignored so fast navigation never shows the wrong data.
 */
export function useApi(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const loaderRef = useRef(loader);
  useEffect(() => { loaderRef.current = loader; });

  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(() => loaderRef.current())
      .then((data) => { if (id === seq.current) setState({ data, error: null, loading: false }); })
      .catch((err) => { if (id === seq.current) setState({ data: null, error: errorInfo(err), loading: false }); });
  }, []);

  // Loading on mount is the intended data-fetch pattern; stale responses are discarded above.
  // The dependency list is supplied by each caller, so it cannot be checked statically.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run, ...deps]);
  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}

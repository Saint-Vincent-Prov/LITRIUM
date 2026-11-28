import { createContext, useCallback, useContext, useEffect, useState } from "react";

/** Bumped after every mutation so all screens refetch. */
export const DataVersion = createContext<{ version: number; bump: () => void }>({ version: 0, bump: () => {} });

export function useDataVersion() {
  return useContext(DataVersion);
}

export type AsyncState<T> =
  | { status: "loading"; data?: T; error?: undefined }
  | { status: "ready"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: Error };

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const { version } = useDataVersion();
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ status: "loading", data: s.data }));
    fn().then(
      (data) => alive && setState({ status: "ready", data }),
      (error: Error) => alive && setState((s) => ({ status: "error", error, data: s.data })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, retry, ...deps]);

  const reload = useCallback(() => setRetry((r) => r + 1), []);
  return { ...state, reload };
}

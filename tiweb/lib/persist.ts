"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// avvisa gli altri hook della stessa scheda: l'evento `storage` arriva solo
// alle ALTRE schede
const LOCAL_EVENT = "ti-persist";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(LOCAL_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(LOCAL_EVENT, cb);
  };
}

// ripiego se localStorage e' bloccato: le impostazioni si perdono al reload,
// ma la pagina resta usabile (altrimenti la ricerca non accetterebbe testo)
const memory = new Map<string, string>();

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return memory.get(key) ?? null; }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { memory.set(key, value); }
}

/** useState che sopravvive al ricaricamento, in localStorage sotto `ti.<key>`.
 *
 *  Passa da useSyncExternalStore: sul server (pre-rendering) localStorage non
 *  esiste e vale `initial`, nel browser vale il salvato, senza che HTML e
 *  idratazione divergano. `accept` scarta i valori che non hanno piu' senso,
 *  per esempio un'opzione tolta dalla combo, e torna a `initial`.
 */
export function usePersistentState<T>(
  key: string, initial: T, accept: (v: unknown) => v is T,
) {
  const full = `ti.${key}`;
  const raw = useSyncExternalStore(subscribe, () => read(full), () => null);

  const value = useMemo(() => {
    if (raw == null) return initial;
    try {
      const v: unknown = JSON.parse(raw);
      return accept(v) ? v : initial;
    } catch {
      return initial;
    }
    // initial e accept sono costanti del chiamante: conta solo il valore letto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const set = useCallback((v: T) => {
    write(full, JSON.stringify(v));
    window.dispatchEvent(new Event(LOCAL_EVENT));
  }, [full]);

  return [value, set] as const;
}

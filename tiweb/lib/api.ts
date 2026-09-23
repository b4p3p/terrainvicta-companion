"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { engine, engineMode, type EngineStatus, type LiveEvent } from "./engine";
import type { Alert, Snapshot } from "./types";

export const API =
  process.env.NEXT_PUBLIC_API ?? "http://127.0.0.1:8732";

/** Errore di una rotta: `message` e' il testo per l'utente (il `detail` di
 *  FastAPI o l'errore del motore nel browser), `status` il codice HTTP. */
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/* Le stesse rotte /api/* rispondono da due posti: l'API locale (tiserver) o
   il motore nel browser (lib/engine.ts), che esegue la stessa logica,
   ticore/service.py, dentro Pyodide. Le pagine non sanno quale dei due. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (engineMode() === "browser") {
    const u = new URL(path, "http://companion");
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    try {
      return await engine.request<T>(init?.method ?? "GET", u.pathname,
        Object.fromEntries(u.searchParams), body);
    } catch (e) {
      const err = e as { status?: number; message?: string };
      throw new ApiError(err.status ?? 500, err.message ?? String(e));
    }
  }
  const r = await fetch(API + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!r.ok) {
    const text = await r.text();
    let detail = text;
    try { detail = JSON.parse(text).detail ?? text; } catch { /* non JSON */ }
    throw new ApiError(r.status, `${r.status} ${detail}`);
  }
  return r.json() as Promise<T>;
}

/** Icona del gioco: dall'API locale, o dai file statici nella versione web. */
export function iconUrl(bundle: string, icon: string) {
  const name = encodeURIComponent(icon);
  return engineMode() === "browser"
    ? `/icons/${bundle}/${name}.png`
    : `${API}/api/icons/${bundle}/${name}.png`;
}

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    if (!path) return;
    setLoading(true);
    api<T>(path)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(reload, [reload]);
  return { data, error, loading, reload };
}

/**
 * Aggiornamenti quando il gioco salva, senza interrogare nulla: via SSE
 * dall'API locale, o dal motore nel browser. `version` cresce a ogni
 * snapshot nuovo, cosi' le pagine possono rifare il fetch dei propri dati.
 */
export function useLive() {
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [save, setSave] =
    useState<{ date: string; save: string; faction?: string } | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (engineMode() === "browser") {
      engine.start();
      const offStatus = engine.onStatus((s) => setConnected(s.state === "ready"));
      const offEvent = engine.onEvent((msg: LiveEvent) => {
        setAlerts(msg.alerts ?? []);
        setSave({ date: msg.date, save: msg.save, faction: msg.faction });
        setVersion((v) => v + 1);            // anche "hello": prima non c'era niente
        notify(msg.alerts ?? [], seen.current, msg.type === "hello");
      });
      return () => { offStatus(); offEvent(); };
    }
    const es = new EventSource(API + "/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "hello" || msg.type === "snapshot") {
        setAlerts(msg.alerts ?? []);
        setSave({ date: msg.date, save: msg.save, faction: msg.faction });
        if (msg.type === "snapshot") setVersion((v) => v + 1);
        notify(msg.alerts ?? [], seen.current, msg.type === "hello");
      }
    };
    return () => es.close();
  }, []);

  return { connected, version, alerts, save };
}

/** Stato del motore nel browser; null quando si usa l'API locale. */
export function useEngineStatus(): EngineStatus | null {
  const [st, setSt] = useState<EngineStatus | null>(null);
  useEffect(() => {
    if (engineMode() !== "browser") return;
    return engine.onStatus(setSt);
  }, []);
  return st;
}

/** Notifica desktop per le allerte nuove e serie. Silenziosa al primo carico. */
function notify(alerts: Alert[], seen: Set<string>, silent: boolean) {
  for (const a of alerts) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    if (silent || a.severity === "info") continue;
    if (typeof Notification === "undefined") continue;
    if (Notification.permission === "granted") {
      new Notification(a.title, { body: a.detail, tag: a.id });
    }
  }
}

export function askNotificationPermission() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

export function useSnapshot(version: number, gameLang: string) {
  return useApi<Snapshot>(`/api/snapshot?lang=${gameLang}`, [version, gameLang]);
}

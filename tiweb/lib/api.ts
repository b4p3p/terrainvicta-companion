"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Alert, Snapshot } from "./types";

export const API =
  process.env.NEXT_PUBLIC_API ?? "http://127.0.0.1:8732";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(API + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
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
 * Connessione SSE al server: riceve gli aggiornamenti quando il gioco salva,
 * senza interrogare nulla. `version` cresce a ogni snapshot nuovo, cosi' le
 * pagine possono rifare il fetch dei propri dati.
 */
export function useLive() {
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [save, setSave] =
    useState<{ date: string; save: string; faction?: string } | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
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

"use client";

import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { dict, GAME_LOCALES, gameLangFromBrowser, setCurrentDict, type Dict, type UiLang } from "./i18n";
import { setNumberLocale } from "@/components/ui";
import { api, useLive } from "./api";
import type { Alert } from "./types";

interface Settings {
  ui: UiLang;
  game: string;
  setGame: (l: string) => void;
  t: Dict;
  live: { connected: boolean; version: number; alerts: Alert[];
          save: { date: string; save: string; faction?: string } | null };
}

const Ctx = createContext<Settings | null>(null);

// Una sola scelta: la lingua di gioco. L'interfaccia ha solo it/en, quindi
// segue: italiano se il gioco e' in italiano, inglese per tutte le altre.
const uiFor = (game: string): UiLang => (game === "ita" ? "it" : "en");

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [game, setGameRaw] = useState<string>("ita");
  const live = useLive();

  // preferenze per-browser: non sono stato di partita, stanno bene qui.
  // Prima visita: la lingua del browser, non l'italiano per tutti.
  useEffect(() => {
    let g: string | null = null;
    try { g = localStorage.getItem("ti.game"); } catch { /* storage bloccato */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage e navigator esistono solo nel browser
    setGameRaw(g || gameLangFromBrowser());
  }, []);

  useEffect(() => {
    document.documentElement.lang = GAME_LOCALES[game] ?? "en";
  }, [game]);

  /* Le allerte arrivano col salvataggio (SSE o worker) nella lingua dell'ultimo
     snapshot: al cambio di lingua, o a ogni salvataggio, si richiedono nella
     lingua scelta. Fallisce senza salvataggio: restano quelle dell'evento. */
  const [langAlerts, setLangAlerts] = useState<{ lang: string; alerts: Alert[] } | null>(null);
  useEffect(() => {
    if (!live.save) return;
    let alive = true;
    api<{ alerts: Alert[] }>(`/api/alerts?lang=${game}`)
      .then((d) => { if (alive && Array.isArray(d.alerts)) setLangAlerts({ lang: game, alerts: d.alerts }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [game, live.version, live.save]);

  const setGame = (l: string) => {
    setGameRaw(l);
    try { localStorage.setItem("ti.game", l); } catch {}
  };

  const value = useMemo<Settings>(
    () => {
      const ui = uiFor(game);
      const t = dict(ui);
      setNumberLocale(GAME_LOCALES[game] ?? "en-GB");
      setCurrentDict(t);
      const alerts = langAlerts?.lang === game ? langAlerts.alerts : live.alerts;
      return { ui, game, setGame, t, live: { ...live, alerts } };
    },
    [game, live, langAlerts],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSettings fuori dal provider");
  return c;
}

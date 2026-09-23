"use client";

import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { dict, type Dict, type UiLang } from "./i18n";
import { useLive } from "./api";
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

  // preferenze per-browser: non sono stato di partita, stanno bene qui
  useEffect(() => {
    try {
      const g = localStorage.getItem("ti.game");
      if (g) setGameRaw(g);
    } catch { /* storage bloccato: restiamo sui default */ }
  }, []);

  const setGame = (l: string) => {
    setGameRaw(l);
    try { localStorage.setItem("ti.game", l); } catch {}
  };

  const value = useMemo<Settings>(
    () => {
      const ui = uiFor(game);
      return { ui, game, setGame, t: dict(ui), live };
    },
    [game, live],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSettings fuori dal provider");
  return c;
}

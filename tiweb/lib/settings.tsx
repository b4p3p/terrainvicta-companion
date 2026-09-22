"use client";

import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { dict, type Dict, type UiLang } from "./i18n";
import { useLive } from "./api";
import type { Alert } from "./types";

interface Settings {
  ui: UiLang;
  setUi: (l: UiLang) => void;
  game: string;
  setGame: (l: string) => void;
  t: Dict;
  live: { connected: boolean; version: number; alerts: Alert[];
          save: { date: string; save: string; faction?: string } | null };
}

const Ctx = createContext<Settings | null>(null);

// la lingua di gioco predefinita segue quella dell'interfaccia
const GAME_FOR_UI: Record<UiLang, string> = { it: "ita", en: "en" };

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [ui, setUiRaw] = useState<UiLang>("it");
  const [game, setGameRaw] = useState<string>("ita");
  const live = useLive();

  // preferenze per-browser: non sono stato di partita, stanno bene qui
  useEffect(() => {
    try {
      const u = localStorage.getItem("ti.ui") as UiLang | null;
      const g = localStorage.getItem("ti.game");
      if (u) setUiRaw(u);
      if (g) setGameRaw(g);
    } catch { /* storage bloccato: restiamo sui default */ }
  }, []);

  const setUi = (l: UiLang) => {
    setUiRaw(l);
    try { localStorage.setItem("ti.ui", l); } catch {}
  };
  const setGame = (l: string) => {
    setGameRaw(l);
    try { localStorage.setItem("ti.game", l); } catch {}
  };

  const value = useMemo<Settings>(
    () => ({ ui, setUi, game, setGame, t: dict(ui), live }),
    [ui, game, live],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSettings fuori dal provider");
  return c;
}

export { GAME_FOR_UI };

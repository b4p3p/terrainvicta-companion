"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, askNotificationPermission } from "@/lib/api";
import { UI_LANGS, type UiLang } from "@/lib/i18n";
import { useSettings, GAME_FOR_UI } from "@/lib/settings";

const TABS = [
  { href: "/", key: "overview" },
  { href: "/council", key: "council" },
  { href: "/missions", key: "missions" },
  { href: "/nations", key: "nations" },
  { href: "/history", key: "history" },
  { href: "/plan", key: "plan" },
] as const;

export default function Shell({ children }: { children: React.ReactNode }) {
  const { t, ui, setUi, game, setGame, live } = useSettings();
  const path = usePathname();
  const [langs, setLangs] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => { askNotificationPermission(); }, []);
  useEffect(() => {
    api<{ available: { id: string; name: string }[] }>("/api/languages")
      .then((d) => setLangs(d.available))
      .catch(() => setLangs([]));
  }, []);

  const critical = live.alerts.filter((a) => a.severity === "critical").length;
  const warning = live.alerts.filter((a) => a.severity === "warning").length;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line px-6 pt-4 pb-0 bg-panel/40">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[19px] font-semibold m-0">
              Terra Invicta
              {live.save?.faction && (
                <> — <span className="text-accent">{live.save.faction}</span></>
              )}
            </h1>
            <div className="text-dim text-[12.5px] mt-1 flex items-center gap-3 flex-wrap">
              <span className={live.connected ? "text-mine" : "text-bad"}>
                ● {live.connected ? t.common.live : t.common.offline}
              </span>
              {live.save && <span>{live.save.date} · {live.save.save}</span>}
              {(critical > 0 || warning > 0) && (
                <span className={critical ? "text-bad" : "text-warn"}>
                  {critical > 0 && `${critical} ${t.severity.critical}`}
                  {critical > 0 && warning > 0 && " · "}
                  {warning > 0 && `${warning} ${t.severity.warning}`}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[12px]">
            <label className="text-dim">{t.common.uiLanguage}</label>
            <select value={ui}
              onChange={(e) => {
                const l = e.target.value as UiLang;
                setUi(l);
                setGame(GAME_FOR_UI[l] ?? game);
              }}>
              {UI_LANGS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <label className="text-dim ml-2">{t.common.gameLanguage}</label>
            <select value={game} onChange={(e) => setGame(e.target.value)}>
              {langs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>

        <nav className="flex gap-1 mt-4 -mb-px flex-wrap">
          {TABS.map((tab) => {
            const active = path === tab.href;
            return (
              <Link key={tab.href} href={tab.href}
                className={`px-4 py-2 text-[13px] rounded-t-md border border-b-0 transition-colors
                  ${active
                    ? "bg-panel border-line text-accent"
                    : "border-transparent text-dim hover:text-text"}`}>
                {t.tabs[tab.key]}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="p-6 max-w-[1900px] w-full">{children}</main>
    </div>
  );
}

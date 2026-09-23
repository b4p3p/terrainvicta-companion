"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, askNotificationPermission, useSnapshot } from "@/lib/api";
import { UI_LANGS, type UiLang } from "@/lib/i18n";
import { useSettings, GAME_FOR_UI } from "@/lib/settings";
import { ResourceIcon } from "@/components/ui";

const TABS = [
  { href: "/", key: "overview" },
  { href: "/council", key: "council" },
  { href: "/missions", key: "missions" },
  { href: "/nations", key: "nations" },
  { href: "/history", key: "history" },
  { href: "/plan", key: "plan" },
  { href: "/presets", key: "presets" },
] as const;

/* Terra Invicta tiene le risorse in una barra fissa in cima allo schermo.
   Stesso posto qui: è la riga che si guarda senza cercarla. */
const RESOURCES = [
  { key: "Money", label: "Denaro", icon: "ICO_currency", tone: "text-warn" },
  { key: "Influence", label: "Influenza", icon: "ICO_influence", tone: "text-accent" },
  { key: "Operations", label: "Operazioni", icon: "ICO_ops", tone: "text-other" },
] as const;

export default function Shell({ children }: { children: React.ReactNode }) {
  const { t, ui, setUi, game, setGame, live } = useSettings();
  const { data: snap } = useSnapshot(live.version, game);
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

  /* L'accento dell'interfaccia è il colore che il gioco assegna alla tua
     fazione (TIFactionTemplate.color), non una tinta scelta a tavolino. */
  const accent = snap?.factionColors?.accent;

  return (
    <div className="min-h-screen flex flex-col"
      style={accent ? ({ "--accent": accent } as React.CSSProperties) : undefined}>

      <header className="sticky top-0 z-20 bg-void border-b border-edge-lit">
        {/* riga 1 — identità e stato della partita */}
        <div className="flex items-center gap-x-5 gap-y-1 flex-wrap px-4 h-9
                        border-b border-edge">
          <span className="display text-[14px] uppercase tracking-[.08em] leading-none">
            {live.save?.faction ?? "Terra Invicta"}
          </span>

          {live.save && (
            <span className="text-dim text-[12px]">
              {live.save.date}
              <span className="text-faint"> · {live.save.save}</span>
            </span>
          )}

          <span className="ml-auto flex items-center gap-4 text-[11.5px]">
            {(critical > 0 || warning > 0) && (
              <Link href="/" className={critical ? "text-bad" : "text-warn"}>
                {critical > 0 && `${critical} ${t.severity.critical}`}
                {critical > 0 && warning > 0 && " · "}
                {warning > 0 && `${warning} ${t.severity.warning}`}
              </Link>
            )}
            <span className={live.connected ? "text-good" : "text-bad"}>
              {live.connected ? t.common.live : t.common.offline}
            </span>
            <select value={ui} aria-label={t.common.uiLanguage}
              onChange={(e) => {
                const l = e.target.value as UiLang;
                setUi(l);
                setGame(GAME_FOR_UI[l] ?? game);
              }}>
              {UI_LANGS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select value={game} aria-label={t.common.gameLanguage}
              onChange={(e) => setGame(e.target.value)}>
              {langs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </span>
        </div>

        {/* riga 2 — risorse, come la barra superiore del gioco */}
        {snap?.resources && (
          <div className="flex items-center gap-6 flex-wrap px-4 h-8
                          bg-bar-deep border-b border-edge text-[12px]">
            {RESOURCES.map((r) => {
              const v = snap.resources[r.key as keyof typeof snap.resources];
              if (v == null) return null;
              return (
                <span key={r.key} className="flex items-baseline gap-1.5">
                  <ResourceIcon icon={r.icon} size={14} title={r.label} />
                  <span className="text-faint text-[11px]">{r.label}</span>
                  <span className={`display text-[14px] ${r.tone}`}>
                    {Math.round(v).toLocaleString("it-IT")}
                  </span>
                </span>
              );
            })}
            {/* la ricerca utile e' quella che entra nei progetti ogni mese,
                non la risorsa accumulata, che a inizio partita resta a zero */}
            <span className="flex items-baseline gap-1.5">
              <ResourceIcon icon="ICO_research" size={14} title="Ricerca" />
              <span className="text-faint text-[11px]">Ricerca/mese</span>
              <span className="display text-[14px] text-good">
                {Math.round(snap.projects?.rate ?? 0)}
              </span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-faint text-[11px]">Consiglio</span>
              <span className="display text-[14px] text-ink">{snap.council?.size ?? "—"}</span>
            </span>
            {snap.controlPoints && (
              <span className="flex items-baseline gap-1.5 ml-auto">
                <ResourceIcon icon="ICO_ControlPoint_empty" size={14}
                  title="Punti di controllo" />
                <span className="text-faint text-[11px]">Punti di controllo</span>
                <span className="display text-[14px] text-ink">
                  {snap.controlPoints.mine}
                  <span className="text-faint text-[12px]">/{snap.controlPoints.total}</span>
                </span>
              </span>
            )}
          </div>
        )}

        {/* riga 3 — navigazione, schede a spigolo vivo */}
        <nav className="flex flex-wrap">
          {TABS.map((tab) => {
            const active = path === tab.href;
            return (
              <Link key={tab.href} href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`display text-[12px] uppercase tracking-[.07em]
                  px-4 h-8 flex items-center border-r border-edge transition-colors
                  ${active
                    ? "bg-sel text-ink border-t-2 border-t-accent"
                    : "text-dim hover:text-ink hover:bg-panel border-t-2 border-t-transparent"}`}>
                {t.tabs[tab.key]}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* nessun limite di larghezza: è una console da secondo monitor, e un cap
          disallineava il contenuto dall'intestazione a tutta larghezza */}
      <main className="p-4 w-full">{children}</main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { askNotificationPermission, useEngineStatus, useSnapshot } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { engineMode, LOCKED_ENGINE, type EngineMode } from "@/lib/engine";
import { EngineGate } from "@/components/EngineGate";
import { EngineSplash } from "@/components/EngineSplash";
import { LanguagePicker } from "@/components/LanguagePicker";
import { ResourceIcon, nf } from "@/components/ui";

const TABS = [
  { href: "/", key: "overview" },
  { href: "/council", key: "council" },
  { href: "/missions", key: "missions" },
  { href: "/nations", key: "nations" },
  { href: "/history", key: "history" },
  { href: "/factions", key: "factions" },
  { href: "/presets", key: "presets" },
  { href: "/plan", key: "plan" },            // la meno usata: in fondo
  { href: "/about", key: "about" },          // in fila alle altre: staccata a destra non si notava
] as const;

/* Terra Invicta tiene le risorse in una barra fissa in cima allo schermo.
   Stesso posto qui: è la riga che si guarda senza cercarla. */
const RESOURCES = [
  { key: "Money", icon: "ICO_currency", tone: "text-warn" },
  { key: "Influence", icon: "ICO_influence", tone: "text-accent" },
  { key: "Operations", icon: "ICO_ops", tone: "text-other" },
] as const;

// il motore non cambia senza ricaricare la pagina
const noSubscribe = () => () => {};

export default function Shell({ children }: { children: React.ReactNode }) {
  const { t, game, live } = useSettings();
  const { data: snap } = useSnapshot(live.version, game);
  // null con l'API locale: deciso dopo il montaggio, niente differenze col render del server
  const engineStatus = useEngineStatus();
  const path = usePathname();
  // null nel render del server: dipende da URL e sessionStorage
  const mode = useSyncExternalStore<EngineMode | null>(noSubscribe, engineMode, () => null);

  useEffect(() => { askNotificationPermission(); }, []);

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
              {live.connected ? t.common.live
                : engineStatus ? t.engine.waiting : t.common.offline}
            </span>
            {/* solo nella copia locale: il sito online ha il motore fissato.
                Ricarica la pagina: il motore si sceglie una volta, all'avvio. */}
            {mode && !LOCKED_ENGINE && (
              <span className="flex items-center gap-1.5" title={t.engine.switchHint}>
                <span className="text-faint">{t.engine.mode}</span>
                {(["server", "browser"] as const).map((m) => m === mode
                  ? <span key={m} className="text-ink">{t.engine[m]}</span>
                  : <a key={m} href={`${path}?engine=${m}`}
                      className="text-dim hover:text-ink underline">{t.engine[m]}</a>)}
              </span>
            )}
            <LanguagePicker />
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
                  <ResourceIcon icon={r.icon} size={14} title={t.res[r.key]} />
                  <span className="text-faint text-[11px]">{t.res[r.key]}</span>
                  <span className={`display text-[14px] ${r.tone}`}>
                    {nf(v, 0)}
                  </span>
                </span>
              );
            })}
            {/* la ricerca utile e' quella che entra nei progetti ogni mese,
                non la risorsa accumulata, che a inizio partita resta a zero */}
            <span className="flex items-baseline gap-1.5">
              <ResourceIcon icon="ICO_research" size={14} title={t.res.research} />
              <span className="text-faint text-[11px]">{t.res.researchMonth}</span>
              <span className="display text-[14px] text-good">
                {Math.round(snap.projects?.rate ?? 0)}
              </span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-faint text-[11px]">{t.res.council}</span>
              <span className="display text-[14px] text-ink">{snap.council?.size ?? "—"}</span>
            </span>
            {snap.controlPoints && (
              <span className="flex items-baseline gap-1.5 ml-auto">
                <ResourceIcon icon="ICO_ControlPoint_empty" size={14}
                  title={t.res.cp} />
                <span className="text-faint text-[11px]">{t.res.cp}</span>
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
      <EngineSplash />
      <EngineGate />
      <main className="p-4 w-full">{children}</main>
    </div>
  );
}

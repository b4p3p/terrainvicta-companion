"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { askNotificationPermission, useEngineStatus, useSnapshot } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { demoMode, engineMode, exitDemo, LOCKED_ENGINE, type EngineMode } from "@/lib/engine";
import { EngineGate } from "@/components/EngineGate";
import { EngineSplash } from "@/components/EngineSplash";
import { LanguagePicker } from "@/components/LanguagePicker";
import { GithubLink } from "@/components/GithubLink";
import { ResourceIcon, nf } from "@/components/ui";
import { Tip } from "@/components/Tip";

const TABS = [
  { href: "/", key: "overview" },
  { href: "/council", key: "council" },
  { href: "/missions", key: "missions" },
  { href: "/nations", key: "nations" },
  { href: "/history", key: "history" },
  { href: "/factions", key: "factions" },
  { href: "/space", key: "space" },
  { href: "/techs", key: "techs" },
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
  const demo = useSyncExternalStore(noSubscribe, demoMode, () => false);

  useEffect(() => { askNotificationPermission(); }, []);

  const critical = live.alerts.filter((a) => a.severity === "critical").length;
  const warning = live.alerts.filter((a) => a.severity === "warning").length;

  /* L'accento dell'interfaccia è il colore che il gioco assegna alla tua
     fazione (TIFactionTemplate.color), non una tinta scelta a tavolino. */
  const accent = snap?.factionColors?.accent;

  /* Anche il cursore e' quello della fazione (TIFactionTemplate.cursorPath).
     Su <html> e non sul div: deve valere anche per finestre e menu a tendina,
     che stanno fuori da questo albero. */
  const cursor = snap?.factionCursor;
  useEffect(() => {
    const s = document.documentElement.style;
    const vars = [["--ti-cursor", "", "auto"], ["--ti-cursor-valid", "_Valid", "pointer"],
                  ["--ti-cursor-invalid", "_Invalid", "not-allowed"]];
    for (const [v, suffix, fallback] of vars)
      if (cursor) s.setProperty(v, `url(/icons/cursors/${cursor}${suffix}.png) 16 16, ${fallback}`);
      else s.removeProperty(v);
  }, [cursor]);

  return (
    <div className="min-h-screen flex flex-col"
      style={accent ? ({ "--accent": accent } as React.CSSProperties) : undefined}>

      <header className="sticky top-0 z-20 bg-void border-b border-edge-lit">
        {/* riga 1 — identità e stato della partita */}
        <div className="flex items-center gap-x-5 gap-y-1 flex-wrap px-4 min-h-9 py-1
                        border-b border-edge">
          <span className="display text-[14px] uppercase tracking-[.08em] leading-none">
            {live.save?.faction ?? "Terra Invicta"}
          </span>

          {/* la demo si deve vedere sempre: non e' la partita di chi guarda */}
          {demo && (
            <span className="flex items-center gap-2">
              <Tip title={t.engine.demoTitle} content={t.engine.demoTip} width={320}>
                <span className="display text-[11px] uppercase tracking-[.14em] px-1.5 py-px
                                 border border-warn text-warn">{t.engine.demoBadge}</span>
              </Tip>
              <button onClick={exitDemo}
                className="text-[11.5px] text-dim hover:text-ink underline">{t.engine.demoExit}</button>
            </span>
          )}

          {live.save && (
            <span className="text-dim text-[12px]">
              {live.save.date}
              <span className="text-faint"> · {live.save.save}</span>
            </span>
          )}

          <span className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11.5px] whitespace-nowrap">
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
            <GithubLink />
            <LanguagePicker />
          </span>
        </div>

        {/* riga 2 — risorse, come la barra superiore del gioco */}
        {snap?.resources && (
          <div className="flex items-center gap-x-6 gap-y-1 flex-wrap px-4 min-h-8 py-1
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
                {snap.controlPoints.capacity && (
                  <span className="flex items-baseline gap-1.5 ml-3"
                    title={`${t.overview.cpCapFree} ${nf(snap.controlPoints.capacity.free, 1)}`}>
                    <span className="text-faint text-[11px]">{t.overview.cpCap}</span>
                    <span className={`display text-[14px] ${
                      snap.controlPoints.capacity.free < 0 ? "text-bad" : "text-ink"}`}>
                      {Math.round(snap.controlPoints.capacity.used)}
                      <span className="text-faint text-[12px]">/{snap.controlPoints.capacity.cap}</span>
                    </span>
                    <span className={`display text-[14px] ml-1 ${
                      snap.controlPoints.capacity.free < 0 ? "text-bad" : "text-good"}`}>
                      {snap.controlPoints.capacity.free >= 0 ? "+" : ""}
                      {nf(snap.controlPoints.capacity.free, 1)}
                    </span>
                  </span>
                )}
              </span>
            )}
          </div>
        )}

        {/* riga 3 — navigazione, schede a spigolo vivo */}
        <nav className="flex flex-wrap">
          {TABS.map((tab) => {
            // le sotto-schede (/space/mining) tengono accesa la scheda madre
            const active = path === tab.href || (tab.href !== "/" && path.startsWith(tab.href + "/"));
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

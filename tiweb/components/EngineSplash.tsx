"use client";

/* Schermata d'avvio del motore nel browser.

   Copre tutta la pagina finche' non c'e' il primo snapshot: sotto, le pagine
   chiederebbero dati che non esistono ancora e mostrerebbero errori per un
   attimo. Resta almeno MIN_MS e poi sfuma, cosi' un avvio veloce non si
   riduce a un lampo. Le richieste all'utente (cartella, permesso) stanno qui
   dentro, nello stesso pannello: niente riquadri che compaiono e spariscono.

   Stile del gioco: niente angoli arrotondati, intestazione in Saira maiuscolo,
   indicatori quadrati, barra sottile nel colore della fazione.

   Sotto il pannello, a scorrimento, la presentazione del companion
   (Landing): e' l'unico testo che vede chi arriva la prima volta, e l'unico
   che trovano i crawler. */

import { useEffect, useRef, useState } from "react";
import { useEngineStatus } from "@/lib/api";
import { BOOT_STEPS, engine, engineMode, enterDemo, type EngineStatus } from "@/lib/engine";
import { useSettings } from "@/lib/settings";
import { Button } from "@/components/ui";
import { LanguagePicker } from "@/components/LanguagePicker";
import { GithubLink } from "@/components/GithubLink";
import { Landing } from "@/components/Landing";

const MIN_MS = 1100;     // sotto questa durata l'avvio sembra uno sfarfallio
const FADE_MS = 450;

type Phase = "shown" | "leaving" | "gone";

export function EngineSplash() {
  const st = useEngineStatus();
  const [phase, setPhase] = useState<Phase>("shown");
  const shownAt = useRef(0);

  useEffect(() => {
    shownAt.current = performance.now();
    // con l'API locale la schermata non serve: il CSS l'ha gia' nascosta
    if (engineMode() !== "browser") setTimeout(() => setPhase("gone"), 0);
  }, []);

  // al primo "ready": aspetta il minimo, poi sfuma e si toglie di mezzo
  const everReady = st?.everReady ?? false;
  useEffect(() => {
    if (!everReady) return;
    const wait = Math.max(0, MIN_MS - (performance.now() - shownAt.current));
    const t1 = setTimeout(() => setPhase("leaving"), wait);
    const t2 = setTimeout(() => setPhase("gone"), wait + FADE_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [everReady]);

  if (phase === "gone") return null;
  // prima del montaggio lo stato non c'e' ancora: si parte dal primo passo
  const status = st ?? engine.status;
  return (
    <div
      className="ti-splash fixed inset-0 z-50 overflow-y-auto bg-void"
      style={{
        opacity: phase === "leaving" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        // un velo del colore della fazione e il reticolo delle mappe del gioco
        backgroundImage: `radial-gradient(ellipse at 50% 38%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 62%),
          linear-gradient(color-mix(in srgb, var(--edge) 22%, transparent) 1px, transparent 1px),
          linear-gradient(90deg, color-mix(in srgb, var(--edge) 22%, transparent) 1px, transparent 1px)`,
        backgroundSize: "100% 100%, 48px 48px, 48px 48px",
      }}
      aria-live="polite"
    >
      <div className="min-h-full flex flex-col items-center gap-12 pt-[14vh]">
        <div className="w-full max-w-[440px] px-4"><Panel st={status} /></div>
        <Landing />
      </div>
    </div>
  );
}

function Panel({ st }: { st: EngineStatus }) {
  const { t } = useSettings();
  const e = t.engine;
  const [err, setErr] = useState<string | null>(null);
  const pick = async () => setErr(await engine.pickFolder());

  const labels: Record<(typeof BOOT_STEPS)[number], string> = {
    runtime: e.stepRuntime, code: e.stepCode, gamedata: e.stepGamedata, save: e.stepSave,
  };
  const waitingUser = st.state === "nofolder" || st.state === "permission" || st.state === "nosaves";
  const failed = st.state === "error" || st.state === "unsupported";
  const progress = st.done / BOOT_STEPS.length;

  return (
    <section className="relative w-full max-w-[440px] bg-panel border border-edge-lit">
      <Corners />
      <header className="px-5 pt-4 pb-3 bg-bar-deep border-b border-edge flex items-end gap-3">
        <div>
          <div className="display text-[10.5px] uppercase tracking-[.32em] text-faint">Terra Invicta</div>
          <div className="display text-[20px] uppercase tracking-[.14em] text-accent leading-tight">Companion</div>
        </div>
        {/* l'intestazione del sito e' coperta: senza questo, chi non legge
            l'italiano o l'inglese resta bloccato davanti alla prima schermata */}
        <span className="ml-auto flex items-center gap-3"><GithubLink /><LanguagePicker /></span>
      </header>

      <ol className="px-5 py-4 space-y-2.5">
        {BOOT_STEPS.map((k, i) => {
          const done = i < st.done;
          const active = i === st.done && !failed;
          const blocked = active && waitingUser;
          return (
            <li key={k} className="flex items-center gap-3 text-[12.5px]">
              <Marker done={done} active={active && !blocked} blocked={blocked} />
              <span className={done ? "text-ink" : active ? "text-ink" : "text-faint"}>{labels[k]}</span>
              <span className={`ml-auto display text-[10.5px] uppercase tracking-[.12em] ${
                done ? "text-good" : blocked ? "text-warn" : active ? "text-accent" : "text-faint"}`}>
                {done ? e.stepDone : blocked ? e.stepWaiting : active ? e.stepActive : ""}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mx-5 h-[2px] bg-edge relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-accent"
          style={{ width: `${progress * 100}%`, transition: "width 400ms ease" }} />
        {!waitingUser && !failed && st.done < BOOT_STEPS.length && <div className="ti-scan" />}
      </div>

      <div className="px-5 pt-3 pb-5 text-[12.5px] text-dim space-y-3 min-h-[92px]">
        {st.folder && (
          <p title={e.folderHint}>
            <span className="text-faint">{e.folder}: </span>
            <span className="font-mono text-[11.5px] text-ink break-all">{st.folder}</span>
          </p>
        )}
        {st.state === "nofolder" && <>
          <p>{e.noFolder}</p>
          <Button tone="primary" onClick={pick}>{e.pick}</Button>
          <Demo />
        </>}
        {st.state === "permission" && <>
          <p>{e.permission}</p>
          <div className="flex gap-3">
            <Button tone="primary" onClick={() => void engine.regrant()}>{e.allow}</Button>
            <Button onClick={pick}>{e.change}</Button>
          </div>
        </>}
        {st.state === "nosaves" && <>
          <p className="text-warn">{e.noSaves}</p>
          <Button onClick={pick}>{e.change}</Button>
          <Demo />
        </>}
        {/* Firefox, Safari, telefoni: la demo e' l'unica cosa che possono vedere */}
        {st.state === "unsupported" && <>
          <p className="text-bad">{e.unsupported}</p>
          <Demo primary />
        </>}
        {st.state === "error" && <>
          <p className="text-bad">{e.error}</p>
          <p className="font-mono text-[11.5px] break-all text-dim">{st.detail}</p>
          <Button onClick={pick}>{e.change}</Button>
        </>}
        {(st.state === "loading" || st.state === "ready") && <p className="text-faint">{e.firstLoad}</p>}
        {err && <p className="text-bad">{err}</p>}
      </div>
    </section>
  );
}

/** «Prova la demo»: la partita dell'autore, senza cartella (lib/engine.ts). */
function Demo({ primary }: { primary?: boolean }) {
  const { t } = useSettings();
  const e = t.engine;
  return (
    <div className="pt-3 mt-1 border-t border-edge space-y-2">
      {!primary && <p className="display text-[10.5px] uppercase tracking-[.14em] text-faint m-0">{e.demoOr}</p>}
      <p className="m-0">{e.demoHint}</p>
      <Button tone={primary ? "primary" : undefined} onClick={enterDemo}>{e.demoTry}</Button>
    </div>
  );
}

function Marker({ done, active, blocked }: { done: boolean; active: boolean; blocked: boolean }) {
  // quadrati, come le spunte dei pannelli del gioco
  const base = "w-[9px] h-[9px] shrink-0 border";
  if (done) return <span className={`${base} bg-accent border-accent`} />;
  if (blocked) return <span className={`${base} border-warn`} />;
  if (active) return <span className={`${base} border-accent ti-pulse`} />;
  return <span className={`${base} border-edge-lit`} />;
}

/** Le tacche agli angoli dei pannelli di Terra Invicta. */
function Corners() {
  const c = "absolute w-2.5 h-2.5 border-accent pointer-events-none";
  return <>
    <span className={`${c} -top-px -left-px border-t border-l`} />
    <span className={`${c} -top-px -right-px border-t border-r`} />
    <span className={`${c} -bottom-px -left-px border-b border-l`} />
    <span className={`${c} -bottom-px -right-px border-b border-r`} />
  </>;
}

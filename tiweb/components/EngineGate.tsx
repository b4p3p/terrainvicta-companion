"use client";

/* Cosa serve al motore nel browser prima di poter mostrare qualcosa: la
   cartella dei salvataggi, il permesso su di essa, il primo caricamento.
   Con l'API locale non compare mai. */

import { useState } from "react";
import { useEngineStatus } from "@/lib/api";
import { engine } from "@/lib/engine";
import { useSettings } from "@/lib/settings";
import { Button } from "@/components/ui";

export function EngineGate() {
  const { t } = useSettings();
  const e = t.engine;
  const st = useEngineStatus();
  const [err, setErr] = useState<string | null>(null);
  if (!st || st.state === "ready") return null;

  const pick = async () => setErr(await engine.pickFolder());

  const box = (title: string, body: React.ReactNode, action?: React.ReactNode, tone = "border-edge-lit") => (
    <div className={`mx-4 mt-4 mb-2 p-4 bg-raised border ${tone} max-w-3xl`}>
      <div className="display text-[14px] mb-1">{title}</div>
      <div className="text-[13px] text-dim space-y-2">{body}</div>
      {action && <div className="mt-3 flex items-center gap-3 flex-wrap">{action}</div>}
      {err && <p className="mt-2 text-bad text-[12.5px]">{err}</p>}
    </div>
  );

  switch (st.state) {
    case "loading":
      return box(e.loading, <>
        {st.detail && <p>{e.loadingStep.replace("{step}", st.detail)}</p>}
        <p>{e.firstLoad}</p>
      </>);
    case "nofolder":
      return box(e.noFolderTitle, <p>{e.noFolder}</p>,
        <Button tone="primary" onClick={pick}>{e.pick}</Button>);
    case "permission":
      return box(e.permissionTitle, <p>{e.permission}</p>, <>
        <Button tone="primary" onClick={() => void engine.regrant()}>{e.allow}</Button>
        <Button onClick={pick}>{e.change}</Button>
      </>, "border-warn/50");
    case "nosaves":
      return box(e.noSaves, <p>{st.detail}</p>,
        <Button onClick={pick}>{e.change}</Button>, "border-warn/50");
    case "unsupported":
      return box(e.unsupported, null, undefined, "border-bad/60");
    default:
      return box(e.error, <p className="font-mono text-[12px] break-all">{st.detail}</p>,
        <Button onClick={pick}>{e.change}</Button>, "border-bad/60");
  }
}

"use client";

/* Un percorso da incollare nella finestra di Windows (barra degli indirizzi o
   nome del file): il browser non puo' aprire il selettore su una cartella a
   scelta, quindi il percorso lo porta l'utente. */

import { useState } from "react";
import { useSettings } from "@/lib/settings";

/** StreamingAssets con l'installazione Steam predefinita: dentro ci sono
 *  Templates e Localization, e lo zip dei preset si estrae qui. */
export const GAME_STREAMING_DIR =
  String.raw`C:\Program Files (x86)\Steam\steamapps\common\Terra Invicta\TerraInvicta_Data\StreamingAssets`;

/** Cartella dei template con l'installazione Steam predefinita. */
export const GAME_TEMPLATES_DIR = String.raw`${GAME_STREAMING_DIR}\Templates`;

export function CopyPath({ path }: { path: string }) {
  const { t } = useSettings();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* appunti negati: il testo resta selezionabile */ }
  };
  return (
    <div className="flex items-stretch border border-edge-lit bg-void max-w-full">
      <code className="flex-1 min-w-0 px-3 py-2 text-[12px] font-mono text-ink break-all select-all">
        {path}
      </code>
      <button type="button" onClick={copy}
        className={`shrink-0 px-3 border-l border-edge-lit display text-[11px] uppercase tracking-[.1em]
          ${copied ? "text-good" : "text-dim hover:text-ink hover:bg-sel"}`}>
        {copied ? t.common.copied : t.common.copy}
      </button>
    </div>
  );
}

"use client";

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import {
  BR, CN, CZ, DE, ES, FR, GB, IT, JP, KR, PL, RU, TW, UA,
} from "country-flag-icons/react/3x2";
import { GAME_LANGS } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";

/* Bandiere in SVG e non emoji: Windows non ha le emoji delle bandiere e
   mostrerebbe due lettere. Per lo stesso motivo non e' un <select>, le cui
   <option> accettano solo testo. */
const FLAGS: Record<string, typeof GB> = {
  BR, CN, CZ, DE, ES, FR, GB, IT, JP, KR, PL, RU, TW, UA,
};

function Flag({ code }: { code: string }) {
  const F = FLAGS[code];
  return F ? <F aria-hidden="true" className="w-[18px] h-3 shrink-0 border border-edge" /> : null;
}

/** La lingua di gioco, che trascina anche quella dell'interfaccia (it/en). */
export function LanguagePicker({ anchor = "bottom end" }: { anchor?: "bottom end" | "bottom start" }) {
  const { t, game, setGame } = useSettings();
  const cur = GAME_LANGS.find((l) => l.id === game) ?? GAME_LANGS[0];
  return (
    <Listbox value={game} onChange={setGame}>
      <ListboxButton aria-label={t.common.language}
        className="flex items-center gap-2 h-6 px-2 text-[12px] text-dim hover:text-ink
                   bg-panel border border-edge data-[open]:border-edge-lit">
        <Flag code={cur.flag} />
        <span>{cur.name}</span>
        <svg width="9" height="5" viewBox="0 0 10 6" aria-hidden="true" className="ml-0.5">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.4" fill="none" />
        </svg>
      </ListboxButton>
      <ListboxOptions anchor={anchor}
        className="z-[60] bg-raised border border-edge-lit py-0.5 min-w-[170px]
                   max-h-[420px] overflow-y-auto [--anchor-gap:2px] focus:outline-none">
        {GAME_LANGS.map((l) => (
          <ListboxOption key={l.id} value={l.id}
            className="flex items-center gap-2 px-2 py-[4px] text-[12px] cursor-pointer text-dim
                       data-[focus]:bg-sel data-[focus]:text-ink data-[selected]:text-accent">
            <Flag code={l.flag} />
            <span>{l.name}</span>
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}

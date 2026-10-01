"use client";

import { useMemo, useState } from "react";
import {
  Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions,
} from "@headlessui/react";

export interface ComboOption {
  id: string;
  label: string;
  /** intestazione del gruppo; le opzioni vanno passate già in ordine di gruppo */
  group?: string;
  /** testo secondario a destra, cercabile anch'esso */
  hint?: string;
}

/** minuscole e senza accenti: «unita» trova «Unità» */
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Combo con ricerca, su Headless UI: tastiera e ARIA li fa la libreria, lo
 *  stile resta quello di input/select in globals.css. Si apre al clic sul
 *  testo (`immediate`), che si seleziona: si scrive per filtrare, frecce e
 *  Invio per scegliere, Esc per chiudere. */
export function Combo({
  value, onChange, options, placeholder, width = 260,
}: {
  value: string | null;
  onChange: (id: string) => void;
  options: ComboOption[];
  placeholder?: string;
  width?: number;
}) {
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return q
      ? options.filter((o) => fold(`${o.label} ${o.hint ?? ""} ${o.group ?? ""}`).includes(q))
      : options;
  }, [options, query]);

  return (
    <Combobox value={value} onChange={(id: string | null) => id && onChange(id)}
      onClose={() => setQuery("")} immediate>
      <div className="relative inline-block" style={{ width }}>
        <ComboboxInput
          className="w-full pr-7"
          displayValue={(id: string | null) => (id ? byId.get(id)?.label ?? "" : "")}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
        <ComboboxButton className="absolute inset-y-0 right-0 w-7 flex items-center
                                   justify-center text-dim hover:text-ink bg-transparent border-0">
          <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.4" fill="none" />
          </svg>
        </ComboboxButton>
      </div>
      <ComboboxOptions anchor="bottom start"
        className="z-50 bg-raised border border-edge-lit !max-h-[380px] overflow-y-auto
                   w-[var(--input-width)] min-w-[240px] [--anchor-gap:2px] pb-0.5
                   empty:invisible">
        {shown.length === 0 && (
          <div className="px-2 py-1.5 text-[12px] text-faint">—</div>
        )}
        {shown.map((o, i) => (
          <div key={o.id}>
            {o.group && o.group !== shown[i - 1]?.group && (
              <div className="sticky top-0 z-10 bg-bar px-2 pt-1.5 pb-1 text-[10.5px] uppercase
                              tracking-[.06em] text-faint display border-b border-edge">
                {o.group}
              </div>
            )}
            <ComboboxOption value={o.id}
              className="pl-2 pr-2 py-[5px] text-[12.5px] cursor-pointer flex items-baseline gap-2
                         text-dim border-l-2 border-transparent
                         data-[focus]:bg-sel data-[focus]:text-ink
                         data-[selected]:text-accent data-[selected]:border-accent group">
              <span className="w-3 shrink-0 text-accent invisible group-data-[selected]:visible">✓</span>
              <span className="truncate">{o.label}</span>
              {o.hint && <span className="ml-auto text-faint text-[11px] shrink-0">{o.hint}</span>}
            </ComboboxOption>
          </div>
        ))}
      </ComboboxOptions>
    </Combobox>
  );
}

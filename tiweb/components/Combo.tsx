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
 *  stile resta quello di input/select in globals.css. Si scrive per filtrare,
 *  frecce e Invio per scegliere, Esc per chiudere. */
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
      onClose={() => setQuery("")}>
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
        className="z-50 bg-raised border border-edge-lit max-h-[340px] overflow-y-auto
                   w-[var(--input-width)] min-w-[220px] [--anchor-gap:2px] py-0.5
                   empty:invisible">
        {shown.length === 0 && (
          <div className="px-2 py-1.5 text-[12px] text-faint">—</div>
        )}
        {shown.map((o, i) => (
          <div key={o.id}>
            {o.group && o.group !== shown[i - 1]?.group && (
              <div className="px-2 pt-1.5 pb-0.5 text-[10.5px] uppercase tracking-[.06em]
                              text-faint display border-t border-edge first:border-t-0">
                {o.group}
              </div>
            )}
            <ComboboxOption value={o.id}
              className="px-2 py-[3px] text-[12px] cursor-pointer flex items-baseline gap-2
                         text-dim data-[focus]:bg-sel data-[focus]:text-ink
                         data-[selected]:text-accent">
              <span className="truncate">{o.label}</span>
              {o.hint && <span className="ml-auto text-faint text-[11px] shrink-0">{o.hint}</span>}
            </ComboboxOption>
          </div>
        ))}
      </ComboboxOptions>
    </Combobox>
  );
}

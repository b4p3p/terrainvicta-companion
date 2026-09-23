"use client";

import { useState, type ReactNode } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";

/** Guida di una scheda, in una finestra come i popup del gioco: intestazione
 *  FRA_popup_header col filetto d'accento, corpo sul fondo dei pannelli,
 *  niente angoli né ombre. Il testo lungo sta qui, non sopra i dati. */
export function Guide({ title, label, children }: {
  title: string; label: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="text-[11.5px] text-dim hover:text-ink border border-edge-lit bg-control
                   px-2 py-[1px] inline-flex items-center gap-1.5">
        <span className="inline-flex items-center justify-center w-[13px] h-[13px] border
                         border-current text-[9.5px] leading-none">?</span>
        {label}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-void/75" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="bg-raised border border-edge-lit w-full max-w-[720px]
                                  max-h-[85vh] flex flex-col">
            <header className="bg-bar-deep border-b border-edge-lit flex items-center
                               justify-between gap-4 px-3 py-1.5">
              <DialogTitle className="display text-[13px] uppercase tracking-[.06em] m-0
                                      border-l-2 border-accent pl-2 leading-tight">
                {title}
              </DialogTitle>
              <button type="button" onClick={() => setOpen(false)} aria-label="×"
                className="text-dim hover:text-ink bg-transparent border-0 text-[16px] leading-none px-1">
                ×
              </button>
            </header>
            <div className="p-4 overflow-y-auto text-[12.5px] text-dim leading-relaxed
                            [&_p]:mb-3 [&_p:last-child]:mb-0 [&_h4]:text-ink [&_h4]:display
                            [&_h4]:text-[12px] [&_h4]:uppercase [&_h4]:tracking-[.06em]
                            [&_h4]:mt-4 [&_h4]:mb-1.5 [&_h4:first-child]:mt-0">
              {children}
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}

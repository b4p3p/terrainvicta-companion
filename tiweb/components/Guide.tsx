"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/Modal";

/** Guida di una scheda, in una finestra come i popup del gioco. Il testo
 *  lungo sta qui, non sopra i dati. */
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
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <div className="text-[12.5px] text-dim leading-relaxed
                        [&_p]:mb-3 [&_p:last-child]:mb-0 [&_h4]:text-ink [&_h4]:display
                        [&_h4]:text-[12px] [&_h4]:uppercase [&_h4]:tracking-[.06em]
                        [&_h4]:mt-4 [&_h4]:mb-1.5 [&_h4:first-child]:mt-0">
          {children}
        </div>
      </Modal>
    </>
  );
}

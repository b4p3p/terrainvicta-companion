"use client";

import type { ReactNode } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";

/** Finestra come i popup del gioco: intestazione FRA_popup_header col filetto
 *  d'accento, corpo sul fondo dei pannelli, niente angoli né ombre.
 *  Esc e clic fuori la chiudono (li gestisce Headless UI). */
export function Modal({ open, onClose, title, children, footer, width = 720 }: {
  open: boolean; onClose: () => void; title: ReactNode;
  children: ReactNode; footer?: ReactNode; width?: number;
}) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-void/75" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="bg-raised border border-edge-lit w-full max-h-[88vh] flex flex-col"
          style={{ maxWidth: width }}>
          <header className="bg-bar-deep border-b border-edge-lit flex items-center
                             justify-between gap-4 px-3 py-1.5">
            <DialogTitle className="display text-[13px] uppercase tracking-[.06em] m-0
                                    border-l-2 border-accent pl-2 leading-tight">
              {title}
            </DialogTitle>
            <button type="button" onClick={onClose} aria-label="×"
              className="text-dim hover:text-ink bg-transparent border-0 text-[16px] leading-none px-1">
              ×
            </button>
          </header>
          <div className="p-4 overflow-y-auto">{children}</div>
          {footer && (
            <footer className="border-t border-edge-lit bg-bar px-3 py-2">{footer}</footer>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}

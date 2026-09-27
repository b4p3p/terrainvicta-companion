"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Tooltip con lo stile di quelli del gioco: pannello scuro, intestazione come
 *  i popup (FRA_popup_header), filetto d'accento. Sostituisce il `title` nativo
 *  quando il testo è lungo o ha una struttura (titolo, righe, numeri).
 *
 *  Si apre al passaggio del mouse (con un breve ritardo, come nel gioco) e al
 *  focus da tastiera; sta sopra l'elemento e passa sotto se non c'è spazio,
 *  senza mai uscire dallo schermo. Vive in un portale: i pannelli con
 *  `overflow` non lo tagliano. */
export function Tip({
  children, content, title, width = 320, delay = 150,
}: {
  children: ReactNode;
  content: ReactNode;
  title?: ReactNode;
  width?: number;
  delay?: number;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const id = useId();

  const show = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  }, [delay]);
  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
    setPos(null);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !box.current) return;
    const a = anchor.current.getBoundingClientRect();
    const b = box.current.getBoundingClientRect();
    const gap = 6, margin = 8;
    const left = Math.min(Math.max(a.left + a.width / 2 - b.width / 2, margin),
                          window.innerWidth - b.width - margin);
    const above = a.top - b.height - gap;
    const top = above >= margin ? above : Math.min(a.bottom + gap, window.innerHeight - b.height - margin);
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => hide();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, hide]);

  return (
    <>
      <span ref={anchor} tabIndex={0} aria-describedby={open ? id : undefined}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        className="inline-flex items-center cursor-help outline-none focus-visible:ring-1 focus-visible:ring-accent">
        {children}
      </span>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={box} id={id} role="tooltip"
          className="fixed z-50 pointer-events-none bg-raised border border-edge-lit
                     shadow-[0_6px_18px_rgba(0,0,0,.55)] text-[12px] leading-relaxed"
          style={{ width, maxWidth: "calc(100vw - 16px)",
                   left: pos?.left ?? -9999, top: pos?.top ?? -9999,
                   visibility: pos ? "visible" : "hidden" }}>
          {title && (
            <div className="bg-bar-deep border-b border-edge-lit px-2.5 py-1 display
                            text-[11.5px] uppercase tracking-[.06em] text-ink border-l-2 border-l-accent">
              {title}
            </div>
          )}
          <div className="px-2.5 py-2 text-dim">{content}</div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Riga «etichetta … valore» dentro un Tip, per i numeri scomposti. */
export function TipRow({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "text-ink border-t border-edge mt-1 pt-1" : ""}`}>
      <span>{label}</span>
      <span className="display tabular-nums">{value}</span>
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/Modal";
import { useSettings } from "@/lib/settings";

export interface GuideSection {
  /** titolo della sezione; la prima può farne a meno */
  title?: string;
  /** un paragrafo per voce; `null`/`false` si saltano, per le note condizionali */
  body: (ReactNode | null | false)[];
}

/** Guida di una scheda: il pulsante «? Guida» da mettere nella barra del
 *  pannello (`<Panel right={<Guide …/>}>`) e la finestra che apre.
 *
 *  È l'unico posto dove vivono le note di metodo — euristiche dichiarate,
 *  soglie, cosa il gioco nasconde. Sopra i dati resta al massimo una riga.
 *  Le schede passano solo il contenuto, come dati: etichetta, finestra e
 *  tipografia sono qui, così non divergono da una scheda all'altra. */
export function Guide({ title, sections }: { title: string; sections: GuideSection[] }) {
  const { t } = useSettings();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="text-[11.5px] text-dim hover:text-ink border border-edge-lit bg-control
                   px-2 py-[1px] inline-flex items-center gap-1.5">
        <span className="inline-flex items-center justify-center w-[13px] h-[13px] border
                         border-current text-[9.5px] leading-none">?</span>
        {t.common.guide}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${t.common.guide} · ${title}`}>
        <div className="text-[12.5px] text-dim leading-relaxed">
          {sections.map((s, i) => (
            <section key={i} className={i ? "mt-4" : ""}>
              {s.title && (
                <h4 className="display text-ink text-[12px] uppercase tracking-[.06em] mb-1.5">
                  {s.title}
                </h4>
              )}
              {s.body.filter((b) => b != null && b !== false).map((b, j) => (
                <div key={j} className="mb-2.5 last:mb-0">{b}</div>
              ))}
            </section>
          ))}
        </div>
      </Modal>
    </>
  );
}

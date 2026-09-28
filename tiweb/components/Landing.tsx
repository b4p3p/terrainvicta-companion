"use client";

/* Sotto il pannello d'avvio: cos'è il companion, per chi arriva da un link e
   per i crawler, che senza salvataggio non vedono altro. I testi stanno in
   lib/landing.ts. Stesso stile del pannello: niente angoli arrotondati,
   intestazioni in Saira maiuscolo. */

import { LANDING } from "@/lib/landing";
import { useSettings } from "@/lib/settings";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="display text-[12px] uppercase tracking-[.14em] text-dim m-0 mb-3">{children}</h2>;
}

export function Landing() {
  const { t, ui } = useSettings();
  const l = LANDING[ui];

  return (
    <article className="w-full px-4 sm:px-8 pb-12 space-y-10 text-[13px] leading-relaxed">
      <header className="text-center space-y-2">
        <h1 className="display text-[22px] uppercase tracking-[.1em] m-0">
          Terra Invicta Companion
          <span className="block text-[13px] tracking-[.14em] text-accent mt-1">{l.tagline}</span>
        </h1>
        <p className="text-dim m-0">{l.lead}</p>
      </header>

      <section>
        <H2>{l.featuresTitle}</H2>
        <ul className="grid gap-[2px] sm:grid-cols-2 xl:grid-cols-5 list-none p-0 m-0">
          {l.features.map((f) => (
            <li key={f.title} className="bg-panel border-l-[3px] border-accent px-3 py-2">
              <h3 className="font-semibold text-[13px] m-0">{f.title}</h3>
              <p className="text-dim text-[12px] m-0 mt-0.5">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <H2>{l.howTitle}</H2>
          <ol className="space-y-2 p-0 m-0 list-none">
            {l.how.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="display text-accent text-[13px] w-4 shrink-0">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <H2>{l.faqTitle}</H2>
          <dl className="space-y-3 m-0">
            {l.faq.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold">{f.q}</dt>
                <dd className="text-dim m-0">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <p className="text-faint text-[11.5px] border-t border-edge pt-3 m-0">{t.about.disclaimer}</p>
    </article>
  );
}

"use client";

import { useState } from "react";
import { useSettings } from "@/lib/settings";
import { donationUrl, SITE, siteEmail } from "@/lib/site";
import { Button, Panel } from "@/components/ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="display text-[12px] uppercase tracking-[.06em] text-dim m-0">{title}</h3>
      <div className="text-[13px] leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  const { t } = useSettings();
  const a = t.about;
  const [email, setEmail] = useState<string | null>(null);

  return (
    <Panel title={a.title}>
      {/* tutta la larghezza, come le altre schede: su schermi larghi due
          colonne invece di righe lunghissime */}
      <div className="grid gap-x-10 gap-y-6 py-1 lg:grid-cols-2">
        <Section title={a.whoTitle}>
          <p>{a.who.replace("{author}", SITE.author)}</p>
          <p>{a.who2}</p>
        </Section>

        <Section title={a.whatTitle}>
          <p>{a.what}</p>
          <p className="text-dim">{a.heuristics}</p>
        </Section>

        <Section title={a.privacyTitle}>
          <p>{a.privacy}</p>
        </Section>

        <Section title={a.contactTitle}>
          {email
            ? <a href={`mailto:${email}`} className="text-accent hover:underline">{email}</a>
            : <Button onClick={() => setEmail(siteEmail())}>{a.showEmail}</Button>}
        </Section>

        {SITE.paypal && (
          <Section title={a.supportTitle}>
            <p>{a.support}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {SITE.donations.map((d) => (
                <a key={d.key} href={donationUrl(d.amount)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 h-9 border border-accent text-accent
                    text-[13px] hover:bg-sel">
                  <span aria-hidden>{a.donate[d.key].icon}</span>
                  <span className="display text-[12px] uppercase tracking-[.08em]">{a.donate[d.key].label}</span>
                  <span className="text-dim">
                    {d.amount ? `${d.amount} €` : a.donateFree}
                  </span>
                </a>
              ))}
            </div>
            <p className="text-faint text-[12px]">{a.donateHint}</p>
          </Section>
        )}

        <p className="lg:col-span-2 text-faint text-[11.5px] border-t border-edge pt-3">{a.disclaimer}</p>
      </div>
    </Panel>
  );
}

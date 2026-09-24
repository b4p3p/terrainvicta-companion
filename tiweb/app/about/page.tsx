"use client";

import { useState } from "react";
import { useSettings } from "@/lib/settings";
import { SITE, siteEmail } from "@/lib/site";
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
            <a href={SITE.paypal} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center px-3 h-8 border border-accent text-accent
                display text-[12px] uppercase tracking-[.08em] hover:bg-sel">
              {a.donate}
            </a>
          </Section>
        )}

        <p className="lg:col-span-2 text-faint text-[11.5px] border-t border-edge pt-3">{a.disclaimer}</p>
      </div>
    </Panel>
  );
}

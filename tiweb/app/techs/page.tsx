"use client";

import { useMemo } from "react";
import { useApi } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { usePersistentState } from "@/lib/persist";
import { Empty, GameIcon, Panel, ResourceIcon, Tag, nf } from "@/components/ui";
import { Guide } from "@/components/Guide";
import { Tip, TipRow } from "@/components/Tip";

interface Ref { id: string; name: string }
interface Project {
  id: string; name: string; summary: string; part: "ship" | "hab" | null; cost: number;
  effects: string[]; grants: { resource: string; value: number; name: string }[]; org: boolean;
  themes: string[]; exclusive: boolean; always: boolean;
  chance: number;
  chanceParts: { reason?: "always" | "fixed" | "template"; template?: number; base?: number;
                 science?: number; traits?: number; effects?: number };
  months: number; trigger: { start: number; step: number; max: number };
  missing: Ref[]; missed: boolean; oneTime: boolean;
}
interface Tech {
  id: string; name: string; summary: string; category: string; categoryName: string;
  cost: number; effects: string[]; now: Project[]; later: Project[];
  opens: (Ref & { missing: Ref[] })[]; themes: string[];
}
interface Techs {
  techs: Tech[];
  inProgress: Ref[];
  rules: { science: number; scienceBonus: number; humanFactions: number;
           traitBonus: number; effectBonus: number; speed: number };
}

const THEMES = ["cpCap", "influence", "research", "orgs", "councilors", "money", "ops",
                "missions", "nations", "space"] as const;
type Theme = (typeof THEMES)[number] | "all";

/** Icona del gioco per ogni tema; le missioni usano quella di «Controlla nazione». */
const THEME_ICON: Record<Theme, { bundle: "icons_2d" | "councilor_missions"; icon: string }> = {
  all: { bundle: "icons_2d", icon: "ICO_projects" },
  cpCap: { bundle: "icons_2d", icon: "ICO_ControlPoint_empty" },
  influence: { bundle: "icons_2d", icon: "ICO_influence" },
  research: { bundle: "icons_2d", icon: "ICO_research" },
  orgs: { bundle: "icons_2d", icon: "ICO_administration" },
  councilors: { bundle: "icons_2d", icon: "ICO_loyalty" },
  money: { bundle: "icons_2d", icon: "ICO_currency" },
  ops: { bundle: "icons_2d", icon: "ICO_ops" },
  missions: { bundle: "councilor_missions", icon: "ICO_gain_influence" },
  nations: { bundle: "icons_2d", icon: "ICO_gov_type" },
  space: { bundle: "icons_2d", icon: "ICO_boost" },
};

/** Icona della categoria, come nella lista del gioco (TIGenericTechTemplate.categoryIcon). */
const CATEGORY_ICON: Record<string, string> = {
  Energy: "tech_energy_icon", InformationScience: "tech_info_icon",
  LifeScience: "tech_life_icon", Materials: "tech_material_icon",
  MilitaryScience: "tech_military_icon", SocialScience: "tech_social_icon",
  SpaceScience: "tech_space_icon", Xenology: "tech_xeno_icon",
};
const SORTS = ["category", "cost", "now"] as const;
type Sort = (typeof SORTS)[number];

const isTheme = (v: unknown): v is Theme =>
  v === "all" || (THEMES as readonly unknown[]).includes(v);
const isSort = (v: unknown): v is Sort => (SORTS as readonly unknown[]).includes(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/** Progetti subito che non sono componenti, pesati per la probabilità del gioco. */
const weight = (x: Tech) =>
  x.now.filter((p) => !p.part).reduce((acc, p) => acc + p.chance / 100, 0);
const parts = (x: Tech) =>
  x.now.filter((p) => p.part).reduce((acc, p) => acc + p.chance / 100, 0);

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s);

/** Probabilità che il progetto esista per te: è il numero del gioco, scomposto. */
function Chance({ p }: { p: Project }) {
  const { t } = useSettings();
  const k = t.techs;
  const c = p.chanceParts;
  return (
    <Tip title={`${p.name} · ${Math.round(p.chance)}%`} content={
      <>
        <p className="m-0 mb-1.5">{k.chanceHint}</p>
        {c.reason
          ? <p className="m-0 text-ink">{k.chanceReason[c.reason]}</p>
          : <>
              <TipRow label={k.chanceTemplate} value={`${nf(c.template ?? 0, 0)}%`} />
              {c.base !== c.template && <TipRow label={k.chanceFactions} value={`${nf(c.base ?? 0, 1)}%`} />}
              <TipRow label={k.chanceScience} value={`+${nf(c.science ?? 0, 1)}`} />
              {!!c.traits && <TipRow label={k.chanceTraits} value={`+${nf(c.traits, 0)}`} />}
              {!!c.effects && <TipRow label={k.chanceEffects} value={`+${nf(c.effects, 0)}`} />}
              <TipRow strong label={k.chanceShown} value={`${Math.round(p.chance)}%`} />
              <p className="m-0 mt-1.5 text-faint">{k.chanceContribution}</p>
            </>}
      </>
    }>
      <Tag tone={p.chance >= 100 ? "mine" : "warn"}>{Math.round(p.chance)}%</Tag>
    </Tip>
  );
}

/** Mesi attesi prima che compaia: stima nostra, con i numeri del trigger. */
function Months({ p }: { p: Project }) {
  const { t } = useSettings();
  const k = t.techs;
  return (
    <Tip title={k.monthsTitle} content={
      <>
        <TipRow label={k.monthsStart} value={`${nf(p.trigger.start, 1)}%`} />
        <TipRow label={k.monthsStep} value={`+${nf(p.trigger.step, 0)}`} />
        <TipRow label={k.monthsMax} value={`${nf(p.trigger.max, 0)}%`} />
        <TipRow strong label={k.monthsAvg} value={`~${nf(p.months, 1)}`} />
        <p className="m-0 mt-1.5 text-faint">{k.monthsNote}</p>
      </>
    }>
      <span>~{nf(p.months, 1)} {k.months}</span>
    </Tip>
  );
}

/** Etichetta con la spiegazione nel tooltip. */
function TagTip({ tone, label, hint }: { tone?: "mine" | "free" | "bad" | "warn" | "dim"; label: string; hint: string }) {
  return <Tip title={label} content={hint} width={280}><Tag tone={tone}>{label}</Tag></Tip>;
}

function ProjectRow({ p }: { p: Project }) {
  const { t } = useSettings();
  const k = t.techs;
  return (
    <div className="border-l-2 border-edge-lit pl-2.5 py-0.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-ink">{p.name}</span>
        <Chance p={p} />
        {p.exclusive && <TagTip tone="free" label={k.exclusive} hint={k.exclusiveHint} />}
        {!p.exclusive && p.always && <TagTip tone="free" label={k.always} hint={k.alwaysHint} />}
        {p.part && <TagTip label={k.part[p.part]} hint={k.partHint} />}
        {p.oneTime && <TagTip label={k.oneTime} hint={k.oneTimeHint} />}
        {p.missed && <TagTip tone="bad" label={k.missed} hint={k.missedHint} />}
        <span className="text-faint text-[11.5px] ml-auto whitespace-nowrap inline-flex items-baseline gap-1">
          {nf(p.cost, 0)} {k.pts} · <Months p={p} />
        </span>
      </div>
      {(p.grants.length > 0 || p.effects.length > 0 || p.org) && (
        <ul className="m-0 mt-0.5 pl-4 text-[12px] text-dim list-disc marker:text-faint">
          {p.grants.map((g) => (
            <li key={g.resource}>
              {fill(k.grant, { value: nf(g.value, 0), resource: g.name })}
            </li>
          ))}
          {p.effects.map((e, i) => <li key={i}>{e}</li>)}
          {p.org && <li>{k.orgGranted}</li>}
        </ul>
      )}
      {p.grants.length === 0 && p.effects.length === 0 && !p.org && p.summary && (
        <p className="m-0 mt-0.5 text-[12px] text-faint italic">{p.summary}</p>
      )}
    </div>
  );
}

function TechCard({ tech, open, onToggle, showScore }: {
  tech: Tech; open: boolean; onToggle: () => void; showScore: boolean;
}) {
  const { t } = useSettings();
  const k = t.techs;
  const ready = tech.opens.filter((o) => o.missing.length === 0);
  const partial = tech.opens.filter((o) => o.missing.length > 0);
  return (
    <article className="bg-panel border border-edge p-3 flex flex-col gap-2.5">
      <header>
        <div className="flex items-center gap-2">
          <ResourceIcon icon={CATEGORY_ICON[tech.category]} size={20} title={tech.categoryName} />
          <h3 className="display text-[15px] m-0 text-ink">{tech.name}</h3>
          <span className="text-faint text-[11.5px]">{tech.categoryName}</span>
          {showScore && (
            <span className="ml-auto whitespace-nowrap">
              <Tip title={`${k.score} ${nf(weight(tech), 2)}`} width={340} content={
                <>
                  <p className="m-0 mb-1.5">{k.scoreHint}</p>
                  {tech.now.filter((p) => !p.part).map((p) => (
                    <TipRow key={p.id} label={<>{p.name}{p.oneTime && <span className="text-faint"> · {k.oneTime}</span>}</>}
                      value={nf(p.chance / 100, 2)} />
                  ))}
                  <TipRow strong label={k.score} value={nf(weight(tech), 2)} />
                </>
              }>
                <Tag tone="free">{k.score} {nf(weight(tech), 2)}</Tag>
              </Tip>
            </span>
          )}
          <span className={`${showScore ? "" : "ml-auto "}display text-[14px] whitespace-nowrap`}>
            {nf(tech.cost, 0)} <span className="text-faint text-[11px]">{k.pts}</span>
          </span>
        </div>
        {tech.summary && <p className="m-0 mt-0.5 text-[12px] text-faint">{tech.summary}</p>}
        {tech.effects.length > 0 && (
          <ul className="m-0 mt-1 pl-4 text-[12px] text-dim list-disc marker:text-faint">
            {tech.effects.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
      </header>

      <section>
        <div className="text-faint text-[10.5px] uppercase tracking-[.06em] mb-1">
          {k.now} ({tech.now.length})
        </div>
        {tech.now.length === 0
          ? <p className="m-0 text-[12px] text-faint">{k.nothingNow}</p>
          : <div className="flex flex-col gap-1.5">{tech.now.map((p) => <ProjectRow key={p.id} p={p} />)}</div>}
      </section>

      {(ready.length > 0 || partial.length > 0) && (
        <section className="text-[12px]">
          <span className="text-faint text-[10.5px] uppercase tracking-[.06em] mr-2">{k.opens}</span>
          {ready.map((o) => <span key={o.id} className="mr-2 text-ink">{o.name}</span>)}
          {partial.map((o) => (
            <span key={o.id} className="mr-2 text-faint">
              <Tip title={o.name} width={260}
                content={<>{k.stillMissing}: <span className="text-ink">{o.missing.map((m) => m.name).join(", ")}</span></>}>
                {o.name}*
              </Tip>
            </span>
          ))}
        </section>
      )}

      {tech.later.length > 0 && (
        <section className="text-[12px]">
          <button onClick={onToggle} className="text-faint text-[10.5px] uppercase tracking-[.06em] hover:text-ink">
            {open ? "▾" : "▸"} {k.later} ({tech.later.length})
          </button>
          {open && (
            <div className="flex flex-col gap-1 mt-1">
              {tech.later.map((p) => (
                <div key={p.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-dim">{p.name}</span>
                  <Chance p={p} />
                  {p.exclusive && <Tag tone="free">{k.exclusive}</Tag>}
                  <span className="text-faint text-[11.5px]">
                    {k.stillMissing}: {p.missing.map((m) => m.name).join(", ")}
                  </span>
                  {p.effects[0] && <span className="text-faint text-[11.5px] basis-full pl-3">{p.effects.join(" · ")}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </article>
  );
}

export default function TechsPage() {
  const { t, game, live } = useSettings();
  const k = t.techs;
  const { data, error } = useApi<Techs>(`/api/techs?lang=${game}`, [live.version, game]);
  const [theme, setTheme] = usePersistentState<Theme>("techs.theme", "all", isTheme);
  const [sort, setSort] = usePersistentState<Sort>("techs.sort", "now", isSort);
  const [onlyNow, setOnlyNow] = usePersistentState("techs.onlyNow", false, isBool);
  const [openLater, setOpenLater] = usePersistentState("techs.later", false, isBool);

  const rows = useMemo(() => {
    if (!data) return [];
    const xs = data.techs.filter((x) =>
      (theme === "all" || x.themes.includes(theme)) && (!onlyNow || x.now.length > 0));
    const by: Record<Sort, (a: Tech, b: Tech) => number> = {
      category: (a, b) => a.categoryName.localeCompare(b.categoryName) || a.cost - b.cost,
      cost: (a, b) => a.cost - b.cost,
      // vantaggi per la fazione che arrivano subito, pesati per la probabilità;
      // i componenti di navi e habitat contano solo a parità
      now: (a, b) => weight(b) - weight(a) || parts(b) - parts(a) || a.cost - b.cost,
    };
    return [...xs].sort(by[sort]);
  }, [data, theme, sort, onlyNow]);

  if (error) return <Empty>{t.common.error}: {error}</Empty>;
  if (!data) return <Empty>{t.common.loading}</Empty>;

  const count = (th: Theme) =>
    th === "all" ? data.techs.length : data.techs.filter((x) => x.themes.includes(th)).length;
  const r = data.rules;

  return (
    <Panel title={k.title} sub={`${rows.length} / ${data.techs.length}`}
      right={
        <Guide title={k.title} sections={[
          { body: [k.guideIntro] },
          { title: k.guideChanceTitle, body: [
            fill(k.guideChance, { science: r.science, bonus: nf(r.scienceBonus, 1), factions: r.humanFactions }),
            k.guideContribution,
          ] },
          { title: k.guideMonthsTitle, body: [k.guideMonths] },
          { title: k.guideLaterTitle, body: [k.guideLater] },
          { title: k.guideSortTitle, body: [k.guideSort] },
        ]} />
      }>
      <div className="px-3 pt-3">
        <p className="text-faint text-[11.5px] mt-0 mb-3">
          {k.sub}
          {data.inProgress.length > 0 && <> {k.inProgress}: {data.inProgress.map((x) => x.name).join(", ")}.</>}
        </p>

        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {(["all", ...THEMES] as Theme[]).filter((th) => count(th) > 0).map((th) => (
            <button key={th} onClick={() => setTheme(th)}
              className={`inline-flex items-center gap-1.5 border px-2 py-[2px] text-[12px] ${theme === th
                ? "border-accent text-accent bg-accent/10" : "border-edge text-dim hover:text-ink"}`}>
              <GameIcon bundle={THEME_ICON[th].bundle} icon={THEME_ICON[th].icon} size={15} />
              {k.theme[th]} <span className="text-faint">{count(th)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 mb-3 text-[12px]">
          <label className="flex items-center gap-1.5">
            <span className="text-faint">{k.sortBy}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {SORTS.map((s) => <option key={s} value={s}>{k.sort[s]}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={onlyNow} onChange={(e) => setOnlyNow(e.target.checked)} />
            {k.onlyNow}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={openLater} onChange={(e) => setOpenLater(e.target.checked)} />
            {k.showLater}
          </label>
        </div>
      </div>

      {rows.length === 0 ? <Empty>{k.none}</Empty> : (
        <div className="grid gap-3 px-3 pb-3 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((x) => (
            <TechCard key={x.id} tech={x} open={openLater} onToggle={() => setOpenLater(!openLater)}
              showScore={sort === "now"} />
          ))}
        </div>
      )}
    </Panel>
  );
}

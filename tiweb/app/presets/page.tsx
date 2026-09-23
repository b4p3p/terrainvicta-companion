"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API, api } from "@/lib/api";
import { usePersistentState } from "@/lib/persist";
import { useSettings } from "@/lib/settings";
import { Button, Empty, GameIcon, Panel, Tag } from "@/components/ui";
import { Combo, type ComboOption } from "@/components/Combo";
import { Guide } from "@/components/Guide";
import {
  COLOR_OF, FAMILIES, Legend, ShareBar, WeightChips, familyShares, pc, pp,
  type Priority, type Slice,
} from "@/components/priorities";

interface Preset {
  id: string;
  name: string;
  faction: string | null;
  mine: boolean;
  editable: boolean;
  installed: boolean;
  stale: boolean;
  count: number;
  total: number;
  research: number;
  military: number;
  weights: Record<string, number>;
  priorities: Slice[];
}

interface Status {
  ok: boolean;
  error: string | null;
  path: string | null;
  writable: boolean;
  backup: boolean;
  installed: number;
  stale: number;
  priorities: Priority[];
  presets: Preset[];
  pending: Preset[];
}

type Labels = ReturnType<typeof useSettings>["t"]["presets"];

/** Quanto prende ogni famiglia, e quanto cambia rispetto al riferimento. */
function FamilyDelta({ p, base, t, knowledge }: {
  p: Preset; base: Preset; t: Labels; knowledge: string;
}) {
  const a = familyShares(p);
  const b = familyShares(base);
  return (
    <div className="flex gap-3 flex-wrap text-[11.5px]">
      {FAMILIES.map((f) => {
        if (!a[f.key] && !b[f.key]) return null;
        return (
          <span key={f.key} className="inline-flex items-baseline gap-1">
            <span className="inline-block w-2 h-2 self-center" style={{ background: f.color }} />
            <span className="text-dim">{f.key === "knowledge" ? knowledge : t.fam[f.key]}</span>
            <span>{pc(a[f.key])}</span>
            <span className="text-faint">{pp(a[f.key] - b[f.key])}</span>
          </span>
        );
      })}
    </div>
  );
}

function Row({ p, base, t, knowledge, onEdit, onDuplicate, onDelete }: {
  p: Preset; base: Preset | null; t: Labels; knowledge: string;
  onEdit?: () => void; onDuplicate: () => void; onDelete?: () => void;
}) {
  const isBase = base?.id === p.id;
  const compare = base && !isBase;
  return (
    <div className={`bg-panel border px-3 py-2 mb-[2px] ${
      isBase ? "border-sel-edge" : p.mine ? "border-accent/50" : "border-edge"}`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-semibold text-[13px]">{p.name}</span>
        {p.faction && <span className="text-faint text-[11.5px]">{p.faction}</span>}
        {p.mine && p.installed && !p.stale && <Tag tone="mine">{t.inGame}</Tag>}
        {p.mine && p.stale && <Tag tone="warn">{t.staleTag}</Tag>}
        {p.mine && !p.installed && <Tag>{t.notInGame}</Tag>}
        {isBase && <Tag>{t.reference}</Tag>}
        <span className="ml-auto flex gap-3 text-[12px] items-baseline">
          <span className="text-faint">{p.count} {t.entries} · Σ {p.total}</span>
          <button type="button" onClick={onDuplicate}
            className="text-dim hover:text-ink text-[11.5px] p-0 bg-transparent border-0">
            {t.duplicate}
          </button>
          {onEdit && (
            <button type="button" onClick={onEdit}
              className="text-accent hover:text-ink text-[11.5px] p-0 bg-transparent border-0">
              {t.edit}
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete}
              className="text-bad hover:text-ink text-[11.5px] p-0 bg-transparent border-0">
              {t.remove}
            </button>
          )}
        </span>
      </div>

      {compare ? (
        /* le due barre una sopra l'altra, stessa scala: il confronto si vede
           prima di leggere un numero */
        <div className="mt-1.5 grid grid-cols-[150px_1fr] gap-x-2 gap-y-[3px]
                        items-center text-[11px]">
          <span className="text-dim truncate">{p.name}</span>
          <ShareBar p={p} weightLabel={t.weight} />
          <span className="text-faint truncate">{base.name}</span>
          <div className="opacity-60"><ShareBar p={base} height={8} weightLabel={t.weight} /></div>
        </div>
      ) : (
        <div className="mt-1.5"><ShareBar p={p} weightLabel={t.weight} /></div>
      )}

      {compare && (
        <div className="mt-1.5"><FamilyDelta p={p} base={base} t={t} knowledge={knowledge} /></div>
      )}
      <div className="mt-1.5"><WeightChips p={p} base={compare ? base : null} /></div>
    </div>
  );
}

interface Draft {
  id: string | null;          // null = nuovo
  name: string;
  weights: Record<string, number>;
}

/** Editor dei pesi. La quota si ricalcola a ogni clic, come farà il gioco:
 *  peso della voce diviso la somma dei pesi accesi. */
function Editor({ draft, setDraft, catalog, t, knowledge, busy, onSave, onCancel }: {
  draft: Draft; setDraft: (d: Draft) => void; catalog: Priority[]; t: Labels;
  knowledge: string; busy: boolean; onSave: () => void; onCancel: () => void;
}) {
  const total = Object.values(draft.weights).reduce((a, b) => a + b, 0);
  const preview = useMemo(() => ({
    priorities: catalog.filter((c) => draft.weights[c.id]).map((c) => ({
      ...c, weight: draft.weights[c.id], share: draft.weights[c.id] / total,
    })),
  }), [catalog, draft.weights, total]);

  function setW(id: string, w: number) {
    const weights = { ...draft.weights };
    if (w) weights[id] = w; else delete weights[id];
    setDraft({ ...draft, weights });
  }

  return (
    <div className="bg-panel border border-sel-edge px-3 py-3 mb-3">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <input value={draft.name} placeholder={t.name} autoFocus
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="min-w-[260px]" />
        <span className="text-faint text-[11.5px]">Σ {total}</span>
        <span className="ml-auto flex gap-2">
          <Button tone="primary" onClick={onSave}
            disabled={busy || !draft.name.trim() || !total}>{t.save}</Button>
          <Button onClick={onCancel} disabled={busy}>{t.cancel}</Button>
        </span>
      </div>
      <p className="text-faint text-[11.5px] mb-2">{t.editorHint}</p>
      <div className="mb-2"><ShareBar p={preview} height={18} weightLabel={t.weight} /></div>
      <div className="mb-3"><Legend names={t.fam} knowledge={knowledge} /></div>
      <div className="grid gap-x-4 gap-y-[2px]"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))" }}>
        {catalog.map((c) => {
          const w = draft.weights[c.id] ?? 0;
          return (
            <div key={c.id} className={`flex items-center gap-2 px-1.5 py-[3px] border-l-2 ${
              w ? "bg-sel" : ""}`} style={{ borderColor: COLOR_OF[c.id] }}>
              <GameIcon bundle="icons_2d" icon={c.icon} size={16} />
              <span className={`text-[12px] flex-1 ${w ? "text-ink" : "text-dim"}`}>{c.name}</span>
              <span className="text-[11.5px] text-faint w-[46px] text-right">
                {w ? pc(w / total) : ""}
              </span>
              <span className="flex">
                {[0, 1, 2, 3].map((n) => (
                  <button key={n} type="button" onClick={() => setW(c.id, n)}
                    className={`w-[22px] h-[20px] text-[11px] border border-edge-lit -ml-px p-0
                      ${n !== w ? "bg-control text-dim hover:text-ink"
                        : n ? "bg-accent text-void" : "bg-edge-lit text-ink"}`}>
                    {n || "–"}
                  </button>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PresetsPage() {
  const { t: all } = useSettings();
  const t = all.presets;
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseId, setBaseId] = usePersistentState<string>(
    "presets.base", "", (v): v is string => typeof v === "string");
  const [comparing, setComparing] = usePersistentState<boolean>(
    "presets.compare", false, (v): v is boolean => typeof v === "boolean");

  const load = useCallback(() => {
    api<Status>("/api/presets").then(setSt).catch((e) => setMsg(String(e)));
  }, []);
  useEffect(load, [load]);

  async function call(path: string, method: string, body?: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`${API}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? r.statusText);
      setSt(d.status);
      return d;
    } catch (e) {
      setMsg(String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function act(what: "install" | "restore") {
    if (await call(`/api/presets/${what}`, "POST")) {
      setMsg(what === "install" ? t.done : t.undone);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    const body = { name: draft.name, weights: draft.weights };
    const ok = draft.id
      ? await call(`/api/presets/custom/${encodeURIComponent(draft.id)}`, "PUT", body)
      : await call("/api/presets/custom", "POST", body);
    if (ok) {
      setDraft(null);
      setMsg(t.saved);
    }
  }

  async function remove(p: Preset) {
    if (await call(`/api/presets/custom/${encodeURIComponent(p.id)}`, "DELETE")) {
      setMsg(t.deleted);
    }
  }

  if (!st) return <Empty>{msg ?? all.common.loading}</Empty>;
  if (!st.ok) return <Empty>{st.error}</Empty>;

  const personal = st.pending.filter((p) => p.editable);
  const shipped = st.pending.filter((p) => !p.editable);
  const everything = [...personal, ...shipped, ...st.presets];
  const chosen = everything.find((p) => p.id === baseId) ?? st.presets[0] ?? null;
  const base = comparing ? chosen : null;
  const knowledge = st.priorities.find((p) => p.id === "knowledge")?.name ?? "knowledge";

  // i preset nostri e personali separati da quelli del gioco, anche nella combo
  const options: ComboOption[] = [
    ...personal.map((p) => ({ id: p.id, label: p.name, group: t.personal })),
    ...shipped.map((p) => ({ id: p.id, label: p.name, group: t.ours })),
    ...st.presets.map((p) => ({
      id: p.id, label: p.name, group: t.builtin, hint: p.faction ?? undefined,
    })),
  ];

  const rowProps = (p: Preset) => ({
    p, base, t, knowledge,
    onDuplicate: () => setDraft({ id: null, name: `${p.name} (2)`, weights: { ...p.weights } }),
    onEdit: p.editable
      ? () => setDraft({ id: p.id, name: p.name, weights: { ...p.weights } })
      : undefined,
    onDelete: p.editable ? () => remove(p) : undefined,
  });

  return (
    <>
      <Panel title={t.title}
        right={
          <Guide title={t.title} label={t.guide}>
            <h4>{t.guideWhyTitle}</h4>
            <p>{t.why}</p>
            <h4>{t.guideAchTitle}</h4>
            <p>{t.achievements}</p>
            <h4>{t.guideReadTitle}</h4>
            <p>{t.familiesHint}</p>
            <p>{t.compareHint}</p>
            <h4>{t.guideEditTitle}</h4>
            <p>{t.editorHint}</p>
            <p className="break-all text-faint">{t.file}: {st.path}</p>
          </Guide>
        }>
        <p className="text-warn text-[12px] mb-3">{t.achievementsShort}</p>

        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Button onClick={() => act("install")} tone="primary"
            disabled={busy || !st.writable}>
            {st.installed < st.pending.length ? t.install : t.reinstall}
          </Button>
          <Button onClick={() => act("restore")} tone="danger"
            disabled={busy || (!st.backup && st.installed === 0)}>
            {t.restore}
          </Button>
          {msg && <span className="text-[12px] text-dim">{msg}</span>}
        </div>
        {st.stale > 0 && <p className="text-warn text-[12px] mb-3">{t.staleMsg}</p>}
        {!st.writable && <p className="text-bad text-[12px] mb-3">{t.notWritable}</p>}

        <div className="flex items-center gap-3 flex-wrap mb-4 border-t border-edge pt-3">
          <label className="text-[12px] text-dim flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={comparing} className="p-0"
              onChange={(e) => setComparing(e.target.checked)} />
            {t.compareTo}
          </label>
          <div className={comparing ? "" : "opacity-40 pointer-events-none"}>
            <Combo value={chosen?.id ?? null} onChange={setBaseId} options={options}
              placeholder={all.common.search} />
          </div>
          <span className="ml-auto"><Legend names={t.fam} knowledge={knowledge} /></span>
        </div>

        <div className="flex items-baseline justify-between mb-1.5">
          <h3 className="display text-[12px] uppercase tracking-[.06em] text-dim m-0">
            {t.personal}
          </h3>
          {!draft && (
            <Button onClick={() => setDraft({ id: null, name: "", weights: {} })}>
              {t.newPreset}
            </Button>
          )}
        </div>
        {draft && (
          <Editor draft={draft} setDraft={setDraft} catalog={st.priorities} t={t}
            knowledge={knowledge} busy={busy} onSave={saveDraft}
            onCancel={() => setDraft(null)} />
        )}
        {personal.length === 0 && !draft && (
          <p className="text-faint text-[12px] mb-3">{t.noPersonal}</p>
        )}
        {personal.map((p) => <Row key={p.id} {...rowProps(p)} />)}

        <h3 className="display text-[12px] uppercase tracking-[.06em] text-dim mb-1.5 mt-4">
          {t.ours}
        </h3>
        {shipped.map((p) => <Row key={p.id} {...rowProps(p)} />)}
      </Panel>

      <Panel title={t.builtin} sub={t.builtinHint}>
        {[...st.presets].sort((a, b) => b.research - a.research).map((p) => (
          <Row key={p.id} {...rowProps(p)} />
        ))}
      </Panel>
    </>
  );
}

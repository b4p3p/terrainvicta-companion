"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { usePersistentState } from "@/lib/persist";
import { useSettings } from "@/lib/settings";
import { Button, Empty, GameIcon, Panel, Tag } from "@/components/ui";
import { Combo, type ComboOption } from "@/components/Combo";
import { Guide } from "@/components/Guide";
import { Modal } from "@/components/Modal";
import { CopyPath, GAME_TEMPLATES_DIR } from "@/components/CopyPath";
import {
  COLOR_OF, FAMILIES, Legend, ShareBar, WeightChips, familyShares, pc, pp,
  type Family, type Priority, type Slice,
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
  /** direct: l'API locale scrive nel gioco. download: nel browser, si scarica il file */
  mode: "direct" | "download";
  file: string;
  path: string | null;
  writable: boolean;
  backup: boolean;
  installed: number;
  stale: number;
  priorities: Priority[];
  presets: Preset[];
  pending: Preset[];
  /** preset predefinito della fazione in partita (dataName), se c'è un salvataggio */
  defaultPreset: string | null;
}

type Labels = ReturnType<typeof useSettings>["t"]["presets"];

/** Nel browser: il file completo si scarica e l'utente lo copia nel gioco,
 *  perche' Chrome non scrive sotto Program Files (vedi ROADMAP). */
function DownloadBox({ file, t, onMsg }: { file: string; t: Labels; onMsg: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const d = await api<{ file: string; content: string }>("/api/presets/export");
      const url = URL.createObjectURL(new Blob([d.content], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = d.file;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onMsg(t.dlDone.replace("{file}", d.file));
    } catch (e) {
      onMsg(String(e).replace(/^Error: /, ""));
    } finally {
      setBusy(false);
    }
  };
  const step = (n: number, body: React.ReactNode) => (
    <li className="flex gap-2">
      <span className="display text-accent shrink-0">{n} ·</span>
      <div className="flex-1 min-w-0 space-y-1.5">{body}</div>
    </li>
  );
  return (
    <div className="border border-edge-lit bg-panel p-3 mb-3 max-w-3xl">
      <div className="display text-[12px] uppercase tracking-[.06em] text-dim mb-1">{t.dlTitle}</div>
      <p className="text-[12px] text-dim mb-3">{t.dlWhy}</p>
      <ol className="space-y-2.5 text-[12.5px] list-none">
        {/* prima la cartella aperta, poi il file: si incolla dove si e' gia' */}
        {step(1, <>
          <p className="text-dim">{t.dlStep1}</p>
          <CopyPath path={GAME_TEMPLATES_DIR} />
          <p className="text-faint text-[11.5px]">{t.dlOtherDisk}</p>
        </>)}
        {step(2, <>
          <p className="text-dim">{t.dlStep2}</p>
          <Button tone="primary" onClick={download} disabled={busy}>
            {t.dlButton.replace("{file}", file)}
          </Button>
        </>)}
        {step(3, <p className="text-dim">{t.dlStep3}</p>)}
      </ol>
      <p className="text-warn text-[11.5px] mt-3">{t.dlRedo}</p>
      <p className="text-faint text-[11.5px] mt-1">{t.dlRestore}</p>
    </div>
  );
}

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

function Row({ p, base, t, knowledge, onEdit, onDuplicate, isDefault, known }: {
  p: Preset; base: Preset | null; t: Labels; knowledge: string;
  onEdit?: () => void; onDuplicate: () => void; isDefault: boolean;
  /** sappiamo cosa c'e' nel gioco? No dal browser, che non legge il template */
  known: boolean;
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
        {known && p.mine && !p.installed && <Tag>{t.notInGame}</Tag>}
        {isBase && <Tag>{t.reference}</Tag>}
        {isDefault && <span title={t.defaultHint}><Tag tone="free">{t.defaultTag}</Tag></span>}
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
        </span>
      </div>

      {base ? (
        /* col confronto acceso tutte le righe usano la stessa griglia, anche
           quella del riferimento: così le barre partono tutte dallo stesso
           punto e si confrontano a colpo d'occhio, a pari scala */
        <div className="mt-1.5 grid grid-cols-[150px_1fr] gap-x-2 gap-y-[3px]
                        items-center text-[11px]">
          <span className="text-dim truncate">{p.name}</span>
          <ShareBar p={p} weightLabel={t.weight} />
          {compare && (
            <>
              <span className="text-faint truncate">{base.name}</span>
              <div className="opacity-60"><ShareBar p={base} height={8} weightLabel={t.weight} /></div>
            </>
          )}
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
function Editor({ draft, setDraft, catalog, t, knowledge }: {
  draft: Draft; setDraft: (d: Draft) => void; catalog: Priority[]; t: Labels;
  knowledge: string;
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
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <input value={draft.name} placeholder={t.name} autoFocus
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="min-w-[300px] flex-1 text-[13px]" />
        <span className="text-faint text-[11.5px]">Σ {total}</span>
      </div>
      <p className="text-faint text-[11.5px] mb-2">{t.editorHint}</p>
      <div className="mb-2"><ShareBar p={preview} height={18} weightLabel={t.weight} /></div>
      <div className="mb-3"><Legend names={t.fam} knowledge={knowledge} /></div>
      {/* per famiglia, in tre colonne di altezza simile: 6 · 6 · 8 voci */}
      <div className="grid gap-x-5 gap-y-3 grid-cols-[repeat(auto-fit,minmax(290px,1fr))]">
        {([["knowledge", "civil"], ["space", "power"], ["military"]] as Family[][]).map((col) => (
          <div key={col.join()} className="flex flex-col gap-3">
            {col.map((fk) => {
              const fam = FAMILIES.find((f) => f.key === fk)!;
              const items = catalog.filter((c) => fam.members.includes(c.id));
              const share = items.reduce((a, c) => a + (draft.weights[c.id] ?? 0), 0) / (total || 1);
              return (
                <div key={fk}>
                  <div className="flex items-baseline justify-between mb-1 border-b border-edge pb-0.5">
                    <span className="display text-[11px] uppercase tracking-[.06em] text-dim
                                     inline-flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2" style={{ background: fam.color }} />
                      {fk === "knowledge" ? knowledge : t.fam[fk]}
                    </span>
                    <span className="text-faint text-[11px]">{share ? pc(share) : ""}</span>
                  </div>
                  <div className="flex flex-col gap-[2px]">
                    {items.map((c) => {
                      const w = draft.weights[c.id] ?? 0;
                      return (
                        <div key={c.id} className={`flex items-center gap-2 px-1.5 py-[3px] border-l-2 ${
                          w ? "bg-sel" : ""}`} style={{ borderColor: COLOR_OF[c.id] }}>
                          <GameIcon bundle="icons_2d" icon={c.icon} size={16} />
                          <span className={`text-[12px] flex-1 truncate ${w ? "text-ink" : "text-dim"}`}>
                            {c.name}
                          </span>
                          <span className="text-[11.5px] text-faint w-[42px] text-right">
                            {w ? pc(w / total) : ""}
                          </span>
                          <span className="flex">
                            {[0, 1, 2, 3].map((n) => (
                              <button key={n} type="button" onClick={() => setW(c.id, n)}
                                aria-pressed={n === w}
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
            })}
          </div>
        ))}
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
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
      const d = await api<{ status: Status; install?: { ok: boolean; error: string | null } | null }>(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      setSt(d.status);
      return d;
    } catch (e) {
      const text = String(e).replace(/^Error: /, "");
      setMsg(text);
      setModalErr(text);
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

  function openDraft(d: Draft) {
    setDraft(d);
    setModalErr(null);
    setConfirmDelete(false);
  }

  /** Salva e, se il template è scrivibile, scrive subito nel gioco: dalla
   *  modale si esce con il preset pronto, manca solo riavviare Terra Invicta. */
  async function saveDraft() {
    if (!draft || !st) return;
    const body = { name: draft.name, weights: draft.weights };
    const q = st.writable ? "?install=true" : "";
    const d = draft.id
      ? await call(`/api/presets/custom/${encodeURIComponent(draft.id)}${q}`, "PUT", body)
      : await call(`/api/presets/custom${q}`, "POST", body);
    if (!d) return;                 // l'errore l'ha già messo call() nella modale
    setDraft(null);
    setMsg(st.mode === "download" ? t.dlAfterSave
      : d.install?.ok ? t.savedRestart
      : d.install ? `${t.savedNotInstalled} ${d.install.error}` : t.saved);
  }

  async function removeDraft() {
    if (!draft?.id) return;
    const d = await call(`/api/presets/custom/${encodeURIComponent(draft.id)}`, "DELETE");
    if (!d) return;
    setDraft(null);
    setMsg(t.deleted);
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
    isDefault: p.id === st.defaultPreset,
    known: st.mode !== "download",
    onDuplicate: () => openDraft({ id: null, name: `${p.name} (2)`, weights: { ...p.weights } }),
    onEdit: p.editable
      ? () => openDraft({ id: p.id, name: p.name, weights: { ...p.weights } })
      : undefined,
  });
  const draftTotal = draft ? Object.values(draft.weights).reduce((a, b) => a + b, 0) : 0;
  const draftIsDefault = !!draft?.id && draft.id === st.defaultPreset;

  return (
    <>
      <Panel title={t.title}
        right={
          <Guide title={t.title} sections={[
            { title: t.guideWhyTitle, body: [t.why] },
            { title: t.guideAchTitle, body: [t.achievements] },
            { title: t.guideReadTitle, body: [t.familiesHint, t.compareHint] },
            { title: t.guideEditTitle, body: [
              t.editorHint,
              <span key="f" className="break-all text-faint">{t.file}: {st.path ?? `${GAME_TEMPLATES_DIR}\\${st.file}`}</span>,
            ] },
          ]} />
        }>
        <p className="text-warn text-[12px] mb-3">{t.achievementsShort}</p>

        {st.mode === "download" ? <>
          <DownloadBox file={st.file} t={t} onMsg={setMsg} />
          {msg && <p className="text-[12px] text-dim mb-3">{msg}</p>}
        </> : <>
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
        </>}

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
          <Button onClick={() => openDraft({ id: null, name: "", weights: {} })}>
            {t.newPreset}
          </Button>
        </div>
        <Modal open={!!draft} onClose={() => !busy && setDraft(null)} width={1000}
          title={draft?.id ? `${t.edit} · ${draft.name || "…"}` : t.newPreset}
          footer={draft && (
            <div className="flex items-center gap-3 flex-wrap">
              {draft.id && (
                draftIsDefault
                  ? <span className="text-faint text-[11.5px]">{t.cantDeleteDefault}</span>
                  : confirmDelete
                    ? <Button tone="danger" onClick={removeDraft} disabled={busy}>{t.confirmDelete}</Button>
                    : <Button onClick={() => setConfirmDelete(true)} disabled={busy}>{t.remove}</Button>
              )}
              <p className="text-warn text-[11.5px] m-0 flex-1 min-w-[260px]">
                {st.mode === "download" ? t.dlSaveNote
                  : st.writable ? t.restartWarning : t.notWritable}
              </p>
              <Button onClick={() => setDraft(null)} disabled={busy}>{t.cancel}</Button>
              <Button tone="primary" onClick={saveDraft}
                disabled={busy || !draft.name.trim() || !draftTotal}>
                {st.writable ? t.saveAndWrite : t.save}
              </Button>
            </div>
          )}>
          {draft && (
            <>
              {modalErr && <p className="text-bad text-[12px] mb-2">{modalErr}</p>}
              <Editor draft={draft} setDraft={setDraft} catalog={st.priorities} t={t}
                knowledge={knowledge} />
            </>
          )}
        </Modal>
        {personal.length === 0 && (
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

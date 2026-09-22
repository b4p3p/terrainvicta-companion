"use client";

import { useState } from "react";
import { api, useApi, useSnapshot } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { Button, Empty, Panel, Tag, nf } from "@/components/ui";
import type { Goal, Note } from "@/lib/types";

export default function PlanPage() {
  const { t, game, live } = useSettings();
  const { data: snap } = useSnapshot(live.version, game);
  const { data: goals, reload: reloadGoals } = useApi<Goal[]>("/api/goals", [live.version]);
  const { data: notes, reload: reloadNotes } = useApi<Note[]>("/api/notes", [live.version]);

  const [form, setForm] = useState({
    title: "", kind: "free", target: "", amount: "", due: "",
  });
  const [note, setNote] = useState({ subject: "general", body: "" });

  const addGoal = async () => {
    if (!form.title.trim()) return;
    await api("/api/goals", {
      method: "POST",
      body: JSON.stringify({
        title: form.title,
        kind: form.kind,
        target: form.target || null,
        amount: form.amount ? Number(form.amount) : null,
        due: form.due || null,
      }),
    });
    setForm({ title: "", kind: "free", target: "", amount: "", due: "" });
    reloadGoals();
  };

  const addNote = async () => {
    if (!note.body.trim()) return;
    await api("/api/notes", { method: "POST", body: JSON.stringify(note) });
    setNote({ subject: note.subject, body: "" });
    reloadNotes();
  };

  const subjects = [
    { id: "general", label: t.plan.general },
    ...(snap?.nations.filter((n) => n.myCP > 0)
      .map((n) => ({ id: `nation:${n.name}`, label: n.name })) ?? []),
    ...(snap?.council.team.map((c) => ({ id: `councilor:${c.name}`, label: c.name })) ?? []),
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-2 items-start">
      <div>
        <Panel title={t.plan.goals}>
          {!goals?.length ? <Empty>{t.plan.noGoals}</Empty> : (
            <div className="flex flex-col gap-2 mb-4">
              {goals.map((gl) => {
                const hasBar = gl.current != null && gl.total;
                const pctDone = hasBar ? Math.min((gl.current! / gl.total!) * 100, 100) : 0;
                return (
                  <div key={gl.id}
                    className={`bg-panel border rounded-md px-3 py-2
                      ${gl.done ? "border-edge opacity-60" : gl.late ? "border-bad/50" : "border-edge"}`}>
                    <div className="flex justify-between items-baseline gap-2">
                      <span className={gl.done ? "line-through text-dim" : "font-semibold text-[13.5px]"}>
                        {gl.title}
                      </span>
                      <span className="flex gap-1.5 items-center">
                        {gl.late && <Tag tone="bad">{t.plan.late}</Tag>}
                        {gl.due && <span className="text-dim text-[11.5px]">{gl.due}</span>}
                      </span>
                    </div>
                    {hasBar && (
                      <>
                        <div className="h-1.5 bg-line rounded-full my-1.5 overflow-hidden">
                          <div className="h-full rounded-full"
                            style={{ width: `${pctDone}%`, background: "var(--good)" }} />
                        </div>
                        <div className="text-[11.5px] text-dim">
                          {t.plan.progress}: {nf(gl.current, 0)} / {nf(gl.total, 0)}
                        </div>
                      </>
                    )}
                    <div className="flex gap-2 mt-2">
                      <button onClick={async () => {
                        await api(`/api/goals/${gl.id}/done?done=${!gl.done}`, { method: "POST" });
                        reloadGoals();
                      }} className="text-[11.5px] text-accent cursor-pointer hover:underline">
                        {gl.done ? "↺" : "✓"} {t.common.done}
                      </button>
                      <button onClick={async () => {
                        await api(`/api/goals/${gl.id}`, { method: "DELETE" });
                        reloadGoals();
                      }} className="text-[11.5px] text-dim cursor-pointer hover:text-bad">
                        {t.common.delete}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="border-t border-edge pt-3 flex flex-col gap-2">
            <div className="text-dim text-[12px]">{t.plan.newGoal}</div>
            <input placeholder={t.plan.goalTitle} value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="flex gap-2 flex-wrap">
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {(Object.keys(t.plan.kinds) as (keyof typeof t.plan.kinds)[]).map((k) => (
                  <option key={k} value={k}>{t.plan.kinds[k]}</option>
                ))}
              </select>
              {form.kind === "controlNation" && (
                <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
                  <option value="">{t.plan.target}…</option>
                  {snap?.nations.filter((n) => n.cp).sort((a, b) => b.gdp - a.gdp).slice(0, 60)
                    .map((n) => <option key={n.name} value={n.name}>{n.name}</option>)}
                </select>
              )}
              {form.kind === "project" && (
                <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
                  <option value="">{t.plan.target}…</option>
                  {snap?.projects.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {form.kind === "resource" && (
                <>
                  <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
                    <option value="">{t.plan.target}…</option>
                    {["Money", "Influence", "Operations"].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input type="number" placeholder={t.plan.amount} value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-28" />
                </>
              )}
              <input placeholder={t.plan.due} value={form.due}
                onChange={(e) => setForm({ ...form, due: e.target.value })}
                className="w-36" />
              <Button tone="primary" onClick={addGoal}>{t.common.add}</Button>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title={t.plan.notes}>
        {!notes?.length ? <Empty>{t.plan.noNotes}</Empty> : (
          <div className="flex flex-col gap-2 mb-4">
            {notes.map((n) => (
              <div key={n.id} className="bg-panel border border-edge rounded-md px-3 py-2">
                <div className="flex justify-between items-baseline">
                  <Tag>{subjects.find((s) => s.id === n.subject)?.label ?? n.subject}</Tag>
                  <button onClick={async () => {
                    await api(`/api/notes/${n.id}`, { method: "DELETE" });
                    reloadNotes();
                  }} className="text-[11.5px] text-dim cursor-pointer hover:text-bad">
                    {t.common.delete}
                  </button>
                </div>
                <p className="text-[12.5px] mt-1 mb-0 whitespace-pre-wrap">{n.body}</p>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-edge pt-3 flex flex-col gap-2">
          <div className="text-dim text-[12px]">{t.plan.newNote}</div>
          <select value={note.subject} onChange={(e) => setNote({ ...note, subject: e.target.value })}>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <textarea rows={3} value={note.body}
            onChange={(e) => setNote({ ...note, body: e.target.value })} />
          <div><Button tone="primary" onClick={addNote}>{t.common.add}</Button></div>
        </div>
      </Panel>
    </div>
  );
}

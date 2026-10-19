"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ru } from "@/lib/content/ru";
import type { MapStep, ProcessMapJson } from "@/lib/schemas/map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";

// ============================================================
// Канвас карты процесса: стадии — swimlane-контейнеры,
// шаги — ноды с бейджами actor/system/risk, edges — переходы.
// ============================================================

type StepNodeData = { step: MapStep; commentCount: number; [key: string]: unknown };
type StageNodeData = { label: string; [key: string]: unknown };

export interface CommentRow {
  id: string;
  nodeId: string;
  body: string;
  parentId: string | null;
  resolved: boolean;
  createdAt: string;
  authorName: string;
}

const COLS = 3;
const STEP_W = 290;
const STEP_H = 110;
const GAP_X = 24;
const GAP_Y = 20;
const STAGE_PAD = 40;
const STAGE_TITLE_H = 36;
const STAGE_W = COLS * STEP_W + (COLS - 1) * GAP_X + STAGE_PAD * 2;

function stageHeight(steps: number): number {
  const rows = Math.max(1, Math.ceil(steps / COLS));
  return rows * (STEP_H + GAP_Y) + STAGE_PAD * 2 - GAP_Y + STAGE_TITLE_H;
}

function layout(json: ProcessMapJson, commentCounts: Map<string, number>): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let y = 0;
  const stepIdByName = new Map<string, string>();
  for (const stage of json.stages) {
    for (const s of stage.steps) stepIdByName.set(s.name, s.id);
  }

  for (const stage of json.stages) {
    nodes.push({
      id: stage.id,
      type: "stage",
      position: { x: 0, y },
      data: { label: stage.name },
      style: { width: STAGE_W, height: stageHeight(stage.steps.length) },
      draggable: true,
      selectable: false,
    });
    stage.steps.forEach((step, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      nodes.push({
        id: step.id,
        type: "step",
        parentId: stage.id,
        extent: "parent",
        position: { x: STAGE_PAD + col * (STEP_W + GAP_X), y: STAGE_PAD + STAGE_TITLE_H + row * (STEP_H + GAP_Y) },
        data: { step, commentCount: commentCounts.get(step.id) ?? 0 },
        style: { width: STEP_W },
      });
    });
    y += stageHeight(stage.steps.length) + 60;
  }

  // Линейные переходы: последовательные шаги внутри и между стадиями
  const allSteps = json.stages.flatMap((s) => s.steps);
  for (let i = 0; i + 1 < allSteps.length; i++) {
    edges.push({
      id: `e-${allSteps[i].id}-${allSteps[i + 1].id}`,
      source: allSteps[i].id,
      target: allSteps[i + 1].id,
      animated: true,
    });
  }
  // Переходы по условиям (decisions)
  for (const step of allSteps) {
    for (const d of step.decisions) {
      const target = stepIdByName.get(d.to);
      if (target && target !== step.id) {
        edges.push({
          id: `d-${step.id}-${target}-${d.condition.slice(0, 12)}`,
          source: step.id,
          target,
          label: d.condition,
          labelStyle: { fontSize: 10 },
          style: { strokeDasharray: "6 4", stroke: "#f59e0b" },
        });
      }
    }
  }
  return { nodes, edges };
}

function StageNode({ data }: NodeProps<Node<StageNodeData, "stage">>) {
  return (
    <div className="h-full w-full rounded-xl border-2 border-indigo-200 bg-indigo-50/50">
      <div className="border-b border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-800">{data.label}</div>
    </div>
  );
}

function StepNode({ data, selected }: NodeProps<Node<StepNodeData, "step">>) {
  const { step, commentCount } = data;
  return (
    <div
      className={`h-full w-full rounded-lg border-2 bg-white p-2.5 shadow-sm transition-colors ${
        selected ? "border-indigo-500" : "border-zinc-200"
      }`}
    >
      <div className="truncate text-sm font-medium" title={step.name}>
        {step.name}
      </div>
      <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
        {step.actor && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">👤 {step.actor}</span>}
        {step.system && <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700">🖥 {step.system}</span>}
        {step.risks.length > 0 && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">⚠ {step.risks.length}</span>
        )}
        {step.citations.length === 0 && (
          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-700">⚠ {ru.map.noCitationWarning}</span>
        )}
        {commentCount > 0 && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">💬 {commentCount}</span>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { stage: StageNode, step: StepNode };

export function ProcessCanvas({
  projectId,
  mapId,
  initialJson,
  sourceNames,
  initialComments,
}: {
  projectId: string;
  mapId: string;
  initialJson: ProcessMapJson;
  sourceNames: Record<string, string>;
  initialComments: CommentRow[];
}) {
  const router = useRouter();
  const [json, setJson] = useState<ProcessMapJson>(initialJson);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentRow[]>(initialComments);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [followUpMsg, setFollowUpMsg] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [layoutTick, setLayoutTick] = useState(0);

  const commentCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comments) m.set(c.nodeId, (m.get(c.nodeId) ?? 0) + 1);
    return m;
  }, [comments]);

  const layouted = useMemo(() => layout(json, commentCounts), [json, commentCounts, layoutTick]);
  const [nodes, setNodes, onNodesChange] = useNodesState(layouted.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layouted.edges);

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutTick]);

  const selectedStep = useMemo(() => {
    for (const stage of json.stages) {
      const found = stage.steps.find((s) => s.id === selectedId);
      if (found) return found;
    }
    return null;
  }, [json, selectedId]);

  const updateStep = (stepId: string, patch: Partial<MapStep>) => {
    setJson((prev) => ({
      ...prev,
      stages: prev.stages.map((st) => ({
        ...st,
        steps: st.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
      })),
    }));
  };

  const addStep = () => {
    const stage = json.stages[json.stages.length - 1];
    if (!stage) return;
    const id = `step-${Date.now()}`;
    setJson((prev) => ({
      ...prev,
      stages: prev.stages.map((st) =>
        st.id === stage.id
          ? { ...st, steps: [...st.steps, { id, name: "Новый шаг", actor: "", system: "", decisions: [], risks: [], citations: [] }] }
          : st,
      ),
    }));
    setLayoutTick((t) => t + 1);
    setSelectedId(id);
  };

  const deleteStep = (stepId: string) => {
    if (!confirm("Удалить шаг из карты?")) return;
    setJson((prev) => ({
      ...prev,
      stages: prev.stages.map((st) => ({ ...st, steps: st.steps.filter((s) => s.id !== stepId) })),
    }));
    setSelectedId(null);
    setLayoutTick((t) => t + 1);
  };

  const save = async () => {
    setSaveMsg(null);
    const res = await fetch(`/api/projects/${projectId}/map/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json }),
    });
    if (res.ok) {
      setSaveMsg(ru.canvas.saved);
      router.refresh();
    } else {
      setSaveMsg(ru.errors.generic);
    }
  };

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/maps/${mapId}/comments`);
    if (res.ok) {
      const data = (await res.json()) as { comments: CommentRow[] };
      setComments(data.comments);
    }
  }, [mapId]);

  const sendComment = async () => {
    if (!selectedId || !commentText.trim()) return;
    const res = await fetch(`/api/maps/${mapId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: selectedId, body: commentText.trim(), parentId: replyTo ?? undefined }),
    });
    if (res.ok) {
      setCommentText("");
      setReplyTo(null);
      await loadComments();
    }
  };

  const resolveComment = async (id: string) => {
    await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: true }),
    });
    await loadComments();
  };

  const toFollowUp = async (id: string, body: string) => {
    const res = await fetch(`/api/comments/${id}/to-followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setFollowUpMsg(res.ok ? `${ru.canvas.followUpCreated}: «${body.slice(0, 60)}»` : ru.errors.generic);
    setTimeout(() => setFollowUpMsg(null), 4000);
  };

  const stepComments = comments.filter((c) => c.nodeId === selectedId);
  const roots = stepComments.filter((c) => !c.parentId);

  const checklist = { goal: json.goal ?? "", owner: json.owner ?? "", kpi: json.kpi ?? "", endState: json.endState ?? "" };
  const risksFilled = json.stages.some((s) => s.steps.some((st) => st.risks.length > 0));
  const checklistDone = [checklist.goal, checklist.owner, checklist.kpi, checklist.endState].filter(Boolean).length + (risksFilled ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void save()}>{ru.canvas.save}</Button>
        <Button size="sm" variant="outline" onClick={addStep}>+ {ru.canvas.addStep}</Button>
        <Button size="sm" variant="ghost" onClick={() => setLayoutTick((t) => t + 1)}>{ru.canvas.autoLayout}</Button>
        <Button size="sm" variant="ghost" onClick={() => setChecklistOpen(!checklistOpen)}>
          {ru.canvas.checklist} · {checklistDone}/5
        </Button>
        {saveMsg && <span className="text-sm text-emerald-600">{saveMsg}</span>}
      </div>

      {checklistOpen && (
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{ru.canvas.checklistGoal}</Label>
              <Input value={checklist.goal} onChange={(e) => setJson((p) => ({ ...p, goal: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{ru.canvas.checklistOwner}</Label>
              <Input value={checklist.owner} onChange={(e) => setJson((p) => ({ ...p, owner: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{ru.canvas.checklistKpi}</Label>
              <Input value={checklist.kpi} onChange={(e) => setJson((p) => ({ ...p, kpi: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{ru.canvas.checklistEndState}</Label>
              <Input value={checklist.endState} onChange={(e) => setJson((p) => ({ ...p, endState: e.target.value }))} />
            </div>
            <div className="text-sm text-zinc-500">
              {ru.canvas.checklistRisks}: {risksFilled ? "✓" : "—"}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="h-[65vh] rounded-xl border border-zinc-200 bg-white">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => node.type === "step" && setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            minZoom={0.2}
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={20} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        {/* Инспектор */}
        <div className="thin-scroll max-h-[65vh] space-y-3 overflow-y-auto">
          {!selectedStep && (
            <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400">
              {ru.canvas.noSelection}
            </p>
          )}
          {selectedStep && (
            <>
              <Card>
                <CardContent className="space-y-3 p-4">
                  <h3 className="font-semibold">{ru.canvas.inspector}</h3>
                  <div className="space-y-1">
                    <Label>{ru.canvas.stepName}</Label>
                    <Input value={selectedStep.name} onChange={(e) => updateStep(selectedStep.id, { name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>{ru.canvas.stepActor}</Label>
                    <Input value={selectedStep.actor} onChange={(e) => updateStep(selectedStep.id, { actor: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>{ru.canvas.stepSystem}</Label>
                    <Input value={selectedStep.system} onChange={(e) => updateStep(selectedStep.id, { system: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>{ru.canvas.stepTrigger}</Label>
                    <Input
                      value={selectedStep.trigger ?? ""}
                      onChange={(e) => updateStep(selectedStep.id, { trigger: e.target.value })}
                    />
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteStep(selectedStep.id)}>
                    {ru.canvas.deleteStep}
                  </Button>
                </CardContent>
              </Card>

              {selectedStep.citations.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="mb-2 text-sm font-semibold">{ru.canvas.citations}</h3>
                    <ul className="space-y-1 text-xs text-zinc-600">
                      {selectedStep.citations.map((c, i) => (
                        <li key={i} className="rounded bg-zinc-50 px-2 py-1">
                          «{sourceNames[c.sourceId] ?? "?"}» — {c.ref}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {selectedStep.risks.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="mb-2 text-sm font-semibold">{ru.canvas.risks}</h3>
                    <ul className="space-y-1 text-xs text-amber-700">
                      {selectedStep.risks.map((r, i) => (
                        <li key={i}>
                          {r.severity}/{r.likelihood}: {r.mitigation}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="space-y-3 p-4">
                  <h3 className="text-sm font-semibold">
                    {ru.canvas.comments} ({stepComments.length})
                  </h3>
                  {followUpMsg && <p className="text-xs text-emerald-600">{followUpMsg}</p>}
                  <div className="space-y-2">
                    {roots.map((c) => {
                      const replies = comments.filter((r) => r.parentId === c.id);
                      return (
                        <div key={c.id} className={`rounded-lg border p-2 text-sm ${c.resolved ? "border-zinc-200 bg-zinc-50 text-zinc-400" : "border-zinc-200"}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-xs font-medium text-indigo-600">{c.authorName}</span>
                              <p>{c.body}</p>
                            </div>
                            <div className="flex shrink-0 flex-col gap-1">
                              <button className="text-xs text-indigo-600 hover:underline cursor-pointer" onClick={() => setReplyTo(c.id)}>
                                {ru.canvas.commentReply}
                              </button>
                              {!c.resolved ? (
                                <button className="text-xs text-emerald-600 hover:underline cursor-pointer" onClick={() => void resolveComment(c.id)}>
                                  {ru.canvas.commentResolve}
                                </button>
                              ) : (
                                <span className="text-xs">{ru.canvas.commentResolved}</span>
                              )}
                              <button className="text-xs text-amber-600 hover:underline cursor-pointer" onClick={() => void toFollowUp(c.id, c.body)}>
                                {ru.canvas.toFollowUp}
                              </button>
                            </div>
                          </div>
                          {replies.map((r) => (
                            <div key={r.id} className="mt-2 ml-4 border-l-2 border-zinc-200 pl-2">
                              <span className="text-xs font-medium text-indigo-600">{r.authorName}</span>
                              <p>{r.body}</p>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    {stepComments.length === 0 && <p className="text-sm text-zinc-400">{ru.common.empty}</p>}
                  </div>
                  <Textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={ru.canvas.commentPlaceholder}
                  />
                  {replyTo && (
                    <p className="text-xs text-zinc-400">
                      → {ru.canvas.commentReply.toLowerCase()} ·{" "}
                      <button className="text-indigo-600 hover:underline cursor-pointer" onClick={() => setReplyTo(null)}>
                        {ru.common.cancel}
                      </button>
                    </p>
                  )}
                  <Button size="sm" onClick={() => void sendComment()} disabled={!commentText.trim()}>
                    {ru.canvas.commentSend}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

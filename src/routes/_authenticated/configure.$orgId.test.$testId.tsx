import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import type { Test, TestLevel, Question, QuestionRubric, Objective, ObjectiveCriterion, LevelMode } from "@/lib/types";
import { DEFAULT_INTRO, DEFAULT_CLOSING } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/configure/$orgId/test/$testId")({
  head: () => ({ meta: [{ title: "Test builder — SGT" }] }),
  component: TestBuilder,
});

const inputClass =
  "w-full rounded-[10px] border border-border bg-elevated px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

function TestBuilder() {
  const { orgId, testId } = Route.useParams();
  const [test, setTest] = useState<Test | null>(null);
  const [levels, setLevels] = useState<TestLevel[]>([]);

  const load = useCallback(async () => {
    const [{ data: t }, { data: l }] = await Promise.all([
      supabase.from("tests").select("*").eq("id", testId).maybeSingle(),
      supabase.from("test_levels").select("*").eq("test_id", testId).order("order_index"),
    ]);
    setTest(t as Test | null);
    setLevels((l as TestLevel[] | null) ?? []);
  }, [testId]);

  useEffect(() => { void load(); }, [load]);

  async function saveTest() {
    if (!test) return;
    const { error } = await supabase.from("tests").update({
      name: test.name,
      purpose: test.purpose,
      max_attempts: test.max_attempts,
      attempts_context_note: test.attempts_context_note,
      intro_message: test.intro_message,
      closing_message: test.closing_message,
      intro_mode: test.intro_mode,
      closing_mode: test.closing_mode,
      proctoring_enabled: test.proctoring_enabled,
    }).eq("id", test.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Test saved");
  }

  async function addLevel() {
    if (!test) return;
    const { error } = await supabase.from("test_levels").insert({
      test_id: test.id,
      order_index: levels.length,
      name: `Level ${levels.length + 1}`,
      mode: "fixed",
    });
    if (error) { toast.error(error.message); return; }
    load();
  }

  if (!test) {
    return <AppShell><div className="mx-auto max-w-5xl px-6 py-12 text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link to="/configure/$orgId" params={{ orgId }} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to organisation
        </Link>

        <div className="mt-6 surface-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">Test settings</h1>
            <button onClick={saveTest} className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Save className="h-4 w-4" /> Save
            </button>
          </div>
          <input className={inputClass} placeholder="Test name" value={test.name} onChange={(e) => setTest({ ...test, name: e.target.value })} />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="label-mono">Purpose</span>
              <select className={`${inputClass} mt-2`} value={test.purpose} onChange={(e) => setTest({ ...test, purpose: e.target.value as "preparation" | "assessment" })}>
                <option value="assessment">Assessment</option>
                <option value="preparation">Preparation (with live feedback)</option>
              </select>
            </label>
            <label className="block">
              <span className="label-mono">Max attempts permitted</span>
              <input type="number" min={1} max={10} className={`${inputClass} mt-2`} value={test.max_attempts} onChange={(e) => setTest({ ...test, max_attempts: Number(e.target.value) })} />
            </label>
          </div>
          <label className="block">
            <span className="label-mono">Note about previous attempts (shown to candidate)</span>
            <textarea rows={2} className={`${inputClass} mt-2`} placeholder="e.g. We retain the context of your earlier attempts — your report will identify inconsistencies across attempts and follow-up questions may reference earlier answers." value={test.attempts_context_note ?? ""} onChange={(e) => setTest({ ...test, attempts_context_note: e.target.value })} />
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="label-mono">Intro message</span>
              <select className="rounded-[8px] border border-border bg-elevated px-2 py-1 text-xs" value={test.intro_mode} onChange={async (e) => { const next = e.target.value as "literal" | "prompt"; setTest({ ...test, intro_mode: next }); await supabase.from("tests").update({ intro_mode: next }).eq("id", test.id); }}>
                <option value="literal">Use as-is</option>
                <option value="prompt">Use as prompt for AI</option>
              </select>
            </div>
            <textarea rows={3} className={inputClass} placeholder={test.intro_mode === "prompt" ? "e.g. Welcome the candidate warmly, mention the MSc Data Science programme, and remind them that proctoring is active." : DEFAULT_INTRO.slice(0, 120) + "…"} value={test.intro_message ?? ""} onChange={(e) => setTest({ ...test, intro_message: e.target.value })} onBlur={async (e) => { await supabase.from("tests").update({ intro_message: e.target.value }).eq("id", test.id); }} />
            <p className="text-xs text-muted-foreground">{test.intro_mode === "prompt" ? "AI will generate the spoken intro from this brief at interview start." : "Text above is spoken verbatim by Alex."} Auto-saves on blur.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="label-mono">Closing message</span>
              <select className="rounded-[8px] border border-border bg-elevated px-2 py-1 text-xs" value={test.closing_mode} onChange={async (e) => { const next = e.target.value as "literal" | "prompt"; setTest({ ...test, closing_mode: next }); await supabase.from("tests").update({ closing_mode: next }).eq("id", test.id); }}>
                <option value="literal">Use as-is</option>
                <option value="prompt">Use as prompt for AI</option>
              </select>
            </div>
            <textarea rows={3} className={inputClass} placeholder={test.closing_mode === "prompt" ? "e.g. Thank the candidate, say the admissions team will be in touch within 7 days, wish them well." : DEFAULT_CLOSING.slice(0, 120) + "…"} value={test.closing_message ?? ""} onChange={(e) => setTest({ ...test, closing_message: e.target.value })} onBlur={async (e) => { await supabase.from("tests").update({ closing_message: e.target.value }).eq("id", test.id); }} />
            <p className="text-xs text-muted-foreground">{test.closing_mode === "prompt" ? "AI will generate the spoken closing from this brief at interview start." : "Text above is spoken verbatim by Alex."} Auto-saves on blur.</p>
          </div>
          <label className="flex items-center justify-between rounded-[10px] border border-border bg-elevated px-4 py-3">
            <div>
              <p className="text-sm font-medium">Proctoring</p>
              <p className="text-xs text-muted-foreground">Tab switch and second-display detection. Warn once, suspend on second violation.</p>
            </div>
            <input type="checkbox" checked={test.proctoring_enabled} onChange={(e) => setTest({ ...test, proctoring_enabled: e.target.checked })} />
          </label>
        </div>

        {/* Levels */}
        <div className="mt-10 flex items-end justify-between">
          <div>
            <p className="label-mono">Structure</p>
            <h2 className="mt-1 text-xl font-semibold">Levels</h2>
          </div>
          <button onClick={addLevel} className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Add level
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {levels.length === 0 ? (
            <div className="surface-card p-8 text-center text-sm text-muted-foreground">No levels yet. A test must have at least one level.</div>
          ) : (
            levels.map((lvl) => <LevelEditor key={lvl.id} level={lvl} onChanged={load} />)
          )}
        </div>
      </div>
    </AppShell>
  );
}

function LevelEditor({ level, onChanged }: { level: TestLevel; onChanged: () => void }) {
  const [name, setName] = useState(level.name);
  const [mode, setMode] = useState<LevelMode>(level.mode);
  const [budget, setBudget] = useState(level.ai_question_budget);
  const [questions, setQuestions] = useState<(Question & { rubrics: QuestionRubric[] })[]>([]);
  const [objectives, setObjectives] = useState<(Objective & { criteria: ObjectiveCriterion[] })[]>([]);

  const loadChildren = useCallback(async () => {
    if (mode === "reasoning") {
      const { data: objs } = await supabase.from("objectives").select("*").eq("level_id", level.id).order("order_index");
      const objArr = (objs as Objective[] | null) ?? [];
      const { data: crit } = await supabase.from("objective_criteria").select("*").in("objective_id", objArr.map((o) => o.id).length ? objArr.map((o) => o.id) : ["00000000-0000-0000-0000-000000000000"]).order("order_index");
      const critArr = (crit as ObjectiveCriterion[] | null) ?? [];
      setObjectives(objArr.map((o) => ({ ...o, criteria: critArr.filter((c) => c.objective_id === o.id) })));
    } else {
      const { data: qs } = await supabase.from("questions").select("*").eq("level_id", level.id).order("order_index");
      const qArr = (qs as Question[] | null) ?? [];
      const { data: rs } = await supabase.from("question_rubrics").select("*").in("question_id", qArr.map((q) => q.id).length ? qArr.map((q) => q.id) : ["00000000-0000-0000-0000-000000000000"]).order("order_index");
      const rArr = (rs as QuestionRubric[] | null) ?? [];
      setQuestions(qArr.map((q) => ({ ...q, rubrics: rArr.filter((r) => r.question_id === q.id) })));
    }
  }, [level.id, mode]);

  useEffect(() => { void loadChildren(); }, [loadChildren]);

  // Auto-persist mode/budget changes so users can't forget to click "Save level".
  async function changeMode(next: LevelMode) {
    setMode(next);
    const { error } = await supabase.from("test_levels").update({ mode: next }).eq("id", level.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Mode set to ${next}`);
    onChanged();
  }
  async function changeBudget(next: number) {
    setBudget(next);
    await supabase.from("test_levels").update({ ai_question_budget: next }).eq("id", level.id);
  }
  async function saveLevel() {
    const { error } = await supabase.from("test_levels").update({ name, mode, ai_question_budget: budget }).eq("id", level.id);
    if (error) { toast.error(error.message); return; }
    onChanged();
    toast.success("Level saved");
  }
  async function deleteLevel() {
    if (!confirm("Delete this level?")) return;
    await supabase.from("test_levels").delete().eq("id", level.id);
    onChanged();
  }

  async function addQuestion() {
    const { data, error } = await supabase.from("questions").insert({
      level_id: level.id,
      order_index: questions.length,
      question_text: "",
      think_time_seconds: 30,
      answer_time_seconds: 120,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    setQuestions([...questions, { id: data.id, level_id: level.id, order_index: questions.length, question_text: "", think_time_seconds: 30, answer_time_seconds: 120, max_follow_ups: 0, ai_generated: false, rubrics: [] }]);
  }
  async function saveQuestion(q: Question & { rubrics: QuestionRubric[] }) {
    await supabase.from("questions").update({
      question_text: q.question_text,
      think_time_seconds: q.think_time_seconds,
      answer_time_seconds: q.answer_time_seconds,
      max_follow_ups: q.max_follow_ups,
    }).eq("id", q.id);
    // sync rubrics — naive replace
    await supabase.from("question_rubrics").delete().eq("question_id", q.id);
    if (q.rubrics.length) {
      await supabase.from("question_rubrics").insert(q.rubrics.map((r, i) => ({ question_id: q.id, order_index: i, example_response: r.example_response, score: r.score })));
    }
    toast.success("Question saved");
  }
  async function deleteQuestion(id: string) {
    await supabase.from("questions").delete().eq("id", id);
    setQuestions(questions.filter((q) => q.id !== id));
  }

  async function addObjective() {
    const { data, error } = await supabase.from("objectives").insert({
      level_id: level.id, order_index: objectives.length, title: "", description: null, weight: 1,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    setObjectives([...objectives, { id: data.id, level_id: level.id, order_index: objectives.length, title: "", description: null, weight: 1, criteria: [] }]);
  }
  async function saveObjective(o: Objective & { criteria: ObjectiveCriterion[] }) {
    await supabase.from("objectives").update({ title: o.title, description: o.description, weight: o.weight }).eq("id", o.id);
    await supabase.from("objective_criteria").delete().eq("objective_id", o.id);
    if (o.criteria.length) {
      await supabase.from("objective_criteria").insert(o.criteria.map((c, i) => ({ objective_id: o.id, order_index: i, criterion: c.criterion, score: c.score })));
    }
    toast.success("Objective saved");
  }
  async function deleteObjective(id: string) {
    await supabase.from("objectives").delete().eq("id", id);
    setObjectives(objectives.filter((o) => o.id !== id));
  }

  return (
    <div className="surface-card p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input className={`${inputClass} max-w-xs`} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name !== level.name) void saveLevel(); }} placeholder="Level name" />
        <select className={`${inputClass} max-w-[220px]`} value={mode} onChange={(e) => void changeMode(e.target.value as LevelMode)}>
          <option value="fixed">Fixed questions</option>
          <option value="clarifying">Clarifying questions</option>
          <option value="reasoning">Reasoning (AI-generated)</option>
        </select>
        {mode === "reasoning" && (
          <label className="flex items-center gap-2 text-xs">
            <span className="label-mono">AI question budget</span>
            <input type="number" min={1} max={20} className={`${inputClass} w-20 py-1.5`} value={budget} onChange={(e) => void changeBudget(Number(e.target.value))} />
          </label>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">Mode & budget auto-save</span>
        <button onClick={deleteLevel} className="rounded p-2 text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
      </div>

      <div className="rounded-[10px] border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
        <strong className="text-foreground">Current mode:</strong>{" "}
        {mode === "fixed" && "Pre-written questions only. No follow-ups, no AI."}
        {mode === "clarifying" && "Pre-written questions + AI follow-ups (set Max follow-ups per question below)."}
        {mode === "reasoning" && "AI generates every question from your objectives. Add at least one objective below."}
      </div>

      {(mode === "fixed" || mode === "clarifying") && (
        <div className="space-y-3">
          <p className="label-mono">Questions</p>
          {questions.map((q, idx) => (
            <QuestionCard key={q.id} q={q} idx={idx} showFollowUps={mode === "clarifying"} onChange={(nq) => setQuestions(questions.map((x) => x.id === q.id ? nq : x))} onSave={() => saveQuestion(q)} onDelete={() => deleteQuestion(q.id)} />
          ))}
          <button onClick={addQuestion} className="inline-flex items-center gap-2 rounded-[10px] border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground">
            <Plus className="h-3 w-3" /> Add question
          </button>
        </div>
      )}

      {mode === "reasoning" && (
        <div className="space-y-3">
          <p className="label-mono">Objectives</p>
          <p className="text-xs text-muted-foreground">Each objective drives the AI's reasoning. Add 1–10 criteria per objective with the score each criterion is worth.</p>
          {objectives.map((o, idx) => (
            <ObjectiveCard key={o.id} o={o} idx={idx} onChange={(no) => setObjectives(objectives.map((x) => x.id === o.id ? no : x))} onSave={() => saveObjective(o)} onDelete={() => deleteObjective(o.id)} />
          ))}
          <button onClick={addObjective} className="inline-flex items-center gap-2 rounded-[10px] border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground">
            <Plus className="h-3 w-3" /> Add objective
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionCard({ q, idx, showFollowUps, onChange, onSave, onDelete }: {
  q: Question & { rubrics: QuestionRubric[] }; idx: number; showFollowUps: boolean;
  onChange: (q: Question & { rubrics: QuestionRubric[] }) => void; onSave: () => void; onDelete: () => void;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-elevated p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="mt-2 font-mono text-xs text-muted-foreground">{idx + 1}</span>
        <textarea rows={2} className={inputClass} placeholder="Question text" value={q.question_text} onChange={(e) => onChange({ ...q, question_text: e.target.value })} />
        <button onClick={onDelete} className="rounded p-1.5 text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          <span className="label-mono">Think time (s)</span>
          <input type="number" min={0} max={120} className={`${inputClass} w-20 py-1.5`} value={q.think_time_seconds} onChange={(e) => onChange({ ...q, think_time_seconds: Number(e.target.value) })} />
          <span className="text-muted-foreground">0 = instant record</span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="label-mono">Answer cap (s)</span>
          <input type="number" min={30} max={300} className={`${inputClass} w-20 py-1.5`} value={q.answer_time_seconds} onChange={(e) => onChange({ ...q, answer_time_seconds: Number(e.target.value) })} />
        </label>
        {showFollowUps && (
          <label className="flex items-center gap-2 text-xs">
            <span className="label-mono">Max follow-ups</span>
            <input type="number" min={0} max={3} className={`${inputClass} w-16 py-1.5`} value={q.max_follow_ups} onChange={(e) => onChange({ ...q, max_follow_ups: Number(e.target.value) })} />
          </label>
        )}
      </div>
      <RubricEditor rubrics={q.rubrics} onChange={(rubrics) => onChange({ ...q, rubrics })} />
      <button onClick={onSave} className="rounded-[10px] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">Save question</button>
    </div>
  );
}

function RubricEditor({ rubrics, onChange }: { rubrics: QuestionRubric[]; onChange: (r: QuestionRubric[]) => void }) {
  return (
    <div>
      <p className="label-mono">Scoring reference (score 1–10)</p>
      <p className="text-xs text-muted-foreground mt-1">Add example responses and the score each would earn. Stored as reference for the reporting LLM — not processed here.</p>
      <div className="mt-2 space-y-2">
        {rubrics.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="number" min={0} max={10} className={`${inputClass} w-16 py-1.5`} value={r.score} onChange={(e) => onChange(rubrics.map((x, j) => j === i ? { ...x, score: Number(e.target.value) } : x))} />
            <input className={inputClass} placeholder="Example of a response that earns this score" value={r.example_response} onChange={(e) => onChange(rubrics.map((x, j) => j === i ? { ...x, example_response: e.target.value } : x))} />
            <button onClick={() => onChange(rubrics.filter((_, j) => j !== i))} className="rounded p-1.5 text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      {rubrics.length < 10 && (
        <button onClick={() => onChange([...rubrics, { id: "", question_id: "", order_index: rubrics.length, example_response: "", score: rubrics.length + 1 }])} className="mt-2 inline-flex items-center gap-2 rounded-[10px] border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary/50">
          <Plus className="h-3 w-3" /> Add tier
        </button>
      )}
    </div>
  );
}

function ObjectiveCard({ o, idx, onChange, onSave, onDelete }: {
  o: Objective & { criteria: ObjectiveCriterion[] }; idx: number;
  onChange: (o: Objective & { criteria: ObjectiveCriterion[] }) => void; onSave: () => void; onDelete: () => void;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-elevated p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="mt-2 font-mono text-xs text-muted-foreground">{idx + 1}</span>
        <input className={inputClass} placeholder="Objective title (e.g. Genuine study intent)" value={o.title} onChange={(e) => onChange({ ...o, title: e.target.value })} />
        <button onClick={onDelete} className="rounded p-1.5 text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
      </div>
      <textarea rows={2} className={inputClass} placeholder="What you're seeking…" value={o.description ?? ""} onChange={(e) => onChange({ ...o, description: e.target.value })} />
      <label className="flex items-center gap-2 text-xs">
        <span className="label-mono">Weight</span>
        <input type="number" min={1} max={10} className={`${inputClass} w-16 py-1.5`} value={o.weight} onChange={(e) => onChange({ ...o, weight: Number(e.target.value) })} />
      </label>
      <div>
        <p className="label-mono">Criteria (1–10)</p>
        <div className="mt-2 space-y-2">
          {o.criteria.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="number" min={0} max={10} className={`${inputClass} w-16 py-1.5`} value={c.score} onChange={(e) => onChange({ ...o, criteria: o.criteria.map((x, j) => j === i ? { ...x, score: Number(e.target.value) } : x) })} />
              <input className={inputClass} placeholder="If the candidate covers this aspect, score = …" value={c.criterion} onChange={(e) => onChange({ ...o, criteria: o.criteria.map((x, j) => j === i ? { ...x, criterion: e.target.value } : x) })} />
              <button onClick={() => onChange({ ...o, criteria: o.criteria.filter((_, j) => j !== i) })} className="rounded p-1.5 text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        {o.criteria.length < 10 && (
          <button onClick={() => onChange({ ...o, criteria: [...o.criteria, { id: "", objective_id: o.id, order_index: o.criteria.length, criterion: "", score: o.criteria.length + 1 }] })} className="mt-2 inline-flex items-center gap-2 rounded-[10px] border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary/50">
            <Plus className="h-3 w-3" /> Add criterion
          </button>
        )}
      </div>
      <button onClick={onSave} className="rounded-[10px] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">Save objective</button>
    </div>
  );
}

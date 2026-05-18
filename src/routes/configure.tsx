import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronRight, Upload, ListChecks, MessageSquareMore, BrainCircuit, Plus, Trash2, GripVertical, Copy, ExternalLink } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import type { ClarifyingQuestion, FixedQuestion, InterviewConfiguration, InterviewMode, Objective } from "@/lib/types";
import { DEFAULT_CLOSING, DEFAULT_INTRO, newId, slugify } from "@/lib/types";

export const Route = createFileRoute("/configure")({
  head: () => ({
    meta: [
      { title: "Configure Interview — SGT" },
      { name: "description", content: "Configure a new AI interview for your institution: details, mode, questions, and shareable link." },
    ],
  }),
  component: ConfigureWizard,
});

const STEPS = ["Institution", "Mode", "Questions", "Review & link"] as const;

interface InstitutionForm {
  institution_name: string;
  contact_email: string;
  programme_name: string;
  intake_year: string;
  logo_url: string;
}

function ConfigureWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  const [details, setDetails] = useState<InstitutionForm>({
    institution_name: "",
    contact_email: "",
    programme_name: "",
    intake_year: "2026",
    logo_url: "",
  });
  const [mode, setMode] = useState<InterviewMode | null>(null);

  const [fixedQs, setFixedQs] = useState<FixedQuestion[]>([{ id: newId(), question_text: "", time_limit_seconds: 120 }]);
  const [clarifyingQs, setClarifyingQs] = useState<ClarifyingQuestion[]>([{ id: newId(), question_text: "", expected_response_scope: "", max_follow_ups: 2, time_limit_seconds: 120 }]);
  const [openingQs, setOpeningQs] = useState<FixedQuestion[]>([{ id: newId(), question_text: "", time_limit_seconds: 120 }]);
  const [objectives, setObjectives] = useState<Objective[]>([{ id: newId(), objective_title: "", objective_description: "", weight: 3 }]);
  const [aiBudget, setAiBudget] = useState(6);
  const [intro, setIntro] = useState("");
  const [closing, setClosing] = useState("");
  const [proctoring, setProctoring] = useState(true);

  const canNext = useMemo(() => {
    if (step === 0) return details.institution_name.trim().length >= 3;
    if (step === 1) return mode !== null;
    if (step === 2) {
      if (mode === "fixed") return fixedQs.some((q) => q.question_text.trim());
      if (mode === "clarifying") return clarifyingQs.some((q) => q.question_text.trim());
      if (mode === "reasoning") return openingQs.some((q) => q.question_text.trim()) && objectives.some((o) => o.objective_title.trim());
    }
    return true;
  }, [step, details, mode, fixedQs, clarifyingQs, openingQs, objectives]);

  async function publish() {
    if (!mode) return;
    setSubmitting(true);
    const slug = `${slugify(details.institution_name)}-${Math.random().toString(36).slice(2, 6)}`;
    const config: InterviewConfiguration = {
      mode,
      ...(mode === "fixed" && { fixed_questions: fixedQs.filter((q) => q.question_text.trim()) }),
      ...(mode === "clarifying" && { clarifying_questions: clarifyingQs.filter((q) => q.question_text.trim()) }),
      ...(mode === "reasoning" && {
        opening_questions: openingQs.filter((q) => q.question_text.trim()),
        objectives: objectives.filter((o) => o.objective_title.trim()),
        ai_question_budget: aiBudget,
      }),
      intro_message: intro || undefined,
      closing_message: closing || undefined,
      proctoring_enabled: proctoring,
    };

    const { error } = await supabase.from("universities").insert({
      slug,
      institution_name: details.institution_name,
      contact_email: details.contact_email || null,
      programme_name: details.programme_name || null,
      intake_year: details.intake_year || null,
      logo_url: details.logo_url || null,
      interview_mode: mode,
      configuration: config as any,
      status: "live",
    });
    setSubmitting(false);
    if (error) { alert(error.message); return; }
    setPublishedSlug(slug);
  }

  return (
    <AppShell>
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-10 md:grid-cols-[260px_1fr]">
        {/* Sidebar steps */}
        <aside className="md:sticky md:top-10 md:self-start">
          <p className="label-mono">New configuration</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Set up an interview</h1>
          <ol className="mt-8 space-y-1">
            {STEPS.map((label, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li key={label}>
                  <button
                    onClick={() => i < step && setStep(i)}
                    disabled={i > step}
                    className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm transition ${active ? "bg-elevated" : "hover:bg-elevated/60"} ${i > step ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <span className={`grid h-6 w-6 place-items-center rounded-full font-mono text-[11px] ${done ? "bg-success text-background" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className={active ? "font-medium" : "text-muted-foreground"}>{label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* Step content */}
        <div>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              {step === 0 && <StepInstitution value={details} onChange={setDetails} />}
              {step === 1 && <StepMode value={mode} onChange={setMode} />}
              {step === 2 && (
                <StepQuestions
                  mode={mode!}
                  fixedQs={fixedQs} setFixedQs={setFixedQs}
                  clarifyingQs={clarifyingQs} setClarifyingQs={setClarifyingQs}
                  openingQs={openingQs} setOpeningQs={setOpeningQs}
                  objectives={objectives} setObjectives={setObjectives}
                  aiBudget={aiBudget} setAiBudget={setAiBudget}
                  intro={intro} setIntro={setIntro}
                  closing={closing} setClosing={setClosing}
                  proctoring={proctoring} setProctoring={setProctoring}
                />
              )}
              {step === 3 && (
                <StepReview
                  details={details} mode={mode!}
                  fixedQs={fixedQs} clarifyingQs={clarifyingQs}
                  openingQs={openingQs} objectives={objectives}
                  publishedSlug={publishedSlug}
                  onPublish={publish}
                  submitting={submitting}
                  onOpenInterview={(slug) => navigate({ to: "/interview/$slug", params: { slug } })}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Nav */}
          {!publishedSlug && (
            <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="rounded-[10px] border border-border px-4 py-2 text-sm hover:bg-elevated disabled:opacity-40"
              >
                Back
              </button>
              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canNext}
                  className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
                >
                  Continue <ChevronRight className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/* ---------------- Steps ---------------- */

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </label>
  );
}

const inputClass = "w-full rounded-[10px] border border-border bg-elevated px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

function StepInstitution({ value, onChange }: { value: InstitutionForm; onChange: (v: InstitutionForm) => void }) {
  async function handleLogo(file: File) {
    const ext = file.name.split(".").pop();
    const path = `${slugify(value.institution_name || "logo")}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("university-logos").upload(path, file, { upsert: true });
    if (error) { alert(error.message); return; }
    const { data } = supabase.storage.from("university-logos").getPublicUrl(path);
    onChange({ ...value, logo_url: data.publicUrl });
  }
  return (
    <section className="surface-card p-8">
      <p className="label-mono">Step 1</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">Institution details</h2>
      <p className="mt-2 text-sm text-muted-foreground">Basic information about the institution and programme.</p>

      <div className="mt-8 grid gap-6">
        <Field label="Institution name">
          <input className={inputClass} placeholder="e.g. Coventry University" value={value.institution_name} onChange={(e) => onChange({ ...value, institution_name: e.target.value })} />
        </Field>

        <Field label="Institution logo" hint="PNG, SVG or WEBP, under 2MB">
          <label className="flex cursor-pointer items-center justify-center gap-3 rounded-[10px] border border-dashed border-border bg-elevated px-4 py-8 text-sm text-muted-foreground transition hover:border-primary/50">
            {value.logo_url ? (
              <img src={value.logo_url} alt="Logo" className="h-16 w-16 rounded object-contain" />
            ) : (
              <>
                <Upload className="h-4 w-4" />
                <span>Click to upload or drop file here</span>
              </>
            )}
            <input type="file" accept="image/png,image/svg+xml,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && handleLogo(e.target.files[0])} />
          </label>
        </Field>

        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Programme / Course name">
            <input className={inputClass} placeholder="e.g. MSc Computer Science" value={value.programme_name} onChange={(e) => onChange({ ...value, programme_name: e.target.value })} />
          </Field>
          <Field label="Intake year">
            <select className={inputClass} value={value.intake_year} onChange={(e) => onChange({ ...value, intake_year: e.target.value })}>
              <option>2025</option><option>2026</option><option>2027</option>
            </select>
          </Field>
        </div>

        <Field label="Admissions contact email">
          <input className={inputClass} type="email" placeholder="admissions@university.ac.uk" value={value.contact_email} onChange={(e) => onChange({ ...value, contact_email: e.target.value })} />
        </Field>
      </div>
    </section>
  );
}

function StepMode({ value, onChange }: { value: InterviewMode | null; onChange: (m: InterviewMode) => void }) {
  const modes: { id: InterviewMode; icon: React.ComponentType<{ className?: string }>; title: string; tagline: string; features: string[] }[] = [
    { id: "fixed", icon: ListChecks, title: "Fixed Question Bank", tagline: "Your exact questions, delivered in order.", features: ["Static list, asked verbatim", "Best for compliance interviews", "Fully predictable order"] },
    { id: "clarifying", icon: MessageSquareMore, title: "Questions + Clarification", tagline: "Structured questions with intelligent follow-up.", features: ["Set ideal response scope", "AI follows up on weak answers", "Configurable max follow-ups"] },
    { id: "reasoning", icon: BrainCircuit, title: "Deep Reasoning Model", tagline: "Objectives-driven, fully adaptive questioning.", features: ["2–3 mandatory openers", "Set assessment objectives", "AI reasons in real-time"] },
  ];
  return (
    <section className="surface-card p-8">
      <p className="label-mono">Step 2</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">Interview mode</h2>
      <p className="mt-2 text-sm text-muted-foreground">Choose how the AI conducts your interview.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {modes.map((m) => {
          const active = value === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onChange(m.id)}
              className={`group rounded-[16px] border bg-elevated p-6 text-left transition ${active ? "border-primary glow-ring" : "border-border hover:border-primary/40"}`}
            >
              <m.icon className={`h-6 w-6 ${active ? "text-primary" : "text-muted-foreground"}`} />
              <h3 className="mt-4 text-base font-semibold">{m.title}</h3>
              <p className="mt-1.5 text-xs text-muted-foreground">{m.tagline}</p>
              <ul className="mt-4 space-y-1.5">
                {m.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" /> {f}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StepQuestions(props: {
  mode: InterviewMode;
  fixedQs: FixedQuestion[]; setFixedQs: (q: FixedQuestion[]) => void;
  clarifyingQs: ClarifyingQuestion[]; setClarifyingQs: (q: ClarifyingQuestion[]) => void;
  openingQs: FixedQuestion[]; setOpeningQs: (q: FixedQuestion[]) => void;
  objectives: Objective[]; setObjectives: (o: Objective[]) => void;
  aiBudget: number; setAiBudget: (n: number) => void;
  intro: string; setIntro: (s: string) => void;
  closing: string; setClosing: (s: string) => void;
  proctoring: boolean; setProctoring: (b: boolean) => void;
}) {
  const { mode } = props;
  return (
    <section className="surface-card p-8">
      <p className="label-mono">Step 3</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">Build the interview</h2>

      <div className="mt-8 space-y-6">
        {mode === "fixed" && (
          <FixedList items={props.fixedQs} onChange={props.setFixedQs} title="Questions" />
        )}
        {mode === "clarifying" && (
          <ClarifyingList items={props.clarifyingQs} onChange={props.setClarifyingQs} />
        )}
        {mode === "reasoning" && (
          <>
            <FixedList items={props.openingQs} onChange={props.setOpeningQs} title="Mandatory opening questions (max 3)" max={3} />
            <hr className="border-border" />
            <ObjectivesList items={props.objectives} onChange={props.setObjectives} />
            <Field label="Maximum AI-generated questions" hint="Total questions the AI may generate after the openers (3–10).">
              <input type="number" min={3} max={10} className={inputClass} value={props.aiBudget} onChange={(e) => props.setAiBudget(Number(e.target.value))} />
            </Field>
          </>
        )}

        <hr className="border-border" />
        <Field label="Custom interviewer introduction (optional)" hint="Leave blank to use the platform default.">
          <textarea rows={3} className={inputClass} placeholder={DEFAULT_INTRO.slice(0, 120) + "…"} value={props.intro} onChange={(e) => props.setIntro(e.target.value)} />
        </Field>
        <Field label="Custom interview closing (optional)">
          <textarea rows={3} className={inputClass} placeholder={DEFAULT_CLOSING.slice(0, 120) + "…"} value={props.closing} onChange={(e) => props.setClosing(e.target.value)} />
        </Field>
        <div className="flex items-center justify-between rounded-[10px] border border-border bg-elevated px-4 py-3">
          <div>
            <p className="text-sm font-medium">Enable screen proctoring</p>
            <p className="text-xs text-muted-foreground">Detect tab switches and absence of face during recording.</p>
          </div>
          <button
            onClick={() => props.setProctoring(!props.proctoring)}
            className={`relative h-6 w-11 rounded-full transition ${props.proctoring ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${props.proctoring ? "left-5" : "left-0.5"}`} />
          </button>
        </div>
      </div>
    </section>
  );
}

function FixedList({ items, onChange, title, max }: { items: FixedQuestion[]; onChange: (q: FixedQuestion[]) => void; title: string; max?: number }) {
  return (
    <div>
      <p className="label-mono">{title}</p>
      <div className="mt-3 space-y-3">
        {items.map((q, i) => (
          <div key={q.id} className="flex items-start gap-3 rounded-[12px] border border-border bg-elevated p-4">
            <div className="flex flex-col items-center gap-2 pt-1">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
            </div>
            <div className="flex-1 space-y-3">
              <textarea
                rows={2} className={inputClass} placeholder="Type your question…"
                value={q.question_text}
                onChange={(e) => onChange(items.map((x) => x.id === q.id ? { ...x, question_text: e.target.value } : x))}
              />
              <div className="flex items-center gap-2">
                <span className="label-mono">Time limit</span>
                <input type="number" min={30} max={300} className={`${inputClass} w-24 py-1.5`} value={q.time_limit_seconds}
                  onChange={(e) => onChange(items.map((x) => x.id === q.id ? { ...x, time_limit_seconds: Number(e.target.value) } : x))} />
                <span className="label-mono">seconds</span>
              </div>
            </div>
            <button onClick={() => onChange(items.filter((x) => x.id !== q.id))} className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-danger">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {(!max || items.length < max) && (
        <button
          onClick={() => onChange([...items, { id: newId(), question_text: "", time_limit_seconds: 120 }])}
          className="mt-3 inline-flex items-center gap-2 rounded-[10px] border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> Add question
        </button>
      )}
    </div>
  );
}

function ClarifyingList({ items, onChange }: { items: ClarifyingQuestion[]; onChange: (q: ClarifyingQuestion[]) => void }) {
  return (
    <div>
      <p className="label-mono">Questions with response scope</p>
      <div className="mt-3 space-y-3">
        {items.map((q, i) => (
          <div key={q.id} className="rounded-[12px] border border-border bg-elevated p-4">
            <div className="flex items-start gap-3">
              <span className="mt-2 font-mono text-xs text-muted-foreground">{i + 1}</span>
              <div className="flex-1 space-y-3">
                <textarea rows={2} className={inputClass} placeholder="Question text…" value={q.question_text}
                  onChange={(e) => onChange(items.map((x) => x.id === q.id ? { ...x, question_text: e.target.value } : x))} />
                <textarea rows={2} className={inputClass} placeholder="What a good answer should include…" value={q.expected_response_scope}
                  onChange={(e) => onChange(items.map((x) => x.id === q.id ? { ...x, expected_response_scope: e.target.value } : x))} />
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2"><span className="label-mono">Max follow-ups</span>
                    <input type="number" min={1} max={3} className={`${inputClass} w-20 py-1.5`} value={q.max_follow_ups}
                      onChange={(e) => onChange(items.map((x) => x.id === q.id ? { ...x, max_follow_ups: Number(e.target.value) } : x))} />
                  </label>
                  <label className="flex items-center gap-2"><span className="label-mono">Time limit (s)</span>
                    <input type="number" min={30} max={300} className={`${inputClass} w-24 py-1.5`} value={q.time_limit_seconds}
                      onChange={(e) => onChange(items.map((x) => x.id === q.id ? { ...x, time_limit_seconds: Number(e.target.value) } : x))} />
                  </label>
                </div>
              </div>
              <button onClick={() => onChange(items.filter((x) => x.id !== q.id))} className="rounded p-1.5 text-muted-foreground hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...items, { id: newId(), question_text: "", expected_response_scope: "", max_follow_ups: 2, time_limit_seconds: 120 }])}
        className="mt-3 inline-flex items-center gap-2 rounded-[10px] border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
      >
        <Plus className="h-4 w-4" /> Add question
      </button>
    </div>
  );
}

function ObjectivesList({ items, onChange }: { items: Objective[]; onChange: (o: Objective[]) => void }) {
  return (
    <div>
      <p className="label-mono">Assessment objectives</p>
      <p className="mt-1 text-xs text-muted-foreground">Each objective shapes what the AI probes during the interview.</p>
      <div className="mt-3 space-y-3">
        {items.map((o) => (
          <div key={o.id} className="rounded-[12px] border border-border bg-elevated p-4 space-y-3">
            <input className={inputClass} placeholder="Objective title (e.g. Genuine Study Intent)" value={o.objective_title}
              onChange={(e) => onChange(items.map((x) => x.id === o.id ? { ...x, objective_title: e.target.value } : x))} />
            <textarea rows={3} className={inputClass} placeholder="What you want to understand…" value={o.objective_description}
              onChange={(e) => onChange(items.map((x) => x.id === o.id ? { ...x, objective_description: e.target.value } : x))} />
            <div className="flex items-center gap-3">
              <span className="label-mono w-16">Weight</span>
              <input type="range" min={1} max={5} value={o.weight} className="flex-1 accent-[var(--color-primary)]"
                onChange={(e) => onChange(items.map((x) => x.id === o.id ? { ...x, weight: Number(e.target.value) } : x))} />
              <span className="font-mono text-sm w-6 text-right">{o.weight}</span>
              <button onClick={() => onChange(items.filter((x) => x.id !== o.id))} className="rounded p-1.5 text-muted-foreground hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...items, { id: newId(), objective_title: "", objective_description: "", weight: 3 }])}
        className="mt-3 inline-flex items-center gap-2 rounded-[10px] border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
      >
        <Plus className="h-4 w-4" /> Add objective
      </button>
    </div>
  );
}

function StepReview(props: {
  details: InstitutionForm; mode: InterviewMode;
  fixedQs: FixedQuestion[]; clarifyingQs: ClarifyingQuestion[];
  openingQs: FixedQuestion[]; objectives: Objective[];
  publishedSlug: string | null;
  onPublish: () => void;
  submitting: boolean;
  onOpenInterview: (slug: string) => void;
}) {
  const { details, mode, publishedSlug } = props;
  const url = publishedSlug ? `${typeof window !== "undefined" ? window.location.origin : ""}/interview/${publishedSlug}` : "";

  if (publishedSlug) {
    return (
      <section className="surface-card p-8">
        <p className="label-mono text-success">Interview live</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Your interview link is ready</h2>
        <p className="mt-2 text-sm text-muted-foreground">Share this link with applicants. Each visit creates a new session.</p>

        <div className="mt-8 grid gap-6 md:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-[10px] border border-border bg-elevated px-4 py-3">
              <code className="flex-1 truncate font-mono text-sm">{url}</code>
              <button onClick={() => navigator.clipboard.writeText(url)} className="rounded-md p-1.5 hover:bg-background"><Copy className="h-4 w-4" /></button>
            </div>
            <button onClick={() => props.onOpenInterview(publishedSlug)} className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
              <ExternalLink className="h-4 w-4" /> Open interview room
            </button>
          </div>
          <div className="rounded-[16px] border border-border bg-white p-4">
            <QRCodeCanvas value={url} size={140} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-card p-8">
      <p className="label-mono">Step 4</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">Review and publish</h2>

      <div className="mt-8 space-y-6">
        <div className="flex items-center gap-4 rounded-[12px] border border-border bg-elevated p-5">
          {details.logo_url ? (
            <img src={details.logo_url} alt="" className="h-14 w-14 rounded object-contain" />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded bg-muted text-muted-foreground font-mono text-xs">LOGO</div>
          )}
          <div>
            <h3 className="text-lg font-semibold">{details.institution_name || "—"}</h3>
            <p className="text-sm text-muted-foreground">{details.programme_name || "—"} · {details.intake_year}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Summary label="Mode" value={mode} />
          <Summary label="Contact" value={details.contact_email || "—"} />
          <Summary label="Questions" value={String(
            mode === "fixed" ? props.fixedQs.filter((q) => q.question_text.trim()).length :
            mode === "clarifying" ? props.clarifyingQs.filter((q) => q.question_text.trim()).length :
            `${props.openingQs.filter((q) => q.question_text.trim()).length} + ${props.objectives.filter((o) => o.objective_title.trim()).length} objectives`
          )} />
        </div>

        <button
          onClick={props.onPublish}
          disabled={props.submitting}
          className="w-full rounded-[10px] bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {props.submitting ? "Publishing…" : "Generate interview link"}
        </button>
      </div>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-elevated p-4">
      <p className="label-mono">{label}</p>
      <p className="mt-1.5 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

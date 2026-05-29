import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/interview/$slug/complete")({
  head: () => ({
    meta: [
      { title: "Post-interview feedback — SGT" },
      { name: "description", content: "Share your feedback about the interview experience." },
    ],
  }),
  component: CompletePage,
});

type RatingQ = { id: string; kind: "rating"; label: string; hint?: string };
type SingleQ = { id: string; kind: "single"; label: string; options: string[] };
type MultiQ = { id: string; kind: "multi"; label: string; hint?: string; options: string[] };
type Q = RatingQ | SingleQ | MultiQ;

const SECTIONS: { title: string; questions: Q[] }[] = [
  {
    title: "Your application journey",
    questions: [
      { id: "q1", kind: "rating", label: "How satisfied are you with how your application was handled overall?", hint: "1 = very dissatisfied · 5 = very satisfied" },
      { id: "q2", kind: "multi", label: "Which part of the application process did you find most challenging?", hint: "Select all that apply", options: ["Document submission","CAS letter","English language requirement","Financial evidence","Visa application","Communication from the university","Nothing — all was clear"] },
      { id: "q3", kind: "single", label: "Did you receive timely updates throughout your application?", options: ["Yes — I was kept well informed at every stage","Mostly — there were occasional delays in communication","No — I often had to follow up for updates myself"] },
      { id: "q4", kind: "single", label: "How clearly was the application process explained to you before you began?", options: ["Very clearly — I understood exactly what was required","Somewhat clearly — most things were explained but not all","Not clearly — I had to figure out a lot on my own"] },
    ],
  },
  {
    title: "About the university",
    questions: [
      { id: "q5", kind: "rating", label: "How confident are you in your understanding of your course and student life at the university?", hint: "1 = not at all confident · 5 = very confident" },
      { id: "q6", kind: "multi", label: "What do you most want to know more about before you arrive?", hint: "Select all that apply", options: ["Accommodation","Campus facilities","Career and employability support","Course structure and assessments","Student community and social life","Part-time work opportunities","Travel and local transport","I have all the information I need"] },
      { id: "q7", kind: "single", label: "Do you have any unanswered questions about the university or your course?", options: ["Yes — I still have questions I would like answered","A few minor things, but nothing urgent","No — all my questions have been addressed"] },
    ],
  },
  {
    title: "Your interview experience",
    questions: [
      { id: "q8", kind: "rating", label: "How would you rate the overall quality of this AI-conducted interview?", hint: "1 = very poor · 5 = excellent" },
      { id: "q9", kind: "single", label: "Was the AI interviewer easy to understand and follow?", options: ["Yes — very clear and easy to follow throughout","Mostly — occasionally unclear but generally understandable","Somewhat difficult — I found certain parts hard to follow","Difficult — I struggled to understand the interviewer throughout"] },
      { id: "q10", kind: "single", label: "Did the interview feel fair and respectful throughout?", options: ["Yes — completely fair and respectful","Mostly — with minor reservations","Not entirely — some parts felt uncomfortable or unclear"] },
    ],
  },
];

const ALL_QS = SECTIONS.flatMap((s) => s.questions);
const NONE_LABELS = ["Nothing — all was clear", "I have all the information I need"];

function CompletePage() {
  const { slug } = Route.useParams();
  const [orgName, setOrgName] = useState<string>("");
  const [logo, setLogo] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from("tests").select("id, organisation_id").eq("slug", slug).maybeSingle();
      if (!t) return;
      if (t.organisation_id) {
        const { data: o } = await supabase.from("organisations").select("name, logo_url").eq("id", t.organisation_id).maybeSingle();
        if (o) { setOrgName(o.name); setLogo(o.logo_url); }
      }
      // Find the latest completed session for this test (best effort — there's no auth)
      const { data: s } = await supabase
        .from("interview_sessions")
        .select("id")
        .eq("test_id", t.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (s) setSessionId(s.id);
    })();
  }, [slug]);

  const answeredCount = useMemo(() => {
    let n = 0;
    for (const q of ALL_QS) {
      const v = answers[q.id];
      if (v == null) continue;
      if (Array.isArray(v) ? v.length > 0 : true) n++;
    }
    return n;
  }, [answers]);
  const total = ALL_QS.length;
  const pct = Math.round((answeredCount / total) * 100);

  const setRating = (id: string, n: number) => setAnswers((a) => ({ ...a, [id]: n }));
  const setSingle = (id: string, v: string) => setAnswers((a) => ({ ...a, [id]: v }));
  const toggleMulti = (id: string, v: string) => {
    setAnswers((a) => {
      const cur = (a[id] as string[] | undefined) ?? [];
      const isNone = NONE_LABELS.includes(v);
      let next: string[];
      if (isNone) next = cur.includes(v) ? [] : [v];
      else next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur.filter((x) => !NONE_LABELS.includes(x)), v];
      return { ...a, [id]: next };
    });
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (answeredCount < total) {
      toast.error(`Please answer all ${total} questions before submitting.`);
      return;
    }
    setSubmitting(true);
    try {
      if (sessionId) {
        await supabase
          .from("interview_sessions")
          .update({ student_feedback: { answers, submitted_at: new Date().toISOString() } as never } as never)
          .eq("id", sessionId);
      }
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      console.error(e);
      toast.error("Could not submit feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-screen items-center justify-center px-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="max-w-lg text-center">
              {logo && <img src={logo} alt="" className="mx-auto h-14 w-14 object-contain" />}
              {orgName && <p className="label-mono mt-4">{orgName}</p>}
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 180 }} className="mx-auto mt-8 grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success glow-ring">
                <Check className="h-10 w-10" strokeWidth={2.5} />
              </motion.div>
              <h1 className="mt-8 text-4xl font-semibold tracking-[-0.02em]">Thank you</h1>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Your interview and feedback have been submitted to the university compliance team for review.
                You may now close this tab.
              </p>
              <p className="mt-6 text-xs text-muted-foreground">A member of the compliance team will be in touch within 24 UK working hours if needed.</p>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Header */}
            <header className="border-b border-border bg-card/40 px-4 py-10">
              <div className="mx-auto max-w-2xl">
                {logo && <img src={logo} alt="" className="mb-4 h-10 w-10 object-contain" />}
                {orgName && <p className="label-mono">{orgName}</p>}
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
                  Post-interview <em className="font-serif italic text-primary">student feedback</em>
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Thank you for completing your interview. Please take a moment to answer the questions below — your responses help us continue improving the process for every student.
                </p>
              </div>
            </header>

            <main className="mx-auto max-w-2xl px-4 py-8 pb-24">
              {/* Progress */}
              <div className="sticky top-2 z-10 mb-8 flex items-center gap-3 rounded-full border border-border bg-background/90 px-4 py-2 backdrop-blur">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <motion.div className="h-full bg-primary" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} />
                </div>
                <span className="label-mono whitespace-nowrap text-xs">{answeredCount} of {total} answered</span>
              </div>

              {SECTIONS.map((section, sIdx) => (
                <div key={section.title} className="mb-8">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{sIdx + 1}</div>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</h2>
                  </div>
                  <div className="surface-card divide-y divide-border p-0">
                    {section.questions.map((q) => (
                      <div key={q.id} className="p-5 sm:p-6">
                        <p className="text-sm font-medium leading-relaxed">{q.label}</p>
                        {"hint" in q && q.hint && <p className="mt-1 text-xs text-muted-foreground">{q.hint}</p>}
                        <div className="mt-4">
                          {q.kind === "rating" && (
                            <div className="flex gap-2">
                              {[1, 2, 3, 4, 5].map((n) => {
                                const active = (answers[q.id] as number | undefined) != null && (answers[q.id] as number) >= n;
                                return (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => setRating(q.id, n)}
                                    className={`h-10 w-10 rounded-lg border text-sm font-semibold transition-all ${active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}
                                  >
                                    {n}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {q.kind === "single" && (
                            <div className="flex flex-col gap-2">
                              {q.options.map((opt) => {
                                const active = answers[q.id] === opt;
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setSingle(q.id, opt)}
                                    className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-accent/30"}`}
                                  >
                                    <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${active ? "border-primary" : "border-muted-foreground/40"}`}>
                                      {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                                    </span>
                                    <span className="leading-snug">{opt}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {q.kind === "multi" && (
                            <div className="flex flex-wrap gap-2">
                              {q.options.map((opt) => {
                                const active = ((answers[q.id] as string[] | undefined) ?? []).includes(opt);
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => toggleMulti(q.id, opt)}
                                    className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="mt-10 text-center">
                <Button size="lg" onClick={handleSubmit} disabled={submitting} className="min-w-[220px]">
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : "Submit feedback"}
                </Button>
                <p className="mx-auto mt-3 max-w-md text-xs text-muted-foreground">
                  Your responses are confidential and reviewed by the university compliance team. Submission confirms that all responses reflect your own genuine views.
                </p>
              </div>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

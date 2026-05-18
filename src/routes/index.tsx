import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Plus, Sparkles, Globe2, ShieldCheck, BrainCircuit } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SGT — AI Student Genuineness Interviews" },
      { name: "description", content: "Configure adaptive AI interviews for UK university admissions. Detect genuine intent. Reduce risk. Decide with confidence." },
    ],
  }),
  component: LandingPage,
});

interface UniRow { id: string; slug: string; institution_name: string; programme_name: string | null; interview_mode: string; status: string; updated_at: string; }

function LandingPage() {
  const navigate = useNavigate();
  const [unis, setUnis] = useState<UniRow[] | null>(null);

  useEffect(() => {
    supabase.from("universities").select("id,slug,institution_name,programme_name,interview_mode,status,updated_at").order("updated_at", { ascending: false }).then(({ data }) => {
      setUnis((data as UniRow[]) ?? []);
    });
  }, []);

  return (
    <AppShell
      rightSlot={
        <Link
          to="/configure"
          className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New configuration
        </Link>
      }
    >
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="mx-auto max-w-7xl px-6 py-24">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="label-mono inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5">
              <Sparkles className="h-3 w-3 text-primary" /> Built for UK admissions
            </span>
            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-0.03em] md:text-6xl">
              Genuine students.<br />
              <span className="text-muted-foreground">Detected automatically.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
              Deploy AI-led video interviews that reason in real time — exposing coached answers, surfacing authentic intent, and giving your admissions team evidence that actually matters.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link to="/configure" className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                Configure your first interview <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how" className="inline-flex items-center rounded-[10px] border border-border px-5 py-3 text-sm font-medium hover:bg-elevated">
                How it works
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Modes */}
      <section id="how" className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <p className="label-mono">Three interview modes</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em]">Pick the depth that fits the decision.</h2>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { icon: Globe2, title: "Fixed", desc: "Your exact questions, in order. Compliance-grade consistency for standardised assessment." },
              { icon: ShieldCheck, title: "Clarifying", desc: "Structured questions with intelligent follow-up when an answer falls short of scope." },
              { icon: BrainCircuit, title: "Reasoning", desc: "Objectives-driven adaptive interviewing. AI reasons in real time to expose true intent." },
            ].map((m, i) => (
              <motion.div
                key={m.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="surface-card p-6"
              >
                <m.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 text-lg font-semibold">{m.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Existing configurations */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="flex items-end justify-between">
          <div>
            <p className="label-mono">Workspace</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">Configured institutions</h2>
          </div>
          <Link to="/configure" className="text-sm text-primary hover:underline">+ Add institution</Link>
        </div>

        <div className="mt-8">
          {unis === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : unis.length === 0 ? (
            <div className="surface-card flex flex-col items-center justify-center p-16 text-center">
              <p className="label-mono">No institutions yet</p>
              <h3 className="mt-3 text-xl font-semibold">Configure your first interview.</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Set up an institution, pick an interview mode, generate a shareable link for your applicants.
              </p>
              <button
                onClick={() => navigate({ to: "/configure" })}
                className="mt-6 inline-flex items-center gap-2 rounded-[10px] bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Start configuration
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {unis.map((u) => (
                <Link
                  key={u.id}
                  to="/interview/$slug"
                  params={{ slug: u.slug }}
                  className="surface-card flex items-center justify-between gap-4 p-5 transition hover:border-[var(--color-border-active)]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="truncate text-base font-semibold">{u.institution_name}</h3>
                      <StatusPill status={u.status} />
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {u.programme_name ?? "—"} · <span className="font-mono uppercase tracking-wider text-[10px]">{u.interview_mode}</span>
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    live: "bg-success/15 text-success",
    draft: "bg-muted text-muted-foreground",
    paused: "bg-warning/15 text-warning",
  };
  return (
    <span className={`label-mono rounded-full px-2 py-0.5 ${map[status] ?? map.draft}`}>
      {status}
    </span>
  );
}

function Index() {
  return <LandingPage />;
}

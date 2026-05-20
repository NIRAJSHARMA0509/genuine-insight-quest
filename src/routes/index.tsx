import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Plus, Sparkles, Building2, Briefcase } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import type { Organisation } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SGT — AI Adaptive Interviews" },
      { name: "description", content: "Configure adaptive AI interviews for admissions and service providers." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<Organisation[] | null>(null);

  useEffect(() => {
    supabase.from("organisations").select("*").order("updated_at", { ascending: false }).then(({ data }) => {
      setOrgs((data as Organisation[] | null) ?? []);
    });
  }, []);

  return (
    <AppShell
      rightSlot={
        <Link
          to="/configure"
          className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Configure new organisation
        </Link>
      }
    >
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="mx-auto max-w-7xl px-6 py-20">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="label-mono inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5">
              <Sparkles className="h-3 w-3 text-primary" /> Adaptive AI interviewing
            </span>
            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-0.03em] md:text-6xl">
              Configure once.<br />
              <span className="text-muted-foreground">Interview anyone.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
              Set up organisations, build multi-level tests with fixed, clarifying, or reasoning modes, and let Alex do the rest.
            </p>
            <Link
              to="/configure"
              className="mt-8 inline-flex items-center gap-2 rounded-[10px] bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Configure new organisation <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="flex items-end justify-between">
          <div>
            <p className="label-mono">Workspace</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">Organisations</h2>
          </div>
          <Link to="/configure" className="text-sm text-primary hover:underline">+ Add organisation</Link>
        </div>

        <div className="mt-8">
          {orgs === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : orgs.length === 0 ? (
            <div className="surface-card flex flex-col items-center justify-center p-16 text-center">
              <p className="label-mono">No organisations yet</p>
              <h3 className="mt-3 text-xl font-semibold">Start by configuring an organisation.</h3>
              <button
                onClick={() => navigate({ to: "/configure" })}
                className="mt-6 inline-flex items-center gap-2 rounded-[10px] bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> New organisation
              </button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {orgs.map((o) => (
                <Link
                  key={o.id}
                  to="/configure/$orgId"
                  params={{ orgId: o.id }}
                  className="surface-card flex items-center justify-between gap-4 p-5 transition hover:border-[var(--color-border-active)]"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    {o.logo_url ? (
                      <img src={o.logo_url} alt="" className="h-12 w-12 rounded-md object-contain bg-elevated" />
                    ) : (
                      <div className="grid h-12 w-12 place-items-center rounded-md bg-elevated text-muted-foreground">
                        {o.type === "university" ? <Building2 className="h-5 w-5" /> : <Briefcase className="h-5 w-5" />}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold">{o.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground font-mono uppercase tracking-wider">
                        {o.type === "university" ? "University" : "Service Provider"}
                      </p>
                    </div>
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

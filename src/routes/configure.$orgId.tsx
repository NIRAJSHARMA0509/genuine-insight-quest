import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, ExternalLink, Building2, Briefcase, Copy, Trash2, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import type { CustomUrl, Organisation, Test } from "@/lib/types";
import { slugify } from "@/lib/types";
import { toast } from "sonner";
import { CustomUrlsEditor } from "./configure";

export const Route = createFileRoute("/configure/$orgId")({
  head: () => ({ meta: [{ title: "Organisation — SGT" }] }),
  component: OrgWorkspace,
});

const inputClass =
  "w-full rounded-[10px] border border-border bg-elevated px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

function OrgWorkspace() {
  const { orgId } = Route.useParams();
  const navigate = useNavigate();
  const [org, setOrg] = useState<Organisation | null>(null);
  const [tests, setTests] = useState<Test[] | null>(null);
  const [showNewTest, setShowNewTest] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function load() {
    const [{ data: o }, { data: t }] = await Promise.all([
      supabase.from("organisations").select("*").eq("id", orgId).maybeSingle(),
      supabase.from("tests").select("*").eq("organisation_id", orgId).order("created_at", { ascending: false }),
    ]);
    setOrg(o as Organisation | null);
    setTests((t as Test[] | null) ?? []);
  }

  async function saveOrg() {
    if (!org) return;
    const { error } = await supabase.from("organisations").update({
      name: org.name,
      logo_url: org.logo_url,
      website_url: org.website_url,
      description: org.description,
      programme_name: org.programme_name,
      intake_year: org.intake_year,
      nature_of_service: org.nature_of_service,
      contact_email: org.contact_email,
      custom_urls: (org.custom_urls ?? []) as unknown as never,
    } as never).eq("id", orgId);
    if (error) { toast.error(error.message); return; }
    toast.success("Organisation saved");
  }

  async function createTest(name: string, purpose: "preparation" | "assessment") {
    if (!org) return;
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase.from("tests").insert({
      organisation_id: org.id,
      slug,
      name,
      purpose,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    navigate({ to: "/configure/$orgId/test/$testId", params: { orgId: org.id, testId: data.id } });
  }

  async function deleteOrg() {
    if (!confirm("Delete this organisation and all its tests? This cannot be undone.")) return;
    const { error } = await supabase.from("organisations").delete().eq("id", orgId);
    if (error) { toast.error(error.message); return; }
    navigate({ to: "/" });
  }

  if (!org) {
    return <AppShell><div className="mx-auto max-w-5xl px-6 py-12 text-sm text-muted-foreground">Loading…</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All organisations
        </Link>

        <div className="mt-6 flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            {org.logo_url ? (
              <img src={org.logo_url} alt="" className="h-14 w-14 rounded-md object-contain bg-elevated" />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-md bg-elevated text-muted-foreground">
                {org.type === "university" ? <Building2 className="h-6 w-6" /> : <Briefcase className="h-6 w-6" />}
              </div>
            )}
            <div>
              <p className="label-mono">{org.type === "university" ? "University" : "Service provider"}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{org.name}</h1>
            </div>
          </div>
          <button onClick={deleteOrg} className="text-xs text-muted-foreground hover:text-danger">Delete organisation</button>
        </div>

        {/* Org details editor */}
        <details className="mt-8 surface-card p-6">
          <summary className="cursor-pointer text-sm font-medium">Organisation details</summary>
          <div className="mt-6 grid gap-4">
            <input className={inputClass} placeholder="Name" value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} />
            <input className={inputClass} placeholder="Website" value={org.website_url ?? ""} onChange={(e) => setOrg({ ...org, website_url: e.target.value })} />
            <textarea rows={3} className={inputClass} placeholder="Description" value={org.description ?? ""} onChange={(e) => setOrg({ ...org, description: e.target.value })} />
            {org.type === "university" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <input className={inputClass} placeholder="Programme" value={org.programme_name ?? ""} onChange={(e) => setOrg({ ...org, programme_name: e.target.value })} />
                <input className={inputClass} placeholder="Intake year" value={org.intake_year ?? ""} onChange={(e) => setOrg({ ...org, intake_year: e.target.value })} />
              </div>
            ) : (
              <input className={inputClass} placeholder="Nature of service" value={org.nature_of_service ?? ""} onChange={(e) => setOrg({ ...org, nature_of_service: e.target.value })} />
            )}
            <input className={inputClass} placeholder="Contact email" value={org.contact_email ?? ""} onChange={(e) => setOrg({ ...org, contact_email: e.target.value })} />
            <CustomUrlsEditor value={(org.custom_urls as CustomUrl[]) ?? []} onChange={(v) => setOrg({ ...org, custom_urls: v })} />
            <button onClick={saveOrg} className="inline-flex w-fit items-center gap-2 rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Save className="h-4 w-4" /> Save changes
            </button>
          </div>
        </details>

        {/* Tests */}
        <div className="mt-10 flex items-end justify-between">
          <div>
            <p className="label-mono">Tests</p>
            <h2 className="mt-1 text-xl font-semibold">Tests under this organisation</h2>
          </div>
          <button onClick={() => setShowNewTest((s) => !s)} className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> New test
          </button>
        </div>

        {showNewTest && <NewTestForm onCreate={createTest} onCancel={() => setShowNewTest(false)} />}

        <div className="mt-6 space-y-3">
          {tests === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : tests.length === 0 ? (
            <div className="surface-card p-10 text-center text-sm text-muted-foreground">No tests yet — create your first test above.</div>
          ) : (
            tests.map((t) => <TestRow key={t.id} test={t} orgId={org.id} onChanged={load} />)
          )}
        </div>
      </div>
    </AppShell>
  );
}

function NewTestForm({ onCreate, onCancel }: { onCreate: (name: string, purpose: "preparation" | "assessment") => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState<"preparation" | "assessment">("assessment");
  return (
    <div className="mt-4 surface-card p-6 space-y-4">
      <input className={inputClass} placeholder="Test name (e.g. Foundation Year Admissions Interview)" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid gap-3 md:grid-cols-2">
        <button onClick={() => setPurpose("assessment")} className={`rounded-[12px] border p-4 text-left transition ${purpose === "assessment" ? "border-primary glow-ring" : "border-border bg-elevated hover:border-primary/40"}`}>
          <p className="text-sm font-semibold">Assessment</p>
          <p className="mt-1 text-xs text-muted-foreground">Pure evaluation. Candidate answers; no live feedback. Scored at the end.</p>
        </button>
        <button onClick={() => setPurpose("preparation")} className={`rounded-[12px] border p-4 text-left transition ${purpose === "preparation" ? "border-primary glow-ring" : "border-border bg-elevated hover:border-primary/40"}`}>
          <p className="text-sm font-semibold">Preparation</p>
          <p className="mt-1 text-xs text-muted-foreground">Coaching mode. Alex gives instant feedback after each answer so the candidate can improve.</p>
        </button>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-[10px] border border-border px-3 py-2 text-sm hover:bg-elevated">Cancel</button>
        <button disabled={!name.trim()} onClick={() => onCreate(name.trim(), purpose)} className="rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">Create test</button>
      </div>
    </div>
  );
}

function TestRow({ test, orgId, onChanged }: { test: Test; orgId: string; onChanged: () => void }) {
  const interviewUrl = typeof window !== "undefined" ? `${window.location.origin}/interview/${test.slug}` : "";
  async function del() {
    if (!confirm(`Delete test "${test.name}"?`)) return;
    const { error } = await supabase.from("tests").delete().eq("id", test.id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  }
  async function togglePublish() {
    const newStatus = test.status === "live" ? "paused" : "live";
    const { error } = await supabase.from("tests").update({ status: newStatus }).eq("id", test.id);
    if (error) { toast.error(error.message); return; }
    onChanged();
    toast.success(newStatus === "live" ? "Test is now live" : "Test paused");
  }
  return (
    <div className="surface-card flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-base font-semibold">{test.name}</h3>
          <span className={`label-mono rounded-full px-2 py-0.5 ${test.status === "live" ? "bg-success/15 text-success" : test.status === "paused" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>{test.status}</span>
          <span className="label-mono rounded-full bg-elevated px-2 py-0.5 text-muted-foreground">{test.purpose}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <code className="truncate font-mono">{interviewUrl}</code>
          <button onClick={() => navigator.clipboard.writeText(interviewUrl)} className="rounded p-1 hover:bg-elevated"><Copy className="h-3 w-3" /></button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link to="/configure/$orgId/test/$testId" params={{ orgId, testId: test.id }} className="rounded-[10px] border border-border px-3 py-2 text-xs hover:bg-elevated">Configure</Link>
        <a href={interviewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-[10px] border border-border px-3 py-2 text-xs hover:bg-elevated"><ExternalLink className="h-3 w-3" /> Preview</a>
        <button onClick={togglePublish} className="rounded-[10px] bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">{test.status === "live" ? "Pause" : "Publish"}</button>
        <button onClick={del} className="rounded p-2 text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

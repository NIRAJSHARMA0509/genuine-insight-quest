import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Building2, Briefcase, ArrowLeft, Upload, Plus, Trash2, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import type { CustomUrl, Organisation, OrganisationType } from "@/lib/types";
import { slugify } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/configure")({
  head: () => ({
    meta: [{ title: "Configure — SGT" }],
  }),
  component: ConfigureRoot,
});

const inputClass =
  "w-full rounded-[10px] border border-border bg-elevated px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

function ConfigureRoot() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<Organisation[] | null>(null);

  // creation form
  const [step, setStep] = useState<0 | 1>(0);
  const [type, setType] = useState<OrganisationType | null>(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [programmeName, setProgrammeName] = useState("");
  const [intakeYear, setIntakeYear] = useState("2026");
  const [natureOfService, setNatureOfService] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [customUrls, setCustomUrls] = useState<CustomUrl[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("organisations")
      .select("*")
      .order("updated_at", { ascending: false })
      .then(({ data }) => setOrgs((data as Organisation[] | null) ?? []));
  }, []);

  async function handleLogo(file: File) {
    const ext = file.name.split(".").pop();
    const path = `${slugify(name || "logo")}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("university-logos").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("university-logos").getPublicUrl(path);
    setLogoUrl(data.publicUrl);
  }

  async function createOrganisation() {
    if (!type || !name.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("organisations")
      .insert({
        type,
        name: name.trim(),
        logo_url: logoUrl || null,
        website_url: website || null,
        description: description || null,
        contact_email: contactEmail || null,
        custom_urls: customUrls.filter((u) => u.url.trim()) as unknown as never,
        programme_name: type === "university" ? programmeName || null : null,
        intake_year: type === "university" ? intakeYear || null : null,
        nature_of_service: type === "service_provider" ? natureOfService || null : null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${name.trim()} created — now add your first test`);
    navigate({ to: "/configure/$orgId", params: { orgId: data.id }, search: { newTest: 1 } as never });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Configure a new organisation</h1>
        <p className="mt-2 text-sm text-muted-foreground">First choose the organisation type, then add its details. Tests can be added afterwards.</p>

        {/* Existing organisations */}
        {orgs && orgs.length > 0 && (
          <div className="mt-8">
            <p className="label-mono">Or continue an existing one</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {orgs.map((o) => (
                <Link
                  key={o.id}
                  to="/configure/$orgId"
                  params={{ orgId: o.id }}
                  className="surface-card flex items-center justify-between gap-3 p-4 hover:border-[var(--color-border-active)]"
                >
                  <div className="flex items-center gap-3">
                    {o.logo_url ? (
                      <img src={o.logo_url} alt="" className="h-9 w-9 rounded object-contain bg-elevated" />
                    ) : (
                      <div className="grid h-9 w-9 place-items-center rounded bg-elevated text-muted-foreground">
                        {o.type === "university" ? <Building2 className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">{o.name}</p>
                      <p className="label-mono">{o.type === "university" ? "University" : "Service provider"}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Wizard */}
        <div className="mt-10 surface-card p-8">
          {step === 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <p className="label-mono">Step 1 of 2</p>
              <h2 className="mt-2 text-xl font-semibold">What kind of organisation?</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <TypeCard active={type === "university"} icon={<Building2 className="h-5 w-5" />} title="University" desc="Admissions, programme, intake year." onClick={() => setType("university")} />
                <TypeCard active={type === "service_provider"} icon={<Briefcase className="h-5 w-5" />} title="Service Provider" desc="Agency, employer, training partner — any service." onClick={() => setType("service_provider")} />
              </div>
              <div className="mt-8 flex justify-end">
                <button disabled={!type} onClick={() => setStep(1)} className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 1 && type && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div>
                <p className="label-mono">Step 2 of 2</p>
                <h2 className="mt-2 text-xl font-semibold">{type === "university" ? "University details" : "Service provider details"}</h2>
              </div>

              <Field label={type === "university" ? "University name" : "Provider name"}>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "university" ? "e.g. Coventry University" : "e.g. Acme Education Services"} />
              </Field>

              <Field label="Logo" hint="PNG, SVG or WEBP">
                <label className="flex cursor-pointer items-center justify-center gap-3 rounded-[10px] border border-dashed border-border bg-elevated px-4 py-6 text-sm text-muted-foreground hover:border-primary/50">
                  {logoUrl ? <img src={logoUrl} alt="" className="h-14 w-14 rounded object-contain" /> : <><Upload className="h-4 w-4" /> Click to upload</>}
                  <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && handleLogo(e.target.files[0])} />
                </label>
              </Field>

              <Field label="Website">
                <input className={inputClass} type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
              </Field>

              <Field label="Brief description">
                <textarea rows={3} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short summary of the organisation." />
              </Field>

              {type === "university" ? (
                <div className="grid gap-6 md:grid-cols-2">
                  <Field label="Programme / Course name">
                    <input className={inputClass} value={programmeName} onChange={(e) => setProgrammeName(e.target.value)} placeholder="e.g. MSc Computer Science" />
                  </Field>
                  <Field label="Intake year">
                    <select className={inputClass} value={intakeYear} onChange={(e) => setIntakeYear(e.target.value)}>
                      <option>2025</option><option>2026</option><option>2027</option>
                    </select>
                  </Field>
                </div>
              ) : (
                <Field label="Nature of service">
                  <input className={inputClass} value={natureOfService} onChange={(e) => setNatureOfService(e.target.value)} placeholder="e.g. Student admissions advisory, recruitment screening…" />
                </Field>
              )}

              <Field label="Contact email">
                <input className={inputClass} type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@example.com" />
              </Field>

              <CustomUrlsEditor value={customUrls} onChange={setCustomUrls} />

              <div className="flex justify-between border-t border-border pt-6">
                <button onClick={() => setStep(0)} className="rounded-[10px] border border-border px-4 py-2 text-sm hover:bg-elevated">Back</button>
                <button onClick={createOrganisation} disabled={!name.trim() || saving} className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">
                  {saving ? "Creating…" : "Create organisation"} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function TypeCard({ active, icon, title, desc, onClick }: { active: boolean; icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-[16px] border bg-elevated p-6 text-left transition ${active ? "border-primary glow-ring" : "border-border hover:border-primary/40"}`}>
      <div className={active ? "text-primary" : "text-muted-foreground"}>{icon}</div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1.5 text-xs text-muted-foreground">{desc}</p>
    </button>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </label>
  );
}

export function CustomUrlsEditor({ value, onChange }: { value: CustomUrl[]; onChange: (v: CustomUrl[]) => void }) {
  return (
    <div>
      <p className="label-mono">Custom URLs (optional)</p>
      <p className="mt-1 text-xs text-muted-foreground">Tag-based placeholders for landing/info/redirect pages. Leave any blank you don't need yet.</p>
      <div className="mt-3 space-y-2">
        {value.map((u, i) => (
          <div key={i} className="flex items-center gap-2">
            <input className={`${inputClass} max-w-[180px]`} placeholder="Tag (e.g. landing)" value={u.tag} onChange={(e) => onChange(value.map((x, j) => j === i ? { ...x, tag: e.target.value } : x))} />
            <input className={inputClass} placeholder="https://…" value={u.url} onChange={(e) => onChange(value.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
            <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded p-1.5 text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...value, { tag: "", url: "" }])} className="mt-2 inline-flex items-center gap-2 rounded-[10px] border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground">
        <Plus className="h-3 w-3" /> Add custom URL
      </button>
    </div>
  );
}

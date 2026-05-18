import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/interview/$slug/complete")({
  head: () => ({
    meta: [
      { title: "Interview complete — SGT" },
      { name: "description", content: "Your interview has been submitted." },
    ],
  }),
  component: CompletePage,
});

function CompletePage() {
  const { slug } = Route.useParams();
  const [institution, setInstitution] = useState<string>("");
  const [logo, setLogo] = useState<string | null>(null);
  const [closing, setClosing] = useState<string>("");

  useEffect(() => {
    supabase.from("universities").select("institution_name,logo_url,configuration").eq("slug", slug).maybeSingle().then(({ data }) => {
      if (!data) return;
      setInstitution(data.institution_name);
      setLogo(data.logo_url);
      const cfg = data.configuration as { closing_message?: string };
      setClosing(cfg?.closing_message || "");
    });
  }, [slug]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* soft floating orbs */}
      <Orbs />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="relative z-10 max-w-lg text-center"
      >
        {logo && <img src={logo} alt="" className="mx-auto h-14 w-14 object-contain" />}
        <p className="label-mono mt-4">{institution}</p>

        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 180 }}
          className="mx-auto mt-8 grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success glow-ring"
        >
          <Check className="h-10 w-10" strokeWidth={2.5} />
        </motion.div>

        <h1 className="mt-8 text-4xl font-semibold tracking-[-0.02em]">Your interview is complete</h1>
        <div className="surface-card mt-8 p-6 text-left text-sm leading-relaxed text-muted-foreground">
          {closing || "Thank you for your time. One of our team members will review your interview and be in touch with you shortly regarding next steps."}
        </div>
        <p className="mt-6 text-xs text-muted-foreground">You may now close this window.</p>
      </motion.div>
    </div>
  );
}

function Orbs() {
  const orbs = Array.from({ length: 14 });
  return (
    <div className="pointer-events-none absolute inset-0">
      {orbs.map((_, i) => (
        <motion.div
          key={i}
          initial={{ y: "110vh", x: `${Math.random() * 100}vw`, opacity: 0 }}
          animate={{ y: "-10vh", opacity: [0, 0.6, 0] }}
          transition={{ duration: 6 + Math.random() * 4, delay: Math.random() * 2, repeat: Infinity, ease: "linear" }}
          className="absolute h-2 w-2 rounded-full bg-primary/40 blur-[1px]"
        />
      ))}
    </div>
  );
}

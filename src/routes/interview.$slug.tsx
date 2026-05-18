import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, CheckCircle, Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { FixedQuestion, InterviewConfiguration, University } from "@/lib/types";
import { DEFAULT_CLOSING, DEFAULT_INTRO } from "@/lib/types";

export const Route = createFileRoute("/interview/$slug")({
  head: () => ({
    meta: [
      { title: "Interview — SGT" },
      { name: "description", content: "Your scheduled AI interview. Please ensure you have a working camera and microphone." },
    ],
  }),
  component: InterviewRoom,
});

type Phase = "loading" | "notfound" | "permission" | "identity" | "intro_playing" | "ready" | "recording" | "transitioning" | "closing";

interface Identity { name: string; email: string; reference: string; }

function InterviewRoom() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("loading");
  const [uni, setUni] = useState<University | null>(null);
  const [identity, setIdentity] = useState<Identity>({ name: "", email: "", reference: "" });
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [transcript, setTranscript] = useState<{ question: string; answer_blob_url?: string; duration_s?: number }[]>([]);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  // Load configuration
  useEffect(() => {
    supabase.from("universities").select("*").eq("slug", slug).maybeSingle().then(({ data, error }) => {
      if (error || !data) { setPhase("notfound"); return; }
      setUni(data as unknown as University);
      setPhase("permission");
    });
  }, [slug]);

  // Build the question list (v1: openers for reasoning mode; AI follow-ups come next iteration)
  const questions: FixedQuestion[] = useMemo(() => {
    if (!uni) return [];
    const cfg = uni.configuration as InterviewConfiguration;
    if (cfg.mode === "fixed") return cfg.fixed_questions ?? [];
    if (cfg.mode === "clarifying") return (cfg.clarifying_questions ?? []).map((q) => ({ id: q.id, question_text: q.question_text, time_limit_seconds: q.time_limit_seconds }));
    return cfg.opening_questions ?? [];
  }, [uni]);

  const currentQ = questions[questionIndex];
  const totalQs = questions.length;
  const introText = (uni?.configuration as InterviewConfiguration | undefined)?.intro_message || DEFAULT_INTRO.replace("[Institution Name]", uni?.institution_name ?? "the institution");
  const closingText = (uni?.configuration as InterviewConfiguration | undefined)?.closing_message || DEFAULT_CLOSING;

  /* Speech synthesis */
  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (typeof window === "undefined" || !window.speechSynthesis) { onEnd?.(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.98; u.pitch = 1; u.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => /Google UK English Female|Samantha|Karen|Daniel/i.test(v.name)) ?? voices.find((v) => v.lang.startsWith("en"));
    if (preferred) u.voice = preferred;
    u.onend = () => onEnd?.();
    window.speechSynthesis.speak(u);
  }, []);

  /* Permission gate → camera setup */
  const requestPermissions = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280 }, audio: true });
      streamRef.current = stream;
      setPhase("identity");
    } catch (e) {
      alert("Camera & microphone access is required to begin the interview.");
    }
  }, []);

  /* Attach camera to video element whenever it exists */
  useEffect(() => {
    if (videoRef.current && streamRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
    }
  });

  /* Start interview after identity */
  const beginInterview = useCallback(async () => {
    if (!uni) return;
    const { data, error } = await supabase.from("interview_sessions").insert({
      university_id: uni.id,
      student_name: identity.name,
      student_email: identity.email,
      student_reference: identity.reference,
      started_at: new Date().toISOString(),
      status: "in_progress",
    }).select("id").single();
    if (error) { alert(error.message); return; }
    setSessionId(data.id);
    setPhase("intro_playing");
    speak(introText, () => {
      if (currentQ) {
        speak(currentQ.question_text, () => setPhase("ready"));
      } else {
        setPhase("closing");
      }
    });
  }, [uni, identity, introText, currentQ, speak]);

  /* Timer */
  useEffect(() => {
    if (phase !== "recording") return;
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          submitAnswer();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const startRecording = useCallback(() => {
    if (!streamRef.current || !currentQ) return;
    chunksRef.current = [];
    const mr = new MediaRecorder(streamRef.current, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm" });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start();
    recorderRef.current = mr;
    recordStartRef.current = Date.now();
    setTimeLeft(currentQ.time_limit_seconds);
    setPhase("recording");
  }, [currentQ]);

  const submitAnswer = useCallback(() => {
    const mr = recorderRef.current;
    if (!mr) return;
    const duration_s = Math.round((Date.now() - recordStartRef.current) / 1000);
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const next = [...transcript, { question: currentQ?.question_text ?? "", answer_blob_url: url, duration_s }];
      setTranscript(next);

      setPhase("transitioning");
      const nextIdx = questionIndex + 1;
      window.setTimeout(() => {
        if (nextIdx >= questions.length) {
          // Closing
          setPhase("closing");
          speak(closingText, async () => {
            if (sessionId) {
              await supabase.from("interview_sessions").update({
                completed_at: new Date().toISOString(),
                status: "completed",
                full_transcript: next.map((t) => ({ question: t.question, duration_s: t.duration_s })) as any,
              }).eq("id", sessionId);
            }
            navigate({ to: "/interview/$slug/complete", params: { slug } });
          });
        } else {
          setQuestionIndex(nextIdx);
          const nq = questions[nextIdx];
          speak(nq.question_text, () => setPhase("ready"));
        }
      }, 450);
    };
    mr.stop();
  }, [currentQ, transcript, questionIndex, questions, sessionId, closingText, navigate, slug, speak]);

  // Cleanup
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  /* Renders */
  if (phase === "loading") {
    return <FullCenter><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></FullCenter>;
  }
  if (phase === "notfound") {
    return <FullCenter><div className="text-center"><p className="label-mono">404</p><h1 className="mt-2 text-2xl font-semibold">Interview not found</h1><p className="mt-2 text-sm text-muted-foreground">This link is invalid or has been removed.</p></div></FullCenter>;
  }
  if (phase === "permission") {
    return (
      <FullCenter>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="surface-card max-w-md p-10 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary"><Camera className="h-6 w-6" /></div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">Camera access required</h1>
          <p className="mt-3 text-sm text-muted-foreground">We need your camera and microphone to conduct your interview. Your video is recorded only for {uni?.institution_name ?? "the institution"}'s admissions team.</p>
          <button onClick={requestPermissions} className="mt-8 w-full rounded-[10px] bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">
            Allow camera & microphone
          </button>
        </motion.div>
      </FullCenter>
    );
  }
  if (phase === "identity") {
    const ready = identity.name.trim() && identity.email.trim();
    return (
      <FullCenter>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="surface-card w-full max-w-md p-8">
          {uni?.logo_url && <img src={uni.logo_url} alt="" className="mx-auto h-12 w-12 object-contain" />}
          <p className="label-mono mt-4 text-center">{uni?.institution_name}</p>
          <h1 className="mt-2 text-center text-2xl font-semibold tracking-tight">Before we begin</h1>
          <div className="mt-8 space-y-4">
            <Input label="Full name" value={identity.name} onChange={(v) => setIdentity({ ...identity, name: v })} />
            <Input label="Email" type="email" value={identity.email} onChange={(v) => setIdentity({ ...identity, email: v })} />
            <Input label="Student ID or application reference" value={identity.reference} onChange={(v) => setIdentity({ ...identity, reference: v })} />
          </div>
          <button onClick={beginInterview} disabled={!ready} className="mt-8 w-full rounded-[10px] bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">
            Begin interview
          </button>
        </motion.div>
      </FullCenter>
    );
  }

  /* Main interview view */
  const speaking = phase === "intro_playing" || phase === "transitioning" || phase === "closing";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-6 py-8 md:grid-cols-[1.2fr_1fr]">
        {/* Avatar */}
        <div className="relative flex flex-col items-center justify-center rounded-[20px] border border-border bg-surface p-10">
          {uni?.logo_url && <img src={uni.logo_url} alt="" className="absolute left-6 top-6 h-9 w-9 object-contain" />}
          <div className={`relative h-48 w-48 rounded-full bg-gradient-to-br from-primary/30 to-elevated ${speaking ? "animate-pulse-ring" : "animate-breathe"}`}>
            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-elevated to-background grid place-items-center">
              <span className="font-display text-5xl font-semibold tracking-tight text-foreground">A</span>
            </div>
          </div>
          <p className="mt-8 label-mono">Interviewer</p>
          <h2 className="mt-2 text-xl font-semibold">Alex</h2>
          <p className="mt-1 text-sm text-muted-foreground">{uni?.institution_name}</p>
        </div>

        {/* Webcam */}
        <div className="relative flex flex-col rounded-[20px] border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${phase === "recording" ? "bg-danger animate-pulse" : "bg-muted-foreground/50"}`} />
              <span className="label-mono">{phase === "recording" ? "Recording" : "Standby"}</span>
            </div>
            {phase === "recording" && <Timer s={timeLeft} />}
          </div>
          <div className="relative mt-4 flex-1 overflow-hidden rounded-[16px] bg-background">
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          </div>
        </div>

        {/* Question + actions */}
        <div className="md:col-span-2">
          <div className="surface-card p-8">
            <AnimatePresence mode="wait">
              {phase === "intro_playing" ? (
                <motion.div key="intro" initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(4px)" }} transition={{ duration: 0.4 }}>
                  <p className="label-mono">Introduction</p>
                  <p className="mt-3 text-lg leading-relaxed text-muted-foreground">Alex is introducing the interview. Please listen — buttons will appear when it's your turn.</p>
                </motion.div>
              ) : phase === "closing" ? (
                <motion.div key="closing" initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ duration: 0.4 }}>
                  <p className="label-mono text-success">Closing</p>
                  <p className="mt-3 text-lg leading-relaxed">Thank you. Alex is delivering the closing message…</p>
                </motion.div>
              ) : currentQ ? (
                <motion.div key={`q-${questionIndex}`} initial={{ opacity: 0, filter: "blur(4px)", y: 8 }} animate={{ opacity: 1, filter: "blur(0px)", y: 0 }} exit={{ opacity: 0, filter: "blur(4px)" }} transition={{ duration: 0.4 }}>
                  <p className="label-mono">Question {questionIndex + 1} {totalQs ? `of ${totalQs}` : ""}</p>
                  <h2 className="mt-3 text-2xl font-semibold leading-snug tracking-tight md:text-3xl">{currentQ.question_text}</h2>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="mt-8 flex flex-col items-center gap-2">
              {phase === "ready" && (
                <button onClick={startRecording} className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-[10px] bg-primary px-6 py-4 text-sm font-medium text-primary-foreground hover:opacity-90">
                  <Mic className="h-4 w-4" /> I am ready — start recording
                </button>
              )}
              {phase === "recording" && (
                <>
                  <button onClick={submitAnswer} className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-[10px] bg-success px-6 py-4 text-sm font-medium text-background hover:opacity-90">
                    <CheckCircle className="h-4 w-4" /> Submit answer
                  </button>
                  <p className="mt-2 text-xs text-muted-foreground">Once submitted, you cannot re-record this answer.</p>
                </>
              )}
              {phase === "transitioning" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Preparing next question…</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Timer({ s }: { s: number }) {
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  const colour = s > 60 ? "text-success" : s > 30 ? "text-warning" : "text-danger";
  return <span className={`font-mono text-lg tabular-nums ${colour} ${s <= 30 ? "animate-pulse" : ""}`}>{mm}:{ss}</span>;
}

function FullCenter({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center px-4">{children}</div>;
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-[10px] border border-border bg-elevated px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
    </label>
  );
}

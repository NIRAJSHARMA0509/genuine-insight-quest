import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, CheckCircle, Camera, Loader2, ShieldAlert, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Organisation, Test, TestLevel, Question, QuestionRubric, Objective, ObjectiveCriterion } from "@/lib/types";
import { DEFAULT_CLOSING, DEFAULT_INTRO } from "@/lib/types";
import { synthesizeAlexVoice } from "@/lib/tts.functions";
import { generateReasoningQuestion, generateClarifyingFollowUp, generatePrepFeedback, expandMessage, transcribeAudio } from "@/lib/ai.functions";
import alexAvatar from "@/assets/alex-avatar.jpg";

export const Route = createFileRoute("/interview/$slug")({
  head: () => ({
    meta: [
      { title: "Interview — SGT" },
      { name: "description", content: "Your scheduled AI interview. Please ensure you have a working camera and microphone." },
    ],
  }),
  component: InterviewRoom,
});

type Phase =
  | "loading"
  | "notfound"
  | "permission"
  | "identity"
  | "preparing"
  | "intro_playing"
  | "ready"
  | "recording"
  | "transitioning"
  | "feedback"
  | "closing"
  | "suspended";

interface Identity { name: string; email: string; reference: string; }
interface TranscriptEntry { question: string; level_id: string; duration_s: number; answer_text: string; parent_question_id?: string | null; }
interface PrepFeedback { score: number; feedback: string; improvement_tip: string; }

const RECORD_CAP_S = 600;

function InterviewRoom() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const fetchVoice = useServerFn(synthesizeAlexVoice);
  const reasoningFn = useServerFn(generateReasoningQuestion);
  const clarifyFn = useServerFn(generateClarifyingFollowUp);
  const prepFn = useServerFn(generatePrepFeedback);
  const expandFn = useServerFn(expandMessage);
  const transcribeFn = useServerFn(transcribeAudio);

  const [phase, setPhase] = useState<Phase>("loading");
  const [org, setOrg] = useState<Organisation | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [levels, setLevels] = useState<TestLevel[]>([]);
  const [questionsByLevel, setQuestionsByLevel] = useState<Record<string, Question[]>>({});
  const [objectivesByLevel, setObjectivesByLevel] = useState<Record<string, Objective[]>>({});

  const [identity, setIdentity] = useState<Identity>({ name: "", email: "", reference: "" });
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [levelIdx, setLevelIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0); // question within current level
  const [currentQuestion, setCurrentQuestion] = useState<{ text: string; think_s: number; answer_s: number; question_id: string | null; is_follow_up: boolean } | null>(null);
  const [followUpsAsked, setFollowUpsAsked] = useState(0); // for current clarifying parent
  const [reasoningCount, setReasoningCount] = useState(0); // AI questions asked in current reasoning level

  const [timeLeft, setTimeLeft] = useState(0);
  const [thinkLeft, setThinkLeft] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [prepFeedback, setPrepFeedback] = useState<PrepFeedback | null>(null);
  const [suspendReason, setSuspendReason] = useState<string>("");
  const [resolvedClosing, setResolvedClosing] = useState<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const thinkTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const violationsRef = useRef(0);
  const phaseRef = useRef<Phase>("loading");
  // live speech-to-text capture
  const recognitionRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const liveTranscriptRef = useRef<string>("");
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  /* ---------------- Load configuration ---------------- */
  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from("tests").select("*").eq("slug", slug).maybeSingle();
      if (!t) { setPhase("notfound"); return; }
      const testData = t as Test;
      const { data: o } = await supabase.from("organisations").select("*").eq("id", testData.organisation_id).maybeSingle();
      const { data: lv } = await supabase.from("test_levels").select("*").eq("test_id", testData.id).order("order_index");
      const lvls = (lv as TestLevel[] | null) ?? [];
      const levelIds = lvls.map((l) => l.id);

      const qMap: Record<string, Question[]> = {};
      const oMap: Record<string, Objective[]> = {};
      if (levelIds.length) {
        const [{ data: qs }, { data: objs }] = await Promise.all([
          supabase.from("questions").select("*").in("level_id", levelIds).order("order_index"),
          supabase.from("objectives").select("*").in("level_id", levelIds).order("order_index"),
        ]);
        const qList = (qs as Question[] | null) ?? [];
        const oList = (objs as Objective[] | null) ?? [];
        const qIds = qList.map((q) => q.id);
        const oIds = oList.map((x) => x.id);
        const [{ data: rubs }, { data: crits }] = await Promise.all([
          qIds.length ? supabase.from("question_rubrics").select("*").in("question_id", qIds).order("order_index") : Promise.resolve({ data: [] as QuestionRubric[] }),
          oIds.length ? supabase.from("objective_criteria").select("*").in("objective_id", oIds).order("order_index") : Promise.resolve({ data: [] as ObjectiveCriterion[] }),
        ]);
        const rubricList = (rubs as QuestionRubric[] | null) ?? [];
        const critList = (crits as ObjectiveCriterion[] | null) ?? [];
        for (const q of qList) {
          (qMap[q.level_id] ||= []).push({ ...q, rubrics: rubricList.filter((r) => r.question_id === q.id) });
        }
        for (const ob of oList) {
          (oMap[ob.level_id] ||= []).push({ ...ob, criteria: critList.filter((c) => c.objective_id === ob.id) });
        }
      }

      setTest(testData);
      setOrg((o as Organisation | null) ?? null);
      setLevels(lvls);
      setQuestionsByLevel(qMap);
      setObjectivesByLevel(oMap);
      setPhase("permission");
    })();
  }, [slug]);

  const introText = test?.intro_message || DEFAULT_INTRO;
  const closingText = test?.closing_message || DEFAULT_CLOSING;

  /* ---------------- ElevenLabs voice ---------------- */
  const speak = useCallback(async (text: string, onEnd?: () => void) => {
    try {
      setIsSpeaking(true);
      const result = await fetchVoice({ data: { text } });
      if (!result.ok) {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance(text);
          u.lang = "en-GB"; u.rate = 0.98;
          u.onend = () => { setIsSpeaking(false); onEnd?.(); };
          u.onerror = () => { setIsSpeaking(false); onEnd?.(); };
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
          return;
        }
        setIsSpeaking(false); onEnd?.(); return;
      }
      if (audioRef.current) { try { audioRef.current.pause(); } catch { /* noop */ } }
      const audio = new Audio(`data:audio/mpeg;base64,${result.audioBase64}`);
      audioRef.current = audio;
      const finish = () => { setIsSpeaking(false); onEnd?.(); };
      audio.onended = finish; audio.onerror = finish;
      await audio.play();
    } catch (e) {
      console.error("TTS failed:", e);
      setIsSpeaking(false); onEnd?.();
    }
  }, [fetchVoice]);

  /* ---------------- Permission ---------------- */
  const requestPermissions = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280 }, audio: true });
      streamRef.current = stream;
      setPhase("identity");
    } catch {
      toast.error("Camera & microphone access is required to begin the interview.");
    }
  }, []);

  useEffect(() => {
    if (videoRef.current && streamRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
    }
  });

  /* ---------------- Question advancement ---------------- */
  // (totalLevels / currentLevel deliberately not surfaced — students see one continuous interview)

  // Pick or generate the next question. Returns null if we should advance level.
  // When a follow-up is generated for the same parent clarifying question, qIndex stays the same.
  const computeNextQuestion = useCallback(async (
    lvlIndex: number,
    qIndex: number,
    rCount: number,
    trans: TranscriptEntry[],
    followUps: number,
    lastAnswerText: string,
  ): Promise<{ text: string; think_s: number; answer_s: number; question_id: string | null; is_follow_up: boolean; rCountNext: number; followUpsNext: number; advanceQIdx: boolean } | null> => {
    const lvl = levels[lvlIndex];
    if (!lvl) return null;
    const list = questionsByLevel[lvl.id] ?? [];
    const objs = objectivesByLevel[lvl.id] ?? [];

    // Behaviour is now driven by DATA, not just the mode flag:
    //  1. If the most-recent parent question still has follow-ups budget left → generate a clarifying follow-up.
    //  2. Else if there's another fixed question in the list → ask it.
    //  3. Else if this level has objectives → ask AI reasoning questions until budget exhausted.
    //  4. Else → null (advance level).

    // (1) Follow-up on most recent parent
    const currentParent = list[qIndex - 1];
    if (currentParent && followUps < (currentParent.max_follow_ups ?? 0)) {
      try {
        const priorFollowUps = trans
          .filter((t) => t.parent_question_id === currentParent.id)
          .map((t) => ({ question: t.question, answer: t.answer_text }));
        const answerForAi = lastAnswerText.trim().length > 0
          ? lastAnswerText
          : "(Live transcript unavailable — the candidate gave a spoken answer that was not captured. Ask a thoughtful follow-up that probes a likely interesting angle of the parent question without assuming specific content of their response.)";
        const r = await clarifyFn({
          data: {
            parent_question: currentParent.question_text,
            candidate_answer: answerForAi,
            follow_ups_so_far: priorFollowUps,
            objectives: objs.map((o) => ({ title: o.title, description: o.description ?? undefined })),
          },
        });
        if (r.question_text?.trim()) {
          return { text: r.question_text.trim(), think_s: 15, answer_s: 90, question_id: currentParent.id, is_follow_up: true, rCountNext: rCount, followUpsNext: followUps + 1, advanceQIdx: false };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("clarifying follow-up failed", e);
        toast.error("Follow-up generation failed", { description: msg.slice(0, 200) });
      }
    }

    // (2) Next fixed question in the list
    const nextFixed = list[qIndex];
    if (nextFixed) {
      return {
        text: nextFixed.question_text,
        think_s: nextFixed.think_time_seconds ?? 30,
        answer_s: Math.min(nextFixed.answer_time_seconds ?? 120, RECORD_CAP_S),
        question_id: nextFixed.id,
        is_follow_up: false,
        rCountNext: rCount,
        followUpsNext: 0,
        advanceQIdx: true,
      };
    }

    // (3) Reasoning over objectives (if any are configured for this level)
    if (objs.length > 0) {
      const declaredBudget = lvl.mode === "reasoning" ? (lvl.ai_question_budget ?? 5) : Math.max(objs.length, 3);
      const budget = Math.max(declaredBudget, objs.length);
      if (rCount >= budget) return null;
      try {
        const result = await reasoningFn({
          data: {
            objectives: objs.map((o) => ({
              title: o.title,
              description: o.description ?? undefined,
              criteria: (o.criteria ?? []).map((c) => ({ criterion: c.criterion, score: c.score })),
            })),
            previous_transcript: trans.map((t) => ({ question: t.question, answer: t.answer_text || `(${t.duration_s}s recorded; no transcript)` })),
            question_number: rCount + 1,
          },
        });
        return {
          text: result.question_text || "Tell me more about your motivation.",
          think_s: 30,
          answer_s: 120,
          question_id: null,
          is_follow_up: false,
          rCountNext: rCount + 1,
          followUpsNext: 0,
          advanceQIdx: false,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("reasoning gen failed", e);
        toast.error("AI question failed", { description: msg.slice(0, 200) });
        return null;
      }
    }

    return null;
  }, [levels, questionsByLevel, objectivesByLevel, reasoningFn, clarifyFn]);

  /* ---------------- Recording ---------------- */
  const startRecording = useCallback(() => {
    if (!streamRef.current || !currentQuestion) return;
    if (thinkTimerRef.current) { window.clearInterval(thinkTimerRef.current); thinkTimerRef.current = null; }
    submittingRef.current = false;
    chunksRef.current = [];
    const mr = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm",
    });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start();
    recorderRef.current = mr;
    recordStartRef.current = Date.now();
    setTimeLeft(currentQuestion.answer_s);
    setPhase("recording");

    // Start live speech-to-text (best effort; ignored if unsupported)
    liveTranscriptRef.current = "";
    try {
      const w = window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-GB";
        rec.onresult = (ev: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          let finalChunk = "";
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            if (ev.results[i].isFinal) finalChunk += ev.results[i][0].transcript + " ";
          }
          if (finalChunk) liveTranscriptRef.current += finalChunk;
        };
        rec.onerror = () => { /* ignore */ };
        rec.start();
        recognitionRef.current = rec;
      }
    } catch { /* unsupported — proceed without transcript */ }
  }, [currentQuestion]);

  const startRecordingRef = useRef(startRecording);
  useEffect(() => { startRecordingRef.current = startRecording; }, [startRecording]);

  const advanceAfterAnswer = useCallback(async (entry: TranscriptEntry) => {
    const nextTranscript = [...transcript, entry];
    setTranscript(nextTranscript);
    setPhase("transitioning");

    // qIdx semantics: "next list index to fetch" — question just answered was list[qIdx-1] (if fixed/clarifying).
    const lvl = levels[levelIdx];
    let nextLevelIdx = levelIdx;
    let nextQIdx = qIdx;
    let nextR = reasoningCount;
    let nextFollowUps = followUpsAsked;
    let nextQ: Awaited<ReturnType<typeof computeNextQuestion>> = null;

    if (lvl) {
      nextQ = await computeNextQuestion(levelIdx, nextQIdx, reasoningCount, nextTranscript, followUpsAsked, entry.answer_text);
      if (nextQ) {
        nextFollowUps = nextQ.followUpsNext;
        if (nextQ.advanceQIdx) nextQIdx = qIdx + 1; // consumed list[qIdx], move pointer
        // if !advanceQIdx (follow-up or reasoning) keep qIdx as-is
      }
    }
    while (!nextQ && nextLevelIdx + 1 < levels.length) {
      nextLevelIdx += 1;
      nextQIdx = 0;
      nextR = 0;
      nextFollowUps = 0;
      nextQ = await computeNextQuestion(nextLevelIdx, 0, 0, nextTranscript, 0, "");
      if (nextQ) {
        nextFollowUps = nextQ.followUpsNext;
        if (nextQ.advanceQIdx) nextQIdx = 1; else nextQIdx = 0;
      }
    }

    if (!nextQ) {
      setPhase("closing");
      speak(resolvedClosing || closingText, async () => {
        if (sessionId) {
          await supabase.from("interview_sessions").update({
            completed_at: new Date().toISOString(),
            status: "completed",
            full_transcript: nextTranscript as never,
          }).eq("id", sessionId);
        }
        navigate({ to: "/interview/$slug/complete", params: { slug } });
      });
      return;
    }

    setLevelIdx(nextLevelIdx);
    setQIdx(nextQIdx);
    setReasoningCount(nextQ.rCountNext);
    setFollowUpsAsked(nextFollowUps);
    setCurrentQuestion({ text: nextQ.text, think_s: nextQ.think_s, answer_s: nextQ.answer_s, question_id: nextQ.question_id, is_follow_up: nextQ.is_follow_up });
    speak(nextQ.text, () => setPhase("ready"));
  }, [transcript, levels, levelIdx, qIdx, reasoningCount, followUpsAsked, computeNextQuestion, speak, closingText, resolvedClosing, sessionId, navigate, slug]);

  const submittingRef = useRef(false);
  const submitAnswer = useCallback(() => {
    if (submittingRef.current) return;
    const mr = recorderRef.current;
    if (!mr) return;
    submittingRef.current = true;
    // Immediate UI feedback so the user sees their click registered.
    setPhase((p) => (p === "recording" ? "transitioning" : p));
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    const duration_s = Math.round((Date.now() - recordStartRef.current) / 1000);
    const qText = currentQuestion?.text ?? "";
    const lvlId = levels[levelIdx]?.id ?? "";
    const parentId = currentQuestion?.question_id ?? null;
    // Stop STT and capture text
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    recognitionRef.current = null;
    const answerText = liveTranscriptRef.current.trim();
    mr.onstop = async () => {
      // Assemble recording blob for server-side transcription if live STT failed
      let resolvedAnswer = answerText;
      if (!resolvedAnswer && chunksRef.current.length > 0) {
        try {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "video/webm" });
          // Strip to audio-only mime hint for the model
          const buf = await blob.arrayBuffer();
          // Base64 encode
          let binary = "";
          const bytes = new Uint8Array(buf);
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          const b64 = btoa(binary);
          const t = await transcribeFn({ data: { audio_base64: b64, mime_type: "audio/webm" } });
          if (t.text) resolvedAnswer = t.text;
        } catch (e) {
          console.error("server transcription failed", e);
        }
      }
      const entry: TranscriptEntry = { question: qText, level_id: lvlId, duration_s, answer_text: resolvedAnswer, parent_question_id: parentId };

      if (test?.purpose === "preparation") {
        setPhase("feedback");
        try {
          const lvl = levels[levelIdx];
          const qList = lvl ? (questionsByLevel[lvl.id] ?? []) : [];
          const matchedQ = qList.find((q) => q.question_text === qText);
          const fb = await prepFn({
            data: {
              question_text: qText,
              answer_text: resolvedAnswer || `(Candidate spoke for ${duration_s}s; no transcript captured.)`,
              rubrics: (matchedQ?.rubrics ?? []).map((r) => ({ example_response: r.example_response, score: r.score })),
              objectives: lvl ? (objectivesByLevel[lvl.id] ?? []).map((o) => ({ title: o.title, description: o.description })) : [],
            },
          });
          setPrepFeedback(fb);
        } catch (e) {
          console.error("prep feedback failed", e);
          setPrepFeedback({ score: 0, feedback: "Couldn't generate feedback. Let's continue.", improvement_tip: "" });
        }
        pendingEntryRef.current = entry;
        return;
      }
      void advanceAfterAnswer(entry);
    };
    try { mr.stop(); } catch { /* noop */ }
  }, [currentQuestion, levels, levelIdx, test, questionsByLevel, objectivesByLevel, prepFn, advanceAfterAnswer, transcribeFn]);

  const pendingEntryRef = useRef<TranscriptEntry | null>(null);
  const submitAnswerRef = useRef(submitAnswer);
  useEffect(() => { submitAnswerRef.current = submitAnswer; }, [submitAnswer]);

  /* ---------------- Recording countdown ---------------- */
  useEffect(() => {
    if (phase !== "recording") return;
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { submitAnswerRef.current(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [phase]);

  /* ---------------- Thinking countdown ---------------- */
  useEffect(() => {
    if (phase !== "ready" || isSpeaking || !currentQuestion) return;
    const t0 = currentQuestion.think_s;
    if (t0 <= 0) { startRecordingRef.current(); return; }
    setThinkLeft(t0);
    thinkTimerRef.current = window.setInterval(() => {
      setThinkLeft((t) => {
        if (t <= 1) {
          if (thinkTimerRef.current) { window.clearInterval(thinkTimerRef.current); thinkTimerRef.current = null; }
          startRecordingRef.current();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (thinkTimerRef.current) { window.clearInterval(thinkTimerRef.current); thinkTimerRef.current = null; } };
  }, [phase, isSpeaking, currentQuestion]);

  /* ---------------- Proctoring ---------------- */
  const suspendInterview = useCallback(async (reason: string) => {
    setSuspendReason(reason);
    setPhase("suspended");
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    try { audioRef.current?.pause(); } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (sessionId) {
      await supabase.from("interview_sessions").update({
        completed_at: new Date().toISOString(),
        status: "suspended",
        proctoring_flags: [{ reason, at: new Date().toISOString() }] as never,
      }).eq("id", sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!test?.proctoring_enabled) return;
    const proctored: Phase[] = ["intro_playing", "ready", "recording", "transitioning", "feedback", "closing"];
    const isProctored = () => proctored.includes(phaseRef.current);
    const handle = (reason: string) => {
      if (!isProctored()) return;
      violationsRef.current += 1;
      if (violationsRef.current === 1) {
        toast.warning("Proctoring warning", { description: `${reason} Please stay on this tab — one more violation will end the interview.`, duration: 6000 });
      } else {
        void suspendInterview(reason);
      }
    };
    const onVis = () => { if (document.hidden) handle("You navigated away from the interview tab."); };
    const onBlur = () => handle("The interview window lost focus.");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
    };
  }, [test, suspendInterview]);

  /* ---------------- Begin ---------------- */


  const beginInterview = useCallback(async () => {
    if (!test || !org) return;
    try {
      const { data, error } = await supabase.from("interview_sessions").insert({
        test_id: test.id,
        organisation_id: org.id,
        student_name: identity.name,
        student_email: identity.email,
        student_reference: identity.reference,
        started_at: new Date().toISOString(),
        status: "in_progress",
      }).select("id").single();
      if (error) { toast.error(error.message); setPhase("identity"); return; }
      setSessionId(data.id);

      // Resolve intro / closing — expand via AI if mode is 'prompt'
      let introToSpeak = introText;
      let closingToSpeak = closingText;
      try {
        if (test.intro_mode === "prompt" && (test.intro_message ?? "").trim()) {
          const r = await expandFn({ data: { kind: "intro", prompt: test.intro_message!, organisation_name: org.name, test_name: test.name } });
          if (r.text) introToSpeak = r.text;
        }
        if (test.closing_mode === "prompt" && (test.closing_message ?? "").trim()) {
          const r = await expandFn({ data: { kind: "closing", prompt: test.closing_message!, organisation_name: org.name, test_name: test.name } });
          if (r.text) closingToSpeak = r.text;
        }
      } catch (e) {
        console.error("expandMessage failed", e);
      }
      setResolvedClosing(closingToSpeak);

      // Compute first question
      const firstQ = await computeNextQuestion(0, 0, 0, [], 0, "");
      if (!firstQ) {
        toast.error("This test has no questions configured yet.");
        setPhase("identity");
        return;
      }
      setLevelIdx(0); setQIdx(firstQ.advanceQIdx ? 1 : 0); setReasoningCount(firstQ.rCountNext); setFollowUpsAsked(firstQ.followUpsNext);
      setCurrentQuestion({ text: firstQ.text, think_s: firstQ.think_s, answer_s: firstQ.answer_s, question_id: firstQ.question_id, is_follow_up: firstQ.is_follow_up });
      setPhase("intro_playing");
      void speak(introToSpeak, () => {
        void speak(firstQ.text, () => setPhase("ready"));
      });
    } catch (e) {
      console.error("beginInterview failed", e);
      toast.error("Something went wrong. Please try again.");
      setPhase("identity");
    }
  }, [test, org, identity, introText, closingText, computeNextQuestion, speak, expandFn]);

  /* ---------------- Cleanup ---------------- */
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try { audioRef.current?.pause(); } catch { /* noop */ }
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (thinkTimerRef.current) window.clearInterval(thinkTimerRef.current);
  }, []);

  const continueFromFeedback = useCallback(() => {
    const entry = pendingEntryRef.current;
    pendingEntryRef.current = null;
    setPrepFeedback(null);
    if (entry) void advanceAfterAnswer(entry);
  }, [advanceAfterAnswer]);

  /* ---------------- Renders ---------------- */
  if (phase === "loading") return <FullCenter><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></FullCenter>;
  if (phase === "notfound") return <FullCenter><div className="text-center"><p className="label-mono">404</p><h1 className="mt-2 text-2xl font-semibold">Interview not found</h1><p className="mt-2 text-sm text-muted-foreground">This link is invalid or has been removed.</p></div></FullCenter>;
  if (phase === "suspended") {
    return (
      <FullCenter>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="surface-card max-w-md p-10 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger/15 text-danger"><ShieldAlert className="h-6 w-6" /></div>
          <p className="label-mono mt-6 text-danger">Interview suspended</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Session has been ended</h1>
          <p className="mt-3 text-sm text-muted-foreground">{suspendReason || "A proctoring rule was violated."}</p>
          <p className="mt-4 text-xs text-muted-foreground">If you believe this is a mistake, please contact {org?.name ?? "the organisation"}'s team.</p>
        </motion.div>
      </FullCenter>
    );
  }
  if (phase === "permission") {
    return (
      <FullCenter>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="surface-card max-w-md p-10 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary"><Camera className="h-6 w-6" /></div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">Camera access required</h1>
          <p className="mt-3 text-sm text-muted-foreground">We need your camera and microphone to conduct your interview. Your video is recorded only for {org?.name ?? "the organisation"}'s team.</p>
          <button onClick={requestPermissions} className="mt-8 w-full rounded-[10px] bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">Allow camera & microphone</button>
        </motion.div>
      </FullCenter>
    );
  }
  if (phase === "identity" || phase === "preparing") {
    const ready = identity.name.trim() && identity.email.trim();
    return (
      <FullCenter>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="surface-card w-full max-w-md p-8">
          {org?.logo_url && <img src={org.logo_url} alt="" className="mx-auto h-12 w-12 object-contain" />}
          <p className="label-mono mt-4 text-center">{org?.name}</p>
          <h1 className="mt-2 text-center text-2xl font-semibold tracking-tight">{test?.name}</h1>
          {test?.attempts_context_note && <p className="mt-3 text-center text-xs text-muted-foreground">{test.attempts_context_note}</p>}
          {phase === "preparing" ? (
            <div className="mt-8 flex flex-col items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight">Preparing your Interview Room</h2>
              <p className="text-sm text-muted-foreground">This will only take a moment…</p>
            </div>
          ) : (
            <>
              <div className="mt-8 space-y-4">
                <Input label="Full name" value={identity.name} onChange={(v) => setIdentity({ ...identity, name: v })} />
                <Input label="Email" type="email" value={identity.email} onChange={(v) => setIdentity({ ...identity, email: v })} />
                <Input label="Student ID or application reference" value={identity.reference} onChange={(v) => setIdentity({ ...identity, reference: v })} />
              </div>
              <button
                onClick={() => { setPhase("preparing"); void beginInterview(); }}
                disabled={!ready}
                className="mt-8 w-full rounded-[10px] bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                Begin interview
              </button>
              <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">By starting, you agree that your camera, microphone and tab focus will be monitored throughout the interview.</p>
            </>
          )}
        </motion.div>
      </FullCenter>
    );
  }

  // (level label intentionally not shown to the candidate)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-6 py-8 md:grid-cols-[1.2fr_1fr]">
        <div className="relative flex flex-col items-center justify-center rounded-[20px] border border-border bg-surface p-10">
          {org?.logo_url && <img src={org.logo_url} alt="" className="absolute left-6 top-6 h-9 w-9 object-contain" />}
          <div className={`relative h-48 w-48 rounded-full p-[3px] ${isSpeaking ? "animate-pulse-ring bg-gradient-to-br from-primary to-primary/40" : "animate-breathe bg-gradient-to-br from-elevated to-border"}`}>
            <img src={alexAvatar} alt="Alex, your AI interviewer" className="h-full w-full rounded-full object-cover" />
          </div>
          <p className="mt-8 label-mono">Interviewer</p>
          <h2 className="mt-2 text-xl font-semibold">Alex</h2>
          <p className="mt-1 text-sm text-muted-foreground">{org?.name}</p>
          {/* level/mode intentionally hidden from candidate */}
        </div>

        <div className="relative flex flex-col rounded-[20px] border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${phase === "recording" ? "bg-danger animate-pulse" : "bg-muted-foreground/50"}`} />
              <span className="label-mono">{phase === "recording" ? "Recording" : "Standby"}</span>
            </div>
            {phase === "recording" && <Timer s={timeLeft} />}
            {phase === "ready" && !isSpeaking && currentQuestion && currentQuestion.think_s > 0 && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2 rounded-full bg-warning/15 px-3 py-1.5 ring-1 ring-warning/40">
                <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
                <span className="text-xs font-medium text-warning">Auto-starts in</span>
                <span className="font-mono text-base font-bold tabular-nums text-warning">{String(thinkLeft).padStart(2, "0")}s</span>
              </motion.div>
            )}
          </div>
          <div className="relative mt-4 flex-1 overflow-hidden rounded-[16px] bg-background">
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="surface-card p-8">
            <AnimatePresence mode="wait">
              {phase === "intro_playing" ? (
                <motion.div key="intro" initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(4px)" }} transition={{ duration: 0.4 }}>
                  <p className="label-mono">Introduction</p>
                  <p className="mt-3 text-lg leading-relaxed text-muted-foreground">Alex is introducing the interview. Please listen carefully — buttons will appear when it's your turn.</p>
                </motion.div>
              ) : phase === "closing" ? (
                <motion.div key="closing" initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ duration: 0.4 }}>
                  <p className="label-mono text-success">Closing</p>
                  <p className="mt-3 text-lg leading-relaxed">Thank you. Alex is delivering the closing message…</p>
                </motion.div>
              ) : phase === "feedback" && prepFeedback ? (
                <motion.div key="fb" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                  <p className="label-mono text-primary">Coach feedback</p>
                  <div className="mt-3 flex items-baseline gap-3">
                    <span className="text-3xl font-semibold tabular-nums">{prepFeedback.score}</span>
                    <span className="text-sm text-muted-foreground">indicative score</span>
                  </div>
                  <p className="mt-4 text-base leading-relaxed">{prepFeedback.feedback}</p>
                  {prepFeedback.improvement_tip && (
                    <div className="mt-4 rounded-[12px] border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed">
                      <span className="label-mono text-primary">Try this</span>
                      <p className="mt-2">{prepFeedback.improvement_tip}</p>
                    </div>
                  )}
                </motion.div>
              ) : currentQuestion ? (
                <motion.div key={`q-${levelIdx}-${qIdx}-${reasoningCount}`} initial={{ opacity: 0, filter: "blur(4px)", y: 8 }} animate={{ opacity: 1, filter: "blur(0px)", y: 0 }} exit={{ opacity: 0, filter: "blur(4px)" }} transition={{ duration: 0.4 }}>
                  <p className="label-mono">Question</p>
                  <h2 className="mt-3 text-2xl font-semibold leading-snug tracking-tight md:text-3xl">{currentQuestion.text}</h2>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="mt-8 flex flex-col items-center gap-2">
              {phase === "ready" && (
                <>
                  <button onClick={startRecording} disabled={isSpeaking} className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-[10px] bg-primary px-6 py-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">
                    <Mic className="h-4 w-4" /> I am ready — start recording
                  </button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {isSpeaking
                      ? "Listen to Alex — the timer starts when the question finishes."
                      : currentQuestion && currentQuestion.think_s > 0
                        ? `Recording auto-starts in ${thinkLeft}s. You'll then have up to ${Math.round(currentQuestion.answer_s / 60)} minute(s) to answer.`
                        : "Recording starts immediately."}
                  </p>
                </>
              )}
              {phase === "recording" && (
                <>
                  <button onClick={submitAnswer} disabled={submittingRef.current} className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-[10px] bg-success px-6 py-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60">
                    <CheckCircle className="h-4 w-4" /> Submit answer
                  </button>
                  <p className="mt-2 text-xs text-muted-foreground">Once submitted, you cannot re-record this answer.</p>
                </>
              )}
              {phase === "transitioning" && (
                <ProcessingSteps />
              )}

              {phase === "feedback" && (
                <>
                  {!prepFeedback ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Generating feedback…</div>
                  ) : (
                    <button onClick={continueFromFeedback} className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-[10px] bg-primary px-6 py-4 text-sm font-medium text-primary-foreground hover:opacity-90">
                      Continue <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </>
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

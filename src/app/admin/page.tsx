"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createRound,
  fetchGameSnapshot,
  replaceOptions,
  resetGame,
  saveQuestionBank,
  showFinalResults,
  setCurrentRound,
  setGamePhase,
} from "@/lib/game-api";
import { useGameRealtime } from "@/hooks/use-game-realtime";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { GameSnapshot } from "@/types/game";

type EditableQuestion = { id?: string; prompt: string; score_modifier: 1 | -1 };

/** Voting needs at least two distinct choices. */
const MIN_PLAYER_OPTIONS = 2;

const FIXED_QUESTION_QUEUE: Array<{ prompt: string; score_modifier: 1 | -1 }> = [
  { prompt: "WHO IS GOING TO WRITE SONGS ABOUT YOU... BAD SONGS?", score_modifier: -1 },
  {
    prompt: "WHO WOULD TAKE YOU ON THE BEST DATE... AND ACTUALLY TEXT THE NEXT DAY?",
    score_modifier: 1,
  },
  { prompt: "WHO'S THE BIGGEST MANSPLAINER?", score_modifier: -1 },
  { prompt: "WHO IS THE BEST KISSER?", score_modifier: 1 },
  { prompt: "WHO WOULD SAY \"I LOVE YOU\" WAY TOO SOON?", score_modifier: -1 },
  { prompt: "WHO WILL AGE GRACEFULLY?", score_modifier: 1 },
  { prompt: "WHO WILL YOUR FRIENDS HATE... BUT YOU WILL STILL BE INTO THEM?", score_modifier: -1 },
  { prompt: "WHO IS THE BEST COOK?", score_modifier: 1 },
  { prompt: "WHO WOULD SPEND LONGER GETTING READY THAN YOU?", score_modifier: -1 },
  { prompt: "WHO'S A GIVER?", score_modifier: 1 },
  { prompt: "WHO HAS HOLES IN THEIR BOXERS?", score_modifier: -1 },
  { prompt: "WHO WILL BUY YOU FLOWERS FOR NO REASON?", score_modifier: 1 },
  { prompt: "WHO WILL LEAVE YOU WANTING MORE... AND NEVER GIVE IT?", score_modifier: -1 },
  { prompt: "WHO WON'T SEND UNSOLICITED DICK PICS?", score_modifier: 1 },
  { prompt: "WHO HAS AN ONLY FANS ACCOUNT?", score_modifier: -1 },
  { prompt: "WHO IS MARRIAGE MATERIAL?", score_modifier: 1 },
];

function mergeFixedQueueWithDb(questionsFromDb: GameSnapshot["questionBank"]): EditableQuestion[] {
  const byPrompt = new Map(
    questionsFromDb.map((question) => [question.prompt.trim().toLowerCase(), question]),
  );
  return FIXED_QUESTION_QUEUE.map((fixed) => {
    const persisted = byPrompt.get(fixed.prompt.trim().toLowerCase());
    return {
      id: persisted?.id,
      prompt: fixed.prompt,
      score_modifier: fixed.score_modifier,
    };
  });
}

export default function AdminPage() {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [fileOptions, setFileOptions] = useState<Array<{ name: string; image_url: string }>>([]);
  const [questions, setQuestions] = useState<EditableQuestion[]>(() => mergeFixedQueueWithDb([]));
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const autoScoredRoundRef = useRef<string | null>(null);

  const refresh = useCallback(
    async () => {
      const data = await fetchGameSnapshot();
      setSnapshot(data);
      setQuestions(mergeFixedQueueWithDb(data.questionBank));
    },
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch("/api/date-options")
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Could not load options."))))
        .then((payload: { options?: Array<{ name: string; image_url: string }> }) => {
          setFileOptions(payload.options ?? []);
        })
        .catch((error) => {
          console.warn("[party-game] date option files:", error);
          setFileOptions([]);
        });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useGameRealtime(() => {
    void refresh();
  });

  const allPlayersVoted = useMemo(() => {
    if (!snapshot || snapshot.state.phase !== "question" || !snapshot.currentRound) return false;
    if (snapshot.players.length === 0) return false;
    const uniqueVoters = new Set(snapshot.roundVotes.map((vote) => vote.player_id));
    return uniqueVoters.size >= snapshot.players.length;
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot?.currentRound) {
      autoScoredRoundRef.current = null;
      return;
    }
    if (!allPlayersVoted) return;
    if (autoScoredRoundRef.current === snapshot.currentRound.id) return;

    autoScoredRoundRef.current = snapshot.currentRound.id;
    const timer = setTimeout(() => {
      void setGamePhase("scoreboard");
    }, 0);
    return () => clearTimeout(timer);
  }, [allPlayersVoted, snapshot?.currentRound]);

  const usableOptions = useMemo(() => {
    const persistedByImageUrl = new Map(
      (snapshot?.options ?? []).map((option) => [option.image_url.trim(), option]),
    );
    return fileOptions
      .map((item) => {
        const cleanName = item.name.trim();
        const cleanUrl = item.image_url.trim();
        const persisted = persistedByImageUrl.get(cleanUrl);
        return { id: persisted?.id, name: cleanName, image_url: cleanUrl };
      })
      .filter((item) => item.name && item.image_url);
  }, [fileOptions, snapshot?.options]);

  const usableQuestions = useMemo(
    () =>
      questions
        .map((item) => ({
          id: item.id,
          prompt: item.prompt.trim(),
          score_modifier: item.score_modifier,
        }))
        .filter((item) => item.prompt),
    [questions],
  );

  const nextQuestion = useMemo(() => {
    if (!snapshot) return null;
    const used = new Set(
      snapshot.rounds.map((round) => round.question_bank_id).filter(Boolean) as string[],
    );
    return snapshot.questionBank.find((question) => !used.has(question.id)) ?? null;
  }, [snapshot]);

  const pushNextDisabled =
    busy !== null ||
    usableOptions.length < MIN_PLAYER_OPTIONS ||
    usableQuestions.length < 1;

  const pushNextBlockedHint = useMemo(() => {
    if (busy !== null) return null;
    const parts: string[] = [];
    if (usableOptions.length < MIN_PLAYER_OPTIONS) {
      parts.push(
        `Add ${MIN_PLAYER_OPTIONS - usableOptions.length} more image file(s) in public/date-options (need at least ${MIN_PLAYER_OPTIONS}; have ${usableOptions.length}).`,
      );
    }
    if (usableQuestions.length < 1) {
      parts.push("The built-in question queue is empty after sync.");
    }
    return parts.length > 0 ? parts.join(" ") : null;
  }, [busy, usableOptions.length, usableQuestions.length]);

  async function runAction(name: string, action: () => Promise<void>) {
    setBusy(name);
    setActionError(null);
    try {
      await action();
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      setActionError(message);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {!isSupabaseConfigured() ? (
          <div className="lg:col-span-2 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-950 shadow-lg">
            <p className="text-lg font-bold">Supabase environment variables are missing in this deployment.</p>
            <p className="mt-2 text-sm leading-relaxed">
              In Vercel: <strong>Settings → Environment Variables</strong>, add{" "}
              <code className="rounded bg-amber-100/80 px-1.5 py-0.5 font-mono text-xs">
                NEXT_PUBLIC_SUPABASE_URL
              </code>{" "}
              and{" "}
              <code className="rounded bg-amber-100/80 px-1.5 py-0.5 font-mono text-xs">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>{" "}
              (copy from Supabase → <strong>Project Settings → API</strong>). Then trigger a new{" "}
              <strong>Deploy</strong> — <code className="font-mono text-xs">NEXT_PUBLIC_*</code> values are
              baked in at build time.
            </p>
          </div>
        ) : null}
        <section className="rounded-3xl bg-white p-6 shadow-xl">
          <h1 className="font-display text-3xl font-black text-indigo-700">Admin Control Center</h1>
          <p className="mt-1 text-sm text-slate-500">
            Current mode: <span className="font-semibold">{snapshot?.state.phase ?? "loading"}</span>
          </p>
          {actionError ? (
            <div
              className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
              role="alert"
            >
              {actionError}
            </div>
          ) : null}

          <details className="mt-6 group rounded-2xl border border-slate-200 bg-slate-50/80 open:bg-slate-50">
            <summary className="cursor-pointer list-none rounded-2xl px-4 py-3 font-semibold text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="inline-flex w-full items-center justify-between gap-2">
                <span>Question queue ({FIXED_QUESTION_QUEUE.length} fixed)</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 group-open:hidden">
                  Show
                </span>
                <span className="hidden text-xs font-semibold uppercase tracking-wide text-slate-500 group-open:inline">
                  Hide
                </span>
              </span>
            </summary>
            <div className="space-y-3 border-t border-slate-200 p-4 pt-2">
              {questions.map((question, index) => (
                <div
                  key={question.id ?? `${question.prompt}-${index}`}
                  className="grid gap-2 rounded-2xl bg-white p-3 md:grid-cols-[1fr_auto]"
                >
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-900">
                    {question.prompt}
                  </p>
                  <span
                    className={`rounded-xl px-3 py-2 text-center text-sm font-black ${
                      question.score_modifier === -1
                        ? "bg-rose-100 text-rose-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {question.score_modifier === -1 ? "-1" : "+1"}
                  </span>
                </div>
              ))}
            </div>
          </details>

          <details className="mt-4 group rounded-2xl border border-slate-200 bg-slate-50/80 open:bg-slate-50">
            <summary className="cursor-pointer list-none rounded-2xl px-4 py-3 font-semibold text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="inline-flex w-full items-center justify-between gap-2">
                <span>Player options from files ({usableOptions.length})</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 group-open:hidden">
                  Show
                </span>
                <span className="hidden text-xs font-semibold uppercase tracking-wide text-slate-500 group-open:inline">
                  Hide
                </span>
              </span>
            </summary>
            <div className="space-y-3 border-t border-slate-200 p-4 pt-2">
              {usableOptions.map((option) => (
                <div
                  key={option.image_url}
                  className="grid gap-2 rounded-2xl bg-white p-3 md:grid-cols-[1fr_2fr]"
                >
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-900">
                    {option.name}
                  </p>
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {option.image_url}
                  </p>
                </div>
              ))}
            </div>
          </details>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pushNextDisabled}
              title={pushNextBlockedHint ?? "Sync options and questions, then start the next unused question."}
              onClick={() =>
                runAction("next", async () => {
                  await replaceOptions(usableOptions);
                  await saveQuestionBank(
                    usableQuestions.map((question, idx) => ({
                      ...question,
                      position: idx + 1,
                    })),
                  );
                  const latest = await fetchGameSnapshot();
                  if (latest.questionBank.length === 0) {
                    throw new Error(
                      "No questions found in the database queue. Ensure Supabase has the question_bank table and try Next Question again.",
                    );
                  }
                  const used = new Set(
                    latest.rounds.map((round) => round.question_bank_id).filter(Boolean) as string[],
                  );
                  const next = latest.questionBank.find((question) => !used.has(question.id));
                  if (!next) {
                    throw new Error(
                      "Every question in the queue has already been used. Use Reset Everything for a full wipe (this also clears the saved question list in the database).",
                    );
                  }
                  const round = await createRound(
                    next.prompt,
                    next.score_modifier === -1 ? -1 : 1,
                    next.id,
                  );
                  await setCurrentRound(round.id, "question");
                })
              }
              className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white disabled:opacity-50"
            >
              Next Question
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => runAction("scoreboard", async () => setGamePhase("scoreboard"))}
              className="rounded-xl bg-fuchsia-600 px-4 py-2 font-bold text-white disabled:opacity-50"
            >
              Show Scoreboard
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => runAction("final", showFinalResults)}
              className="rounded-xl bg-amber-600 px-4 py-2 font-bold text-white disabled:opacity-50"
            >
              Show Final Results
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => runAction("reset", resetGame)}
              className="rounded-xl bg-rose-600 px-4 py-2 font-bold text-white disabled:opacity-50"
            >
              Reset Everything
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-slate-900 p-6 text-white shadow-xl">
          <h2 className="text-2xl font-black">Live Session Stats</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>Players connected</dt>
              <dd className="font-bold">{snapshot?.players.length ?? 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Current question</dt>
              <dd className="max-w-[60%] text-right font-bold">
                {snapshot?.currentRound?.question ?? "No active round"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Votes this round</dt>
              <dd className="font-bold">{snapshot?.roundVotes.length ?? 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Queued remaining</dt>
              <dd className="font-bold">
                {nextQuestion ? "Yes" : "No"}
              </dd>
            </div>
          </dl>
          {nextQuestion ? (
            <div className="mt-4 rounded-xl bg-white/10 p-3">
              <p className="text-xs uppercase tracking-widest text-white/70">Next question</p>
              <p className="mt-1 font-bold">{nextQuestion.prompt}</p>
              <p className="text-xs font-semibold text-emerald-300">
                Score effect: {nextQuestion.score_modifier === -1 ? "-1" : "+1"}
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createRound,
  fetchGameSnapshot,
  replaceOptions,
  resetGame,
  saveQuestionBank,
  setCurrentRound,
  setGamePhase,
} from "@/lib/game-api";
import { useGameRealtime } from "@/hooks/use-game-realtime";
import type { GameSnapshot } from "@/types/game";

type EditableOption = { id?: string; name: string; image_url: string };
type EditableQuestion = { id?: string; prompt: string; score_modifier: 1 | -1 };

const randomId = () => `new-${Math.random().toString(36).slice(2)}`;

/** Voting needs at least two distinct choices. */
const MIN_PLAYER_OPTIONS = 2;

export default function AdminPage() {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [options, setOptions] = useState<EditableOption[]>([]);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const autoScoredRoundRef = useRef<string | null>(null);

  const refresh = useCallback(
    async (syncSetupFromServer = false) => {
      const data = await fetchGameSnapshot();
      setSnapshot(data);
      setOptions((prev) => {
        if (syncSetupFromServer) {
          return data.options.map((option) => ({
            id: option.id,
            name: option.name,
            image_url: option.image_url,
          }));
        }
        return prev.length > 0
          ? prev
          : data.options.map((option) => ({
              id: option.id,
              name: option.name,
              image_url: option.image_url,
            }));
      });
      setQuestions((prev) => {
        if (syncSetupFromServer) {
          return data.questionBank.map((question) => ({
            id: question.id,
            prompt: question.prompt,
            score_modifier: question.score_modifier === -1 ? -1 : 1,
          }));
        }
        return prev.length > 0
          ? prev
          : data.questionBank.map((question) => ({
              id: question.id,
              prompt: question.prompt,
              score_modifier: question.score_modifier === -1 ? -1 : 1,
            }));
      });
    },
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

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

  const usableOptions = useMemo(
    () =>
      options
        .map((item) => ({ id: item.id, name: item.name.trim(), image_url: item.image_url.trim() }))
        .filter((item) => item.name && item.image_url),
    [options],
  );

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
        `Add ${MIN_PLAYER_OPTIONS - usableOptions.length} more player row(s) — each needs both Name and Image URL (${usableOptions.length}/${MIN_PLAYER_OPTIONS} ready).`,
      );
    }
    if (usableQuestions.length < 1) {
      parts.push("Add at least one prompt under Question Queue.");
    }
    return parts.length > 0 ? parts.join(" ") : null;
  }, [busy, usableOptions.length, usableQuestions.length]);

  async function runAction(
    name: string,
    action: () => Promise<void>,
    /** After Save Setup / Push Next, reload option + queue rows from DB so real UUIDs replace local `new-*` placeholders. */
    syncSetupFromServerAfter = false,
  ) {
    setBusy(name);
    setActionError(null);
    try {
      await action();
      await refresh(syncSetupFromServerAfter);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      setActionError(message);
      await refresh(syncSetupFromServerAfter);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
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

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Question Queue</h2>
              <button
                type="button"
                onClick={() =>
                  setQuestions((prev) => [...prev, { id: randomId(), prompt: "", score_modifier: 1 }])
                }
                className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700"
              >
                + Add Question
              </button>
            </div>
            <div className="space-y-3">
              {questions.map((question, index) => (
                <div
                  key={question.id ?? `${question.prompt}-${index}`}
                  className="grid gap-2 rounded-2xl bg-slate-50 p-3 md:grid-cols-[1fr_auto_auto]"
                >
                  <input
                    value={question.prompt}
                    onChange={(event) =>
                      setQuestions((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, prompt: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Who is most likely to win a dance battle?"
                    className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring focus:ring-indigo-300"
                  />
                  <select
                    value={question.score_modifier}
                    onChange={(event) =>
                      setQuestions((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                score_modifier: event.target.value === "-1" ? -1 : 1,
                              }
                            : item,
                        ),
                      )
                    }
                    className="rounded-xl border border-slate-200 px-3 py-2 font-bold outline-none focus:ring focus:ring-indigo-300"
                  >
                    <option value={1}>+1 leaderboard</option>
                    <option value={-1}>-1 leaderboard</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setQuestions((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                    }
                    className="rounded-xl bg-rose-100 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-200"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Player Options</h2>
              <button
                type="button"
                onClick={() =>
                  setOptions((prev) => [...prev, { id: randomId(), name: "", image_url: "" }])
                }
                className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700"
              >
                + Add Option
              </button>
            </div>
            <div className="space-y-3">
              {options.map((option, index) => (
                <div key={option.id ?? `${option.name}-${index}`} className="grid gap-2 rounded-2xl bg-slate-50 p-3 md:grid-cols-[1fr_2fr_auto]">
                  <input
                    value={option.name}
                    onChange={(event) =>
                      setOptions((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Name"
                    className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring focus:ring-indigo-300"
                  />
                  <input
                    value={option.image_url}
                    onChange={(event) =>
                      setOptions((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, image_url: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Image URL"
                    className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring focus:ring-indigo-300"
                  />
                  <button
                    type="button"
                    onClick={() => setOptions((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                    className="rounded-xl bg-rose-100 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-200"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Why is &quot;Push Next&quot; greyed out?</p>
            <p className="mt-1">
              The button stays disabled until you have at least{" "}
              <strong>{MIN_PLAYER_OPTIONS} player options</strong> (every row must have both Name and Image URL) and{" "}
              <strong>at least 1 question</strong> in the queue.
            </p>
            <p className="mt-2">
              Current counts:{" "}
              <strong>{usableOptions.length}</strong> complete option row(s)
              {usableOptions.length < MIN_PLAYER_OPTIONS ? ` (need ${MIN_PLAYER_OPTIONS})` : ""},{" "}
              <strong>{usableQuestions.length}</strong> question(s).
            </p>
            {pushNextBlockedHint ? (
              <p className="mt-2 font-semibold text-amber-800">{pushNextBlockedHint}</p>
            ) : busy === null ? (
              <p className="mt-2 font-semibold text-emerald-700">Requirements met — you can push.</p>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                runAction(
                  "save-setup",
                  async () => {
                    await replaceOptions(usableOptions);
                    await saveQuestionBank(
                      usableQuestions.map((question, idx) => ({
                        ...question,
                        position: idx + 1,
                      })),
                    );
                  },
                  true,
                )
              }
              className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white disabled:opacity-50"
            >
              Save Setup
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => runAction("start", async () => setGamePhase("waiting"))}
              className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50"
            >
              Start Game
            </button>
            <button
              type="button"
              disabled={pushNextDisabled}
              title={
                pushNextBlockedHint ??
                "Save options + question queue to the database, then activate the next unused question."
              }
              onClick={() =>
                runAction(
                  "next",
                  async () => {
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
                      "No questions found in the database queue. Add prompts under Question Queue, ensure Supabase has the question_bank table, then Save Setup or push again.",
                    );
                  }
                  const used = new Set(
                    latest.rounds
                      .map((round) => round.question_bank_id)
                      .filter(Boolean) as string[],
                  );
                  const next = latest.questionBank.find((question) => !used.has(question.id));
                  if (!next) {
                    throw new Error(
                      "Every question in your queue has already been pushed. Add more prompts under Question Queue (then Save Setup), or use Reset Everything for a full wipe — note that also clears the saved question list.",
                    );
                  }
                  const round = await createRound(
                    next.prompt,
                    next.score_modifier === -1 ? -1 : 1,
                    next.id,
                  );
                  await setCurrentRound(round.id, "question");
                  },
                  true,
                )
              }
              className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white disabled:opacity-50"
            >
              Push Next Queued Question
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

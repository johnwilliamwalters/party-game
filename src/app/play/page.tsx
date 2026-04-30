"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useGameRealtime } from "@/hooks/use-game-realtime";
import { fetchGameSnapshot } from "@/lib/game-api";
import { isFinalResultsVisible } from "@/lib/game-end";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { DbPlayer, GameSnapshot } from "@/types/game";

const STORAGE_KEY = "party-game-player-session";

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export default function PlayPage() {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });
  const [voting, setVoting] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  /** Covers race where upsert succeeds before players list refresh arrives */
  const [optimisticPlayer, setOptimisticPlayer] = useState<DbPlayer | null>(null);

  const refresh = useCallback(async () => {
    const data = await fetchGameSnapshot();
    setSnapshot(data);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  useGameRealtime(() => {
    void refresh();
  });

  const player = useMemo(() => {
    if (!sessionId) return null;
    if (snapshot) {
      const fromServer = snapshot.players.find((item) => item.session_id === sessionId);
      if (fromServer) return fromServer;
    }
    if (optimisticPlayer?.session_id === sessionId) return optimisticPlayer;
    return null;
  }, [sessionId, snapshot, optimisticPlayer]);

  const alreadyVoted = useMemo(() => {
    if (!player) return false;
    return snapshot?.roundVotes.some((vote) => vote.player_id === player.id) ?? false;
  }, [player, snapshot?.roundVotes]);

  async function joinGame() {
    const cleanName = nameInput.trim();
    if (!cleanName) return;

    setJoinError(null);
    if (!isSupabaseConfigured()) {
      setJoinError(
        "Supabase is not configured on this deployment. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel, then redeploy.",
      );
      return;
    }
    const nextSessionId = localStorage.getItem(STORAGE_KEY) ?? createSessionId();
    localStorage.setItem(STORAGE_KEY, nextSessionId);
    setSessionId(nextSessionId);

    const { data, error } = await getSupabase()
      .from("players")
      .upsert({ session_id: nextSessionId, name: cleanName }, { onConflict: "session_id" })
      .select("*")
      .maybeSingle();

    if (error) {
      setJoinError(error.message);
      return;
    }

    if (data) setOptimisticPlayer(data);
    await refresh();
  }

  async function vote(optionId: string) {
    if (!player || !snapshot?.currentRound || alreadyVoted || voting) return;
    if (!isSupabaseConfigured()) {
      setVoteError(
        "Supabase is not configured on this deployment. Add env vars in Vercel and redeploy.",
      );
      return;
    }

    setVoteError(null);
    setVoting(true);
    try {
      const { error } = await getSupabase().from("votes").insert({
        round_id: snapshot.currentRound.id,
        player_id: player.id,
        option_id: optionId,
      });

      if (error) {
        // Unique violation: already voted this round (double-tap / race)
        if (error.code === "23505") {
          await refresh();
          return;
        }
        // FK violation: stale option id after admin reshuffled options
        if (error.code === "23503") {
          setVoteError("Choices were updated — please wait for the screen to refresh.");
          await refresh();
          return;
        }
        setVoteError(error.message);
        return;
      }

      await refresh();
    } finally {
      setVoting(false);
    }
  }

  const readyToVote = Boolean(
    snapshot?.state.phase === "question" &&
      snapshot?.currentRound &&
      (snapshot?.options.length ?? 0) > 0,
  );

  const finalResultsVisible = useMemo(() => isFinalResultsVisible(snapshot), [snapshot]);

  const dreamDate = useMemo(() => {
    if (!player || !snapshot) return null;
    const roundWeights = new Map(
      snapshot.rounds.map((round) => [round.id, round.score_modifier ?? 1]),
    );
    const personalScores = new Map<string, number>();
    for (const vote of snapshot.allVotes) {
      if (vote.player_id !== player.id) continue;
      const weight = roundWeights.get(vote.round_id) ?? 1;
      personalScores.set(vote.option_id, (personalScores.get(vote.option_id) ?? 0) + weight);
    }
    if (personalScores.size === 0) return null;

    const rankedPersonal = [...snapshot.options].sort((a, b) => {
      const bScore = personalScores.get(b.id) ?? 0;
      const aScore = personalScores.get(a.id) ?? 0;
      return bScore - aScore;
    });
    const top = rankedPersonal[0];
    if (!top) return null;
    return { option: top, score: personalScores.get(top.id) ?? 0 };
  }, [player, snapshot]);

  if (!player) {
    return (
      <main className="retro-bg flex min-h-screen items-center justify-center p-4">
        <div className="retro-panel w-full max-w-sm bg-[#f2b5da] p-6">
          <div className="mb-4 border-2 border-slate-900 bg-[#ffe55a] px-3 py-2 text-center text-sm font-black uppercase tracking-widest">
            Join Prom Night
          </div>
          <h1 className="retro-title text-center text-4xl font-black text-black">Play</h1>
          <p className="mt-2 text-center text-sm font-semibold text-slate-700">
            Enter your name to start voting.
          </p>
          {joinError ? (
            <p className="mt-3 border-2 border-rose-700 bg-rose-100 px-2 py-2 text-sm font-semibold text-rose-900">
              {joinError}
            </p>
          ) : null}
          <input
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder="Your name"
            className="mt-4 w-full border-2 border-slate-900 bg-white px-4 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-cyan-300"
          />
          <button
            type="button"
            onClick={joinGame}
            className="mt-3 w-full border-2 border-slate-900 bg-[#8be6f2] px-4 py-3 text-lg font-black text-slate-900"
          >
            Join
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="retro-bg min-h-screen p-4">
      <div className="mx-auto max-w-md">
        <div className="retro-panel bg-white p-4">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">
            Player: {player.name}
          </p>
          <h1 className="mt-1 font-display text-3xl font-black text-slate-900">
            {snapshot?.currentRound?.question ?? "Waiting for next question..."}
          </h1>
        </div>

        {voteError ? (
          <p className="mt-3 border-2 border-amber-700 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950">
            {voteError}
          </p>
        ) : null}

        {finalResultsVisible ? (
          <div className="retro-panel mt-4 bg-[#f2b5da] p-6 text-center text-slate-900">
            <p className="font-display text-3xl font-black">Your Dream Date</p>
            {dreamDate ? (
              <div className="mt-4 border-2 border-slate-900 bg-white p-4">
                <img
                  src={dreamDate.option.image_url}
                  alt={dreamDate.option.name}
                  className="mx-auto h-36 w-36 border-2 border-slate-900 object-cover"
                />
                <p className="mt-3 text-3xl font-black">{dreamDate.option.name}</p>
                <p className="text-base font-bold text-indigo-700">
                  Your score for them: {dreamDate.score}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-lg font-bold">
                Vote through the rounds to reveal your dream date.
              </p>
            )}
          </div>
        ) : !readyToVote || alreadyVoted ? (
          <div className="retro-panel mt-4 bg-[#4b3af0] p-6 text-center text-white">
            <p className="font-display text-3xl font-black">Waiting for others...</p>
            <p className="mt-1 text-xl text-white/80">
              Votes lock in after you choose. The admin will push the next question.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {(snapshot?.options ?? []).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => vote(option.id)}
                disabled={voting}
                className="retro-panel overflow-hidden bg-[#ffe55a] transition active:scale-95 disabled:opacity-50"
              >
                <img
                  src={option.image_url}
                  alt={option.name}
                  className="h-32 w-full border-b-2 border-slate-900 object-cover"
                />
                <div className="p-3 text-center text-xl font-black uppercase tracking-wide text-slate-900">
                  {option.name}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

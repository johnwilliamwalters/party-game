"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

import { useGameRealtime } from "@/hooks/use-game-realtime";
import { fetchGameSnapshot } from "@/lib/game-api";
import { PortraitFace, nameTwoLinesClassName } from "@/components/portrait-face";
import { isFinalResultsVisible } from "@/lib/game-end";
import type { GameSnapshot } from "@/types/game";

export default function TvPage() {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [joinUrl, setJoinUrl] = useState("/play");
  const [joinQrDataUrl, setJoinQrDataUrl] = useState("");

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setJoinUrl(`${window.location.origin}/play`);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!joinUrl) return;
    const timer = setTimeout(() => {
      void QRCode.toDataURL(joinUrl, {
        width: 320,
        margin: 1,
        color: { dark: "#0f172a", light: "#ffffff" },
      }).then(setJoinQrDataUrl);
    }, 0);
    return () => clearTimeout(timer);
  }, [joinUrl]);

  const roundCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const vote of snapshot?.roundVotes ?? []) {
      counts.set(vote.option_id, (counts.get(vote.option_id) ?? 0) + 1);
    }
    return counts;
  }, [snapshot?.roundVotes]);

  const overallCounts = useMemo(() => {
    const roundWeights = new Map<string, number>(
      (snapshot?.rounds ?? []).map((round) => [round.id, round.score_modifier ?? 1]),
    );
    const counts = new Map<string, number>();
    for (const vote of snapshot?.allVotes ?? []) {
      const weight = roundWeights.get(vote.round_id) ?? 1;
      counts.set(vote.option_id, (counts.get(vote.option_id) ?? 0) + weight);
    }
    return counts;
  }, [snapshot?.allVotes, snapshot?.rounds]);

  const rankedThisRound = useMemo(
    () =>
      [...(snapshot?.options ?? [])].sort(
        (a, b) => (roundCounts.get(b.id) ?? 0) - (roundCounts.get(a.id) ?? 0),
      ),
    [snapshot?.options, roundCounts],
  );
  const roundTopThree = rankedThisRound.slice(0, 3);
  const roundCompact = rankedThisRound.slice(3);

  const rankedOverall = useMemo(
    () =>
      [...(snapshot?.options ?? [])].sort(
        (a, b) => (overallCounts.get(b.id) ?? 0) - (overallCounts.get(a.id) ?? 0),
      ),
    [snapshot?.options, overallCounts],
  );

  const overallTopThree = rankedOverall.slice(0, 3);
  const overallCompact = rankedOverall.slice(3);

  const finalResultsVisible = useMemo(() => isFinalResultsVisible(snapshot), [snapshot]);

  const mostDatable = rankedOverall[0] ?? null;
  const leastDatable = rankedOverall.length > 0 ? rankedOverall[rankedOverall.length - 1] : null;

  /** option id → player names who voted for it this round (for TV scoreboard). */
  const voterNamesByOption = useMemo(() => {
    const nameByPlayerId = new Map((snapshot?.players ?? []).map((p) => [p.id, p.name]));
    const map = new Map<string, string[]>();
    for (const vote of snapshot?.roundVotes ?? []) {
      const name = nameByPlayerId.get(vote.player_id) ?? "Player";
      const list = map.get(vote.option_id) ?? [];
      list.push(name);
      map.set(vote.option_id, list);
    }
    for (const names of map.values()) {
      names.sort((a, b) => a.localeCompare(b));
    }
    return map;
  }, [snapshot?.roundVotes, snapshot?.players]);

  const phase = snapshot?.state.phase;
  const showingScoreboard = phase === "scoreboard";
  const showJoinBanner = (snapshot?.rounds.length ?? 0) === 0;
  const connectedPlayerNames = useMemo(
    () => [...(snapshot?.players ?? [])].map((p) => p.name).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [snapshot?.players],
  );

  const finalResultsBlock =
    finalResultsVisible ? (
      <div className="space-y-6">
        <div className="retro-panel bg-[#f2b5da] p-6 text-center">
          <h2 className="retro-title text-4xl font-black text-black md:text-6xl">Final Results</h2>
          <p className="mt-2 text-lg font-bold text-slate-800 md:text-2xl">Every dating question is complete</p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="retro-panel bg-[#ffe55a] p-5">
            <h3 className="text-2xl font-black uppercase tracking-wider text-slate-900">Most Datable</h3>
            {mostDatable ? (
              <div className="mt-4 border-2 border-slate-900 bg-white p-4">
                <div className="flex items-center gap-4">
                  <PortraitFace src={mostDatable.image_url} alt={mostDatable.name} widthClassName="w-28 md:w-32" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-3xl font-black ${nameTwoLinesClassName}`}>{mostDatable.name}</p>
                    <p className="text-lg font-bold text-indigo-700">Score: {overallCounts.get(mostDatable.id) ?? 0}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-base font-bold text-slate-700">No votes yet.</p>
            )}
          </section>

          <section className="retro-panel bg-[#8be6f2] p-5">
            <h3 className="text-2xl font-black uppercase tracking-wider text-slate-900">Least Datable</h3>
            {leastDatable ? (
              <div className="mt-4 border-2 border-slate-900 bg-white p-4">
                <div className="flex items-center gap-4">
                  <PortraitFace src={leastDatable.image_url} alt={leastDatable.name} widthClassName="w-28 md:w-32" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-3xl font-black ${nameTwoLinesClassName}`}>{leastDatable.name}</p>
                    <p className="text-lg font-bold text-fuchsia-700">Score: {overallCounts.get(leastDatable.id) ?? 0}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-base font-bold text-slate-700">No votes yet.</p>
            )}
          </section>
        </div>
      </div>
    ) : null;

  return (
    <main className="retro-bg min-h-screen p-6 pb-28 text-slate-900 md:p-10 md:pb-32">
      {showJoinBanner ? (
        <aside className="retro-panel mb-6 flex items-center gap-4 bg-[#ffe55a] p-3">
          {joinQrDataUrl ? (
            <img src={joinQrDataUrl} alt="QR code to join the game" className="h-28 w-28 border-2 border-slate-900 bg-white p-1" />
          ) : (
            <div className="h-28 w-28 animate-pulse border-2 border-slate-900 bg-white/40" />
          )}
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-slate-900">Join on phone</p>
            <p className="mt-1 text-lg font-black">{joinUrl || "/play"}</p>
            <p className="text-xs text-slate-700">Scan to open player voting screen.</p>
          </div>
        </aside>
      ) : null}
      {!snapshot?.currentRound && !finalResultsVisible && phase === "waiting" ? (
        <div className="retro-panel flex min-h-[78vh] items-center justify-center bg-[#f2b5da] p-10 text-center">
          <div>
            <p className="text-2xl font-black uppercase tracking-widest text-slate-800">
              Waiting
            </p>
            <h1 className="retro-title mt-4 text-5xl font-black text-black md:text-7xl">
              Game will start soon...
            </h1>
          </div>
        </div>
      ) : finalResultsVisible && !snapshot?.currentRound ? (
        finalResultsBlock
      ) : showingScoreboard && snapshot?.currentRound && !finalResultsVisible ? (
        <div className="space-y-6">
          <div className="retro-panel bg-[#f2b5da] p-6">
            <h1 className="retro-title text-3xl font-black text-black md:text-5xl">
              Scoreboard
            </h1>
            <p className="mt-2 text-xl font-black md:text-3xl">{snapshot.currentRound.question}</p>
            <p className="text-sm font-black uppercase tracking-wider text-slate-800">
              This question score effect: {snapshot.currentRound.score_modifier === -1 ? "-1" : "+1"}
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="retro-panel bg-white/90 p-5">
              <h2 className="text-2xl font-black uppercase tracking-wider text-slate-900">This Question</h2>
              <div className="mt-4 space-y-3">
                {roundTopThree.map((option) => {
                  const voters = voterNamesByOption.get(option.id) ?? [];
                  return (
                    <div
                      key={option.id}
                      className="flex items-start justify-between gap-3 border-2 border-slate-900 bg-[#8be6f2] p-3"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <PortraitFace src={option.image_url} alt={option.name} widthClassName="w-14" />
                        <div className="min-w-0">
                          <span className={`text-2xl font-black ${nameTwoLinesClassName}`}>{option.name}</span>
                          {voters.length > 0 ? (
                            <p className={`mt-1 text-base font-bold text-slate-800 ${nameTwoLinesClassName}`}>
                              {voters.join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <span className="shrink-0 text-3xl font-black text-fuchsia-700">
                        {roundCounts.get(option.id) ?? 0}
                      </span>
                    </div>
                  );
                })}
              </div>
              {roundCompact.length > 0 ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {roundCompact.map((option) => {
                    const voters = voterNamesByOption.get(option.id) ?? [];
                    return (
                      <div
                        key={option.id}
                        className="flex items-center justify-between gap-3 border-2 border-slate-900 bg-[#baf0f7] px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <PortraitFace src={option.image_url} alt={option.name} widthClassName="w-11" />
                          <div className="min-w-0">
                            <p className={`text-lg font-black ${nameTwoLinesClassName}`}>{option.name}</p>
                            {voters.length > 0 ? (
                              <p className={`text-xs font-bold text-slate-700 ${nameTwoLinesClassName}`}>
                                {voters.join(" · ")}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <span className="shrink-0 text-2xl font-black text-fuchsia-700">
                          {roundCounts.get(option.id) ?? 0}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>

            <section className="retro-panel bg-white/90 p-5">
              <h2 className="text-2xl font-black uppercase tracking-wider text-slate-900">Overall Leaderboard</h2>
              <div className="mt-4 space-y-3">
                {overallTopThree.map((option) => (
                  <div key={option.id} className="flex items-center justify-between border-2 border-slate-900 bg-[#ffe55a] p-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <PortraitFace src={option.image_url} alt={option.name} widthClassName="w-14" />
                      <span className={`min-w-0 text-2xl font-black ${nameTwoLinesClassName}`}>{option.name}</span>
                    </div>
                    <span className="text-3xl font-black text-indigo-700">{overallCounts.get(option.id) ?? 0}</span>
                  </div>
                ))}
              </div>
              {overallCompact.length > 0 ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {overallCompact.map((option) => (
                    <div
                      key={option.id}
                      className="flex items-center justify-between gap-3 border-2 border-slate-900 bg-[#fff4b2] px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <PortraitFace src={option.image_url} alt={option.name} widthClassName="w-11" />
                        <span className={`min-w-0 text-lg font-black ${nameTwoLinesClassName}`}>{option.name}</span>
                      </div>
                      <span className="shrink-0 text-2xl font-black text-indigo-700">
                        {overallCounts.get(option.id) ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>

          {finalResultsBlock}
        </div>
      ) : (
        <div className="retro-panel flex min-h-[78vh] items-center justify-center bg-[#f2b5da] p-10 text-center">
          <div>
            <p className="text-2xl font-black uppercase tracking-[0.3em] text-slate-800">
              Now Voting
            </p>
            <h1 className="retro-title mt-4 text-5xl font-black leading-tight text-black md:text-8xl">
              {snapshot?.currentRound?.question ?? ""}
            </h1>
            <p className="mt-8 text-xl font-black text-slate-800 md:text-3xl">
              Cast your vote on your phone
            </p>
          </div>
        </div>
      )}

      <footer className="fixed inset-x-0 bottom-0 border-t-2 border-slate-900 bg-[#ffe55a]/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <p className="shrink-0 text-xs font-black uppercase tracking-widest text-slate-900">
            Players ({connectedPlayerNames.length})
          </p>
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {connectedPlayerNames.length > 0 ? (
              connectedPlayerNames.map((name, index) => (
                <span
                  key={`${name}-${index}`}
                  className={`max-w-[10rem] shrink-0 rounded-xl border-2 border-slate-900 bg-white px-2 py-1.5 text-center text-sm font-black leading-snug text-slate-900 ${nameTwoLinesClassName}`}
                >
                  {name}
                </span>
              ))
            ) : (
              <span className="text-sm font-semibold text-slate-700">No players joined yet</span>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}

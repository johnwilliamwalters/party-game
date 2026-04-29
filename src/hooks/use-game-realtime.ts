"use client";

import { useEffect, useRef } from "react";

import { getSupabase } from "@/lib/supabase/client";

const watchedTables = [
  "game_state",
  "options",
  "players",
  "rounds",
  "votes",
  "question_bank",
];

/** Coalesce bursts (one DB write can fan out to many REST refetches and exhaust the browser). */
const DEBOUNCE_MS = 300;

export function useGameRealtime(onChange: () => void) {
  const onChangeRef = useRef(onChange);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        onChangeRef.current();
      }, DEBOUNCE_MS);
    };

    const channel = getSupabase().channel(`game-${Math.random().toString(36).slice(2)}`);

    for (const table of watchedTables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleRefresh,
      );
    }

    channel.subscribe();

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      void getSupabase().removeChannel(channel);
    };
  }, []);
}

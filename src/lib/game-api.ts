import type { PostgrestError } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";
import type {
  DbGameState,
  DbOption,
  DbPlayer,
  DbQuestionBank,
  DbRound,
  DbVote,
  GamePhase,
  GameSnapshot,
} from "@/types/game";

const defaultState: DbGameState = {
  id: 1,
  phase: "waiting",
  current_round_id: null,
  updated_at: new Date(0).toISOString(),
};

export async function ensureGameState(): Promise<PostgrestError | null> {
  const { error } = await supabase.from("game_state").upsert({ id: 1 }, { onConflict: "id" });
  return error ?? null;
}

function isLikelyNetworkFailure(error: Pick<PostgrestError, "message" | "code"> | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("network request failed")
  );
}

let lastUnreachableLogMs = 0;
function logSupabaseUnreachableOnce() {
  const now = Date.now();
  if (now - lastUnreachableLogMs < 60_000) return;
  lastUnreachableLogMs = now;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(missing NEXT_PUBLIC_SUPABASE_URL)";
  console.warn(
    "[party-game] Cannot reach Supabase (network or project unreachable). The game needs HTTPS access to your project URL.\n" +
      `• URL in use: ${url}\n` +
      "• Supabase Dashboard → Project Settings → check the project is not paused.\n" +
      "• Try opening the URL above in a new tab; VPN/ad-block/privacy extensions sometimes block REST calls.\n" +
      "• Confirm .env.local matches Project Settings → API (URL + anon key), then restart `npm run dev`.",
  );
}

function emptyGameSnapshot(): GameSnapshot {
  return {
    state: defaultState,
    currentRound: null,
    rounds: [],
    questionBank: [],
    options: [],
    players: [],
    roundVotes: [],
    allVotes: [],
  };
}

export async function setGamePhase(phase: GamePhase) {
  await supabase.from("game_state").upsert(
    {
      id: 1,
      phase,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

export async function setCurrentRound(roundId: string, phase: GamePhase) {
  await supabase.from("game_state").upsert(
    {
      id: 1,
      current_round_id: roundId,
      phase,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

export async function clearCurrentRound() {
  await supabase.from("game_state").upsert(
    {
      id: 1,
      current_round_id: null,
      phase: "waiting",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

function pickData<T>(
  result: { data: T | null; error: PostgrestError | null },
  label: string,
): T | null {
  if (!result.error) return result.data ?? null;
  if (isLikelyNetworkFailure(result.error)) return null;
  console.warn(`[party-game] ${label}:`, result.error.message);
  return null;
}

let snapshotInFlight: Promise<GameSnapshot> | null = null;

async function fetchGameSnapshotUncached(): Promise<GameSnapshot> {
  const ensureErr = await ensureGameState();
  if (ensureErr && isLikelyNetworkFailure(ensureErr)) {
    logSupabaseUnreachableOnce();
    return emptyGameSnapshot();
  }
  if (ensureErr) {
    console.warn("[party-game] game_state upsert:", ensureErr.message);
  }

  const stateRes = await supabase.from("game_state").select("*").eq("id", 1).maybeSingle();
  const optionsRes = await supabase.from("options").select("*").order("created_at", { ascending: true });
  const playersRes = await supabase.from("players").select("*").order("created_at", { ascending: true });
  const roundsRes = await supabase.from("rounds").select("*").order("created_at", { ascending: true });
  const questionBankRes = await supabase.from("question_bank").select("*").order("position", { ascending: true });
  const votesRes = await supabase.from("votes").select("*").order("created_at", { ascending: true });

  const safeState = pickData(stateRes, "game_state") ?? defaultState;
  const options = (pickData(optionsRes, "options") ?? []) as DbOption[];
  const players = (pickData(playersRes, "players") ?? []) as DbPlayer[];
  const rounds = (pickData(roundsRes, "rounds") ?? []) as DbRound[];
  const questionBank = (pickData(questionBankRes, "question_bank") ?? []) as DbQuestionBank[];
  const allVotes = (pickData(votesRes, "votes") ?? []) as DbVote[];

  let currentRound: DbRound | null = null;
  if (safeState.current_round_id) {
    const roundRes = await supabase
      .from("rounds")
      .select("*")
      .eq("id", safeState.current_round_id)
      .maybeSingle();
    currentRound = pickData(roundRes, "current_round") as DbRound | null;
  }

  let roundVotes: DbVote[] = [];
  if (currentRound) {
    const rvRes = await supabase
      .from("votes")
      .select("*")
      .eq("round_id", currentRound.id)
      .order("created_at", { ascending: true });
    roundVotes = (pickData(rvRes, "round_votes") ?? []) as DbVote[];
  }

  return {
    state: safeState,
    currentRound,
    rounds,
    questionBank,
    options,
    players,
    roundVotes,
    allVotes,
  };
}

/** Coalesces overlapping calls so realtime bursts don’t open dozens of parallel REST requests. */
export async function fetchGameSnapshot(): Promise<GameSnapshot> {
  if (snapshotInFlight) return snapshotInFlight;
  snapshotInFlight = fetchGameSnapshotUncached().finally(() => {
    snapshotInFlight = null;
  });
  return snapshotInFlight;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPersistedOptionId(id: string | undefined): id is string {
  return Boolean(id && UUID_REGEX.test(id) && !id.startsWith("new-"));
}

export async function replaceOptions(
  nextOptions: Array<{ id?: string; name: string; image_url: string }>,
) {
  const sanitized = nextOptions
    .map((option) => ({
      id: option.id,
      name: option.name.trim(),
      image_url: option.image_url.trim(),
    }))
    .filter((option) => option.name && option.image_url);

  const existing = sanitized.filter((option) => isPersistedOptionId(option.id));
  const newOnes = sanitized.filter((option) => !isPersistedOptionId(option.id));

  const { data: existingVotes } = await supabase.from("votes").select("id").limit(1);
  const hasVotes = (existingVotes?.length ?? 0) > 0;

  if (!hasVotes) {
    const { error: delErr } = await supabase
      .from("options")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (delErr) console.warn("[party-game] options delete:", delErr.message);
    if (sanitized.length > 0) {
      const { error: insErr } = await supabase.from("options").insert(
        sanitized.map((option) => ({ name: option.name, image_url: option.image_url })),
      );
      if (insErr) console.warn("[party-game] options insert:", insErr.message);
    }
    return;
  }

  if (existing.length > 0) {
    const { error } = await supabase.from("options").upsert(existing, { onConflict: "id" });
    if (error) console.warn("[party-game] options upsert:", error.message);
  }
  if (newOnes.length > 0) {
    const { error } = await supabase.from("options").insert(
      newOnes.map((option) => ({ name: option.name, image_url: option.image_url })),
    );
    if (error) console.warn("[party-game] options insert (partial):", error.message);
  }
}

export async function saveQuestionBank(
  questions: Array<{ id?: string; prompt: string; score_modifier: 1 | -1; position: number }>,
) {
  const sanitized = questions
    .map((question, idx) => ({
      id: question.id,
      prompt: question.prompt.trim(),
      score_modifier: question.score_modifier,
      position: idx + 1,
    }))
    .filter((question) => question.prompt);

  const existing = sanitized.filter((question) => isPersistedOptionId(question.id));
  const newOnes = sanitized.filter((question) => !isPersistedOptionId(question.id));

  if (existing.length > 0) {
    const { error } = await supabase.from("question_bank").upsert(existing, { onConflict: "id" });
    if (error) {
      throw new Error(`Could not save question queue (upsert): ${error.message}`);
    }
  }

  if (newOnes.length > 0) {
    const { error } = await supabase.from("question_bank").insert(
      newOnes.map((question) => ({
        prompt: question.prompt,
        score_modifier: question.score_modifier,
        position: question.position,
      })),
    );
    if (error) {
      throw new Error(`Could not save question queue (insert): ${error.message}`);
    }
  }

  // Keep existing questions to preserve history and avoid accidental loss.
}

export async function createRound(
  question: string,
  scoreModifier: 1 | -1,
  questionBankId: string | null,
): Promise<DbRound> {
  const { data, error } = await supabase
    .from("rounds")
    .insert({
      question,
      score_modifier: scoreModifier,
      question_bank_id: questionBankId,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create round.");
  }

  return data as DbRound;
}

export async function resetGame() {
  await clearCurrentRound();
  await supabase.from("votes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("rounds").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("players").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("options").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("question_bank").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}

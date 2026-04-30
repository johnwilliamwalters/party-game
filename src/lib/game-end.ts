import type { GameSnapshot } from "@/types/game";

/**
 * True when every queued question has a round AND we're past active voting for the last round.
 * Prevents "game over" UI during the final question while phase is still `question`.
 */
export function isEndGameComplete(snapshot: GameSnapshot | null): boolean {
  if (!snapshot || snapshot.questionBank.length === 0) return false;
  const usedBankIds = new Set(
    snapshot.rounds.map((r) => r.question_bank_id).filter(Boolean) as string[],
  );
  if (usedBankIds.size < snapshot.questionBank.length) return false;
  return snapshot.state.phase !== "question";
}

export function isFinalResultsVisible(snapshot: GameSnapshot | null): boolean {
  if (!snapshot) return false;
  // Final mode is represented by "no active round" after gameplay has started.
  // This stays compatible with DB phase constraints and avoids getting stuck on waiting UI.
  return snapshot.currentRound === null && snapshot.rounds.length > 0;
}

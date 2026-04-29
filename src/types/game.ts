export type GamePhase = "waiting" | "question" | "scoreboard";

export type DbGameState = {
  id: number;
  phase: GamePhase;
  current_round_id: string | null;
  updated_at: string;
};

export type DbRound = {
  id: string;
  question: string;
  score_modifier: number;
  question_bank_id: string | null;
  created_at: string;
};

export type DbQuestionBank = {
  id: string;
  prompt: string;
  score_modifier: number;
  position: number;
  created_at: string;
};

export type DbOption = {
  id: string;
  name: string;
  image_url: string;
  created_at: string;
};

export type DbPlayer = {
  id: string;
  session_id: string;
  name: string;
  created_at: string;
};

export type DbVote = {
  id: string;
  round_id: string;
  player_id: string;
  option_id: string;
  created_at: string;
};

export type GameSnapshot = {
  state: DbGameState;
  currentRound: DbRound | null;
  rounds: DbRound[];
  questionBank: DbQuestionBank[];
  options: DbOption[];
  players: DbPlayer[];
  roundVotes: DbVote[];
  allVotes: DbVote[];
};

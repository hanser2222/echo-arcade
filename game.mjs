function shuffle(values, rng = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createSession(tracks, { roundCount = 10, optionCount = 6, rng = Math.random, mode = 'easy' } = {}) {
  if (!['easy', 'hard'].includes(mode)) throw new RangeError('无效难度模式');
  const eligible = tracks.filter(track => (track.difficulty ?? 'easy') === mode);
  const games = [...new Set(tracks.map(track => track.game))];
  if (eligible.length < roundCount || games.length < optionCount) throw new RangeError('题库不足');
  const rounds = shuffle(eligible, rng).slice(0, roundCount).map(track => ({
    track,
    options: shuffle([track.game, ...shuffle(games.filter(game => game !== track.game), rng).slice(0, optionCount - 1)], rng),
  }));
  return { rounds, mode, index: 0, phase: 'playing', score: 0, streak: 0, bestStreak: 0, history: [], answer: null };
}

export function answerRound(session, game) {
  if (session.phase === 'complete' || session.answer) return session;
  const round = session.rounds[session.index];
  if (!round.options.includes(game)) throw new RangeError('无效选项');
  const correct = game === round.track.game;
  const streak = correct ? session.streak + 1 : 0;
  const answer = { game, correct, skipped: false, track: round.track };
  return { ...session, answer, score: session.score + (correct ? 100 : 0), streak, bestStreak: Math.max(streak, session.bestStreak), history: [...session.history, answer] };
}

export function skipRound(session) {
  if (session.phase === 'complete' || session.answer) return session;
  const answer = { game: null, correct: false, skipped: true, track: session.rounds[session.index].track };
  return { ...session, answer, streak: 0, history: [...session.history, answer] };
}

export function nextRound(session) {
  if (session.phase === 'complete' || !session.answer) return session;
  if (session.index === session.rounds.length - 1) return { ...session, phase: 'complete' };
  return { ...session, index: session.index + 1, answer: null };
}

export function getFullTrack(session, index = session.index) {
  if (!Number.isInteger(index) || index < 0 || index >= session.rounds.length) return null;
  return session.history[index]?.track.full ?? null;
}

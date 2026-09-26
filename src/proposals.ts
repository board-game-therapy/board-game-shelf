import type { Game } from './types.ts';
export type Proposal = {
  kind: 'correction' | 'new-game';
  gameKey: string;
  title: string;
  category: string;
  details: string;
  photoUrl: string;
  revision: number;
};
export function newProposal(game: Game | undefined, revision: number): Proposal {
  return {
    kind: game ? 'correction' : 'new-game',
    gameKey: game?.key || '',
    title: game?.title || '',
    category: game ? 'Game details' : 'Add a game',
    details: game
      ? [
          `Summary: ${game.summary}`,
          `Description: ${game.description}`,
          `Players: ${game.players ? `${game.players.min}–${game.players.max}` : 'Not checked'}`,
          `Play time (minutes): ${game.minutes ? `${game.minutes.min}–${game.minutes.max}` : 'Not checked'}`,
          `Minimum age: ${game.minAge ?? 'Not checked'}`,
          `Tags: ${game.tags.join(', ')}`,
          '',
          'Reason for change: ',
        ].join('\n\n')
      : '',
    photoUrl: game?.reference?.url || '',
    revision,
  };
}
export function proposalText(proposal: Proposal) {
  return `## ${proposal.kind === 'new-game' ? 'Proposed game' : 'Suggested correction'}\n\n${proposal.title}\n\nCategory: ${proposal.category}\nGame key: ${proposal.gameKey || '(new entry)'}\nCatalog revision: ${proposal.revision}\n\n## Suggestion\n\n${proposal.details}\n${proposal.photoUrl ? `\n## Photo reference\n\n${proposal.photoUrl}\n` : ''}`;
}

import type { Proposal } from '../src/proposals.ts';
import { proposalText } from '../src/proposals.ts';

type Limiter = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type Env = {
  ALLOWED_ORIGIN: string;
  GITHUB_REPOSITORY: string;
  GITHUB_TOKEN?: string;
  PER_VISITOR: Limiter;
  TOTAL_SUBMISSIONS: Limiter;
};
const categories = [
  'Add a game',
  'Game details',
  'Player count or play time',
  'Tags',
  'Photo or identification',
  'Other',
];
export function validateProposal(value: unknown): value is Proposal & { website?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  if (
    Object.keys(p).some(
      (key) =>
        ![
          'kind',
          'gameKey',
          'title',
          'category',
          'details',
          'photoUrl',
          'revision',
          'website',
        ].includes(key),
    )
  )
    return false;
  if (p.kind !== 'correction' && p.kind !== 'new-game') return false;
  if (
    typeof p.title !== 'string' ||
    !p.title.trim() ||
    p.title.length > 200 ||
    /[\r\n]/.test(p.title)
  )
    return false;
  if (
    typeof p.gameKey !== 'string' ||
    p.gameKey.length > 150 ||
    (p.gameKey && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.gameKey))
  )
    return false;
  if (p.kind === 'correction' && !p.gameKey) return false;
  if (typeof p.category !== 'string' || !categories.includes(p.category)) return false;
  if (typeof p.details !== 'string' || p.details.trim().length < 10 || p.details.length > 3000)
    return false;
  if (typeof p.photoUrl !== 'string' || p.photoUrl.length > 500) return false;
  if (p.photoUrl) {
    try {
      const url = new URL(p.photoUrl);
      if (url.protocol !== 'https:' || url.username || url.password) return false;
    } catch {
      return false;
    }
  }
  return (
    Number.isSafeInteger(p.revision) &&
    Number(p.revision) > 0 &&
    (p.website === undefined || p.website === '')
  );
}
export function issueBody(proposal: Proposal) {
  // Quote user text as plain content and disable mentions/HTML, including escaped mentions.
  const clean = (text: string) =>
    text.replace(/@/g, '@\u200b').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '');
  return (
    'Anonymous visitor suggestion from the Board Game Therapy library. Awaiting maintainer review.\n\n' +
    proposalText({
      ...proposal,
      title: clean(proposal.title),
      details: clean(proposal.details),
      photoUrl: clean(proposal.photoUrl),
    })
  );
}
async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('empty');
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 16000) {
      await reader.cancel();
      throw new Error('large');
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = origin === env.ALLOWED_ORIGIN;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin',
    };
    if (allowed) headers['Access-Control-Allow-Origin'] = env.ALLOWED_ORIGIN;
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    if (url.pathname === '/health' && request.method === 'GET')
      return respond({ ready: Boolean(env.GITHUB_TOKEN) });
    if (url.pathname !== '/proposals') return respond({ error: 'Not found.' }, 404);
    if (!allowed) return respond({ error: 'Open this form from the BGT library.' }, 403);
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '3600',
        },
      });
    if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);
    if (!request.headers.get('Content-Type')?.startsWith('application/json'))
      return respond({ error: 'Expected a JSON proposal.' }, 415);
    if (!env.GITHUB_TOKEN)
      return respond(
        {
          error:
            'Submissions are not connected yet. Your draft is still available to copy or download.',
        },
        503,
      );
    if (!/^board-game-therapy\/[a-zA-Z0-9_.-]+$/.test(env.GITHUB_REPOSITORY))
      return respond({ error: 'Submissions are temporarily unavailable.' }, 503);
    try {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const visitor = await env.PER_VISITOR.limit({ key: ip });
      if (!visitor.success)
        return respond({ error: 'Please wait a minute before sending another suggestion.' }, 429);
      let proposal: unknown;
      try {
        proposal = await boundedBody(request);
      } catch {
        return respond({ error: 'The proposal is invalid or too large.' }, 400);
      }
      if (!validateProposal(proposal))
        return respond(
          { error: 'Check the title, suggestion, category, and optional HTTPS link.' },
          400,
        );
      const total = await env.TOTAL_SUBMISSIONS.limit({ key: 'all' });
      if (!total.success)
        return respond(
          { error: 'Submissions are busy. Please try again in a minute; your draft is kept.' },
          429,
        );
      const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/issues`, {
        method: 'POST',
        signal: AbortSignal.timeout(12000),
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'bgt-library-proposals',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: `[Library ${proposal.kind === 'new-game' ? 'addition' : 'correction'}] ${proposal.title.trim().replace(/@/g, '@\u200b')}`,
          body: issueBody(proposal),
        }),
      });
      if (!response.ok)
        return respond(
          {
            error:
              'GitHub could not accept the suggestion. Your draft is kept; please try again later.',
          },
          502,
        );
      const issue = (await response.json()) as { number: number };
      if (!Number.isSafeInteger(issue.number))
        return respond(
          {
            error: 'Submission response was invalid. Please check the repository before retrying.',
          },
          502,
        );
      return respond(
        { url: `https://github.com/${env.GITHUB_REPOSITORY}/issues/${issue.number}` },
        201,
      );
    } catch {
      return respond(
        {
          error:
            'The service could not confirm delivery. Check the repository before retrying; your draft is kept.',
        },
        502,
      );
    }
  },
};

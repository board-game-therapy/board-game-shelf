import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { issueBody, validateProposal } from '../relay/worker.ts';
import type { Env } from '../relay/worker.ts';
import type { Proposal } from '../src/proposals.ts';
const proposal: Proposal = {
  kind: 'correction',
  gameKey: 'azul',
  title: 'Azul',
  category: 'Game details',
  details: 'Please check the edition on the box.',
  photoUrl: '',
  revision: 4,
};
const env: Env = {
  ALLOWED_ORIGIN: 'https://board-game-therapy.github.io',
  GITHUB_REPOSITORY: 'board-game-therapy/board-game-shelf',
  GITHUB_TOKEN: 'test-only',
  PER_VISITOR: { limit: async () => ({ success: true }) },
  TOTAL_SUBMISSIONS: { limit: async () => ({ success: true }) },
};
const request = (body: unknown = proposal, origin = env.ALLOWED_ORIGIN) =>
  new Request('https://relay.test/proposals', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
test('validates proposals and rejects injection, malformed URLs and unbounded input', () => {
  assert.ok(validateProposal(proposal));
  for (const change of [
    { title: 'x\nnew line' },
    { details: 'x' },
    { details: 'x'.repeat(3001) },
    { photoUrl: 'javascript:alert(1)' },
    { photoUrl: 'https://user:password@example.com/' },
    { kind: 'delete' },
    { gameKey: '../issues' },
    { revision: -1 },
    { category: 'surprise' },
    { website: 'spam' },
    { repository: 'other/repo' },
  ])
    assert.equal(validateProposal({ ...proposal, ...change }), false);
  const body = issueBody({ ...proposal, details: '@somebody <script>alert(1)</script>' });
  assert.ok(!body.includes('@somebody'));
  assert.ok(!body.includes('<script>'));
});
test('CORS, missing secrets, size limits and rate limits prevent GitHub writes', async () => {
  assert.equal((await worker.fetch(request(proposal, 'https://evil.test'), env)).status, 403);
  assert.equal((await worker.fetch(request(), { ...env, GITHUB_TOKEN: undefined })).status, 503);
  assert.equal(
    (
      await worker.fetch(request(), {
        ...env,
        PER_VISITOR: { limit: async () => ({ success: false }) },
      })
    ).status,
    429,
  );
  assert.equal(
    (await worker.fetch(request({ ...proposal, details: 'x'.repeat(18000) }), env)).status,
    400,
  );
  assert.equal((await worker.fetch(request({ nope: true }), env)).status, 400);
});
test('creates only a new issue in the fixed repository and never forwards personal headers', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls++;
    assert.equal(url, 'https://api.github.com/repos/board-game-therapy/board-game-shelf/issues');
    const body = JSON.parse(String(options.body));
    assert.match(body.title, /Library correction/);
    assert.match(body.body, /Game key: azul/);
    assert.match(body.body, /Catalog revision: 4/);
    assert.ok(!JSON.stringify(options.headers).includes('CF-Connecting-IP'));
    return new Response(JSON.stringify({ number: 12 }), { status: 201 });
  });
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 201);
  assert.equal(calls, 1);
  assert.equal(
    (await response.json()).url,
    'https://github.com/board-game-therapy/board-game-shelf/issues/12',
  );
});
test('upstream errors keep secrets and responses out of the public error', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('secret-token', { status: 401 }));
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes('secret-token'));
});

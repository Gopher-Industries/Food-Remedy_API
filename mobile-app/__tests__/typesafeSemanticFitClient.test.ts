import { TypeSafeSemanticFitClient, createSemanticFitClientFromEnvironment } from '@/server/typesafeSemanticFitClient';
import { DisabledSemanticFitClient, MockSemanticFitClient, type SemanticFitRequest } from '@/server/semanticFitClient';

const request: SemanticFitRequest = {
  state: { original: { name: 'Plain crackers' }, candidate: { name: 'Rice cakes' }, intention: 'Lunchbox snack' },
  questions: { fit: { instructions: 'How well does this candidate fill the role?',
    criteria: ['Does not fill the role', 'Partially fills the role', 'Fills the role well'] } },
};

function response(overrides: Record<string, unknown> = {}) {
  return { model: 'jev-1.13.0', usage: { input_tokens: 12, output_tokens: 2 },
    answers: { fit: { type: 'score', score: 1.5, confidence: 0.8,
      probabilities: { '0': 0, '1': 0.5, '2': 0.5 }, legend: { '0': 'no', '1': 'partial', '2': 'yes' } } },
    ...overrides };
}

describe('server-only TypeSafe adapter', () => {
  it('sends bounded Score questions with the pinned model and validates typed probabilities', async () => {
    const transport = jest.fn(async () => response());
    const client = new TypeSafeSemanticFitClient(transport);
    const result = await client.evaluate(request);
    expect(result).toEqual(expect.objectContaining({ available: true, model: 'jev-1.13.0',
      answers: { fit: { score: 1.5, confidence: 0.8, probabilities: { '0': 0, '1': 0.5, '2': 0.5 } } } }));
    expect(transport).toHaveBeenCalledWith(request.state,
      { fit: { type: 'score', instructions: request.questions.fit.instructions, criteria: request.questions.fit.criteria } },
      'jev-1.13.0', expect.any(AbortSignal), 1200);
  });

  it.each([
    response({ answers: {} }), response({ answers: { fit: { type: 'choice', score: 1.5, confidence: 0.8, probabilities: { '0': 0, '1': 0.5, '2': 0.5 } } } }),
    response({ answers: { fit: { type: 'score', score: 1.5, confidence: 0.8, probabilities: { '0': 0.5, '1': 0.5 } } } }),
    response({ model: 'jev-preview' }),
  ])('maps unexpected or malformed SDK answers to unavailable', async raw => {
    const client = new TypeSafeSemanticFitClient(async () => raw);
    expect(await client.evaluate(request)).toEqual({ available: false, reason: 'malformed' });
  });

  it.each([
    ['RateLimitError', 'rate_limited'], ['AuthenticationError', 'authentication'],
    ['APITimeoutError', 'timeout'], ['APIConnectionError', 'connection'],
    ['InternalServerError', 'upstream'],
  ])('maps %s without exposing vendor payloads', async (name, reason) => {
    const client = new TypeSafeSemanticFitClient(async () => { const error = new Error('secret and preferences'); error.name = name; throw error; });
    expect(await client.evaluate(request)).toEqual({ available: false, reason });
  });

  it('enforces a total deadline even if transport ignores cancellation', async () => {
    const client = new TypeSafeSemanticFitClient(async () => new Promise(() => {}), 'jev-1.13.0', 5, 10);
    expect(await client.evaluate(request)).toEqual({ available: false, reason: 'timeout' });
  });

  it('forwards cancellation and caps concurrent requests', async () => {
    let release: (() => void) | undefined;
    const transport = jest.fn((_state, _questions, _model, signal: AbortSignal) => new Promise((resolve, reject) => {
      release = () => resolve(response());
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const client = new TypeSafeSemanticFitClient(transport, 'jev-1.13.0', 1200, 1800, 1);
    const controller = new AbortController();
    const first = client.evaluate(request, controller.signal);
    expect(await client.evaluate(request)).toEqual({ available: false, reason: 'busy' });
    controller.abort();
    expect(await first).toEqual({ available: false, reason: 'cancelled' });
    expect((transport.mock.calls[0] as unknown[])[3]).toBeInstanceOf(AbortSignal);
    expect(((transport.mock.calls[0] as unknown[])[3] as AbortSignal).aborted).toBe(true);
    release?.();
  });

  it('rejects safety values and oversized state before transport', async () => {
    const transport = jest.fn(async () => response());
    const client = new TypeSafeSemanticFitClient(transport);
    expect(await client.evaluate({ ...request, state: { allergies: ['milk'] } })).toEqual({ available: false, reason: 'malformed' });
    expect(await client.evaluate({ ...request, state: { text: 'x'.repeat(20_000) } })).toEqual({ available: false, reason: 'malformed' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('uses disabled and mock clients without network or credentials', async () => {
    const old = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      expect(createSemanticFitClientFromEnvironment()).toBeInstanceOf(DisabledSemanticFitClient);
      expect(await new DisabledSemanticFitClient().evaluate(request)).toEqual({ available: false, reason: 'disabled' });
      const mock = new MockSemanticFitClient({ available: false, reason: 'upstream' });
      expect(await mock.evaluate(request)).toEqual({ available: false, reason: 'upstream' });
      expect(mock.calls).toEqual([request]);
    } finally {
      if (old === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = old;
    }
  });
});

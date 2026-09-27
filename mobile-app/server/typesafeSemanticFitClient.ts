import { TypeSafeClient, score, type JsonValue, type Questions, type ScoreCriteria } from '@typesafe-ai/sdk';
import type { SemanticFitClient, SemanticFitRequest, SemanticFitResult,
  SemanticScoreAnswer } from './semanticFitClient';
import { DisabledSemanticFitClient } from './semanticFitClient';

const DEFAULT_MODEL = 'jev-1.13.0';
const MAX_STATE_BYTES = 16_384;
const MAX_QUESTIONS = 5;
const SENSITIVE_KEYS = new Set(['uid', 'userid', 'profileid', 'barcode', 'allergens', 'allergies',
  'intolerances', 'additives', 'dietaryform', 'traces', 'tracesfromingredients', 'apikey']);

type Transport = (state: Record<string, unknown>, questions: Questions,
  model: string, signal: AbortSignal, timeoutMs: number) => Promise<unknown>;

function containsSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (value && typeof value === 'object') return Object.entries(value).some(([key, item]) =>
    SENSITIVE_KEYS.has(key.toLowerCase()) || containsSensitiveKey(item));
  return false;
}

function validRequest(request: SemanticFitRequest): boolean {
  try {
    if (!request.state || Array.isArray(request.state) || containsSensitiveKey(request.state)) return false;
    const serialized = JSON.stringify(request.state);
    if (!serialized || new TextEncoder().encode(serialized).byteLength > MAX_STATE_BYTES) return false;
    const entries = Object.entries(request.questions ?? {});
    return entries.length > 0 && entries.length <= MAX_QUESTIONS && entries.every(([id, question]) =>
      /^[a-z][a-z0-9_]{0,63}$/.test(id) && typeof question.instructions === 'string' &&
      question.instructions.trim().length > 0 && question.instructions.length <= 500 &&
      Array.isArray(question.criteria) && question.criteria.length >= 2 && question.criteria.length <= 5 &&
      question.criteria.every(level => typeof level === 'string' && level.trim().length > 0 && level.length <= 500));
  } catch { return false; }
}

function parseResult(raw: unknown, ids: string[], criteriaLengths: number[], expectedModel: string,
  durationMs: number): SemanticFitResult {
  if (!raw || typeof raw !== 'object') return { available: false, reason: 'malformed' };
  const result = raw as Record<string, unknown>;
  if (result.model !== expectedModel || !result.answers || typeof result.answers !== 'object' ||
      Array.isArray(result.answers) || !result.usage || typeof result.usage !== 'object') {
    return { available: false, reason: 'malformed' };
  }
  const rawAnswers = result.answers as Record<string, unknown>;
  if (Object.keys(rawAnswers).sort().join(',') !== [...ids].sort().join(',')) return { available: false, reason: 'malformed' };
  const usage = result.usage as Record<string, unknown>;
  if (![usage.input_tokens, usage.output_tokens].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
    return { available: false, reason: 'malformed' };
  }
  const answers: Record<string, SemanticScoreAnswer> = {};
  for (let index = 0; index < ids.length; index++) {
    const answer = rawAnswers[ids[index]];
    if (!answer || typeof answer !== 'object') return { available: false, reason: 'malformed' };
    const data = answer as Record<string, unknown>;
    const length = criteriaLengths[index];
    if (data.type !== 'score' || typeof data.score !== 'number' || !Number.isFinite(data.score) ||
        data.score < 0 || data.score > length - 1 || typeof data.confidence !== 'number' ||
        !Number.isFinite(data.confidence) || data.confidence < 0 || data.confidence > 1 ||
        !data.probabilities || typeof data.probabilities !== 'object' || Array.isArray(data.probabilities)) {
      return { available: false, reason: 'malformed' };
    }
    const probabilities = data.probabilities as Record<string, unknown>;
    if (Object.keys(probabilities).sort().join(',') !== Array.from({ length }, (_, i) => String(i)).sort().join(',')) {
      return { available: false, reason: 'malformed' };
    }
    const values = Object.values(probabilities);
    if (!values.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) ||
        Math.abs(values.reduce<number>((total, value) => total + (value as number), 0) - 1) > 0.02) {
      return { available: false, reason: 'malformed' };
    }
    answers[ids[index]] = { score: data.score, confidence: data.confidence,
      probabilities: probabilities as Record<string, number> };
  }
  return { available: true, model: expectedModel, answers,
    usage: { inputTokens: usage.input_tokens as number, outputTokens: usage.output_tokens as number }, durationMs };
}

function reasonFor(error: unknown, timedOut: boolean, cancelled: boolean): Extract<SemanticFitResult, {available: false}>['reason'] {
  if (cancelled) return 'cancelled';
  if (timedOut) return 'timeout';
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'RateLimitError') return 'rate_limited';
  if (name === 'AuthenticationError' || name === 'PermissionDeniedError') return 'authentication';
  if (name === 'APITimeoutError') return 'timeout';
  if (name === 'APIConnectionError') return 'connection';
  if (name === 'APIUserAbortError') return 'cancelled';
  return 'upstream';
}

export class TypeSafeSemanticFitClient implements SemanticFitClient {
  private inFlight = 0;
  constructor(private readonly transport: Transport, private readonly model: string = DEFAULT_MODEL,
    private readonly timeoutMs = 1_200, private readonly totalBudgetMs = 1_800,
    private readonly maxConcurrent = 3) {}

  async evaluate(request: SemanticFitRequest, signal?: AbortSignal): Promise<SemanticFitResult> {
    if (!validRequest(request)) return { available: false, reason: 'malformed' };
    if (signal?.aborted) return { available: false, reason: 'cancelled' };
    if (this.inFlight >= this.maxConcurrent) return { available: false, reason: 'busy' };
    this.inFlight++;
    const startedAt = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    let rejectDeadline: (error: Error) => void = () => {};
    const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
    const onAbort = () => { controller.abort(); rejectDeadline(new Error('cancelled')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); rejectDeadline(new Error('deadline')); }, this.totalBudgetMs);
    try {
      const ids = Object.keys(request.questions);
      const questions: Questions = Object.fromEntries(ids.map(id => [id, score(
        request.questions[id].instructions,
        request.questions[id].criteria as ScoreCriteria,
      )]));
      const state = JSON.parse(JSON.stringify(request.state)) as Record<string, JsonValue>;
      const raw = await Promise.race([
        this.transport(state, questions, this.model, controller.signal, this.timeoutMs), deadline,
      ]);
      return parseResult(raw, ids, ids.map(id => request.questions[id].criteria.length), this.model, Date.now() - startedAt);
    } catch (error) {
      return { available: false, reason: reasonFor(error, timedOut, Boolean(signal?.aborted)) };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      this.inFlight--;
    }
  }
}

/** Only this server module reads the credential; no EXPO_PUBLIC_ equivalent exists. */
export function createSemanticFitClientFromEnvironment(): SemanticFitClient {
  if (typeof window !== 'undefined') return new DisabledSemanticFitClient();
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) return new DisabledSemanticFitClient();
  const model = process.env.TYPESAFE_MODEL?.trim() || DEFAULT_MODEL;
  if (!/^jev-\d+\.\d+\.\d+$/.test(model)) return new DisabledSemanticFitClient();
  const baseURL = process.env.TYPESAFE_BASE_URL?.trim();
  if (baseURL) {
    try { if (new URL(baseURL).protocol !== 'https:') return new DisabledSemanticFitClient(); }
    catch { return new DisabledSemanticFitClient(); }
  }
  const requestedTimeout = Number(process.env.TYPESAFE_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(requestedTimeout) && requestedTimeout >= 200 && requestedTimeout <= 2_000
    ? requestedTimeout : 1_200;
  try {
    const client = new TypeSafeClient({
      apiKey, ...(baseURL ? { baseURL } : {}), defaultModel: model, timeout: timeoutMs,
      logLevel: 'off',
      retry: { maxRetries: 1, backoffInitialMs: 100, backoffMaxMs: 100,
        maxRetryAfterMs: 100, respectRetryAfter: false },
    });
    return new TypeSafeSemanticFitClient((state, questions, requestedModel, signal, timeout) =>
      client.systemOne({ state: state as Record<string, JsonValue>, questions, model: requestedModel }, { signal, timeout }), model,
      timeoutMs, Math.min(2_500, timeoutMs * 2 + 150));
  } catch { return new DisabledSemanticFitClient(); }
}

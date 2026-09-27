/** Vendor-neutral contract used only by server-side semantic evaluation. */
export interface SemanticScoreQuestion {
  instructions: string;
  /** Ordered complete descriptions, indexed from zero. */
  criteria: readonly [string, string, ...string[]];
}

export interface SemanticFitRequest {
  state: Record<string, unknown>;
  questions: Record<string, SemanticScoreQuestion>;
}

export interface SemanticScoreAnswer {
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
}

export type SemanticFitResult =
  | { available: true; model: string; answers: Record<string, SemanticScoreAnswer>;
      usage: { inputTokens: number; outputTokens: number }; durationMs: number }
  | { available: false; reason: 'disabled' | 'cancelled' | 'timeout' | 'rate_limited' |
      'authentication' | 'connection' | 'upstream' | 'malformed' | 'busy' };

export interface SemanticFitClient {
  evaluate(request: SemanticFitRequest, signal?: AbortSignal): Promise<SemanticFitResult>;
}

export class DisabledSemanticFitClient implements SemanticFitClient {
  async evaluate(_request: SemanticFitRequest): Promise<SemanticFitResult> { return { available: false, reason: 'disabled' }; }
}

/** A network-free test double; never construct the vendor SDK in unit tests. */
export class MockSemanticFitClient implements SemanticFitClient {
  readonly calls: SemanticFitRequest[] = [];
  constructor(private readonly outcome: SemanticFitResult | ((request: SemanticFitRequest) => SemanticFitResult)) {}
  async evaluate(request: SemanticFitRequest): Promise<SemanticFitResult> {
    this.calls.push(request);
    return typeof this.outcome === 'function' ? this.outcome(request) : this.outcome;
  }
}

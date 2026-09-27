import type { Firestore } from 'firebase-admin/firestore';

export type JevMode = 'disabled' | 'shadow' | 'canary' | 'enabled';
export type JevDecisionReason = 'disabled' | 'master_disabled' | 'config_unavailable' | 'config_invalid' |
  'approval_missing' | 'model_mismatch' | 'canary_excluded' | 'selected';

export interface JevBudget {
  maxCandidates: number;
  maxEstimatedCostUsd: number;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface JevDecision {
  mode: JevMode;
  runSemantic: boolean;
  applySemantic: boolean;
  reason: JevDecisionReason;
  modelVersion?: string;
  budget?: JevBudget;
}

export interface JevRollout { resolve(uid: string): Promise<JevDecision> }
export interface JevConfigStore { get(): Promise<unknown> }

/** Server Admin SDK only; Firestore rules deny client access to SERVER_CONFIG. */
export class FirestoreJevConfigStore implements JevConfigStore {
  constructor(private readonly db: Firestore) {}
  async get(): Promise<unknown> {
    const snapshot = await this.db.doc('SERVER_CONFIG/jev').get();
    return snapshot.exists ? snapshot.data() : null;
  }
}

type ValidConfig = JevBudget & {
  schemaVersion: 1; mode: JevMode; canaryPercent: number;
  modelVersion: string; evaluationReference: string;
};

function validCost(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function parseConfig(value: unknown): ValidConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1 || !['disabled', 'shadow', 'canary', 'enabled'].includes(data.mode as string) ||
      !Number.isInteger(data.canaryPercent) || !validCost(data.canaryPercent, 0, 100) ||
      !Number.isInteger(data.maxCandidates) || !validCost(data.maxCandidates, 1, 20) ||
      !validCost(data.maxEstimatedCostUsd, 0.001, 1) ||
      !validCost(data.inputUsdPerMillion, 0.000001, 100) || !validCost(data.outputUsdPerMillion, 0.000001, 100) ||
      typeof data.modelVersion !== 'string' || !/^jev-\d+\.\d+\.\d+$/.test(data.modelVersion) ||
      typeof data.evaluationReference !== 'string' || !/^[A-Za-z0-9._/-]{1,128}$/.test(data.evaluationReference)) {
    return null;
  }
  return data as unknown as ValidConfig;
}

function bucket(uid: string, salt: string): number {
  let hash = 2166136261;
  const value = `${salt}:${uid}`;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

const disabled = (reason: JevDecisionReason, mode: JevMode = 'disabled'): JevDecision =>
  ({ mode, reason, runSemantic: false, applySemantic: false });

/** Reads the control document on every eligible request: mode=disabled is a no-redeploy kill switch. */
export class FirestoreJevRollout implements JevRollout {
  constructor(private readonly store: JevConfigStore,
    private readonly environment: Record<string, string | undefined> = process.env) {}

  async resolve(uid: string): Promise<JevDecision> {
    if (this.environment.JEV_RANKING_ENABLED !== 'true') return disabled('master_disabled');
    let raw: unknown;
    try { raw = await this.store.get(); }
    catch { return disabled('config_unavailable'); }
    const config = parseConfig(raw);
    if (!config) return disabled(raw == null ? 'config_unavailable' : 'config_invalid');
    if (config.mode === 'disabled') return disabled('disabled');
    if (!this.environment.JEV_POLICY_APPROVAL_REFERENCE ||
        config.evaluationReference !== this.environment.JEV_POLICY_APPROVAL_REFERENCE) {
      return disabled('approval_missing', config.mode);
    }
    const pinnedModel = this.environment.TYPESAFE_MODEL?.trim() || 'jev-1.13.0';
    if (config.modelVersion !== pinnedModel) return disabled('model_mismatch', config.mode);
    const selected = config.mode !== 'canary' ||
      bucket(uid, this.environment.JEV_CANARY_SALT || 'food-jev-v1') < config.canaryPercent;
    if (!selected) return disabled('canary_excluded', config.mode);
    return {
      mode: config.mode, reason: 'selected', runSemantic: true,
      applySemantic: config.mode !== 'shadow', modelVersion: config.modelVersion,
      budget: { maxCandidates: config.maxCandidates, maxEstimatedCostUsd: config.maxEstimatedCostUsd,
        inputUsdPerMillion: config.inputUsdPerMillion, outputUsdPerMillion: config.outputUsdPerMillion },
    };
  }
}

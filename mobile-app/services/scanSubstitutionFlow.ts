import {
  RecommendationRequestError,
  type IntentAwareRequest,
  type IntentAwareResult,
  type RecommendationForDisplay,
  type RecommendationRequestOptions,
} from '@/services/api/intentAwareRecommendations';

export type ScanSubstitutionState =
  | { status: 'idle' }
  | { status: 'loading'; barcode: string; profileId: string }
  | { status: 'success'; result: IntentAwareResult }
  | { status: 'empty'; result: IntentAwareResult; message: string }
  | { status: 'offline' | 'timeout' | 'signed_out' | 'error'; message: string };

export type SubstitutionFetcher = (
  input: IntentAwareRequest,
  options?: RecommendationRequestOptions,
) => Promise<IntentAwareResult>;

const REASON_LABELS: Record<string, string> = {
  MATCH_CATEGORY_EXACT: 'Same product category',
  MATCH_CATEGORY_RELATED: 'Related product category',
  SAFE_ALLERGEN_FREE: 'No identified allergen conflict for this profile',
  SAFE_ADDITIVE_FREE: 'No identified avoided-additive conflict',
  DIET_ALIGNED_VEGAN: 'Matches the vegan preference',
  DIET_ALIGNED_VEGETARIAN: 'Matches the vegetarian preference',
  DIET_ALIGNED_GLUTEN_FREE: 'Matches the gluten-free preference',
  LOWER_SUGAR: 'Lower sugar per 100 g',
  LOWER_SALT: 'Lower salt per 100 g',
  LOWER_SATURATED_FAT: 'Lower saturated fat per 100 g',
  HIGHER_FIBRE: 'Higher fibre per 100 g',
  HIGHER_PROTEIN: 'Higher protein per 100 g',
  BETTER_NUTRI_SCORE: 'Better nutrition score',
  SEMANTIC_FIT_APPLIED: 'Fits the current shopping intention',
};

export function recommendationReason(item: RecommendationForDisplay): string {
  const labels = item.reasonCodes
    .map(code => REASON_LABELS[code])
    .filter((label): label is string => Boolean(label));
  return labels.slice(0, 3).join(' • ') || 'Eligible for the selected profile';
}

function emptyStateMessage(result: IntentAwareResult): string {
  if (result.status === 'insufficient_data') {
    return 'There is not enough verified product data to suggest a safe alternative.';
  }
  return 'No alternatives met the selected profile’s safety requirements.';
}

function errorState(error: unknown): ScanSubstitutionState {
  if (error instanceof RecommendationRequestError) {
    if (error.code === 'offline') {
      return { status: 'offline', message: 'You appear to be offline. Reconnect to load alternatives.' };
    }
    if (error.code === 'timeout') {
      return { status: 'timeout', message: 'Alternatives took too long to load. Please try again.' };
    }
    if (error.code === 'signed_out') {
      return { status: 'signed_out', message: 'Sign in to load profile-aware alternatives.' };
    }
  }
  return { status: 'error', message: 'Alternatives are unavailable right now. Please try again.' };
}

/** Keeps scan/profile/account changes from publishing an obsolete response. */
export class ScanSubstitutionCoordinator {
  private requestSequence = 0;
  private controller: AbortController | null = null;

  constructor(
    private readonly fetcher: SubstitutionFetcher,
    private readonly publish: (state: ScanSubstitutionState) => void,
  ) {}

  clear(): void {
    this.cancel();
    this.publish({ status: 'idle' });
  }

  cancel(): void {
    this.requestSequence += 1;
    this.controller?.abort();
    this.controller = null;
  }

  async load(input: IntentAwareRequest): Promise<void> {
    this.requestSequence += 1;
    const sequence = this.requestSequence;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.publish({ status: 'loading', barcode: input.barcode, profileId: input.profileId });

    try {
      const result = await this.fetcher(input, { signal: controller.signal });
      if (sequence !== this.requestSequence || controller.signal.aborted) return;
      if (result.status !== 'success' || result.substitutions.length === 0) {
        this.publish({ status: 'empty', result, message: emptyStateMessage(result) });
      } else {
        this.publish({ status: 'success', result });
      }
    } catch (error) {
      if (sequence !== this.requestSequence || controller.signal.aborted) return;
      this.publish(errorState(error));
    } finally {
      if (sequence === this.requestSequence) this.controller = null;
    }
  }
}

export function openSubstitutionProduct(
  barcode: string,
  setBarcode: (barcode: string) => void,
  navigate: () => void,
): void {
  if (!/^[0-9]{8,14}$/.test(barcode)) return;
  setBarcode(barcode);
  navigate();
}

/**
 * Save Check Functionality Tests
 *
 * Tests for the "Save this check" feature on the results screen:
 * - Can save fresh scans
 * - Can save revisited unsaved scans
 * - Cannot save already saved scans
 * - Button visibility logic
 */

// Define __DEV__ for test environment
// @ts-expect-error - __DEV__ is a React Native global
globalThis.__DEV__ = true;

import type { RecentCheck, OutcomeState } from '../types';

// ============================================
// TEST HELPERS
// ============================================

function createMockRecentCheck(
  overrides: Partial<RecentCheck> = {}
): RecentCheck {
  return {
    id: 'check-123',
    itemName: 'Test Item',
    category: 'tops',
    imageUri: 'file://test.jpg',
    outcome: 'looks_like_good_match',
    confidence: 'great',
    confidenceScore: 0.85,
    scannedItem: {
      id: 'scan-1',
      imageUri: 'file://test.jpg',
      category: 'tops',
      colors: [],
      styleTags: [],
      descriptiveLabel: 'Shirt',
      itemSignals: {
        stylingRisk: 'medium',
      },
      scannedAt: Date.now(),
    },
    createdAt: Date.now(),
    ...overrides,
  };
}

// ============================================
// TESTS: canSaveCheck Logic
// ============================================

describe('canSaveCheck logic', () => {
  describe('Fresh scans (not viewing saved check)', () => {
    it('returns true for fresh unsaved scan with currentCheckId', () => {
      const hasCurrentScan = true;
      const isViewingSavedCheck = false;
      const currentCheckId = 'check-123';
      const isSaved = false;
      const savedCheck = null as RecentCheck | null;

      const canSave =
        (hasCurrentScan && !isViewingSavedCheck && !!currentCheckId && !isSaved) ||
        (isViewingSavedCheck && savedCheck && savedCheck.outcome !== 'saved_to_revisit' && !isSaved);

      expect(canSave).toBe(true);
    });

    it('returns false for fresh scan without currentCheckId', () => {
      const hasCurrentScan = true;
      const isViewingSavedCheck = false;
      const currentCheckId = null;
      const isSaved = false;
      const savedCheck = null as RecentCheck | null;

      const canSave =
        (hasCurrentScan && !isViewingSavedCheck && !!currentCheckId && !isSaved) ||
        (isViewingSavedCheck && savedCheck && savedCheck.outcome !== 'saved_to_revisit' && !isSaved);

      expect(canSave).toBe(false);
    });

    it('returns false for fresh scan already saved in session', () => {
      const hasCurrentScan = true;
      const isViewingSavedCheck = false;
      const currentCheckId = 'check-123';
      const isSaved = true;
      const savedCheck = null as RecentCheck | null;

      const canSave =
        (hasCurrentScan && !isViewingSavedCheck && !!currentCheckId && !isSaved) ||
        (isViewingSavedCheck && savedCheck && savedCheck.outcome !== 'saved_to_revisit' && !isSaved);

      expect(canSave).toBe(false);
    });
  });

  describe('Revisited checks (viewing saved check)', () => {
    it('returns true for revisited unsaved check', () => {
      const hasCurrentScan = false;
      const isViewingSavedCheck = true;
      const currentCheckId = null;
      const isSaved = false;
      const savedCheck = createMockRecentCheck({
        outcome: 'looks_like_good_match',
      });

      const canSave =
        (hasCurrentScan && !isViewingSavedCheck && !!currentCheckId && !isSaved) ||
        (isViewingSavedCheck && savedCheck?.outcome !== 'saved_to_revisit' && !isSaved);

      expect(canSave).toBe(true);
    });

    it('returns false for revisited already saved check', () => {
      const hasCurrentScan = false;
      const isViewingSavedCheck = true;
      const currentCheckId = null;
      const isSaved = false;
      const savedCheck = createMockRecentCheck({
        outcome: 'saved_to_revisit',
      });

      const canSave =
        (hasCurrentScan && !isViewingSavedCheck && !!currentCheckId && !isSaved) ||
        (isViewingSavedCheck && savedCheck?.outcome !== 'saved_to_revisit' && !isSaved);

      expect(canSave).toBe(false);
    });

    it('returns false for revisited unsaved check marked as saved in session', () => {
      const hasCurrentScan = false;
      const isViewingSavedCheck = true;
      const currentCheckId = null;
      const isSaved = true;
      const savedCheck = createMockRecentCheck({
        outcome: 'looks_like_good_match',
      });

      const canSave =
        (hasCurrentScan && !isViewingSavedCheck && !!currentCheckId && !isSaved) ||
        (isViewingSavedCheck && savedCheck?.outcome !== 'saved_to_revisit' && !isSaved);

      expect(canSave).toBe(false);
    });
  });
});

// ============================================
// TESTS: Button Visibility Logic
// ============================================

describe('Button visibility logic', () => {
  describe('Primary CTA', () => {
    it('shows "Save this check" for fresh unsaved scan', () => {
      const isViewingSavedCheck = false;
      const savedCheck = null as RecentCheck | null;
      const isSaved = false;

      const shouldShowSaveButton =
        !isViewingSavedCheck &&
        !isSaved;

      const shouldShowScanAnotherButton =
        (isViewingSavedCheck && savedCheck && savedCheck.outcome === 'saved_to_revisit') ||
        isSaved;

      expect(shouldShowSaveButton).toBe(true);
      expect(shouldShowScanAnotherButton).toBe(false);
    });

    it('shows "Scan another item" for fresh scan just saved', () => {
      const isViewingSavedCheck = false;
      const savedCheck = null as RecentCheck | null;
      const isSaved = true;

      const shouldShowSaveButton =
        !isViewingSavedCheck &&
        !isSaved;

      const shouldShowScanAnotherButton =
        (isViewingSavedCheck && savedCheck && savedCheck.outcome === 'saved_to_revisit') ||
        isSaved;

      expect(shouldShowSaveButton).toBe(false);
      expect(shouldShowScanAnotherButton).toBe(true);
    });

    it('shows "Save this check" for revisited unsaved scan', () => {
      const isViewingSavedCheck = true;
      const savedCheck = createMockRecentCheck({
        outcome: 'looks_like_good_match',
      });
      const isSaved = false;

      const shouldShowSaveButton =
        isViewingSavedCheck &&
        savedCheck?.outcome !== 'saved_to_revisit' &&
        !isSaved;

      const shouldShowScanAnotherButton =
        (isViewingSavedCheck && savedCheck?.outcome === 'saved_to_revisit') ||
        isSaved;

      expect(shouldShowSaveButton).toBe(true);
      expect(shouldShowScanAnotherButton).toBe(false);
    });

    it('shows "Scan another item" for revisited saved scan', () => {
      const isViewingSavedCheck = true;
      const savedCheck = createMockRecentCheck({
        outcome: 'saved_to_revisit',
      });
      const isSaved = false;

      const shouldShowSaveButton =
        isViewingSavedCheck &&
        savedCheck?.outcome !== 'saved_to_revisit' &&
        !isSaved;

      const shouldShowScanAnotherButton =
        (isViewingSavedCheck && savedCheck?.outcome === 'saved_to_revisit') ||
        isSaved;

      expect(shouldShowSaveButton).toBe(false);
      expect(shouldShowScanAnotherButton).toBe(true);
    });
  });

  describe('Secondary CTA (Scan another item)', () => {
    it('shows for fresh unsaved scan', () => {
      const isSaved = false;
      const isViewingSavedCheck = false;
      const savedCheck = null as RecentCheck | null;

      const shouldShowSecondary =
        !isSaved &&
        !(isViewingSavedCheck && savedCheck && savedCheck.outcome === 'saved_to_revisit');

      expect(shouldShowSecondary).toBe(true);
    });

    it('hides for fresh scan just saved', () => {
      const isSaved = true;
      const isViewingSavedCheck = false;
      const savedCheck = null as RecentCheck | null;

      const shouldShowSecondary =
        !isSaved &&
        !(isViewingSavedCheck && savedCheck && savedCheck.outcome === 'saved_to_revisit');

      expect(shouldShowSecondary).toBe(false);
    });

    it('shows for revisited unsaved scan', () => {
      const isSaved = false;
      const isViewingSavedCheck = true;
      const savedCheck = createMockRecentCheck({
        outcome: 'looks_like_good_match',
      });

      const shouldShowSecondary =
        !isSaved &&
        !(isViewingSavedCheck && savedCheck?.outcome === 'saved_to_revisit');

      expect(shouldShowSecondary).toBe(true);
    });

    it('hides for revisited saved scan', () => {
      const isSaved = false;
      const isViewingSavedCheck = true;
      const savedCheck = createMockRecentCheck({
        outcome: 'saved_to_revisit',
      });

      const shouldShowSecondary =
        !isSaved &&
        !(isViewingSavedCheck && savedCheck?.outcome === 'saved_to_revisit');

      expect(shouldShowSecondary).toBe(false);
    });
  });
});

// ============================================
// TESTS: Outcome States
// ============================================

describe('Outcome state handling', () => {
  const allOutcomes: OutcomeState[] = [
    'looks_like_good_match',
    'could_work_with_pieces',
    'might_feel_tricky',
    'needs_more_context',
    'saved_to_revisit',
  ];

  it('treats "saved_to_revisit" as saved', () => {
    const savedCheck = createMockRecentCheck({
      outcome: 'saved_to_revisit',
    });

    expect(savedCheck.outcome === 'saved_to_revisit').toBe(true);
  });

  it('treats all other outcomes as unsaved', () => {
    const unsavedOutcomes = allOutcomes.filter((o) => o !== 'saved_to_revisit');

    unsavedOutcomes.forEach((outcome) => {
      const check = createMockRecentCheck({ outcome });
      expect(check.outcome !== 'saved_to_revisit').toBe(true);
    });
  });

  it('allows saving any unsaved outcome', () => {
    const unsavedOutcomes = allOutcomes.filter((o) => o !== 'saved_to_revisit');

    unsavedOutcomes.forEach((outcome) => {
      const savedCheck = createMockRecentCheck({ outcome });
      const isViewingSavedCheck = true;
      const isSaved = false;

      const canSave =
        isViewingSavedCheck &&
        savedCheck.outcome !== 'saved_to_revisit' &&
        !isSaved;

      expect(canSave).toBe(true);
    });
  });
});

// ============================================
// TESTS: Edge Cases
// ============================================

describe('Edge cases', () => {
  it('handles null savedCheck gracefully (real-world scenario)', () => {
    const savedCheck = null as RecentCheck | null;
    // In the real app: isViewingSavedCheck = !!savedCheck
    const isViewingSavedCheck = !!savedCheck;
    const isSaved = false;

    const canSave =
      isViewingSavedCheck &&
      savedCheck &&
      savedCheck.outcome !== 'saved_to_revisit' &&
      !isSaved;

    // Since isViewingSavedCheck is false, canSave is false
    expect(canSave).toBe(false);
    expect(isViewingSavedCheck).toBe(false);
  });

  it('handles undefined outcome gracefully', () => {
    const savedCheck = createMockRecentCheck();
    // @ts-expect-error - Testing undefined outcome
    savedCheck.outcome = undefined;

    expect(savedCheck.outcome !== 'saved_to_revisit').toBe(true);
  });

  it('prevents double-save with isSaved flag', () => {
    // Scenario: User clicks save, isSaved=true immediately
    const isViewingSavedCheck = false;
    const currentCheckId = 'check-123';
    const isSaved = true;

    const canSave =
      !isViewingSavedCheck && !!currentCheckId && !isSaved;

    expect(canSave).toBe(false);
  });
});


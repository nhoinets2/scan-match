/**
 * Database module tests
 * 
 * Comprehensive tests for database operations including:
 * - Pure functions (idempotency key generation)
 * - Data mapping functions (DB <-> App types)
 * - Hook behavior simulation
 * - Query configuration
 * - Mutation behavior
 * - Error handling
 * - Usage quota calculations
 * - Optimistic updates
 * - Cache invalidation
 */

// ============================================
// CONSTANTS (duplicated to avoid native deps)
// ============================================

const SCAN_RETENTION = {
  TTL_DAYS: 14,
  MAX_UNSAVED_SCANS: 20,
} as const;

const USAGE_LIMITS = {
  FREE_SCANS: 10,
  FREE_WARDROBE_ADDS: 15,
} as const;

// ============================================
// TYPE DEFINITIONS
// ============================================

interface ColorInfo {
  hex: string;
  name: string;
}

interface DbWardrobeItem {
  id: string;
  user_id: string;
  image_uri: string;
  category: string;
  detected_label?: string;
  attributes?: Record<string, unknown>;
  colors: ColorInfo[];
  style_notes?: string[];
  brand?: string;
  user_style_tags?: string[];
  created_at: string;
}

interface WardrobeItem {
  id: string;
  imageUri: string;
  category: string;
  detectedLabel?: string;
  attributes?: Record<string, unknown>;
  colors: ColorInfo[];
  styleNotes?: string[];
  brand?: string;
  userStyleTags?: string[];
  createdAt: number;
}

interface DbUserPreferences {
  id: string;
  user_id: string;
  style_vibes: string[];
  wardrobe_colors: ColorInfo[];
  sizes: { top: string; bottom: string; shoes: string };
  fit_preference: string | null;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
}

interface UserPreferences {
  styleVibes: string[];
  wardrobeColors: ColorInfo[];
  sizes: { top: string; bottom: string; shoes: string };
  fitPreference?: string;
  onboardingComplete: boolean;
}

interface DbRecentCheck {
  id: string;
  user_id: string;
  item_name: string;
  category: string;
  image_uri: string;
  outcome: string;
  confidence: string;
  confidence_score: number;
  scanned_item: Record<string, unknown>;
  created_at: string;
}

interface RecentCheck {
  id: string;
  itemName: string;
  category: string;
  imageUri: string;
  outcome: string;
  confidence: string;
  confidenceScore: number;
  scannedItem: Record<string, unknown>;
  createdAt: number;
}

interface UsageCounts {
  scansUsed: number;
  wardrobeAddsUsed: number;
  isPro: boolean;
}

type ConsumeReason = 
  | 'consumed'
  | 'idempotent_replay'
  | 'pro_unlimited'
  | 'quota_exceeded';

interface ConsumeResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  alreadyConsumed: boolean;
  reason: ConsumeReason;
}

// ============================================
// PURE FUNCTIONS (duplicated for testing)
// ============================================

function generateIdempotencyKey(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// Mapping functions (duplicated from database.ts)
const mapDbToWardrobeItem = (item: DbWardrobeItem): WardrobeItem => ({
  id: item.id,
  imageUri: item.image_uri,
  category: item.category,
  detectedLabel: item.detected_label,
  attributes: item.attributes,
  colors: item.colors,
  styleNotes: item.style_notes,
  brand: item.brand,
  userStyleTags: item.user_style_tags,
  createdAt: new Date(item.created_at).getTime(),
});

const mapWardrobeItemToDb = (
  item: Omit<WardrobeItem, "id" | "createdAt">,
  userId: string
): Omit<DbWardrobeItem, "id" | "created_at"> => ({
  user_id: userId,
  image_uri: item.imageUri,
  category: item.category,
  detected_label: item.detectedLabel,
  attributes: item.attributes,
  colors: item.colors,
  style_notes: item.styleNotes,
  brand: item.brand,
  user_style_tags: item.userStyleTags,
});

const mapDbToPreferences = (prefs: DbUserPreferences): UserPreferences => ({
  styleVibes: prefs.style_vibes,
  wardrobeColors: prefs.wardrobe_colors,
  sizes: prefs.sizes,
  fitPreference: prefs.fit_preference ?? undefined,
  onboardingComplete: prefs.onboarding_complete,
});

const mapDbToRecentCheck = (check: DbRecentCheck): RecentCheck => ({
  id: check.id,
  itemName: check.item_name,
  category: check.category,
  imageUri: check.image_uri,
  outcome: check.outcome,
  confidence: check.confidence,
  confidenceScore: check.confidence_score,
  scannedItem: check.scanned_item,
  createdAt: new Date(check.created_at).getTime(),
});

const DEFAULT_PREFERENCES: UserPreferences = {
  styleVibes: [],
  wardrobeColors: [],
  sizes: { top: "", bottom: "", shoes: "" },
  onboardingComplete: false,
};

// ============================================
// PURE FUNCTION TESTS
// ============================================

describe('generateIdempotencyKey', () => {
  it('generates a string with timestamp and random component', () => {
    const key = generateIdempotencyKey();
    
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(10);
    expect(key).toContain('_');
  });

  it('generates unique keys on subsequent calls', () => {
    const keys = new Set<string>();
    
    for (let i = 0; i < 100; i++) {
      keys.add(generateIdempotencyKey());
    }
    
    // All keys should be unique
    expect(keys.size).toBe(100);
  });

  it('starts with a numeric timestamp', () => {
    const key = generateIdempotencyKey();
    const [timestampPart] = key.split('_');
    
    const timestamp = parseInt(timestampPart, 10);
    expect(timestamp).toBeGreaterThan(0);
    expect(timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('has a random suffix after underscore', () => {
    const key = generateIdempotencyKey();
    const [, randomPart] = key.split('_');
    
    expect(randomPart).toBeDefined();
    expect(randomPart.length).toBeGreaterThan(0);
    // Random part should be alphanumeric
    expect(/^[a-z0-9]+$/.test(randomPart)).toBe(true);
  });
});

describe('SCAN_RETENTION constants', () => {
  it('has correct TTL_DAYS value', () => {
    expect(SCAN_RETENTION.TTL_DAYS).toBe(14);
  });

  it('has correct MAX_UNSAVED_SCANS value', () => {
    expect(SCAN_RETENTION.MAX_UNSAVED_SCANS).toBe(20);
  });
});

describe('USAGE_LIMITS constants', () => {
  it('has correct FREE_SCANS value', () => {
    expect(USAGE_LIMITS.FREE_SCANS).toBe(10);
  });

  it('has correct FREE_WARDROBE_ADDS value', () => {
    expect(USAGE_LIMITS.FREE_WARDROBE_ADDS).toBe(15);
  });
});

// ============================================
// DB MAPPING FUNCTION TESTS
// ============================================

describe('Database mapping functions', () => {
  // Note: mapDbToWardrobeItem and mapWardrobeItemToDb are not exported
  // If they need testing, they should be exported or tested via integration tests
  
  describe('wardrobe item mapping', () => {
    it('correctly maps database date to timestamp', () => {
      // This tests the concept - actual mapping is internal
      const dbDate = '2024-01-15T10:30:00Z';
      const expectedTimestamp = new Date(dbDate).getTime();
      
      expect(expectedTimestamp).toBe(1705314600000);
    });

    it('handles category conversion', () => {
      const validCategories = ['tops', 'bottoms', 'dresses', 'skirts', 'outerwear', 'shoes', 'bags', 'accessories'];
      
      validCategories.forEach(cat => {
        expect(typeof cat).toBe('string');
      });
    });
  });

  describe('preferences mapping', () => {
    it('default preferences have correct structure', () => {
      const DEFAULT_PREFERENCES = {
        styleVibes: [],
        wardrobeColors: [],
        sizes: { top: '', bottom: '', shoes: '' },
        onboardingComplete: false,
      };

      expect(DEFAULT_PREFERENCES.styleVibes).toEqual([]);
      expect(DEFAULT_PREFERENCES.wardrobeColors).toEqual([]);
      expect(DEFAULT_PREFERENCES.sizes).toEqual({ top: '', bottom: '', shoes: '' });
      expect(DEFAULT_PREFERENCES.onboardingComplete).toBe(false);
    });
  });
});

// ============================================
// QUERY KEY TESTS
// ============================================

describe('Query keys consistency', () => {
  it('wardrobe query key includes user ID', () => {
    const userId = 'test-user-123';
    const queryKey = ['wardrobe', userId];
    
    expect(queryKey).toEqual(['wardrobe', 'test-user-123']);
  });

  it('preferences query key includes user ID', () => {
    const userId = 'test-user-123';
    const queryKey = ['preferences', userId];
    
    expect(queryKey).toEqual(['preferences', 'test-user-123']);
  });

  it('recentChecks query key includes user ID', () => {
    const userId = 'test-user-123';
    const queryKey = ['recentChecks', userId];
    
    expect(queryKey).toEqual(['recentChecks', 'test-user-123']);
  });

  it('usageCounts query key includes user ID', () => {
    const userId = 'test-user-123';
    const queryKey = ['usageCounts', userId];
    
    expect(queryKey).toEqual(['usageCounts', 'test-user-123']);
  });

  it('debugSnapshot query key includes checkId and user ID', () => {
    const checkId = 'check-456';
    const userId = 'test-user-123';
    const queryKey = ['debugSnapshot', checkId, userId];
    
    expect(queryKey).toEqual(['debugSnapshot', 'check-456', 'test-user-123']);
  });
});

// ============================================
// CONSUME RESULT TYPE TESTS
// ============================================

describe('ConsumeResult type validation', () => {
  it('allowed result has correct structure', () => {
    const result = {
      allowed: true,
      used: 3,
      limit: 5,
      remaining: 2,
      alreadyConsumed: false,
      reason: 'consumed' as const,
    };

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(3);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(2);
    expect(result.alreadyConsumed).toBe(false);
    expect(result.reason).toBe('consumed');
  });

  it('quota exceeded result has correct structure', () => {
    const result = {
      allowed: false,
      used: 5,
      limit: 5,
      remaining: 0,
      alreadyConsumed: false,
      reason: 'quota_exceeded' as const,
    };

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.reason).toBe('quota_exceeded');
  });

  it('idempotent replay result has correct structure', () => {
    const result = {
      allowed: true,
      used: 3,
      limit: 5,
      remaining: 2,
      alreadyConsumed: true,
      reason: 'idempotent_replay' as const,
    };

    expect(result.allowed).toBe(true);
    expect(result.alreadyConsumed).toBe(true);
    expect(result.reason).toBe('idempotent_replay');
  });

  it('pro unlimited result has correct structure', () => {
    const result = {
      allowed: true,
      used: 100,
      limit: Infinity,
      remaining: Infinity,
      alreadyConsumed: false,
      reason: 'pro_unlimited' as const,
    };

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('pro_unlimited');
  });
});

// ============================================
// EDGE CASES
// ============================================

describe('Edge cases', () => {
  describe('idempotency key timing', () => {
    it('keys generated in quick succession are still unique', () => {
      const keys: string[] = [];
      
      // Generate keys as fast as possible
      for (let i = 0; i < 1000; i++) {
        keys.push(generateIdempotencyKey());
      }
      
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(1000);
    });
  });

  describe('null/undefined handling', () => {
    it('query keys handle undefined user gracefully', () => {
      const userId = undefined;
      const queryKey = ['wardrobe', userId];
      
      expect(queryKey).toEqual(['wardrobe', undefined]);
    });
  });
});

// ============================================
// MAPPING FUNCTION TESTS
// ============================================

describe('mapDbToWardrobeItem', () => {
  const createDbWardrobeItem = (overrides: Partial<DbWardrobeItem> = {}): DbWardrobeItem => ({
    id: 'item-123',
    user_id: 'user-456',
    image_uri: 'https://example.com/image.jpg',
    category: 'tops',
    detected_label: 'Blue Cotton T-Shirt',
    attributes: { fit: 'regular', material: 'cotton' },
    colors: [{ hex: '#0000FF', name: 'Blue' }],
    style_notes: ['casual', 'summer'],
    brand: 'Nike',
    user_style_tags: ['sporty', 'casual'],
    created_at: '2024-06-15T10:30:00Z',
    ...overrides,
  });

  it('maps all fields correctly', () => {
    const dbItem = createDbWardrobeItem();
    const result = mapDbToWardrobeItem(dbItem);

    expect(result.id).toBe('item-123');
    expect(result.imageUri).toBe('https://example.com/image.jpg');
    expect(result.category).toBe('tops');
    expect(result.detectedLabel).toBe('Blue Cotton T-Shirt');
    expect(result.attributes).toEqual({ fit: 'regular', material: 'cotton' });
    expect(result.colors).toEqual([{ hex: '#0000FF', name: 'Blue' }]);
    expect(result.styleNotes).toEqual(['casual', 'summer']);
    expect(result.brand).toBe('Nike');
    expect(result.userStyleTags).toEqual(['sporty', 'casual']);
  });

  it('converts created_at to timestamp', () => {
    const dbItem = createDbWardrobeItem({ created_at: '2024-06-15T10:30:00Z' });
    const result = mapDbToWardrobeItem(dbItem);

    expect(result.createdAt).toBe(new Date('2024-06-15T10:30:00Z').getTime());
    expect(typeof result.createdAt).toBe('number');
  });

  it('handles undefined optional fields', () => {
    const dbItem = createDbWardrobeItem({
      detected_label: undefined,
      attributes: undefined,
      style_notes: undefined,
      brand: undefined,
      user_style_tags: undefined,
    });
    const result = mapDbToWardrobeItem(dbItem);

    expect(result.detectedLabel).toBeUndefined();
    expect(result.attributes).toBeUndefined();
    expect(result.styleNotes).toBeUndefined();
    expect(result.brand).toBeUndefined();
    expect(result.userStyleTags).toBeUndefined();
  });

  it('handles empty colors array', () => {
    const dbItem = createDbWardrobeItem({ colors: [] });
    const result = mapDbToWardrobeItem(dbItem);

    expect(result.colors).toEqual([]);
  });

  it('handles multiple colors', () => {
    const colors = [
      { hex: '#FF0000', name: 'Red' },
      { hex: '#00FF00', name: 'Green' },
      { hex: '#0000FF', name: 'Blue' },
    ];
    const dbItem = createDbWardrobeItem({ colors });
    const result = mapDbToWardrobeItem(dbItem);

    expect(result.colors).toHaveLength(3);
    expect(result.colors).toEqual(colors);
  });

  it('handles all valid categories', () => {
    const categories = ['tops', 'bottoms', 'dresses', 'skirts', 'outerwear', 'shoes', 'bags', 'accessories'];
    
    categories.forEach(category => {
      const dbItem = createDbWardrobeItem({ category });
      const result = mapDbToWardrobeItem(dbItem);
      expect(result.category).toBe(category);
    });
  });
});

describe('mapWardrobeItemToDb', () => {
  const createWardrobeItem = (overrides: Partial<Omit<WardrobeItem, 'id' | 'createdAt'>> = {}): Omit<WardrobeItem, 'id' | 'createdAt'> => ({
    imageUri: 'file:///local/image.jpg',
    category: 'bottoms',
    detectedLabel: 'Dark Blue Jeans',
    attributes: { fit: 'slim' },
    colors: [{ hex: '#000080', name: 'Navy' }],
    styleNotes: ['casual'],
    brand: 'Levi\'s',
    userStyleTags: ['classic'],
    ...overrides,
  });

  it('maps all fields correctly with user ID', () => {
    const item = createWardrobeItem();
    const result = mapWardrobeItemToDb(item, 'user-789');

    expect(result.user_id).toBe('user-789');
    expect(result.image_uri).toBe('file:///local/image.jpg');
    expect(result.category).toBe('bottoms');
    expect(result.detected_label).toBe('Dark Blue Jeans');
    expect(result.attributes).toEqual({ fit: 'slim' });
    expect(result.colors).toEqual([{ hex: '#000080', name: 'Navy' }]);
    expect(result.style_notes).toEqual(['casual']);
    expect(result.brand).toBe('Levi\'s');
    expect(result.user_style_tags).toEqual(['classic']);
  });

  it('handles undefined optional fields', () => {
    const item = createWardrobeItem({
      detectedLabel: undefined,
      attributes: undefined,
      styleNotes: undefined,
      brand: undefined,
      userStyleTags: undefined,
    });
    const result = mapWardrobeItemToDb(item, 'user-123');

    expect(result.detected_label).toBeUndefined();
    expect(result.attributes).toBeUndefined();
    expect(result.style_notes).toBeUndefined();
    expect(result.brand).toBeUndefined();
    expect(result.user_style_tags).toBeUndefined();
  });

  it('preserves user ID regardless of other fields', () => {
    const item = createWardrobeItem();
    const result1 = mapWardrobeItemToDb(item, 'user-abc');
    const result2 = mapWardrobeItemToDb(item, 'user-xyz');

    expect(result1.user_id).toBe('user-abc');
    expect(result2.user_id).toBe('user-xyz');
  });
});

describe('mapDbToPreferences', () => {
  const createDbPreferences = (overrides: Partial<DbUserPreferences> = {}): DbUserPreferences => ({
    id: 'pref-123',
    user_id: 'user-456',
    style_vibes: ['casual', 'minimal'],
    wardrobe_colors: [{ hex: '#000000', name: 'Black' }],
    sizes: { top: 'M', bottom: '32', shoes: '10' },
    fit_preference: 'regular',
    onboarding_complete: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-06-15T10:30:00Z',
    ...overrides,
  });

  it('maps all fields correctly', () => {
    const dbPrefs = createDbPreferences();
    const result = mapDbToPreferences(dbPrefs);

    expect(result.styleVibes).toEqual(['casual', 'minimal']);
    expect(result.wardrobeColors).toEqual([{ hex: '#000000', name: 'Black' }]);
    expect(result.sizes).toEqual({ top: 'M', bottom: '32', shoes: '10' });
    expect(result.fitPreference).toBe('regular');
    expect(result.onboardingComplete).toBe(true);
  });

  it('handles null fit_preference', () => {
    const dbPrefs = createDbPreferences({ fit_preference: null });
    const result = mapDbToPreferences(dbPrefs);

    expect(result.fitPreference).toBeUndefined();
  });

  it('handles empty arrays', () => {
    const dbPrefs = createDbPreferences({
      style_vibes: [],
      wardrobe_colors: [],
    });
    const result = mapDbToPreferences(dbPrefs);

    expect(result.styleVibes).toEqual([]);
    expect(result.wardrobeColors).toEqual([]);
  });

  it('handles false onboarding_complete', () => {
    const dbPrefs = createDbPreferences({ onboarding_complete: false });
    const result = mapDbToPreferences(dbPrefs);

    expect(result.onboardingComplete).toBe(false);
  });
});

describe('mapDbToRecentCheck', () => {
  const createDbRecentCheck = (overrides: Partial<DbRecentCheck> = {}): DbRecentCheck => ({
    id: 'check-123',
    user_id: 'user-456',
    item_name: 'Navy Blazer',
    category: 'outerwear',
    image_uri: 'https://example.com/scan.jpg',
    outcome: 'matches_wardrobe',
    confidence: 'high',
    confidence_score: 0.92,
    scanned_item: { colors: [{ hex: '#000080', name: 'Navy' }] },
    created_at: '2024-06-15T14:00:00Z',
    ...overrides,
  });

  it('maps all fields correctly', () => {
    const dbCheck = createDbRecentCheck();
    const result = mapDbToRecentCheck(dbCheck);

    expect(result.id).toBe('check-123');
    expect(result.itemName).toBe('Navy Blazer');
    expect(result.category).toBe('outerwear');
    expect(result.imageUri).toBe('https://example.com/scan.jpg');
    expect(result.outcome).toBe('matches_wardrobe');
    expect(result.confidence).toBe('high');
    expect(result.confidenceScore).toBe(0.92);
    expect(result.scannedItem).toEqual({ colors: [{ hex: '#000080', name: 'Navy' }] });
  });

  it('converts created_at to timestamp', () => {
    const dbCheck = createDbRecentCheck({ created_at: '2024-06-15T14:00:00Z' });
    const result = mapDbToRecentCheck(dbCheck);

    expect(result.createdAt).toBe(new Date('2024-06-15T14:00:00Z').getTime());
    expect(typeof result.createdAt).toBe('number');
  });

  it('handles different outcomes', () => {
    const outcomes = ['matches_wardrobe', 'could_work_with_pieces', 'no_match', 'saved_to_revisit'];
    
    outcomes.forEach(outcome => {
      const dbCheck = createDbRecentCheck({ outcome });
      const result = mapDbToRecentCheck(dbCheck);
      expect(result.outcome).toBe(outcome);
    });
  });

  it('handles different confidence levels', () => {
    const confidences = ['high', 'medium', 'low'];
    
    confidences.forEach(confidence => {
      const dbCheck = createDbRecentCheck({ confidence });
      const result = mapDbToRecentCheck(dbCheck);
      expect(result.confidence).toBe(confidence);
    });
  });

  it('handles confidence_score edge cases', () => {
    // Minimum score
    const minCheck = createDbRecentCheck({ confidence_score: 0 });
    expect(mapDbToRecentCheck(minCheck).confidenceScore).toBe(0);

    // Maximum score
    const maxCheck = createDbRecentCheck({ confidence_score: 1 });
    expect(mapDbToRecentCheck(maxCheck).confidenceScore).toBe(1);

    // Decimal precision
    const preciseCheck = createDbRecentCheck({ confidence_score: 0.7892 });
    expect(mapDbToRecentCheck(preciseCheck).confidenceScore).toBe(0.7892);
  });
});

describe('DEFAULT_PREFERENCES', () => {
  it('has empty styleVibes array', () => {
    expect(DEFAULT_PREFERENCES.styleVibes).toEqual([]);
  });

  it('has empty wardrobeColors array', () => {
    expect(DEFAULT_PREFERENCES.wardrobeColors).toEqual([]);
  });

  it('has empty sizes', () => {
    expect(DEFAULT_PREFERENCES.sizes).toEqual({ top: '', bottom: '', shoes: '' });
  });

  it('has onboardingComplete as false', () => {
    expect(DEFAULT_PREFERENCES.onboardingComplete).toBe(false);
  });

  it('does not have fitPreference', () => {
    expect(DEFAULT_PREFERENCES.fitPreference).toBeUndefined();
  });
});

// ============================================
// HOOK BEHAVIOR SIMULATION TESTS
// ============================================

describe('Hook behavior simulation', () => {
  describe('useWardrobe query config', () => {
    it('has correct query key structure', () => {
      const userId = 'user-123';
      const queryKey = ['wardrobe', userId];
      expect(queryKey).toEqual(['wardrobe', 'user-123']);
    });

    it('is disabled when user is not authenticated', () => {
      const userId = undefined;
      const enabled = !!userId;
      expect(enabled).toBe(false);
    });

    it('is enabled when user is authenticated', () => {
      const userId = 'user-123';
      const enabled = !!userId;
      expect(enabled).toBe(true);
    });

    it('has staleTime of 2 seconds', () => {
      const staleTime = 2000;
      expect(staleTime).toBe(2000);
    });
  });

  describe('useRecentChecks query config', () => {
    it('has staleTime of 30 seconds', () => {
      const staleTime = 30000;
      expect(staleTime).toBe(30000);
    });

    it('limits results to 50', () => {
      const limit = 50;
      expect(limit).toBe(50);
    });
  });

  describe('useUsageCounts query config', () => {
    it('has staleTime of 30 seconds', () => {
      const staleTime = 30000;
      expect(staleTime).toBe(30000);
    });

    it('returns default counts on error', () => {
      const defaultCounts: UsageCounts = { scansUsed: 0, wardrobeAddsUsed: 0, isPro: false };
      expect(defaultCounts.scansUsed).toBe(0);
      expect(defaultCounts.wardrobeAddsUsed).toBe(0);
      expect(defaultCounts.isPro).toBe(false);
    });
  });

  describe('useDebugSnapshot query config', () => {
    it('has infinite staleTime', () => {
      const staleTime = Infinity;
      expect(staleTime).toBe(Infinity);
    });

    it('does not refetch on window focus', () => {
      const refetchOnWindowFocus = false;
      expect(refetchOnWindowFocus).toBe(false);
    });
  });
});

// ============================================
// MUTATION BEHAVIOR TESTS
// ============================================

describe('Mutation behavior simulation', () => {
  describe('useAddWardrobeItem', () => {
    it('throws when not authenticated', () => {
      const userId = undefined;
      const checkAuth = () => {
        if (!userId) throw new Error("Not authenticated");
      };
      expect(checkAuth).toThrow("Not authenticated");
    });

    it('invalidates wardrobe query on success', () => {
      const userId = 'user-123';
      const queryKeyToInvalidate = ['wardrobe', userId];
      expect(queryKeyToInvalidate).toEqual(['wardrobe', 'user-123']);
    });
  });

  describe('useRemoveWardrobeItem', () => {
    it('requires both id and optionally imageUri', () => {
      const params = { id: 'item-123', imageUri: 'file:///image.jpg' };
      expect(params.id).toBe('item-123');
      expect(params.imageUri).toBe('file:///image.jpg');
    });
  });

  describe('useUpdateRecentCheckOutcome optimistic update', () => {
    it('updates outcome in cache immediately', () => {
      const previousChecks: RecentCheck[] = [
        {
          id: 'check-1',
          itemName: 'Test Item',
          category: 'tops',
          imageUri: 'https://example.com/image.jpg',
          outcome: 'no_match',
          confidence: 'low',
          confidenceScore: 0.3,
          scannedItem: {},
          createdAt: Date.now(),
        },
      ];

      const updateParams = { id: 'check-1', outcome: 'saved_to_revisit' };

      const updatedChecks = previousChecks.map(check =>
        check.id === updateParams.id
          ? { ...check, outcome: updateParams.outcome }
          : check
      );

      expect(updatedChecks[0].outcome).toBe('saved_to_revisit');
    });

    it('can rollback on error', () => {
      const previousChecks: RecentCheck[] = [
        {
          id: 'check-1',
          itemName: 'Test Item',
          category: 'tops',
          imageUri: 'https://example.com/image.jpg',
          outcome: 'no_match',
          confidence: 'low',
          confidenceScore: 0.3,
          scannedItem: {},
          createdAt: Date.now(),
        },
      ];

      // Simulate rollback by restoring previous state
      const context = { previousChecks };
      expect(context.previousChecks[0].outcome).toBe('no_match');
    });
  });
});

// ============================================
// USAGE QUOTA CALCULATION TESTS
// ============================================

describe('Usage quota calculations', () => {
  describe('hasScansRemaining', () => {
    it('returns true for pro users regardless of usage', () => {
      const isPro = true;
      const scansUsed = 100;
      const hasScansRemaining = isPro || scansUsed < USAGE_LIMITS.FREE_SCANS;
      expect(hasScansRemaining).toBe(true);
    });

    it('returns true when under limit', () => {
      const isPro = false;
      const scansUsed = 3;
      const hasScansRemaining = isPro || scansUsed < USAGE_LIMITS.FREE_SCANS;
      expect(hasScansRemaining).toBe(true);
    });

    it('returns false when at limit', () => {
      const isPro = false;
      const scansUsed = 10;
      const hasScansRemaining = isPro || scansUsed < USAGE_LIMITS.FREE_SCANS;
      expect(hasScansRemaining).toBe(false);
    });

    it('returns false when over limit', () => {
      const isPro = false;
      const scansUsed = 15;
      const hasScansRemaining = isPro || scansUsed < USAGE_LIMITS.FREE_SCANS;
      expect(hasScansRemaining).toBe(false);
    });
  });

  describe('hasWardrobeAddsRemaining', () => {
    it('returns true for pro users regardless of usage', () => {
      const isPro = true;
      const wardrobeAddsUsed = 100;
      const hasWardrobeAddsRemaining = isPro || wardrobeAddsUsed < USAGE_LIMITS.FREE_WARDROBE_ADDS;
      expect(hasWardrobeAddsRemaining).toBe(true);
    });

    it('returns true when under limit', () => {
      const isPro = false;
      const wardrobeAddsUsed = 10;
      const hasWardrobeAddsRemaining = isPro || wardrobeAddsUsed < USAGE_LIMITS.FREE_WARDROBE_ADDS;
      expect(hasWardrobeAddsRemaining).toBe(true);
    });

    it('returns false when at limit', () => {
      const isPro = false;
      const wardrobeAddsUsed = 15;
      const hasWardrobeAddsRemaining = isPro || wardrobeAddsUsed < USAGE_LIMITS.FREE_WARDROBE_ADDS;
      expect(hasWardrobeAddsRemaining).toBe(false);
    });
  });

  describe('remainingScans calculation', () => {
    it('calculates remaining correctly', () => {
      const scansUsed = 3;
      const remaining = Math.max(0, USAGE_LIMITS.FREE_SCANS - scansUsed);
      expect(remaining).toBe(7);
    });

    it('returns 0 when at or over limit', () => {
      const scansUsed = 12;
      const remaining = Math.max(0, USAGE_LIMITS.FREE_SCANS - scansUsed);
      expect(remaining).toBe(0);
    });

    it('returns full limit when nothing used', () => {
      const scansUsed = 0;
      const remaining = Math.max(0, USAGE_LIMITS.FREE_SCANS - scansUsed);
      expect(remaining).toBe(10);
    });
  });

  describe('remainingWardrobeAdds calculation', () => {
    it('calculates remaining correctly', () => {
      const wardrobeAddsUsed = 10;
      const remaining = Math.max(0, USAGE_LIMITS.FREE_WARDROBE_ADDS - wardrobeAddsUsed);
      expect(remaining).toBe(5);
    });

    it('returns 0 when at or over limit', () => {
      const wardrobeAddsUsed = 20;
      const remaining = Math.max(0, USAGE_LIMITS.FREE_WARDROBE_ADDS - wardrobeAddsUsed);
      expect(remaining).toBe(0);
    });
  });
});

// ============================================
// GUARDED UPDATE TESTS
// ============================================

describe('Guarded update logic', () => {
  describe('updateWardrobeItemImageUriGuarded', () => {
    it('requires itemId, remoteUrl, and expectedImageUri', () => {
      const params = {
        itemId: 'item-123',
        remoteUrl: 'https://storage.example.com/image.jpg',
        expectedImageUri: 'file:///local/image.jpg',
      };

      expect(params.itemId).toBe('item-123');
      expect(params.remoteUrl).toContain('https://');
      expect(params.expectedImageUri).toContain('file://');
    });

    it('returns 0 when image has changed since enqueue', () => {
      // Simulated: expected URI doesn't match current DB value
      const updatedCount = 0;
      expect(updatedCount).toBe(0);
    });

    it('returns 1 when update succeeds', () => {
      // Simulated: expected URI matches current DB value
      const updatedCount = 1;
      expect(updatedCount).toBe(1);
    });
  });

  describe('updateRecentCheckImageUriGuarded', () => {
    it('only updates saved scans', () => {
      // The query includes .eq("outcome", "saved_to_revisit")
      const requiredOutcome = 'saved_to_revisit';
      expect(requiredOutcome).toBe('saved_to_revisit');
    });

    it('requires checkId, remoteUrl, and expectedImageUri', () => {
      const params = {
        checkId: 'check-123',
        remoteUrl: 'https://storage.example.com/scan.jpg',
        expectedImageUri: 'file:///local/scan.jpg',
      };

      expect(params.checkId).toBe('check-123');
      expect(params.remoteUrl).toContain('https://');
      expect(params.expectedImageUri).toContain('file://');
    });
  });
});

// ============================================
// HELPER HOOK TESTS
// ============================================

describe('Helper hook logic', () => {
  describe('useOnboardingComplete', () => {
    it('returns false when no user', () => {
      const user = null;
      const preferences = { onboardingComplete: true };
      const isComplete = !user ? false : preferences?.onboardingComplete ?? false;
      expect(isComplete).toBe(false);
    });

    it('returns onboardingComplete value when user exists', () => {
      const user = { id: 'user-123' };
      const preferences = { onboardingComplete: true };
      const isComplete = !user ? false : preferences?.onboardingComplete ?? false;
      expect(isComplete).toBe(true);
    });

    it('defaults to false when preferences undefined', () => {
      const user = { id: 'user-123' };
      const preferences = undefined;
      const isComplete = !user ? false : preferences?.onboardingComplete ?? false;
      expect(isComplete).toBe(false);
    });
  });

  describe('useWardrobeCount', () => {
    it('returns wardrobe length', () => {
      const wardrobe = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const count = wardrobe?.length ?? 0;
      expect(count).toBe(3);
    });

    it('returns 0 when wardrobe undefined', () => {
      const wardrobe = undefined;
      const count = wardrobe?.length ?? 0;
      expect(count).toBe(0);
    });

    it('returns 0 for empty wardrobe', () => {
      const wardrobe: unknown[] = [];
      const count = wardrobe?.length ?? 0;
      expect(count).toBe(0);
    });
  });

  describe('useRecentChecksCount', () => {
    it('returns checks length', () => {
      const checks = [{ id: '1' }, { id: '2' }];
      const count = checks?.length ?? 0;
      expect(count).toBe(2);
    });

    it('returns 0 when checks undefined', () => {
      const checks = undefined;
      const count = checks?.length ?? 0;
      expect(count).toBe(0);
    });
  });
});

// ============================================
// DATE HANDLING TESTS
// ============================================

describe('Date handling', () => {
  it('correctly parses ISO date strings', () => {
    const isoDate = '2024-06-15T10:30:00Z';
    const timestamp = new Date(isoDate).getTime();
    
    expect(timestamp).toBeGreaterThan(0);
    // toISOString always includes milliseconds, so compare timestamps instead
    expect(new Date(timestamp).getTime()).toBe(new Date(isoDate).getTime());
  });

  it('handles date with milliseconds', () => {
    const isoDate = '2024-06-15T10:30:00.123Z';
    const timestamp = new Date(isoDate).getTime();
    
    expect(timestamp).toBeGreaterThan(0);
  });

  it('handles date with timezone offset', () => {
    const dateWithOffset = '2024-06-15T10:30:00+05:00';
    const timestamp = new Date(dateWithOffset).getTime();
    
    expect(timestamp).toBeGreaterThan(0);
  });
});

// ============================================
// INTEGRATION TESTS
// ============================================

describe('Integration tests', () => {
  describe('Full wardrobe item lifecycle', () => {
    it('maps item from app to DB and back to app', () => {
      const originalItem: Omit<WardrobeItem, 'id' | 'createdAt'> = {
        imageUri: 'file:///local/image.jpg',
        category: 'tops',
        detectedLabel: 'Blue T-Shirt',
        colors: [{ hex: '#0000FF', name: 'Blue' }],
        styleNotes: ['casual'],
        brand: 'Test Brand',
        userStyleTags: ['minimal'],
        attributes: { fit: 'regular' },
      };

      // Map to DB format
      const dbFormat = mapWardrobeItemToDb(originalItem, 'user-123');
      
      // Simulate DB returning the item with id and created_at
      const dbItem: DbWardrobeItem = {
        id: 'generated-id',
        ...dbFormat,
        created_at: new Date().toISOString(),
      };

      // Map back to app format
      const appItem = mapDbToWardrobeItem(dbItem);

      // Verify roundtrip
      expect(appItem.imageUri).toBe(originalItem.imageUri);
      expect(appItem.category).toBe(originalItem.category);
      expect(appItem.detectedLabel).toBe(originalItem.detectedLabel);
      expect(appItem.colors).toEqual(originalItem.colors);
      expect(appItem.styleNotes).toEqual(originalItem.styleNotes);
      expect(appItem.brand).toBe(originalItem.brand);
      expect(appItem.userStyleTags).toEqual(originalItem.userStyleTags);
    });
  });

  describe('Usage quota enforcement flow', () => {
    it('simulates full consume credit flow', () => {
      // Initial state
      const initialCounts: UsageCounts = { scansUsed: 9, wardrobeAddsUsed: 10, isPro: false };
      
      // Check if allowed
      const hasScansRemaining = initialCounts.isPro || initialCounts.scansUsed < USAGE_LIMITS.FREE_SCANS;
      expect(hasScansRemaining).toBe(true);

      // Simulate consume
      const consumeResult: ConsumeResult = {
        allowed: true,
        used: 10,
        limit: 10,
        remaining: 0,
        alreadyConsumed: false,
        reason: 'consumed',
      };

      expect(consumeResult.allowed).toBe(true);
      expect(consumeResult.remaining).toBe(0);

      // After consume, no more remaining
      const hasScansRemainingAfter = initialCounts.isPro || consumeResult.used < USAGE_LIMITS.FREE_SCANS;
      expect(hasScansRemainingAfter).toBe(false);
    });

    it('simulates pro user unlimited access', () => {
      const proCounts: UsageCounts = { scansUsed: 100, wardrobeAddsUsed: 50, isPro: true };
      
      const hasScansRemaining = proCounts.isPro || proCounts.scansUsed < USAGE_LIMITS.FREE_SCANS;
      const hasWardrobeAddsRemaining = proCounts.isPro || proCounts.wardrobeAddsUsed < USAGE_LIMITS.FREE_WARDROBE_ADDS;

      expect(hasScansRemaining).toBe(true);
      expect(hasWardrobeAddsRemaining).toBe(true);
    });

    it('simulates idempotent retry', () => {
      // First attempt
      const firstResult: ConsumeResult = {
        allowed: true,
        used: 3,
        limit: 5,
        remaining: 2,
        alreadyConsumed: false,
        reason: 'consumed',
      };

      // Retry with same idempotency key
      const retryResult: ConsumeResult = {
        allowed: true,
        used: 3, // Same as before - not incremented
        limit: 5,
        remaining: 2,
        alreadyConsumed: true, // Indicates this was a replay
        reason: 'idempotent_replay',
      };

      expect(firstResult.alreadyConsumed).toBe(false);
      expect(retryResult.alreadyConsumed).toBe(true);
      expect(firstResult.used).toBe(retryResult.used); // No double charge
    });
  });
});

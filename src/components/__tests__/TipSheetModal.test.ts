/**
 * TipSheetModal Unit Tests
 *
 * Tests for vibe normalization and chip formatting helpers.
 * These are the core logic that determines what users see in chips.
 */

// ─────────────────────────────────────────────
// Test Setup: Replicate helper functions for testing
// (In production, these would be exported from the component)
// ─────────────────────────────────────────────

type StyleVibe = "casual" | "minimal" | "sporty" | "office" | "street" | "feminine";

const VIBE_PRIORITY: StyleVibe[] = [
  "office",
  "minimal",
  "street",
  "feminine",
  "sporty",
  "casual",
];

const VIBE_LABELS: Record<StyleVibe, string> = {
  casual: "Casual",
  minimal: "Minimal",
  office: "Office",
  street: "Street",
  feminine: "Feminine",
  sporty: "Sporty",
};

/**
 * Normalize vibes for chip display.
 */
function normalizeVibes(vibes: StyleVibe[] | string[] | null | undefined): StyleVibe[] {
  if (!vibes?.length) return [];
  const cleaned = vibes
    .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
    .filter((v) => v.length > 0);
  const set = new Set(cleaned);
  return VIBE_PRIORITY.filter((v) => set.has(v));
}

/**
 * Format vibe list for chip display.
 */
function formatVibeList(vibes: StyleVibe[], maxShown = 2): string {
  if (vibes.length === 0) return "";
  const shown = vibes.slice(0, maxShown);
  const extra = vibes.length - shown.length;
  const labels = shown.map((v) => VIBE_LABELS[v] ?? v);
  return extra > 0 ? `${labels.join(" • ")} +${extra}` : labels.join(" • ");
}

// ─────────────────────────────────────────────
// normalizeVibes Tests
// ─────────────────────────────────────────────

describe("normalizeVibes", () => {
  describe("empty/null handling", () => {
    it("returns empty array for undefined", () => {
      expect(normalizeVibes(undefined)).toEqual([]);
    });

    it("returns empty array for null", () => {
      expect(normalizeVibes(null)).toEqual([]);
    });

    it("returns empty array for empty array", () => {
      expect(normalizeVibes([])).toEqual([]);
    });
  });

  describe("filtering behavior", () => {
    it("drops unknown vibes", () => {
      expect(normalizeVibes(["weird", "unknown", "random"])).toEqual([]);
    });

    it('drops "default" vibe (not human-facing)', () => {
      expect(normalizeVibes(["default"])).toEqual([]);
      expect(normalizeVibes(["default", "office"])).toEqual(["office"]);
    });

    it("keeps only VIBE_PRIORITY vibes", () => {
      expect(normalizeVibes(["office", "minimal", "street"])).toEqual([
        "office",
        "minimal",
        "street",
      ]);
    });
  });

  describe("deduplication", () => {
    it("removes duplicate vibes", () => {
      expect(normalizeVibes(["office", "office", "office"])).toEqual(["office"]);
    });

    it("removes duplicates across different cases", () => {
      expect(normalizeVibes(["Office", "OFFICE", "office"])).toEqual(["office"]);
    });
  });

  describe("stable ordering", () => {
    it("returns vibes in VIBE_PRIORITY order regardless of input order", () => {
      // Input order: casual, sporty, office
      // Expected output: office, sporty, casual (VIBE_PRIORITY order)
      expect(normalizeVibes(["casual", "sporty", "office"])).toEqual([
        "office",
        "sporty",
        "casual",
      ]);
    });

    it("maintains priority order for all vibes", () => {
      const allVibes = ["casual", "feminine", "street", "minimal", "sporty", "office"];
      expect(normalizeVibes(allVibes)).toEqual(VIBE_PRIORITY);
    });
  });

  describe("input normalization (defensive)", () => {
    it("handles mixed casing", () => {
      expect(normalizeVibes(["Office", "MINIMAL", "Street"])).toEqual([
        "office",
        "minimal",
        "street",
      ]);
    });

    it("handles whitespace", () => {
      expect(normalizeVibes([" office ", "  minimal  ", "street "])).toEqual([
        "office",
        "minimal",
        "street",
      ]);
    });

    it("handles mixed casing + whitespace + duplicates + unknowns", () => {
      expect(
        normalizeVibes(["default", " Office ", "OFFICE", "weird", "  sporty"])
      ).toEqual(["office", "sporty"]);
    });
  });

  describe("real-world examples", () => {
    it('example from spec: ["default", "Office ", "office", "weird"] → ["office"]', () => {
      expect(normalizeVibes(["default", "Office ", "office", "weird"])).toEqual([
        "office",
      ]);
    });

    it("scanned item with multiple style tags", () => {
      expect(normalizeVibes(["sporty", "casual", "default"])).toEqual([
        "sporty",
        "casual",
      ]);
    });

    it("user preferences from onboarding", () => {
      expect(normalizeVibes(["minimal", "office"])).toEqual(["office", "minimal"]);
    });
  });
});

// ─────────────────────────────────────────────
// formatVibeList Tests
// ─────────────────────────────────────────────

describe("formatVibeList", () => {
  describe("empty handling", () => {
    it("returns empty string for empty array", () => {
      expect(formatVibeList([])).toBe("");
    });
  });

  describe("single vibe", () => {
    it("formats single vibe with label", () => {
      expect(formatVibeList(["office"])).toBe("Office");
      expect(formatVibeList(["casual"])).toBe("Casual");
      expect(formatVibeList(["sporty"])).toBe("Sporty");
    });
  });

  describe("two vibes (default max)", () => {
    it("joins two vibes with bullet separator", () => {
      expect(formatVibeList(["office", "minimal"])).toBe("Office • Minimal");
    });
  });

  describe("more than maxShown vibes", () => {
    it("shows +N for extras (default max=2)", () => {
      expect(formatVibeList(["office", "minimal", "street"])).toBe(
        "Office • Minimal +1"
      );
    });

    it("shows +2 for 4 vibes", () => {
      expect(formatVibeList(["office", "minimal", "street", "sporty"])).toBe(
        "Office • Minimal +2"
      );
    });

    it("shows +4 for all 6 vibes", () => {
      expect(
        formatVibeList(["office", "minimal", "street", "feminine", "sporty", "casual"])
      ).toBe("Office • Minimal +4");
    });
  });

  describe("custom maxShown", () => {
    it("respects maxShown=1", () => {
      expect(formatVibeList(["office", "minimal"], 1)).toBe("Office +1");
    });

    it("respects maxShown=3", () => {
      expect(formatVibeList(["office", "minimal", "street", "sporty"], 3)).toBe(
        "Office • Minimal • Street +1"
      );
    });

    it("shows all if maxShown >= length", () => {
      expect(formatVibeList(["office", "minimal"], 5)).toBe("Office • Minimal");
    });
  });

  describe("real-world chip examples", () => {
    it("Item chip: single scanned vibe", () => {
      expect(formatVibeList(["sporty"])).toBe("Sporty");
    });

    it("Item chip: multiple scanned vibes", () => {
      expect(formatVibeList(["office", "minimal"])).toBe("Office • Minimal");
    });

    it("You chip: user with 3 preferences", () => {
      expect(formatVibeList(["minimal", "sporty", "casual"])).toBe(
        "Minimal • Sporty +1"
      );
    });
  });
});

// ─────────────────────────────────────────────
// normalizeLabel Tests (BoardCard label processing)
// ─────────────────────────────────────────────

/** Normalize label: strip prefix, capitalize first letter */
function normalizeLabel(label: string): string {
  const stripped = label.replace(/^(Do:|Avoid:|Try:)\s*/i, "");
  if (stripped.length === 0) return stripped;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

describe("normalizeLabel", () => {
  describe("prefix stripping", () => {
    it("strips 'Do: ' prefix", () => {
      expect(normalizeLabel("Do: keep dressiness consistent")).toBe(
        "Keep dressiness consistent"
      );
    });

    it("strips 'Avoid: ' prefix", () => {
      expect(normalizeLabel("Avoid: mixing very formal + very casual")).toBe(
        "Mixing very formal + very casual"
      );
    });

    it("strips 'Try: ' prefix", () => {
      expect(normalizeLabel("Try: swap one piece to match the lane")).toBe(
        "Swap one piece to match the lane"
      );
    });

    it("is case-insensitive", () => {
      expect(normalizeLabel("do: lowercase prefix")).toBe("Lowercase prefix");
      expect(normalizeLabel("DO: uppercase prefix")).toBe("Uppercase prefix");
      expect(normalizeLabel("avoid: test")).toBe("Test");
      expect(normalizeLabel("TRY: test")).toBe("Test");
    });
  });

  describe("capitalization", () => {
    it("capitalizes first letter after stripping", () => {
      expect(normalizeLabel("Do: keep it simple")).toBe("Keep it simple");
    });

    it("handles already capitalized text", () => {
      expect(normalizeLabel("Do: Keep it simple")).toBe("Keep it simple");
    });

    it("handles lowercase text without prefix", () => {
      expect(normalizeLabel("keep it simple")).toBe("Keep it simple");
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      expect(normalizeLabel("")).toBe("");
    });

    it("handles prefix only", () => {
      expect(normalizeLabel("Do: ")).toBe("");
      expect(normalizeLabel("Do:")).toBe("");
    });

    it("preserves text without recognized prefix", () => {
      expect(normalizeLabel("Something else entirely")).toBe(
        "Something else entirely"
      );
    });

    it("handles single character after prefix", () => {
      expect(normalizeLabel("Do: a")).toBe("A");
    });
  });
});

// ─────────────────────────────────────────────
// Chip Display Logic Tests
// ─────────────────────────────────────────────

describe("chip display logic", () => {
  // Simulate the chip visibility logic from SortedForYouChips
  function getChipDisplayState(
    scannedVibes: StyleVibe[],
    userVibes: StyleVibe[]
  ): {
    showItemChip: boolean;
    showYouChip: boolean;
    showFallbackLine: boolean;
    itemChipText: string;
    youChipText: string;
  } {
    const hasScanned = scannedVibes.length > 0;
    const hasUser = userVibes.length > 0;

    return {
      showItemChip: hasScanned,
      showYouChip: hasUser,
      showFallbackLine: !hasScanned && !hasUser,
      itemChipText: hasScanned ? `Item vibe ${formatVibeList(scannedVibes)}` : "",
      youChipText: hasUser ? `Your vibe ${formatVibeList(userVibes)}` : "",
    };
  }

  describe("both arrays populated", () => {
    it("shows both chips, no fallback line", () => {
      const result = getChipDisplayState(["office"], ["minimal", "sporty"]);
      expect(result.showItemChip).toBe(true);
      expect(result.showYouChip).toBe(true);
      expect(result.showFallbackLine).toBe(false);
      expect(result.itemChipText).toBe("Item vibe Office");
      expect(result.youChipText).toBe("Your vibe Minimal • Sporty");
    });
  });

  describe("only scanned vibes", () => {
    it("shows Item chip only", () => {
      const result = getChipDisplayState(["sporty", "casual"], []);
      expect(result.showItemChip).toBe(true);
      expect(result.showYouChip).toBe(false);
      expect(result.showFallbackLine).toBe(false);
      expect(result.itemChipText).toBe("Item vibe Sporty • Casual");
    });
  });

  describe("only user vibes", () => {
    it("shows You chip only", () => {
      const result = getChipDisplayState([], ["office", "minimal", "street"]);
      expect(result.showItemChip).toBe(false);
      expect(result.showYouChip).toBe(true);
      expect(result.showFallbackLine).toBe(false);
      expect(result.youChipText).toBe("Your vibe Office • Minimal +1");
    });
  });

  describe("neither array populated", () => {
    it("shows fallback line instead of chips", () => {
      const result = getChipDisplayState([], []);
      expect(result.showItemChip).toBe(false);
      expect(result.showYouChip).toBe(false);
      expect(result.showFallbackLine).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────
// Context Note Logic Tests
// ─────────────────────────────────────────────

describe("context note logic", () => {
  // Simulate the context note selection from SuggestionsSection
  function getContextNote(
    showMore: boolean,
    wasRelaxed: boolean
  ): string | null {
    if (showMore) return "More items (not exact matches).";
    if (wasRelaxed) return "Showing close options.";
    return null;
  }

  it("returns null when normal (no relax, no show more)", () => {
    expect(getContextNote(false, false)).toBe(null);
  });

  it('returns "Showing close options." when relaxed', () => {
    expect(getContextNote(false, true)).toBe("Showing close options.");
  });

  it('returns "More items (not exact matches)." when showMore', () => {
    expect(getContextNote(true, false)).toBe("More items (not exact matches).");
  });

  it("showMore takes precedence over wasRelaxed", () => {
    expect(getContextNote(true, true)).toBe("More items (not exact matches).");
  });
});

// ─────────────────────────────────────────────
// Integration-ish Tests: UI State Machine
// ─────────────────────────────────────────────

describe("UI state machine: category + showMore", () => {
  // Simulate the SuggestionsSection render decision logic
  interface MockContent {
    items: { id: string }[];
    moreItems: { id: string }[];
    canShowMore: boolean;
    label: string;
    meta: { wasRelaxed: boolean };
  }

  interface RenderState {
    mode: "loading" | "error" | "empty_library" | "empty_recipe" | "grid";
    showButton: boolean;
    displayItems: { id: string }[];
    heading: string;
    contextNote: string | null;
  }

  function getSuggestionsSectionState(
    content: MockContent,
    showMore: boolean,
    isLoading: boolean,
    libraryIsEmpty: boolean,
    errorType: string | null
  ): RenderState {
    // Loading state
    if (isLoading) {
      return {
        mode: "loading",
        showButton: false,
        displayItems: [],
        heading: "",
        contextNote: null,
      };
    }

    // Error state
    if (errorType === "fetch_failed") {
      return {
        mode: "error",
        showButton: false,
        displayItems: [],
        heading: "",
        contextNote: null,
      };
    }

    // Empty library state
    if (libraryIsEmpty || errorType === "empty") {
      return {
        mode: "empty_library",
        showButton: false,
        displayItems: [],
        heading: "",
        contextNote: null,
      };
    }

    // Empty recipe state (user can show more)
    if (content.items.length === 0 && !showMore) {
      return {
        mode: "empty_recipe",
        showButton: content.canShowMore,
        displayItems: [],
        heading: "",
        contextNote: null,
      };
    }

    // Grid state (normal, relaxed, or showMore)
    const displayItems = showMore && content.moreItems.length > 0
      ? content.moreItems
      : content.items;

    const heading = showMore ? "More items" : content.label;

    let contextNote: string | null = null;
    if (showMore) {
      contextNote = "More items (not exact matches).";
    } else if (content.meta.wasRelaxed) {
      contextNote = "Showing close options.";
    }

    return {
      mode: "grid",
      showButton: false,
      displayItems,
      heading,
      contextNote,
    };
  }

  describe("empty recipe state → showMore transition", () => {
    const content: MockContent = {
      items: [],
      moreItems: [{ id: "more-1" }, { id: "more-2" }],
      canShowMore: true,
      label: "Items that would work",
      meta: { wasRelaxed: false },
    };

    it("when items=[], moreItems>0, showMore=false → empty state shows button", () => {
      const state = getSuggestionsSectionState(content, false, false, false, null);

      expect(state.mode).toBe("empty_recipe");
      expect(state.showButton).toBe(true);
      expect(state.displayItems).toEqual([]);
    });

    it("when showMore=true → grid shows moreItems with changed heading", () => {
      const state = getSuggestionsSectionState(content, true, false, false, null);

      expect(state.mode).toBe("grid");
      expect(state.showButton).toBe(false);
      expect(state.displayItems).toEqual([{ id: "more-1" }, { id: "more-2" }]);
      expect(state.heading).toBe("More items");
      expect(state.contextNote).toBe("More items (not exact matches).");
    });
  });

  describe("canShowMore=false (no fallback items)", () => {
    const content: MockContent = {
      items: [],
      moreItems: [],
      canShowMore: false,
      label: "Items that would work",
      meta: { wasRelaxed: false },
    };

    it("empty state does NOT show button when canShowMore=false", () => {
      const state = getSuggestionsSectionState(content, false, false, false, null);

      expect(state.mode).toBe("empty_recipe");
      expect(state.showButton).toBe(false);
    });
  });

  describe("normal → relaxed transition", () => {
    it("normal state has no context note", () => {
      const content: MockContent = {
        items: [{ id: "item-1" }],
        moreItems: [],
        canShowMore: false,
        label: "Items that would work",
        meta: { wasRelaxed: false },
      };

      const state = getSuggestionsSectionState(content, false, false, false, null);

      expect(state.mode).toBe("grid");
      expect(state.heading).toBe("Items that would work");
      expect(state.contextNote).toBe(null);
    });

    it("relaxed state shows context note", () => {
      const content: MockContent = {
        items: [{ id: "item-1" }],
        moreItems: [],
        canShowMore: false,
        label: "Items that would work",
        meta: { wasRelaxed: true },
      };

      const state = getSuggestionsSectionState(content, false, false, false, null);

      expect(state.mode).toBe("grid");
      expect(state.heading).toBe("Items that would work");
      expect(state.contextNote).toBe("Showing close options.");
    });
  });
});

// ─────────────────────────────────────────────
// Mode A: wardrobeCount-based Behavior Tests
// ─────────────────────────────────────────────

describe("Mode A heading based on wardrobeCount", () => {
  // Simulate the heading generation from SuggestionsSection
  function getHeading(
    showMore: boolean,
    wardrobeCount: number,
    category: string | null,
    itemCount: number
  ): string {
    if (showMore) {
      return `More items (${itemCount})`;
    }
    if (wardrobeCount === 0) {
      return `Examples to add (${itemCount})`;
    }
    return `Suggested ${category ?? "items"} (${itemCount})`;
  }

  describe("wardrobeCount === 0 (empty wardrobe)", () => {
    it('shows "Examples to add (X)" when wardrobeCount is 0', () => {
      expect(getHeading(false, 0, "tops", 6)).toBe("Examples to add (6)");
    });

    it('shows "Examples to add (X)" regardless of category', () => {
      expect(getHeading(false, 0, "bottoms", 4)).toBe("Examples to add (4)");
      expect(getHeading(false, 0, "shoes", 8)).toBe("Examples to add (8)");
      expect(getHeading(false, 0, null, 3)).toBe("Examples to add (3)");
    });

    it('"More items" takes precedence even when wardrobeCount is 0', () => {
      expect(getHeading(true, 0, "tops", 10)).toBe("More items (10)");
    });
  });

  describe("wardrobeCount > 0 (has wardrobe)", () => {
    it('shows "Suggested {category} (X)" when wardrobeCount > 0', () => {
      expect(getHeading(false, 1, "tops", 6)).toBe("Suggested tops (6)");
      expect(getHeading(false, 5, "bottoms", 4)).toBe("Suggested bottoms (4)");
    });

    it('shows "Suggested items (X)" when category is null', () => {
      expect(getHeading(false, 3, null, 5)).toBe("Suggested items (5)");
    });

    it('"More items" takes precedence over "Suggested"', () => {
      expect(getHeading(true, 5, "tops", 10)).toBe("More items (10)");
    });
  });
});

describe("Mode A CTA button based on wardrobeCount", () => {
  // Simulate the CTA visibility from SuggestionsSection
  function shouldShowAddToWardrobeCTA(
    wardrobeCount: number,
    hasOnAddToWardrobe: boolean
  ): boolean {
    return wardrobeCount === 0 && hasOnAddToWardrobe;
  }

  describe("wardrobeCount === 0", () => {
    it("shows CTA when wardrobeCount is 0 and callback is provided", () => {
      expect(shouldShowAddToWardrobeCTA(0, true)).toBe(true);
    });

    it("does NOT show CTA when callback is not provided", () => {
      expect(shouldShowAddToWardrobeCTA(0, false)).toBe(false);
    });
  });

  describe("wardrobeCount > 0", () => {
    it("does NOT show CTA when wardrobeCount > 0", () => {
      expect(shouldShowAddToWardrobeCTA(1, true)).toBe(false);
      expect(shouldShowAddToWardrobeCTA(5, true)).toBe(false);
      expect(shouldShowAddToWardrobeCTA(100, true)).toBe(false);
    });

    it("does NOT show CTA regardless of callback when wardrobeCount > 0", () => {
      expect(shouldShowAddToWardrobeCTA(1, false)).toBe(false);
    });
  });
});

describe("Mode A full state: heading + CTA", () => {
  // Simulate the complete SuggestionsSection rendering state
  interface ModeAState {
    heading: string;
    showCTA: boolean;
  }

  function getModeAState(
    showMore: boolean,
    wardrobeCount: number,
    category: string | null,
    itemCount: number,
    hasOnAddToWardrobe: boolean
  ): ModeAState {
    const heading = showMore
      ? `More items (${itemCount})`
      : wardrobeCount === 0
        ? `Examples to add (${itemCount})`
        : `Suggested ${category ?? "items"} (${itemCount})`;

    const showCTA = wardrobeCount === 0 && hasOnAddToWardrobe;

    return { heading, showCTA };
  }

  it("empty wardrobe: shows Examples heading + Add to wardrobe CTA", () => {
    const state = getModeAState(false, 0, "tops", 6, true);
    expect(state.heading).toBe("Examples to add (6)");
    expect(state.showCTA).toBe(true);
  });

  it("has wardrobe: shows Suggested heading, no CTA", () => {
    const state = getModeAState(false, 5, "tops", 6, true);
    expect(state.heading).toBe("Suggested tops (6)");
    expect(state.showCTA).toBe(false);
  });

  it("showMore mode: heading changes, CTA still based on wardrobeCount", () => {
    const emptyWardrobe = getModeAState(true, 0, "tops", 10, true);
    expect(emptyWardrobe.heading).toBe("More items (10)");
    expect(emptyWardrobe.showCTA).toBe(true);

    const hasWardrobe = getModeAState(true, 5, "tops", 10, true);
    expect(hasWardrobe.heading).toBe("More items (10)");
    expect(hasWardrobe.showCTA).toBe(false);
  });
});

describe("UI state machine: chips + empty", () => {
  // Simulate header chip visibility (always rendered for suggestions, regardless of content)
  interface HeaderState {
    showChips: boolean;
    itemChipVisible: boolean;
    youChipVisible: boolean;
    fallbackLineVisible: boolean;
  }

  function getHeaderChipsState(
    scannedVibes: StyleVibe[],
    userVibes: StyleVibe[],
    contentKind: "suggestions" | "educational"
  ): HeaderState {
    // Chips only render for suggestions content, not educational
    if (contentKind !== "suggestions") {
      return {
        showChips: false,
        itemChipVisible: false,
        youChipVisible: false,
        fallbackLineVisible: false,
      };
    }

    const hasScanned = scannedVibes.length > 0;
    const hasUser = userVibes.length > 0;

    return {
      showChips: true,
      itemChipVisible: hasScanned,
      youChipVisible: hasUser,
      fallbackLineVisible: !hasScanned && !hasUser,
    };
  }

  describe("chips render above empty state (per spec)", () => {
    it("when items=[] but chips exist → chips still visible", () => {
      // This tests the key spec: chips appear even when content is empty
      const headerState = getHeaderChipsState(
        ["office", "minimal"],
        ["sporty"],
        "suggestions"
      );

      // Header always renders chips for suggestions (decoupled from content.items)
      expect(headerState.showChips).toBe(true);
      expect(headerState.itemChipVisible).toBe(true);
      expect(headerState.youChipVisible).toBe(true);
      expect(headerState.fallbackLineVisible).toBe(false);
    });

    it("chips explain what we tried even when no matches found", () => {
      // User sees: "We tried to match Office+Minimal for item, Sporty for you"
      // Then: "No exact matches yet. Want to see more?"
      const scannedVibes = normalizeVibes(["office", "minimal"]);
      const userVibes = normalizeVibes(["sporty"]);

      const itemChip = `Item vibe ${formatVibeList(scannedVibes)}`;
      const youChip = `Your vibe ${formatVibeList(userVibes)}`;

      expect(itemChip).toBe("Item vibe Office • Minimal");
      expect(youChip).toBe("Your vibe Sporty");
    });
  });

  describe("no chips → fallback line", () => {
    it("when both arrays empty → shows fallback line instead of chips", () => {
      const headerState = getHeaderChipsState([], [], "suggestions");

      expect(headerState.showChips).toBe(true); // Container still renders
      expect(headerState.itemChipVisible).toBe(false);
      expect(headerState.youChipVisible).toBe(false);
      expect(headerState.fallbackLineVisible).toBe(true);
    });
  });

  describe("educational content → no chips", () => {
    it("Mode B (educational) does not show chips", () => {
      const headerState = getHeaderChipsState(
        ["office"],
        ["minimal"],
        "educational"
      );

      expect(headerState.showChips).toBe(false);
      expect(headerState.itemChipVisible).toBe(false);
      expect(headerState.youChipVisible).toBe(false);
    });
  });
});


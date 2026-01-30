import type { AddOnItem, Category, ElevateBullet } from "../types";
import { scoreAndSortAddOns } from "../add-ons-sorting";

// ============================================
// TEST HELPERS
// ============================================

function createAddOn(overrides: Partial<AddOnItem> = {}): AddOnItem {
  return {
    id: "addon-1",
    imageUri: undefined,
    category: "bags",
    colors: [],
    detectedLabel: undefined,
    userStyleTags: [],
    ...overrides,
  };
}

function createElevateBullet(
  category: Category,
  attributes: string[] = []
): ElevateBullet {
  return {
    text: "Test bullet",
    recommend: {
      type: "consider_adding",
      category,
      attributes,
    },
  };
}

describe("scoreAndSortAddOns", () => {
  it("deduplicates wantedCategories so later categories keep priority", () => {
    const addOns: AddOnItem[] = [
      createAddOn({ id: "acc-1", category: "accessories" }),
      createAddOn({ id: "bag-1", category: "bags" }),
    ];

    const toElevate: ElevateBullet[] = [
      createElevateBullet("outerwear"),
      createElevateBullet("outerwear"), // duplicate
      createElevateBullet("bags"),
      createElevateBullet("accessories"),
    ];

    const sorted = scoreAndSortAddOns(addOns, toElevate);
    expect(sorted[0].id).toBe("bag-1");
  });

  it("ignores non-add-on categories in to_elevate", () => {
    const addOns: AddOnItem[] = [
      createAddOn({ id: "bag-1", category: "bags" }),
      createAddOn({ id: "acc-1", category: "accessories" }),
    ];

    const toElevate: ElevateBullet[] = [createElevateBullet("tops")];

    const sorted = scoreAndSortAddOns(addOns, toElevate);
    expect(sorted.map((item) => item.id)).toEqual(["bag-1", "acc-1"]);
  });

  it("applies category priority bonuses (40/20/0)", () => {
    const addOns: AddOnItem[] = [
      createAddOn({ id: "acc-1", category: "accessories" }),
      createAddOn({ id: "bag-1", category: "bags" }),
    ];

    const toElevate: ElevateBullet[] = [
      createElevateBullet("bags"),
      createElevateBullet("accessories"),
    ];

    const sorted = scoreAndSortAddOns(addOns, toElevate);
    expect(sorted[0].id).toBe("bag-1");
  });

  it("expands attributes via bidirectional synonym lookup", () => {
    const addOns: AddOnItem[] = [
      createAddOn({ id: "gold-1", detectedLabel: "gold hardware", category: "bags" }),
      createAddOn({ id: "silver-1", detectedLabel: "silver hardware", category: "bags" }),
    ];

    const toElevate: ElevateBullet[] = [
      createElevateBullet("bags", ["golden"]),
    ];

    const sorted = scoreAndSortAddOns(addOns, toElevate);
    expect(sorted[0].id).toBe("gold-1");
  });

  it("uses token-based matching to avoid substring false positives", () => {
    const addOns: AddOnItem[] = [
      createAddOn({ id: "tangerine-1", detectedLabel: "tangerine clutch", category: "bags" }),
      createAddOn({ id: "tan-1", detectedLabel: "tan tote", category: "bags" }),
    ];

    const toElevate: ElevateBullet[] = [createElevateBullet("bags", ["tan"])];

    const sorted = scoreAndSortAddOns(addOns, toElevate);
    expect(sorted[0].id).toBe("tan-1");
  });

  it("caps attribute match scoring at +30", () => {
    const addOns: AddOnItem[] = [
      createAddOn({
        id: "three-attrs",
        detectedLabel: "gold tan structured",
        category: "bags",
      }),
      createAddOn({
        id: "five-attrs",
        detectedLabel: "gold tan structured minimal leather",
        category: "bags",
      }),
    ];

    const toElevate: ElevateBullet[] = [
      createElevateBullet("outerwear", [
        "gold",
        "tan",
        "structured",
        "minimal",
        "leather",
      ]),
    ];

    const sorted = scoreAndSortAddOns(addOns, toElevate);
    expect(sorted.map((item) => item.id)).toEqual(["three-attrs", "five-attrs"]);
  });

  it("uses deterministic tiebreaker by original index", () => {
    const addOns: AddOnItem[] = [
      createAddOn({ id: "first", category: "bags" }),
      createAddOn({ id: "second", category: "bags" }),
    ];

    const sorted = scoreAndSortAddOns(addOns, undefined);
    expect(sorted.map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("matches attributes from local fields (colors, detectedLabel, userStyleTags)", () => {
    const addOns: AddOnItem[] = [
      createAddOn({
        id: "tan-color",
        category: "bags",
        colors: [{ hex: "#D2B48C", name: "Tan" }],
      }),
      createAddOn({
        id: "blue-color",
        category: "bags",
        colors: [{ hex: "#0000FF", name: "Blue" }],
      }),
    ];

    const toElevate: ElevateBullet[] = [createElevateBullet("outerwear", ["tan"])];

    const sorted = scoreAndSortAddOns(addOns, toElevate);
    expect(sorted[0].id).toBe("tan-color");
  });

  it("returns empty array safely when given no add-ons", () => {
    const sorted = scoreAndSortAddOns([], undefined);
    expect(sorted).toEqual([]);
  });
});

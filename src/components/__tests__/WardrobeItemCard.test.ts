/**
 * WardrobeItemCard Component Tests
 *
 * Tests for the wardrobe item display card logic including:
 * - Size configurations
 * - Label formatting
 * - Pressable behavior
 */

// ─────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────

type Category = "tops" | "bottoms" | "shoes" | "outerwear" | "accessories";
type CardSize = "small" | "medium" | "large";

interface WardrobeItemCardProps {
  imageUri: string;
  category?: Category;
  brand?: string;
  onPress?: () => void;
  size?: CardSize;
}

// ─────────────────────────────────────────────
// Size Configuration
// ─────────────────────────────────────────────

const sizeMap: Record<CardSize, number> = {
  small: 64,
  medium: 80,
  large: 100,
};

function getImageSize(size: CardSize): number {
  return sizeMap[size];
}

// ─────────────────────────────────────────────
// Label Formatting
// ─────────────────────────────────────────────

function formatLabel(category?: Category, brand?: string): string | null {
  if (!category) return null;
  
  // Category is capitalized and optionally combined with brand
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  
  if (brand) {
    return `${categoryLabel} · ${brand}`;
  }
  return categoryLabel;
}

function shouldShowLabel(category?: Category): boolean {
  return category !== undefined;
}

// ─────────────────────────────────────────────
// Component Structure
// ─────────────────────────────────────────────

interface CardStructure {
  isPressable: boolean;
  showLabel: boolean;
  imageSize: number;
}

function getCardStructure(props: WardrobeItemCardProps): CardStructure {
  return {
    isPressable: props.onPress !== undefined,
    showLabel: shouldShowLabel(props.category),
    imageSize: getImageSize(props.size ?? "medium"),
  };
}

// ─────────────────────────────────────────────
// Tests: Size Configuration
// ─────────────────────────────────────────────

describe("WardrobeItemCard size configuration", () => {
  describe("getImageSize", () => {
    it("returns 64 for small", () => {
      expect(getImageSize("small")).toBe(64);
    });

    it("returns 80 for medium", () => {
      expect(getImageSize("medium")).toBe(80);
    });

    it("returns 100 for large", () => {
      expect(getImageSize("large")).toBe(100);
    });
  });

  describe("size hierarchy", () => {
    it("small < medium < large", () => {
      expect(sizeMap.small).toBeLessThan(sizeMap.medium);
      expect(sizeMap.medium).toBeLessThan(sizeMap.large);
    });
  });
});

// ─────────────────────────────────────────────
// Tests: Label Formatting
// ─────────────────────────────────────────────

describe("WardrobeItemCard label formatting", () => {
  describe("formatLabel", () => {
    it("returns null when no category", () => {
      expect(formatLabel(undefined, undefined)).toBe(null);
      expect(formatLabel(undefined, "Nike")).toBe(null);
    });

    it("capitalizes category", () => {
      expect(formatLabel("tops", undefined)).toBe("Tops");
      expect(formatLabel("bottoms", undefined)).toBe("Bottoms");
      expect(formatLabel("shoes", undefined)).toBe("Shoes");
      expect(formatLabel("outerwear", undefined)).toBe("Outerwear");
      expect(formatLabel("accessories", undefined)).toBe("Accessories");
    });

    it("combines category and brand with separator", () => {
      expect(formatLabel("tops", "Nike")).toBe("Tops · Nike");
      expect(formatLabel("shoes", "Adidas")).toBe("Shoes · Adidas");
    });

    it("handles brand with spaces", () => {
      expect(formatLabel("tops", "Ralph Lauren")).toBe("Tops · Ralph Lauren");
    });
  });

  describe("shouldShowLabel", () => {
    it("returns true when category exists", () => {
      expect(shouldShowLabel("tops")).toBe(true);
      expect(shouldShowLabel("bottoms")).toBe(true);
    });

    it("returns false when no category", () => {
      expect(shouldShowLabel(undefined)).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// Tests: Card Structure
// ─────────────────────────────────────────────

describe("WardrobeItemCard structure", () => {
  describe("getCardStructure", () => {
    it("defaults to medium size", () => {
      const structure = getCardStructure({
        imageUri: "https://example.com/image.jpg",
      });
      expect(structure.imageSize).toBe(80);
    });

    it("respects custom size", () => {
      const smallStructure = getCardStructure({
        imageUri: "https://example.com/image.jpg",
        size: "small",
      });
      expect(smallStructure.imageSize).toBe(64);

      const largeStructure = getCardStructure({
        imageUri: "https://example.com/image.jpg",
        size: "large",
      });
      expect(largeStructure.imageSize).toBe(100);
    });

    it("is pressable when onPress provided", () => {
      const pressable = getCardStructure({
        imageUri: "https://example.com/image.jpg",
        onPress: () => {},
      });
      expect(pressable.isPressable).toBe(true);

      const notPressable = getCardStructure({
        imageUri: "https://example.com/image.jpg",
      });
      expect(notPressable.isPressable).toBe(false);
    });

    it("shows label when category provided", () => {
      const withCategory = getCardStructure({
        imageUri: "https://example.com/image.jpg",
        category: "tops",
      });
      expect(withCategory.showLabel).toBe(true);

      const withoutCategory = getCardStructure({
        imageUri: "https://example.com/image.jpg",
      });
      expect(withoutCategory.showLabel).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// Tests: Pressable Behavior
// ─────────────────────────────────────────────

describe("WardrobeItemCard pressable behavior", () => {
  interface PressableStyle {
    opacity: number;
  }

  function getPressedStyle(pressed: boolean): PressableStyle {
    return { opacity: pressed ? 0.7 : 1 };
  }

  it("full opacity when not pressed", () => {
    const style = getPressedStyle(false);
    expect(style.opacity).toBe(1);
  });

  it("reduced opacity when pressed", () => {
    const style = getPressedStyle(true);
    expect(style.opacity).toBe(0.7);
  });
});

// ─────────────────────────────────────────────
// Tests: Integration Scenarios
// ─────────────────────────────────────────────

describe("WardrobeItemCard integration", () => {
  describe("grid item scenario", () => {
    it("small card in wardrobe grid", () => {
      const structure = getCardStructure({
        imageUri: "https://example.com/shirt.jpg",
        category: "tops",
        brand: "Uniqlo",
        size: "small",
        onPress: () => {},
      });

      expect(structure.imageSize).toBe(64);
      expect(structure.isPressable).toBe(true);
      expect(structure.showLabel).toBe(true);

      const label = formatLabel("tops", "Uniqlo");
      expect(label).toBe("Tops · Uniqlo");
    });
  });

  describe("detail view scenario", () => {
    it("large card for item detail", () => {
      const structure = getCardStructure({
        imageUri: "https://example.com/jacket.jpg",
        category: "outerwear",
        size: "large",
      });

      expect(structure.imageSize).toBe(100);
      expect(structure.isPressable).toBe(false);
      expect(structure.showLabel).toBe(true);
    });
  });

  describe("thumbnail scenario", () => {
    it("small card without label", () => {
      const structure = getCardStructure({
        imageUri: "https://example.com/shoes.jpg",
        size: "small",
      });

      expect(structure.imageSize).toBe(64);
      expect(structure.showLabel).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// Tests: Category Display
// ─────────────────────────────────────────────

describe("category display", () => {
  const allCategories: Category[] = ["tops", "bottoms", "shoes", "outerwear", "accessories"];

  it("all categories produce valid labels", () => {
    for (const category of allCategories) {
      const label = formatLabel(category, undefined);
      expect(label).not.toBe(null);
      expect(label!.length).toBeGreaterThan(0);
      // First character should be uppercase
      expect(label![0]).toBe(label![0].toUpperCase());
    }
  });

  it("all categories work with brands", () => {
    for (const category of allCategories) {
      const label = formatLabel(category, "TestBrand");
      expect(label).toContain("·");
      expect(label).toContain("TestBrand");
    }
  });
});

// ─────────────────────────────────────────────
// Tests: Image Style
// ─────────────────────────────────────────────

describe("image style", () => {
  interface ImageStyle {
    width: number;
    height: number;
    borderRadius: number;
  }

  function getImageStyle(size: CardSize, borderRadius: number): ImageStyle {
    const imageSize = getImageSize(size);
    return {
      width: imageSize,
      height: imageSize,
      borderRadius,
    };
  }

  it("images are square", () => {
    const style = getImageStyle("medium", 8);
    expect(style.width).toBe(style.height);
  });

  it("border radius is applied", () => {
    const style = getImageStyle("medium", 12);
    expect(style.borderRadius).toBe(12);
  });

  it("size affects both dimensions equally", () => {
    const small = getImageStyle("small", 8);
    const medium = getImageStyle("medium", 8);
    const large = getImageStyle("large", 8);

    expect(small.width).toBe(small.height);
    expect(medium.width).toBe(medium.height);
    expect(large.width).toBe(large.height);
  });
});

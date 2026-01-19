/**
 * OpenAI module tests
 * 
 * Tests for AI analysis integration, error classification,
 * validation functions, and non-fashion detection.
 * 
 * Note: Pure function tests only - main analyzeClothingImage requires
 * native modules that can't be easily tested in Jest.
 */

// ============================================
// TYPE DEFINITIONS (mirrored from openai.ts)
// ============================================

type AnalyzeErrorKind =
  | "no_network"
  | "timeout"
  | "cancelled"
  | "rate_limited"
  | "api_error"
  | "unauthorized"
  | "bad_request"
  | "server_error"
  | "parse_error"
  | "unknown";

interface AnalyzeError {
  kind: AnalyzeErrorKind;
  message: string;
  debug?: string;
  retryAfterSeconds?: number;
  httpStatus?: number;
}

// ============================================
// PURE FUNCTIONS (copied from openai.ts for testing)
// ============================================

/**
 * Classify an error into AnalyzeError with appropriate kind and message.
 */
function classifyAnalyzeError(err: unknown, res?: Response): AnalyzeError {
  const errMessage = err instanceof Error ? err.message : String(err || "");
  
  const isNetworkError =
    errMessage.includes("Network request failed") ||
    errMessage.includes("The Internet connection appears to be offline") ||
    errMessage.includes("The network connection was lost") ||
    errMessage.includes("A data connection is not currently allowed") ||
    errMessage.includes("The request timed out") ||
    errMessage.includes("ENOTFOUND") ||
    errMessage.includes("ECONNRESET") ||
    errMessage.includes("ECONNREFUSED") ||
    errMessage.includes("EHOSTUNREACH") ||
    errMessage.includes("Unable to resolve host") ||
    errMessage.includes("NSURLErrorDomain") ||
    errMessage.includes("Could not connect") ||
    errMessage.includes("kCFErrorDomainCFNetwork");

  if (isNetworkError) {
    return {
      kind: "no_network",
      message: "No internet connection.",
      debug: errMessage,
    };
  }

  const status = res?.status;
  if (status) {
    if (status === 429) {
      const retryAfterHeader = res?.headers?.get?.("retry-after");
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      return {
        kind: "rate_limited",
        message: "Too many requests right now.",
        httpStatus: status,
        retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
      };
    }
    if (status === 401 || status === 403) {
      return {
        kind: "unauthorized",
        message: "Authorization error.",
        httpStatus: status,
        debug: "API key may be invalid or expired",
      };
    }
    if (status === 400) {
      return {
        kind: "bad_request",
        message: "Couldn't analyze this image.",
        httpStatus: status,
        debug: errMessage || "Bad request",
      };
    }
    if (status >= 500) {
      return {
        kind: "server_error",
        message: "Server error. Please try again.",
        httpStatus: status,
        debug: `HTTP ${status}`,
      };
    }
    if (status >= 400) {
      return {
        kind: "api_error",
        message: "Couldn't analyze this image.",
        httpStatus: status,
        debug: `HTTP ${status}: ${errMessage}`,
      };
    }
  }

  if (errMessage.includes("JSON") || errMessage.includes("parse") || errMessage.includes("Unexpected token")) {
    return {
      kind: "parse_error",
      message: "Couldn't understand the analysis.",
      debug: errMessage,
    };
  }

  return {
    kind: "unknown",
    message: "Something went wrong.",
    debug: errMessage || undefined,
  };
}

const NON_FASHION_KEYWORDS = [
  "mug", "cup", "glass", "plate", "bowl", "bottle", "jar", "pot", "pan",
  "phone", "iphone", "android", "laptop", "keyboard", "mouse", "monitor", "screen",
  "tv", "television", "remote", "camera", "tablet", "computer", "charger", "cable",
  "food", "coffee", "tea", "drink", "meal", "snack", "fruit", "vegetable",
  "plant", "flower", "tree", "leaf", "garden",
  "pet", "dog", "cat", "bird", "fish", "animal",
  "chair", "table", "sofa", "couch", "bed", "desk", "lamp", "shelf",
  "car", "bike", "bicycle", "motorcycle", "vehicle",
  "book", "magazine", "paper", "toy", "game", "tool", "box", "package",
];

function fallbackIsFashionItem(label?: string): boolean {
  if (!label) return true;
  
  const lowerLabel = label.toLowerCase();
  
  return !NON_FASHION_KEYWORDS.some(keyword => {
    const wordBoundaryRegex = new RegExp(`\\b${keyword}\\b`, 'i');
    return wordBoundaryRegex.test(lowerLabel);
  });
}

// ============================================
// ERROR CLASSIFICATION TESTS
// ============================================

describe('classifyAnalyzeError', () => {
  describe('network errors', () => {
    it('classifies "Network request failed" as no_network', () => {
      const error = new Error('Network request failed');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('no_network');
      expect(result.message).toBe('No internet connection.');
    });

    it('classifies iOS offline error as no_network', () => {
      const error = new Error('The Internet connection appears to be offline');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('no_network');
    });

    it('classifies iOS network connection lost as no_network', () => {
      const error = new Error('The network connection was lost');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('no_network');
    });

    it('classifies iOS data connection error as no_network', () => {
      const error = new Error('A data connection is not currently allowed');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('no_network');
    });

    it('classifies iOS timeout error as no_network', () => {
      const error = new Error('The request timed out');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('no_network');
    });

    it('classifies ENOTFOUND as no_network', () => {
      const error = new Error('getaddrinfo ENOTFOUND api.openai.com');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('no_network');
    });

    it('classifies ECONNRESET as no_network', () => {
      const error = new Error('read ECONNRESET');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('no_network');
    });

    it('classifies ECONNREFUSED as no_network', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:443');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('no_network');
    });

    it('classifies EHOSTUNREACH as no_network', () => {
      const error = new Error('connect EHOSTUNREACH');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('no_network');
    });

    it('classifies NSURLErrorDomain as no_network', () => {
      const error = new Error('Error Domain=NSURLErrorDomain Code=-1009');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('no_network');
    });

    it('classifies kCFErrorDomainCFNetwork as no_network', () => {
      const error = new Error('Error Domain=kCFErrorDomainCFNetwork Code=-1005');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('no_network');
    });
  });

  describe('HTTP status errors', () => {
    it('classifies 429 as rate_limited', () => {
      const error = new Error('Too many requests');
      const response = { status: 429, headers: { get: () => '60' } } as unknown as Response;
      const result = classifyAnalyzeError(error, response);
      
      expect(result.kind).toBe('rate_limited');
      expect(result.message).toBe('Too many requests right now.');
      expect(result.httpStatus).toBe(429);
    });

    it('extracts retry-after header for rate limiting', () => {
      const error = new Error('Too many requests');
      const response = { 
        status: 429, 
        headers: { get: (h: string) => h === 'retry-after' ? '120' : null } 
      } as unknown as Response;
      const result = classifyAnalyzeError(error, response);
      
      expect(result.retryAfterSeconds).toBe(120);
    });

    it('classifies 401 as unauthorized', () => {
      const error = new Error('Unauthorized');
      const response = { status: 401 } as unknown as Response;
      const result = classifyAnalyzeError(error, response);
      
      expect(result.kind).toBe('unauthorized');
      expect(result.httpStatus).toBe(401);
    });

    it('classifies 403 as unauthorized', () => {
      const error = new Error('Forbidden');
      const response = { status: 403 } as unknown as Response;
      const result = classifyAnalyzeError(error, response);
      
      expect(result.kind).toBe('unauthorized');
      expect(result.httpStatus).toBe(403);
    });

    it('classifies 400 as bad_request', () => {
      const error = new Error('Bad request');
      const response = { status: 400 } as unknown as Response;
      const result = classifyAnalyzeError(error, response);
      
      expect(result.kind).toBe('bad_request');
      expect(result.message).toBe("Couldn't analyze this image.");
    });

    it('classifies 500 as server_error', () => {
      const error = new Error('Internal server error');
      const response = { status: 500 } as unknown as Response;
      const result = classifyAnalyzeError(error, response);
      
      expect(result.kind).toBe('server_error');
      expect(result.message).toBe('Server error. Please try again.');
    });

    it('classifies 502 as server_error', () => {
      const error = new Error('Bad gateway');
      const response = { status: 502 } as unknown as Response;
      const result = classifyAnalyzeError(error, response);
      
      expect(result.kind).toBe('server_error');
    });

    it('classifies 503 as server_error', () => {
      const error = new Error('Service unavailable');
      const response = { status: 503 } as unknown as Response;
      const result = classifyAnalyzeError(error, response);
      
      expect(result.kind).toBe('server_error');
    });

    it('classifies other 4xx as api_error', () => {
      const error = new Error('Not found');
      const response = { status: 404 } as unknown as Response;
      const result = classifyAnalyzeError(error, response);
      
      expect(result.kind).toBe('api_error');
    });
  });

  describe('parse errors', () => {
    it('classifies JSON parse error', () => {
      const error = new Error('Unexpected token < in JSON at position 0');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('parse_error');
      expect(result.message).toBe("Couldn't understand the analysis.");
    });

    it('classifies "JSON" in error message as parse_error', () => {
      const error = new Error('Invalid JSON response');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('parse_error');
    });

    it('classifies "parse" in error message as parse_error', () => {
      const error = new Error('Failed to parse response');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('parse_error');
    });
  });

  describe('unknown errors', () => {
    it('classifies unknown errors correctly', () => {
      const error = new Error('Something completely unexpected');
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('unknown');
      expect(result.message).toBe('Something went wrong.');
    });

    it('handles non-Error objects', () => {
      const error = 'string error';
      const result = classifyAnalyzeError(error);
      
      expect(result.kind).toBe('unknown');
      expect(result.debug).toBe('string error');
    });

    it('handles null/undefined errors', () => {
      const result = classifyAnalyzeError(null);
      
      expect(result.kind).toBe('unknown');
    });
  });
});

// ============================================
// NON-FASHION ITEM DETECTION TESTS
// ============================================

describe('fallbackIsFashionItem', () => {
  describe('returns true for fashion items', () => {
    it('returns true for clothing labels', () => {
      expect(fallbackIsFashionItem('Blue denim jeans')).toBe(true);
      expect(fallbackIsFashionItem('White cotton shirt')).toBe(true);
      expect(fallbackIsFashionItem('Black leather jacket')).toBe(true);
      expect(fallbackIsFashionItem('Red silk dress')).toBe(true);
    });

    it('returns true for accessory labels', () => {
      expect(fallbackIsFashionItem('Gold necklace')).toBe(true);
      expect(fallbackIsFashionItem('Leather belt')).toBe(true);
      expect(fallbackIsFashionItem('Wool scarf')).toBe(true);
    });

    it('returns true for shoes', () => {
      expect(fallbackIsFashionItem('Running sneakers')).toBe(true);
      expect(fallbackIsFashionItem('Brown leather boots')).toBe(true);
      expect(fallbackIsFashionItem('High heels')).toBe(true);
    });

    it('returns true for empty/undefined labels (permissive)', () => {
      expect(fallbackIsFashionItem('')).toBe(true);
      expect(fallbackIsFashionItem(undefined)).toBe(true);
    });
  });

  describe('returns false for non-fashion items', () => {
    describe('kitchenware', () => {
      it('detects mugs', () => {
        expect(fallbackIsFashionItem('Coffee mug')).toBe(false);
        expect(fallbackIsFashionItem('Ceramic mug')).toBe(false);
      });

      it('detects cups and glasses', () => {
        expect(fallbackIsFashionItem('Glass cup')).toBe(false);
        expect(fallbackIsFashionItem('Wine glass')).toBe(false);
      });

      it('detects plates and bowls', () => {
        expect(fallbackIsFashionItem('Dinner plate')).toBe(false);
        expect(fallbackIsFashionItem('Cereal bowl')).toBe(false);
      });

      it('detects bottles and jars', () => {
        expect(fallbackIsFashionItem('Water bottle')).toBe(false);
        expect(fallbackIsFashionItem('Mason jar')).toBe(false);
      });
    });

    describe('electronics', () => {
      it('detects phones', () => {
        expect(fallbackIsFashionItem('iPhone 15')).toBe(false);
        expect(fallbackIsFashionItem('Android phone')).toBe(false);
        expect(fallbackIsFashionItem('Mobile phone')).toBe(false);
      });

      it('detects computers', () => {
        expect(fallbackIsFashionItem('Laptop computer')).toBe(false);
        expect(fallbackIsFashionItem('Desktop computer')).toBe(false);
        expect(fallbackIsFashionItem('MacBook laptop')).toBe(false);
      });

      it('detects peripherals', () => {
        expect(fallbackIsFashionItem('Wireless keyboard')).toBe(false);
        expect(fallbackIsFashionItem('Gaming mouse')).toBe(false);
        expect(fallbackIsFashionItem('Computer monitor')).toBe(false);
      });

      it('detects other electronics', () => {
        expect(fallbackIsFashionItem('Digital camera')).toBe(false);
        expect(fallbackIsFashionItem('TV remote')).toBe(false);
        expect(fallbackIsFashionItem('Tablet device')).toBe(false);
      });
    });

    describe('food and drinks', () => {
      it('detects food keyword', () => {
        expect(fallbackIsFashionItem('Some food item')).toBe(false);
        expect(fallbackIsFashionItem('Fresh fruit bowl')).toBe(false);
        expect(fallbackIsFashionItem('Vegetable tray')).toBe(false);
        expect(fallbackIsFashionItem('Healthy snack bar')).toBe(false);
      });

      it('detects drink keywords', () => {
        expect(fallbackIsFashionItem('Hot coffee')).toBe(false);
        expect(fallbackIsFashionItem('Green tea pot')).toBe(false);
        expect(fallbackIsFashionItem('Cold drink')).toBe(false);
      });
    });

    describe('plants and nature', () => {
      it('detects plants', () => {
        expect(fallbackIsFashionItem('Indoor plant')).toBe(false);
        expect(fallbackIsFashionItem('Flower bouquet')).toBe(false);
        expect(fallbackIsFashionItem('Oak tree')).toBe(false);
      });
    });

    describe('animals', () => {
      it('detects pets', () => {
        expect(fallbackIsFashionItem('Golden retriever dog')).toBe(false);
        expect(fallbackIsFashionItem('Tabby cat')).toBe(false);
        expect(fallbackIsFashionItem('Pet bird')).toBe(false);
      });
    });

    describe('furniture', () => {
      it('detects furniture items', () => {
        expect(fallbackIsFashionItem('Office chair')).toBe(false);
        expect(fallbackIsFashionItem('Dining table')).toBe(false);
        expect(fallbackIsFashionItem('Leather sofa')).toBe(false);
        expect(fallbackIsFashionItem('Floor lamp')).toBe(false);
      });
    });

    describe('vehicles', () => {
      it('detects vehicles', () => {
        expect(fallbackIsFashionItem('Red car')).toBe(false);
        expect(fallbackIsFashionItem('Mountain bike')).toBe(false);
        expect(fallbackIsFashionItem('Electric bicycle')).toBe(false);
      });
    });

    describe('other non-wearables', () => {
      it('detects books and media', () => {
        expect(fallbackIsFashionItem('Hardcover book')).toBe(false);
        expect(fallbackIsFashionItem('Fashion magazine')).toBe(false);
      });

      it('detects toys and games', () => {
        expect(fallbackIsFashionItem('Board game')).toBe(false);
        expect(fallbackIsFashionItem('Toy car')).toBe(false);
      });
    });
  });

  describe('whole word matching', () => {
    it('does not match partial words', () => {
      // "cat" should not match words containing "cat"
      expect(fallbackIsFashionItem('Catherine blouse')).toBe(true);
      expect(fallbackIsFashionItem('Catalog cover')).toBe(true);
      
      // "mug" should not match words containing "mug"
      expect(fallbackIsFashionItem('Smuggler coat')).toBe(true);
      
      // "car" should not match words containing "car"
      expect(fallbackIsFashionItem('Cardigan sweater')).toBe(true);
      expect(fallbackIsFashionItem('Cargo pants')).toBe(true);
    });

    it('matches keywords as standalone words', () => {
      expect(fallbackIsFashionItem('my cat')).toBe(false);
      expect(fallbackIsFashionItem('cat sitting')).toBe(false);
      expect(fallbackIsFashionItem('a mug on table')).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('matches regardless of case', () => {
      expect(fallbackIsFashionItem('COFFEE MUG')).toBe(false);
      expect(fallbackIsFashionItem('Coffee Mug')).toBe(false);
      expect(fallbackIsFashionItem('coffee mug')).toBe(false);
    });
  });
});

// ============================================
// ANALYZE ERROR TYPE TESTS
// ============================================

describe('AnalyzeError type structure', () => {
  it('has required fields', () => {
    const error: AnalyzeError = {
      kind: 'no_network',
      message: 'No internet connection.',
    };

    expect(error.kind).toBeDefined();
    expect(error.message).toBeDefined();
  });

  it('supports optional fields', () => {
    const error: AnalyzeError = {
      kind: 'rate_limited',
      message: 'Too many requests.',
      debug: 'Rate limit exceeded',
      retryAfterSeconds: 60,
      httpStatus: 429,
    };

    expect(error.debug).toBe('Rate limit exceeded');
    expect(error.retryAfterSeconds).toBe(60);
    expect(error.httpStatus).toBe(429);
  });
});

// ============================================
// ERROR KIND COVERAGE
// ============================================

describe('AnalyzeErrorKind coverage', () => {
  const allKinds: string[] = [
    'no_network',
    'timeout',
    'cancelled',
    'rate_limited',
    'api_error',
    'unauthorized',
    'bad_request',
    'server_error',
    'parse_error',
    'unknown',
  ];

  it('all error kinds are valid strings', () => {
    allKinds.forEach(kind => {
      expect(typeof kind).toBe('string');
      expect(kind.length).toBeGreaterThan(0);
    });
  });

  it('error kinds are distinct', () => {
    const uniqueKinds = new Set(allKinds);
    expect(uniqueKinds.size).toBe(allKinds.length);
  });
});

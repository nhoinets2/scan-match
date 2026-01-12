/**
 * Image Resolver Test Suite
 *
 * Tests for the image resolution system that maps path strings to require() sources.
 * Covers:
 * - resolveImage function
 * - Remote URL handling (Supabase Storage)
 * - isRemoteUrl helper
 *
 * Note: Local library images have been removed. The system now relies on
 * remote URLs from Supabase Storage for library item images.
 */

// Define __DEV__ for test environment
// @ts-expect-error - __DEV__ is a React Native global
globalThis.__DEV__ = true;

import { resolveImage, isRemoteUrl, LIBRARY_IMAGES } from '../inspiration/images';

// ============================================
// LIBRARY_IMAGES MAP TESTS
// ============================================

describe('LIBRARY_IMAGES', () => {
  describe('structure', () => {
    it('should be an empty object (local assets removed)', () => {
      expect(typeof LIBRARY_IMAGES).toBe('object');
      expect(Object.keys(LIBRARY_IMAGES).length).toBe(0);
    });
  });
});

// ============================================
// isRemoteUrl FUNCTION TESTS
// ============================================

describe('isRemoteUrl', () => {
  it('should return true for https URLs', () => {
    expect(isRemoteUrl('https://example.com/image.png')).toBe(true);
    expect(isRemoteUrl('https://supabase.co/storage/v1/object/image.png')).toBe(true);
  });

  it('should return true for http URLs', () => {
    expect(isRemoteUrl('http://example.com/image.png')).toBe(true);
  });

  it('should return false for local asset paths', () => {
    expect(isRemoteUrl('assets/inspiration/library/tops/top.png')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isRemoteUrl('')).toBe(false);
  });

  it('should return false for relative paths', () => {
    expect(isRemoteUrl('../images/photo.png')).toBe(false);
  });
});

// ============================================
// resolveImage FUNCTION TESTS
// ============================================

describe('resolveImage', () => {
  describe('remote URLs (Supabase Storage)', () => {
    it('should return URI object for https URLs', () => {
      const url = 'https://xxx.supabase.co/storage/v1/object/public/library-items/tops/white_tee.png';
      const result = resolveImage(url);
      expect(result).toEqual({ uri: url });
    });

    it('should return URI object for http URLs', () => {
      const url = 'http://example.com/image.png';
      const result = resolveImage(url);
      expect(result).toEqual({ uri: url });
    });

    it('should preserve full URL including query params', () => {
      const url = 'https://cdn.example.com/image.png?width=200&format=webp';
      const result = resolveImage(url);
      expect(result).toEqual({ uri: url });
    });
  });

  describe('local asset paths (now unsupported)', () => {
    it('should return null for local asset paths (assets removed)', () => {
      const path = 'assets/inspiration/library/tops/top_tee_white.png';
      const result = resolveImage(path);
      expect(result).toBeNull();
    });

    it('should return null for any non-URL path', () => {
      expect(resolveImage('some/local/path.png')).toBeNull();
      expect(resolveImage('../relative/path.png')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should return null for empty string', () => {
      const result = resolveImage('');
      expect(result).toBeNull();
    });

    it('should handle URLs with special characters', () => {
      const url = 'https://example.com/path/image%20with%20spaces.png';
      const result = resolveImage(url);
      expect(result).toEqual({ uri: url });
    });
  });
});

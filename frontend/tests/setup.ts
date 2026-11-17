import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { setInMemoryAuthHeader } from '../src/lib/api/api-client';

beforeEach(() => {
  // Clear in-memory auth before each test
  setInMemoryAuthHeader(null);
  vi.restoreAllMocks();

  if (typeof window !== 'undefined' && typeof window.HTMLMediaElement !== 'undefined') {
    window.HTMLMediaElement.prototype.play = vi.fn().mockImplementation(() => Promise.resolve());
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();
  }
});

afterEach(() => {
  cleanup();
});


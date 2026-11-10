import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { setInMemoryAuthHeader } from '../src/lib/api/api-client';

beforeEach(() => {
  // Clear in-memory auth before each test
  setInMemoryAuthHeader(null);
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});


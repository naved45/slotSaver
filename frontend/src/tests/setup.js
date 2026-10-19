import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vitest runs without globals, so unmount rendered trees between tests explicitly.
afterEach(() => cleanup());

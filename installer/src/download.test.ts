import { describe, expect, it } from 'vitest';
import { createBinaryDownloadBlob } from './download';

describe('binary downloads', () => {
  it('creates an application/pdf Blob for operator-guide bytes', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\nfixture');
    const blob = createBinaryDownloadBlob(bytes, 'application/pdf');

    expect(blob.type).toBe('application/pdf');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });
});

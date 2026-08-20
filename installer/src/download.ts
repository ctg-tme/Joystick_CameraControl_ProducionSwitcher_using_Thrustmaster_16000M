export function createBinaryDownloadBlob(bytes: Uint8Array, mimeType: string): Blob {
  return new Blob([new Uint8Array(bytes)], { type: mimeType });
}

export function downloadBinary(fileName: string, bytes: Uint8Array, mimeType: string): void {
  const link = document.createElement('a');
  const blob = createBinaryDownloadBlob(bytes, mimeType);
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

const HASH_PREFIX = '#code/';

export function readSourceFromUrl() {
  const encodedSource = readEncodedSource();

  if (encodedSource === null) {
    return null;
  }

  try {
    const source = decompressFromEncodedURIComponent(encodedSource);
    return typeof source === 'string' ? source : null;
  } catch {
    return null;
  }
}

export function writeSourceToUrl(source) {
  const hash = `${HASH_PREFIX}${compressToEncodedURIComponent(source)}`;

  if (window.location.hash === hash) {
    return;
  }

  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
}

function readEncodedSource() {
  if (!window.location.hash.startsWith(HASH_PREFIX)) {
    return null;
  }

  return window.location.hash.slice(HASH_PREFIX.length);
}

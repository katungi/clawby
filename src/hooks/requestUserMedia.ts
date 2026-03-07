type LegacyNavigator = Navigator & {
  getUserMedia?: (
    constraints: MediaStreamConstraints,
    onSuccess: (stream: MediaStream) => void,
    onError: (error: unknown) => void,
  ) => void;
  webkitGetUserMedia?: (
    constraints: MediaStreamConstraints,
    onSuccess: (stream: MediaStream) => void,
    onError: (error: unknown) => void,
  ) => void;
  mozGetUserMedia?: (
    constraints: MediaStreamConstraints,
    onSuccess: (stream: MediaStream) => void,
    onError: (error: unknown) => void,
  ) => void;
  msGetUserMedia?: (
    constraints: MediaStreamConstraints,
    onSuccess: (stream: MediaStream) => void,
    onError: (error: unknown) => void,
  ) => void;
};

function resolveNavigator(): LegacyNavigator | null {
  if (typeof navigator !== 'undefined') {
    return navigator as LegacyNavigator;
  }

  const fromWindow = (globalThis as { window?: { navigator?: Navigator } }).window?.navigator;
  if (fromWindow) return fromWindow as LegacyNavigator;

  const fromSelf = (globalThis as { self?: { navigator?: Navigator } }).self?.navigator;
  if (fromSelf) return fromSelf as LegacyNavigator;

  return null;
}

export async function requestUserMedia(
  constraints: MediaStreamConstraints,
): Promise<MediaStream> {
  const nav = resolveNavigator();

  const modernGetUserMedia = nav?.mediaDevices?.getUserMedia?.bind(nav.mediaDevices);
  if (modernGetUserMedia) {
    return modernGetUserMedia(constraints);
  }

  const legacyGetUserMedia =
    nav?.getUserMedia
    ?? nav?.webkitGetUserMedia
    ?? nav?.mozGetUserMedia
    ?? nav?.msGetUserMedia;

  if (legacyGetUserMedia) {
    return new Promise((resolve, reject) => {
      legacyGetUserMedia.call(nav, constraints, resolve, reject);
    });
  }

  throw new Error('Microphone API unavailable in this runtime.');
}


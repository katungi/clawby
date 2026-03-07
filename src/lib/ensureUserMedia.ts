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
  mediaDevices?: {
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  };
};

export function ensureUserMediaSupport() {
  const nav = (typeof navigator !== 'undefined' ? navigator : null) as LegacyNavigator | null;
  if (!nav) return;

  const existingMediaDevices = (nav as any).mediaDevices as { getUserMedia?: unknown } | undefined;
  if (typeof existingMediaDevices?.getUserMedia === 'function') return;

  const legacyGetUserMedia =
    nav.getUserMedia
    ?? nav.webkitGetUserMedia
    ?? nav.mozGetUserMedia
    ?? nav.msGetUserMedia;

  if (!legacyGetUserMedia) return;

  const mediaDevices = existingMediaDevices ?? {};
  mediaDevices.getUserMedia = (constraints: MediaStreamConstraints) =>
    new Promise<MediaStream>((resolve, reject) => {
      legacyGetUserMedia.call(nav, constraints, resolve, reject);
    });

  (nav as any).mediaDevices = mediaDevices;
}

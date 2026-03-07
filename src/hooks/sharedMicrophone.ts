const MIC_RELEASE_GRACE_MS = 15000;

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  sampleRate: 16000,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

let sharedStream: MediaStream | null = null;
let pendingStream: Promise<MediaStream> | null = null;
let leaseCount = 0;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

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
  if (fromWindow) {
    return fromWindow as LegacyNavigator;
  }

  const fromSelf = (globalThis as { self?: { navigator?: Navigator } }).self?.navigator;
  if (fromSelf) {
    return fromSelf as LegacyNavigator;
  }

  return null;
}

async function requestMicrophoneStream(): Promise<MediaStream> {
  const nav = resolveNavigator();

  if (nav?.mediaDevices?.getUserMedia) {
    return nav.mediaDevices.getUserMedia.call(nav.mediaDevices, { audio: MIC_CONSTRAINTS });
  }

  const legacyGetUserMedia =
    nav?.getUserMedia
    ?? nav?.webkitGetUserMedia
    ?? nav?.mozGetUserMedia
    ?? nav?.msGetUserMedia;

  if (legacyGetUserMedia) {
    return new Promise((resolve, reject) => {
      legacyGetUserMedia.call(
        nav,
        { audio: MIC_CONSTRAINTS },
        resolve,
        reject,
      );
    });
  }

  throw new Error('Microphone API unavailable in this runtime.');
}

function clearReleaseTimer() {
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
}

function hasLiveAudioTrack(stream: MediaStream): boolean {
  return stream.getAudioTracks().some((track) => track.readyState === 'live');
}

function stopSharedStream() {
  if (!sharedStream) return;
  sharedStream.getTracks().forEach((track) => track.stop());
  sharedStream = null;
}

export async function acquireSharedMicrophone(): Promise<MediaStream> {
  clearReleaseTimer();
  leaseCount += 1;

  try {
    if (sharedStream && hasLiveAudioTrack(sharedStream)) {
      return sharedStream;
    }

    if (!pendingStream) {
      pendingStream = requestMicrophoneStream()
        .then((stream) => {
          sharedStream = stream;
          return stream;
        })
        .finally(() => {
          pendingStream = null;
        });
    }

    return await pendingStream;
  } catch (error) {
    leaseCount = Math.max(leaseCount - 1, 0);
    throw error;
  }
}

export function releaseSharedMicrophone() {
  leaseCount = Math.max(leaseCount - 1, 0);
  if (leaseCount > 0) return;

  clearReleaseTimer();
  releaseTimer = setTimeout(() => {
    if (leaseCount === 0) {
      stopSharedStream();
    }
  }, MIC_RELEASE_GRACE_MS);
}

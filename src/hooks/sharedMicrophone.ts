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
      pendingStream = navigator.mediaDevices
        .getUserMedia({ audio: MIC_CONSTRAINTS })
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


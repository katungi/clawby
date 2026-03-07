import { requestUserMedia } from './requestUserMedia';

export type MicrophonePermissionResult =
  | { ok: true; status: 'granted' }
  | { ok: false; status: 'denied' | 'unavailable' | 'error'; message: string };

function hasAnyGetUserMediaApi(): boolean {
  const nav = (typeof navigator !== 'undefined' ? navigator : null) as any;
  if (!nav) return false;

  return Boolean(
    nav?.mediaDevices?.getUserMedia
    || nav?.getUserMedia
    || nav?.webkitGetUserMedia
    || nav?.mozGetUserMedia
    || nav?.msGetUserMedia,
  );
}

export async function ensureMicrophonePermission(): Promise<MicrophonePermissionResult> {
  if (!hasAnyGetUserMediaApi()) {
    return {
      ok: false,
      status: 'unavailable',
      message:
        'Microphone API is unavailable in this runtime. Run the app in Tauri and allow microphone access in macOS Privacy settings.',
    };
  }

  try {
    const nav = (typeof navigator !== 'undefined' ? navigator : null) as any;
    if (nav?.permissions?.query) {
      try {
        const status = await nav.permissions.query({ name: 'microphone' as PermissionName });
        if (status.state === 'granted') {
          return { ok: true, status: 'granted' };
        }
        if (status.state === 'denied') {
          return {
            ok: false,
            status: 'denied',
            message:
              'Microphone access is denied. Open System Settings > Privacy & Security > Microphone and enable access for ClawAssist (and your terminal/browser if running dev).',
          };
        }
      } catch {
        // Fall through to explicit getUserMedia request.
      }
    }

    const stream = await requestUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { ok: true, status: 'granted' };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : String(error);

    if (name === 'NotAllowedError' || name === 'SecurityError' || /denied|not allowed/i.test(message)) {
      return {
        ok: false,
        status: 'denied',
        message:
          'Microphone permission was denied. Enable it in System Settings > Privacy & Security > Microphone, then restart ClawAssist.',
      };
    }

    return {
      ok: false,
      status: 'error',
      message: `Unable to access microphone: ${message}`,
    };
  }
}


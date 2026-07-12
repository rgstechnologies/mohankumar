'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { IconMic } from '@/components/icons';

const MAX_SECONDS = 60;
const TARGET_RATE = 16000;

/** AudioBuffer → 16kHz mono 16-bit WAV, base64. Keeps uploads ~32KB/s. */
function toWavBase64(buffer: AudioBuffer): string {
  // Mix down + naive resample (fine for speech).
  const ratio = buffer.sampleRate / TARGET_RATE;
  const length = Math.floor(buffer.length / ratio);
  const mono = new Float32Array(length);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    buffer.getChannelData(c),
  );
  for (let i = 0; i < length; i++) {
    const src = Math.floor(i * ratio);
    let sum = 0;
    for (const ch of channels) sum += ch[src];
    mono[i] = sum / channels.length;
  }

  const data = new DataView(new ArrayBuffer(44 + length * 2));
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) data.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  data.setUint32(4, 36 + length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true); // PCM
  data.setUint16(22, 1, true); // mono
  data.setUint32(24, TARGET_RATE, true);
  data.setUint32(28, TARGET_RATE * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  writeStr(36, 'data');
  data.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const v = Math.max(-1, Math.min(1, mono[i]));
    data.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }

  const bytes = new Uint8Array(data.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Tap to record, tap to send. Records via MediaRecorder, converts to WAV in
 * the browser (the API only accepts WAV — works the same in every browser),
 * then hands the base64 to the parent.
 */
export function MicButton({
  onAudio,
  disabled,
}: {
  onAudio: (base64Wav: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const t = useTranslations('voice');
  const { toast } = useFeedback();
  const [recording, setRecording] = useState(false);
  const [converting, setConverting] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast(t('unsupported'), 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setConverting(true);
        void (async () => {
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType });
            const ctx = new AudioContext();
            const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
            void ctx.close();
            if (decoded.duration < 0.5) {
              toast(t('tooShort'), 'error');
              return;
            }
            await onAudio(toWavBase64(decoded));
          } catch {
            toast(t('failed'), 'error');
          } finally {
            setConverting(false);
          }
        })();
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      timerRef.current = setTimeout(() => recorder.stop(), MAX_SECONDS * 1000);
    } catch {
      toast(t('denied'), 'error');
    }
  }

  function stop() {
    if (timerRef.current) clearTimeout(timerRef.current);
    recorderRef.current?.stop();
  }

  return (
    <button
      type="button"
      disabled={disabled || converting}
      onClick={() => (recording ? stop() : void start())}
      title={recording ? t('stop') : t('start')}
      aria-label={recording ? t('stop') : t('start')}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-base transition-colors ${
        recording
          ? 'animate-pulse border-red-300 bg-red-50 text-red-600'
          : 'border-line-strong bg-surface text-muted hover:bg-subtle'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {converting ? '…' : recording ? '■' : <IconMic className="h-4 w-4" />}
    </button>
  );
}

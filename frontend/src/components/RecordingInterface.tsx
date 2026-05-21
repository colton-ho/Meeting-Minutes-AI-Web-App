import { useEffect, useMemo, useRef, useState } from 'react';
import type { RecorderStatus } from '../types';

type TranscriptMessage = {
  type: 'transcript_chunk' | 'transcript_complete' | 'minutes_chunk' | 'minutes_complete' | 'error';
  text?: string;
  is_final?: boolean;
  full_text?: string;
  minutes?: string;
  meeting_id?: string;
  error?: string;
};

const WS_URL = 'ws://localhost:8000/api/ws/transcribe';
const SAMPLE_RATE = 16000;
const CHUNK_SECONDS = 3;
const BYTES_PER_SAMPLE = 2;
const CHUNK_SIZE = SAMPLE_RATE * CHUNK_SECONDS * BYTES_PER_SAMPLE;
const BAR_COUNT = 32;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
}

function buildAudioWorkletUrl(): string {
  const processorSource = `
  class PCM16Processor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.buffer = [];
      this.chunkSize = ${SAMPLE_RATE * CHUNK_SECONDS};
      this.port.onmessage = (event) => {
        const message = event.data;
        if (message?.type === 'flush' && this.buffer.length > 0) {
          const chunk = this.buffer.slice(0);
          this.buffer = [];
          this.port.postMessage({ type: 'chunk', data: Int16Array.from(chunk).buffer }, [Int16Array.from(chunk).buffer]);
        }
      };
    }

    process(inputs) {
      const input = inputs[0];
      if (!input || input.length === 0) {
        return true;
      }

      const channelData = input[0];
      if (!channelData || channelData.length === 0) {
        return true;
      }

      let peak = 0;
      const numericSamples = new Array(channelData.length);
      for (let i = 0; i < channelData.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        const value = sample < 0 ? sample * 32768 : sample * 32767;
        numericSamples[i] = value;
        peak = Math.max(peak, Math.abs(value));
      }

      this.buffer.push(...numericSamples);
      if (this.buffer.length >= this.chunkSize) {
        const chunk = this.buffer.slice(0, this.chunkSize);
        this.buffer = this.buffer.slice(this.chunkSize);
        this.port.postMessage({ type: 'chunk', data: Int16Array.from(chunk).buffer }, [Int16Array.from(chunk).buffer]);
      }

      this.port.postMessage({ type: 'peak', peak });
      return true;
    }

    static get parameterDescriptors() {
      return [];
    }
  }

  registerProcessor('pcm16-processor', PCM16Processor);
  `;

  const blob = new Blob([processorSource], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

function RecordingInterface() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<'idle' | 'recording' | 'transcribing' | 'generating' | 'done' | 'error'>('idle');
  const [timer, setTimer] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [minutes, setMinutes] = useState('');
  const [waveform, setWaveform] = useState<number[]>(Array(BAR_COUNT).fill(0));
  const [meetingId, setMeetingId] = useState<string>('');

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioNodeRef = useRef<AudioWorkletNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const transcriptRef = useRef<string>('');

  const waveformBars = useMemo(
    () => waveform.map((level, index) => ({ index, level })),
    [waveform],
  );

  useEffect(() => {
    return () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
      stopRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isRecording) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      return;
    }

    timerRef.current = window.setInterval(() => {
      setTimer((value) => value + 1);
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  const startRecording = async () => {
    setStatus('recording');
    setIsRecording(true);
    setTimer(0);
    setTranscript('');
    setMinutes('');
    setMeetingId('');
    transcriptRef.current = '';

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: SAMPLE_RATE,
      },
    });
    mediaStreamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
    audioContextRef.current = audioContext;

    const workletUrl = buildAudioWorkletUrl();
    await audioContext.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    const source = audioContext.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(audioContext, 'pcm16-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
    });
    audioNodeRef.current = node;

    node.port.onmessage = (event) => {
      const message = event.data as { type: string; data?: ArrayBuffer; peak?: number };
      if (message.type === 'chunk' && message.data) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(message.data);
        }
      }
      if (message.type === 'peak' && typeof message.peak === 'number') {
        setWaveform((current) => {
          const next = [...current.slice(1), Math.min(100, message.peak / 327.67)];
          return next;
        });
      }
    };

    source.connect(node);
    setStatus('Connecting...');

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      setStatus('recording');
    });

    ws.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data) as TranscriptMessage;
        switch (message.type) {
          case 'transcript_chunk': {
            const text = message.text ?? '';
            transcriptRef.current = `${transcriptRef.current} ${text}`.trim();
            setTranscript(transcriptRef.current);
            break;
          }
          case 'transcript_complete': {
            setStatus('transcribing');
            setTranscript(message.full_text ?? transcriptRef.current);
            break;
          }
          case 'minutes_chunk': {
            setStatus('generating');
            setMinutes((current) => current + (message.text ?? ''));
            break;
          }
          case 'minutes_complete': {
            setMinutes(message.minutes ?? minutes);
            setMeetingId(message.meeting_id ?? '');
            setStatus('done');
            break;
          }
          case 'error': {
            setStatus('error');
            break;
          }
          default:
            break;
        }
      } catch (error) {
        console.error('Invalid websocket message:', error);
      }
    });

    ws.addEventListener('close', () => {
      wsRef.current = null;
      setStatus('idle');
    });

    ws.addEventListener('error', () => {
      setStatus('error');
    });
  };

  const stopRecording = async () => {
    if (!isRecording) {
      return;
    }

    setIsRecording(false);
    setStatus('transcribing');

    if (audioNodeRef.current) {
      audioNodeRef.current.port.postMessage({ type: 'flush' });
      audioNodeRef.current.disconnect();
      audioNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  };

  return (
    <section className="mx-auto max-w-5xl rounded-3xl border border-slate-700 bg-slate-900/90 p-6 shadow-2xl shadow-slate-950/30">
      <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">實時錄音</p>
            <h2 className="text-3xl font-semibold text-white">會議錄音介面</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              透過即時 WebSocket 錄製語音，並將會議內容自動轉錄與生成會議紀要。
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 rounded-3xl border border-slate-800 bg-slate-950 px-5 py-4 text-white md:items-end">
            <span className="text-xs uppercase tracking-[0.3em] text-slate-500">狀態</span>
            <span className="text-lg font-semibold text-emerald-300">{status}</span>
            <span className="text-sm text-slate-400">計時：{formatTime(timer)}</span>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">波形顯示</p>
                <p className="text-xs text-slate-500">實時音量監控</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-emerald-400"></span>
                <span className="text-xs text-slate-400">Live</span>
              </div>
            </div>
            <div className="mt-6 flex h-24 items-end gap-1 overflow-hidden rounded-3xl bg-slate-950/70 px-2 py-3">
              {waveformBars.map((bar) => (
                <div
                  key={bar.index}
                  className="h-full w-full rounded-full bg-gradient-to-t from-fuchsia-500 to-rose-400 transition-all duration-200"
                  style={{ height: `${Math.max(4, bar.level)}%` }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-slate-800 bg-slate-950 p-6">
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`flex h-28 w-28 items-center justify-center rounded-full border-4 transition ${
                isRecording
                  ? 'border-rose-400 bg-rose-500/90 text-white shadow-2xl shadow-rose-500/20'
                  : 'border-slate-700 bg-slate-800 text-slate-100 shadow-lg shadow-slate-950/20'
              }`}
            >
              <div className={`h-20 w-20 rounded-full ${isRecording ? 'bg-red-600' : 'bg-slate-700'}`} />
            </button>
            <div className="text-center text-sm text-slate-400">
              {isRecording ? '停止錄製以生成會議紀要' : '點擊開始錄製'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
          <h3 className="text-xl font-semibold text-white">實時轉錄</h3>
          <div className="mt-4 min-h-[260px] overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 p-4 text-sm leading-relaxed text-slate-200">
            {transcript ? (
              <p className="whitespace-pre-wrap break-words">{transcript}</p>
            ) : (
              <p className="text-slate-500">尚未收到轉錄結果</p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
          <h3 className="text-xl font-semibold text-white">會議紀要</h3>
          <div className="mt-4 min-h-[260px] overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 p-4 text-sm leading-relaxed text-slate-200">
            {minutes ? (
              <pre className="whitespace-pre-wrap break-words">{minutes}</pre>
            ) : (
              <p className="text-slate-500">生成中的會議紀要將在此顯示</p>
            )}
          </div>
          {meetingId ? (
            <p className="mt-4 text-xs text-slate-500">Meeting ID: {meetingId}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default RecordingInterface;

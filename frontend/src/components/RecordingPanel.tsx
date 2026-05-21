import { useEffect, useState, useRef, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import type { RecorderStatus } from '../types';

type RecordingPanelProps = {
  setTranscript: Dispatch<SetStateAction<string>>;
  setSummary: Dispatch<SetStateAction<string>>;
  setStatus: Dispatch<SetStateAction<RecorderStatus>>;
};

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';
const WS_URL = 'ws://localhost:8000/api/ws/transcribe';

function getWebSocketUrl() {
  return WS_URL;
}

async function uploadFile(file: File) {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${apiBase}/transcribe`, {
    method: 'POST',
    body: form,
  });
  return response.json();
}

function RecordingPanel({ setTranscript, setSummary, setStatus }: RecordingPanelProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.close();
      }
      socketRef.current = null;
    };
  }, []);

  const startStreaming = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStatus('recording');
      const socket = new WebSocket(getWebSocketUrl());
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        setStatus('recording');
        setStreaming(true);
      });

      socket.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'transcript_chunk':
            setStatus('recording');
            setTranscript((current) => `${current} ${data.text || ''}`.trim());
            break;
          case 'transcript_complete':
            setStatus('transcribing');
            break;
          case 'minutes_chunk':
            setStatus('generating');
            setSummary((current) => current + (data.text || ''));
            break;
          case 'minutes_complete':
            setStatus('done');
            break;
          case 'error':
            setStatus('error');
            break;
          default:
            break;
        }
      });

      socket.addEventListener('close', () => {
        socketRef.current = null;
        setStreaming(false);
        setStatus('idle');
      });

      socket.addEventListener('error', () => {
        setStatus('error');
      });

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
          event.data.arrayBuffer().then((buffer) => {
            socket.send(buffer);
          });
        }
      });

      recorder.start(1000);
      setIsRecording(true);
    } catch (error) {
      setStatus('error');
      console.error(error);
    }
  };

  const stopStreaming = () => {
    setStatus('transcribing');
    setIsRecording(false);
    setStreaming(false);

    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'stop' }));
    }
    socketRef.current?.close();
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus('Uploading audio file...');
    const result = await uploadFile(file);
    setTranscript(result.transcript || '');
    setSummary('');
    setStatus('done');
  };

  return (
    <section className="mb-8 rounded-3xl border border-slate-700 bg-slate-900/80 p-6 shadow-lg shadow-slate-900/30">
      <h2 className="text-2xl font-semibold text-white">Audio Input</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <button
            type="button"
            disabled={isRecording}
            onClick={startStreaming}
            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            Start Live Stream
          </button>
          <button
            type="button"
            disabled={!isRecording}
            onClick={stopStreaming}
            className="rounded-2xl bg-slate-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-800"
          >
            Stop Live Stream
          </button>
        </div>

        <div className="space-y-3">
          <label className="flex cursor-pointer flex-col rounded-2xl border border-dashed border-slate-600 p-5 text-center text-sm text-slate-400 transition hover:border-slate-500">
            <span>Upload audio file for transcription</span>
            <input type="file" accept="audio/*" className="hidden" onChange={handleFileSelect} />
          </label>
          <p className="text-xs text-slate-500">
            Use REST upload for one-off audio files, or live streaming for real-time capture.
          </p>
        </div>
      </div>
    </section>
  );
}

export default RecordingPanel;

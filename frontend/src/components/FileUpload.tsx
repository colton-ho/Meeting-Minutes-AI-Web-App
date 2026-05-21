import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';

type UploadStatus = 'idle' | 'uploading' | 'transcribing' | 'generating' | 'completed' | 'error';

type UploadResponse = {
  transcript: string;
  minutes: string;
  meeting_id: string;
};

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const ACCEPTED_TYPES = [
  'audio/mp3',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/x-m4a',
  'audio/mp4',
  'audio/webm',
  'audio/ogg',
];

const stageLabels: Record<UploadStatus, string> = {
  idle: '等待上傳',
  uploading: '上傳中...',
  transcribing: '語音轉文字中...',
  generating: '生成會議紀要中...',
  completed: '已完成',
  error: '發生錯誤',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(duration: number): string {
  const mins = Math.floor(duration / 60);
  const secs = Math.round(duration % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function FileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<string>('未知');
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [stageLabel, setStageLabel] = useState(stageLabels.idle);
  const [transcript, setTranscript] = useState('');
  const [minutes, setMinutes] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const progressTimer = useRef<number | null>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    return () => {
      if (progressTimer.current) {
        window.clearInterval(progressTimer.current);
      }
    };
  }, []);

  const stageProgress = useMemo(() => {
    if (status === 'idle') return 0;
    if (status === 'uploading') return Math.min(20, progress);
    if (status === 'transcribing') return 20 + Math.min(50, progress * 0.5);
    if (status === 'generating') return 70 + Math.min(30, progress * 0.3);
    if (status === 'completed') return 100;
    return 0;
  }, [progress, status]);

  const handleFile = async (nextFile: File) => {
    setErrorMessage('');
    setTranscript('');
    setMinutes('');
    setMeetingId('');
    setFile(nextFile);
    setStatus('idle');
    setProgress(0);
    setStageLabel(stageLabels.idle);

    if (!ACCEPTED_TYPES.includes(nextFile.type) && !nextFile.name.match(/\.(mp3|wav|m4a|webm|ogg)$/i)) {
      setErrorMessage('只支援 MP3、WAV、M4A、WEBM 和 OGG 音訊格式。');
      setFile(null);
      return;
    }

    if (nextFile.size > MAX_FILE_SIZE) {
      setErrorMessage('檔案大小超過 500MB，請選擇較小的音訊檔案。');
      setFile(null);
      return;
    }

    try {
      const arrayBuffer = await nextFile.arrayBuffer();
      const audioContext = new AudioContext();
      const decoded = await audioContext.decodeAudioData(arrayBuffer);
      setDuration(formatDuration(decoded.duration));
      audioContext.close();
    } catch {
      setDuration('無法讀取');
    }
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);

    const nextFile = event.dataTransfer.files[0];
    if (nextFile) {
      await handleFile(nextFile);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    if (nextFile) {
      await handleFile(nextFile);
    }
  };

  const startProgressTimer = (from: number, to: number) => {
    if (progressTimer.current) {
      window.clearInterval(progressTimer.current);
    }
    let current = from;
    const step = (to - from) / 50;
    progressTimer.current = window.setInterval(() => {
      current += step;
      setProgress(Math.min(to, Math.round(current)));
      if (current >= to) {
        if (progressTimer.current) {
          window.clearInterval(progressTimer.current);
        }
      }
    }, 120);
  };

  const handleUpload = () => {
    if (!file) {
      setErrorMessage('請先選擇音訊檔案，再進行上傳。');
      return;
    }

    const form = new FormData();
    form.append('file', file);
    setStatus('uploading');
    setStageLabel(stageLabels.uploading);
    setProgress(0);
    setErrorMessage('');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.responseType = 'json';

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        const uploadProgress = Math.min(20, Math.round((percent / 100) * 20));
        setProgress(uploadProgress);
        if (uploadProgress >= 20) {
          setStatus('transcribing');
          setStageLabel(stageLabels.transcribing);
          startProgressTimer(20, 70);
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status !== 200) {
        setStatus('error');
        setErrorMessage('上傳失敗，請稍後再試。');
        return;
      }

      const response = xhr.response as UploadResponse | null;
      if (!response) {
        setStatus('error');
        setErrorMessage('伺服器回傳資料錯誤。');
        return;
      }

      setStatus('generating');
      setStageLabel(stageLabels.generating);
      setProgress(85);

      window.setTimeout(() => {
        setStatus('completed');
        setStageLabel(stageLabels.completed);
        setTranscript(response.transcript);
        setMinutes(response.minutes);
        setMeetingId(response.meeting_id);
        setProgress(100);
      }, 600);
    };

    xhr.onerror = () => {
      setStatus('error');
      setErrorMessage('連線失敗，請檢查網路或伺服器狀態。');
    };

    xhr.send(form);
  };

  useEffect(() => {
    if (status === 'transcribing') {
      setStageLabel(stageLabels.transcribing);
    }
    if (status === 'generating') {
      setStageLabel(stageLabels.generating);
      startProgressTimer(70, 100);
    }
  }, [status]);

  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/20">
      <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">音訊上傳</p>
            <h2 className="text-3xl font-semibold text-white">檔案上傳</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              將音訊檔拖放到此處，或點擊選擇檔案，上傳後自動轉錄並生成會議紀要。
            </p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4 text-right text-sm text-slate-400">
            <div>支援格式：MP3 / WAV / M4A / WEBM / OGG</div>
            <div>最大 500MB</div>
          </div>
        </div>
      </div>

      <div
        className={`group relative mb-6 flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-12 text-center transition ${
          isDragging
            ? 'border-emerald-400 bg-emerald-500/10'
            : 'border-slate-700 bg-slate-950/80 '
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          dragCounter.current += 1;
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragCounter.current -= 1;
          if (dragCounter.current <= 0) {
            setIsDragging(false);
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".mp3,.wav,.m4a,.webm,.ogg"
          className="absolute inset-0 z-10 opacity-0 cursor-pointer"
          onChange={handleFileChange}
        />
        <div className="relative z-0 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-2xl text-slate-200">
            +
          </div>
          <p className="text-lg font-semibold text-white">拖放音訊檔案到此處</p>
          <p className="max-w-xl text-sm text-slate-400">
            或點擊此區域選擇檔案。支援 .mp3、.wav、.m4a、.webm、.ogg。
          </p>
        </div>
      </div>

      {file ? (
        <div className="mb-6 grid gap-4 rounded-3xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-200 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">檔名</p>
            <p className="mt-2 text-white">{file.name}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">長度</p>
            <p className="mt-2 text-white">{duration}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">大小</p>
            <p className="mt-2 text-white">{formatFileSize(file.size)}</p>
          </div>
        </div>
      ) : null}

      <div className="mb-6 rounded-3xl border border-slate-800 bg-slate-950 p-4">
        <div className="mb-3 flex items-center justify-between gap-4 text-sm text-slate-400">
          <span>{stageLabel}</span>
          <span>{Math.round(stageProgress)}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-blue-400 transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, stageProgress))}%` }}
          />
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className="rounded-3xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700"
          onClick={handleUpload}
          disabled={!file || status === 'uploading' || status === 'transcribing' || status === 'generating'}
        >
          開始上傳並生成紀要
        </button>
        {errorMessage ? <p className="text-sm text-rose-400">{errorMessage}</p> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
          <h3 className="text-xl font-semibold text-white">轉錄結果</h3>
          <div className="mt-4 min-h-[220px] overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 p-4 text-sm leading-relaxed text-slate-200">
            {transcript ? (
              <p className="whitespace-pre-wrap break-words">{transcript}</p>
            ) : (
              <p className="text-slate-500">轉錄結果將在上傳後顯示。</p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
          <h3 className="text-xl font-semibold text-white">會議紀要</h3>
          <div className="mt-4 min-h-[220px] overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 p-4 text-sm leading-relaxed text-slate-200">
            {minutes ? (
              <pre className="whitespace-pre-wrap break-words">{minutes}</pre>
            ) : (
              <p className="text-slate-500">會議紀要將在生成後顯示。</p>
            )}
          </div>
          {meetingId ? (
            <p className="mt-4 text-xs text-slate-500">Meeting ID：{meetingId}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default FileUpload;

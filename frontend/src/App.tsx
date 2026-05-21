import FileUpload from './components/FileUpload';
import RecordingInterface from './components/RecordingInterface';

function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-8 rounded-3xl border border-slate-700 bg-slate-900/80 p-8 shadow-xl shadow-slate-900/30">
          <h1 className="text-4xl font-semibold text-white">Meeting Minutes AI</h1>
          <p className="mt-3 max-w-2xl text-slate-400">
            Offline meeting transcription and summarization with local ASR and LLM services.
          </p>
        </header>

        <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
          <RecordingInterface />
          <FileUpload />
        </div>
      </div>
    </div>
  );
}

export default App;

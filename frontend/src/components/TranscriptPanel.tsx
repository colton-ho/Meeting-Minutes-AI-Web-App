type TranscriptPanelProps = {
  transcript: string;
};

function TranscriptPanel({ transcript }: TranscriptPanelProps) {
  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-6 shadow-lg shadow-slate-900/20">
      <h3 className="text-xl font-semibold text-white">Transcript</h3>
      <div className="mt-4 min-h-[220px] rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-sm leading-relaxed text-slate-300">
        {transcript ? <pre className="whitespace-pre-wrap break-words">{transcript}</pre> : <p className="text-slate-500">No transcript available yet.</p>}
      </div>
    </section>
  );
}

export default TranscriptPanel;

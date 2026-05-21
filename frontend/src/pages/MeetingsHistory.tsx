import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

type Meeting = {
  id: string;
  title: string;
  recorded_at: string;
  duration_seconds: number;
  language: string;
  transcript: string;
  minutes: string;
};

type MeetingsResponse = Meeting[];

const PAGE_SIZE = 20;

const sortOptions = [
  { value: 'newest', label: '最新' },
  { value: 'oldest', label: '最舊' },
  { value: 'duration', label: '時長' },
];

const fetchMeetings = async (): Promise<MeetingsResponse> => {
  const response = await fetch('/api/meetings');
  if (!response.ok) {
    throw new Error('無法取得會議歷史');
  }
  return response.json();
};

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins} 分 ${secs.toString().padStart(2, '0')} 秒`;
};

function MeetingsHistory() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery(['meetings'], fetchMeetings, {
    staleTime: 1000 * 60 * 2,
  });

  const filteredMeetings = useMemo(() => {
    if (!data) return [];

    const keyword = search.trim().toLowerCase();
    const filtered = data.filter((meeting) => {
      if (!keyword) return true;
      return [meeting.title, meeting.transcript, meeting.minutes]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });

    return filtered.sort((a, b) => {
      if (sort === 'oldest') {
        return new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime();
      }
      if (sort === 'duration') {
        return b.duration_seconds - a.duration_seconds;
      }
      return new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime();
    });
  }, [data, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredMeetings.length / PAGE_SIZE));
  const pageMeetings = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE;
    return filteredMeetings.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredMeetings, page]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('確定要刪除此會議記錄嗎？此操作無法復原。')) {
      return;
    }

    await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
    window.location.reload();
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 rounded-3xl border border-slate-700 bg-slate-900/80 p-8 shadow-xl shadow-slate-950/30">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">歷史紀錄</p>
          <h1 className="mt-3 text-4xl font-semibold text-white">會議紀錄</h1>
          <p className="mt-4 max-w-2xl text-slate-400">
            檢視過去的會議紀要，搜尋、排序與匯出報表。
          </p>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
            <label className="block text-sm text-slate-400">搜尋會議</label>
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="搜尋標題、轉錄或紀要內容"
              className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400"
            />
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
            <label className="block text-sm text-slate-400">排序方式</label>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
              className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        {isLoading ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-950 p-10 text-center text-slate-400">
            載入中...
          </div>
        ) : isError ? (
          <div className="rounded-3xl border border-rose-500 bg-rose-500/10 p-10 text-center text-rose-300">
            無法取得會議紀錄，請稍後再試。
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-950 p-10 text-center text-slate-400">
            尚無任何會議紀錄。請先使用錄音或上傳功能建立會議紀要。
          </div>
        ) : (
          <div className="grid gap-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {pageMeetings.map((meeting) => (
                <article key={meeting.id} className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-lg shadow-slate-950/20">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.3em] text-slate-500">{formatDateTime(meeting.recorded_at)}</p>
                      <h2 className="mt-2 text-xl font-semibold text-white">{meeting.title || '未命名會議'}</h2>
                    </div>
                    <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-400">
                      {meeting.language.toUpperCase()}
                    </span>
                  </div>

                  <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-3xl bg-slate-950 p-3 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">會議時長</p>
                      <p className="mt-2 text-white">{formatDuration(meeting.duration_seconds)}</p>
                    </div>
                    <div className="rounded-3xl bg-slate-950 p-3 text-sm text-slate-300 sm:col-span-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">快速摘要</p>
                      <p className="mt-2 text-slate-200 overflow-hidden text-ellipsis whitespace-nowrap">{meeting.minutes.split('\n')[0] || meeting.title}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
                      查看
                    </button>
                    <button className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700">
                      匯出 PDF
                    </button>
                    <button
                      className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
                      onClick={() => handleDelete(meeting.id)}
                    >
                      刪除
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
              <span>第 {page} 頁，共 {pageCount} 頁</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  上一頁
                </button>
                <button
                  type="button"
                  disabled={page >= pageCount}
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  下一頁
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default MeetingsHistory;

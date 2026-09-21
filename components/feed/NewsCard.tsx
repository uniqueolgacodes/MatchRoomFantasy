// PRD §28.1 components/feed/ — NewsCard. Server-renderable.
import { timeAgo } from '@/lib/utils/format';

interface NewsCardProps {
  title: string;
  summary: string | null;
  source: string;
  url: string;
  publishedAt: string;
}

export function NewsCard({ title, summary, source, url, publishedAt }: NewsCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg bg-ink-soft px-4 py-3 transition-colors hover:bg-white/[0.07]"
    >
      <p className="text-xs font-medium text-white/40">
        {source} · {timeAgo(publishedAt)}
      </p>
      <p className="mt-1 text-sm font-semibold leading-snug">{title}</p>
      {summary && <p className="mt-1 line-clamp-2 text-xs text-white/50">{summary}</p>}
    </a>
  );
}

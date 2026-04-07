import { cn } from '@/lib/utils';

function syntaxHighlightJson(value: unknown) {
  const json = JSON.stringify(value, null, 2)
    ?? 'null';

  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildHighlightedMarkup(value: unknown) {
  return syntaxHighlightJson(value).replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let colorClass = 'text-sky-300';

      if (match.startsWith('"')) {
        colorClass = match.endsWith(':') ? 'text-slate-400' : 'text-emerald-300';
      } else if (match === 'true' || match === 'false') {
        colorClass = 'text-amber-300';
      } else if (match === 'null') {
        colorClass = 'text-fuchsia-300';
      }

      return `<span class="${colorClass}">${match}</span>`;
    }
  );
}

interface JsonPreviewProps {
  value: unknown;
  className?: string;
}

export function JsonPreview({ value, className }: JsonPreviewProps) {
  return (
    <pre
      className={cn(
        'overflow-x-auto rounded-[1.35rem] bg-[#0b1120] px-5 py-4 text-xs leading-6 shadow-inner shadow-black/30',
        className
      )}
    >
      <code dangerouslySetInnerHTML={{ __html: buildHighlightedMarkup(value) }} />
    </pre>
  );
}

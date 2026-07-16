'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface ArticleBodyProps {
  markdown: string;
  /** Editor preview uses slightly tighter spacing than the reading page. */
  compact?: boolean;
}

/**
 * The one renderer for article bodies — the public reading page and the
 * editor's Preview use it, so what the journalist previews is exactly what
 * readers get. Plain text is valid markdown (remark-breaks keeps the
 * single-newline paragraphs of the ~2300 pre-markdown stories rendering as
 * before), so legacy articles need no migration.
 */
export function ArticleBody({ markdown, compact = false }: ArticleBodyProps) {
  return (
    <div
      className={`font-serif text-text-primary ${
        compact ? 'text-[16px] leading-[1.7]' : 'text-[18px] leading-[1.8]'
      } [&>*+*]:mt-4 [&_a]:text-brand-text [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-brand [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-text-secondary [&_code]:rounded [&_code]:bg-bg-3 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_h1]:font-sans [&_h1]:text-h1 [&_h2]:font-sans [&_h2]:text-h2 [&_h3]:font-sans [&_h3]:text-h3 [&_hr]:border-border/10 [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-bg-3 [&_pre]:p-4 [&_pre]:text-[14px] [&_table]:w-full [&_td]:border [&_td]:border-border/10 [&_td]:px-2 [&_td]:py-1 [&_td]:text-[15px] [&_th]:border [&_th]:border-border/10 [&_th]:bg-bg-2 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-[14px] [&_ul]:list-disc`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{markdown}</ReactMarkdown>
    </div>
  );
}

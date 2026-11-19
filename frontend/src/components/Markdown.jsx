import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";

// Models often emit \( \) and \[ \] delimiters; remark-math expects $ and $$.
function normalizeMath(text) {
  return (text || "")
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`);
}

/** In-app paths ("/planner") navigate inside the SPA; everything else opens in a new tab. */
function SmartLink({ href = "", children, onNavigate, ...props }) {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link to={href} onClick={onNavigate}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  );
}

export default function Markdown({ children, className, onNavigate }) {
  return (
    <div className={cn("prose-ai text-fg", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={{
          // eslint-disable-next-line no-unused-vars
          a: ({ node, ...props }) => <SmartLink {...props} onNavigate={onNavigate} />,
        }}
      >
        {normalizeMath(children)}
      </ReactMarkdown>
    </div>
  );
}

/** Inline (single-paragraph) markdown, for quiz options and flashcards. */
export function InlineMarkdown({ children, className }) {
  return (
    <span className={cn("prose-ai [&_p]:inline", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={{ p: ({ children: c }) => <>{c}</> }}
      >
        {normalizeMath(children)}
      </ReactMarkdown>
    </span>
  );
}

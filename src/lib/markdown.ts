import { marked } from "marked";
import DOMPurify from "dompurify";

let highlighterReady = false;

/**
 * Render markdown to sanitized HTML. Runs entirely client-side — decrypted
 * content never leaves the browser. highlight.js is loaded lazily so it
 * stays out of the initial bundle.
 */
export async function renderMarkdown(source: string): Promise<string> {
  if (!highlighterReady) {
    const [{ default: hljs }, { markedHighlight }] = await Promise.all([
      import("highlight.js/lib/common"),
      import("marked-highlight"),
    ]);
    marked.use(
      markedHighlight({
        langPrefix: "hljs language-",
        highlight(code, lang) {
          if (lang && hljs.getLanguage(lang)) {
            try {
              return hljs.highlight(code, { language: lang }).value;
            } catch {
              /* fall through to auto */
            }
          }
          return hljs.highlightAuto(code).value;
        },
      }),
    );
    highlighterReady = true;
  }

  const html = await marked.parse(source, { gfm: true, breaks: true });
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["style", "form", "input", "iframe"],
    ADD_ATTR: ["target", "rel"],
  });
}

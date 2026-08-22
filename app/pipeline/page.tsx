import type { Metadata } from "next";
import { PipelineSlideshow } from "./pipeline-slideshow";

/**
 * `GET /pipeline` — the demo pipeline on its own, with no site chrome.
 *
 * Base44 embeds this the same way it embeds `/world/{slug}`:
 *
 *   <iframe src="https://<sites-host>/pipeline"
 *           title="How Plan-it works" loading="lazy"></iframe>
 *
 * It carries no event data, so there is nothing to redact and no slug to
 * leak — it is safe to embed anywhere, including a public landing page.
 */
export const metadata: Metadata = {
  title: "How Plan-it works",
  // Embedded surfaces should not compete with the real pages in search.
  robots: { index: false, follow: false },
};

export default function PipelinePage() {
  return (
    <main className="pipeline-embed">
      <PipelineSlideshow />
    </main>
  );
}

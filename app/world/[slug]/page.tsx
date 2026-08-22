import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createD1EventsRepository } from "../../../src/features/events/repository";
import { createWorldService } from "../../../src/features/world/service";
import { buildWorldSeed } from "../../../src/features/world/seed";
import { createWorldLabsAdapter } from "../../../src/integrations/worldlabs";
import { loadConfig, shouldUseRealAdapter, type EnvLike } from "../../../src/integrations/worldlabs/config";
import { planetSvg } from "../../../src/integrations/worldlabs/planet";
import { env } from "cloudflare:workers";
import { WorldCanvas } from "./world-canvas";

/**
 * `GET /world/{slug}` — the embeddable world canvas.
 *
 * This is the one URL Base44 needs. It carries no site navigation, no key
 * and no token; everything it shows comes from the public world state for
 * an unlisted event slug.
 *
 *   <iframe src="https://<sites-host>/world/EVENT_SLUG"
 *           title="Interactive event world" loading="lazy" allow="fullscreen"></iframe>
 *
 * Rendered on the server so the first paint is already the right scene —
 * the generated planet while Marble is still working, the real world once
 * it isn't — instead of a spinner that resolves a second later.
 */

type WorldPageProps = { params: Promise<{ slug: string }> };

function getServices() {
  const repository = createD1EventsRepository();
  return {
    repository,
    worldService: createWorldService({
      repository,
      adapter: () => createWorldLabsAdapter(env as unknown as EnvLike),
      isLive: () => shouldUseRealAdapter(loadConfig(env as unknown as EnvLike)),
    }),
  };
}

export const metadata: Metadata = {
  // An embedded canvas should never be indexed on its own.
  robots: { index: false, follow: false },
};

export default async function WorldPage({ params }: WorldPageProps) {
  const { slug } = await params;
  const { repository, worldService } = getServices();

  const state = await worldService.getPublicState(slug);
  if (!state) notFound();

  // The planet fallback is generated from the same seed the world was, so
  // the stand-in and the finished world belong to the same event rather
  // than being a generic placeholder.
  //
  // Built only when it can actually be shown: it is a ~70KB inline SVG, and
  // shipping it alongside a world that already has its own imagery would
  // more than double this page's payload for nothing.
  const hasRenderableWorld =
    state.world.status === "ready" &&
    state.world.live &&
    Boolean(state.world.panoUrl ?? state.world.thumbnailUrl);

  let fallbackSvg = "";
  if (!hasRenderableWorld) {
    const event = await repository.findEventBySlug(slug);
    if (event) {
      fallbackSvg = planetSvg(buildWorldSeed(event), {
        guests: state.presentation.attendeeCount || undefined,
        animate: true,
        width: 1280,
        height: 720,
      });
    }
  }

  return <WorldCanvas slug={slug} initialState={state} fallbackSvg={fallbackSvg} />;
}

import { PUBLIC_AUDIO_FALLBACKS } from "../../content-config";
import { readSiteContent } from "../../server-content";

export const dynamic = "force-dynamic";

export async function GET() {
  const content = await readSiteContent();
  const publicContent = {
    ...content,
    audio: Object.fromEntries(
      (Object.keys(content.audio) as Array<keyof typeof content.audio>).map(
        (slot) => {
          const track = content.audio[slot];
          return [
            slot,
            {
              name: track.name,
              fileName: track.fileName,
              volume: track.volume,
              hasCustomAudio: track.hasCustomAudio,
              sourceVersion: track.sourceVersion,
              src: track.hasCustomAudio
                ? `/api/audio/${slot}?v=${track.sourceVersion}`
                : PUBLIC_AUDIO_FALLBACKS[slot],
            },
          ];
        },
      ),
    ),
  };
  return Response.json(publicContent, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

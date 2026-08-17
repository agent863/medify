import {
  normalizeAdminContent,
  readSiteContent,
  requireAdminApi,
  writeSiteContent,
} from "../../../server-content";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  const content = await readSiteContent();
  return Response.json({ content, user: auth.user }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  try {
    const payload = await request.json();
    const current = await readSiteContent();
    const normalized = normalizeAdminContent(payload, current);
    const content = await writeSiteContent(normalized, auth.user.email);
    return Response.json({ content });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "儲存失敗" },
      { status: 400 },
    );
  }
}

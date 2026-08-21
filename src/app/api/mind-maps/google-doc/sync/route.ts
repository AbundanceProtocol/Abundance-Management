import { NextResponse } from "next/server";
import { getAuthState, resolveEffectiveUserId, unauthorized } from "@/lib/auth";
import { getDataStore } from "@/lib/dataStore/factory";
import { pushMindMapToGoogleDoc } from "@/lib/googleDocs";

/** POST — push a mind map's node tree into the reserved region of its linked Google Doc. */
export async function POST(request: Request) {
  const auth = getAuthState(request);
  if (!auth.canEdit) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { mapId?: unknown };
  const mapId = typeof body.mapId === "string" ? body.mapId : null;
  if (!mapId) return NextResponse.json({ error: "Missing mapId." }, { status: 400 });

  const store = await getDataStore();
  const userId = await resolveEffectiveUserId(request, store);
  if (!userId) return NextResponse.json({ error: "Could not resolve user." }, { status: 401 });

  const storedToken = await store.getGoogleOAuthToken(userId);
  if (!storedToken) {
    return NextResponse.json({ error: "Google is not connected. Connect it from Settings → Google Cal." }, { status: 400 });
  }

  const environment = await store.getMindMapsEnvironment();
  const map = environment.maps.find((m) => m.id === mapId);
  if (!map) return NextResponse.json({ error: "Mind map not found." }, { status: 404 });
  if (!map.googleDocUrl?.trim()) {
    return NextResponse.json({ error: "Set a Google Doc URL for this mind map first." }, { status: 400 });
  }

  try {
    const result = await pushMindMapToGoogleDoc(map, storedToken, store);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const status = (err as { code?: number })?.code;
    const rawMsg = err instanceof Error ? err.message : "Unknown error";
    const msg =
      status === 403 || /insufficient|scope/i.test(rawMsg)
        ? "Google denied access to Docs. Disconnect and reconnect Google in Settings to grant Docs access, and make sure the connected account can edit the doc."
        : status === 404
          ? "Google Doc not found. Check the URL and make sure the connected Google account can access it."
          : `Sync failed: ${rawMsg}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

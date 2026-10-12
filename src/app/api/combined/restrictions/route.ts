import { errorResponse, readJson, requireId } from "@/lib/api";
import { addTransferRestriction, deleteTransferRestriction } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const restriction = await addTransferRestriction({
      personAName: body.personAName,
      personBName: body.personBName,
    });
    return Response.json({ restriction }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await readJson(request);
    const restriction = await deleteTransferRestriction(requireId(body.id, "Restriction id"));
    return Response.json({ restriction });
  } catch (error) {
    return errorResponse(error);
  }
}

import { ApiError, errorResponse, readJson, requireId } from "@/lib/api";
import { getGroupDetail } from "@/lib/queries";
import { deleteGroup, updateGroup } from "@/lib/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const detail = await getGroupDetail(requireId(id, "Group id"));
    if (!detail) throw new ApiError("Group not found", 404);
    return Response.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    const group = await updateGroup(requireId(id, "Group id"), {
      name: body.name,
      description: body.description,
      currency: body.currency,
    });
    return Response.json({ group });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const group = await deleteGroup(requireId(id, "Group id"));
    return Response.json({ group });
  } catch (error) {
    return errorResponse(error);
  }
}

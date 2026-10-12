import { errorResponse, readJson, requireId } from "@/lib/api";
import { deleteMember, updateMember } from "@/lib/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    const member = await updateMember(requireId(id, "Member id"), {
      name: body.name,
      email: body.email,
      isSelf: body.isSelf,
    });
    return Response.json({ member });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const member = await deleteMember(requireId(id, "Member id"));
    return Response.json({ member });
  } catch (error) {
    return errorResponse(error);
  }
}

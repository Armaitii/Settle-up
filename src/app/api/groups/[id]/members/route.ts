import { errorResponse, readJson, requireId } from "@/lib/api";
import { addMember } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    const member = await addMember(requireId(id, "Group id"), {
      name: body.name,
      email: body.email,
      isSelf: body.isSelf,
    });
    return Response.json({ member }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

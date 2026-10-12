import { errorResponse, requireId } from "@/lib/api";
import { undoExpense } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const created = await undoExpense(requireId(id, "Entry id"));
    return Response.json({ created }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

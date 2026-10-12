import { errorResponse, readJson, requireId } from "@/lib/api";
import { deleteExpense, updateExpense } from "@/lib/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    const expense = await updateExpense(requireId(id, "Entry id"), {
      kind: body.kind,
      description: body.description,
      amount: body.amount,
      paidById: body.paidById,
      debtorId: body.debtorId,
      participantIds: body.participantIds,
      exactAmounts: body.exactAmounts,
      splitMode: body.splitMode,
      notes: body.notes,
      occurredOn: body.occurredOn,
    });
    return Response.json({ expense });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const expense = await deleteExpense(requireId(id, "Entry id"));
    return Response.json({ expense });
  } catch (error) {
    return errorResponse(error);
  }
}

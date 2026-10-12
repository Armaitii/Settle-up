import { errorResponse, readJson, requireId } from "@/lib/api";
import { getGroupDetail } from "@/lib/queries";
import { createExpense } from "@/lib/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const detail = await getGroupDetail(requireId(id, "Group id"));
    if (!detail) return Response.json({ expenses: [] });
    return Response.json({ expenses: detail.expenses, balances: detail.balances });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    const expense = await createExpense(requireId(id, "Group id"), {
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
    return Response.json({ expense }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

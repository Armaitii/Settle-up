import { errorResponse, readJson, requireId } from "@/lib/api";
import { deletePayment, updatePayment } from "@/lib/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    const payment = await updatePayment(requireId(id, "Payment id"), {
      fromMemberId: body.fromMemberId,
      toMemberId: body.toMemberId,
      amount: body.amount,
      note: body.note,
      occurredOn: body.occurredOn,
    });
    return Response.json({ payment });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payment = await deletePayment(requireId(id, "Payment id"));
    return Response.json({ payment });
  } catch (error) {
    return errorResponse(error);
  }
}

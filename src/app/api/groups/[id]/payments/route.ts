import { errorResponse, readJson, requireId } from "@/lib/api";
import { getGroupDetail } from "@/lib/queries";
import { createPayment } from "@/lib/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const detail = await getGroupDetail(requireId(id, "Group id"));
    if (!detail) return Response.json({ payments: [] });
    return Response.json({ payments: detail.payments, balances: detail.balances });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    const payment = await createPayment(requireId(id, "Group id"), {
      fromMemberId: body.fromMemberId,
      toMemberId: body.toMemberId,
      amount: body.amount,
      note: body.note,
      occurredOn: body.occurredOn,
    });
    return Response.json({ payment }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

import { errorResponse, requireId } from "@/lib/api";
import { getGroupDetail } from "@/lib/queries";
import { settlePlan } from "@/lib/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const detail = await getGroupDetail(requireId(id, "Group id"));
    if (!detail) return Response.json({ plan: { transfers: [] } });
    return Response.json({
      plan: detail.plan,
      balances: detail.balances,
      pairDebts: detail.pairDebts,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Records the whole simplified plan as payments in one go. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const rows = await settlePlan(requireId(id, "Group id"));
    return Response.json({ recorded: rows.length }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

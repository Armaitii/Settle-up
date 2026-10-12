import { errorResponse, requireId } from "@/lib/api";
import { undoPayment } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const payment = await undoPayment(requireId(id, "Payment id"));
    return Response.json({ payment }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

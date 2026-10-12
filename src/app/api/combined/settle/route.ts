import { errorResponse, readJson } from "@/lib/api";
import { recordCombinedTransfer, recordCombinedTransfers } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (Array.isArray(body.transfers)) {
      const recorded = await recordCombinedTransfers(
        body.transfers as { fromName: unknown; toName: unknown; amount: unknown }[],
      );
      return Response.json({ recorded: recorded.length }, { status: 201 });
    }
    const payment = await recordCombinedTransfer({
      fromName: body.fromName,
      toName: body.toName,
      amount: body.amount,
    });
    return Response.json({ payment }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

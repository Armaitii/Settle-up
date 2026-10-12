import { errorResponse } from "@/lib/api";
import { resetWorkspace, seedDemoData } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await seedDemoData();
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    await resetWorkspace();
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

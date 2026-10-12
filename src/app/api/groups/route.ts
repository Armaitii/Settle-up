import { errorResponse, readJson } from "@/lib/api";
import { createGroup } from "@/lib/service";
import { listGroups } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await listGroups();
    return Response.json({ groups: rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const group = await createGroup({
      name: body.name,
      description: body.description,
      currency: body.currency,
      yourName: body.yourName,
      memberNames: body.memberNames,
    });
    return Response.json({ group }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

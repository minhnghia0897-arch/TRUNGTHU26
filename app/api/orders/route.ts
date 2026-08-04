import { NextRequest, NextResponse } from "next/server";
import { createOrder, type CreateOrderInput } from "@/lib/orders/createOrder";

// POST /api/orders — tạo đơn (validate + snapshot giá/fx server-side).
export async function POST(req: NextRequest) {
  let body: CreateOrderInput;
  try {
    body = (await req.json()) as CreateOrderInput;
  } catch {
    return NextResponse.json({ ok: false, error: "Body không hợp lệ." }, { status: 400 });
  }

  const result = await createOrder(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

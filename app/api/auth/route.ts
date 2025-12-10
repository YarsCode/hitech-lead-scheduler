import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const correctPassword = process.env.FORM_PASSWORD || "123";

  if (password === correctPassword) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid password" }, { status: 401 });
}


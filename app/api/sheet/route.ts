import { NextResponse } from "next/server";
import { getSheetValues } from "@/lib/google-sheets";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") ?? undefined;

  try {
    const data = await getSheetValues(range);
    return NextResponse.json(data);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to read sheet data" },
      { status: 500 }
    );
  }
}

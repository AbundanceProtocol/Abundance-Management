import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthState, unauthorized } from "@/lib/auth";
import {
  DEFAULT_PAGES_ENVIRONMENT,
  PagesEnvironment,
} from "@/lib/pagesTypes";

const DOC_ID = "default";

type PagesEnvDoc = {
  _id: string;
  environment?: PagesEnvironment;
  updatedAt?: string;
  createdAt?: string;
};

export async function GET(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canRead) return unauthorized();

    const { db } = await connectToDatabase();
    const doc = await db.collection<PagesEnvDoc>("pages_environment").findOne({ _id: DOC_ID });
    const environment: PagesEnvironment = doc?.environment ?? DEFAULT_PAGES_ENVIRONMENT;
    return NextResponse.json(environment);
  } catch (error) {
    console.error("GET /api/pages error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pages environment" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = getAuthState(request);
    if (!auth.canEdit) return unauthorized();

    const { db } = await connectToDatabase();
    const environment = (await request.json()) as PagesEnvironment;
    const updatedAt = new Date().toISOString();

    await db.collection<PagesEnvDoc>("pages_environment").updateOne(
      { _id: DOC_ID },
      {
        $set: {
          environment,
          updatedAt,
        },
        $setOnInsert: {
          createdAt: updatedAt,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/pages error:", error);
    return NextResponse.json(
      { error: "Failed to update pages environment" },
      { status: 500 }
    );
  }
}

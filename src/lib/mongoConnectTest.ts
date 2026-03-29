import { MongoClient } from "mongodb";

export async function testMongoConnection(
  uri: string,
  dbName: string
): Promise<void> {
  const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.db(dbName).command({ ping: 1 });
  } finally {
    await client.close().catch(() => {});
  }
}
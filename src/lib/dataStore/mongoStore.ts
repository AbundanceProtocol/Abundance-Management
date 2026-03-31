import { MongoClient, Db, ObjectId } from "mongodb";
import type { AppDataStore, BackupPayload, ReorderItem, UserRecord } from "@/lib/dataStore/types";
import type { PagesEnvironment } from "@/lib/pagesTypes";
import type { MindMapsEnvironment } from "@/lib/mindMapTypes";
import type { NewTask, Section, TaskItem } from "@/lib/types";
import { readAppConfig } from "@/lib/appConfig";
import { DEFAULT_PAGES_ENVIRONMENT } from "@/lib/pagesTypes";
import { DEFAULT_MIND_MAPS_ENVIRONMENT } from "@/lib/mindMapTypes";
import { normalizeUrlsFromDoc } from "@/lib/taskUrls";
import { subtreeNodesPreorder } from "@/lib/duplicateTaskTree";

const DEFAULT_DB = "abundance-strategy";

function resolveUri(): string {
  const cfg = readAppConfig();
  if (cfg?.setupComplete === true && cfg.engine === "mongo" && cfg.mongoUri?.trim()) {
    return cfg.mongoUri.trim();
  }
  return process.env.MONGODB_URI || "mongodb://localhost:27017/abundance-strategy";
}

function resolveDbName(): string {
  const cfg = readAppConfig();
  if (cfg?.mongoDbName?.trim()) return cfg.mongoDbName.trim();
  return DEFAULT_DB;
}

let client: MongoClient | null = null;
let db: Db | null = null;
let cacheKey = "";

/** Close any cached Mongo connection (e.g. after database configuration reset). */
export async function disconnectMongoStore(): Promise<void> {
  if (client) await client.close().catch(() => {});
  client = null;
  db = null;
  cacheKey = "";
}

async function getDb(): Promise<Db> {
  const key = resolveUri() + "|" + resolveDbName();
  if (client && db && cacheKey === key) return db;
  if (client) await client.close().catch(() => {});
  client = await MongoClient.connect(resolveUri());
  db = client.db(resolveDbName());
  cacheKey = key;
  return db;
}

function mapSection(s: Section & { _id: ObjectId }): Section {
  return {
    ...s,
    _id: s._id.toString(),
    isSequential: s.isSequential ?? false,
    topLevelSort:
      (s as { topLevelSort?: string }).topLevelSort === "category"
        ? "manual"
        : (s.topLevelSort ?? "manual"),
    groupByCategory: s.groupByCategory ?? false,
  };
}

function mapTask(t: TaskItem & { _id: ObjectId; url?: string }): TaskItem {
  const plain = { ...t, _id: t._id.toString() } as TaskItem & { url?: string };
  const urls = normalizeUrlsFromDoc(plain);
  const { url: _legacy, ...rest } = plain;
  return { ...rest, urls } as TaskItem;
}

export async function createMongoStore(): Promise<AppDataStore> {
  const database = await getDb();

  return {
    async getSections({ ensureDefaultsIfEmpty }) {
      const col = database.collection<Section>("sections");
      let sections = await col.find().sort({ order: 1 }).toArray();
      if (sections.length === 0 && ensureDefaultsIfEmpty) {
        const defaults: Omit<Section, "_id">[] = [
          { title: "Product Launch", type: "project", order: 0, collapsed: false, isSequential: false, topLevelSort: "manual", groupByCategory: false },
          { title: "Recurring", type: "recurring", order: 1, collapsed: false, isSequential: false, topLevelSort: "manual", groupByCategory: false },
          { title: "To Do List", type: "todo", order: 2, collapsed: false, isSequential: false, topLevelSort: "manual", groupByCategory: false },
        ];
        const result = await col.insertMany(defaults.map((s) => ({ ...s, _id: new ObjectId() })) as never);
        const inserted = defaults.map((s, i) => ({
          ...s,
          _id: Object.values(result.insertedIds)[i].toString(),
        }));
        return inserted;
      }
      return sections.map((s) => mapSection(s as Section & { _id: ObjectId }));
    },

    async updateSection(id, patch) {
      await database.collection("sections").updateOne({ _id: new ObjectId(id) }, { $set: patch });
    },

    async getTasks(filter) {
      const f: Record<string, unknown> = {};
      if (filter?.sectionId) f.sectionId = filter.sectionId;
      const tasks = await database.collection<TaskItem>("tasks").find(f).sort({ order: 1 }).toArray();
      return tasks.map((t) => mapTask(t as TaskItem & { _id: ObjectId }));
    },

    async createTask(task) {
      const now = new Date().toISOString();
      const doc = { ...task, _id: new ObjectId(), createdAt: now, updatedAt: now };
      await database.collection("tasks").insertOne(doc);
      return { ...doc, _id: doc._id.toString() } as TaskItem;
    },

    async updateTask(id, update, unsetLegacyUrl) {
      const { _id, ...rest } = { _id: id, ...update };
      const updatedAt = new Date().toISOString();
      await database.collection("tasks").updateOne(
        { _id: new ObjectId(_id) },
        { $set: { ...rest, updatedAt }, ...(unsetLegacyUrl ? { $unset: { url: "" } } : {}) }
      );
    },

    async deleteTaskCascade(id) {
      await database.collection("tasks").deleteOne({ _id: new ObjectId(id) });
      await database.collection("tasks").deleteMany({ parentId: id });
    },

    async reorderTasks(items) {
      const ops = items.map((item) => ({
        updateOne: {
          filter: { _id: new ObjectId(item._id) },
          update: {
            $set: {
              order: item.order,
              parentId: item.parentId,
              depth: item.depth,
              sectionId: item.sectionId,
              updatedAt: new Date().toISOString(),
            },
          },
        },
      }));
      if (ops.length > 0) await database.collection("tasks").bulkWrite(ops);
    },

    async duplicateTaskSubtree(taskId) {
      const col = database.collection("tasks");
      if (!ObjectId.isValid(taskId)) throw new Error("Invalid task id");
      const rootRaw = await col.findOne({ _id: new ObjectId(taskId) });
      if (!rootRaw) throw new Error("Task not found");
      const root = mapTask(rootRaw as TaskItem & { _id: ObjectId });
      const sectionId = root.sectionId;
      const sectionDocs = await col.find({ sectionId }).toArray();
      const sectionTasks = sectionDocs.map((d) => mapTask(d as TaskItem & { _id: ObjectId }));
      const preorder = subtreeNodesPreorder(sectionTasks, root._id);
      if (preorder.length === 0) throw new Error("Nothing to duplicate");
      const now = new Date().toISOString();
      await col.updateMany(
        { sectionId, parentId: root.parentId ?? null, order: { $gt: root.order } },
        { $inc: { order: 1 } }
      );
      const idMap = new Map<string, ObjectId>();
      const docs: Record<string, unknown>[] = [];
      for (const t of preorder) {
        const newId = new ObjectId();
        idMap.set(t._id, newId);
        let newParentId: string | null;
        if (t._id === root._id) newParentId = root.parentId;
        else {
          const p = idMap.get(t.parentId!);
          if (!p) throw new Error("Invalid subtree parent chain");
          newParentId = p.toString();
        }
        const newOrder = t._id === root._id ? root.order + 1 : t.order;
        const baseTitle = (t.title ?? "").trim() || "Untitled";
        const title = t._id === root._id ? `${baseTitle} (copy)` : t.title ?? "";
        const { _id: _omitId, createdAt: _ca, updatedAt: _ua, ...rest } = t;
        docs.push({
          ...rest,
          _id: newId,
          sectionId: t.sectionId,
          parentId: newParentId,
          depth: t.depth,
          order: newOrder,
          title,
          notes: t.notes ?? "",
          recurringNotesPageId: null,
          recurringCompletionUntilIso: null,
          urls: [...(t.urls ?? [])],
          tags: [...(t.tags ?? [])],
          completionHistory: [...(t.completionHistory ?? [])],
          createdAt: now,
          updatedAt: now,
        });
      }
      if (docs.length > 0) await col.insertMany(docs as never);
      return { rootId: idMap.get(root._id)!.toString(), count: docs.length };
    },

    async getPagesEnvironment() {
      const doc = await database.collection<{ _id: string; environment?: PagesEnvironment }>("pages_environment").findOne({ _id: "default" });
      return doc?.environment ?? DEFAULT_PAGES_ENVIRONMENT;
    },

    async setPagesEnvironment(environment) {
      const updatedAt = new Date().toISOString();
      await database.collection("pages_environment").updateOne(
        { _id: "default" as unknown as ObjectId },
        { $set: { environment, updatedAt }, $setOnInsert: { createdAt: updatedAt } },
        { upsert: true }
      );
    },

    async getMindMapsEnvironment() {
      const doc = await database.collection<{ _id: string; environment?: MindMapsEnvironment }>("mind_maps_environment").findOne({ _id: "default" });
      return doc?.environment ?? DEFAULT_MIND_MAPS_ENVIRONMENT;
    },

    async setMindMapsEnvironment(environment) {
      const updatedAt = new Date().toISOString();
      await database.collection("mind_maps_environment").updateOne(
        { _id: "default" as unknown as ObjectId },
        { $set: { environment, updatedAt }, $setOnInsert: { createdAt: updatedAt } },
        { upsert: true }
      );
    },

    async backupExport() {
      const [sections, tasks, pagesDoc, mindMapsDoc] = await Promise.all([
        database.collection("sections").find().sort({ order: 1 }).toArray(),
        database.collection("tasks").find().sort({ order: 1 }).toArray(),
        database.collection("pages_environment").findOne({ _id: "default" as unknown as ObjectId }),
        database.collection("mind_maps_environment").findOne({ _id: "default" as unknown as ObjectId }),
      ]);
      const stringify = (doc: Record<string, unknown>) => {
        const { _id, ...rest } = doc;
        return { ...rest, _id: String(_id) };
      };
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        sections: sections.map((s) => stringify(s as Record<string, unknown>)),
        tasks: tasks.map((t) => stringify(t as Record<string, unknown>)),
        pagesEnvironment: pagesDoc ? (pagesDoc as Record<string, unknown>).environment ?? null : null,
        mindMapsEnvironment: mindMapsDoc ? (mindMapsDoc as Record<string, unknown>).environment ?? null : null,
      };
    },

    async backupImport(body) {
      await Promise.all([
        database.collection("sections").deleteMany({}),
        database.collection("tasks").deleteMany({}),
      ]);
      if (body.sections.length > 0) {
        const sectionDocs = body.sections.map((s: Record<string, unknown>) => {
          const { _id, ...rest } = s;
          return {
            ...rest,
            _id: ObjectId.isValid(String(_id)) ? new ObjectId(String(_id)) : new ObjectId(),
          };
        });
        await database.collection("sections").insertMany(sectionDocs);
      }
      if (body.tasks.length > 0) {
        const taskDocs = body.tasks.map((t: Record<string, unknown>) => {
          const { _id, ...rest } = t;
          return {
            ...rest,
            _id: ObjectId.isValid(String(_id)) ? new ObjectId(String(_id)) : new ObjectId(),
          };
        });
        await database.collection("tasks").insertMany(taskDocs);
      }
      if (body.pagesEnvironment != null) {
        await database.collection("pages_environment").updateOne(
          { _id: "default" as unknown as ObjectId },
          {
            $set: { environment: body.pagesEnvironment, updatedAt: new Date().toISOString() },
            $setOnInsert: { createdAt: new Date().toISOString() },
          },
          { upsert: true }
        );
      }
      if ((body as Record<string, unknown>).mindMapsEnvironment != null) {
        await database.collection("mind_maps_environment").updateOne(
          { _id: "default" as unknown as ObjectId },
          {
            $set: { environment: (body as Record<string, unknown>).mindMapsEnvironment, updatedAt: new Date().toISOString() },
            $setOnInsert: { createdAt: new Date().toISOString() },
          },
          { upsert: true }
        );
      }
    },

    async createUser(input) {
      const now = new Date().toISOString();
      const _id = new ObjectId();
      const doc = {
        _id,
        username: input.username.trim().toLowerCase(),
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash,
        role: input.role,
        createdAt: now,
      };
      await database.collection("users").insertOne(doc);
      return { _id: _id.toString(), username: doc.username, email: doc.email, passwordHash: doc.passwordHash, role: doc.role, createdAt: doc.createdAt };
    },

    async findUserByUsername(username) {
      const u = await database.collection<UserRecord & { _id: ObjectId }>("users").findOne({ username: username.trim().toLowerCase() });
      if (!u) return null;
      return { ...u, _id: u._id.toString() };
    },

    async findUserByEmail(email) {
      const u = await database.collection<UserRecord & { _id: ObjectId }>("users").findOne({ email: email.trim().toLowerCase() });
      if (!u) return null;
      return { ...u, _id: u._id.toString() };
    },

    async updateUserPasswordHash(userId, passwordHash) {
      await database.collection("users").updateOne({ _id: new ObjectId(userId) }, { $set: { passwordHash } });
    },

    async savePasswordResetToken(input) {
      await database.collection("password_reset_tokens").insertOne({
        _id: new ObjectId(input.id),
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      });
    },

    async consumePasswordResetToken(tokenHash) {
      const doc = await database.collection<{ userId: string; tokenHash: string; expiresAt: string }>("password_reset_tokens").findOne({ tokenHash });
      if (!doc) return null;
      if (new Date(doc.expiresAt) < new Date()) return null;
      await database.collection("password_reset_tokens").deleteMany({ tokenHash });
      return { userId: doc.userId };
    },

    async resetApplicationData() {
      await Promise.all([
        database.collection("sections").deleteMany({}),
        database.collection("tasks").deleteMany({}),
      ]);
      const updatedAt = new Date().toISOString();
      await Promise.all([
        database.collection("pages_environment").updateOne(
          { _id: "default" as unknown as ObjectId },
          {
            $set: { environment: DEFAULT_PAGES_ENVIRONMENT, updatedAt },
            $setOnInsert: { createdAt: updatedAt },
          },
          { upsert: true }
        ),
        database.collection("mind_maps_environment").updateOne(
          { _id: "default" as unknown as ObjectId },
          {
            $set: { environment: DEFAULT_MIND_MAPS_ENVIRONMENT, updatedAt },
            $setOnInsert: { createdAt: updatedAt },
          },
          { upsert: true }
        ),
      ]);
    },

    async findUserById(userId) {
      if (!ObjectId.isValid(userId)) return null;
      const u = await database.collection("users").findOne({ _id: new ObjectId(userId) });
      if (!u) return null;
      const doc = u as UserRecord & { _id: ObjectId };
      return { ...doc, _id: doc._id.toString() };
    },

    async updateUserCredentials(userId, fields) {
      const set: Record<string, string> = {};
      if (fields.username != null) set.username = fields.username.trim().toLowerCase();
      if (fields.passwordHash != null) set.passwordHash = fields.passwordHash;
      if (Object.keys(set).length === 0) return;
      await database.collection("users").updateOne(
        { _id: new ObjectId(userId) },
        { $set: set }
      );
    },
  };
}

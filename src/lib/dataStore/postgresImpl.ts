import { randomUUID } from "crypto";
import type { Pool } from "pg";
import type { AppDataStore, BackupPayload, ReorderItem, UserRecord } from "@/lib/dataStore/types";
import type { PagesEnvironment } from "@/lib/pagesTypes";
import type { MindMapsEnvironment } from "@/lib/mindMapTypes";
import type { NewTask, Section, TaskItem } from "@/lib/types";
import { DEFAULT_PAGES_ENVIRONMENT } from "@/lib/pagesTypes";
import { DEFAULT_MIND_MAPS_ENVIRONMENT } from "@/lib/mindMapTypes";
import { normalizeUrlsFromDoc } from "@/lib/taskUrls";
import { subtreeNodesPreorder } from "@/lib/duplicateTaskTree";

function sortSections(list: Section[]) {
  return [...list].sort((a, b) => a.order - b.order);
}

function sortTasks(list: TaskItem[]) {
  return [...list].sort((a, b) => a.order - b.order || a._id.localeCompare(b._id));
}

function mapTaskJson(row: TaskItem & { url?: string }): TaskItem {
  const urls = normalizeUrlsFromDoc(row);
  const { url: _legacy, ...rest } = row;
  return { ...rest, urls } as TaskItem;
}

function parseDoc<T>(v: unknown): T {
  if (v == null) return v as T;
  if (typeof v === "string") return JSON.parse(v) as T;
  return v as T;
}

export function buildPostgresDataStore(pool: Pool): AppDataStore {
  return {
    async getSections({ ensureDefaultsIfEmpty }) {
      const { rows } = await pool.query<{ id: string; doc: unknown }>("SELECT id, doc FROM sections");
      let list = rows.map((r) => parseDoc<Section>(r.doc));
      if (list.length === 0 && ensureDefaultsIfEmpty) {
        const defaults: Omit<Section, "_id">[] = [
          {
            title: "Product Launch",
            type: "project",
            order: 0,
            collapsed: false,
            isSequential: false,
            topLevelSort: "manual",
            groupByCategory: false,
          },
          {
            title: "Recurring",
            type: "recurring",
            order: 1,
            collapsed: false,
            isSequential: false,
            topLevelSort: "manual",
            groupByCategory: false,
          },
          {
            title: "To Do List",
            type: "todo",
            order: 2,
            collapsed: false,
            isSequential: false,
            topLevelSort: "manual",
            groupByCategory: false,
          },
        ];
        const inserted: Section[] = [];
        for (const s of defaults) {
          const id = randomUUID();
          const sec: Section = { ...s, _id: id };
          await pool.query("INSERT INTO sections (id, doc) VALUES ($1, $2::jsonb)", [
            id,
            JSON.stringify(sec),
          ]);
          inserted.push(sec);
        }
        return inserted;
      }
      list = sortSections(list);
      return list.map((s) => ({
        ...s,
        isSequential: s.isSequential ?? false,
        topLevelSort:
          (s as { topLevelSort?: string }).topLevelSort === "category"
            ? "manual"
            : (s.topLevelSort ?? "manual"),
        groupByCategory: s.groupByCategory ?? false,
      }));
    },

    async updateSection(id, patch) {
      const { rows } = await pool.query<{ doc: unknown }>("SELECT doc FROM sections WHERE id = $1", [id]);
      const row = rows[0];
      if (!row) return;
      const cur = parseDoc<Section>(row.doc);
      const next = { ...cur, ...patch, _id: id };
      await pool.query("UPDATE sections SET doc = $1::jsonb WHERE id = $2", [
        JSON.stringify(next),
        id,
      ]);
    },

    async getTasks(filter) {
      let q = "SELECT id, doc FROM tasks";
      const params: string[] = [];
      if (filter?.sectionId) {
        q += " WHERE doc->>'sectionId' = $1";
        params.push(filter.sectionId);
      }
      const { rows } = await pool.query<{ id: string; doc: unknown }>(q, params);
      return sortTasks(
        rows.map((r) => mapTaskJson(parseDoc<TaskItem & { url?: string }>(r.doc)))
      );
    },

    async createTask(task: NewTask) {
      const now = new Date().toISOString();
      const id = randomUUID();
      const doc: TaskItem = { ...task, _id: id, createdAt: now, updatedAt: now };
      await pool.query("INSERT INTO tasks (id, doc) VALUES ($1, $2::jsonb)", [
        id,
        JSON.stringify(doc),
      ]);
      return doc;
    },

    async updateTask(id, update, unsetLegacyUrl) {
      const { rows } = await pool.query<{ doc: unknown }>("SELECT doc FROM tasks WHERE id = $1", [id]);
      const row = rows[0];
      if (!row) return;
      const cur = parseDoc<TaskItem & { url?: string }>(row.doc);
      const { _id: _i, ...rest } = update as Partial<TaskItem> & { _id?: string };
      const next = {
        ...cur,
        ...rest,
        _id: id,
        updatedAt: new Date().toISOString(),
      } as TaskItem & { url?: string };
      if (unsetLegacyUrl) delete (next as { url?: string }).url;
      await pool.query("UPDATE tasks SET doc = $1::jsonb WHERE id = $2", [
        JSON.stringify(next),
        id,
      ]);
    },

    async deleteTaskCascade(id) {
      await pool.query("DELETE FROM tasks WHERE id = $1 OR doc->>'parentId' = $1", [id]);
    },

    async reorderTasks(items: ReorderItem[]) {
      const now = new Date().toISOString();
      for (const item of items) {
        const { rows } = await pool.query<{ doc: unknown }>(
          "SELECT doc FROM tasks WHERE id = $1",
          [item._id]
        );
        const row = rows[0];
        if (!row) continue;
        const cur = parseDoc<TaskItem>(row.doc);
        const next = {
          ...cur,
          order: item.order,
          parentId: item.parentId,
          depth: item.depth,
          sectionId: item.sectionId,
          updatedAt: now,
        };
        await pool.query("UPDATE tasks SET doc = $1::jsonb WHERE id = $2", [
          JSON.stringify(next),
          item._id,
        ]);
      }
    },

    async duplicateTaskSubtree(taskId) {
      const { rows } = await pool.query<{ id: string; doc: unknown }>("SELECT id, doc FROM tasks");
      const sectionTasks = rows.map((r) =>
        mapTaskJson(parseDoc<TaskItem & { url?: string }>(r.doc))
      );
      const root = sectionTasks.find((t) => t._id === taskId);
      if (!root) throw new Error("Task not found");
      const preorder = subtreeNodesPreorder(sectionTasks, root._id);
      if (preorder.length === 0) throw new Error("Nothing to duplicate");
      const now = new Date().toISOString();
      const shiftSiblings = sectionTasks.filter(
        (t) =>
          t.sectionId === root.sectionId &&
          t.parentId === root.parentId &&
          t.order > root.order
      );
      for (const s of shiftSiblings) {
        const { rows: r2 } = await pool.query<{ doc: unknown }>(
          "SELECT doc FROM tasks WHERE id = $1",
          [s._id]
        );
        const row = r2[0];
        if (!row) continue;
        const cur = parseDoc<TaskItem>(row.doc);
        const next = { ...cur, order: cur.order + 1, updatedAt: now };
        await pool.query("UPDATE tasks SET doc = $1::jsonb WHERE id = $2", [
          JSON.stringify(next),
          s._id,
        ]);
      }
      const idMap = new Map<string, string>();
      const docs: TaskItem[] = [];
      for (const t of preorder) {
        const newId = randomUUID();
        idMap.set(t._id, newId);
        let newParentId: string | null;
        if (t._id === root._id) newParentId = root.parentId;
        else {
          const p = idMap.get(t.parentId!);
          if (!p) throw new Error("Invalid subtree parent chain");
          newParentId = p;
        }
        const newOrder = t._id === root._id ? root.order + 1 : t.order;
        const baseTitle = (t.title ?? "").trim() || "Untitled";
        const title = t._id === root._id ? `${baseTitle} (copy)` : t.title ?? "";
        const { _id: _o, createdAt: _c, updatedAt: _u, ...rest } = t;
        const doc: TaskItem = {
          ...(rest as TaskItem),
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
        };
        docs.push(doc);
      }
      for (const d of docs) {
        await pool.query("INSERT INTO tasks (id, doc) VALUES ($1, $2::jsonb)", [
          d._id,
          JSON.stringify(d),
        ]);
      }
      return { rootId: idMap.get(root._id)!, count: docs.length };
    },
    async getPagesEnvironment() {
      const { rows } = await pool.query<{ doc: unknown }>(
        "SELECT doc FROM pages_environment WHERE id = 'default'"
      );
      const row = rows[0];
      if (!row) return DEFAULT_PAGES_ENVIRONMENT;
      return parseDoc<PagesEnvironment>(row.doc);
    },

    async setPagesEnvironment(environment) {
      const updatedAt = new Date().toISOString();
      await pool.query(
        `INSERT INTO pages_environment (id, doc, updated_at) VALUES ('default', $1::jsonb, $2)
         ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
        [JSON.stringify(environment), updatedAt]
      );
    },

    async getMindMapsEnvironment() {
      const { rows } = await pool.query<{ doc: unknown }>(
        "SELECT doc FROM mind_maps_environment WHERE id = 'default'"
      );
      const row = rows[0];
      if (!row) return DEFAULT_MIND_MAPS_ENVIRONMENT;
      return parseDoc<MindMapsEnvironment>(row.doc);
    },

    async setMindMapsEnvironment(environment) {
      const updatedAt = new Date().toISOString();
      await pool.query(
        `INSERT INTO mind_maps_environment (id, doc, updated_at) VALUES ('default', $1::jsonb, $2)
         ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
        [JSON.stringify(environment), updatedAt]
      );
    },

    async backupExport() {
      const [sec, task, page, mindMaps] = await Promise.all([
        pool.query<{ id: string; doc: unknown }>("SELECT id, doc FROM sections"),
        pool.query<{ id: string; doc: unknown }>("SELECT id, doc FROM tasks"),
        pool.query<{ doc: unknown }>("SELECT doc FROM pages_environment WHERE id = 'default'"),
        pool.query<{ doc: unknown }>("SELECT doc FROM mind_maps_environment WHERE id = 'default'"),
      ]);
      const stringify = (id: string, obj: Record<string, unknown>) => {
        const { _id, ...rest } = obj;
        return { ...rest, _id: id };
      };
      const pageRow = page.rows[0];
      const mindMapsRow = mindMaps.rows[0];
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        sections: sec.rows.map((r) =>
          stringify(r.id, parseDoc<Record<string, unknown>>(r.doc))
        ),
        tasks: task.rows.map((r) =>
          stringify(r.id, parseDoc<Record<string, unknown>>(r.doc))
        ),
        pagesEnvironment: pageRow ? parseDoc<unknown>(pageRow.doc) : null,
        mindMapsEnvironment: mindMapsRow ? parseDoc<unknown>(mindMapsRow.doc) : null,
      } as BackupPayload;
    },

    async backupImport(body) {
      await pool.query("DELETE FROM sections");
      await pool.query("DELETE FROM tasks");
      for (const s of body.sections) {
        const id = String((s as { _id?: string })._id || randomUUID());
        const { _id, ...rest } = s as Record<string, unknown>;
        await pool.query("INSERT INTO sections (id, doc) VALUES ($1, $2::jsonb)", [
          id,
          JSON.stringify({ ...rest, _id: id }),
        ]);
      }
      for (const t of body.tasks) {
        const id = String((t as { _id?: string })._id || randomUUID());
        const { _id, ...rest } = t as Record<string, unknown>;
        await pool.query("INSERT INTO tasks (id, doc) VALUES ($1, $2::jsonb)", [
          id,
          JSON.stringify({ ...rest, _id: id }),
        ]);
      }
      if (body.pagesEnvironment != null) {
        const updatedAt = new Date().toISOString();
        await pool.query(
          `INSERT INTO pages_environment (id, doc, updated_at) VALUES ('default', $1::jsonb, $2)
           ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
          [JSON.stringify(body.pagesEnvironment), updatedAt]
        );
      }
      if ((body as Record<string, unknown>).mindMapsEnvironment != null) {
        const updatedAt = new Date().toISOString();
        await pool.query(
          `INSERT INTO mind_maps_environment (id, doc, updated_at) VALUES ('default', $1::jsonb, $2)
           ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
          [JSON.stringify((body as Record<string, unknown>).mindMapsEnvironment), updatedAt]
        );
      }
    },

    async resetApplicationData() {
      await pool.query("DELETE FROM sections");
      await pool.query("DELETE FROM tasks");
      const updatedAt = new Date().toISOString();
      await pool.query(
        `INSERT INTO pages_environment (id, doc, updated_at) VALUES ('default', $1::jsonb, $2)
         ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
        [JSON.stringify(DEFAULT_PAGES_ENVIRONMENT), updatedAt]
      );
      await pool.query(
        `INSERT INTO mind_maps_environment (id, doc, updated_at) VALUES ('default', $1::jsonb, $2)
         ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = EXCLUDED.updated_at`,
        [JSON.stringify(DEFAULT_MIND_MAPS_ENVIRONMENT), updatedAt]
      );
    },

    async findUserById(userId) {
      const { rows } = await pool.query<{
        id: string;
        username: string;
        email: string;
        password_hash: string;
        role: string;
        created_at: string;
      }>("SELECT * FROM users WHERE id = $1", [userId]);
      const row = rows[0];
      if (!row) return null;
      return {
        _id: row.id,
        username: row.username,
        email: row.email,
        passwordHash: row.password_hash,
        role: row.role as UserRecord["role"],
        createdAt: row.created_at,
      };
    },

    async createUser(input) {
      const id = randomUUID();
      const now = new Date().toISOString();
      const username = input.username.trim().toLowerCase();
      const email = input.email.trim().toLowerCase();
      await pool.query(
        "INSERT INTO users (id, username, email, password_hash, role, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [id, username, email, input.passwordHash, input.role, now]
      );
      return {
        _id: id,
        username,
        email,
        passwordHash: input.passwordHash,
        role: input.role,
        createdAt: now,
      };
    },

    async findUserByUsername(username) {
      const { rows } = await pool.query<{
        id: string;
        username: string;
        email: string;
        password_hash: string;
        role: string;
        created_at: string;
      }>("SELECT * FROM users WHERE username = $1", [username.trim().toLowerCase()]);
      const row = rows[0];
      if (!row) return null;
      return {
        _id: row.id,
        username: row.username,
        email: row.email,
        passwordHash: row.password_hash,
        role: row.role as UserRecord["role"],
        createdAt: row.created_at,
      };
    },

    async findUserByEmail(email) {
      const { rows } = await pool.query<{
        id: string;
        username: string;
        email: string;
        password_hash: string;
        role: string;
        created_at: string;
      }>("SELECT * FROM users WHERE lower(email) = lower($1)", [email.trim()]);
      const row = rows[0];
      if (!row) return null;
      return {
        _id: row.id,
        username: row.username,
        email: row.email,
        passwordHash: row.password_hash,
        role: row.role as UserRecord["role"],
        createdAt: row.created_at,
      };
    },

    async updateUserPasswordHash(userId, passwordHash) {
      await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        passwordHash,
        userId,
      ]);
    },

    async updateUserCredentials(userId, fields) {
      if (fields.username != null) {
        await pool.query("UPDATE users SET username = $1 WHERE id = $2", [
          fields.username.trim().toLowerCase(),
          userId,
        ]);
      }
      if (fields.passwordHash != null) {
        await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
          fields.passwordHash,
          userId,
        ]);
      }
    },

    async savePasswordResetToken(input) {
      await pool.query(
        "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)",
        [input.id, input.userId, input.tokenHash, input.expiresAt]
      );
    },

    async consumePasswordResetToken(tokenHash) {
      const { rows } = await pool.query<{ user_id: string; expires_at: string }>(
        "SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = $1",
        [tokenHash]
      );
      const row = rows[0];
      if (!row) return null;
      if (new Date(row.expires_at) < new Date()) return null;
      await pool.query("DELETE FROM password_reset_tokens WHERE token_hash = $1", [tokenHash]);
      return { userId: row.user_id };
    },
  };
}

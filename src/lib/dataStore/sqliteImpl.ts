import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import type { AppDataStore, BackupPayload, ReorderItem, UserRecord } from "@/lib/dataStore/types";
import type { PagesEnvironment } from "@/lib/pagesTypes";
import type { NewTask, Section, TaskItem } from "@/lib/types";
import { DEFAULT_PAGES_ENVIRONMENT } from "@/lib/pagesTypes";
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

export function buildSqliteDataStore(db: Database.Database): AppDataStore {
  const selSections = db.prepare("SELECT id, doc FROM sections");
  const insSection = db.prepare("INSERT INTO sections (id, doc) VALUES (?, ?)");
  const updSection = db.prepare("UPDATE sections SET doc = ? WHERE id = ?");
  const delAllSections = db.prepare("DELETE FROM sections");
  const selTasks = db.prepare("SELECT id, doc FROM tasks");
  const insTask = db.prepare("INSERT INTO tasks (id, doc) VALUES (?, ?)");
  const updTask = db.prepare("UPDATE tasks SET doc = ? WHERE id = ?");
  const delTask = db.prepare("DELETE FROM tasks WHERE id = ?");
  const delTasksByParent = db.prepare(
    "DELETE FROM tasks WHERE json_extract(doc, '$.parentId') = ?"
  );
  const delAllTasks = db.prepare("DELETE FROM tasks");
  const selPage = db.prepare("SELECT doc FROM pages_environment WHERE id = 'default'");
  const upsertPage = db.prepare(
    `INSERT INTO pages_environment (id, doc, updated_at) VALUES ('default', ?, ?)
     ON CONFLICT(id) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`
  );
  const insUser = db.prepare(
    "INSERT INTO users (id, username, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const selUserByUser = db.prepare("SELECT * FROM users WHERE username = ?");
  const selUserById = db.prepare("SELECT * FROM users WHERE id = ?");
  const updUserPw = db.prepare("UPDATE users SET password_hash = ? WHERE id = ?");
  const updUsername = db.prepare("UPDATE users SET username = ? WHERE id = ?");
  const insTok = db.prepare(
    "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)"
  );
  const selTok = db.prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ?");
  const delTok = db.prepare("DELETE FROM password_reset_tokens WHERE token_hash = ?");

  return {
    async getSections({ ensureDefaultsIfEmpty }) {
      const rows = selSections.all() as { id: string; doc: string }[];
      let list = rows.map((r) => JSON.parse(r.doc) as Section);
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
          insSection.run(id, JSON.stringify(sec));
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
      const row = db.prepare("SELECT doc FROM sections WHERE id = ?").get(id) as
        | { doc: string }
        | undefined;
      if (!row) return;
      const cur = JSON.parse(row.doc) as Section;
      const next = { ...cur, ...patch, _id: id };
      updSection.run(JSON.stringify(next), id);
    },

    async getTasks(filter) {
      const rows = selTasks.all() as { id: string; doc: string }[];
      let list = rows.map((r) =>
        mapTaskJson(JSON.parse(r.doc) as TaskItem & { url?: string })
      );
      if (filter?.sectionId) list = list.filter((t) => t.sectionId === filter.sectionId);
      return sortTasks(list);
    },

    async createTask(task: NewTask) {
      const now = new Date().toISOString();
      const id = randomUUID();
      const doc: TaskItem = { ...task, _id: id, createdAt: now, updatedAt: now };
      insTask.run(id, JSON.stringify(doc));
      return doc;
    },

    async updateTask(id, update, unsetLegacyUrl) {
      const row = db.prepare("SELECT doc FROM tasks WHERE id = ?").get(id) as
        | { doc: string }
        | undefined;
      if (!row) return;
      const cur = JSON.parse(row.doc) as TaskItem & { url?: string };
      const { _id: _i, ...rest } = update as Partial<TaskItem> & { _id?: string };
      const next = {
        ...cur,
        ...rest,
        _id: id,
        updatedAt: new Date().toISOString(),
      } as TaskItem & { url?: string };
      if (unsetLegacyUrl) delete (next as { url?: string }).url;
      updTask.run(JSON.stringify(next), id);
    },

    async deleteTaskCascade(id) {
      delTask.run(id);
      delTasksByParent.run(id);
    },

    async reorderTasks(items: ReorderItem[]) {
      const now = new Date().toISOString();
      for (const item of items) {
        const row = db.prepare("SELECT doc FROM tasks WHERE id = ?").get(item._id) as
          | { doc: string }
          | undefined;
        if (!row) continue;
        const cur = JSON.parse(row.doc) as TaskItem;
        const next = {
          ...cur,
          order: item.order,
          parentId: item.parentId,
          depth: item.depth,
          sectionId: item.sectionId,
          updatedAt: now,
        };
        updTask.run(JSON.stringify(next), item._id);
      }
    },

    async duplicateTaskSubtree(taskId) {
      const rows = selTasks.all() as { id: string; doc: string }[];
      const sectionTasks = rows.map((r) =>
        mapTaskJson(JSON.parse(r.doc) as TaskItem & { url?: string })
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
        const row = db.prepare("SELECT doc FROM tasks WHERE id = ?").get(s._id) as {
          doc: string;
        };
        const cur = JSON.parse(row.doc) as TaskItem;
        const next = { ...cur, order: cur.order + 1, updatedAt: now };
        updTask.run(JSON.stringify(next), s._id);
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
      for (const d of docs) insTask.run(d._id, JSON.stringify(d));
      return { rootId: idMap.get(root._id)!, count: docs.length };
    },
    async getPagesEnvironment() {
      const row = selPage.get() as { doc: string } | undefined;
      if (!row) return DEFAULT_PAGES_ENVIRONMENT;
      return JSON.parse(row.doc) as PagesEnvironment;
    },

    async setPagesEnvironment(environment) {
      upsertPage.run(JSON.stringify(environment), new Date().toISOString());
    },

    async backupExport() {
      const secRows = selSections.all() as { id: string; doc: string }[];
      const taskRows = selTasks.all() as { id: string; doc: string }[];
      const pageRow = selPage.get() as { doc: string } | undefined;
      const stringify = (id: string, obj: Record<string, unknown>) => {
        const { _id, ...rest } = obj;
        return { ...rest, _id: id };
      };
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        sections: secRows.map((r) => stringify(r.id, JSON.parse(r.doc) as Record<string, unknown>)),
        tasks: taskRows.map((r) => stringify(r.id, JSON.parse(r.doc) as Record<string, unknown>)),
        pagesEnvironment: pageRow ? JSON.parse(pageRow.doc) : null,
      } as BackupPayload;
    },

    async backupImport(body) {
      delAllSections.run();
      delAllTasks.run();
      for (const s of body.sections) {
        const id = String((s as { _id?: string })._id || randomUUID());
        const { _id, ...rest } = s as Record<string, unknown>;
        insSection.run(id, JSON.stringify({ ...rest, _id: id }));
      }
      for (const t of body.tasks) {
        const id = String((t as { _id?: string })._id || randomUUID());
        const { _id, ...rest } = t as Record<string, unknown>;
        insTask.run(id, JSON.stringify({ ...rest, _id: id }));
      }
      if (body.pagesEnvironment != null) {
        upsertPage.run(JSON.stringify(body.pagesEnvironment), new Date().toISOString());
      }
    },

    async createUser(input) {
      const id = randomUUID();
      const now = new Date().toISOString();
      const username = input.username.trim().toLowerCase();
      const email = input.email.trim().toLowerCase();
      insUser.run(id, username, email, input.passwordHash, input.role, now);
      return {
        _id: id,
        username,
        email,
        passwordHash: input.passwordHash,
        role: input.role,
        createdAt: now,
      };
    },

    async resetApplicationData() {
      delAllSections.run();
      delAllTasks.run();
      upsertPage.run(JSON.stringify(DEFAULT_PAGES_ENVIRONMENT), new Date().toISOString());
    },

    async findUserById(userId) {
      const row = selUserById.get(userId) as
        | {
            id: string;
            username: string;
            email: string;
            password_hash: string;
            role: string;
            created_at: string;
          }
        | undefined;
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

    async findUserByUsername(username) {
      const row = selUserByUser.get(username.trim().toLowerCase()) as
        | {
            id: string;
            username: string;
            email: string;
            password_hash: string;
            role: string;
            created_at: string;
          }
        | undefined;
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
      const row = db
        .prepare("SELECT * FROM users WHERE lower(email) = lower(?)")
        .get(email.trim()) as
        | {
            id: string;
            username: string;
            email: string;
            password_hash: string;
            role: string;
            created_at: string;
          }
        | undefined;
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
      updUserPw.run(passwordHash, userId);
    },

    async updateUserCredentials(userId, fields) {
      if (fields.username != null) {
        updUsername.run(fields.username.trim().toLowerCase(), userId);
      }
      if (fields.passwordHash != null) {
        updUserPw.run(fields.passwordHash, userId);
      }
    },

    async savePasswordResetToken(input) {
      insTok.run(input.id, input.userId, input.tokenHash, input.expiresAt);
    },

    async consumePasswordResetToken(tokenHash) {
      const row = selTok.get(tokenHash) as
        | { user_id: string; expires_at: string }
        | undefined;
      if (!row) return null;
      if (new Date(row.expires_at) < new Date()) return null;
      delTok.run(tokenHash);
      return { userId: row.user_id };
    },
  };
}

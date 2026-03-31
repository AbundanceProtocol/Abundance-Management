import type { PagesEnvironment } from "@/lib/pagesTypes";
import type { MindMapsEnvironment } from "@/lib/mindMapTypes";
import type { NewTask, Section, TaskItem } from "@/lib/types";

export type ReorderItem = {
  _id: string;
  order: number;
  parentId: string | null;
  depth: number;
  sectionId: string;
};

export type UserRecord = {
  _id: string;
  username: string;
  passwordHash: string;
  email: string;
  role: "admin" | "viewer";
  createdAt: string;
};

export type BackupPayload = {
  version: number;
  exportedAt: string;
  sections: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  pagesEnvironment: unknown | null;
  mindMapsEnvironment: unknown | null;
};

export interface AppDataStore {
  getSections(options: { ensureDefaultsIfEmpty: boolean }): Promise<Section[]>;
  updateSection(id: string, patch: Partial<Section>): Promise<void>;
  getTasks(filter?: { sectionId?: string | null }): Promise<TaskItem[]>;
  createTask(task: NewTask): Promise<TaskItem>;
  updateTask(id: string, patch: Partial<TaskItem>, unsetLegacyUrl: boolean): Promise<void>;
  deleteTaskCascade(id: string): Promise<void>;
  reorderTasks(updates: ReorderItem[]): Promise<void>;
  duplicateTaskSubtree(taskId: string): Promise<{ rootId: string; count: number }>;
  getPagesEnvironment(): Promise<PagesEnvironment>;
  setPagesEnvironment(env: PagesEnvironment): Promise<void>;
  getMindMapsEnvironment(): Promise<MindMapsEnvironment>;
  setMindMapsEnvironment(env: MindMapsEnvironment): Promise<void>;
  backupExport(): Promise<BackupPayload>;
  backupImport(body: {
    version: number;
    sections: Record<string, unknown>[];
    tasks: Record<string, unknown>[];
    pagesEnvironment?: unknown | null;
    mindMapsEnvironment?: unknown | null;
  }): Promise<void>;
  createUser(input: {
    username: string;
    email: string;
    passwordHash: string;
    role: "admin" | "viewer";
  }): Promise<UserRecord>;
  findUserByUsername(username: string): Promise<UserRecord | null>;
  findUserById(userId: string): Promise<UserRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  updateUserPasswordHash(userId: string, passwordHash: string): Promise<void>;
  updateUserCredentials(
    userId: string,
    fields: { username?: string; passwordHash?: string }
  ): Promise<void>;
  /** Deletes all sections and tasks and restores default pages environment. Does not remove users. */
  resetApplicationData(): Promise<void>;
  savePasswordResetToken(input: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void>;
  consumePasswordResetToken(tokenHash: string): Promise<{ userId: string } | null>;
}

import { Injectable, Logger } from '@nestjs/common';
import { google, tasks_v1 } from 'googleapis';
import { AccountsService } from '../accounts/accounts.service';
import { AuthService } from '../auth/auth.service';
import { GoogleAccount } from '../accounts/account.entity';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly accountsService: AccountsService,
    private readonly authService: AuthService,
  ) {}

  private async getTasksClient(account: GoogleAccount): Promise<tasks_v1.Tasks> {
    const auth = await this.authService.getAuthenticatedClient(account);
    return google.tasks({ version: 'v1', auth });
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        if (err?.code === 429 && attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(`Rate limited, retrying in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Unreachable');
  }

  private async getTargetAccounts(accountEmail?: string): Promise<GoogleAccount[]> {
    if (accountEmail) {
      const account = await this.accountsService.findByEmail(accountEmail);
      if (!account) throw new Error(`Account not found: ${accountEmail}`);
      return [account];
    }
    return this.accountsService.findActive();
  }

  async listTaskLists(accountEmail?: string) {
    const accounts = await this.getTargetAccounts(accountEmail);

    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          const client = await this.getTasksClient(account);
          const { data } = await this.withRetry(() =>
            client.tasklists.list({ maxResults: 100 }),
          );
          return (data.items ?? []).map((tl) => ({
            id: tl.id!,
            title: tl.title ?? '',
            updated: tl.updated ?? '',
            accountEmail: account.email,
          }));
        } catch (err) {
          this.logger.warn(`Failed to list task lists for ${account.email}: ${err}`);
          return [];
        }
      }),
    );

    return results.flat();
  }

  async listTasks(params: {
    accountEmail?: string;
    taskListId?: string;
    showCompleted?: boolean;
    showHidden?: boolean;
    maxResults?: number;
    dueMin?: string;
    dueMax?: string;
  }) {
    const accounts = await this.getTargetAccounts(params.accountEmail);

    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          const client = await this.getTasksClient(account);

          // Get task lists to iterate
          const taskListIds = params.taskListId
            ? [params.taskListId]
            : (await this.withRetry(() => client.tasklists.list({ maxResults: 100 })))
                .data.items?.map((tl) => tl.id!) ?? [];

          const listResults = await Promise.all(
            taskListIds.map(async (tlId) => {
              try {
                const { data } = await this.withRetry(() =>
                  client.tasks.list({
                    tasklist: tlId,
                    maxResults: params.maxResults ?? 100,
                    showCompleted: params.showCompleted ?? false,
                    showHidden: params.showHidden ?? false,
                    ...(params.dueMin ? { dueMin: new Date(params.dueMin).toISOString() } : {}),
                    ...(params.dueMax ? { dueMax: new Date(params.dueMax).toISOString() } : {}),
                  }),
                );
                return (data.items ?? []).map((t) => ({
                  id: t.id!,
                  title: t.title ?? '',
                  notes: t.notes ?? '',
                  status: t.status ?? '',
                  due: t.due ?? null,
                  completed: t.completed ?? null,
                  parent: t.parent ?? null,
                  position: t.position ?? '',
                  updated: t.updated ?? '',
                  taskListId: tlId,
                  accountEmail: account.email,
                }));
              } catch (err) {
                this.logger.warn(`Failed tasks for ${account.email}/${tlId}: ${err}`);
                return [];
              }
            }),
          );

          return listResults.flat();
        } catch (err) {
          this.logger.warn(`Failed to process tasks for ${account.email}: ${err}`);
          return [];
        }
      }),
    );

    return results.flat().sort((a, b) => {
      // Sort: tasks with due date first (by due), then without
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due) return -1;
      if (b.due) return 1;
      return a.position.localeCompare(b.position);
    });
  }

  async createTask(params: {
    accountEmail: string;
    taskListId: string;
    title: string;
    notes?: string;
    due?: string;
    parent?: string;
  }) {
    const accounts = await this.getTargetAccounts(params.accountEmail);
    const client = await this.getTasksClient(accounts[0]);

    const { data } = await this.withRetry(() =>
      client.tasks.insert({
        tasklist: params.taskListId,
        parent: params.parent,
        requestBody: {
          title: params.title,
          notes: params.notes,
          due: params.due ? new Date(params.due).toISOString() : undefined,
        },
      }),
    );

    return {
      id: data.id!,
      title: data.title ?? '',
      notes: data.notes ?? '',
      status: data.status ?? '',
      due: data.due ?? null,
      taskListId: params.taskListId,
      accountEmail: params.accountEmail,
    };
  }

  async updateTask(params: {
    accountEmail: string;
    taskListId: string;
    taskId: string;
    title?: string;
    notes?: string;
    due?: string;
    status?: string;
  }) {
    const accounts = await this.getTargetAccounts(params.accountEmail);
    const client = await this.getTasksClient(accounts[0]);

    // Fetch existing first
    const { data: existing } = await this.withRetry(() =>
      client.tasks.get({
        tasklist: params.taskListId,
        task: params.taskId,
      }),
    );

    const { data } = await this.withRetry(() =>
      client.tasks.update({
        tasklist: params.taskListId,
        task: params.taskId,
        requestBody: {
          ...existing,
          title: params.title ?? existing.title,
          notes: params.notes ?? existing.notes,
          due: params.due ? new Date(params.due).toISOString() : existing.due,
          status: params.status ?? existing.status,
        },
      }),
    );

    return {
      id: data.id!,
      title: data.title ?? '',
      notes: data.notes ?? '',
      status: data.status ?? '',
      due: data.due ?? null,
      completed: data.completed ?? null,
      taskListId: params.taskListId,
      accountEmail: params.accountEmail,
    };
  }

  async completeTask(params: {
    accountEmail: string;
    taskListId: string;
    taskId: string;
  }) {
    return this.updateTask({
      ...params,
      status: 'completed',
    });
  }

  async deleteTask(params: {
    accountEmail: string;
    taskListId: string;
    taskId: string;
  }) {
    const accounts = await this.getTargetAccounts(params.accountEmail);
    const client = await this.getTasksClient(accounts[0]);

    await this.withRetry(() =>
      client.tasks.delete({
        tasklist: params.taskListId,
        task: params.taskId,
      }),
    );
  }

  async moveTask(params: {
    accountEmail: string;
    taskListId: string;
    taskId: string;
    parent?: string;
    previous?: string;
  }) {
    const accounts = await this.getTargetAccounts(params.accountEmail);
    const client = await this.getTasksClient(accounts[0]);

    const { data } = await this.withRetry(() =>
      client.tasks.move({
        tasklist: params.taskListId,
        task: params.taskId,
        parent: params.parent,
        previous: params.previous,
      }),
    );

    return {
      id: data.id!,
      title: data.title ?? '',
      status: data.status ?? '',
      parent: data.parent ?? null,
      position: data.position ?? '',
      taskListId: params.taskListId,
      accountEmail: params.accountEmail,
    };
  }
}

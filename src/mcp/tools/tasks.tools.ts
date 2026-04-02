import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TasksService } from '../../tasks/tasks.service';

export function registerTasksTools(
  mcp: McpServer,
  tasksService: TasksService,
) {
  mcp.tool(
    'gtasks_list_tasklists',
    'Lists all task lists from all (or specific) Google accounts.',
    {
      accountEmail: z.string().optional().describe('Filter by account email. Omit for all accounts.'),
    },
    async ({ accountEmail }) => {
      const lists = await tasksService.listTaskLists(accountEmail);
      return { content: [{ type: 'text', text: JSON.stringify(lists, null, 2) }] };
    },
  );

  mcp.tool(
    'gtasks_list_tasks',
    'Lists tasks across all accounts and task lists. By default shows only incomplete tasks. Use showCompleted=true to include done tasks.',
    {
      accountEmail: z.string().optional().describe('Filter by account email'),
      taskListId: z.string().optional().describe('Filter by task list ID. Omit to search all lists.'),
      showCompleted: z.boolean().optional().describe('Include completed tasks (default: false)'),
      showHidden: z.boolean().optional().describe('Include hidden/deleted tasks (default: false)'),
      maxResults: z.number().optional().describe('Max tasks per list (default: 100)'),
      dueMin: z.string().optional().describe('Filter: due date >= this (ISO 8601)'),
      dueMax: z.string().optional().describe('Filter: due date <= this (ISO 8601)'),
    },
    async (params) => {
      const tasks = await tasksService.listTasks(params);
      return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] };
    },
  );

  mcp.tool(
    'gtasks_create_task',
    'Creates a new task in a specified task list.',
    {
      accountEmail: z.string().describe('Account email'),
      taskListId: z.string().describe('Task list ID (use gtasks_list_tasklists to find IDs)'),
      title: z.string().describe('Task title'),
      notes: z.string().optional().describe('Task notes/description'),
      due: z.string().optional().describe('Due date (ISO 8601, e.g. "2026-04-05T00:00:00Z")'),
      parent: z.string().optional().describe('Parent task ID to create as subtask'),
    },
    async (params) => {
      const task = await tasksService.createTask(params);
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  mcp.tool(
    'gtasks_update_task',
    'Updates an existing task. Only provide fields that need to change.',
    {
      accountEmail: z.string().describe('Account email'),
      taskListId: z.string().describe('Task list ID'),
      taskId: z.string().describe('Task ID'),
      title: z.string().optional().describe('New title'),
      notes: z.string().optional().describe('New notes'),
      due: z.string().optional().describe('New due date (ISO 8601)'),
      status: z.string().optional().describe('"needsAction" or "completed"'),
    },
    async (params) => {
      const task = await tasksService.updateTask(params);
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  mcp.tool(
    'gtasks_complete_task',
    'Marks a task as completed.',
    {
      accountEmail: z.string().describe('Account email'),
      taskListId: z.string().describe('Task list ID'),
      taskId: z.string().describe('Task ID'),
    },
    async (params) => {
      const task = await tasksService.completeTask(params);
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );

  mcp.tool(
    'gtasks_delete_task',
    'Deletes a task permanently.',
    {
      accountEmail: z.string().describe('Account email'),
      taskListId: z.string().describe('Task list ID'),
      taskId: z.string().describe('Task ID'),
    },
    async (params) => {
      await tasksService.deleteTask(params);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    },
  );

  mcp.tool(
    'gtasks_move_task',
    'Moves a task to a different position or makes it a subtask of another task.',
    {
      accountEmail: z.string().describe('Account email'),
      taskListId: z.string().describe('Task list ID'),
      taskId: z.string().describe('Task ID to move'),
      parent: z.string().optional().describe('New parent task ID (makes it a subtask). Pass empty string to move to top level.'),
      previous: z.string().optional().describe('Task ID to place after. Omit to place at the beginning.'),
    },
    async (params) => {
      const task = await tasksService.moveTask(params);
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    },
  );
}

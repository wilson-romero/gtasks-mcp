import {
  CallToolRequest,
  CallToolResult,
  ListResourcesRequest,
  ReadResourceRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { GaxiosResponse } from "gaxios";
import { tasks_v1 } from "googleapis";

const MAX_TASK_RESULTS = 100;

export class TaskResources {
  static async read(request: ReadResourceRequest, tasks: tasks_v1.Tasks) {
    const taskId = request.params.uri.replace("gtasks:///", "");

    const taskListsResponse: GaxiosResponse<tasks_v1.Schema$TaskLists> =
      await tasks.tasklists.list({
        maxResults: MAX_TASK_RESULTS,
      });

    const taskLists = taskListsResponse.data.items || [];
    let task: tasks_v1.Schema$Task | null = null;

    for (const taskList of taskLists) {
      if (taskList.id) {
        try {
          const taskResponse: GaxiosResponse<tasks_v1.Schema$Task> =
            await tasks.tasks.get({
              tasklist: taskList.id,
              task: taskId,
            });
          task = taskResponse.data;
          break;
        } catch (error) {
          // Task not found in this list, continue to the next one
        }
      }
    }

    if (!task) {
      throw new Error("Task not found");
    }

    return task;
  }

  static async list(
    request: ListResourcesRequest,
    tasks: tasks_v1.Tasks,
  ): Promise<[tasks_v1.Schema$Task[], string | null]> {
    const pageSize = 10;
    const params: any = {
      maxResults: pageSize,
    };

    if (request.params?.cursor) {
      params.pageToken = request.params.cursor;
    }

    const taskListsResponse = await tasks.tasklists.list({
      maxResults: MAX_TASK_RESULTS,
    });

    const taskLists = taskListsResponse.data.items || [];

    let allTasks: tasks_v1.Schema$Task[] = [];
    let nextPageToken = null;

    for (const taskList of taskLists) {
      const tasksResponse = await tasks.tasks.list({
        tasklist: taskList.id,
        ...params,
      });

      const taskItems = tasksResponse.data.items || [];
      allTasks = allTasks.concat(taskItems);

      if (tasksResponse.data.nextPageToken) {
        nextPageToken = tasksResponse.data.nextPageToken;
      }
    }

    return [allTasks, nextPageToken];
  }
}

export class TaskActions {
  /**
   * Parses various date formats and converts to RFC 3339 format required by Google Tasks API.
   * Google Tasks API only uses the date portion; time is discarded.
   *
   * @param dateInput - Date string in various formats or undefined
   * @returns RFC 3339 formatted date string (YYYY-MM-DDTHH:MM:SS.000Z) or undefined
   * @throws Error if the date is invalid
   */
  private static parseDueDate(dateInput: string | undefined): string | undefined {
    if (!dateInput || dateInput.trim() === "") {
      return undefined;
    }

    const input = dateInput.trim();
    let parsedDate: Date | null = null;

    // Pattern 1: Already RFC 3339 format (2025-12-15T00:00:00.000Z or 2025-12-15T00:00:00Z)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(input)) {
      parsedDate = new Date(input);
    }
    // Pattern 2: ISO date only (2025-12-15)
    else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      parsedDate = new Date(input + "T00:00:00.000Z");
    }
    // Pattern 3: US format MM/DD/YYYY
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(input)) {
      const [month, day, year] = input.split("/").map(Number);
      parsedDate = new Date(Date.UTC(year, month - 1, day));
    }
    // Pattern 4: Format with dashes DD-MM-YYYY or MM-DD-YYYY
    else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(input)) {
      const [first, second, year] = input.split("-").map(Number);
      // If first number > 12, assume DD-MM-YYYY (European)
      if (first > 12) {
        parsedDate = new Date(Date.UTC(year, second - 1, first));
      } else {
        // Assume MM-DD-YYYY (US)
        parsedDate = new Date(Date.UTC(year, first - 1, second));
      }
    }
    // Pattern 5: YYYY/MM/DD
    else if (/^\d{4}\/\d{2}\/\d{2}$/.test(input)) {
      const [year, month, day] = input.split("/").map(Number);
      parsedDate = new Date(Date.UTC(year, month - 1, day));
    }
    // Pattern 6: Natural language with Date.parse() as fallback
    else {
      const timestamp = Date.parse(input);
      if (!isNaN(timestamp)) {
        parsedDate = new Date(timestamp);
      }
    }

    // Validate the parsed date
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      throw new Error(
        `Invalid date format: "${dateInput}". Please use ISO format (YYYY-MM-DD) or RFC 3339 (YYYY-MM-DDTHH:MM:SSZ).`
      );
    }

    // Validate date is reasonable (not in the far past or future)
    const year = parsedDate.getUTCFullYear();
    if (year < 1970 || year > 2100) {
      throw new Error(
        `Invalid date year: ${year}. Year must be between 1970 and 2100.`
      );
    }

    // Convert to RFC 3339 format with time set to midnight UTC
    const isoString = parsedDate.toISOString();
    const dateOnly = isoString.split("T")[0];
    return `${dateOnly}T00:00:00.000Z`;
  }

  private static formatTask(task: tasks_v1.Schema$Task) {
    return `${task.title}\n (Due: ${task.due || "Not set"}) - Notes: ${task.notes} - ID: ${task.id} - Status: ${task.status} - URI: ${task.selfLink} - Hidden: ${task.hidden} - Parent: ${task.parent} - Deleted?: ${task.deleted} - Completed Date: ${task.completed} - Position: ${task.position} - Updated Date: ${task.updated} - ETag: ${task.etag} - Links: ${task.links} - Kind: ${task.kind}}`;
  }

  private static formatTaskList(taskList: tasks_v1.Schema$Task[]) {
    return taskList.map((task) => this.formatTask(task)).join("\n");
  }

  private static async _list(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListsResponse = await tasks.tasklists.list({
      maxResults: MAX_TASK_RESULTS,
    });

    const taskLists = taskListsResponse.data.items || [];
    let allTasks: tasks_v1.Schema$Task[] = [];

    for (const taskList of taskLists) {
      if (taskList.id) {
        try {
          const tasksResponse = await tasks.tasks.list({
            tasklist: taskList.id,
            maxResults: MAX_TASK_RESULTS,
          });

          const items = tasksResponse.data.items || [];
          allTasks = allTasks.concat(items);
        } catch (error) {
          console.error(`Error fetching tasks for list ${taskList.id}:`, error);
        }
      }
    }
    return allTasks;
  }

  static async create(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskTitle = request.params.arguments?.title as string;
    const taskNotes = request.params.arguments?.notes as string;
    const taskDue = request.params.arguments?.due as string;

    if (!taskTitle) {
      throw new Error("Task title is required");
    }

    // Parse and convert due date to RFC 3339 format
    const parsedDue = this.parseDueDate(taskDue);

    const task: tasks_v1.Schema$Task = {
      title: taskTitle,
      notes: taskNotes,
      due: parsedDue,
    };

    const taskResponse = await tasks.tasks.insert({
      tasklist: taskListId,
      requestBody: task,
    });

    return {
      content: [
        {
          type: "text",
          text: `Task created: ${taskResponse.data.title}${parsedDue ? ` (Due: ${parsedDue})` : ""}`,
        },
      ],
      isError: false,
    };
  }

  static async update(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskId = request.params.arguments?.id as string;
    const taskTitle = request.params.arguments?.title as string;
    const taskNotes = request.params.arguments?.notes as string;
    const taskStatus = request.params.arguments?.status as string;
    const taskDue = request.params.arguments?.due as string;

    if (!taskId) {
      throw new Error("Task ID is required");
    }

    // Parse and convert due date to RFC 3339 format
    const parsedDue = this.parseDueDate(taskDue);

    const task: tasks_v1.Schema$Task = {
      id: taskId,
      title: taskTitle,
      notes: taskNotes,
      status: taskStatus,
      due: parsedDue,
    };

    const taskResponse = await tasks.tasks.update({
      tasklist: taskListId,
      task: taskId,
      requestBody: task,
    });

    return {
      content: [
        {
          type: "text",
          text: `Task updated: ${taskResponse.data.title}${parsedDue ? ` (Due: ${parsedDue})` : ""}`,
        },
      ],
      isError: false,
    };
  }

  static async list(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const allTasks = await this._list(request, tasks);
    const taskList = this.formatTaskList(allTasks);

    return {
      content: [
        {
          type: "text",
          text: `Found ${allTasks.length} tasks:\n${taskList}`,
        },
      ],
      isError: false,
    };
  }

  static async delete(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";
    const taskId = request.params.arguments?.id as string;

    if (!taskId) {
      throw new Error("Task ID is required");
    }

    await tasks.tasks.delete({
      tasklist: taskListId,
      task: taskId,
    });

    return {
      content: [
        {
          type: "text",
          text: `Task ${taskId} deleted`,
        },
      ],
      isError: false,
    };
  }

  static async search(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const userQuery = request.params.arguments?.query as string;

    const allTasks = await this._list(request, tasks);
    const filteredItems = allTasks.filter(
      (task) =>
        task.title?.toLowerCase().includes(userQuery.toLowerCase()) ||
        task.notes?.toLowerCase().includes(userQuery.toLowerCase()),
    );

    const taskList = this.formatTaskList(filteredItems);

    return {
      content: [
        {
          type: "text",
          text: `Found ${filteredItems.length} tasks:\n${taskList}`,
        },
      ],
      isError: false,
    };
  }

  static async clear(request: CallToolRequest, tasks: tasks_v1.Tasks) {
    const taskListId =
      (request.params.arguments?.taskListId as string) || "@default";

    await tasks.tasks.clear({
      tasklist: taskListId,
    });

    return {
      content: [
        {
          type: "text",
          text: `Tasks from tasklist ${taskListId} cleared`,
        },
      ],
      isError: false,
    };
  }
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CalendarService } from '../../calendar/calendar.service';

export function registerCalendarTools(
  mcp: McpServer,
  calendarService: CalendarService,
) {
  mcp.tool(
    'gcal_list_accounts',
    'Lists connected Google accounts (email, label, status). Call this ONLY when you need to know which accounts exist. Do NOT call before gcal_list_events — that tool already covers all accounts automatically.',
    {},
    async () => {
      const accounts = await calendarService.listAccounts();
      return { content: [{ type: 'text', text: JSON.stringify(accounts, null, 2) }] };
    },
  );

  mcp.tool(
    'gcal_list_calendars',
    'Lists all calendars from all (or specific) accounts. Call this ONLY when the user explicitly asks to see their calendars or you need a specific calendarId. Do NOT call this before gcal_list_events — events are fetched across all calendars automatically.',
    {
      accountEmail: z.string().optional().describe('Filter by account email. Omit to list all accounts.'),
    },
    async ({ accountEmail }) => {
      const calendars = await calendarService.listCalendars(accountEmail);
      return { content: [{ type: 'text', text: JSON.stringify(calendars, null, 2) }] };
    },
  );

  mcp.tool(
    'gcal_list_events',
    'Lists events across ALL accounts and ALL calendars in one call — no need to call gcal_list_accounts or gcal_list_calendars first. Returns events sorted by start time. Use accountEmail or calendarId only to narrow results when explicitly requested.',
    {
      startDate: z.string().describe('Start date (ISO 8601), e.g. "2026-03-31T00:00:00Z"'),
      endDate: z.string().describe('End date (ISO 8601), e.g. "2026-04-07T23:59:59Z"'),
      calendarId: z.string().optional().describe('Filter by specific calendar ID (optional)'),
      accountEmail: z.string().optional().describe('Filter by specific account email (optional)'),
      maxResults: z.number().optional().describe('Max events per calendar, default 50, max 100'),
    },
    async (params) => {
      const events = await calendarService.listEvents(params);
      const simplified = events.map((e) => ({
        id: e.id,
        summary: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        location: e.location,
        accountEmail: e.accountEmail,
        calendarId: e.calendarId,
        htmlLink: e.htmlLink,
        status: e.status,
        attendees: e.attendees?.map((a) => ({
          email: a.email,
          responseStatus: a.responseStatus,
        })),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(simplified, null, 2) }] };
    },
  );

  mcp.tool(
    'gcal_create_event',
    'Creates an event. Requires accountEmail and calendarId — use "primary" as calendarId for the main calendar.',
    {
      accountEmail: z.string().describe('Account email to create the event in'),
      calendarId: z.string().describe('Calendar ID (use "primary" for main calendar)'),
      title: z.string().describe('Event title'),
      startDateTime: z.string().describe('Start datetime (ISO 8601 with timezone)'),
      endDateTime: z.string().describe('End datetime (ISO 8601 with timezone)'),
      description: z.string().optional().describe('Event description'),
      location: z.string().optional().describe('Event location'),
      attendees: z.array(z.string()).optional().describe('Attendee emails'),
      conferenceData: z.boolean().optional().describe('Create Google Meet link'),
    },
    async (params) => {
      const event = await calendarService.createEvent(params);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            id: event.id,
            summary: event.summary,
            htmlLink: event.htmlLink,
            hangoutLink: event.hangoutLink,
            start: event.start,
            end: event.end,
          }, null, 2),
        }],
      };
    },
  );

  mcp.tool(
    'gcal_update_event',
    'Updates an existing calendar event. Only provide fields that need to change.',
    {
      accountEmail: z.string().describe('Account email'),
      calendarId: z.string().describe('Calendar ID'),
      eventId: z.string().describe('Event ID'),
      title: z.string().optional().describe('New title'),
      startDateTime: z.string().optional().describe('New start datetime (ISO 8601)'),
      endDateTime: z.string().optional().describe('New end datetime (ISO 8601)'),
      description: z.string().optional().describe('New description'),
      location: z.string().optional().describe('New location'),
      attendees: z.array(z.string()).optional().describe('New attendee emails (replaces existing)'),
    },
    async (params) => {
      const event = await calendarService.updateEvent(params);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            id: event.id,
            summary: event.summary,
            htmlLink: event.htmlLink,
            start: event.start,
            end: event.end,
          }, null, 2),
        }],
      };
    },
  );

  mcp.tool(
    'gcal_delete_event',
    'Deletes a calendar event permanently.',
    {
      accountEmail: z.string().describe('Account email'),
      calendarId: z.string().describe('Calendar ID'),
      eventId: z.string().describe('Event ID'),
    },
    async (params) => {
      await calendarService.deleteEvent(params);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    },
  );

  mcp.tool(
    'gcal_get_event',
    'Returns full details of a single calendar event including description, attendees and conferencing info.',
    {
      accountEmail: z.string().describe('Account email'),
      calendarId: z.string().describe('Calendar ID'),
      eventId: z.string().describe('Event ID'),
    },
    async (params) => {
      const event = await calendarService.getEvent(params);
      return { content: [{ type: 'text', text: JSON.stringify(event, null, 2) }] };
    },
  );

  mcp.tool(
    'gcal_find_free_slots',
    'Finds free time slots across ALL accounts using freebusy API in one call. Use this to schedule meetings — no need to list events manually.',
    {
      startDate: z.string().describe('Search range start (ISO 8601)'),
      endDate: z.string().describe('Search range end (ISO 8601)'),
      durationMinutes: z.number().describe('Minimum slot duration in minutes'),
      accountEmails: z.array(z.string()).optional().describe('Limit to specific accounts (omit for all)'),
    },
    async (params) => {
      const slots = await calendarService.findFreeSlots(params);
      return { content: [{ type: 'text', text: JSON.stringify(slots, null, 2) }] };
    },
  );
}

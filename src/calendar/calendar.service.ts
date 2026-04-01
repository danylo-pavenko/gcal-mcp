import { Injectable, Logger } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';
import { AccountsService } from '../accounts/accounts.service';
import { AuthService } from '../auth/auth.service';
import { GoogleAccount } from '../accounts/account.entity';

interface CalendarEvent extends calendar_v3.Schema$Event {
  accountEmail: string;
  calendarId: string;
}

interface CalendarInfo {
  id: string;
  summary: string;
  primary: boolean;
  accountEmail: string;
}

interface FreeSlot {
  start: string;
  end: string;
  durationMinutes: number;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly accountsService: AccountsService,
    private readonly authService: AuthService,
  ) {}

  private async getCalendarClient(
    account: GoogleAccount,
  ): Promise<calendar_v3.Calendar> {
    const auth = await this.authService.getAuthenticatedClient(account);
    return google.calendar({ version: 'v3', auth });
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

  private async getTargetAccounts(
    accountEmail?: string,
  ): Promise<GoogleAccount[]> {
    if (accountEmail) {
      const account = await this.accountsService.findByEmail(accountEmail);
      if (!account) throw new Error(`Account not found: ${accountEmail}`);
      return [account];
    }
    return this.accountsService.findActive();
  }

  // Returns lightweight account info — no extra API calls
  async listAccounts() {
    const accounts = await this.accountsService.findActive();
    return accounts.map((a) => ({
      email: a.email,
      label: a.label,
      isActive: a.is_active,
    }));
  }

  // Parallel fetch across all accounts
  async listCalendars(accountEmail?: string): Promise<CalendarInfo[]> {
    const accounts = await this.getTargetAccounts(accountEmail);

    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          const cal = await this.getCalendarClient(account);
          const { data } = await this.withRetry(() => cal.calendarList.list());
          return (data.items ?? []).map((item) => ({
            id: item.id!,
            summary: item.summary ?? '',
            primary: item.primary ?? false,
            accountEmail: account.email,
          }));
        } catch (err) {
          this.logger.warn(`Failed to list calendars for ${account.email}: ${err}`);
          return [];
        }
      }),
    );

    return results.flat();
  }

  // Fully parallel: accounts in parallel, calendars in parallel, events in parallel
  async listEvents(params: {
    startDate: string;
    endDate: string;
    calendarId?: string;
    accountEmail?: string;
    maxResults?: number;
  }): Promise<CalendarEvent[]> {
    const accounts = await this.getTargetAccounts(params.accountEmail);
    const maxResults = Math.min(params.maxResults ?? 50, 100);

    const accountResults = await Promise.all(
      accounts.map(async (account) => {
        try {
          const cal = await this.getCalendarClient(account);

          const calendars = params.calendarId
            ? [{ id: params.calendarId }]
            : (await this.withRetry(() => cal.calendarList.list())).data.items ?? [];

          const calendarResults = await Promise.all(
            calendars.map(async (calendar) => {
              try {
                const { data } = await this.withRetry(() =>
                  cal.events.list({
                    calendarId: calendar.id!,
                    timeMin: new Date(params.startDate).toISOString(),
                    timeMax: new Date(params.endDate).toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime',
                    maxResults,
                  }),
                );
                return (data.items ?? []).map((event) => ({
                  ...event,
                  accountEmail: account.email,
                  calendarId: calendar.id!,
                }));
              } catch (err) {
                this.logger.warn(
                  `Failed events for ${account.email}/${calendar.id}: ${err}`,
                );
                return [];
              }
            }),
          );

          return calendarResults.flat();
        } catch (err) {
          this.logger.warn(`Failed to process account ${account.email}: ${err}`);
          return [];
        }
      }),
    );

    return accountResults.flat().sort((a, b) => {
      const aTime = a.start?.dateTime || a.start?.date || '';
      const bTime = b.start?.dateTime || b.start?.date || '';
      return aTime.localeCompare(bTime);
    });
  }

  async createEvent(params: {
    accountEmail: string;
    calendarId: string;
    title: string;
    startDateTime: string;
    endDateTime: string;
    description?: string;
    location?: string;
    attendees?: string[];
    conferenceData?: boolean;
  }): Promise<calendar_v3.Schema$Event> {
    const accounts = await this.getTargetAccounts(params.accountEmail);
    const cal = await this.getCalendarClient(accounts[0]);

    const event: calendar_v3.Schema$Event = {
      summary: params.title,
      start: { dateTime: params.startDateTime },
      end: { dateTime: params.endDateTime },
      description: params.description,
      location: params.location,
      attendees: params.attendees?.map((email) => ({ email })),
    };

    if (params.conferenceData) {
      event.conferenceData = {
        createRequest: {
          requestId: `gcal-mcp-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const { data } = await this.withRetry(() =>
      cal.events.insert({
        calendarId: params.calendarId,
        requestBody: event,
        conferenceDataVersion: params.conferenceData ? 1 : 0,
      }),
    );
    return data;
  }

  async updateEvent(params: {
    accountEmail: string;
    calendarId: string;
    eventId: string;
    title?: string;
    startDateTime?: string;
    endDateTime?: string;
    description?: string;
    location?: string;
    attendees?: string[];
  }): Promise<calendar_v3.Schema$Event> {
    const accounts = await this.getTargetAccounts(params.accountEmail);
    const cal = await this.getCalendarClient(accounts[0]);

    const { data: existing } = await this.withRetry(() =>
      cal.events.get({
        calendarId: params.calendarId,
        eventId: params.eventId,
      }),
    );

    const event: calendar_v3.Schema$Event = {
      ...existing,
      summary: params.title ?? existing.summary,
      start: params.startDateTime ? { dateTime: params.startDateTime } : existing.start,
      end: params.endDateTime ? { dateTime: params.endDateTime } : existing.end,
      description: params.description ?? existing.description,
      location: params.location ?? existing.location,
      attendees: params.attendees
        ? params.attendees.map((email) => ({ email }))
        : existing.attendees,
    };

    const { data } = await this.withRetry(() =>
      cal.events.update({
        calendarId: params.calendarId,
        eventId: params.eventId,
        requestBody: event,
      }),
    );
    return data;
  }

  async deleteEvent(params: {
    accountEmail: string;
    calendarId: string;
    eventId: string;
  }): Promise<void> {
    const accounts = await this.getTargetAccounts(params.accountEmail);
    const cal = await this.getCalendarClient(accounts[0]);
    await this.withRetry(() =>
      cal.events.delete({
        calendarId: params.calendarId,
        eventId: params.eventId,
      }),
    );
  }

  async getEvent(params: {
    accountEmail: string;
    calendarId: string;
    eventId: string;
  }): Promise<calendar_v3.Schema$Event> {
    const accounts = await this.getTargetAccounts(params.accountEmail);
    const cal = await this.getCalendarClient(accounts[0]);
    const { data } = await this.withRetry(() =>
      cal.events.get({
        calendarId: params.calendarId,
        eventId: params.eventId,
      }),
    );
    return data;
  }

  async findFreeSlots(params: {
    startDate: string;
    endDate: string;
    durationMinutes: number;
    accountEmails?: string[];
  }): Promise<FreeSlot[]> {
    const accounts = params.accountEmails?.length
      ? await Promise.all(
          params.accountEmails.map(async (email) => {
            const account = await this.accountsService.findByEmail(email);
            if (!account) throw new Error(`Account not found: ${email}`);
            return account;
          }),
        )
      : await this.accountsService.findActive();

    const busyArrays = await Promise.all(
      accounts.map(async (account) => {
        try {
          const cal = await this.getCalendarClient(account);
          const { data } = await this.withRetry(() =>
            cal.freebusy.query({
              requestBody: {
                timeMin: new Date(params.startDate).toISOString(),
                timeMax: new Date(params.endDate).toISOString(),
                items: [{ id: account.email }],
              },
            }),
          );
          const calendars = data.calendars ?? {};
          return Object.values(calendars).flatMap((c) =>
            (c.busy ?? []).map((b) => ({
              start: new Date(b.start!),
              end: new Date(b.end!),
            })),
          );
        } catch (err) {
          this.logger.warn(`Failed freebusy for ${account.email}: ${err}`);
          return [];
        }
      }),
    );

    const busyIntervals = busyArrays.flat().sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );

    // Merge overlapping intervals
    const merged: { start: Date; end: Date }[] = [];
    for (const interval of busyIntervals) {
      const last = merged[merged.length - 1];
      if (last && interval.start <= last.end) {
        last.end = new Date(Math.max(last.end.getTime(), interval.end.getTime()));
      } else {
        merged.push({ ...interval });
      }
    }

    // Find free slots
    const freeSlots: FreeSlot[] = [];
    const rangeStart = new Date(params.startDate);
    const rangeEnd = new Date(params.endDate);
    const durationMs = params.durationMinutes * 60_000;

    let cursor = rangeStart;
    for (const busy of merged) {
      if (busy.start.getTime() - cursor.getTime() >= durationMs) {
        freeSlots.push({
          start: cursor.toISOString(),
          end: busy.start.toISOString(),
          durationMinutes: Math.floor((busy.start.getTime() - cursor.getTime()) / 60_000),
        });
      }
      cursor = busy.end > cursor ? busy.end : cursor;
    }

    if (rangeEnd.getTime() - cursor.getTime() >= durationMs) {
      freeSlots.push({
        start: cursor.toISOString(),
        end: rangeEnd.toISOString(),
        durationMinutes: Math.floor((rangeEnd.getTime() - cursor.getTime()) / 60_000),
      });
    }

    return freeSlots;
  }
}

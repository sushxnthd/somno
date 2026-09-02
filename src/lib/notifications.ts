import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSomnoStore } from '../store/useSomnoStore';

const MORNING_ID = 'somno-morning-checkin';
const WIND_DOWN_ID = 'somno-wind-down';
const WEEKLY_ID = 'somno-weekly-review';
const RECAL_ID = 'somno-recalibration';

/** How long a reaction-time baseline stands before it is worth re-taking. */
export const RECALIBRATE_AFTER_DAYS = 30;

let handlerConfigured = false;

/** Show notifications while the app is foregrounded too (default Expo behavior hides them). */
export function configureNotificationHandler() {
  if (handlerConfigured || Platform.OS === 'web') return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('somno-reminders', {
      name: 'Somno reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') return true;
  const result = await Notifications.requestPermissionsAsync();
  return result.status === 'granted';
}

/**
 * Makes sure an alarm will be able to show itself.
 *
 * On Android 13 and later an app cannot post a notification without POST_NOTIFICATIONS, and the
 * alarm's whole user interface *is* a notification — the full-screen intent that puts the wake
 * screen over the lock screen. Without the permission the alarm still rings, but nothing appears,
 * which is exactly what a user reported: an alarm that never showed up.
 *
 * The permission was only ever asked for on the onboarding permissions screen and in settings, so
 * anyone who skipped it had a silent, invisible alarm and no indication why. This is called at the
 * moment somebody creates or switches on an alarm, which is when the answer actually matters.
 */
export async function ensureAlarmNotifications(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return requestNotificationPermission();
}

function minutesToHourMinute(min: number): { hour: number; minute: number } {
  const m = ((min % 1440) + 1440) % 1440;
  return { hour: Math.floor(m / 60), minute: m % 60 };
}

interface ReminderInputs {
  noteM: boolean;
  noteW: boolean;
  /** The weekly review nudge — the spec's "weekly summary notification". */
  noteK: boolean;
  /** The monthly "refresh your baseline" nudge. */
  noteR: boolean;
  wakeMin: number;
  bedMin: number;
  /** When the current reaction-time baseline was taken; null if there isn't one. */
  baselineCreatedAt: number | null;
}

/** Cancel and re-schedule Somno's two repeating daily reminders based on current settings. */
export async function scheduleReminders({
  noteM,
  noteW,
  noteK,
  noteR,
  wakeMin,
  bedMin,
  baselineCreatedAt,
}: ReminderInputs): Promise<void> {
  if (Platform.OS === 'web') return;

  await Notifications.cancelScheduledNotificationAsync(MORNING_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(WIND_DOWN_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(RECAL_ID).catch(() => {});

  const perms = await Notifications.getPermissionsAsync();
  if (perms.status !== 'granted') return;

  if (noteM) {
    const { hour, minute } = minutesToHourMinute(wakeMin);
    await Notifications.scheduleNotificationAsync({
      identifier: MORNING_ID,
      content: {
        title: 'Somno',
        body: NOTIFICATION_BODIES.morning,
        sound: 'default',
        // The morning nudge asks for a check-in, so it opens the check-in. It carried no target at
        // all, which meant tapping it opened the app on whatever screen it happened to be on —
        // a reminder that could not be acted on from the thing reminding you.
        data: { screen: 'C1' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  }

  if (noteK) {
    // Sunday evening, an hour before the usual bedtime: late enough that the week is over, early
    // enough that reading it does not become the reason tonight runs late.
    const { hour, minute } = minutesToHourMinute(bedMin - 60);
    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_ID,
      content: {
        title: 'Your week in sleep',
        body: NOTIFICATION_BODIES.weekly,
        sound: 'default',
        data: { screen: 'W1' },
      },
      // 1 = Sunday in expo-notifications' weekday numbering.
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour, minute },
    });
  }

  /**
   * The monthly recalibration nudge.
   *
   * This row existed in settings with a Toggle hard-wired to `true` and an empty handler, above a
   * quoted sentence — "It's been a month. Want to refresh your baseline?" — that nothing sent. It
   * is a real thing to want: a reaction-time baseline taken a month ago has drifted, and every
   * score since is measured against it. Now it is scheduled, from the date the baseline was
   * actually taken, and only if there is one.
   */
  if (noteR && baselineCreatedAt != null) {
    /**
     * Monthly, as the setting says.
     *
     * This was a single `DATE` trigger at baseline + 30 days, wrapped in `if (at > now)` — so it
     * fired once and then, on the very next reschedule, the date was in the past and nothing was
     * scheduled at all. A setting called "Monthly recalibration nudge", left switched on, went
     * permanently silent after one notification, and the only thing that could revive it was
     * recalibrating: precisely the act the reminder exists to prompt.
     *
     * A `MONTHLY` trigger repeats until it is cancelled, and a recalibration moves
     * `baselineCreatedAt`, which reschedules this from the new date.
     */
    const first = new Date(baselineCreatedAt + RECALIBRATE_AFTER_DAYS * 86_400_000);
    // Early evening: awake, unhurried, and not a moment anyone would be asked to tap quickly.
    first.setHours(19, 0, 0, 0);
    /**
     * Capped at the 28th.
     *
     * A monthly trigger repeats on a day *number*, and 29, 30 and 31 do not exist in every month —
     * those months are skipped, so a baseline taken on the 31st would nudge in seven months of the
     * year and stay quiet in the other five. Capping costs at most three days of accuracy on a
     * thirty-day reminder.
     */
    const day = Math.min(first.getDate(), 28);
    await Notifications.scheduleNotificationAsync({
      identifier: RECAL_ID,
      content: {
        title: 'Somno',
        body: NOTIFICATION_BODIES.recalibrate,
        sound: 'default',
        // F6, the recalibration screen. This pointed at F2 — Permissions — so the one
        // notification whose entire purpose is "come and redo your baseline" delivered the user
        // to a list of camera and notification switches.
        data: { screen: 'F6' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
        day,
        hour: first.getHours(),
        minute: first.getMinutes(),
      },
    });
  }

  if (noteW) {
    const { hour, minute } = minutesToHourMinute(bedMin - 60);
    await Notifications.scheduleNotificationAsync({
      identifier: WIND_DOWN_ID,
      content: {
        title: 'Somno',
        body: NOTIFICATION_BODIES.windDown,
        sound: 'default',
        // Recovery is where tonight's recommended bedtime and nap window live — the thing the
        // wind-down reminder is about. It also had no target.
        data: { screen: 'D' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
  }
}

/**
 * The words each reminder actually arrives with.
 *
 * Exported because the notification settings screen shows the user a preview of each one, and it
 * used to show a *different* sentence: an invented "you're targeting a 10:45pm bedtime" for someone
 * whose bedtime is not 10:45, and an invented "alertness trending up 12%" that no code computed.
 * A preview that does not quote the thing it is previewing is decoration with quotation marks
 * around it. There is now one source for each string, and the screen reads it.
 */
export const NOTIFICATION_BODIES = {
  morning: 'Good morning ☀️ — your 30-second check-in is ready.',
  windDown: "Wind-down time — you're targeting an earlier night tonight.",
  weekly: 'Seven days of check-ins are in. See what moved.',
  recalibrate: "It's been a month since your baseline. Refreshing it keeps your scores honest.",
} as const;

const TONIGHT_ID = 'somno-tonight-plan';

export type TonightReminderOutcome =
  | { status: 'ok'; at: Date }
  | { status: 'denied' }
  | { status: 'passed' }
  | { status: 'unavailable' };

/**
 * A one-off nudge for tonight's recommended bedtime.
 *
 * This replaces writing the plan into the user's calendar. A calendar holds appointments with other
 * people and things you would be in trouble for missing; "wind down at 22:45" is neither, and a
 * wellness app filing recurring entries into it — visible to anyone the calendar is shared with,
 * and needing READ_CALENDAR and WRITE_CALENDAR to do it — was the wrong shape for the thing being
 * asked for. A reminder fires once, at the right moment, and disappears.
 *
 * Fires 30 minutes before the target so there is time to act on it, and only if that instant is
 * still ahead: a plan for a bedtime that has already passed is a plan for tomorrow.
 */
export async function scheduleTonightReminder(bedtimeMin: number, napStartMin?: number | null): Promise<TonightReminderOutcome> {
  if (Platform.OS === 'web') return { status: 'unavailable' };

  const granted = await requestNotificationPermission();
  if (!granted) return { status: 'denied' };

  const now = new Date();
  const at = new Date(now);
  at.setHours(Math.floor(bedtimeMin / 60), bedtimeMin % 60, 0, 0);
  at.setMinutes(at.getMinutes() - 30);
  // A bedtime past midnight belongs to tonight, not to a moment this morning that has been and
  // gone; anything else already behind us rolls to tomorrow.
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);

  await Notifications.cancelScheduledNotificationAsync(TONIGHT_ID).catch(() => {});
  try {
    const nap = napStartMin != null ? ` A short nap around ${Math.floor(napStartMin / 60)}:${String(napStartMin % 60).padStart(2, '0')} would help too.` : '';
    await Notifications.scheduleNotificationAsync({
      identifier: TONIGHT_ID,
      content: {
        title: 'Wind down soon',
        body: `Tonight's target is lights out in about 30 minutes.${nap}`,
        sound: 'default',
        data: { screen: 'D' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
    return { status: 'ok', at };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Wire the store's notification settings to real scheduled reminders. Call once at app start.
 * Returns an unsubscribe function. No-ops on web. */
export function initNotifications(): () => void {
  if (Platform.OS === 'web') return () => {};

  configureNotificationHandler();

  const readInputs = (): ReminderInputs => {
    const s = useSomnoStore.getState();
    return {
      noteM: s.noteM,
      noteW: s.noteW,
      noteK: s.noteK,
      noteR: s.noteR,
      wakeMin: s.wakeMin,
      bedMin: s.bedMin,
      baselineCreatedAt: s.baselineProfile?.createdAt ?? null,
    };
  };

  scheduleReminders(readInputs()).catch((e) => console.warn('[notifications] initial schedule failed', e));

  /**
   * A tapped reminder should land where it points.
   *
   * Tapping a notification from cold is the common case, not the rare one — and it was the one
   * that did nothing. The listener fires before the store has rehydrated, and it used to return
   * early on exactly that condition, so the target was discarded and the app opened on whatever
   * screen rehydration restored. The intent is now held until hydration finishes and applied then,
   * which is also after `onRehydrateStorage` has had its say, so nothing overwrites it.
   */
  let pendingScreen: string | null = null;
  let unsubHydration: (() => void) | undefined;

  const navigate = (target: string) => {
    const store = useSomnoStore.getState();
    store.go(target as Parameters<typeof store.go>[0]);
  };

  /**
   * Responses already acted on this session.
   *
   * The launching tap arrives twice — once from `getLastNotificationResponseAsync`, once from the
   * listener — and navigating for both would move the user off the screen they just arrived at.
   * Keyed on the request identifier *and* the delivery instant, because a daily reminder reuses its
   * identifier: keying on the identifier alone would silently swallow tomorrow's tap.
   */
  const handled = new Set<string>();

  const handleResponse = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const target = response.notification.request.content.data?.screen;
    if (typeof target !== 'string') return;

    const key = `${response.notification.request.identifier}:${response.notification.date}`;
    if (handled.has(key)) return;
    handled.add(key);

    if (useSomnoStore.getState().hasHydrated) {
      navigate(target);
      return;
    }
    // Held until the store is off disk, which is also after `onRehydrateStorage` has set the screen
    // — so the target is applied last and nothing overwrites it.
    pendingScreen = target;
    unsubHydration ??= useSomnoStore.subscribe((state) => {
      if (!state.hasHydrated || !pendingScreen) return;
      const target2 = pendingScreen;
      pendingScreen = null;
      unsubHydration?.();
      unsubHydration = undefined;
      navigate(target2);
    });
  };

  /**
   * The tap that launched the app from cold.
   *
   * `addNotificationResponseReceivedListener` only sees responses delivered *after* it subscribes,
   * and a cold launch delivers the response while the JS bundle is still starting — so the one case
   * that matters most, tapping a reminder on a phone where Somno is not already running, reached
   * nothing at all. `getLastNotificationResponseAsync` is the documented way to collect it.
   *
   * Cleared once consumed, or the same tap would re-navigate on every subsequent launch: the value
   * persists until something clears it, so a reminder tapped on Monday would keep opening its screen
   * on Tuesday and Wednesday.
   */
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (!response) return;
      handleResponse(response);
      return Notifications.clearLastNotificationResponseAsync();
    })
    .catch((e) => console.warn('[notifications] launch response failed', e));

  const responseSub = Notifications.addNotificationResponseReceivedListener(handleResponse);

  let prev = readInputs();
  /**
   * Permission is watched alongside the settings themselves.
   *
   * `scheduleReminders` returns early without the permission, which is correct — there is nothing
   * to schedule against — but it meant a grant arriving *later* changed nothing. Somebody who
   * declined notifications during onboarding and turned them on a week afterwards in Settings had
   * every reminder switched on in the UI and none of them scheduled, until they happened to toggle
   * one or move their bedtime. The transition to granted is exactly the moment to schedule.
   */
  let prevPerm = useSomnoStore.getState().perms.notif;
  const unsubscribe = useSomnoStore.subscribe((state) => {
    const next: ReminderInputs = {
      noteM: state.noteM,
      noteW: state.noteW,
      noteK: state.noteK,
      noteR: state.noteR,
      wakeMin: state.wakeMin,
      bedMin: state.bedMin,
      baselineCreatedAt: state.baselineProfile?.createdAt ?? null,
    };
    const perm = state.perms.notif;
    const permBecameGranted = perm === 'granted' && prevPerm !== 'granted';
    if (
      permBecameGranted ||
      next.noteM !== prev.noteM ||
      next.noteW !== prev.noteW ||
      next.noteK !== prev.noteK ||
      next.noteR !== prev.noteR ||
      next.wakeMin !== prev.wakeMin ||
      next.bedMin !== prev.bedMin ||
      next.baselineCreatedAt !== prev.baselineCreatedAt
    ) {
      prev = next;
      prevPerm = perm;
      scheduleReminders(next).catch((e) => console.warn('[notifications] reschedule failed', e));
      return;
    }
    prevPerm = perm;
  });

  return () => {
    responseSub.remove();
    unsubHydration?.();
    unsubscribe();
  };
}

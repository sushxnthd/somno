// Static copy/content, ported verbatim from Somno Prototype.dc.html.

export interface Lesson {
  t: string; // title
  a: string; // paragraph 1
  b: string; // paragraph 2
  c: string; // practical tip
  icon: 'phone' | 'moon' | 'coffee' | 'sun';
}

export const lessons: Lesson[] = [
  {
    t: 'Why blue light matters',
    a: 'Your body decides when to feel sleepy partly by reading light. Short-wavelength light, the kind screens put out most of, is the strongest signal that it is still daytime.',
    b: 'An hour of bright screen use before bed can push melatonin release later by roughly the same amount. That is usually enough to turn a 7-hour night into a 6-hour one without you noticing you fell asleep late.',
    c: 'Dim the room an hour before your target bedtime. Distance matters more than filters.',
    icon: 'phone',
  },
  {
    t: 'The 20-minute rule',
    a: 'A short nap borrows alertness from later in the day without touching the deep sleep your night needs.',
    b: 'Past about 25 minutes you drop into slow-wave sleep, and waking out of it produces the heavy, foggy feeling people blame naps for.',
    c: 'Set a 20-minute timer before 3pm. If you overshoot twice in a week, move the nap earlier rather than shorter.',
    icon: 'moon',
  },
  {
    t: "Caffeine's half-life",
    a: 'Half the caffeine in a 4pm coffee is still circulating at roughly 10pm, and a quarter of it at 4am.',
    b: 'It does not stop you sleeping so much as it thins the sleep, with less slow-wave, more brief awakenings you never remember.',
    c: 'Draw a line eight hours before your target bedtime and keep coffee on the early side of it.',
    icon: 'coffee',
  },
  {
    t: 'Anchor your wake time',
    a: 'A fixed wake time is the single strongest lever you have over your circadian rhythm, stronger than a fixed bedtime.',
    b: 'Sleeping in on weekends shifts your clock later, which is why Monday morning feels like jet lag you did not travel for.',
    c: 'Keep weekend wake time within an hour of weekdays, and get light in your eyes soon after.',
    icon: 'sun',
  },
];

// Per-lesson quick-question FAQ pairs for the lesson-detail AI assistant.
export const aiFaq: [string, string][][] = [
  [
    ['Do night filters help?', 'A warm filter cuts some short-wavelength light but barely touches total brightness, and brightness is most of the signal. Dimming the room and holding the phone further away does more than the filter.'],
    ['How long before bed?', 'Start dimming about an hour before your target bedtime. If that is unrealistic on a given night, even twenty minutes of low light moves things the right way.'],
  ],
  [
    ['Is a 45-minute nap bad?', 'Not bad, just expensive. You usually wake out of slow-wave sleep and feel foggy for about twenty minutes. Either stay under 25 minutes or commit to a full 90-minute cycle.'],
    ['When should I nap?', 'Between 1 and 3pm, in your natural afternoon dip. After 4pm a nap starts borrowing from tonight rather than topping up today.'],
  ],
  [
    ['What about tea?', 'A strong black tea is roughly half a coffee. It still counts against your eight-hour cutoff, just at half the dose.'],
    ['Does it hurt deep sleep?', 'Yes. Caffeine reduces slow-wave sleep even on nights you fall asleep normally, which is why those nights feel shallow without feeling short.'],
  ],
  [
    ['Weekend lie-ins?', 'Keep them within about an hour of your weekday wake time. Two hours later on both days is roughly as disruptive as flying two time zones and back.'],
    ['What if I slept badly?', 'Still get up at your anchor time. The lost sleep returns the next night as deeper sleep; moving the wake time drags the whole clock with it.'],
  ],
];

/**
 * The answer written for one of a lesson's prepared questions.
 *
 * The screen only ever offers these exact questions, so the lookup always hits. The fallback that
 * used to stitch a generic reply together for free-text input is gone with the input box — a
 * generated-sounding non-answer was the most dishonest thing on that screen.
 */
export function aiReply(lessonIdx: number, q: string): string {
  const pairs = aiFaq[lessonIdx];
  const hit = pairs.find((p) => p[0].toLowerCase() === q.toLowerCase());
  return hit ? hit[1] : lessons[lessonIdx].b;
}

export const kssWords = [
  'Extremely alert', 'Very alert', 'Alert', 'Rather alert', 'Neither alert nor sleepy',
  'Some signs of sleepiness', 'Sleepy, no effort to stay awake', 'Sleepy, some effort', 'Fighting sleep',
];

export const kssBodies = [
  'Sharpest you get.', 'Well above your usual morning.', 'Comfortably switched on.', 'Fine, with a little drift.',
  'Neutral, neither pushing nor fading.', "Not struggling, but you'd notice if you sat still.",
  'Sleepiness is present but not costing you effort yet.', 'Staying awake takes deliberate effort.',
  'You are fighting it. Do not drive.',
];

export const onboardingSlides = [
  { title: 'Know your alertness before your day does.', body: 'A 30-second check-in tells you how ready you really are.', cta: 'Show me how' },
  { title: 'No wearables. No wires.', body: 'Just your camera and a quick reaction test.', cta: 'What about my alarm?' },
  { title: "An alarm that checks if you're actually awake.", body: 'Smart Wake adapts your snooze to how alert you are.', cta: 'Get started' },
];

// Trends tab: what to call each range. The three invented SDI series that used to sit here, plus
// `rtSeries` and `weekReview`, were the mockup's numbers; every screen now derives its own from
// `checkIns`, so they were dead code that only made it easy to accidentally draw a fake chart.
export const rangeWord: Record<'7' | '30' | '90', string> = { '7': 'this week', '30': 'this month', '90': 'three months' };

export const faqList = [
  { q: 'Why did my score drop after a good night?', a: 'One good night rarely clears accumulated debt, and the tap test is sensitive to time of day. Compare across a week rather than day to day.' },
  { q: 'Does the face scan work with glasses?', a: 'Usually yes. Heavy glare can cost you the eye-area reading. If that happens the app tells you and leans on the other signals.' },
  { q: 'Can I use Somno on night shifts?', a: 'Yes. Check in at the same point in your waking day rather than the same clock time, and recalibrate when your rotation changes.' },
];

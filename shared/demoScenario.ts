import { DEMO_SCENARIO as C, type DemoStage } from './config/demo';
import { addDays, dayOfWeek, localDate } from './time';
export function demoDate(now: number): string {
  let day = addDays(localDate(now, C.timezone), 2);
  while ([0, 6].includes(dayOfWeek(day))) day = addDays(day, 1);
  return day;
}
export type DemoNames = Partial<Record<typeof C.personas[number]['key'], string>>;
export function demoText(template: string, names: DemoNames = {}): string {
  return template.replace(/\{(dad|mom|daughter)\}/g, (_, key: keyof DemoNames) => names[key] ?? C.personas.find(p => p.key === key)!.name);
}
export function demoEmail(run: string, date: string, stage: DemoStage, attempt: number, names: DemoNames = {}) {
  const spec = C.stages.find(s => s.key === stage)!;
  const recipient = C.personas.find(p => p.key === spec.recipient)!;
  return { recipient: recipient.email, cc: [] as string[],
    subject: `${C.prefix} [${run}] [${stage}-${attempt}] ${demoText(spec.subject, names)}`,
    body: demoText(spec.body, names).replaceAll('{date}', date).replaceAll('{timezone}', C.timezone).replaceAll('{location}', C.location) + '\n\nSynthetic MEGA demo scenario; not a real appointment.' };
}

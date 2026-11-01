import { AdultOnly } from '@/features/shell/RoleGate';
import { router } from '@/features/shell/navigation';
import { DemoConsole } from '@/features/settings/DemoConsole';
import { Sheet } from '@/ui/Sheet';
export default function DemoConsoleRoute() { return <AdultOnly adminOnly><Sheet title="Demo Console" onClose={() => router.back()}><DemoConsole /></Sheet></AdultOnly>; }

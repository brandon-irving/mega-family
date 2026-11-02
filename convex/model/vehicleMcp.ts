// MEGA's vehicle tools as a stateless MCP (JSON-RPC over Streamable HTTP) endpoint, same shape as the creation
// MCP (convex/model/creationMcp.ts). Tool specs are the agent's own (convex/agent/toolSpecs.ts), plus a list tool,
// so the model in MEGA's chat and an outside MCP client see the same contract. Commands are never executed from
// here: `vehicle_command` posts an Approve / Cancel card in the caller's own MEGA chat.
import { VEHICLES } from '../../shared/config/vehicles';
import { AGENT_TOOLS } from '../agent/toolSpecs';

export const VEHICLE_MCP_TOOLS = [
  {
    name: 'vehicle_list',
    description: "List the family cars this person can see, with each car's name, make, model and whether they own it.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  AGENT_TOOLS.vehicle_status.spec,
  AGENT_TOOLS.vehicle_command.spec,
] as const;

const READ_ONLY = new Set(['vehicle_list', 'vehicle_status']);

export async function vehicleMcp(body: unknown, execute: (name: string, args: Record<string, unknown>) => Promise<{ ok: boolean; text: string }>) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } };
  const b = body as Record<string, unknown>;
  const id = typeof b.id === 'string' || typeof b.id === 'number' ? b.id : null;
  const error = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
  const result = (value: unknown) => ({ jsonrpc: '2.0', id, result: value });
  if (b.jsonrpc !== '2.0' || typeof b.method !== 'string') return error(-32600, 'Invalid request');
  if (b.id === undefined) return b.method === 'notifications/initialized' ? null : error(-32600, 'Request ID required');
  if (b.method === 'initialize') return result({ protocolVersion: VEHICLES.mcpVersion, capabilities: { tools: {} }, serverInfo: { name: 'mega-vehicle', version: '1.0.0' }, instructions: "Read a family's linked cars and ask to lock, unlock or send a destination. Readings are only the numbers returned. vehicle_command never acts: it puts an Approve / Cancel card in the person's MEGA chat, and only their tap runs it." });
  if (b.method === 'ping') return result({});
  if (b.method === 'tools/list') return result({ tools: VEHICLE_MCP_TOOLS.map((s) => ({ name: s.name, description: s.description, inputSchema: s.parameters, annotations: { readOnlyHint: READ_ONLY.has(s.name), destructiveHint: false, openWorldHint: true } })) });
  if (b.method !== 'tools/call') return error(-32601, 'Method not found');
  const params = b.params as Record<string, unknown> | undefined;
  if (!params || !VEHICLE_MCP_TOOLS.some((s) => s.name === params.name)) return error(-32602, 'Unknown tool');
  const args = params.arguments ?? {};
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return error(-32602, 'Arguments must be an object');
  try {
    const r = await execute(params.name as string, args as Record<string, unknown>);
    return result({ content: [{ type: 'text', text: r.text }], ...(r.ok ? {} : { isError: true }) });
  } catch {
    return result({ isError: true, content: [{ type: 'text', text: 'The car tool could not complete. Check that you are signed in as a grown-up with a linked car.' }] });
  }
}

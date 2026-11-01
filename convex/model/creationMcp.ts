import { CREATION_TOOLS, MCP_CONFIRM_TOOL } from '../agent/creationToolSpecs';

export const CREATION_MCP_PATH = '/mcp/mega-creation';
export const CREATION_MCP_VERSION = '2025-11-25';
const specs = [...CREATION_TOOLS, MCP_CONFIRM_TOOL];

/** Stateless MCP JSON-RPC handler; HTTP authentication/origin checks live at the transport boundary. */
export async function creationMcp(body: unknown, execute: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } };
  const b = body as Record<string, unknown>;
  const id = typeof b.id === 'string' || typeof b.id === 'number' ? b.id : null;
  const error = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
  const result = (value: unknown) => ({ jsonrpc: '2.0', id, result: value });
  if (b.jsonrpc !== '2.0' || typeof b.method !== 'string') return error(-32600, 'Invalid request');
  if (b.id === undefined) return b.method === 'notifications/initialized' ? null : error(-32600, 'Request ID required');
  if (b.method === 'initialize') return result({ protocolVersion: CREATION_MCP_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'mega-creation', version: '1.0.0' }, instructions: 'Discuss needs through conversation. Save drafts, preview their appearance and brief, and ask for explicit confirmation before mega_draft_confirm. structuredContent.ui suggests a MEGA confirmation component; text content is a complete fallback. No tool sends invitations or connects accounts.' });
  if (b.method === 'ping') return result({});
  if (b.method === 'tools/list') return result({ tools: specs.map(s => ({ name: s.name, description: s.description, inputSchema: s.parameters, annotations: { readOnlyHint: s.name === 'mega_draft_get', destructiveHint: false, openWorldHint: false } })) });
  if (b.method !== 'tools/call') return error(-32601, 'Method not found');
  const params = b.params as Record<string, unknown> | undefined;
  if (!params || !specs.some(s => s.name === params.name)) return error(-32602, 'Unknown tool');
  const args = params.arguments ?? {};
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return error(-32602, 'Arguments must be an object');
  try {
    const structuredContent = await execute(params.name as string, args as Record<string, unknown>);
    return result({ content: [{ type: 'text', text: String(structuredContent.text ?? JSON.stringify(structuredContent)) }], structuredContent });
  } catch {
    return result({ isError: true, content: [{ type: 'text', text: 'The tool could not complete. Check the draft, required details, and your access. Review the latest draft before confirming.' }] });
  }
}

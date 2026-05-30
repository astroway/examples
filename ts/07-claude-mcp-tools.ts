/**
 * Claude MCP — wire AstroWay endpoints into Claude Desktop / Claude Code.
 *
 * @astroway/mcp ships an MCP server that exposes the AstroWay endpoint
 * catalogue as MCP tools. Drop this config into Claude Desktop's mcp.json
 * (or use `claude mcp add` for Claude Code) and Claude can fetch charts on
 * demand.
 *
 * No code to write — just config. This file documents the config plus a
 * smoke-test runner you can use to verify the MCP server is reachable
 * before pointing Claude at it.
 *
 * Deps: npm install -g @astroway/mcp
 * Env (in MCP config, not shell): ASTROWAY_API_KEY
 */

// 1. Claude Desktop config — paste into ~/Library/Application Support/Claude/claude_desktop_config.json
const claudeDesktopConfig = {
  mcpServers: {
    astroway: {
      command: 'npx',
      args: ['-y', '@astroway/mcp'],
      env: {
        ASTROWAY_API_KEY: 'aw_test_REPLACE_WITH_YOUR_KEY',
      },
    },
  },
};

// 2. Claude Code one-liner (no manual JSON editing):
//    claude mcp add astroway --env ASTROWAY_API_KEY=aw_test_xxx -- npx -y @astroway/mcp

// 3. Once registered, prompt Claude:
//    > "Pull Albert Einstein's natal chart (1879-03-14 11:30 Ulm) and tell me about his Mars."
//    Claude picks the right tool, calls it, reasons over the JSON.

// 4. Optional smoke test — run the MCP server standalone, list tools, exit.
import { spawn } from 'node:child_process';
const proc = spawn('npx', ['-y', '@astroway/mcp'], {
  env: { ...process.env, ASTROWAY_API_KEY: process.env.ASTROWAY_API_KEY },
  stdio: ['pipe', 'pipe', 'inherit'],
});
proc.stdin.write(JSON.stringify({
  jsonrpc: '2.0', id: 1, method: 'tools/list', params: {},
}) + '\n');
proc.stdout.on('data', (chunk: Buffer) => {
  const lines = chunk.toString().split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const r = JSON.parse(line);
      if (r.result?.tools) {
        console.log(`✓ MCP exposes ${r.result.tools.length} tools:`);
        for (const t of r.result.tools.slice(0, 8)) console.log(`  - ${t.name}: ${t.description?.slice(0, 60)}`);
        proc.kill();
        process.exit(0);
      }
    } catch { /* skip non-JSON lines */ }
  }
});

void claudeDesktopConfig;

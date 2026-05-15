import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';

const DEFAULT_FIXTURES = ['balanced-100', 'balanced-500', 'balanced-1000', 'balanced-2000'];
const DEFAULT_PORT = 5173;
const args = parseArgs(process.argv.slice(2));
const baseUrl = `http://127.0.0.1:${args.port}`;

let serverProcess = null;

async function main() {
  const startedServer = await ensureServer();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const rows = [];
  for (const fixture of args.fixtures) {
    rows.push(await runFixture(page, fixture));
  }

  await browser.close();
  if (startedServer) {
    await stopServer();
  }

  const report = formatMarkdown(rows);
  if (args.out) {
    const outPath = resolve(process.cwd(), args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${report}\n`, 'utf8');
    console.log(`Wrote ${outPath}`);
  }
  console.log(report);
}

async function runFixture(page, fixture) {
  const startedAt = performance.now();
  await page.goto(`${baseUrl}/?fixture=${fixture}`, { waitUntil: 'domcontentloaded' });
  const shell = page.locator('.app-shell');
  await shell.waitFor({ state: 'attached', timeout: args.timeoutMs });
  await page.waitForFunction(
    (expectedFixture) => {
      const element = document.querySelector('.app-shell');
      return element?.getAttribute('data-fixture') === expectedFixture && element.getAttribute('data-benchmark-ready') === 'true';
    },
    fixture,
    { timeout: args.timeoutMs }
  );

  const attributes = await shell.evaluate((element) => ({
    nodeCount: Number(element.getAttribute('data-node-count')),
    layoutMs: Number(element.getAttribute('data-layout-ms')),
    mountMs: Number(element.getAttribute('data-mount-ms'))
  }));

  const editLatencyMs = await measureEditLatency(page);
  const scriptedPanFrames = await measureScriptedPan(page);
  const canvasStats = await readCanvasStats(page);
  const editorCount = await page.locator('.ProseMirror').count();

  return {
    fixture,
    totalMs: round(performance.now() - startedAt),
    nodeCount: attributes.nodeCount,
    editorCount,
    canvasNodeCount: canvasStats.nodeCount,
    canvasEdgeCount: canvasStats.edgeCount,
    layoutMs: round(attributes.layoutMs),
    mountMs: round(attributes.mountMs),
    editLatencyMs: round(editLatencyMs),
    panFrameMedianMs: round(percentile(scriptedPanFrames, 0.5)),
    panFrameP95Ms: round(percentile(scriptedPanFrames, 0.95)),
    panFrameMaxMs: round(Math.max(...scriptedPanFrames))
  };
}

async function readCanvasStats(page) {
  const canvasStats = await page.locator('.spike-canvas').evaluate((element) => ({
    nodeCount: element.getAttribute('data-visible-node-count'),
    edgeCount: element.getAttribute('data-visible-edge-count')
  }));
  const nodeCount = Number(canvasStats.nodeCount ?? Number.NaN);
  const edgeCount = Number(canvasStats.edgeCount ?? Number.NaN);

  return {
    nodeCount: Number.isFinite(nodeCount) ? nodeCount : await page.locator('.spike-node').count(),
    edgeCount: Number.isFinite(edgeCount) ? edgeCount : await page.locator('.spike-edges path').count()
  };
}

async function measureScriptedPan(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('.spike-canvas');
    if (!canvas) {
      throw new Error('Missing .spike-canvas');
    }

    const frames = [];
    let previous = performance.now();
    for (let index = 0; index < 45; index += 1) {
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          deltaX: index % 2 === 0 ? 22 : -18,
          deltaY: 7,
          bubbles: true,
          cancelable: true
        })
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = performance.now();
      frames.push(now - previous);
      previous = now;
    }
    return frames.slice(5);
  });
}

async function measureEditLatency(page) {
  const target = await activateEditor(page, 'outline', 'node-1');
  const mirror = editorSlot(page, 'canvas', 'node-1');
  const text = `Benchmark edit ${Date.now()}`;
  const startedAt = performance.now();
  await target.fill(text);
  await mirror.filter({ hasText: text }).waitFor({ timeout: args.timeoutMs });
  return performance.now() - startedAt;
}

async function activateEditor(page, surface, nodeId) {
  const slot = editorSlot(page, surface, nodeId);
  await slot.click();
  const editor = slot.locator('.ProseMirror');
  await editor.waitFor({ state: 'visible', timeout: args.timeoutMs });
  return editor;
}

function editorSlot(page, surface, nodeId) {
  return page.locator(`[data-node-id="${nodeId}"][data-editor-surface="${surface}"]`).first();
}

async function ensureServer() {
  if (await canReachServer()) {
    return false;
  }

  serverProcess = spawn('pnpm', ['dev', '--host', '127.0.0.1', '--port', String(args.port)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (chunk) => {
    if (args.verbose) {
      process.stdout.write(`[vite] ${chunk}`);
    }
  });
  serverProcess.stderr.on('data', (chunk) => {
    if (args.verbose) {
      process.stderr.write(`[vite] ${chunk}`);
    }
  });

  const deadline = Date.now() + args.timeoutMs;
  while (Date.now() < deadline) {
    if (await canReachServer()) {
      return true;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function stopServer() {
  if (!serverProcess) {
    return;
  }
  serverProcess.kill('SIGTERM');
  await delay(500);
  if (serverProcess.exitCode === null) {
    serverProcess.kill('SIGKILL');
  }
}

async function canReachServer() {
  try {
    const response = await fetch(baseUrl, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

function formatMarkdown(rows) {
  const generatedAt = new Date().toISOString();
  const verdict = classifyRows(rows);
  const lines = [
    '# MindForge Spike Benchmark Result',
    '',
    `Generated at: ${generatedAt}`,
    '',
    'Environment:',
    '',
    `- URL: ${baseUrl}`,
    `- Browser: Chrome via Playwright channel=chrome`,
    `- OS: ${platform()} ${release()} ${arch()}`,
    `- CPU: ${cpus()[0]?.model ?? 'unknown'}`,
    `- Memory: ${Math.round(totalmem() / 1024 / 1024 / 1024)} GB`,
    `- Fixtures: ${rows.map((row) => row.fixture).join(', ')}`,
    '',
    '| fixture | nodes | canvas nodes | canvas edges | editors | mount ms | layout ms | edit sync ms | pan median ms | pan p95 ms | pan max ms | total ms |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.fixture} | ${row.nodeCount} | ${row.canvasNodeCount} | ${row.canvasEdgeCount} | ${row.editorCount} | ${row.mountMs} | ${row.layoutMs} | ${row.editLatencyMs} | ${row.panFrameMedianMs} | ${row.panFrameP95Ms} | ${row.panFrameMaxMs} | ${row.totalMs} |`
    );
  }

  lines.push(
    '',
    'Conclusion:',
    '',
    `- ${verdict}`,
    '',
    'Notes:',
    '',
    '- `edit sync ms` measures outline edit -> matching canvas text visible.',
    '- `editors` counts mounted ProseMirror editors after the edit-sync measurement.',
    '- `canvas nodes` / `canvas edges` count the current rendered canvas DOM after scripted pan.',
    '- `pan * ms` is scripted wheel-pan frame interval sampling inside the browser.'
  );

  return lines.join('\n');
}

function classifyRows(rows) {
  const thousandNodeRows = rows.filter((row) => row.nodeCount >= 1000);
  const noGoRows = thousandNodeRows.filter(
    (row) => row.mountMs > 2000 || row.panFrameP95Ms > 25 || row.editLatencyMs > 100
  );
  if (noGoRows.length > 0) {
    return 'No-go for the currently measured render path. The next spike step should reduce React update breadth and outline-side DOM work, then rerun the same benchmark.';
  }

  const conditionalRows = rows.filter(
    (row) => row.mountMs > 1000 || row.panFrameP95Ms > 16.7 || row.editLatencyMs > 50
  );
  if (conditionalRows.length > 0) {
    return 'Conditional go. The current path needs targeted hardening before it can graduate from spike.';
  }

  return 'Go for the measured fixture set.';
}

function parseArgs(argv) {
  const parsed = {
    fixtures: DEFAULT_FIXTURES,
    out: null,
    port: DEFAULT_PORT,
    timeoutMs: 120_000,
    verbose: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--fixtures') {
      parsed.fixtures = argv[index + 1].split(',').map((item) => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--out') {
      parsed.out = argv[index + 1];
      index += 1;
    } else if (arg === '--port') {
      parsed.port = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--timeout-ms') {
      parsed.timeoutMs = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--verbose') {
      parsed.verbose = true;
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/run-spike-benchmark.mjs [options]

Options:
  --fixtures a,b,c       Comma-separated fixture names.
  --out path             Write markdown report to a file.
  --port 5173            Vite dev server port.
  --timeout-ms 120000    Per-fixture timeout.
  --verbose              Print Vite output.
`);
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on('SIGINT', async () => {
  await stopServer();
  process.exit(130);
});

main().catch(async (error) => {
  await stopServer();
  console.error(error);
  process.exitCode = 1;
});

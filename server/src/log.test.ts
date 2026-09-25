import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newId } from './ids.ts';
import { createLogger, type LogFields, stackFrames } from './log.ts';

function capture(project?: string) {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({
    ...(project ? { project } : {}),
    write: (l) => lines.push(JSON.parse(l)),
  });
  return { logger, lines };
}

test('a line holds the event, its severity, the time and the allowed fields', () => {
  const { logger, lines } = capture();
  const personId = newId();
  logger.log('api.request', {
    personId,
    status: 200,
    durationMs: 12.5,
    route: 'healthz',
    method: 'GET',
  });
  assert.equal(lines.length, 1);
  const line = lines[0] as Record<string, unknown>;
  assert.equal(line['severity'], 'INFO');
  assert.equal(line['message'], 'api.request');
  assert.match(String(line['time']), /^\d{4}-\d\d-\d\dT/);
  assert.equal(line['personId'], personId);
  assert.equal(line['status'], 200);
  assert.equal(line['route'], 'healthz');
  assert.equal(line['dropped'], undefined);
});

test('content cannot be logged: free text in any field is dropped, and the field is named', () => {
  const { logger, lines } = capture();
  const content = 'Reply to Sam: Friday at 3 works for me';
  const sneaky = {
    personId: content,
    requestId: `${newId()} ${content}`,
    route: content,
    errorKind: content,
    status: content,
    frames: [content],
    message: content,
    email: content,
  } as unknown as LogFields;
  logger.log('api.error', sneaky);
  const raw = JSON.stringify(lines[0]);
  assert.ok(!raw.includes('Sam'), raw);
  assert.ok(!raw.includes('Friday'), raw);
  assert.deepEqual(
    new Set((lines[0] as { dropped: string[] }).dropped),
    new Set(['personId', 'requestId', 'route', 'errorKind', 'status', 'frames', 'unknown-field']),
  );
  assert.equal((lines[0] as Record<string, unknown>)['message'], 'api.error');
});

test('an error is logged by kind and frames; its message never appears', () => {
  const { logger, lines } = capture();
  const err = new Error('Could not send "Dinner with Maya at 8" to maya@example.com');
  logger.error('api.error', 'internal', err);
  const raw = JSON.stringify(lines[0]);
  assert.ok(!raw.includes('Maya'), raw);
  assert.ok(!raw.includes('example.com'), raw);
  assert.equal((lines[0] as Record<string, unknown>)['errorKind'], 'internal');
  const frames = (lines[0] as { frames: string[] }).frames;
  assert.ok(frames.length > 0);
  assert.ok(frames.every((f) => f.startsWith('at ')));
});

test('a message line shaped like a frame is not taken for one', () => {
  const err = new Error(
    'first line\nat the meeting (/home/sam/notes.txt:1:1)\nlast line of content',
  );
  const frames = stackFrames(err);
  assert.ok(frames.length > 0);
  assert.ok(frames.every((f) => !f.includes('meeting') && !f.includes('content')));
  assert.deepEqual(stackFrames('not an error'), []);
});

test('the trace id links to Cloud Trace when the project is known', () => {
  const { logger, lines } = capture('agent-v-staging');
  const traceId = '0123456789abcdef0123456789abcdef';
  logger.log('api.request', { traceId, status: 200 });
  const line = lines[0] as Record<string, unknown>;
  assert.equal(line['logging.googleapis.com/trace'], `projects/agent-v-staging/traces/${traceId}`);
  assert.equal(line['traceId'], undefined);
});

test('numbers must be real, non-negative counts where counts are expected', () => {
  const { logger, lines } = capture();
  logger.log('egress.tunnel', { bytes: -1, count: 1.5, durationMs: Number.NaN, version: 3 });
  const line = lines[0] as Record<string, unknown>;
  assert.equal(line['version'], 3);
  assert.deepEqual(new Set(line['dropped'] as string[]), new Set(['bytes', 'count', 'durationMs']));
});

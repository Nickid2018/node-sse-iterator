import { expect, test } from 'vitest';
import { Readable } from 'node:stream';
import { randomInt } from 'node:crypto';
import { wrapSseStreamToIterator } from './sse-iterator';

function makeSseStream(message: string) {
  const readable = [];
  while (message) {
    const split = randomInt(1, 25);
    if (message.length < split) {
      readable.push(message);
      break;
    } else {
      readable.push(message.substring(0, split));
      message = message.substring(split);
    }
  }
  return Readable.from(readable.map(str => Buffer.from(str)));
}

async function iterToArray<T>(iter: AsyncIterable<T>) {
  const buffer = [];
  for await (const item of iter) {
    buffer.push(item);
  }
  return buffer;
}

test('iterate concat message', async () => {
  const recipe = 'data: YHOO\ndata: +2\ndata: 10\n\n';
  const stream = makeSseStream(recipe);
  for await (const chunk of wrapSseStreamToIterator(stream)) {
    expect(chunk).toEqual({
      lastEventID: '',
      event: '',
      data: 'YHOO\n+2\n10',
    });
  }
});

test('comment and last event id', async () => {
  const recipe =
    ': test stream\n\ndata: first event\nid: 1\n\ndata:second event\nid\n\ndata:  third event\n';
  const stream = makeSseStream(recipe);
  const array = await iterToArray(wrapSseStreamToIterator(stream));
  expect(array).toEqual([
    {
      lastEventID: '1',
      event: '',
      data: 'first event',
    },
    {
      lastEventID: '',
      event: '',
      data: 'second event',
    },
    {
      lastEventID: '',
      event: '',
      data: ' third event',
    },
  ]);
});

test('eof blank line', async () => {
  const recipe = 'data\n\ndata\ndata\n\ndata:';
  const stream = makeSseStream(recipe);
  const array = await iterToArray(wrapSseStreamToIterator(stream));
  expect(array.length).toEqual(2);
});

test('strip first space', async () => {
  const recipe = 'data:test\n\ndata: test\n';
  const stream = makeSseStream(recipe);
  const array = await iterToArray(wrapSseStreamToIterator(stream));
  expect(array.length).toEqual(2);
  expect(array[0]).toEqual(array[1]);
});

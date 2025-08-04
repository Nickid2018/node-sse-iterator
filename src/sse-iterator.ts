import { Readable } from 'node:stream';

export type ServerSentEvent = {
  event: string;
  data: string;
  lastEventID: string;
  retry?: number;
};

// Lines must be separated by either
// a U+000D CARRIAGE RETURN U+000A LINE FEED (CRLF) character pair,
// a single U+000A LINE FEED (LF) character,
// or a single U+000D CARRIAGE RETURN (CR) character.
const EOL_STR = ['\r\n', '\n', '\r'];

function checkBufferEOL(buffer: Buffer) {
  for (const eol of EOL_STR) {
    const index = buffer.indexOf(eol);
    if (index !== -1) return [index, index + eol.length];
  }
  return [-1];
}

// Wrap a readable to an async iterator which yields ServerSentEvent objects.
//
// Server Sent Events Spec: https://html.spec.whatwg.org/multipage/server-sent-events.html
export async function* wrapSseStreamToIterator(evs: Readable) {
  let buffer = Buffer.from('');

  let canFire = false;
  let lastIncomplete: ServerSentEvent = {
    event: '',
    data: '',
    lastEventID: '',
  };
  for await (const chunk of evs) {
    buffer = Buffer.concat([buffer, chunk]);

    let eolCheck;
    while ((eolCheck = checkBufferEOL(buffer))[0] > -1) {
      // Event streams in this format must always be encoded as UTF-8.
      const line = buffer.subarray(0, eolCheck[0]).toString('utf8');
      buffer = buffer.subarray(eolCheck[1]);

      // If line is empty, dispatch the event
      if (line === '') {
        if (!canFire) continue;

        const data = lastIncomplete.data;
        if (data) {
          // If the data buffer's last character is a U+000A LINE FEED (LF) character
          // then remove the last character from the data buffer.
          if (data.endsWith('\n'))
            lastIncomplete.data = data.substring(0, data.length - 1);
        } else {
          // If the data buffer is an empty string,
          // set the data buffer and the event type buffer to the empty string and return.
          lastIncomplete.event = '';
          lastIncomplete.data = '';
        }
        yield lastIncomplete;

        // The buffer does not get reset, so the last event ID string of the event source remains set to this value
        // until the next time it is set by the server.
        lastIncomplete = {
          event: '',
          data: '',
          lastEventID: lastIncomplete.lastEventID,
        };
        canFire = false;
        continue;
      }

      const colonPosition = line.indexOf(':');
      // If the line starts with a U+003A COLON character, ignore the line.
      if (colonPosition === 0) continue;

      let field, value;
      // If the line contains a U+003A COLON character
      if (colonPosition > 0) {
        // Collect the characters on the line before the first U+003A COLON character, and let field be that string.
        field = line.substring(0, colonPosition);
        // Collect the characters on the line after the first U+003A COLON character, and let value be that string.
        value = line.substring(colonPosition + 1);
        // If value starts with a U+0020 SPACE character, remove it from value.
        if (value.startsWith(' ')) value = value.substring(1);
      } else {
        // Otherwise, the string is not empty but does not contain a U+003A COLON character
        // using the whole line as the field name, and the empty string as the field value.
        field = line;
        value = '';
      }

      // process the field
      switch (field) {
        case 'event':
          lastIncomplete.event = value;
          break;
        case 'data':
          // Append the field value to the data buffer,
          // then append a single U+000A LINE FEED (LF) character to the data buffer.
          lastIncomplete.data += `${value}\n`;
          break;
        case 'id':
          lastIncomplete.lastEventID = value;
          break;
        case 'retry':
          // If the field value consists of only ASCII digits,
          // then interpret the field value as an integer in base ten
          lastIncomplete.retry = parseInt(value, 10);
          if (isNaN(lastIncomplete.retry)) delete lastIncomplete.retry;
          break;
        // Otherwise, the field is ignored.
      }
      canFire = true;
    }
  }

  // EOF check last line
  if (buffer.length === 0 && canFire) {
    const data = lastIncomplete.data;
    if (data) {
      // If the data buffer's last character is a U+000A LINE FEED (LF) character
      // then remove the last character from the data buffer.
      if (data.endsWith('\n'))
        lastIncomplete.data = data.substring(0, data.length - 1);
    } else {
      // If the data buffer is an empty string,
      // set the data buffer and the event type buffer to the empty string and return.
      lastIncomplete.event = '';
      lastIncomplete.data = '';
    }
    yield lastIncomplete;
  }
}

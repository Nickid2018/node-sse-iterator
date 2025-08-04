# node-sse-iterator
A library provides an async generator to read server-sent events for node.

## Usage
The library exports only one function `wrapSseStreamToIterator`.
It requires a readable stream, either from web, file system or other sources.
The function is an async generator, which can be used in `for await ... of` statements.

## Example

Use it with `fetch`:

```ts
const res = await fetch('http://localhost:8080/sse');
for await (const message of wrapSseStreamToIterator(res.body)) {
  if (message.event === 'message')
    console.log(message.data);
}
```

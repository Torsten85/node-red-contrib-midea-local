/** Serialize all reads and writes sharing a config node. A failure does not block the queue. */
export function withDevice<T>(node: any, action: () => Promise<T>): Promise<T> {
  const next = (node._commandQueue ?? Promise.resolve()).then(action);
  node._commandQueue = next.catch(() => {});
  return next;
}

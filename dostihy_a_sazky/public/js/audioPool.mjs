// Kruhový pool přehrávacích uzlů — bez DOM, aby šel otestovat.

/**
 * Kolik současně znějících kopií jednoho zvuku pool udrží.
 * Čtyři stačí i na nejhustší sled (tik losování, kroky figurky).
 */
export const POOL_SIZE = 4;

/**
 * Vytvoří pool, který se točí dokola nad nejvýš `size` uzly.
 *
 * Uzly vznikají až když jsou potřeba, takže zvuk, který se nikdy nepřehraje,
 * nic nestojí. Po naplnění se pool už nerozrůstá — to je celý smysl:
 * `play()` dřív klonoval `<audio>` element při každém přehrání.
 */
export function createPool(createNode, size = POOL_SIZE) {
  const capacity = Math.max(1, Math.floor(size) || 1);
  const nodes = [];
  let next = 0;

  return {
    acquire() {
      if (nodes.length < capacity) nodes.push(createNode());
      const node = nodes[next % nodes.length];
      next = (next + 1) % capacity;
      return node;
    },
    get size() {
      return nodes.length;
    },
  };
}

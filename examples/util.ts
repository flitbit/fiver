export const blockUntilCount = (count: number, counter: () => number, intervalMs?: number): Promise<void> => {
  return new Promise(resolve => {
    const h: NodeJS.Timeout[] = [];
    h.push(
      setInterval(() => {
        if (counter() >= count) {
          clearInterval(h[0]);
          resolve();
        }
      }, intervalMs || 100)
    );
  });
};

export const delay = async (ms: number): Promise<void> => {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
};

export const awaitShutdown = async (): Promise<void> => {
  await new Promise((resolve, reject) => {
    process.once('uncaughtException', reject);
    process.once('unhandledRejection', reject);
    process.once('SIGINT', resolve);
  });
};

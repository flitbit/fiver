const blockUntilCount = (count, counterFn, intervalMs) => {
  return new Promise((resolve) => {
    const h = [];
    h.push(
      setInterval(() => {
        if (counterFn() >= count) {
          clearInterval(h[0]);
          resolve();
        }
      }, intervalMs || 100)
    );
  });
};

const delay = async (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const awaitShutdown = async () => {
  await new Promise((resolve, reject) => {
    process.once('uncaughtException', reject);
    process.once('unhandledRejection', reject);
    process.once('SIGINT', resolve);
  });
};

module.exports = {
  blockUntilCount,
  delay,
  awaitShutdown,
};

const FRAMES = ["⠁", "⠂", "⠄", "⠂"];
const INTERVAL = 80;

/**
 * Minimal terminal spinner for non-Ink commands.
 */
export function spinner() {
  let timer: ReturnType<typeof setInterval> | null = null;
  let frameIdx = 0;
  let currentMsg = "";

  function render() {
    const frame = FRAMES[frameIdx % FRAMES.length];
    process.stderr.write(`\r\x1b[K\x1b[36m${frame}\x1b[0m  ${currentMsg}`);
    frameIdx++;
  }

  return {
    start(msg = "") {
      currentMsg = msg;
      frameIdx = 0;
      render();
      timer = setInterval(render, INTERVAL);
    },
    message(msg = "") {
      currentMsg = msg;
    },
    stop(msg = "", code = 0) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      const icon = code === 0 ? "\x1b[32m●\x1b[0m" : "\x1b[31m▲\x1b[0m";
      process.stderr.write(`\r\x1b[K${icon}  ${msg}\n`);
    },
  };
}

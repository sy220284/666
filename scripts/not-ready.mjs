const [ownerTask, command] = process.argv.slice(2);

if (!ownerTask || !command) {
  throw new Error('Usage: node scripts/not-ready.mjs <owner-task> <command>');
}

console.error(
  `${command} is intentionally unavailable until ${ownerTask} establishes its test foundation.`,
);
process.exitCode = 2;

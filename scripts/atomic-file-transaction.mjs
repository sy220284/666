import { randomUUID } from 'node:crypto';
import {
  access,
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const JOURNAL_VERSION = 1;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function syncFile(filePath) {
  const handle = await open(filePath, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(directory) {
  try {
    const handle = await open(directory, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (process.platform !== 'win32') throw error;
  }
}

async function writeJournal(journalPath, journal) {
  const temporaryPath = `${journalPath}.next`;
  await writeFile(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
  await syncFile(temporaryPath);
  await rename(temporaryPath, journalPath);
  await syncDirectory(path.dirname(journalPath));
}

async function cleanupEntry(entry) {
  await rm(entry.temporaryPath, { force: true });
  await rm(entry.backupPath, { force: true });
}

async function rollbackEntry(entry) {
  if (await exists(entry.backupPath)) {
    await rm(entry.targetPath, { force: true });
    await rename(entry.backupPath, entry.targetPath);
    await syncDirectory(path.dirname(entry.targetPath));
  } else if (!entry.hadOriginal) {
    await rm(entry.targetPath, { force: true });
    await syncDirectory(path.dirname(entry.targetPath));
  }
  await rm(entry.temporaryPath, { force: true });
}

async function rollbackEntries(entries) {
  const errors = [];
  for (const entry of [...entries].reverse()) {
    try {
      await rollbackEntry(entry);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Atomic file transaction rollback failed');
  }
}

export async function recoverAtomicFileTransactions(journalDirectory) {
  if (!(await exists(journalDirectory))) return;
  const journals = (await readdir(journalDirectory))
    .filter((entry) => entry.endsWith('.json'))
    .sort();
  for (const journalName of journals) {
    const journalPath = path.join(journalDirectory, journalName);
    const journal = JSON.parse(await readFile(journalPath, 'utf8'));
    if (journal.version !== JOURNAL_VERSION || !Array.isArray(journal.entries)) {
      throw new Error(`Unsupported atomic file transaction journal: ${journalPath}`);
    }
    if (journal.status === 'committed') {
      for (const entry of journal.entries) await cleanupEntry(entry);
    } else if (journal.status === 'staging' || journal.status === 'prepared') {
      await rollbackEntries(journal.entries);
    } else {
      throw new Error(`Unknown atomic file transaction status in ${journalPath}`);
    }
    await rm(journalPath, { force: true });
  }
  await syncDirectory(journalDirectory);
}

export async function writeFilesAtomically(
  entries,
  { journalDirectory, failAfterReplacements = Number.POSITIVE_INFINITY } = {},
) {
  if (!journalDirectory) throw new Error('journalDirectory is required');
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('At least one file entry is required');
  }
  await mkdir(journalDirectory, { recursive: true });
  await recoverAtomicFileTransactions(journalDirectory);

  const id = randomUUID();
  const normalized = [];
  const seen = new Set();
  for (const entry of entries) {
    const targetPath = path.resolve(entry.path);
    if (seen.has(targetPath)) throw new Error(`Duplicate atomic file target: ${targetPath}`);
    seen.add(targetPath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    let hadOriginal = false;
    let mode;
    try {
      const metadata = await lstat(targetPath);
      if (metadata.isSymbolicLink()) {
        throw new Error(`Atomic file targets may not be symbolic links: ${targetPath}`);
      }
      if (!metadata.isFile())
        throw new Error(`Atomic file target is not a regular file: ${targetPath}`);
      hadOriginal = true;
      mode = metadata.mode;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    normalized.push({
      targetPath,
      temporaryPath: path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${id}.tmp`),
      backupPath: path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${id}.bak`),
      hadOriginal,
      mode,
      content: entry.content,
      encoding: entry.encoding,
    });
  }

  const journalPath = path.join(journalDirectory, `${id}.json`);
  const serializableEntries = normalized.map(
    ({ content: _content, encoding: _encoding, ...entry }) => entry,
  );
  const journal = { version: JOURNAL_VERSION, id, status: 'staging', entries: serializableEntries };
  await writeJournal(journalPath, journal);

  try {
    for (const entry of normalized) {
      await writeFile(entry.temporaryPath, entry.content, entry.encoding);
      if (entry.mode !== undefined) await chmod(entry.temporaryPath, entry.mode);
      await syncFile(entry.temporaryPath);
    }
    journal.status = 'prepared';
    await writeJournal(journalPath, journal);

    let replacements = 0;
    for (const entry of normalized) {
      if (entry.hadOriginal) await rename(entry.targetPath, entry.backupPath);
      await rename(entry.temporaryPath, entry.targetPath);
      await syncDirectory(path.dirname(entry.targetPath));
      replacements += 1;
      if (replacements >= failAfterReplacements) {
        throw new Error(
          `Injected atomic file transaction failure after ${replacements} replacements`,
        );
      }
    }
  } catch (error) {
    try {
      await rollbackEntries(serializableEntries);
      await rm(journalPath, { force: true });
      await syncDirectory(journalDirectory);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Atomic file transaction and rollback failed',
        { cause: rollbackError },
      );
    }
    throw new Error(error instanceof Error ? error.message : 'Atomic file transaction failed', {
      cause: error,
    });
  }

  journal.status = 'committed';
  await writeJournal(journalPath, journal);
  try {
    for (const entry of normalized) await cleanupEntry(entry);
    await rm(journalPath, { force: true });
    await syncDirectory(journalDirectory);
  } catch {
    // The committed journal is intentionally retained. The next command will finish cleanup.
  }
}

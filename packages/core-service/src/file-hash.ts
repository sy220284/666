import { createHash, type Hash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function updateHashWithFile(hash: Hash, filePath: string): Promise<void> {
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await updateHashWithFile(hash, filePath);
  return hash.digest('hex');
}

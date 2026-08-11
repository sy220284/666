import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const expectedSpdx = "MIT";

export function validateLicenseMetadata({ packageJson, licenseSource }) {
  const errors = [];
  if (packageJson?.license !== expectedSpdx) {
    errors.push(
      `package.json license must be ${expectedSpdx}, found ${String(packageJson?.license)}`,
    );
  }
  if (
    typeof licenseSource !== "string" ||
    !licenseSource.trimStart().startsWith("MIT License")
  ) {
    errors.push("Root LICENSE must contain the MIT License text");
  }
  return errors;
}

export async function runLicensePolicy(repositoryRoot = root) {
  const [packageSource, licenseSource] = await Promise.all([
    readFile(path.join(repositoryRoot, "package.json"), "utf8"),
    readFile(path.join(repositoryRoot, "LICENSE"), "utf8"),
  ]);
  const errors = validateLicenseMetadata({
    packageJson: JSON.parse(packageSource),
    licenseSource,
  });
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log(`License metadata is consistent: ${expectedSpdx}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runLicensePolicy().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

import {readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";

const root = JSON.parse(readFileSync("package.json", "utf8"));
const packages = readdirSync("packages", {withFileTypes: true})
  .filter((entry) => entry.isDirectory())
  .map((entry) => JSON.parse(readFileSync(join("packages", entry.name, "package.json"), "utf8")));
const expectedVersion = root.version;
const publishable = packages.filter((pkg) => pkg.private !== true);
const errors = [];

for (const pkg of packages) {
  if (pkg.version !== expectedVersion) errors.push(`${pkg.name} is ${pkg.version}; expected ${expectedVersion}`);
  for (const section of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [name, range] of Object.entries(pkg[section] ?? {})) {
      if (String(range).startsWith("file:")) errors.push(`${pkg.name} has a publish-blocking file dependency on ${name}`);
    }
  }
  if (pkg.private !== true && !pkg.publishConfig?.access) errors.push(`${pkg.name} is publishable but has no publishConfig.access`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`validated ${publishable.length} publishable packages at ${expectedVersion}`);

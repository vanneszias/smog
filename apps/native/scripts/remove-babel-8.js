#!/usr/bin/env node

/**
 * Remove Babel 8.x packages from node_modules to prevent conflicts
 * with react-native-worklets plugin during Metro bundling.
 *
 * This is needed because tsdown (used by server/video-worker) requires
 * Babel 8.x beta, but the React Native ecosystem requires Babel 7.x.
 */

const fs = require("node:fs");
const path = require("node:path");

// Find the monorepo root (where the main node_modules is)
function findMonorepoRoot(startDir) {
  let currentDir = startDir;

  while (currentDir !== path.dirname(currentDir)) {
    const packageJsonPath = path.join(currentDir, "package.json");

    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
        if (pkg.workspaces) {
          return currentDir;
        }
      } catch (err) {
        // Continue searching
      }
    }

    currentDir = path.dirname(currentDir);
  }

  return null;
}

// Recursively find all directories matching a pattern
function findBabel8Packages(nodeModulesPath) {
  const babel8Packages = [];

  if (!fs.existsSync(nodeModulesPath)) {
    return babel8Packages;
  }

  // Check .bun directory for Bun's installation structure
  const bunDir = path.join(nodeModulesPath, ".bun");
  if (fs.existsSync(bunDir)) {
    const entries = fs.readdirSync(bunDir);

    for (const entry of entries) {
      // Match @babel+<package>@8.0.0-beta.x pattern
      if (entry.startsWith("@babel+") && entry.includes("@8.0.0-beta")) {
        babel8Packages.push(path.join(bunDir, entry));
      }
    }
  }

  // Also check regular node_modules/@babel structure
  const babelDir = path.join(nodeModulesPath, "@babel");
  if (fs.existsSync(babelDir)) {
    const babelPackages = fs.readdirSync(babelDir);

    for (const pkg of babelPackages) {
      const pkgPath = path.join(babelDir, pkg);
      const packageJsonPath = path.join(pkgPath, "package.json");

      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, "utf8")
          );
          if (
            packageJson.version &&
            packageJson.version.startsWith("8.0.0-beta")
          ) {
            babel8Packages.push(pkgPath);
          }
        } catch (err) {
          // Skip invalid package.json files
        }
      }
    }
  }

  return babel8Packages;
}

// Remove directory recursively
function removeDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`✓ Removed: ${path.basename(dirPath)}`);
    return true;
  }
  return false;
}

// Main execution
function main() {
  console.log("🔍 Checking for Babel 8.x packages...\n");

  const monorepoRoot = findMonorepoRoot(__dirname);

  if (!monorepoRoot) {
    console.log("❌ Could not find monorepo root");
    process.exit(1);
  }

  console.log(`📦 Monorepo root: ${monorepoRoot}\n`);

  const nodeModulesPath = path.join(monorepoRoot, "node_modules");
  const babel8Packages = findBabel8Packages(nodeModulesPath);

  if (babel8Packages.length === 0) {
    console.log("✅ No Babel 8.x packages found. Build should succeed!\n");
    process.exit(0);
  }

  console.log(`⚠️  Found ${babel8Packages.length} Babel 8.x package(s):\n`);

  let removedCount = 0;
  for (const pkgPath of babel8Packages) {
    console.log(`   Removing: ${path.relative(nodeModulesPath, pkgPath)}`);
    if (removeDirectory(pkgPath)) {
      removedCount++;
    }
  }

  console.log(`\n✅ Removed ${removedCount} Babel 8.x package(s)\n`);
  console.log("ℹ️  Metro bundler will now use Babel 7.x\n");
}

main();

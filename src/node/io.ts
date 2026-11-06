import { readFile, writeFile } from "fs/promises";
import { dirname, basename, join } from "path";
import { parse, serialize } from "../parse";
import { loadProject, mergeProject, type Project } from "../project";
import type { AideTree } from "../types";

// Filesystem wrappers around the isomorphic parse/serialize core.

/**
 * Read and parse a .aide YAML file.
 */
export async function read(path: string): Promise<AideTree> {
  return parse(await readFile(path, "utf-8"));
}

/**
 * Write an aide tree to a .aide YAML file.
 */
export async function write(path: string, tree: AideTree): Promise<void> {
  await writeFile(path, serialize(tree), "utf-8");
}

/**
 * Read an aide and every child aide it delegates to (SPEC §8). Children are
 * resolved in the same directory as `path` (COMP-3/4); missing children are
 * reported in `project.unresolved`, not thrown.
 */
export async function readProject(path: string): Promise<Project> {
  const dir = dirname(path);
  const rootTree = await read(path);
  return loadProject(basename(path), rootTree, async (filename) => {
    try {
      return await read(join(dir, filename));
    } catch {
      return null;
    }
  });
}

/**
 * Read an aide as the merged view of its whole project (SPEC §8.5): one tree
 * containing every entity and relationship of the root and its children.
 * For a project with no children this equals read(path).
 */
export async function readMerged(path: string): Promise<AideTree> {
  return mergeProject(await readProject(path));
}

import { readFile, writeFile } from "fs/promises";
import { dirname, basename, join } from "path";
import { parse, serialize } from "../parse";
import { loadProject, mergeProject, lintProject, isRootAideFilename, type Project, type ProjectLintResult } from "../project";
import { lint } from "../tree";
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

/**
 * Lint whatever `path` is (SPEC §11, L2):
 * - a root aide → the whole project (W11, S8 included);
 * - a child aide (COMP-8) → that aide alone, with its ancestors' ids visible
 *   (COMP-12), loaded by file name: bantay.visualize.aide → bantay.aide.
 *   If an ancestor file is missing, unknown `to` endpoints are S8 warnings.
 */
export async function lintFile(path: string): Promise<ProjectLintResult> {
  const dir = dirname(path);
  const filename = basename(path);
  if (isRootAideFilename(filename)) {
    return lintProject(await readProject(path));
  }

  const tree = await read(path);
  const segments = filename.replace(/\.aide$/, "").split(".");
  const inheritedIds: string[] = [];
  let ancestorsUnavailable = false;
  for (let i = 1; i < segments.length; i++) {
    const ancestorFile = join(dir, segments.slice(0, i).join(".") + ".aide");
    try {
      inheritedIds.push(...Object.keys((await read(ancestorFile)).entities));
    } catch {
      ancestorsUnavailable = true;
    }
  }
  const result = lint(tree, { inheritedIds, ancestorsUnavailable });
  const ref = segments.join(".");
  return { ...result, aides: { [ref]: result } };
}

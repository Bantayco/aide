import { readFile, writeFile } from "fs/promises";
import { parse, serialize } from "../parse";
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

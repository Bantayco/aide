/**
 * Composition (SPEC §8): a project is a root aide plus the child aides it
 * references through `delegates_to`, transitively. This module is isomorphic:
 * it takes a loader so the browser (gloss) and node (bantay) can both use it.
 */

import { lint } from "./tree";
import { normalizeRelationshipType } from "./parse";
import {
  EXTERNAL_REF_PATTERN,
  RESERVED_SECTION_IDS,
  type AideTree,
  type Entity,
  type LintResult,
} from "./types";

/** Root aide name from a file name: "bantay.aide" → "bantay"; "bantay.visualize.aide" → "bantay". */
export function aideNameOf(filename: string): string {
  const stem = filename.replace(/\.aide$/, "");
  return stem.split(".")[0];
}

/** External reference from a file name: "bantay.visualize.aide" → "bantay.visualize". Root → "bantay". */
export function refOf(filename: string): string {
  return filename.replace(/\.aide$/, "");
}

/** True for a root aide file name (no dots besides the extension) — SPEC COMP-1. */
export function isRootAideFilename(filename: string): boolean {
  return /^[a-z][a-z0-9_]*\.aide$/.test(filename);
}

/** File name an external reference resolves to — SPEC COMP-4. */
export function fileForRef(ref: string): string {
  if (!EXTERNAL_REF_PATTERN.test(ref)) {
    throw new Error(`Invalid external reference "${ref}"`);
  }
  return `${ref}.aide`;
}

/** External references this document delegates to (de-duplicated, in order). */
export function externalRefs(tree: AideTree): string[] {
  const out: string[] = [];
  for (const r of tree.relationships) {
    if (
      normalizeRelationshipType(String(r.type)) === "delegates_to" &&
      EXTERNAL_REF_PATTERN.test(r.to) &&
      !out.includes(r.to)
    ) {
      out.push(r.to);
    }
  }
  return out;
}

export interface ProjectAide {
  /** External reference of this aide; the root's is its aide-name. */
  ref: string;
  tree: AideTree;
  /** Reference of the aide that delegated to this one (undefined for the root). */
  parent?: string;
}

export interface Project {
  root: ProjectAide;
  /** Every aide in the project keyed by ref, root included. */
  aides: Record<string, ProjectAide>;
  /** References whose file could not be loaded (SPEC COMP-5). */
  unresolved: Array<{ ref: string; from: string }>;
}

/** Loader: given a file name (e.g. "bantay.visualize.aide"), return its tree or null if absent. */
export type AideLoader = (filename: string) => Promise<AideTree | null>;

/**
 * Load a project from its root. Follows delegates_to references transitively.
 */
export async function loadProject(
  rootFilename: string,
  rootTree: AideTree,
  load: AideLoader
): Promise<Project> {
  const rootRef = refOf(rootFilename);
  const root: ProjectAide = { ref: rootRef, tree: rootTree };
  const aides: Record<string, ProjectAide> = { [rootRef]: root };
  const unresolved: Project["unresolved"] = [];
  const queue: ProjectAide[] = [root];

  while (queue.length) {
    const current = queue.shift()!;
    for (const ref of externalRefs(current.tree)) {
      if (aides[ref]) continue;
      const tree = await load(fileForRef(ref));
      if (!tree) {
        unresolved.push({ ref, from: current.ref });
        continue;
      }
      const child: ProjectAide = { ref, tree, parent: current.ref };
      aides[ref] = child;
      queue.push(child);
    }
  }

  return { root, aides, unresolved };
}

/** Ancestors of an aide, nearest first. */
export function ancestorsOf(project: Project, ref: string): ProjectAide[] {
  const out: ProjectAide[] = [];
  let cur = project.aides[ref]?.parent;
  while (cur) {
    const a = project.aides[cur];
    if (!a) break;
    out.push(a);
    cur = a.parent;
  }
  return out;
}

const isSection = (id: string) => (RESERVED_SECTION_IDS as readonly string[]).includes(id);

/**
 * Merged view (SPEC §8.5): the union of all entities in the project with each
 * document's section entities collapsed into the root's. Children's root
 * pages are re-parented under the root page so the result is one tree.
 */
export function mergeProject(project: Project): AideTree {
  const rootTree = project.root.tree;
  const rootId = Object.entries(rootTree.entities).find(([, e]) => e.parent === undefined)?.[0];
  const entities: Record<string, Entity> = { ...rootTree.entities };
  const relationships = [...rootTree.relationships];

  for (const aide of Object.values(project.aides)) {
    if (aide === project.root) continue;
    const childRootId = Object.entries(aide.tree.entities).find(([, e]) => e.parent === undefined)?.[0];
    for (const [id, e] of Object.entries(aide.tree.entities)) {
      if (isSection(id)) continue; // collapsed into the root's section
      if (entities[id]) continue; // W11 violation reported by lintProject; first wins here
      const entity: Entity = { ...e };
      if (id === childRootId && rootId) {
        entity.parent = rootId;
      }
      entities[id] = entity;
    }
    relationships.push(...aide.tree.relationships);
  }

  return { ...rootTree, entities, relationships };
}

export interface ProjectLintResult extends LintResult {
  /** Per-aide results keyed by ref. */
  aides: Record<string, LintResult>;
}

/**
 * Lint every aide in a project (SPEC §9, L2 "when given a project"):
 * each document on its own with ancestor ids visible (COMP-12), plus the
 * project-level rules W11 (id uniqueness) and S8 (unresolved references).
 */
export function lintProject(project: Project): ProjectLintResult {
  const aides: Record<string, LintResult> = {};
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const aide of Object.values(project.aides)) {
    const inheritedIds = ancestorsOf(project, aide.ref).flatMap((a) => Object.keys(a.tree.entities));
    const r = lint(aide.tree, { inheritedIds });
    aides[aide.ref] = r;
    const tag = aide === project.root ? "" : `[${aide.ref}] `;
    errors.push(...r.errors.map((e) => tag + e));
    warnings.push(...r.warnings.map((w) => tag + w));
  }

  // W11: non-section ids unique across the project
  const owner = new Map<string, string>();
  for (const aide of Object.values(project.aides)) {
    for (const id of Object.keys(aide.tree.entities)) {
      if (isSection(id)) continue;
      const prev = owner.get(id);
      if (prev && prev !== aide.ref) {
        errors.push(`W11: id "${id}" is defined in both ${prev} and ${aide.ref}`);
      } else {
        owner.set(id, aide.ref);
      }
    }
  }

  // S8: unresolved references
  for (const u of project.unresolved) {
    warnings.push(`S8: ${u.from} delegates to "${u.ref}" but ${fileForRef(u.ref)} was not found`);
  }

  return { errors, warnings, aides };
}

import * as yaml from "js-yaml";
import {
  DEPRECATED_RELATIONSHIP_TYPES,
  type AideTree,
  type Entity,
  type Relationship,
  type RelationshipType,
} from "./types";

// Parse/serialize live in the isomorphic core: js-yaml runs in the browser, so
// gloss can read and write .aide content client-side. Only the filesystem
// wrappers (read/write) are node-only — see ./node/io.

const KNOWN_TOP_LEVEL_KEYS = new Set(["spec", "entities", "relationships"]);

/**
 * Map a relationship type as written to its canonical name (SPEC §6.1).
 * Unknown types pass through unchanged so validate() can report them.
 */
export function normalizeRelationshipType(type: string): string {
  return DEPRECATED_RELATIONSHIP_TYPES[type] ?? type;
}

/**
 * Parse .aide YAML content into an AideTree.
 *
 * - Deprecated relationship aliases are normalized (SPEC §6.1).
 * - `spec` and unknown top-level keys are preserved (SPEC §8.2).
 */
export function parse(content: string): AideTree {
  const parsed = (yaml.load(content) ?? {}) as Record<string, unknown>;

  const entities: Record<string, Entity> = {};
  const relationships: Relationship[] = [];

  const rawEntities = parsed.entities as Record<string, unknown> | undefined;
  if (rawEntities && typeof rawEntities === "object") {
    for (const [id, value] of Object.entries(rawEntities)) {
      const entity = (value ?? {}) as Record<string, unknown>;
      entities[id] = {
        display: entity.display as string | undefined,
        parent: entity.parent as string | undefined,
        props: entity.props as Record<string, unknown> | undefined,
      };
    }
  }

  if (Array.isArray(parsed.relationships)) {
    for (const rel of parsed.relationships) {
      const r = (rel ?? {}) as Record<string, unknown>;
      relationships.push({
        from: r.from as string,
        to: r.to as string,
        type: normalizeRelationshipType(String(r.type)) as RelationshipType,
        cardinality: r.cardinality as string,
      } as Relationship);
    }
  }

  const tree: AideTree = { entities, relationships };

  if (typeof parsed.spec === "string") {
    tree.spec = parsed.spec;
  }

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      extra[key] = value;
    }
  }
  if (Object.keys(extra).length > 0) {
    tree.extra = extra;
  }

  return tree;
}

/**
 * Serialize an AideTree to .aide YAML content.
 * Key order: spec, entities, relationships, then preserved unknown keys.
 */
export function serialize(tree: AideTree): string {
  const doc: Record<string, unknown> = {};
  if (tree.spec !== undefined) doc.spec = tree.spec;
  doc.entities = tree.entities;
  doc.relationships = tree.relationships;
  if (tree.extra) {
    for (const [key, value] of Object.entries(tree.extra)) {
      if (!KNOWN_TOP_LEVEL_KEYS.has(key)) doc[key] = value;
    }
  }

  return yaml.dump(doc, {
    indent: 2,
    lineWidth: -1, // don't wrap lines
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });
}

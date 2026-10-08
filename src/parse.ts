import * as yaml from "js-yaml";
import type {
  AideTree,
  Entity,
  Relationship,
  RelationshipType,
} from "./types";

// Parse/serialize live in the isomorphic core: js-yaml runs in the browser, so
// gloss can read and write .aide content client-side. Only the filesystem
// wrappers (read/write) are node-only — see ./node/io.

/**
 * Parse .aide YAML content into an AideTree.
 */
export function parse(content: string): AideTree {
  const parsed = (yaml.load(content) ?? {}) as {
    entities?: Record<string, unknown>;
    relationships?: unknown[];
  };

  const entities: Record<string, Entity> = {};
  const relationships: Relationship[] = [];

  if (parsed.entities) {
    for (const [id, value] of Object.entries(parsed.entities)) {
      const entity = value as Record<string, unknown>;
      entities[id] = {
        display: entity.display as string | undefined,
        parent: entity.parent as string | undefined,
        props: entity.props as Record<string, unknown> | undefined,
      };
    }
  }

  if (parsed.relationships && Array.isArray(parsed.relationships)) {
    for (const rel of parsed.relationships) {
      const r = rel as Record<string, unknown>;
      relationships.push({
        from: r.from as string,
        to: r.to as string,
        type: r.type as RelationshipType,
        cardinality: r.cardinality as string,
      } as Relationship);
    }
  }

  return { entities, relationships };
}

/**
 * Serialize an AideTree to .aide YAML content.
 */
export function serialize(tree: AideTree): string {
  return yaml.dump(
    {
      entities: tree.entities,
      relationships: tree.relationships,
    },
    {
      indent: 2,
      lineWidth: -1, // don't wrap lines
      noRefs: true,
      sortKeys: false,
      quotingType: '"',
      forceQuotes: false,
    }
  );
}

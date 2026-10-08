import { readFile, writeFile } from "fs/promises";
import * as yaml from "js-yaml";
import {
  type AideTree,
  type Entity,
  type Relationship,
  type RelationshipType,
} from "../types";

/**
 * Read and parse a .aide YAML file
 */
export async function read(path: string): Promise<AideTree> {
  const content = await readFile(path, "utf-8");
  const parsed = yaml.load(content) as {
    entities?: Record<string, unknown>;
    relationships?: unknown[];
  };

  const entities: Record<string, Entity> = {};
  const relationships: Relationship[] = [];

  // Parse entities
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

  // Parse relationships
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
 * Write an aide tree to a .aide YAML file
 */
export async function write(path: string, tree: AideTree): Promise<void> {
  const content = yaml.dump(
    {
      entities: tree.entities,
      relationships: tree.relationships,
    },
    {
      indent: 2,
      lineWidth: -1, // Don't wrap lines
      noRefs: true,
      sortKeys: false,
      quotingType: '"',
      forceQuotes: false,
    }
  );
  await writeFile(path, content, "utf-8");
}

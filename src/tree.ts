import {
  type AideTree,
  type Entity,
  type Relationship,
  type AddEntityOptions,
  type RemoveEntityOptions,
  type AddRelationshipOptions,
  type LintResult,
  VALID_RELATIONSHIP_TYPES,
  VALID_CARDINALITIES,
  VALID_TIERS,
  RELATIONSHIP_SIGNATURES,
  ID_PATTERN,
  ID_MAX_LENGTH,
  EXTERNAL_REF_PATTERN,
  ID_PREFIX_CONVENTIONS,
  SCENARIO_PREFIX,
} from "./types";
import { normalizeRelationshipType } from "./parse";

/**
 * Add an entity to the tree
 */
export function addEntity(tree: AideTree, options: AddEntityOptions): AideTree {
  const { parent, display, props } = options;
  let { id } = options;

  // Validate parent exists if specified
  if (parent && !tree.entities[parent]) {
    throw new Error(`Parent entity "${parent}" not found`);
  }

  // Auto-generate ID if not provided
  if (!id) {
    id = generateEntityId(tree, parent);
  }

  // Check for duplicate ID
  if (tree.entities[id]) {
    throw new Error(`Entity "${id}" already exists`);
  }

  // Create new entity
  const entity: Entity = {};
  if (display) entity.display = display;
  if (parent) entity.parent = parent;
  if (props) entity.props = props;

  // Return new tree with entity added
  return {
    ...tree,
    entities: {
      ...tree.entities,
      [id]: entity,
    },
    relationships: [...tree.relationships],
  };
}

/**
 * Remove an entity from the tree
 */
export function removeEntity(
  tree: AideTree,
  id: string,
  options: RemoveEntityOptions = {}
): AideTree {
  const { force = false } = options;

  // Check entity exists
  if (!tree.entities[id]) {
    throw new Error(`Entity "${id}" not found`);
  }

  // Find relationships involving this entity
  const involvedRelationships = tree.relationships.filter(
    (r) => r.from === id || r.to === id
  );

  if (involvedRelationships.length > 0 && !force) {
    throw new Error(
      `Cannot remove "${id}": relationships exist. Use force=true to remove anyway.`
    );
  }

  // Find all child entities (cascade)
  const idsToRemove = new Set<string>([id]);
  findChildEntities(tree, id, idsToRemove);

  // Remove entities
  const newEntities: Record<string, Entity> = {};
  for (const [entityId, entity] of Object.entries(tree.entities)) {
    if (!idsToRemove.has(entityId)) {
      newEntities[entityId] = entity;
    }
  }

  // Remove relationships involving removed entities
  const newRelationships = tree.relationships.filter(
    (r) => !idsToRemove.has(r.from) && !idsToRemove.has(r.to)
  );

  return {
    ...tree,
    entities: newEntities,
    relationships: newRelationships,
  };
}

/**
 * Add a relationship to the tree
 */
export function addRelationship(
  tree: AideTree,
  options: AddRelationshipOptions
): AideTree {
  const { from, to, cardinality } = options;
  const type = normalizeRelationshipType(options.type) as typeof options.type;

  // Validate 'from' entity exists
  if (!tree.entities[from]) {
    throw new Error(`"from" entity "${from}" not found`);
  }

  // Validate 'to' entity exists (external references allowed for delegates_to)
  if (!tree.entities[to] && !(type === "delegates_to" && EXTERNAL_REF_PATTERN.test(to))) {
    throw new Error(`"to" entity "${to}" not found`);
  }

  // Validate relationship type
  if (!VALID_RELATIONSHIP_TYPES.includes(type)) {
    throw new Error(
      `Invalid relationship type "${type}". Valid types: ${VALID_RELATIONSHIP_TYPES.join(", ")}`
    );
  }

  if (!VALID_CARDINALITIES.includes(cardinality)) {
    throw new Error(
      `Invalid cardinality "${cardinality}". Valid values: ${VALID_CARDINALITIES.join(", ")}`
    );
  }

  const relationship: Relationship = { from, to, type, cardinality };

  return {
    ...tree,
    entities: { ...tree.entities },
    relationships: [...tree.relationships, relationship],
  };
}

/**
 * Validate the aide tree against the well-formedness rules W1–W10 (SPEC §7)
 * and return an array of error messages. Empty array means well-formed.
 */
export function validate(tree: AideTree): string[] {
  return lint(tree).errors;
}

/**
 * Full lint pass: W-rules as errors, S-rules as warnings (SPEC §7).
 */
export interface LintOptions {
  /** Ids defined in ancestor aides (SPEC §8.6, COMP-12): relationship endpoints may reference them. */
  inheritedIds?: Iterable<string>;
}

export function lint(tree: AideTree, options: LintOptions = {}): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entities = tree.entities;
  const inherited = new Set(options.inheritedIds ?? []);
  const has = (id: string) => Object.prototype.hasOwnProperty.call(entities, id);
  const hasOrInherited = (id: string) => has(id) || inherited.has(id);
  const kind = (id: string) => kindOf(id);

  // W3: id grammar
  for (const id of Object.keys(entities)) {
    if (!ID_PATTERN.test(id) || id.length > ID_MAX_LENGTH) {
      errors.push(`W3: Invalid entity id "${id}" (must match ${ID_PATTERN}, max ${ID_MAX_LENGTH} chars)`);
    }
  }

  // W2: parents exist, parent graph is a tree
  for (const [id, entity] of Object.entries(entities)) {
    if (entity.parent !== undefined && !has(entity.parent)) {
      errors.push(`W2: Entity "${id}" has missing parent "${entity.parent}"`);
    }
  }
  for (const id of Object.keys(entities)) {
    const seen = new Set<string>();
    let cur: string | undefined = id;
    while (cur !== undefined && has(cur)) {
      if (seen.has(cur)) {
        errors.push(`W2: Parent cycle involving "${cur}"`);
        break;
      }
      seen.add(cur);
      cur = entities[cur].parent;
    }
  }

  // W1: exactly one root
  const roots = Object.entries(entities)
    .filter(([, e]) => e.parent === undefined)
    .map(([id]) => id);
  if (Object.keys(entities).length > 0 && roots.length !== 1) {
    errors.push(
      roots.length === 0
        ? "W1: No root entity (every entity has a parent)"
        : `W1: Multiple root entities: ${roots.join(", ")}`
    );
  }

  // W4–W7: relationships
  const seenRels = new Set<string>();
  for (const rel of tree.relationships) {
    const where = `relationship ${rel.from} -[${rel.type}]-> ${rel.to}`;
    const type = normalizeRelationshipType(String(rel.type));
    const typeKnown = (VALID_RELATIONSHIP_TYPES as readonly string[]).includes(type);

    if (!typeKnown) {
      errors.push(`W5: Invalid relationship type "${rel.type}" in ${where}`);
    }
    if (!(VALID_CARDINALITIES as readonly string[]).includes(rel.cardinality)) {
      errors.push(`W5: Invalid cardinality "${rel.cardinality}" in ${where}`);
    }
    if (!has(rel.from)) {
      errors.push(`W4: Orphaned relationship: "from" entity "${rel.from}" not found`);
    }
    const externalOk = type === "delegates_to" && EXTERNAL_REF_PATTERN.test(rel.to);
    if (!hasOrInherited(rel.to) && !externalOk) {
      errors.push(`W4: Orphaned relationship: "to" entity "${rel.to}" not found`);
    }

    if (typeKnown) {
      const sig = RELATIONSHIP_SIGNATURES[type as keyof typeof RELATIONSHIP_SIGNATURES];
      const fromKind = kind(rel.from);
      const toKind = kind(rel.to);
      if (fromKind && !sig.from.includes(fromKind)) {
        errors.push(`W6: ${type} "from" must be a ${sig.from.join("* or ")}* entity, got "${rel.from}"`);
      }
      if (sig.to && toKind && toKind !== sig.to) {
        errors.push(`W6: ${type} "to" must be a ${sig.to}* entity, got "${rel.to}"`);
      }
    }

    const key = `${rel.from}|${type}|${rel.to}`;
    if (seenRels.has(key)) {
      errors.push(`W7: Duplicate ${where}`);
    }
    seenRels.add(key);
  }

  // W10: depends_on acyclic
  const deps = new Map<string, string[]>();
  for (const rel of tree.relationships) {
    if (normalizeRelationshipType(String(rel.type)) === "depends_on") {
      deps.set(rel.from, [...(deps.get(rel.from) ?? []), rel.to]);
    }
  }
  const cycle = findCycle(deps);
  if (cycle) {
    errors.push(`W10: depends_on cycle: ${cycle.join(" -> ")}`);
  }

  // W8 + W9: kind-specific props. Missing REQUIRED props are S7 warnings
  // (completeness); present-but-wrong props are W8 errors.
  for (const [id, entity] of Object.entries(entities)) {
    const k = kind(id);
    const props = entity.props ?? {};
    const check = (name: string, type: "string" | "boolean" | "string|array" = "string", required = true): boolean => {
      const v = props[name];
      if (v === undefined) {
        if (required) warnings.push(`S7: ${id} is missing required prop "${name}"`);
        return false;
      }
      const ok =
        type === "string" ? typeof v === "string" && v.length > 0
        : type === "boolean" ? typeof v === "boolean"
        : typeof v === "string" || (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string"));
      if (!ok) errors.push(`W8: ${id}.${name} must be a ${type === "string|array" ? "string or string[]" : type}`);
      return ok;
    };
    switch (k) {
      case "cuj_":
        check("feature");
        if (check("tier") && !(VALID_TIERS as readonly string[]).includes(props.tier as string)) {
          errors.push(`W8: ${id}.tier must be one of ${VALID_TIERS.join(", ")}`);
        }
        break;
      case "sc_":
        check("name"); check("given"); check("when"); check("then", "string|array");
        if (!entity.parent || kind(entity.parent) !== "cuj_") {
          errors.push(`W8: ${id} must have a cuj_* parent`);
        }
        break;
      case "inv_":
        check("statement"); check("category");
        check("done", "boolean", false);
        break;
      case "con_":
        check("text"); check("domain");
        break;
      case "found_":
      case "wis_":
        check("text");
        break;
      case "comp_":
        if (props.variants !== undefined && !(Array.isArray(props.variants) && props.variants.every((x) => typeof x === "string"))) {
          errors.push(`W8: ${id}.variants must be a string[]`);
        }
        break;
      case "st_": {
        if (check("screen") && !has(props.screen as string)) {
          errors.push(`W9: ${id}.screen references missing screen "${props.screen}"`);
        }
        check("initial", "boolean", false);
        for (const [pk, pv] of Object.entries(props)) {
          if (!pk.startsWith("comp_")) continue;
          if (!has(pk)) {
            errors.push(`W9: ${id}.${pk} references missing component "${pk}"`);
          } else {
            const variants = entities[pk].props?.variants;
            if (Array.isArray(variants) && !variants.includes(pv)) {
              errors.push(`W9: ${id}.${pk}="${pv}" is not a declared variant of ${pk}`);
            }
          }
        }
        break;
      }
      case "tr_":
        for (const end of ["from", "to"] as const) {
          if (check(end) && (!has(props[end] as string) || kind(props[end] as string) !== "st_")) {
            errors.push(`W9: ${id}.${end} references missing state "${props[end]}"`);
          }
        }
        check("action");
        if (typeof props.trigger === "string" && !has(props.trigger)) {
          errors.push(`W9: ${id}.trigger references missing component "${props.trigger}"`);
        }
        break;
    }
  }

  // ---- S-rules (warnings) ----

  // S6: kind under conventional section
  for (const [section, prefix] of Object.entries(ID_PREFIX_CONVENTIONS)) {
    for (const [id, entity] of Object.entries(entities)) {
      if (id.startsWith(prefix) && has(section) && entity.parent !== section) {
        warnings.push(`S6: ${id} is not under its conventional section "${section}"`);
      }
    }
  }

  // S4: every cuj has a scenario, or delegates the whole journey to a child aide
  const scenarioParents = new Set(
    Object.entries(entities).filter(([id]) => kind(id) === "sc_").map(([, e]) => e.parent)
  );
  const delegatingCujs = new Set(
    tree.relationships
      .filter((r) => normalizeRelationshipType(String(r.type)) === "delegates_to" && kind(r.from) === "cuj_")
      .map((r) => r.from)
  );
  for (const id of Object.keys(entities)) {
    if (kind(id) === "cuj_" && !scenarioParents.has(id) && !delegatingCujs.has(id)) {
      warnings.push(`S4: ${id} has no scenarios`);
    }
  }

  // S3: every invariant is protected, implemented, or enforced
  const covered = new Set<string>();
  for (const rel of tree.relationships) {
    const t = normalizeRelationshipType(String(rel.type));
    if (t === "protected_by" || t === "implements") covered.add(rel.to);
  }
  for (const [id, e] of Object.entries(entities)) {
    if (kind(id) !== "inv_") continue;
    const p = e.props ?? {};
    if (!covered.has(id) && !p.checker && !p.test && !p.enforced) {
      warnings.push(`S3: ${id} is unenforced (no protected_by/implements and no checker/test/enforced)`);
    }
  }

  // S5: black-box steps belong to a delegating scenario
  const delegating = new Set(
    tree.relationships
      .filter((r) => normalizeRelationshipType(String(r.type)) === "delegates_to")
      .map((r) => r.from)
  );
  for (const [id, e] of Object.entries(entities)) {
    if (kind(id) !== "sc_") continue;
    const then = e.props?.then;
    const steps = Array.isArray(then) ? then : typeof then === "string" ? [then] : [];
    if (steps.some((s) => typeof s === "string" && s.includes("(black box)")) && !delegating.has(id)) {
      warnings.push(`S5: ${id} has a (black box) step but no delegates_to relationship`);
    }
  }

  // S1/S2: state-machine reachability and liveness
  const states = Object.keys(entities).filter((id) => kind(id) === "st_");
  if (states.length > 0) {
    const out = new Map<string, string[]>();
    for (const [id, e] of Object.entries(entities)) {
      if (kind(id) !== "tr_") continue;
      const from = e.props?.from as string | undefined;
      const to = e.props?.to as string | undefined;
      if (from && to) out.set(from, [...(out.get(from) ?? []), to]);
    }
    const initial = states.filter((id) => entities[id].props?.initial === true);
    const start = initial[0] ?? states[0];
    if (initial.length > 1) warnings.push(`S1: multiple initial states: ${initial.join(", ")}`);
    const reachable = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const s = stack.pop()!;
      if (reachable.has(s)) continue;
      reachable.add(s);
      for (const n of out.get(s) ?? []) stack.push(n);
    }
    for (const s of states) {
      if (!reachable.has(s)) warnings.push(`S1: state ${s} is unreachable from ${start}`);
      if (!out.has(s) && s !== start) warnings.push(`S2: state ${s} has no outgoing transition (terminal?)`);
    }
  }

  return { errors, warnings };
}

/**
 * Core kind prefix of an id, or undefined if it has none (SPEC §3.1).
 */
export function kindOf(id: string): string | undefined {
  for (const prefix of [
    "cuj_", "sc_", "inv_", "con_", "found_", "wis_", "screen_", "comp_", "st_", "tr_",
  ]) {
    if (id.startsWith(prefix)) return prefix;
  }
  return undefined;
}

function findCycle(graph: Map<string, string[]>): string[] | null {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const path: string[] = [];
  const visit = (n: string): string[] | null => {
    color.set(n, GRAY);
    path.push(n);
    for (const m of graph.get(n) ?? []) {
      const c = color.get(m) ?? WHITE;
      if (c === GRAY) return [...path.slice(path.indexOf(m)), m];
      if (c === WHITE) {
        const r = visit(m);
        if (r) return r;
      }
    }
    path.pop();
    color.set(n, BLACK);
    return null;
  };
  for (const n of graph.keys()) {
    if ((color.get(n) ?? WHITE) === WHITE) {
      const r = visit(n);
      if (r) return r;
    }
  }
  return null;
}

// --- Helper Functions ---

/**
 * Find all child entities recursively
 */
function findChildEntities(
  tree: AideTree,
  parentId: string,
  collected: Set<string>
): void {
  for (const [id, entity] of Object.entries(tree.entities)) {
    if (entity.parent === parentId && !collected.has(id)) {
      collected.add(id);
      findChildEntities(tree, id, collected);
    }
  }
}

/**
 * Generate an entity ID based on parent conventions
 */
function generateEntityId(tree: AideTree, parent?: string): string {
  if (!parent) {
    // Generate a generic ID
    let counter = 1;
    while (tree.entities[`entity_${counter}`]) {
      counter++;
    }
    return `entity_${counter}`;
  }

  // Check if parent has a known prefix convention
  let prefix = ID_PREFIX_CONVENTIONS[parent];

  // If parent is a CUJ (starts with cuj_), generate scenario prefix
  if (!prefix && parent.startsWith("cuj_")) {
    prefix = SCENARIO_PREFIX;
  }

  // If parent itself has a prefix, use the same prefix
  if (!prefix) {
    for (const [container, containerPrefix] of Object.entries(
      ID_PREFIX_CONVENTIONS
    )) {
      if (tree.entities[parent]?.parent === container) {
        prefix = containerPrefix;
        break;
      }
    }
  }

  // Default to a generic prefix based on parent
  if (!prefix) {
    prefix = `${parent}_`;
  }

  // Find next available number for this prefix
  let counter = 1;
  while (tree.entities[`${prefix}${counter}`]) {
    counter++;
  }

  return `${prefix}${counter}`;
}

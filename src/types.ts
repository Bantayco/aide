/**
 * Spec version implemented by this package. See SPEC.md.
 */
export const AIDE_SPEC_VERSION = "1.0";

/**
 * Valid relationship types in an aide file (SPEC §6). Closed vocabulary.
 */
export const VALID_RELATIONSHIP_TYPES = [
  "protected_by",
  "depends_on",
  "implements",
  "delegates_to",
  "weakens",
] as const;

export type RelationshipType = (typeof VALID_RELATIONSHIP_TYPES)[number];

/**
 * Deprecated relationship-type names and their canonical replacement
 * (SPEC §6.1, §8.4). Parsers accept these and normalize; writers never emit them.
 */
export const DEPRECATED_RELATIONSHIP_TYPES: Record<string, RelationshipType> = {
  enforced_by: "protected_by",
};

/**
 * Domain (from-prefix) and range (to-prefix) of each relationship type (SPEC §6).
 * `null` range means "any entity or external reference".
 */
export const RELATIONSHIP_SIGNATURES: Record<
  RelationshipType,
  { from: readonly string[]; to: string | null }
> = {
  protected_by: { from: ["sc_"], to: "inv_" },
  depends_on: { from: ["cuj_"], to: "cuj_" },
  implements: { from: ["con_"], to: "inv_" },
  delegates_to: { from: ["sc_", "cuj_"], to: null },
  weakens: { from: ["sc_"], to: "inv_" },
};

/** Reserved section ids are per-document (SPEC §8.5); all other ids are project-unique. */
export const RESERVED_SECTION_IDS = [
  "cujs",
  "invariants",
  "constraints",
  "foundations",
  "wisdom",
] as const;

/**
 * Valid cardinality values
 */
export const VALID_CARDINALITIES = [
  "one_to_one",
  "one_to_many",
  "many_to_one",
  "many_to_many",
] as const;

export type Cardinality = (typeof VALID_CARDINALITIES)[number];

/**
 * Valid CUJ tiers (SPEC §5.1). Closed vocabulary.
 */
export const VALID_TIERS = ["primary", "secondary", "tertiary"] as const;
export type Tier = (typeof VALID_TIERS)[number];

/**
 * Identifier grammar (SPEC §3).
 */
export const ID_PATTERN = /^[a-z][a-z0-9_]*$/;
export const ID_MAX_LENGTH = 64;
/** External reference to an entity in another aide, e.g. `stripe.radar`. */
export const EXTERNAL_REF_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/**
 * A relationship between two entities in the aide tree
 */
export interface Relationship {
  from: string;
  to: string;
  type: RelationshipType;
  cardinality: Cardinality;
}

/**
 * An entity in the aide tree
 */
export interface Entity {
  display?: string;
  parent?: string;
  props?: Record<string, unknown>;
}

/**
 * The complete aide tree structure
 */
export interface AideTree {
  entities: Record<string, Entity>;
  relationships: Relationship[];
  /** Spec version declared by the document (SPEC §2.2). Absent means 1.0. */
  spec?: string;
  /** Unknown top-level keys, preserved for round-trip (SPEC §8.2). */
  extra?: Record<string, unknown>;
}

/**
 * Options for adding an entity
 */
export interface AddEntityOptions {
  id?: string;
  parent?: string;
  display?: string;
  props?: Record<string, unknown>;
}

/**
 * Options for removing an entity
 */
export interface RemoveEntityOptions {
  force?: boolean;
}

/**
 * Options for adding a relationship
 */
export interface AddRelationshipOptions {
  from: string;
  to: string;
  type: RelationshipType;
  cardinality: Cardinality;
}

/**
 * Prefix conventions for auto-generating entity IDs based on parent
 */
export const ID_PREFIX_CONVENTIONS: Record<string, string> = {
  cujs: "cuj_",
  invariants: "inv_",
  constraints: "con_",
  foundations: "found_",
  wisdom: "wis_",
};

/**
 * Prefix for entities under a CUJ (scenarios)
 */
export const SCENARIO_PREFIX = "sc_";

/**
 * Reserved section ids (SPEC §4.3) and the kind prefix each conventionally holds.
 */
export const SECTION_PREFIXES: Record<string, string> = ID_PREFIX_CONVENTIONS;

/**
 * Core entity kinds by id prefix (SPEC §3.1).
 */
export const CORE_KIND_PREFIXES = [
  "cuj_",
  "sc_",
  "inv_",
  "con_",
  "found_",
  "wis_",
  "screen_",
  "comp_",
  "st_",
  "tr_",
] as const;
export type CoreKindPrefix = (typeof CORE_KIND_PREFIXES)[number];

/**
 * Result of a full lint pass: W-rule violations are errors, S-rules are warnings.
 */
export interface LintResult {
  errors: string[];
  warnings: string[];
}

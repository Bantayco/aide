# The `.aide` File Format

**Version:** 1.0 — Draft
**Schema:** [`schema/aide.schema.json`](./schema/aide.schema.json) (JSON Schema 2020-12)
**Reference implementation:** `@bantay/aide` (conformance level L2, §11)

## Abstract

An *aide* is a declarative behavioral specification for a product: what users
accomplish, what must always be true, the decisions that make it true, and how
those parts connect. It is authored by humans and language models and consumed
by build engines, renderers, and agents. This document specifies the syntax of
the `.aide` file, its core vocabulary, the well-formedness rules a validator
enforces, how aides compose into a project, and how the format evolves without
breaking existing files.

## Status of This Document

This is a draft of version 1.0. Normative requirements are labeled `[XX-n]` and
are stable identifiers: a requirement is never renumbered; a withdrawn
requirement keeps its label and is marked withdrawn.

## Table of Contents

1. Introduction
2. Conventions and Terminology
3. Document Syntax
4. Identifiers
5. Entities
6. Core Entity Kinds
7. Relationships
8. Composition: Projects and Child Aides
9. Well-Formedness
10. Evolution and Registries
11. Conformance
12. Security Considerations
13. References
Appendix A — Minimal valid document
Appendix B — Formal correspondence
Appendix C — Design rationale (informative)

---

## 1. Introduction

Spec-first development was always conceptually correct and failed in practice
because humans were the synchronization mechanism between the spec and the
code. An aide is a spec written to be kept in sync by machines: small enough to
fit in a model's context, explicit enough that a validator can check it, and
structured so that the parts an agent may change are separable from the parts
it may not.

This document is the normative definition of the format. The companion guide
*How to Create an .aide* is informative.

### 1.1 Scope

This document defines the `.aide` document (§3–§7), the project formed by a
root aide and its children (§8), the validator's rules (§9), the evolution
policy and registries (§10), and conformance levels (§11).

It does not define the `.aide.lock` snapshot, the diff/reconciliation engine,
the gate that consults a decision model, or any renderer's output. Those
consume this format; they do not extend it.

---

## 2. Conventions and Terminology

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT,
RECOMMENDED, MAY, and OPTIONAL are to be interpreted as described in [RFC2119]
and [RFC8174] when, and only when, they appear in all capitals.

The grammar in this document uses ABNF [RFC5234], including the core rules
`ALPHA`, `DIGIT`, and `LOALPHA` is defined here as `%x61-7A`.

**aide** — a `.aide` document (§3). Also the product specification it holds.

**document** — the JSON-compatible value a `.aide` file parses to.

**entity** — a named node of the document (§5). Its name is its **id** (§4).

**kind** — the category of an entity, determined by its id prefix (§4.2).

**section** — one of five reserved entities that group kinds (§5.3).

**root** — the one entity in a document with no `parent` (§5.2).

**relationship** — a typed, directed edge between two entities (§7).

**external reference** — a name that denotes another aide (§4.3).

**project** — a root aide plus the child aides it references, transitively
(§8).

**child aide** — an aide referenced from another aide by `delegates_to` (§8).

**parser** — software that reads and writes documents (conformance L1).

**validator** — a parser that also reports well-formedness (L2).

**engine** — a validator that also builds, gates or reconciles against aides
(L3).

**W-rule / S-rule** — a well-formedness rule reported as an error / a warning
(§9).

---

## 3. Document Syntax

### 3.1 Encoding

- `[DOC-1]` A `.aide` file MUST be UTF-8 encoded text [RFC3629].
- `[DOC-2]` A `.aide` file MUST be a single YAML 1.2 [YAML] document.
- `[DOC-3]` The document MUST be representable as a JSON value [RFC8259]: no
  anchors or aliases, no tags other than the YAML core schema's implicit
  ones, no non-string mapping keys, no multi-document streams. The JSON form
  is what the schema validates and what the grammar below describes.
- `[DOC-4]` The file extension is `.aide`. Naming of files in a project is
  specified in §8.2.

### 3.2 Structure

```abnf
document      = object-with( "entities" entities,
                             "relationships" relationships,
                             [ "spec" spec-version ],
                             *( unknown-key json-value ) )

spec-version  = DQUOTE "1." 1*DIGIT DQUOTE        ; e.g. "1.0"
entities      = JSON-object ; member names are <id> (§4), values are <entity> (§5)
relationships = JSON-array  ; elements are <relationship> (§7)
unknown-key   = JSON-string ; any member name other than the three above
```

`object-with(...)` denotes a JSON object whose listed members appear in any
order. `JSON-object`, `JSON-array`, `JSON-string`, `json-value` are as in
[RFC8259].

| Member | Type | Required | Reference |
|---|---|---|---|
| `spec` | string | no | §10.1. Absent means `"1.0"`. |
| `entities` | object | **yes** | at least one member |
| `relationships` | array | **yes** | MAY be empty |

- `[DOC-5]` `entities` MUST contain at least one member.
- `[DOC-6]` A parser MUST preserve unknown top-level members on round-trip and
  a consumer MUST ignore those it does not understand (§10.2).

---

## 4. Identifiers

### 4.1 Grammar

```abnf
id            = LOALPHA *63( LOALPHA / DIGIT / "_" )
LOALPHA       = %x61-7A                              ; a-z

aide-name     = id                                   ; a root aide
external-ref  = aide-name 1*( "." id )               ; a child aide, §8

prop-key      = ( ALPHA / "_" ) *( ALPHA / DIGIT / "_" )
hint-key      = "_" *( ALPHA / DIGIT / "_" )         ; presentation hint, §5.1
```

- `[ID-1]` Every entity id MUST match `id` (at most 64 characters).
- `[ID-2]` Ids are unique within a document and, except for section ids,
  within a project (§8.5).
- `[ID-3]` Ids are stable: a published id MUST NOT be renamed. Lock files,
  diffs, tasks and external references are keyed on it.

### 4.2 Kind prefixes

The kind of an entity is determined by the first matching prefix of its id.

| Prefix | Kind | Conventional parent | Section |
|---|---|---|---|
| — | page (root) | — | §5.2 |
| `cuj_` | critical user journey | `cujs` | §6.1 |
| `sc_` | scenario | a `cuj_*` | §6.2 |
| `inv_` | invariant | `invariants` | §6.3 |
| `con_` | constraint | `constraints` | §6.4 |
| `found_` | foundation | `foundations` | §6.5 |
| `wis_` | wisdom | `wisdom` | §6.6 |
| `screen_` | screen | any | §6.7 |
| `comp_` | component | a `screen_*` | §6.7 |
| `st_` | state | any | §6.7 |
| `tr_` | transition | any | §6.7 |

The ids `cujs`, `invariants`, `constraints`, `foundations`, `wisdom` are
**reserved section ids** (§5.3). Prefixes are registered in §10.3.

- `[ID-4]` An id with a prefix not in the registry is permitted; only the
  generic entity rules (§5.1) apply to it.

### 4.3 External references

An `external-ref` denotes another aide in the same project (§8), by name. It
denotes that aide's root entity. External references are permitted only where
§7 says so.

---

## 5. Entities

### 5.1 Entity

```abnf
entity  = object-with( [ "display" JSON-string ],
                       [ "parent"  id ],
                       [ "props"   props ] )
props   = JSON-object  ; member names match <prop-key>
```

| Member | Rules |
|---|---|
| `display` | `[ENT-1]` A rendering hint. It carries no behavioral meaning; consumers MAY ignore it. |
| `parent` | `[ENT-2]` MUST reference an existing entity in the same document. `[ENT-3]` The parent graph MUST be a tree (no cycles). |
| `props` | `[ENT-4]` Member names MUST match `prop-key`. Values are JSON values. |

- `[ENT-5]` A prop whose key matches `hint-key` (leading underscore, e.g.
  `_pattern`, `_group_by`) is a **presentation hint**: it MUST be preserved
  on round-trip and MUST NOT be used by a validator or engine to make a
  decision.
- `[ENT-6]` An entity MUST NOT have members other than `display`, `parent`,
  `props`.

### 5.2 Root

- `[ENT-7]` A document MUST have exactly one root (an entity with no
  `parent`).
- The root SHOULD have `display: page` and the props:

| Prop | Type | Required |
|---|---|---|
| `title` | string | **yes** (completeness, §6) |
| `description` | string | SHOULD |
| `version` | string | no |
| `date` | string, `YYYY-MM-DD` | no |

### 5.3 Sections

- `[ENT-8]` A reserved section entity, when present, MUST be a direct child
  of the root.
- A section MAY be absent, and a kind MAY appear without its section: the
  prefix, not the parent, determines kind. A validator SHOULD warn (S6) when a
  kind is not under its conventional section.

| Id | Holds | Conventional `display` |
|---|---|---|
| `cujs` | `cuj_*` | `table` |
| `invariants` | `inv_*` | `checklist` |
| `constraints` | `con_*` | `list` |
| `foundations` | `found_*` | `list` |
| `wisdom` | `wis_*` | `list` |

---

## 6. Core Entity Kinds

Each kind defines REQUIRED and OPTIONAL props. Additional props are always
permitted (§10.2).

- `[KIND-1]` REQUIRED means *required for the entity to be complete*. A
  validator MUST report a missing REQUIRED prop as a completeness warning
  (S7), not an error, because an aide is a living document that is routinely
  valid-but-incomplete mid-edit.
- `[KIND-2]` A prop that is present with the wrong type, or with a value
  outside a closed vocabulary, MUST be reported as an error (W8).
- The JSON Schema, which has no notion of warnings, validates *complete*
  documents and treats REQUIRED props as required.

### 6.1 `cuj_*` — Critical User Journey

What a user accomplishes. An outcome, not an implementation.

| Prop | Type | Required | Values |
|---|---|---|---|
| `feature` | string | **yes** | outcome statement |
| `tier` | string | **yes** | `primary` \| `secondary` \| `tertiary` (registry §10.3) |
| `area` | string | SHOULD | product domain, free text |

Tier semantics: `primary` — product unusable without it; `secondary` —
important, not existential; `tertiary` — nice to have. Tier drives
verification rigor downstream.

### 6.2 `sc_*` — Scenario

One concrete behavior of a CUJ, in Given/When/Then.

| Prop | Type | Required |
|---|---|---|
| `name` | string | **yes** |
| `given` | string | **yes** |
| `when` | string | **yes** |
| `then` | string or string[] | **yes** |

- `[KIND-3]` A scenario's `parent` MUST be a `cuj_*`.
- A `then` step containing the literal text `(black box)` marks a step whose
  internals are outside this aide's governance; see `delegates_to` (§7.4).

### 6.3 `inv_*` — Invariant

A predicate that MUST hold on every path.

| Prop | Type | Required |
|---|---|---|
| `statement` | string | **yes** |
| `category` | string | **yes** |
| `threat_signal` | string | SHOULD — what intentional violation looks like |
| `done` | boolean | no (default `false`) |
| `checker` | string | no — path to a project checker |
| `test` | string | no — path to a test that enforces it |
| `enforced` | string | no — path to implementation that enforces it directly |
| `survives_skip_permissions` | boolean | no — see `weakens` (§7.5) |

- At most one of `checker`, `test`, `enforced` SHOULD be set. An invariant
  with none, and no `protected_by` or `implements` relationship, is
  **unenforced** (S3).

### 6.4 `con_*` — Constraint

How an invariant is satisfied, and why this way.

| Prop | Type | Required |
|---|---|---|
| `text` | string | **yes** |
| `domain` | string | **yes** |
| `rationale` | string | SHOULD when the decision is non-obvious |
| `decision_date` | string, `YYYY-MM-DD` | no |
| `alternatives_rejected` | string[] | no |

- `[KIND-4]` A constraint is **sticky**: an engine MUST NOT remove or weaken a
  constraint on an agent's proposal unless the proposal addresses
  `rationale`, not merely shows the predicate can be satisfied without it.

### 6.5 `found_*` — Foundation

| Prop | Type | Required |
|---|---|---|
| `text` | string | **yes** |

### 6.6 `wis_*` — Wisdom

| Prop | Type | Required |
|---|---|---|
| `text` | string | **yes** |
| `source` | string | no — incident, ticket, ADR |

Wisdom is advisory. Constraints are mandatory.

### 6.7 `screen_*`, `comp_*`, `st_*`, `tr_*` — the state machine

These kinds encode the application as a labeled transition system
**A = (S, T, s₀, Σ, δ)**: states are screens × component variants; transitions
are labeled edges.

**`screen_*`** — a screen.

| Prop | Type | Required |
|---|---|---|
| `name` | string | SHOULD |
| `description` | string | no |

**`comp_*`** — a component. `parent` SHOULD be a `screen_*`.

| Prop | Type | Required |
|---|---|---|
| `name` | string | SHOULD |
| `type` | string | no |
| `variants` | string[] | no — the closed set of variants the component can be in |

**`st_*`** — a state.

| Prop | Type | Required |
|---|---|---|
| `screen` | id of a `screen_*` | **yes** |
| `initial` | boolean | no — the initial state s₀ |
| `description` | string | no |
| `comp_<x>` | string | no — the variant `comp_<x>` is in |

- `[KIND-5]` `screen` MUST name an existing `screen_*` (W9).
- `[KIND-6]` A prop whose key begins with `comp_` MUST name an existing
  `comp_*`, and its value MUST be one of that component's `variants` when
  `variants` is declared (W9).
- Exactly one `st_*` SHOULD have `initial: true` (S1).

**`tr_*`** — a transition.

| Prop | Type | Required |
|---|---|---|
| `from` | id of a `st_*` | **yes** |
| `to` | id of a `st_*` | **yes** |
| `action` | string | **yes** — the user action, a label in Σ |
| `trigger` | id of a `comp_*` | no — the component that fires it |
| `guard` | string | no — precondition, plain language |

- `[KIND-7]` `from`, `to`, `trigger` MUST name existing entities of the
  stated kinds (W9).
- `[KIND-8]` The set of `tr_*` entities of a project is its **closed
  transition vocabulary**. An engine MUST treat a proposed change to
  application state that is not expressible as exactly one declared `tr_*`
  as *out of vocabulary*, and MUST NOT apply it without a human or governing
  decision.

---

## 7. Relationships

```abnf
relationship = object-with( "from" id,
                            "to"   ( id / external-ref ),
                            "type" rel-type,
                            "cardinality" cardinality )
rel-type     = "protected_by" / "depends_on" / "implements" /
               "delegates_to" / "weakens"
             / "enforced_by"                     ; deprecated alias, §7.1
cardinality  = "one_to_one" / "one_to_many" / "many_to_one" / "many_to_many"
```

- `[REL-1]` `from` MUST name an entity in this document.
- `[REL-2]` `to` MUST name an entity in this document, except that for
  `delegates_to` it MAY be an external reference (§7.4).
- `[REL-3]` `type` and `cardinality` are closed vocabularies (§10.3). A value
  outside them is an error (W5).
- `[REL-4]` Each type has a domain (kind of `from`) and range (kind of
  `to`); a validator MUST enforce them when the endpoint has a registered
  kind (W6).
- `[REL-5]` Two relationships with the same `from`, `to`, `type` are
  duplicates (W7).
- `[REL-6]` A relationship MUST NOT have members other than the four above.

| Type | Domain | Range | Meaning |
|---|---|---|---|
| `protected_by` | `sc_*` | `inv_*` | This scenario is safe because this invariant holds. |
| `depends_on` | `cuj_*` | `cuj_*` | This journey requires that journey. |
| `implements` | `con_*` | `inv_*` | This decision is how that invariant is made true. |
| `delegates_to` | `sc_*` or `cuj_*` | external ref, or any entity | The black-box step (or the whole journey) is specified by that aide. |
| `weakens` | `sc_*` | `inv_*` | While this scenario is active, that invariant's normal enforcement is bypassed. |

### 7.1 `protected_by`

Inverse reading: the invariant *enforces* the scenario.

- `[REL-7]` `enforced_by` is a deprecated alias for `protected_by`. A parser
  MUST accept it and normalize it to `protected_by`; a writer MUST NOT emit
  it.

### 7.2 `depends_on`

- `[REL-8]` `depends_on` MUST NOT form a cycle (W10).

### 7.3 `implements`

Many constraints MAY implement one invariant (defense in depth).

### 7.4 `delegates_to`

From a **scenario**: the `(black box)` step of that scenario is specified by
the referenced aide. From a **CUJ**: the entire journey is specified by the
referenced aide — the parent declares *that* the journey exists and its tier;
the child specifies it. This is the form used for subcommands, services and
sub-products (§8).

- `[REL-9]` A validator MUST NOT report an external reference as a missing
  entity. When the referenced aide's file is available (§8.3), a validator
  SHOULD lint it; when it is not, a validator SHOULD warn (S8).

### 7.5 `weakens`

The invariant still *should* hold; only its mechanism is removed. Pairs with
`inv_*.survives_skip_permissions`.

---

## 8. Composition: Projects and Child Aides

An aide for anything larger than a toy decomposes. A **project** is a root
aide plus the aides it references through `delegates_to`, transitively. A
child aide has the same structure as any aide (§3–§7); what differs is scope.

### 8.1 When to split

A journey, step, or subsystem gets its own aide when it has its own
invariants, its own decisions, or its own team — a subcommand of a CLI, a
fraud model behind a payment, a routing engine behind a map. A simple API
call does not.

### 8.2 Naming

```abnf
root-file   = aide-name ".aide"                  ; bantay.aide
child-file  = external-ref ".aide"               ; bantay.visualize.aide
```

- `[COMP-1]` A root aide's file name MUST be `<aide-name>.aide`, where
  `aide-name` contains no `.`.
- `[COMP-2]` A child aide's file name MUST be its external reference followed
  by `.aide`. The reference is hierarchical: `bantay.visualize` is a child of
  `bantay`; `bantay.visualize.storyboard` a child of `bantay.visualize`.
- `[COMP-3]` A child aide's file MUST live in the same directory as its root
  aide.

### 8.3 Resolution

- `[COMP-4]` An external reference `r` resolves to the file `r + ".aide"` in
  the directory of the referencing aide's root. It denotes the root entity of
  that document.
- `[COMP-5]` A reference whose file does not exist is **unresolved**. It is
  not an error (§7.4): children are routinely written after the parent
  declares them. A validator SHOULD warn (S8).

### 8.4 Discovery

A directory may hold a root aide and several child aides.

- `[COMP-6]` A tool that is given a directory rather than a file MUST select
  the root aide: the `.aide` file whose name contains no `.` other than the
  extension.
- `[COMP-7]` If a directory holds more than one root aide, a tool MUST
  refuse to guess and require the file to be named explicitly.
- `[COMP-8]` A tool that is given a child aide's path explicitly MUST operate
  on that aide alone, unless it documents otherwise.

### 8.5 Identity across a project

- `[COMP-9]` Reserved section ids (`cujs`, `invariants`, …) are **per
  document**: every aide has its own. Every other id MUST be unique across
  the project (W11, checked when the children are available).
- `[COMP-10]` A child aide's root id SHOULD equal the last segment of its
  reference (`visualize` for `bantay.visualize`).

This makes a **merged view** well-defined: the union of all entities in a
project, with each document's section entities collapsed into the root's.
Engines that need "every invariant in the project" operate on the merged
view; engines that edit operate on one document.

### 8.6 Inheritance

- `[COMP-11]` A child aide inherits every invariant, constraint and
  foundation of its ancestors. It MAY add its own. It MUST NOT remove or
  restate an inherited one; to bypass an inherited invariant in a specific
  mode it uses `weakens` (§7.5).
- `[COMP-12]` A relationship in a child aide MAY reference an ancestor's
  entity by id (e.g. a child scenario `protected_by` a root invariant). It
  MUST NOT reference a sibling's or descendant's entity except through
  `delegates_to`.

A validator checks `[COMP-12]` references against the merged view when the
project is available; otherwise it reports them under S8 rather than W4.

### 8.7 Lifecycle

- `[COMP-13]` A child aide MAY be referenced before it is written. Writing it
  later does not change the parent.
- `[COMP-14]` Removing a child aide's file while a `delegates_to` still
  references it returns the reference to unresolved (S8); it is not an error.

---

## 9. Well-Formedness

A document is **well-formed** when every W-rule holds. A validator MUST
report each violation with the offending id or relationship. S-rules are
reported as warnings.

### 9.1 W-rules (errors)

| Rule | Statement | Requirement |
|---|---|---|
| W1 | Exactly one root entity. | ENT-7 |
| W2 | Every `parent` exists; the parent graph is a tree. | ENT-2, ENT-3 |
| W3 | Every id matches the id grammar. | ID-1 |
| W4 | Every relationship `from` exists; every `to` exists or is an external reference on `delegates_to`. | REL-1, REL-2 |
| W5 | Every `type` and `cardinality` is in its vocabulary. | REL-3 |
| W6 | Every relationship respects its type's domain and range. | REL-4 |
| W7 | No duplicate relationships. | REL-5 |
| W8 | Every present prop of a core kind has the right type and a value in its vocabulary; a `sc_*` has a `cuj_*` parent. | KIND-2, KIND-3 |
| W9 | `st_*.screen`, `st_*.comp_*`, `tr_*.from/to/trigger` reference existing entities of the right kind; variants are declared ones. | KIND-5..7 |
| W10 | `depends_on` is acyclic. | REL-8 |
| W11 | *(project)* Non-section ids are unique across the project. | COMP-9 |

### 9.2 S-rules (warnings)

| Rule | Statement |
|---|---|
| S1 | Every `st_*` is reachable from the initial state; at most one `initial`. |
| S2 | Every non-terminal `st_*` has an outgoing `tr_*`. |
| S3 | Every `inv_*` is protected, implemented, or has an enforcement prop. |
| S4 | Every `cuj_*` has at least one `sc_*`, or delegates to a child aide. |
| S5 | Every `(black box)` step belongs to a scenario with `delegates_to`. |
| S6 | A kind is under its conventional section. |
| S7 | Every REQUIRED prop of each core kind is present. |
| S8 | *(project)* Every external reference resolves to an existing file. |

Reachability (S1) and liveness (S2) are the formal well-formedness properties
of the state machine; they are warnings rather than errors because an aide is
a living document and is routinely valid-but-incomplete mid-edit.

---

## 10. Evolution and Registries

The format is **add-only**.

### 10.1 Versioning

- `[EVO-1]` `spec` is `"MAJOR.MINOR"`. A MINOR revision adds kinds, props,
  relationship types or enum values. A MAJOR revision is reserved for a
  change that would make a previously valid document invalid.
- `[EVO-2]` A consumer written against `1.x` MUST accept any `1.y` document,
  ignoring what it does not understand.
- No MAJOR revision is planned. This specification commits to not making one
  without a migration tool.

### 10.2 Unknown content

- `[EVO-3]` Unknown top-level members, unknown props and presentation hints
  MUST survive parse → serialize unchanged in meaning.
- `[EVO-4]` An unknown prop MUST NOT cause validation failure.
- `[EVO-5]` A consumer MUST NOT infer meaning from a prop it does not know.

### 10.3 Registries

The following values are registered here. Adding a value is a MINOR revision
of this document; removing one never happens (§10.4).

**Kind prefixes** (§4.2): `cuj_`, `sc_`, `inv_`, `con_`, `found_`, `wis_`,
`screen_`, `comp_`, `st_`, `tr_`. Unregistered prefixes are permitted
(ID-4); tools SHOULD choose a project-specific prefix (`tok_` for design
tokens) rather than overload a registered one.

**Reserved section ids** (§5.3): `cujs`, `invariants`, `constraints`,
`foundations`, `wisdom`.

**Relationship types** (§7): `protected_by`, `depends_on`, `implements`,
`delegates_to`, `weakens`. Deprecated: `enforced_by` → `protected_by`.

**Cardinalities** (§7): `one_to_one`, `one_to_many`, `many_to_one`,
`many_to_many`.

**Tiers** (§6.1): `primary`, `secondary`, `tertiary`.

Relationship types, cardinalities and tiers are **closed**: a value outside
the registry is an error (W5, W8).

### 10.4 Deprecation

- `[EVO-6]` A deprecated name remains readable indefinitely. Writers
  normalize to the canonical name. Nothing is ever removed.

### 10.5 Instances of a shared definition

When a definition is shared (a template instantiated per event or per
project):

- `[EVO-7]` Definition updates MAY fan out to instances; an instance MAY pin
  a definition version to opt out.
- `[EVO-8]` Instance **state** never changes on a definition update.
- `[EVO-9]` A rule change that makes existing instance state invalid MUST be
  surfaced as a warning in a view and MUST NOT cause the instance to fail to
  load.

---

## 11. Conformance

| Level | Name | Requirement |
|---|---|---|
| L1 | **Parser** | DOC-*, ID-1, ENT-6, REL-6, REL-7 (normalize aliases), EVO-3 (round-trip). |
| L2 | **Validator** | L1 + reports every W-rule as an error and SHOULD report S-rules as warnings. When given a project (§8), also W11 and S8. |
| L3 | **Engine** | L2 + KIND-4 (sticky constraints), KIND-8 (closed transition vocabulary), COMP-6..8 (discovery), COMP-11 (inheritance). |

`@bantay/aide` targets L2. Bantay targets L3.

An implementation claiming a level MUST state which spec version it
implements.

---

## 12. Security Considerations

An aide is an instruction set for agents. Its content is data, not a command
to the tools that process it.

- **Untrusted aides.** An aide obtained from a store or another party may
  contain scenario text, rationale or wisdom crafted to steer an agent. An
  engine MUST treat prose fields as untrusted input to a model and MUST NOT
  execute, fetch or install anything on the strength of an aide's content
  alone. The `checker`, `test` and `enforced` props are paths; an engine MUST
  resolve them inside the project and MUST NOT follow them outside it.
- **External references** name files by a constrained grammar (§4.1) and
  resolve only within the root's directory (COMP-4). An implementation MUST
  NOT resolve a reference to a path outside that directory, and MUST NOT
  treat `.` in a reference as a path separator.
- **Fan-out** (§10.5) means a definition author can change what every
  instance's agent is told. Instances SHOULD be able to pin, and engines
  SHOULD show what changed.
- **Weakening.** `weakens` makes a bypass explicit, which is its purpose; an
  engine SHOULD surface active weakenings prominently, since they are the
  natural place to hide a backdoor.
- The format itself has no executable content and no network behavior.

---

## 13. References

### 13.1 Normative

- [RFC2119] Bradner, S., "Key words for use in RFCs to Indicate Requirement
  Levels", BCP 14, RFC 2119, March 1997.
- [RFC8174] Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key
  Words", BCP 14, RFC 8174, May 2017.
- [RFC5234] Crocker, D., Ed. and P. Overell, "Augmented BNF for Syntax
  Specifications: ABNF", STD 68, RFC 5234, January 2008.
- [RFC3629] Yergeau, F., "UTF-8, a transformation format of ISO 10646", STD
  63, RFC 3629, November 2003.
- [RFC8259] Bray, T., Ed., "The JavaScript Object Notation (JSON) Data
  Interchange Format", STD 90, RFC 8259, December 2017.
- [YAML] "YAML Ain't Markup Language (YAML™) version 1.2", Revision 1.2.2,
  October 2021.
- [JSONSchema] "JSON Schema: A Media Type for Describing JSON Documents",
  draft 2020-12.

### 13.2 Informative

- Cancio, Z., "Behavioral Control Planes for Agentic Software Development",
  2026, and its *Formal Definitions* companion.
- *How to Create an .aide* (companion guide).
- Kubernetes, "Kubernetes Resource Model" — the reconciliation pattern the
  engine follows.

---

## Appendix A — Minimal valid document

```yaml
spec: "1.0"
entities:
  my_app:
    display: page
    props:
      title: My App
      description: One sentence.
  cujs:
    parent: my_app
    display: table
    props: { title: Critical User Journeys }
  cuj_sign_in:
    parent: cujs
    props: { feature: User signs in, tier: primary, area: auth }
  sc_sign_in_ok:
    parent: cuj_sign_in
    props:
      name: Happy path
      given: User has an account
      when: User submits valid credentials
      then:
        - Session created
        - User lands on home
  invariants:
    parent: my_app
    display: checklist
    props: { title: Invariants }
  inv_no_plaintext_passwords:
    parent: invariants
    props:
      statement: Passwords are never stored or logged in plaintext
      category: security
      threat_signal: A password string appears in a log line
relationships:
  - from: sc_sign_in_ok
    to: inv_no_plaintext_passwords
    type: protected_by
    cardinality: many_to_many
```

## Appendix B — Formal correspondence

| This spec | Formal object (*Formal Definitions*) |
|---|---|
| `screen_*` × `comp_*` variants, `st_*` | S (states) |
| `tr_*` | T, Σ, δ |
| `st_*.initial` | s₀ |
| `cuj_*` + ordered `sc_*` | Γ (CUJs); `tier` = κ |
| `inv_*` | I |
| `con_*` (+ `rationale`, `decision_date`, `alternatives_rejected`) | C |
| `relationships` | R |
| `wis_*` | W |
| W1–W11, S1–S8 | Def. 1.6 well-formedness |
| project (§8) | compositional structure F = {F₁, …, Fₙ} (Def. 4.4) |

## Appendix C — Design rationale (informative)

**Why prefixes determine kind.** A kind field would be one more thing to keep
consistent with the id. Prefixes make the kind visible everywhere the id is
quoted — diffs, logs, relationships, prose — which is where a model reads it.

**Why missing props are warnings.** The CLI's own workflows (`aide add`,
`lock`, `diff`) create entities incrementally. Refusing to lock an aide
because a scenario lacks its `then` would push authors to invent filler.

**Why `tr_*` is closed.** The transition set is what an engine gates against.
If an agent could add transitions as freely as it proposes them, the gate
would gate nothing. Adding a transition is a spec change and belongs to the
organizer.

**Why children are files, not nested objects.** Separate files give separate
diffs, separate locks, separate owners, and let a child be written later or
by another team. The merged view (§8.5) recovers the whole when a tool needs
it.

**Why add-only.** Every aide is a long-lived artifact read by software that
may be years apart in version. The cost of a breaking change is paid by every
file ever written; the cost of an awkward deprecated alias is paid once.

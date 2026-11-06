# The `.aide` File Format — Specification

**Version:** 1.0
**Status:** Draft
**Schema:** [`schema/aide.schema.json`](./schema/aide.schema.json) (JSON Schema 2020-12)

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, MAY are to be
interpreted as described in RFC 2119.

---

## 1. Scope

An **aide** is a declarative behavioral specification for a product: what users
accomplish, what must always be true, the architectural decisions that make it
true, and how those parts connect. It is authored by humans and LLMs, and
consumed by build engines (Bantay), renderers (Vibez, Gloss), and agents.

This document defines:

1. the **syntax** of a `.aide` file (§2–§4),
2. the **core vocabulary** of entity kinds and relationship types (§5–§6),
3. the **well-formedness** rules a validator enforces (§7),
4. the **evolution** rules that keep old files readable forever (§8), and
5. **conformance** levels for implementations (§9).

It does not define the `.aide.lock` snapshot format, the diff/reconciliation
engine, or any renderer's output. Those consume this format; they do not
extend it.

---

## 2. Document

### 2.1 Encoding and syntax

- A `.aide` file MUST be UTF-8 text.
- A `.aide` file MUST be a YAML 1.2 document whose content is representable as
  JSON (a "JSON-compatible subset"): no anchors/aliases, no custom tags, no
  non-string mapping keys, no multi-document streams. Equivalently, every
  `.aide` document has an exact JSON form, and the JSON form is what the
  schema validates.
- The file extension is `.aide`. A child aide (§6.5) is named
  `<parent>.<child>.aide`.

### 2.2 Top-level keys

```yaml
spec: "1.0"          # OPTIONAL — spec version this file was written against
entities: {...}      # REQUIRED — map of entity id → Entity
relationships: [...] # REQUIRED — list of Relationship (MAY be empty)
```

| Key | Type | Required | Notes |
|---|---|---|---|
| `spec` | string | no | Spec version (§8). Absent means `"1.0"`. |
| `entities` | map | **yes** | At least one entity. |
| `relationships` | list | **yes** | MAY be `[]`. |

Unknown top-level keys MUST be preserved on round-trip and MUST be ignored by
consumers that do not understand them (§8.2).

---

## 3. Identifiers

An **id** is the key of an entity in `entities`.

- An id MUST match `^[a-z][a-z0-9_]*$` and MUST be at most 64 characters.
- Ids are unique within a document.
- Ids are **stable**: once published, an id MUST NOT be renamed. Consumers key
  lock files, diffs, tasks, and cross-aide references on them.

An **external reference** names an entity in another aide:
`<aide-name>` or `<aide-name>.<child>...` matching
`^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`. External references are permitted
only where §6 says so.

### 3.1 Prefix conventions

Entity *kind* is determined by id prefix. A validator uses the prefix to pick
the property schema (§5).

| Prefix | Kind | Conventional parent |
|---|---|---|
| *(none; see §4.2)* | page (root) | — |
| `cuj_` | critical user journey | `cujs` |
| `sc_` | scenario | a `cuj_*` |
| `inv_` | invariant | `invariants` |
| `con_` | constraint | `constraints` |
| `found_` | foundation | `foundations` |
| `wis_` | wisdom | `wisdom` |
| `screen_` | screen | any |
| `comp_` | component | a `screen_*` |
| `st_` | state (screen × component variants) | any |
| `tr_` | transition (state → state) | any |

The five section entities `cujs`, `invariants`, `constraints`, `foundations`,
`wisdom` are **reserved ids** with the fixed meaning in §4.3.

Ids with other prefixes are permitted (§8.3); the validator applies only the
generic entity rules to them.

---

## 4. Entities

### 4.1 Entity

```yaml
<id>:
  display: <string>        # OPTIONAL rendering hint
  parent: <id>             # OPTIONAL — omitted only for the root
  props: {<key>: <value>}  # OPTIONAL — kind-specific properties
```

| Field | Type | Rules |
|---|---|---|
| `display` | string | Rendering hint (`page`, `table`, `checklist`, `list`, …). Non-semantic; consumers MAY ignore. |
| `parent` | id | MUST reference an existing entity in the same document. MUST NOT create a cycle. |
| `props` | map | Keys MUST match `^[A-Za-z_][A-Za-z0-9_]*$`. Values are JSON values. |

Props whose key begins with `_` (e.g. `_pattern`, `_group_by`, `_sort_by`)
are **presentation hints**. They carry no behavioral meaning, MUST be
preserved on round-trip, and MUST NOT be used by a validator or build engine
to make decisions.

### 4.2 Root

A document MUST have exactly one **root**: an entity with no `parent`. The
root is the page for the product. It SHOULD carry
`display: page` and the props:

| Prop | Type | Required |
|---|---|---|
| `title` | string | yes |
| `description` | string | SHOULD |
| `version` | string | no |
| `date` | string (ISO 8601 date) | no |

### 4.3 Sections

The reserved section entities, when present, MUST be direct children of the
root:

| Id | Holds | Conventional `display` |
|---|---|---|
| `cujs` | `cuj_*` | `table` |
| `invariants` | `inv_*` | `checklist` |
| `constraints` | `con_*` | `list` |
| `foundations` | `found_*` | `list` |
| `wisdom` | `wis_*` | `list` |

A section MAY be absent; a kind MAY appear without its section (the prefix,
not the parent, determines kind). A validator SHOULD warn when a `cuj_*` is
not under `cujs`, an `inv_*` not under `invariants`, etc.

---

## 5. Core entity kinds

Each kind defines REQUIRED and OPTIONAL props. Additional props are always
permitted (§8.2).

REQUIRED means *required for the entity to be complete*. Because an aide is a
living document that is routinely valid-but-incomplete mid-edit, a validator
reports a **missing** REQUIRED prop as a completeness warning (S7), not an
error. A prop that is **present** with the wrong type or a value outside its
vocabulary is an error (W8). The JSON Schema, which has no notion of warnings,
validates *complete* documents and treats REQUIRED props as required.

### 5.1 `cuj_*` — Critical User Journey

What a user accomplishes. An outcome, not an implementation.

| Prop | Type | Required | Values |
|---|---|---|---|
| `feature` | string | **yes** | Outcome statement |
| `tier` | string | **yes** | `primary` \| `secondary` \| `tertiary` |
| `area` | string | SHOULD | Product domain (free text) |

Tier semantics: `primary` — product unusable without it; `secondary` —
important, not existential; `tertiary` — nice to have. Tier drives
verification rigor downstream.

### 5.2 `sc_*` — Scenario

One concrete behavior of a CUJ, in Given/When/Then.

| Prop | Type | Required |
|---|---|---|
| `name` | string | **yes** |
| `given` | string | **yes** |
| `when` | string | **yes** |
| `then` | string \| string[] | **yes** |

- `parent` MUST be a `cuj_*`.
- A `then` step containing the literal text `(black box)` marks a step whose
  internals are outside this aide's governance (see `delegates_to`, §6.4).

### 5.3 `inv_*` — Invariant

A predicate that MUST hold on every path.

| Prop | Type | Required |
|---|---|---|
| `statement` | string | **yes** |
| `category` | string | **yes** |
| `threat_signal` | string | SHOULD |
| `done` | boolean | no (default `false`) |
| `checker` | string | no — path to a project checker (`./name`) |
| `test` | string | no — path to a test that enforces it |
| `enforced` | string | no — path to implementation code that enforces it directly |
| `survives_skip_permissions` | boolean | no |

At most one of `checker`, `test`, `enforced` SHOULD be set. An invariant with
none of them is **unenforced**; build engines report it as such.

### 5.4 `con_*` — Constraint

How an invariant is satisfied, and why this way.

| Prop | Type | Required |
|---|---|---|
| `text` | string | **yes** |
| `domain` | string | **yes** |
| `rationale` | string | SHOULD when the decision is non-obvious |
| `decision_date` | string (ISO 8601 date) | no |
| `alternatives_rejected` | string[] | no |

A constraint is **sticky**: an agent proposing to remove or weaken it MUST
address `rationale`, not merely show the predicate can be satisfied without
it.

### 5.5 `found_*` — Foundation

| Prop | Type | Required |
|---|---|---|
| `text` | string | **yes** |

### 5.6 `wis_*` — Wisdom

| Prop | Type | Required |
|---|---|---|
| `text` | string | **yes** |
| `source` | string | no — incident, ticket, ADR, … |

Wisdom is advisory. Constraints are mandatory.

### 5.7 `screen_*`, `comp_*`, `st_*`, `tr_*` — the state machine

These kinds encode the application as a labeled transition system
**A = (S, T, s₀, Σ, δ)** where screens × component variants are states and
transitions are labeled edges.

**`screen_*`** — a screen.

| Prop | Type | Required |
|---|---|---|
| `name` | string | SHOULD |
| `description` | string | no |

**`comp_*`** — a component on a screen. `parent` SHOULD be a `screen_*`.

| Prop | Type | Required |
|---|---|---|
| `name` | string | SHOULD |
| `type` | string | no — e.g. an M3 component type |
| `variants` | string[] | no — the closed set of variants this component can be in |

**`st_*`** — a state.

| Prop | Type | Required |
|---|---|---|
| `screen` | id (`screen_*`) | **yes** |
| `initial` | boolean | no — exactly one `st_*` SHOULD be `initial: true` (s₀) |
| `description` | string | no |
| `comp_<x>` | string | no — the variant component `comp_<x>` is in |

Any prop whose key begins with `comp_` MUST name an existing `comp_*` entity
and its value MUST be in that component's `variants` when `variants` is
declared.

**`tr_*`** — a transition.

| Prop | Type | Required |
|---|---|---|
| `from` | id (`st_*`) | **yes** |
| `to` | id (`st_*`) | **yes** |
| `action` | string | **yes** — the user action (label in Σ) |
| `trigger` | id (`comp_*`) | no — the component that fires it |
| `guard` | string | no — precondition, plain language |

The set of `tr_*` entities **is the closed transition vocabulary** of the
product. A build engine MUST treat any proposed change to application state
that cannot be expressed as an existing `tr_*` as *out of vocabulary* and
MUST NOT apply it without a human or governing decision (see Bantay's gate).

---

## 6. Relationships

```yaml
- from: <id>
  to: <id | external reference>
  type: <RelationshipType>
  cardinality: <Cardinality>
```

| Field | Type | Required |
|---|---|---|
| `from` | id | **yes** — MUST exist in this document |
| `to` | id or external reference | **yes** — MUST exist, except as §6.4 permits |
| `type` | enum | **yes** |
| `cardinality` | enum | **yes** — `one_to_one` \| `one_to_many` \| `many_to_one` \| `many_to_many` |

The relationship type vocabulary is **closed** (§8.3):

| Type | Domain (`from`) | Range (`to`) | Meaning |
|---|---|---|---|
| `protected_by` | `sc_*` | `inv_*` | This scenario is safe because this invariant holds. |
| `depends_on` | `cuj_*` | `cuj_*` | This journey requires that journey. |
| `implements` | `con_*` | `inv_*` | This decision is how that invariant is made true. |
| `delegates_to` | `sc_*` | external aide, or an entity in this document | The black-box step is governed by that aide. |
| `weakens` | `sc_*` | `inv_*` | While this scenario is active, that invariant's normal enforcement is bypassed. |

### 6.1 `protected_by`

Inverse reading: the invariant *enforces* the scenario. The identifier
`enforced_by` is a **deprecated alias** for `protected_by`: parsers MUST
accept it and normalize it to `protected_by`; writers MUST NOT emit it.

### 6.2 `depends_on`

MUST NOT form a cycle.

### 6.3 `implements`

Many constraints MAY implement one invariant (defense in depth).

### 6.4 `delegates_to`

`to` MAY be an external reference (§3) naming a child aide
(`stripe.radar`). A validator MUST NOT report an external reference as a
missing entity; it MAY, when the referenced file is available, verify that it
exists.

### 6.5 `weakens`

The invariant still *should* hold; only its mechanism is removed. Pairs with
`inv_*.survives_skip_permissions`.

Duplicate relationships (same `from`, `to`, `type`) SHOULD be rejected.

---

## 7. Well-formedness

A document is **well-formed** when all MUST rules in §2–§6 hold. A validator
MUST report each violation with the offending id or relationship. The rules,
restated as a checklist:

**Structural (decidable from the document alone)**

- W1. Exactly one root entity. (§4.2)
- W2. Every `parent` references an existing entity; the parent graph is a
  tree (no cycles). (§4.1)
- W3. Every id matches the id grammar. (§3)
- W4. Every relationship `from` exists; every `to` exists or is an external
  reference permitted by `delegates_to`. (§6)
- W5. Every relationship `type` and `cardinality` is in its vocabulary. (§6)
- W6. Every relationship respects the domain/range of its type. (§6)
- W7. No duplicate relationships. (§6)
- W8. Every present prop of a core kind has the right type and, where the
  spec gives one, a value in its vocabulary (`tier`, `then`, booleans, ids). A
  `sc_*` has a `cuj_*` parent. (§5)
- W9. `tr_*.from` / `tr_*.to` name existing `st_*`; `st_*.screen` names an
  existing `screen_*`; `tr_*.trigger` and `st_*.comp_*` name existing
  `comp_*`. (§5.7)
- W10. `depends_on` is acyclic. (§6.2)

**Semantic (SHOULD; a validator reports these as warnings)**

- S1. Every `st_*` is reachable from the initial state.
- S2. Every non-terminal `st_*` has at least one outgoing `tr_*`.
- S3. Every `inv_*` is protected, implemented, or has an enforcement prop.
- S4. Every `cuj_*` has at least one `sc_*`.
- S5. Every scenario `then` step marked `(black box)` belongs to a scenario
  with a `delegates_to` relationship.
- S6. A kind is under its conventional section (§4.3).
- S7. Every REQUIRED prop of each core kind is present (completeness). (§5)

Reachability (S1) and liveness (S2) are the formal well-formedness
properties of the state machine; they are warnings rather than errors
because an aide is a living document and is routinely valid-but-incomplete
mid-edit.

---

## 8. Evolution

The format is **add-only**.

### 8.1 Versioning

`spec` is `MAJOR.MINOR`. A MINOR revision adds kinds, props, relationship
types, or enum values. A MAJOR revision is reserved for changes that would
make a previously valid document invalid; none is planned, and this
specification commits to not making one without a migration tool.

A consumer written against `1.x` MUST accept any `1.y` document, ignoring
what it does not understand.

### 8.2 Unknown content

- Unknown top-level keys, unknown props, and `_`-prefixed hints MUST be
  preserved byte-for-meaning on round-trip (parse → serialize).
- Unknown props MUST NOT cause validation failure.
- A consumer MUST NOT infer meaning from a prop it does not know.

### 8.3 Closed vocabularies and extensions

Relationship `type`, `cardinality`, and `cuj_*.tier` are **closed**
vocabularies: a value outside them is a validation error. New values enter
only through a MINOR revision of this spec.

Entity kinds are **open by prefix**: a document MAY use ids with prefixes not
listed in §3.1; the validator applies only the generic rules. Tools SHOULD
use a project-specific prefix (e.g. `tok_` for design tokens) rather than
overloading a core prefix.

### 8.4 Deprecation

A deprecated name (e.g. `enforced_by`) remains readable indefinitely.
Writers normalize to the canonical name. Nothing is ever removed.

### 8.5 Instances of a shared definition

When a definition is shared (a store template instantiated per event or per
project), definition updates MAY fan out to instances; an instance MAY pin a
`spec` or definition version to opt out. Instance **state** never changes on
a definition update. A rule change (e.g. a new invariant) that makes existing
instance state invalid MUST be surfaced as a warning in a view and MUST NOT
cause the instance to fail to load.

---

## 9. Conformance

| Level | Name | Requirement |
|---|---|---|
| L1 | **Parser** | Reads any well-formed document into the entity/relationship model and serializes it back preserving unknown content (§8.2). Normalizes deprecated aliases (§6.1). |
| L2 | **Validator** | L1 + reports every W-rule violation as an error and SHOULD report S-rules as warnings. |
| L3 | **Engine** | L2 + treats the `tr_*` set as the closed transition vocabulary (§5.7) and constraints as sticky (§5.4). |

`@bantay/aide` targets L2. Bantay targets L3.

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

| This spec | Formal object (Cancio 2026, *Formal Definitions*) |
|---|---|
| `screen_*` × `comp_*` variants, `st_*` | S (states) |
| `tr_*` | T, Σ, δ |
| `st_*.initial` | s₀ |
| `cuj_*` + ordered `sc_*` | Γ (CUJs); `tier` = κ |
| `inv_*` | I |
| `con_*` (+ `rationale`, `decision_date`, `alternatives_rejected`) | C |
| `relationships` | R |
| `wis_*` | W |
| W1–W10, S1–S7 | Def. 1.6 well-formedness |

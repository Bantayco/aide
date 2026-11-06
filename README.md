# @bantay/aide

The aide primitive: the `.aide` format and the operations over it.

An aide is a declarative spec — entities and the relationships between them —
that an LLM authors and a build engine (bantay) compiles into an app or artifact.
This package is the shared source of truth for that format, consumed by the
bantay engine and the gloss editor.

## Specification

The format is specified in [SPEC.md](./SPEC.md) (normative, RFC 2119) with a
structural [JSON Schema](./schema/aide.schema.json). This package targets
conformance level **L2 (Validator)**: `validate()` reports every W-rule
violation; `lint()` additionally reports S-rule warnings.

## Projects (child aides)

An aide for anything large decomposes: `bantay.aide` delegates `cuj_visualize`
to `bantay.visualize.aide` in the same directory (SPEC §8). `resolveAidePath`
picks the root; `readProject` follows every `delegates_to`; `readMerged` gives
one tree with every entity in the project; `lintProject` adds the project-level
rules (W11 unique ids, S8 unresolved children).

## Entry points

- `@bantay/aide` — pure, isomorphic core (browser + node): the `AideTree` types
  and the tree operations `addEntity`, `removeEntity`, `addRelationship`,
  `validate`, `lint`, plus `parse`/`serialize`.
- `@bantay/aide/node` — the core **plus** filesystem IO: `read`, `write`, and
  `.aide` discovery (`resolveAidePath`, `discoverAideFiles`). Node only.

```ts
import { addEntity, validate } from "@bantay/aide";          // anywhere
import { read, write, resolveAidePath } from "@bantay/aide/node"; // node
```

The old artifact-host service that previously lived in this repo is preserved on
the `archive/host` branch.

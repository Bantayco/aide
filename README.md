# @bantay/aide

The aide primitive: the `.aide` format and the operations over it.

An aide is a declarative spec — entities and the relationships between them —
that an LLM authors and a build engine (bantay) compiles into an app or artifact.
This package is the shared source of truth for that format, consumed by the
bantay engine and the gloss editor.

## Entry points

- `@bantay/aide` — pure, isomorphic core (browser + node): the `AideTree` types
  and the tree operations `addEntity`, `removeEntity`, `addRelationship`,
  `validate`.
- `@bantay/aide/node` — the core **plus** filesystem IO: `read`, `write`, and
  `.aide` discovery (`resolveAidePath`, `discoverAideFiles`). Node only.

```ts
import { addEntity, validate } from "@bantay/aide";          // anywhere
import { read, write, resolveAidePath } from "@bantay/aide/node"; // node
```

The old artifact-host service that previously lived in this repo is preserved on
the `archive/host` branch.

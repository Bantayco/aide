import { describe, test, expect } from "bun:test";
import { readFile } from "fs/promises";
import { join } from "path";
import Ajv2020 from "ajv/dist/2020";
import * as yaml from "js-yaml";
import {
  parse,
  serialize,
  validate,
  lint,
  addRelationship,
  AIDE_SPEC_VERSION,
  type AideTree,
} from "../src";

const here = import.meta.dir;
const fixture = (name: string) => readFile(join(here, "fixtures", name), "utf-8");

async function loadSchemaValidator() {
  const schema = JSON.parse(await readFile(join(here, "..", "schema", "aide.schema.json"), "utf-8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  return ajv.compile(schema);
}

describe("SPEC conformance", () => {
  test("package implements spec 1.x", () => {
    expect(AIDE_SPEC_VERSION).toMatch(/^1\.\d+$/);
  });

  describe("schema/aide.schema.json", () => {
    test("accepts the minimal document from SPEC Appendix A", async () => {
      const check = await loadSchemaValidator();
      const doc = yaml.load(await fixture("minimal.aide"));
      expect(check(doc)).toBe(true);
    });

    test("accepts the real bantay.aide", async () => {
      const check = await loadSchemaValidator();
      const doc = yaml.load(await fixture("bantay.aide"));
      const ok = check(doc);
      if (!ok) console.log(check.errors);
      expect(ok).toBe(true);
    });

    test("rejects a cuj with an unknown tier", async () => {
      const check = await loadSchemaValidator();
      expect(
        check({
          entities: { app: {}, cuj_x: { parent: "app", props: { feature: "x", tier: "huge" } } },
          relationships: [],
        })
      ).toBe(false);
    });

    test("rejects a bad id and an unknown relationship type", async () => {
      const check = await loadSchemaValidator();
      expect(check({ entities: { "Bad-Id": {} }, relationships: [] })).toBe(false);
      expect(
        check({
          entities: { a: {} },
          relationships: [{ from: "a", to: "a", type: "likes", cardinality: "one_to_one" }],
        })
      ).toBe(false);
    });

    test("allows unknown props and _hints (add-only evolution)", async () => {
      const check = await loadSchemaValidator();
      expect(
        check({
          entities: {
            app: { props: { title: "x", _pattern: "roster", future_prop: { nested: true } } },
            tok_primary: { parent: "app", props: { value: "#fff" } },
          },
          relationships: [],
        })
      ).toBe(true);
    });
  });

  describe("linter agrees with the schema on real files", () => {
    test("bantay.aide is well-formed (no W errors)", async () => {
      const tree = parse(await fixture("bantay.aide"));
      expect(validate(tree)).toEqual([]);
    });

    test("minimal.aide is well-formed and has no warnings except none", async () => {
      const tree = parse(await fixture("minimal.aide"));
      const { errors, warnings } = lint(tree);
      expect(errors).toEqual([]);
      expect(warnings).toEqual([]);
    });
  });

  describe("§6.1 deprecated alias", () => {
    test("parse normalizes enforced_by to protected_by", () => {
      const tree = parse(`
entities:
  app: {}
  cujs: { parent: app }
  cuj_a: { parent: cujs, props: { feature: a, tier: primary } }
  sc_a: { parent: cuj_a, props: { name: n, given: g, when: w, then: [t] } }
  invariants: { parent: app }
  inv_a: { parent: invariants, props: { statement: s, category: c } }
relationships:
  - { from: sc_a, to: inv_a, type: enforced_by, cardinality: many_to_many }
`);
      expect(tree.relationships[0].type).toBe("protected_by");
      expect(validate(tree)).toEqual([]);
      expect(serialize(tree)).not.toContain("enforced_by");
    });
  });

  describe("§2.2/§8.2 round-trip preservation", () => {
    test("spec and unknown top-level keys survive parse → serialize → parse", () => {
      const src = `spec: "1.0"\nentities:\n  app: {}\nrelationships: []\nx_vendor:\n  anything: [1, 2]\n`;
      const tree = parse(src);
      expect(tree.spec).toBe("1.0");
      expect(tree.extra).toEqual({ x_vendor: { anything: [1, 2] } });
      const again = parse(serialize(tree));
      expect(again).toEqual(tree);
      expect(serialize(tree).startsWith('spec: "1.0"')).toBe(true);
    });
  });

  describe("§7 W-rules", () => {
    const base = (): AideTree => ({
      entities: {
        app: { display: "page", props: { title: "T" } },
        cujs: { parent: "app" },
        cuj_a: { parent: "cujs", props: { feature: "a", tier: "primary" } },
        sc_a: { parent: "cuj_a", props: { name: "n", given: "g", when: "w", then: ["t"] } },
        invariants: { parent: "app" },
        inv_a: { parent: "invariants", props: { statement: "s", category: "c" } },
        constraints: { parent: "app" },
        con_a: { parent: "constraints", props: { text: "t", domain: "d" } },
      },
      relationships: [],
    });

    test("W1 multiple roots", () => {
      const t = base();
      t.entities.other = {};
      expect(validate(t).some((e) => e.startsWith("W1"))).toBe(true);
    });

    test("W2 parent cycle", () => {
      const t = base();
      t.entities.app.parent = "cujs";
      expect(validate(t).some((e) => e.startsWith("W2"))).toBe(true);
    });

    test("W3 id grammar", () => {
      const t = base();
      t.entities["Bad"] = { parent: "app" };
      expect(validate(t).some((e) => e.startsWith("W3"))).toBe(true);
    });

    test("W4 external reference allowed only on delegates_to", () => {
      const t = base();
      t.relationships.push({ from: "sc_a", to: "stripe.radar", type: "delegates_to", cardinality: "many_to_one" });
      expect(validate(t)).toEqual([]);
      t.relationships.push({ from: "sc_a", to: "stripe.radar", type: "protected_by", cardinality: "many_to_one" });
      expect(validate(t).some((e) => e.startsWith("W4"))).toBe(true);
    });

    test("W6 domain/range", () => {
      const t = base();
      t.relationships.push({ from: "con_a", to: "cuj_a", type: "implements", cardinality: "many_to_one" });
      expect(validate(t).some((e) => e.startsWith("W6"))).toBe(true);
    });

    test("W7 duplicates and W10 depends_on cycle", () => {
      const t = base();
      t.entities.cuj_b = { parent: "cujs", props: { feature: "b", tier: "secondary" } };
      t.relationships.push(
        { from: "cuj_a", to: "cuj_b", type: "depends_on", cardinality: "many_to_many" },
        { from: "cuj_b", to: "cuj_a", type: "depends_on", cardinality: "many_to_many" },
        { from: "cuj_b", to: "cuj_a", type: "depends_on", cardinality: "many_to_many" }
      );
      const errs = validate(t);
      expect(errs.some((e) => e.startsWith("W7"))).toBe(true);
      expect(errs.some((e) => e.startsWith("W10"))).toBe(true);
    });

    test("W8 required props and tier vocabulary", () => {
      const t = base();
      t.entities.cuj_a.props = { feature: "a", tier: "huge" };
      t.entities.inv_a.props = { statement: "s" };
      const errs = validate(t);
      expect(errs.some((e) => e.includes("cuj_a.tier"))).toBe(true);
      expect(errs.some((e) => e.includes('inv_a is missing required prop "category"'))).toBe(true);
    });

    test("W9 state machine references", () => {
      const t = base();
      Object.assign(t.entities, {
        screen_home: { parent: "app", props: { name: "Home" } },
        comp_btn: { parent: "screen_home", props: { name: "Button", variants: ["idle", "busy"] } },
        st_idle: { parent: "app", props: { screen: "screen_home", initial: true, comp_btn: "idle" } },
        st_busy: { parent: "app", props: { screen: "screen_home", comp_btn: "spinning" } },
        tr_go: { parent: "app", props: { from: "st_idle", to: "st_nowhere", action: "Click", trigger: "comp_btn" } },
      });
      const errs = validate(t);
      expect(errs.some((e) => e.includes("st_busy.comp_btn"))).toBe(true);
      expect(errs.some((e) => e.includes("tr_go.to"))).toBe(true);
    });

    test("addRelationship normalizes aliases and accepts external delegates_to", () => {
      let t = base();
      t = addRelationship(t, { from: "sc_a", to: "inv_a", type: "enforced_by" as never, cardinality: "many_to_many" });
      expect(t.relationships[0].type).toBe("protected_by");
      t = addRelationship(t, { from: "sc_a", to: "stripe.radar", type: "delegates_to", cardinality: "many_to_one" });
      expect(t.relationships[1].to).toBe("stripe.radar");
    });
  });

  describe("§7 S-rules", () => {
    test("reports unenforced invariants, cujs without scenarios, unreachable states", () => {
      const t: AideTree = {
        entities: {
          app: {},
          cujs: { parent: "app" },
          cuj_lonely: { parent: "cujs", props: { feature: "x", tier: "tertiary" } },
          invariants: { parent: "app" },
          inv_bare: { parent: "invariants", props: { statement: "s", category: "c" } },
          screen_a: { parent: "app" },
          st_start: { parent: "app", props: { screen: "screen_a", initial: true } },
          st_island: { parent: "app", props: { screen: "screen_a" } },
        },
        relationships: [],
      };
      const { errors, warnings } = lint(t);
      expect(errors).toEqual([]);
      expect(warnings.some((w) => w.startsWith("S3: inv_bare"))).toBe(true);
      expect(warnings.some((w) => w.startsWith("S4: cuj_lonely"))).toBe(true);
      expect(warnings.some((w) => w.includes("st_island is unreachable"))).toBe(true);
    });
  });
});

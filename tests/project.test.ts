import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { lintFile } from "../src/node";
import {
  parse,
  lint,
  loadProject,
  mergeProject,
  lintProject,
  externalRefs,
  fileForRef,
  isRootAideFilename,
  aideNameOf,
  readProject,
  readMerged,
  resolveAidePath,
  discoverAideFiles,
} from "../src/node";

const ROOT = `
entities:
  bantay: { display: page, props: { title: Bantay CLI } }
  cujs: { parent: bantay }
  cuj_visualize: { parent: cujs, props: { feature: Render a screen map, tier: secondary, area: visualize } }
  cuj_check: { parent: cujs, props: { feature: Check invariants, tier: primary, area: check } }
  sc_check_full: { parent: cuj_check, props: { name: Full check, given: g, when: w, then: [t] } }
  invariants: { parent: bantay }
  inv_no_network: { parent: invariants, props: { statement: Checkers never touch the network, category: security, checker: ./no-network } }
  constraints: { parent: bantay }
  con_bun: { parent: constraints, props: { text: TypeScript on Bun, domain: architecture } }
relationships:
  - { from: cuj_visualize, to: bantay.visualize, type: delegates_to, cardinality: one_to_one }
  - { from: cuj_check, to: bantay.check, type: delegates_to, cardinality: one_to_one }
  - { from: sc_check_full, to: inv_no_network, type: protected_by, cardinality: many_to_many }
`;

const CHILD_VISUALIZE = `
entities:
  visualize: { display: page, props: { title: bantay visualize } }
  cujs: { parent: visualize }
  cuj_visualize_generate: { parent: cujs, props: { feature: Generate HTML, tier: secondary, area: visualize } }
  sc_visualize_html: { parent: cuj_visualize_generate, props: { name: HTML out, given: g, when: w, then: [t] } }
  invariants: { parent: visualize }
  inv_visualize_offline: { parent: invariants, props: { statement: Output has no remote assets, category: security, test: tests/visualize.test.ts } }
relationships:
  - { from: sc_visualize_html, to: inv_no_network, type: protected_by, cardinality: many_to_many }
  - { from: sc_visualize_html, to: inv_visualize_offline, type: protected_by, cardinality: many_to_many }
`;

const files: Record<string, string> = {
  "bantay.aide": ROOT,
  "bantay.visualize.aide": CHILD_VISUALIZE,
};
const loader = async (f: string) => (files[f] ? parse(files[f]) : null);

describe("composition helpers", () => {
  test("file naming", () => {
    expect(isRootAideFilename("bantay.aide")).toBe(true);
    expect(isRootAideFilename("bantay.visualize.aide")).toBe(false);
    expect(aideNameOf("bantay.visualize.storyboard.aide")).toBe("bantay");
    expect(fileForRef("bantay.visualize")).toBe("bantay.visualize.aide");
    expect(() => fileForRef("../etc/passwd")).toThrow();
  });

  test("externalRefs lists delegates_to targets", () => {
    expect(externalRefs(parse(ROOT))).toEqual(["bantay.visualize", "bantay.check"]);
  });

  test("a cuj may delegate instead of having scenarios (S4), and delegates_to from cuj_ is valid (W6)", () => {
    const { errors, warnings } = lint(parse(ROOT));
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes("cuj_visualize"))).toBe(false);
  });
});

describe("loadProject / lintProject / mergeProject", () => {
  test("follows references, records unresolved ones", async () => {
    const p = await loadProject("bantay.aide", parse(ROOT), loader);
    expect(Object.keys(p.aides).sort()).toEqual(["bantay", "bantay.visualize"]);
    expect(p.aides["bantay.visualize"].parent).toBe("bantay");
    expect(p.unresolved).toEqual([{ ref: "bantay.check", from: "bantay" }]);
  });

  test("child may reference an ancestor's invariant (COMP-12); unresolved child is S8 not an error", async () => {
    const p = await loadProject("bantay.aide", parse(ROOT), loader);
    const r = lintProject(p);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toContain('S8: bantay delegates to "bantay.check" but bantay.check.aide was not found');
    // the child alone, without ancestors, would flag the inherited id
    expect(lint(parse(CHILD_VISUALIZE)).errors.some((e) => e.includes("inv_no_network"))).toBe(true);
  });

  test("W11: duplicate non-section ids across the project", async () => {
    const dup = { ...files, "bantay.visualize.aide": CHILD_VISUALIZE.replace("inv_visualize_offline", "inv_no_network") };
    const p = await loadProject("bantay.aide", parse(ROOT), async (f) => (dup[f] ? parse(dup[f]) : null));
    const r = lintProject(p);
    expect(r.errors.some((e) => e.startsWith("W11") && e.includes("inv_no_network"))).toBe(true);
  });

  test("merged view collapses sections and re-parents child roots", async () => {
    const p = await loadProject("bantay.aide", parse(ROOT), loader);
    const m = mergeProject(p);
    expect(m.entities.visualize.parent).toBe("bantay");
    expect(m.entities.inv_visualize_offline.parent).toBe("invariants");
    expect(Object.keys(m.entities).filter((id) => id === "invariants")).toHaveLength(1);
    expect(m.relationships).toHaveLength(5);
    expect(lint(m).errors).toEqual([]);
  });
});

describe("node: discovery and readProject", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "aide-project-"));
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(dir, name), content);
    }
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("resolveAidePath picks the root when children are present (COMP-6)", async () => {
    const r = await resolveAidePath(dir);
    expect(r.filename).toBe("bantay.aide");
    const d = await discoverAideFiles(dir);
    expect(d.found).toEqual(["bantay.aide", "bantay.visualize.aide"]);
    expect(d.roots).toEqual(["bantay.aide"]);
  });

  test("two roots is an error (COMP-7); an explicit child path is honored (COMP-8)", async () => {
    await writeFile(join(dir, "other.aide"), "entities:\n  o: {}\nrelationships: []\n");
    await expect(resolveAidePath(dir)).rejects.toThrow(/Multiple root/);
    const r = await resolveAidePath(dir, "bantay.visualize.aide");
    expect(r.filename).toBe("bantay.visualize.aide");
  });

  test("readProject and readMerged resolve children next to the root", async () => {
    const p = await readProject(join(dir, "bantay.aide"));
    expect(Object.keys(p.aides).sort()).toEqual(["bantay", "bantay.visualize"]);
    const m = await readMerged(join(dir, "bantay.aide"));
    expect(m.entities.cuj_visualize_generate).toBeDefined();
  });
});

describe("lintFile (node)", () => {

  const ROOT = "entities:\n  shop: {display: page}\n  invariants: {parent: shop}\n  inv_a: {parent: invariants, props: {statement: s, category: c}}\nrelationships: []\n";
  const CHILD = "entities:\n  checkout: {display: page}\n  cujs: {parent: checkout}\n  cuj_x: {parent: cujs, props: {feature: f, tier: primary}}\n  sc_x: {parent: cuj_x, props: {name: n, given: g, when: w, then: [t]}}\nrelationships:\n  - {from: sc_x, to: inv_a, type: protected_by, cardinality: many_to_many}\n";

  test("child alone sees inherited ids from its ancestor file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aide-lintfile-"));
    await writeFile(join(dir, "shop.aide"), ROOT);
    await writeFile(join(dir, "shop.checkout.aide"), CHILD);
    const r = await lintFile(join(dir, "shop.checkout.aide"));
    expect(r.errors).toEqual([]);
    expect(Object.keys(r.aides)).toEqual(["shop.checkout"]);
    await rm(dir, { recursive: true, force: true });
  });

  test("child alone without its ancestor: inherited refs are S8, not W4", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aide-lintfile-"));
    await writeFile(join(dir, "shop.checkout.aide"), CHILD);
    const r = await lintFile(join(dir, "shop.checkout.aide"));
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.startsWith("S8") && w.includes("inv_a"))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
});

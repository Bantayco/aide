import { describe, test, expect } from "bun:test";
import { parse, serialize, addEntity, type AideTree } from "../src";

describe("parse / serialize (isomorphic core)", () => {
  test("parses entities and relationships from YAML", () => {
    const tree = parse(`
entities:
  app:
    display: App
  feature:
    parent: app
relationships:
  - from: feature
    to: app
    type: depends_on
    cardinality: one_to_one
`);
    expect(Object.keys(tree.entities)).toEqual(["app", "feature"]);
    expect(tree.entities.feature.parent).toBe("app");
    expect(tree.relationships).toHaveLength(1);
    expect(tree.relationships[0].type).toBe("depends_on");
  });

  test("parse(serialize(tree)) round-trips", () => {
    let tree: AideTree = { entities: {}, relationships: [] };
    tree = addEntity(tree, { id: "a", display: "A" });
    tree = addEntity(tree, { id: "b", parent: "a" });
    expect(parse(serialize(tree))).toEqual(tree);
  });

  test("empty content yields an empty tree", () => {
    expect(parse("")).toEqual({ entities: {}, relationships: [] });
  });
});

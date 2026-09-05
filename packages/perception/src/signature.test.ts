// packages/perception/src/signature.test.ts — 08 §3, Ph2.2. Pure, no browser.
import { describe, expect, it } from "vitest";
import { routeTemplate, stateSignature } from "./signature.js";
import { node, snap } from "./test-helpers.js";

function productList(names: string[]) {
  return snap(
    "https://shop.example.com/products",
    node("document", {}, [
      node("main", {}, [
        node("heading", { name: "Products", level: 1 }),
        ...names.map((n, i) => node("link", { name: n, ref: `e${i + 1}` })),
      ]),
    ]),
  );
}

describe("routeTemplate — 08 §3.1 step 1", () => {
  it("replaces numeric path segments with :id", () => {
    expect(routeTemplate("https://x.test/orders/8841/items")).toBe("/orders/:id/items");
  });

  it("replaces UUID-shaped path segments with :id", () => {
    expect(routeTemplate("https://x.test/orders/550e8400-e29b-41d4-a716-446655440000")).toBe(
      "/orders/:id",
    );
  });

  it("leaves non-numeric segments untouched and drops the query string", () => {
    expect(routeTemplate("https://x.test/products/8841?page=3&sort=price")).toBe("/products/:id");
  });

  it("collapses the bare root to /", () => {
    expect(routeTemplate("https://x.test/")).toBe("/");
  });
});

describe("stateSignature — 08 §3.2 worked example", () => {
  it("collapses /products?page=1, ?page=2 and ?page=1&sort=price to one signature", () => {
    const page1 = {
      ...productList(["Product 1", "Product 2", "Product 3"]),
      url: "https://shop.example.com/products?page=1",
    };
    const page2 = {
      ...productList(["Product 4", "Product 5", "Product 6"]),
      url: "https://shop.example.com/products?page=2",
    };
    const page1Sorted = {
      ...productList(["Product 3", "Product 1", "Product 2"]),
      url: "https://shop.example.com/products?page=1&sort=price",
    };

    const sig1 = stateSignature(page1);
    expect(stateSignature(page2)).toBe(sig1);
    expect(stateSignature(page1Sorted)).toBe(sig1);
  });

  it("gives a product detail page a different signature than the list", () => {
    const list = productList(["Product 1", "Product 2"]);
    const detail = snap(
      "https://shop.example.com/products/8841",
      node("document", {}, [
        node("main", {}, [
          node("heading", { name: "Aperture Mk. 2", level: 1 }),
          node("button", { name: "Add to cart", ref: "e1" }),
        ]),
      ]),
    );
    expect(stateSignature(detail)).not.toBe(stateSignature(list));
  });

  it("gives an empty cart and a full cart the same signature — same affordances", () => {
    const cartOf = (items: string[]) =>
      snap(
        "https://shop.example.com/cart",
        node("document", {}, [
          node("main", {}, [
            node("heading", { name: "Cart", level: 1 }),
            ...items.map((i) => node("text", { name: i })), // non-interactive content — dropped
            node("button", { name: "Checkout", ref: "e1" }),
          ]),
        ]),
      );
    expect(stateSignature(cartOf([]))).toBe(stateSignature(cartOf(["Widget", "Gadget"])));
  });

  it("is a pure function — repeated calls on the same snapshot agree", () => {
    const s = productList(["A", "B"]);
    expect(stateSignature(s)).toBe(stateSignature(s));
  });

  it("produces a 16 hex character signature", () => {
    expect(stateSignature(productList(["A"]))).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("stateSignature — digit masking (08 §3.1 step 4)", () => {
  it("treats 'Cart (2)' and 'Cart (3)' as the same control name", () => {
    const cartBadge = (n: number) =>
      snap(
        "https://shop.example.com/",
        node("document", {}, [
          node("navigation", {}, [node("link", { name: `Cart (${n})`, ref: "e1" })]),
        ]),
      );
    expect(stateSignature(cartBadge(2))).toBe(stateSignature(cartBadge(3)));
  });
});

describe("stateSignature — the collision defence (08 §3.3)", () => {
  it("does not collide two structurally identical pages under different routes", () => {
    const shape = () =>
      node("document", {}, [
        node("main", {}, [
          node("heading", { name: "Profile", level: 1 }),
          node("textbox", { name: "Name", ref: "e1" }),
          node("textbox", { name: "Email", ref: "e2" }),
          node("textbox", { name: "Phone", ref: "e3" }),
          node("textbox", { name: "Address", ref: "e4" }),
        ]),
      ]);
    const profile = snap("https://x.test/settings/profile", shape());
    const billing = snap("https://x.test/settings/billing", shape());
    // Identical skeletons, different routes — defence #1 alone must separate them.
    expect(stateSignature(profile)).not.toBe(stateSignature(billing));
  });

  it("separates two pages on the same route by their retained heading (defence #2)", () => {
    const at = (heading: string) =>
      snap(
        "https://x.test/settings",
        node("document", {}, [
          node("main", {}, [
            node("heading", { name: heading, level: 1 }),
            node("textbox", { name: "A", ref: "e1" }),
          ]),
        ]),
      );
    expect(stateSignature(at("Profile"))).not.toBe(stateSignature(at("Billing")));
  });
});

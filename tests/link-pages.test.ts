import { test } from "node:test";
import assert from "node:assert/strict";
import { linkItems, linkPageSchema, linkSettings, normalizeLinkUrl } from "../src/services/link-pages";

test("link sem https ganha https; javascript: é recusado", () => {
  assert.equal(normalizeLinkUrl("instagram.com/fulana"), "https://instagram.com/fulana");
  assert.equal(normalizeLinkUrl(" https://wa.me/5531999 "), "https://wa.me/5531999");
  assert.equal(normalizeLinkUrl("/hot-secret/g/bia"), "/hot-secret/g/bia");
  const base = { name: "Bia", slug: "bia", links: [{ id: "a", title: "VIP", url: "javascript:alert(1)" }] };
  assert.equal(linkPageSchema.safeParse(base).success, false);
  const ok = linkPageSchema.parse({ ...base, links: [{ id: "a", title: "VIP", url: "instagram.com/bia" }] });
  assert.equal(ok.links[0].url, "https://instagram.com/bia");
});

test("botão precisa de título e o dono escolhe as cores", () => {
  assert.equal(linkPageSchema.safeParse({ name: "Bia", slug: "bia", links: [{ id: "a", title: " ", url: "https://x.com" }] }).success, false);
  assert.equal(linkPageSchema.safeParse({ name: "Bia", slug: "bia", settings: { cardColor: "red" } }).success, false);
  assert.deepEqual(linkSettings({ font: "serif", cardColor: "#ffffff", textColor: "nada" }), {
    font: "serif",
    cardColor: "#ffffff",
    textColor: "#3b0a3f",
    buttonColor: "#fbeafd",
  });
});

test("links salvos no banco: só os válidos chegam na página", () => {
  assert.deepEqual(
    linkItems([
      { id: "a", title: "VIP", url: "https://x.com", highlight: true },
      { id: "b", title: "", url: "https://x.com" },
      { id: "c", title: "Ruim", url: "javascript:alert(1)" },
      { id: "d", title: "Thumb", url: "/g/bia", thumbUrl: "http://inseguro.com/a.jpg" },
      null,
    ]),
    [
      { id: "a", title: "VIP", url: "https://x.com", highlight: true },
      { id: "d", title: "Thumb", url: "/g/bia" },
    ],
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { callLinkData, callLinkSchema, callLinkSettings, callNodeId } from "../src/services/call-links";

test("configuração do link da chamada vinda do banco", () => {
  assert.deepEqual(callLinkSettings({}), { published: false, characterId: null, name: null, avatarUrl: null, locale: "pt-BR", startAt: "start" });
  const s = callLinkSettings({ published: true, name: " Bia ", avatarUrl: "javascript:alert(1)", locale: "es-MX", startAt: "vip" });
  assert.equal(s.published, true);
  assert.equal(s.name, "Bia");
  assert.equal(s.avatarUrl, null);
  assert.equal(s.locale, "es-MX");
  assert.equal(s.startAt, "vip");
});

test("link da chamada: só publica com o link preenchido", () => {
  const semLink = callLinkData(callLinkSchema.parse({ slug: "", published: true }));
  assert.equal(semLink.callSlug, null);
  assert.equal((semLink.callSettings as { published: boolean }).published, false);
  const comLink = callLinkData(callLinkSchema.parse({ slug: "Chamada-Bia", published: true, startAt: "vip" }));
  assert.equal(comLink.callSlug, "chamada-bia");
  assert.equal((comLink.callSettings as { published: boolean }).published, true);
  assert.equal(callLinkSchema.safeParse({ slug: "com espaço" }).success, false);
  assert.equal(callLinkSchema.safeParse({ avatarUrl: "http://inseguro.com/a.jpg" }).success, false);
});

test("pagamentos do link ficam separados por vídeo", () => {
  assert.equal(callNodeId("abc123"), "call:abc123");
});

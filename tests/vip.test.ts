import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryPointsToGroup, postAccess, postUnlocked, subscriptionProductIds, vipMedia, vipSettings } from "../src/services/vip";
import { vslEmbed } from "../src/lib/vsl";

test("quem vê cada post", () => {
  const owned = new Set(["p1"]);
  assert.equal(postUnlocked({ access: "free", productId: null }, false, new Set()), true);
  assert.equal(postUnlocked({ access: "vip", productId: null }, false, owned), false);
  assert.equal(postUnlocked({ access: "vip", productId: null }, true, new Set()), true);
  // pago à parte: a assinatura não libera, só o produto do post
  assert.equal(postUnlocked({ access: "paid", productId: "p2" }, true, owned), false);
  assert.equal(postUnlocked({ access: "paid", productId: "p1" }, false, owned), true);
  // pago sem produto vale como VIP
  assert.equal(postAccess({ access: "paid", productId: null }), "vip");
  assert.equal(postAccess({ access: "qualquer", productId: null }), "vip");
});

test("link de entrega que dá acesso ao grupo", () => {
  assert.ok(deliveryPointsToGroup("https://site.app/hot-secret/g/bianca", "bianca"));
  assert.ok(deliveryPointsToGroup("https://site.app/hot-secret/g/bianca?x=1", "bianca"));
  assert.ok(deliveryPointsToGroup("/hot-secret/g/bianca/", "bianca"));
  assert.ok(!deliveryPointsToGroup("https://site.app/hot-secret/g/bianca-2", "bianca"));
  assert.ok(!deliveryPointsToGroup("https://drive.google.com/x", "bianca"));
  assert.ok(!deliveryPointsToGroup(null, "bianca"));
});

test("mídia e configurações vindas do banco", () => {
  assert.deepEqual(vipMedia([{ url: "/a.jpg", kind: "image", preview: "/p.jpg" }, { url: "/b.mp4", kind: "video" }, { kind: "image" }, null]), [
    { url: "/a.jpg", kind: "image", preview: "/p.jpg" },
    { url: "/b.mp4", kind: "video" },
  ]);
  assert.deepEqual(vipMedia("x"), []);
  assert.deepEqual(vipSettings({ headline: " Oi ", perks: ["a", "", 3], ctaLabel: "" }), { headline: "Oi", perks: ["a"], anyPurchase: true });
  // liberar para quem comprou qualquer produto: ligado por padrão, desliga só se marcado
  assert.equal(vipSettings({}).anyPurchase, true);
  assert.equal(vipSettings({ anyPurchase: false }).anyPurchase, false);
});

test("página de vendas: VSL, amostras, tema e planos extras", () => {
  const s = vipSettings({
    theme: "light",
    brand: " hotsecret ",
    likes: "52.3K",
    vslUrl: "https://youtu.be/abc12345",
    vslDelay: 42.4,
    samples: false,
    plans: [{ productId: "p3", label: "3 meses", badge: "" }, { label: "sem produto" }, null],
  });
  assert.equal(s.theme, "light");
  assert.equal(s.brand, "hotsecret");
  assert.equal(s.vslDelay, 42);
  assert.equal(s.samples, false);
  assert.deepEqual(s.plans, [{ productId: "p3", label: "3 meses" }]);
  // tema desconhecido volta para o escuro; atraso zero ou negativo não conta; amostras ligadas por padrão
  const d = vipSettings({ theme: "neon", vslDelay: -5 });
  assert.equal(d.theme, undefined);
  assert.equal(d.vslDelay, undefined);
  assert.equal(d.samples, undefined);
  // qualquer plano libera o VIP
  assert.deepEqual(subscriptionProductIds({ productId: "p1", settings: { plans: [{ productId: "p2" }, { productId: "p1" }] } }), ["p1", "p2"]);
  assert.deepEqual(subscriptionProductIds({ productId: null, settings: {} }), []);
});

test("link do VSL: player incorporado ou arquivo", () => {
  assert.match(vslEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")!, /^https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ\?autoplay=1&mute=1/);
  assert.match(vslEmbed("https://youtu.be/dQw4w9WgXcQ?t=3")!, /embed\/dQw4w9WgXcQ/);
  assert.match(vslEmbed("https://youtube.com/shorts/abcDEF123")!, /embed\/abcDEF123/);
  assert.match(vslEmbed("https://vimeo.com/123456789")!, /^https:\/\/player\.vimeo\.com\/video\/123456789/);
  assert.equal(vslEmbed("https://player.exemplo.com/embed/?v=xyz"), "https://player.exemplo.com/embed/?v=xyz");
  assert.equal(vslEmbed("/hot-secret/api/uploads/vsl.mp4"), null);
  assert.equal(vslEmbed("https://cdn.site.com/vsl.mp4"), null);
});

test("textos do tema claro: faixa, selos do plano e barra de baixo", () => {
  const s = vipSettings({ promoBar: " VÁLIDA ATÉ {hoje} ", planBadge: "MAIS POPULAR", planNote: "", promoTitle: "Promoções", barText: "VEJA TUDO POR {preco}" });
  assert.equal(s.promoBar, "VÁLIDA ATÉ {hoje}");
  assert.equal(s.planBadge, "MAIS POPULAR");
  assert.equal(s.planNote, undefined);
  assert.equal(s.promoTitle, "Promoções");
  assert.equal(s.barText, "VEJA TUDO POR {preco}");
});

test("números do perfil editáveis e até 10 planos extras", () => {
  const s = vipSettings({ showImages: " 401 ", showVideos: "", showPosts: "93", plans: Array.from({ length: 12 }, (_, i) => ({ productId: `p${i}` })) });
  assert.equal(s.showImages, "401");
  assert.equal(s.showVideos, undefined);
  assert.equal(s.showPosts, "93");
  assert.equal(s.plans?.length, 10);
});

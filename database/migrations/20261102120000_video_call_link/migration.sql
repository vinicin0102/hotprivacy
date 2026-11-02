-- Link da chamada de vídeo sem chat (/c/<callSlug>): o lead atende e cai direto no vídeo, com os upsells
ALTER TABLE "videos" ADD COLUMN "callSlug" TEXT;
ALTER TABLE "videos" ADD COLUMN "callSettings" JSONB NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX "videos_callSlug_key" ON "videos"("callSlug");

-- Página de links ("link na bio") de uma modelo
CREATE TABLE "link_pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "photoUrl" TEXT,
    "bgUrl" TEXT,
    "bio" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "links" JSONB NOT NULL DEFAULT '[]',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "link_pages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "link_pages_slug_key" ON "link_pages"("slug");

-- mesmo bloqueio das outras tabelas para a API pública do Supabase
ALTER TABLE "link_pages" ENABLE ROW LEVEL SECURITY;

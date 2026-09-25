-- Cor livre (#rrggbb), ícone em texto e ordem escolhida pela pessoa.
-- Ícone e cor eram enums do Postgres: cada ícone novo pedia migração, e cor livre era impossível.
ALTER TABLE "categories" ALTER COLUMN "icon" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "color" SET DATA TYPE text;--> statement-breakpoint

-- As nove cores antigas viram o hex equivalente, para nada mudar de aparência
UPDATE "categories" SET "color" = CASE "color"
  WHEN 'green' THEN '#10b981'
  WHEN 'teal' THEN '#14b8a6'
  WHEN 'blue' THEN '#0ea5e9'
  WHEN 'violet' THEN '#8b5cf6'
  WHEN 'pink' THEN '#ec4899'
  WHEN 'red' THEN '#ef4444'
  WHEN 'orange' THEN '#f97316'
  WHEN 'amber' THEN '#f59e0b'
  WHEN 'slate' THEN '#71717a'
  ELSE "color"
END WHERE "color" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "categories" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- A ordem inicial é a que já estava na tela (alfabética), para ninguém ver nada saltar
UPDATE "categories" AS c
SET "position" = o.rn
FROM (
  SELECT id, row_number() OVER (
    PARTITION BY "group_id", "kind", coalesce("parent_id"::text, '')
    ORDER BY "name"
  ) AS rn
  FROM "categories"
) AS o
WHERE c.id = o.id;--> statement-breakpoint

DROP TYPE "public"."category_color";--> statement-breakpoint
DROP TYPE "public"."category_icon";

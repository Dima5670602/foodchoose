-- ============================================
-- FOODCHOOSE - Schéma de base de données
-- Version 2.0
-- ============================================

-- Table des utilisateurs (inscription libre ou créés par l'admin)
CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  employee_id       VARCHAR(100) UNIQUE NOT NULL,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  email             VARCHAR(255) UNIQUE NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  role              VARCHAR(20)  DEFAULT 'employee',
  phone_number      VARCHAR(30),                     -- numéro pour la livraison
  company_name      VARCHAR(255),                    -- nom de l'organisation
  company_type      VARCHAR(100),                    -- type : Hôpital, Université...
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des menus plats
CREATE TABLE IF NOT EXISTS menus (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  description    TEXT         DEFAULT '',
  available      BOOLEAN      DEFAULT TRUE,
  image_url      TEXT,                               -- base64 data URL ou URL externe
  price          DECIMAL(10,2),                      -- prix en FCFA
  delivery_time  VARCHAR(50),                        -- ex : "environ 12h30"
  day_of_week    VARCHAR(20)  DEFAULT 'tous',        -- lundi/mardi/.../dimanche/tous
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des menus boissons
CREATE TABLE IF NOT EXISTS beverages (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  description    TEXT         DEFAULT '',
  price          DECIMAL(10,2),
  image_url      TEXT,
  available      BOOLEAN      DEFAULT TRUE,
  day_of_week    VARCHAR(20)  DEFAULT 'tous',
  delivery_time  VARCHAR(50),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des commandes (une par utilisateur par jour)
CREATE TABLE IF NOT EXISTS orders (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id)     ON DELETE CASCADE,
  menu_id      INTEGER REFERENCES menus(id)     ON DELETE SET NULL,     -- nullable (boisson seule)
  beverage_id  INTEGER REFERENCES beverages(id) ON DELETE SET NULL,     -- nullable (plat seul)
  order_type   VARCHAR(20) DEFAULT 'food',       -- 'food' | 'drink' | 'both'
  order_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  status       VARCHAR(20) DEFAULT 'pending',    -- 'pending' | 'validated'
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, order_date)
);

-- Table de l'historique des commandes (journal d'audit)
CREATE TABLE IF NOT EXISTS order_history (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  employee_id      VARCHAR(100),
  employee_name    VARCHAR(255),
  menu_name        VARCHAR(255),
  beverage_name    VARCHAR(255),
  order_type       VARCHAR(20),
  order_date       DATE NOT NULL,
  status           VARCHAR(20),
  action           VARCHAR(50),                  -- 'created' | 'updated' | 'deleted' | 'validated'
  action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des notations et avis (une par commande validée par utilisateur)
CREATE TABLE IF NOT EXISTS ratings (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id)     ON DELETE CASCADE,
  order_id       INTEGER REFERENCES orders(id)    ON DELETE CASCADE,
  menu_id        INTEGER REFERENCES menus(id)     ON DELETE SET NULL,
  beverage_id    INTEGER REFERENCES beverages(id) ON DELETE SET NULL,
  food_rating    INTEGER CHECK (food_rating  BETWEEN 1 AND 5),  -- note plat 1-5 étoiles
  food_comment   TEXT    DEFAULT '',
  drink_rating   INTEGER CHECK (drink_rating BETWEEN 1 AND 5),  -- note boisson 1-5 étoiles
  drink_comment  TEXT    DEFAULT '',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, order_id)
);

-- ── Index pour les performances ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_user_id      ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_date   ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders(status);
CREATE INDEX IF NOT EXISTS idx_menus_day           ON menus(day_of_week);
CREATE INDEX IF NOT EXISTS idx_menus_available     ON menus(available);
CREATE INDEX IF NOT EXISTS idx_beverages_day       ON beverages(day_of_week);
CREATE INDEX IF NOT EXISTS idx_beverages_available ON beverages(available);
CREATE INDEX IF NOT EXISTS idx_history_user_id     ON order_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_order_date  ON order_history(order_date);
CREATE INDEX IF NOT EXISTS idx_ratings_user_id     ON ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_order_id    ON ratings(order_id);
CREATE INDEX IF NOT EXISTS idx_ratings_menu_id     ON ratings(menu_id);
CREATE INDEX IF NOT EXISTS idx_ratings_beverage_id ON ratings(beverage_id);

-- ── Valeurs possibles pour day_of_week ───────────────────────────────
-- 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'
-- 'tous'  → disponible tous les jours de la semaine

-- ── Valeurs possibles pour order_type ────────────────────────────────
-- 'food'  → plat seulement  (menu_id requis, beverage_id NULL)
-- 'drink' → boisson seule   (beverage_id requis, menu_id NULL)
-- 'both'  → plat + boisson  (menu_id et beverage_id requis)

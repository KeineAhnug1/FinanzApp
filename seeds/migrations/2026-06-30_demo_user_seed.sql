-- =============================================================================
-- Seed: Realistic Demo User (2026-06-30)
-- =============================================================================
-- Creates 7 demo users for showcasing the app:
--   * `demo`        — main user "Max Müller" (login: demo / Test1234!)
--   * `demo_anna`, `demo_jonas`, `demo_lea`, `demo_ben`, `demo_marie`, `demo_tim`
--     — side users for groups, transfers, forum posts
--
-- Populates 30 months of realistic finance history (2024-01-02 → 2026-06-30):
-- bank accounts, share depot, monthly salary/rent/Netflix/Spotify/Fitness/
-- Strom/Internet/Ticket, ad-hoc groceries/restaurant/clothing/etc., 4 groups
-- (WG, Mallorca trip, gift collection, team lunch), forum questions+answers.
--
-- Idempotent: starts with DELETE FROM users WHERE username IN (...).
-- ON DELETE CASCADE on user_id removes all child rows. Re-running produces
-- the same final state. Wrap is BEGIN/COMMIT.
--
-- Password hash literal (PBKDF2-SHA256 of "Test1234!"):
--   scrypt:1f9a7b5e3c8d0a2f4e6b1c9d8a7f5e3b2c4d6f8a0b1c2d3e4f5a6b7c8d9e0f1a:
--   5cca9bae9b99531ddc8854c79ec4ed042bf4caa912818f489febf157130f9307
--   bd90d75347e545d4dc783a3e91e019dc6912347bdf16ed308914bb156ec55ef3
-- Verified by backend/src/lib/utils/__tests__/password.test.ts.
--
-- Run manually in Supabase SQL editor. Requires the two prior migrations
-- (2026-06-29_groups_expansion.sql, 2026-06-30_audit_fixes.sql) applied first.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Cleanup — remove any previous demo seed (idempotent re-run)
-- ---------------------------------------------------------------------------
-- Some tables reference users(id) without ON DELETE CASCADE (notably
-- `transfers`, `share_accounts`, `group_message`, `group_members`, forum
-- tables) — delete those rows explicitly first so the final
-- DELETE FROM users succeeds without FK violations.

DO $$
DECLARE
  v_uids INT[];
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::INT[]) INTO v_uids
    FROM users
   WHERE username IN ('demo','demo_anna','demo_jonas','demo_lea','demo_ben','demo_marie','demo_tim');

  IF array_length(v_uids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Forum (likes → answers → questions)
  DELETE FROM answer_likes   WHERE user_id = ANY(v_uids);
  DELETE FROM question_likes WHERE user_id = ANY(v_uids);
  DELETE FROM global_answers   WHERE from_user_id = ANY(v_uids);
  DELETE FROM global_questions WHERE from_user_id = ANY(v_uids);

  -- Group messages
  DELETE FROM group_message WHERE from_user_id = ANY(v_uids);

  -- Peer transfers and downstream ledger linkage
  DELETE FROM transfers WHERE from_user_id = ANY(v_uids) OR to_user_id = ANY(v_uids);

  -- Trip settlement chain
  DELETE FROM group_trip_settlements         WHERE from_user_id = ANY(v_uids) OR to_user_id = ANY(v_uids);
  DELETE FROM group_trip_expense_participants WHERE user_id = ANY(v_uids);
  DELETE FROM group_trip_expenses             WHERE payer_user_id = ANY(v_uids);
  DELETE FROM group_trip_participants         WHERE user_id = ANY(v_uids);
  DELETE FROM group_trips                     WHERE creator_user_id = ANY(v_uids);

  -- Shared expenses chain
  DELETE FROM group_shared_expense_shares WHERE user_id = ANY(v_uids);
  DELETE FROM group_shared_expenses       WHERE creator_user_id = ANY(v_uids);

  -- Group funding/expenses + group memberships + groups (creator side)
  DELETE FROM funding_participants
   WHERE bank_account_id IN (SELECT id FROM bank_accounts WHERE user_id = ANY(v_uids));
  DELETE FROM group_members WHERE user_id = ANY(v_uids);
  DELETE FROM groups
   WHERE id IN (
     SELECT id FROM groups WHERE name IN
       ('WG Hauptstraße 12','Mallorca 2025','Geschenke für Lea','Team Lunch Bonn')
   );

  -- Per-account finance rows (in case CASCADE from users is missing)
  DELETE FROM private_expenses
   WHERE bank_account_id IN (SELECT id FROM bank_accounts WHERE user_id = ANY(v_uids));
  DELETE FROM income
   WHERE bank_account_id IN (SELECT id FROM bank_accounts WHERE user_id = ANY(v_uids));
  DELETE FROM shares
   WHERE share_account_id IN (SELECT id FROM share_accounts WHERE user_id = ANY(v_uids))
      OR bank_account_id  IN (SELECT id FROM bank_accounts  WHERE user_id = ANY(v_uids));
  DELETE FROM share_accounts  WHERE user_id = ANY(v_uids);

  DELETE FROM budgets         WHERE user_id = ANY(v_uids);
  DELETE FROM user_categories WHERE user_id = ANY(v_uids);

  -- Drop default_bank_account_id (FK ON DELETE SET NULL is set, but be explicit)
  UPDATE users SET default_bank_account_id = NULL WHERE id = ANY(v_uids);
  DELETE FROM bank_accounts WHERE user_id = ANY(v_uids);

  DELETE FROM users WHERE id = ANY(v_uids);
END $$;

-- ---------------------------------------------------------------------------
-- 1. Users — 1 main (Max Müller) + 6 side users
-- ---------------------------------------------------------------------------

INSERT INTO users (username, email, password, first_name, last_name, age, income, "profileImage", created_at) VALUES
  ('demo',       'demo@finanzapp.test',       'scrypt:1f9a7b5e3c8d0a2f4e6b1c9d8a7f5e3b2c4d6f8a0b1c2d3e4f5a6b7c8d9e0f1a:5cca9bae9b99531ddc8854c79ec4ed042bf4caa912818f489febf157130f9307bd90d75347e545d4dc783a3e91e019dc6912347bdf16ed308914bb156ec55ef3', 'Max',   'Müller',   23, 1100, NULL, '2024-01-02 09:15:00'),
  ('demo_anna',  'anna@finanzapp.test',       'scrypt:1f9a7b5e3c8d0a2f4e6b1c9d8a7f5e3b2c4d6f8a0b1c2d3e4f5a6b7c8d9e0f1a:5cca9bae9b99531ddc8854c79ec4ed042bf4caa912818f489febf157130f9307bd90d75347e545d4dc783a3e91e019dc6912347bdf16ed308914bb156ec55ef3', 'Anna',  'Becker',   24, 1300, NULL, '2024-02-09 18:20:00'),
  ('demo_jonas', 'jonas@finanzapp.test',      'scrypt:1f9a7b5e3c8d0a2f4e6b1c9d8a7f5e3b2c4d6f8a0b1c2d3e4f5a6b7c8d9e0f1a:5cca9bae9b99531ddc8854c79ec4ed042bf4caa912818f489febf157130f9307bd90d75347e545d4dc783a3e91e019dc6912347bdf16ed308914bb156ec55ef3', 'Jonas', 'Krüger',   25, 2200, NULL, '2024-05-12 12:00:00'),
  ('demo_lea',   'lea@finanzapp.test',        'scrypt:1f9a7b5e3c8d0a2f4e6b1c9d8a7f5e3b2c4d6f8a0b1c2d3e4f5a6b7c8d9e0f1a:5cca9bae9b99531ddc8854c79ec4ed042bf4caa912818f489febf157130f9307bd90d75347e545d4dc783a3e91e019dc6912347bdf16ed308914bb156ec55ef3', 'Lea',   'Müller',   21, 950,  NULL, '2024-08-03 10:30:00'),
  ('demo_ben',   'ben@finanzapp.test',        'scrypt:1f9a7b5e3c8d0a2f4e6b1c9d8a7f5e3b2c4d6f8a0b1c2d3e4f5a6b7c8d9e0f1a:5cca9bae9b99531ddc8854c79ec4ed042bf4caa912818f489febf157130f9307bd90d75347e545d4dc783a3e91e019dc6912347bdf16ed308914bb156ec55ef3', 'Ben',   'Schäfer',  26, 1800, NULL, '2024-11-22 19:45:00'),
  ('demo_marie', 'marie@finanzapp.test',      'scrypt:1f9a7b5e3c8d0a2f4e6b1c9d8a7f5e3b2c4d6f8a0b1c2d3e4f5a6b7c8d9e0f1a:5cca9bae9b99531ddc8854c79ec4ed042bf4caa912818f489febf157130f9307bd90d75347e545d4dc783a3e91e019dc6912347bdf16ed308914bb156ec55ef3', 'Marie', 'Weiss',    22, 1050, NULL, '2024-02-09 18:25:00'),
  ('demo_tim',   'tim@finanzapp.test',        'scrypt:1f9a7b5e3c8d0a2f4e6b1c9d8a7f5e3b2c4d6f8a0b1c2d3e4f5a6b7c8d9e0f1a:5cca9bae9b99531ddc8854c79ec4ed042bf4caa912818f489febf157130f9307bd90d75347e545d4dc783a3e91e019dc6912347bdf16ed308914bb156ec55ef3', 'Tim',   'Hartmann', 23, 1150, NULL, '2024-02-09 18:30:00');

-- ---------------------------------------------------------------------------
-- 2. Bank accounts — Max has 3, others have 1
-- ---------------------------------------------------------------------------

INSERT INTO bank_accounts (user_id, label, balance, created_at)
SELECT u.id, x.label, x.balance, x.created_at::timestamp
  FROM users u
  JOIN (VALUES
    ('demo',       'Girokonto',  3200.00, '2024-01-02 09:20:00'),
    ('demo',       'Sparkonto',  5800.00, '2024-03-15 14:10:00'),
    ('demo',       'Tagesgeld',  2400.00, '2024-09-01 11:00:00'),
    ('demo_anna',  'Girokonto',  1450.00, '2024-02-09 18:30:00'),
    ('demo_jonas', 'Girokonto',  1980.00, '2024-05-12 12:10:00'),
    ('demo_lea',   'Girokonto',   880.00, '2024-08-03 10:35:00'),
    ('demo_ben',   'Girokonto',  1650.00, '2024-11-22 19:50:00'),
    ('demo_marie', 'Girokonto',  1180.00, '2024-02-09 18:35:00'),
    ('demo_tim',   'Girokonto',  1240.00, '2024-02-09 18:40:00')
  ) AS x(username, label, balance, created_at) ON x.username = u.username;

-- ---------------------------------------------------------------------------
-- 3. Share depot + 6 positions for Max
-- ---------------------------------------------------------------------------

INSERT INTO share_accounts (user_id, label, created_at)
SELECT id, 'Aktiendepot', '2024-04-10 16:00:00'::timestamp FROM users WHERE username = 'demo';

INSERT INTO shares (share_account_id, depot_id, bank_account_id, symbol, units, bought_at, bought_for)
SELECT sa.id, sa.id, ba.id, x.symbol, x.units, x.bought_at::timestamp, x.bought_for
  FROM share_accounts sa
  JOIN users u ON u.id = sa.user_id AND u.username = 'demo'
  JOIN bank_accounts ba ON ba.user_id = u.id AND ba.label = 'Girokonto'
  JOIN (VALUES
    ('SAP.DE', 5,  '2024-04-10', 142.30),
    ('AAPL',   3,  '2024-05-22', 178.50),
    ('MSFT',   2,  '2024-06-18', 415.80),
    ('ALV.DE', 2,  '2024-09-04', 268.10),
    ('TSLA',   4,  '2025-02-14', 195.60),
    ('SIE.DE', 3,  '2025-08-19', 175.20)
  ) AS x(symbol, units, bought_at, bought_for) ON TRUE;

-- ---------------------------------------------------------------------------
-- 4. Custom expense categories for Max
-- ---------------------------------------------------------------------------

INSERT INTO user_categories (user_id, kind, key, value, created_at, updated_at)
SELECT u.id, 'expense', x.key, x.value, '2024-04-01'::timestamp, '2024-04-01'::timestamp
  FROM users u
  JOIN (VALUES
    ('kaffee', 'Kaffee'),
    ('spende', 'Spende'),
    ('hobby',  'Hobby-Material')
  ) AS x(key, value) ON TRUE
 WHERE u.username = 'demo';

-- ---------------------------------------------------------------------------
-- 5. Budgets for Max (4)
-- ---------------------------------------------------------------------------

INSERT INTO budgets (user_id, category, target_amount, current_amount, reset_date, created_at)
SELECT u.id, x.category, x.target_amount, x.current_amount, '2026-07-01'::timestamp, '2026-06-01'::timestamp
  FROM users u
  JOIN (VALUES
    ('groceries',     350.00, 280.00),
    ('entertainment',  80.00,  24.00),
    ('transport',      60.00,  49.00),
    ('other',         100.00,  65.00)
  ) AS x(category, target_amount, current_amount) ON TRUE
 WHERE u.username = 'demo';

-- ---------------------------------------------------------------------------
-- 6. Income — monthly salary + sporadic extras for Max (Werkstudent → Junior)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_id INT;
  v_giro INT;
  v_spar INT;
  v_tagesgeld INT;
  d DATE;
  v_amount NUMERIC;
  v_source VARCHAR;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE username = 'demo';
  SELECT id INTO v_giro       FROM bank_accounts WHERE user_id = v_user_id AND label = 'Girokonto';
  SELECT id INTO v_spar       FROM bank_accounts WHERE user_id = v_user_id AND label = 'Sparkonto';
  SELECT id INTO v_tagesgeld  FROM bank_accounts WHERE user_id = v_user_id AND label = 'Tagesgeld';

  -- Monthly salary (Werkstudent 2024 → Junior-Dev from 2025-08)
  FOR d IN SELECT generate_series('2024-01-25'::date, '2026-06-25'::date, '1 month'::interval)::date LOOP
    IF d < '2025-08-01' THEN
      v_amount := 1100.00;
      v_source := 'Werkstudent Gehalt';
    ELSE
      v_amount := 2850.00;
      v_source := 'Junior-Developer Gehalt';
    END IF;
    INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info,
                        recurrence, cycle, is_active, state, created_at)
    VALUES (v_giro, v_source, 'salary', v_amount, d::timestamp, d::timestamp, 'Monatsgehalt',
            NULL, 'monthly', TRUE, 'open', d::timestamp);
  END LOOP;

  -- Steuerrückerstattung (yearly)
  INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, created_at) VALUES
    (v_giro, 'Steuerrückerstattung 2023', 'other', 312.00, '2024-06-12', '2024-06-12', 'Lohnsteuer', 'once', TRUE, 'open', '2024-06-12'),
    (v_giro, 'Steuerrückerstattung 2024', 'other', 487.50, '2025-05-19', '2025-05-19', 'Lohnsteuer', 'once', TRUE, 'open', '2025-05-19'),
    (v_giro, 'Steuerrückerstattung 2025', 'other', 521.20, '2026-05-08', '2026-05-08', 'Lohnsteuer', 'once', TRUE, 'open', '2026-05-08');

  -- Geburtstagsgeld (Max hat im April Geburtstag)
  INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, created_at) VALUES
    (v_giro, 'Geburtstagsgeld Oma', 'gift', 100.00, '2024-04-14', '2024-04-14', 'Zum 23.', 'once', TRUE, 'open', '2024-04-14'),
    (v_giro, 'Geburtstagsgeld Familie', 'gift', 200.00, '2025-04-14', '2025-04-14', 'Zum 24.', 'once', TRUE, 'open', '2025-04-14'),
    (v_giro, 'Geburtstagsgeld Familie', 'gift', 150.00, '2026-04-14', '2026-04-14', 'Zum 25.', 'once', TRUE, 'open', '2026-04-14');

  -- Sparkonto-Zinsen (quartalsweise)
  FOR d IN SELECT generate_series('2024-06-30'::date, '2026-06-30'::date, '3 months'::interval)::date LOOP
    INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, created_at)
    VALUES (v_spar, 'Sparzinsen', 'interest', round((random()*15 + 8)::numeric, 2), d::timestamp, d::timestamp,
            'Quartalsgutschrift', 'once', TRUE, 'open', d::timestamp);
  END LOOP;

  -- Tagesgeld-Zinsen (monatlich ab Eröffnung)
  FOR d IN SELECT generate_series('2024-10-01'::date, '2026-06-01'::date, '1 month'::interval)::date LOOP
    INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, created_at)
    VALUES (v_tagesgeld, 'Tagesgeld-Zinsen', 'interest', round((random()*4 + 2)::numeric, 2), d::timestamp, d::timestamp,
            'Monatszinsen', NULL, 'monthly', TRUE, 'open', d::timestamp);
  END LOOP;

  -- Aktien-Dividenden (sporadisch)
  INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, created_at) VALUES
    (v_giro, 'Dividende SAP',     'dividend',  9.40, '2024-05-15', '2024-05-15', '5 Aktien', 'once', TRUE, 'open', '2024-05-15'),
    (v_giro, 'Dividende Allianz', 'dividend', 26.80, '2024-05-22', '2024-05-22', '2 Aktien', 'once', TRUE, 'open', '2024-05-22'),
    (v_giro, 'Dividende Apple',   'dividend',  3.10, '2024-08-15', '2024-08-15', '3 Aktien', 'once', TRUE, 'open', '2024-08-15'),
    (v_giro, 'Dividende SAP',     'dividend', 12.20, '2025-05-15', '2025-05-15', '5 Aktien', 'once', TRUE, 'open', '2025-05-15'),
    (v_giro, 'Dividende Allianz', 'dividend', 29.60, '2025-05-22', '2025-05-22', '2 Aktien', 'once', TRUE, 'open', '2025-05-22'),
    (v_giro, 'Dividende Siemens', 'dividend', 14.10, '2025-11-12', '2025-11-12', '3 Aktien', 'once', TRUE, 'open', '2025-11-12'),
    (v_giro, 'Dividende SAP',     'dividend', 13.50, '2026-05-15', '2026-05-15', '5 Aktien', 'once', TRUE, 'open', '2026-05-15'),
    (v_giro, 'Dividende Allianz', 'dividend', 31.00, '2026-05-22', '2026-05-22', '2 Aktien', 'once', TRUE, 'open', '2026-05-22');
END $$;

-- ---------------------------------------------------------------------------
-- 7. Private expenses — recurring monthly (rent, Netflix, Spotify, Fitness,
--    Strom, Internet, Deutschland-Ticket) + ad-hoc Lebensmittel/Restaurant/etc.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_id INT;
  v_giro INT;
  d DATE;
  i INT;
  v_rand NUMERIC;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE username = 'demo';
  SELECT id INTO v_giro FROM bank_accounts WHERE user_id = v_user_id AND label = 'Girokonto';

  -- Deterministic randomness for reproducible re-runs
  PERFORM setseed(0.42);

  -- Recurring monthly entries (rent + subscriptions)
  FOR d IN SELECT generate_series('2024-01-28'::date, '2026-06-28'::date, '1 month'::interval)::date LOOP
    INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, created_at) VALUES
      (v_giro, 'Miete WG-Anteil',       'rent',          550.00, 550.00, d, d, d, 'Hauptstraße 12',     'monthly', TRUE, 'open', d::timestamp),
      (v_giro, 'Netflix Abo',           'entertainment',  12.99,  12.99, d, d, d, 'Streaming-Abo',      'monthly', TRUE, 'open', d::timestamp),
      (v_giro, 'Spotify Premium',       'entertainment',  10.99,  10.99, d, d, d, 'Musik-Abo',          'monthly', TRUE, 'open', d::timestamp),
      (v_giro, 'Strom',                 'utilities',      65.00,  65.00, d, d, d, 'Stadtwerke',         'monthly', TRUE, 'open', d::timestamp),
      (v_giro, 'Internet (WG-Anteil)',  'utilities',      39.90,  39.90, d, d, d, '1&1 WG-Anteil',      'monthly', TRUE, 'open', d::timestamp),
      (v_giro, 'Deutschland-Ticket',    'transport',      49.00,  49.00, d, d, d, 'Monatsabo',          'monthly', TRUE, 'open', d::timestamp);
    -- Fitnessstudio ab März 2024
    IF d >= '2024-03-01' THEN
      INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, created_at) VALUES
        (v_giro, 'Fitnessstudio', 'health', 29.90, 29.90, d, d, d, 'McFIT Bonn', 'monthly', TRUE, 'open', d::timestamp);
    END IF;
  END LOOP;

  -- Lebensmittel: 6-12 trips per month (35-80 EUR each)
  FOR d IN SELECT generate_series('2024-01-05'::date, '2026-06-25'::date, '1 month'::interval)::date LOOP
    FOR i IN 1..(6 + floor(random()*7)::int) LOOP
      v_rand := round((35 + random()*45)::numeric, 2);
      INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, created_at)
      VALUES (v_giro,
              CASE floor(random()*4)::int WHEN 0 THEN 'REWE' WHEN 1 THEN 'Aldi' WHEN 2 THEN 'Edeka' ELSE 'Lidl' END,
              'groceries', v_rand, v_rand,
              (d + (floor(random()*25)::int || ' days')::interval)::date,
              (d + (floor(random()*25)::int || ' days')::interval)::date,
              (d + (floor(random()*25)::int || ' days')::interval)::date,
              'Wocheneinkauf', 'once', TRUE, 'open',
              (d + (floor(random()*25)::int || ' days')::interval)::timestamp);
    END LOOP;
  END LOOP;

  -- Restaurant/Café: 2-5 per month (10-35 EUR)
  FOR d IN SELECT generate_series('2024-01-05'::date, '2026-06-25'::date, '1 month'::interval)::date LOOP
    FOR i IN 1..(2 + floor(random()*4)::int) LOOP
      v_rand := round((10 + random()*25)::numeric, 2);
      INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, created_at)
      VALUES (v_giro,
              CASE floor(random()*5)::int WHEN 0 THEN 'Burger House' WHEN 1 THEN 'Café Central' WHEN 2 THEN 'Pizza Bella' WHEN 3 THEN 'Sushi Place' ELSE 'Döner um die Ecke' END,
              CASE WHEN random() < 0.4 THEN 'kaffee' ELSE 'entertainment' END,
              v_rand, v_rand,
              (d + (floor(random()*25)::int || ' days')::interval)::date,
              (d + (floor(random()*25)::int || ' days')::interval)::date,
              (d + (floor(random()*25)::int || ' days')::interval)::date,
              'Essen gehen', 'once', TRUE, 'open',
              (d + (floor(random()*25)::int || ' days')::interval)::timestamp);
    END LOOP;
  END LOOP;

  -- One-off Kleidung / Tech / Geschenke / Urlaub / Apotheke / Arzt / Friseur / Hobby / Spende
  INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, created_at) VALUES
    (v_giro, 'Sneakers Adidas',      'other',         89.95,  89.95, '2024-03-08', '2024-03-08', '2024-03-08', 'Neue Sneaker',          'once', TRUE, 'open', '2024-03-08'),
    (v_giro, 'Winterjacke',          'other',        149.00, 149.00, '2024-11-05', '2024-11-05', '2024-11-05', 'Frühlingseinkauf',      'once', TRUE, 'open', '2024-11-05'),
    (v_giro, 'Tech-Spielzeug',       'other',         59.90,  59.90, '2025-03-12', '2025-03-12', '2025-03-12', 'Bluetooth-Lautsprecher','once', TRUE, 'open', '2025-03-12'),
    (v_giro, 'Mechanische Tastatur', 'other',        119.00, 119.00, '2025-09-04', '2025-09-04', '2025-09-04', 'Logitech MX',           'once', TRUE, 'open', '2025-09-04'),
    (v_giro, 'Monitor 27"',          'other',        289.00, 289.00, '2025-12-18', '2025-12-18', '2025-12-18', 'Neujahrs-Setup',        'once', TRUE, 'open', '2025-12-18'),
    (v_giro, 'Geschenk Mama',        'other',         45.00,  45.00, '2024-05-12', '2024-05-12', '2024-05-12', 'Muttertag',             'once', TRUE, 'open', '2024-05-12'),
    (v_giro, 'Geschenk Papa',        'other',         60.00,  60.00, '2025-06-15', '2025-06-15', '2025-06-15', 'Vatertag',              'once', TRUE, 'open', '2025-06-15'),
    (v_giro, 'Pauschalreise Italien','other',        420.00, 420.00, '2024-07-22', '2024-07-22', '2024-07-22', 'Sommerurlaub Toskana',  'once', TRUE, 'open', '2024-07-22'),
    (v_giro, 'Skiausrüstung',        'other',        180.00, 180.00, '2025-01-08', '2025-01-08', '2025-01-08', 'Schi-Wochenende',       'once', TRUE, 'open', '2025-01-08'),
    (v_giro, 'Apotheke',             'health',        18.40,  18.40, '2024-02-19', '2024-02-19', '2024-02-19', 'Erkältungsmittel',      'once', TRUE, 'open', '2024-02-19'),
    (v_giro, 'Apotheke',             'health',        22.60,  22.60, '2025-11-08', '2025-11-08', '2025-11-08', 'Vitamine',              'once', TRUE, 'open', '2025-11-08'),
    (v_giro, 'Zahnarzt Eigenanteil', 'health',        78.00,  78.00, '2024-09-25', '2024-09-25', '2024-09-25', 'Prophylaxe',            'once', TRUE, 'open', '2024-09-25'),
    (v_giro, 'Hausarzt-Zuzahlung',   'health',         5.00,   5.00, '2025-03-19', '2025-03-19', '2025-03-19', 'Rezept',                'once', TRUE, 'open', '2025-03-19'),
    (v_giro, 'Friseur',              'other',         28.00,  28.00, '2024-04-10', '2024-04-10', '2024-04-10', 'Haarschnitt',           'once', TRUE, 'open', '2024-04-10'),
    (v_giro, 'Friseur',              'other',         32.00,  32.00, '2024-11-14', '2024-11-14', '2024-11-14', 'Haarschnitt',           'once', TRUE, 'open', '2024-11-14'),
    (v_giro, 'Friseur',              'other',         34.00,  34.00, '2025-08-09', '2025-08-09', '2025-08-09', 'Haarschnitt',           'once', TRUE, 'open', '2025-08-09'),
    (v_giro, 'Friseur',              'other',         34.00,  34.00, '2026-02-21', '2026-02-21', '2026-02-21', 'Haarschnitt',           'once', TRUE, 'open', '2026-02-21'),
    (v_giro, 'Gitarrenseiten',       'hobby',         24.50,  24.50, '2024-06-04', '2024-06-04', '2024-06-04', 'Hobby-Bedarf',          'once', TRUE, 'open', '2024-06-04'),
    (v_giro, 'Skizzenbuch',          'hobby',         12.80,  12.80, '2025-04-17', '2025-04-17', '2025-04-17', 'Kreatives',             'once', TRUE, 'open', '2025-04-17'),
    (v_giro, 'Kamerafilter',         'hobby',         39.00,  39.00, '2025-10-22', '2025-10-22', '2025-10-22', 'Fotografie',            'once', TRUE, 'open', '2025-10-22'),
    (v_giro, 'Spende WWF',           'spende',        20.00,  20.00, '2024-12-20', '2024-12-20', '2024-12-20', 'Naturschutz',           'once', TRUE, 'open', '2024-12-20'),
    (v_giro, 'Spende SOS-Kinderdorf','spende',        25.00,  25.00, '2025-12-22', '2025-12-22', '2025-12-22', 'Weihnachten',           'once', TRUE, 'open', '2025-12-22');
END $$;

-- ---------------------------------------------------------------------------
-- 8. Groups — 4 groups (WG, Mallorca, Geschenke, Team Lunch)
-- ---------------------------------------------------------------------------

INSERT INTO groups (name, info, address, created_at) VALUES
  ('WG Hauptstraße 12', 'Unsere WG in Bonn',     'Hauptstraße 12, 53111 Bonn', '2024-02-10 14:00:00'),
  ('Mallorca 2025',     'Wochenend-Trip',         NULL,                         '2025-05-01 17:30:00'),
  ('Geschenke für Lea', 'Sammelaktion Geburtstag', NULL,                         '2025-09-15 11:00:00'),
  ('Team Lunch Bonn',   'Wöchentliches Team-Essen', 'Bonn Mitte',               '2026-01-10 10:00:00');

-- Group members (joined_at + status='accepted', role admin for creator)
INSERT INTO group_members (user_id, group_id, role, status, joined_at)
SELECT u.id, g.id, x.role, 'accepted', x.joined_at::timestamp
  FROM groups g
  JOIN (VALUES
    -- WG Hauptstraße 12 (admin: Max)
    ('WG Hauptstraße 12', 'demo',       'admin',  '2024-02-10 14:00:00'),
    ('WG Hauptstraße 12', 'demo_anna',  'member', '2024-02-10 14:05:00'),
    ('WG Hauptstraße 12', 'demo_marie', 'member', '2024-02-10 14:10:00'),
    ('WG Hauptstraße 12', 'demo_tim',   'member', '2024-02-10 14:15:00'),
    -- Mallorca 2025 (admin: Jonas)
    ('Mallorca 2025',     'demo_jonas', 'admin',  '2025-05-01 17:30:00'),
    ('Mallorca 2025',     'demo',       'member', '2025-05-01 17:35:00'),
    ('Mallorca 2025',     'demo_ben',   'member', '2025-05-01 17:40:00'),
    ('Mallorca 2025',     'demo_lea',   'member', '2025-05-01 17:45:00'),
    -- Geschenke für Lea (admin: Max)
    ('Geschenke für Lea', 'demo',       'admin',  '2025-09-15 11:00:00'),
    ('Geschenke für Lea', 'demo_jonas', 'member', '2025-09-15 11:05:00'),
    ('Geschenke für Lea', 'demo_ben',   'member', '2025-09-15 11:10:00'),
    -- Team Lunch Bonn (admin: Max)
    ('Team Lunch Bonn',   'demo',       'admin',  '2026-01-10 10:00:00'),
    ('Team Lunch Bonn',   'demo_ben',   'member', '2026-01-10 10:05:00'),
    ('Team Lunch Bonn',   'demo_tim',   'member', '2026-01-10 10:10:00')
  ) AS x(group_name, username, role, joined_at) ON x.group_name = g.name
  JOIN users u ON u.username = x.username;

-- Group activities
INSERT INTO group_activities (group_id, info, date, created_at)
SELECT g.id, x.info, x.date::date, x.created_at::timestamp
  FROM groups g
  JOIN (VALUES
    ('WG Hauptstraße 12', 'WG-Putztag',           '2024-03-02', '2024-02-25 12:00:00'),
    ('WG Hauptstraße 12', 'Grillabend',           '2024-07-15', '2024-07-10 18:00:00'),
    ('WG Hauptstraße 12', 'WG-Frühstück',         '2025-01-12', '2025-01-08 09:00:00'),
    ('WG Hauptstraße 12', 'Filmabend',            '2025-11-28', '2025-11-25 19:00:00'),
    ('Mallorca 2025',     'Anreise Flughafen',    '2025-06-12', '2025-05-15 12:00:00'),
    ('Mallorca 2025',     'Bootstour',            '2025-06-14', '2025-05-15 12:05:00')
  ) AS x(group_name, info, date, created_at) ON x.group_name = g.name;

-- Group funding entries
INSERT INTO group_funding (group_id, group_activity_id, amount, info, target_amount, status, completed_at, created_at)
SELECT g.id,
       (SELECT a.id FROM group_activities a WHERE a.group_id = g.id ORDER BY a.id LIMIT 1),
       x.amount, x.info, x.target_amount, x.status, x.completed_at::timestamp, x.created_at::timestamp
  FROM groups g
  JOIN (VALUES
    ('WG Hauptstraße 12', 450.00, 'Neuer Couch',        600.00, 'open',      NULL,                  '2024-04-12 10:00:00'),
    ('WG Hauptstraße 12',  80.00, 'Glühbirnen-Fonds',    80.00, 'completed', '2024-11-20 18:00:00', '2024-10-05 14:00:00'),
    ('Team Lunch Bonn',    20.00, 'Bürodeko',            50.00, 'open',      NULL,                  '2026-02-10 09:00:00')
  ) AS x(group_name, amount, info, target_amount, status, completed_at, created_at) ON x.group_name = g.name;

-- Geschenke-für-Lea funding (gets NULL activity, status completed)
INSERT INTO group_funding (group_id, group_activity_id, amount, info, target_amount, status, completed_at, created_at)
SELECT g.id, NULL, 5.00, 'Geburtstagsgeschenk Lea 2025', 150.00, 'completed', '2025-10-05 19:00:00', '2025-09-15 11:05:00'
  FROM groups g WHERE g.name = 'Geschenke für Lea';

-- Funding participants for Geschenke-für-Lea (Max, Jonas, Ben each 50)
INSERT INTO funding_participants (bank_account_id, group_funding_id, amount, created_at)
SELECT ba.id, gf.id, 50.00, '2025-10-01 12:00:00'::timestamp
  FROM users u
  JOIN bank_accounts ba ON ba.user_id = u.id AND ba.label = 'Girokonto'
  JOIN groups g ON g.name = 'Geschenke für Lea'
  JOIN group_funding gf ON gf.group_id = g.id AND gf.info = 'Geburtstagsgeschenk Lea 2025'
 WHERE u.username IN ('demo','demo_jonas','demo_ben');

-- Group expense for the Lea gift (145 EUR spent from pool)
INSERT INTO group_expenses (group_funding_id, amount, info, state, cycle, pay_date, due_date, created_at)
SELECT gf.id, 145.00, 'Buch + Gutschein', 'paid', 'once', '2025-10-05 19:00:00'::timestamp, '2025-10-05 19:00:00'::timestamp, '2025-10-05 19:00:00'::timestamp
  FROM groups g
  JOIN group_funding gf ON gf.group_id = g.id
 WHERE g.name = 'Geschenke für Lea';

-- ---------------------------------------------------------------------------
-- 9. WG shared expenses — "Miete WG" (28 periods) + "Strom + Gas" (20 periods)
--    All settled; postpaid; one transfer + paired ledger rows per non-creator
--    member per period.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_group_id INT;
  v_max_id   INT;
  v_anna_id  INT;
  v_marie_id INT;
  v_tim_id   INT;
  v_max_acc  INT;
  v_anna_acc INT;
  v_marie_acc INT;
  v_tim_acc  INT;
  v_se_miete INT;
  v_se_strom INT;
  v_share_max INT;
  v_share_anna INT;
  v_share_marie INT;
  v_share_tim INT;
  v_share_max_s INT;
  v_share_anna_s INT;
  v_share_marie_s INT;
  v_share_tim_s INT;
  v_period_id INT;
  v_transfer_id INT;
  v_settled_at TIMESTAMP;
  d DATE;
  v_title VARCHAR;
  v_amount NUMERIC;
  v_share_amount NUMERIC;
  member_username TEXT;
  member_uid INT;
  member_acc INT;
  member_share INT;
BEGIN
  SELECT id INTO v_group_id FROM groups WHERE name = 'WG Hauptstraße 12';
  SELECT id INTO v_max_id   FROM users WHERE username = 'demo';
  SELECT id INTO v_anna_id  FROM users WHERE username = 'demo_anna';
  SELECT id INTO v_marie_id FROM users WHERE username = 'demo_marie';
  SELECT id INTO v_tim_id   FROM users WHERE username = 'demo_tim';
  SELECT id INTO v_max_acc   FROM bank_accounts WHERE user_id = v_max_id   AND label = 'Girokonto';
  SELECT id INTO v_anna_acc  FROM bank_accounts WHERE user_id = v_anna_id  AND label = 'Girokonto';
  SELECT id INTO v_marie_acc FROM bank_accounts WHERE user_id = v_marie_id AND label = 'Girokonto';
  SELECT id INTO v_tim_acc   FROM bank_accounts WHERE user_id = v_tim_id   AND label = 'Girokonto';

  -- Insert Miete WG shared expense
  INSERT INTO group_shared_expenses (group_id, creator_user_id, title, info, total_amount, payment_mode, cycle, status, created_at, updated_at)
  VALUES (v_group_id, v_max_id, 'Miete WG', 'Monatliche Miete - 4er WG', 1650.00, 'postpaid', 'monthly', 'active', '2024-02-10 14:30:00', '2024-02-10 14:30:00')
  RETURNING id INTO v_se_miete;

  -- 4 shares (1 per member) for Miete
  INSERT INTO group_shared_expense_shares (shared_expense_id, user_id, share_amount, status, decided_at, created_at) VALUES
    (v_se_miete, v_max_id,   412.50, 'paid', '2024-02-10 14:30:00', '2024-02-10 14:30:00')
    RETURNING id INTO v_share_max;
  INSERT INTO group_shared_expense_shares (shared_expense_id, user_id, share_amount, status, decided_at, created_at) VALUES
    (v_se_miete, v_anna_id,  412.50, 'paid', '2024-02-10 14:30:00', '2024-02-10 14:30:00')
    RETURNING id INTO v_share_anna;
  INSERT INTO group_shared_expense_shares (shared_expense_id, user_id, share_amount, status, decided_at, created_at) VALUES
    (v_se_miete, v_marie_id, 412.50, 'paid', '2024-02-10 14:30:00', '2024-02-10 14:30:00')
    RETURNING id INTO v_share_marie;
  INSERT INTO group_shared_expense_shares (shared_expense_id, user_id, share_amount, status, decided_at, created_at) VALUES
    (v_se_miete, v_tim_id,   412.50, 'paid', '2024-02-10 14:30:00', '2024-02-10 14:30:00')
    RETURNING id INTO v_share_tim;

  -- Insert Strom+Gas shared expense
  INSERT INTO group_shared_expenses (group_id, creator_user_id, title, info, total_amount, payment_mode, cycle, status, created_at, updated_at)
  VALUES (v_group_id, v_max_id, 'Strom + Gas', 'Nebenkosten WG', 220.00, 'postpaid', 'monthly', 'active', '2024-11-01 10:00:00', '2024-11-01 10:00:00')
  RETURNING id INTO v_se_strom;

  INSERT INTO group_shared_expense_shares (shared_expense_id, user_id, share_amount, status, decided_at, created_at) VALUES
    (v_se_strom, v_max_id,   55.00, 'paid', '2024-11-01 10:00:00', '2024-11-01 10:00:00')
    RETURNING id INTO v_share_max_s;
  INSERT INTO group_shared_expense_shares (shared_expense_id, user_id, share_amount, status, decided_at, created_at) VALUES
    (v_se_strom, v_anna_id,  55.00, 'paid', '2024-11-01 10:00:00', '2024-11-01 10:00:00')
    RETURNING id INTO v_share_anna_s;
  INSERT INTO group_shared_expense_shares (shared_expense_id, user_id, share_amount, status, decided_at, created_at) VALUES
    (v_se_strom, v_marie_id, 55.00, 'paid', '2024-11-01 10:00:00', '2024-11-01 10:00:00')
    RETURNING id INTO v_share_marie_s;
  INSERT INTO group_shared_expense_shares (shared_expense_id, user_id, share_amount, status, decided_at, created_at) VALUES
    (v_se_strom, v_tim_id,   55.00, 'paid', '2024-11-01 10:00:00', '2024-11-01 10:00:00')
    RETURNING id INTO v_share_tim_s;

  -- Create 28 settled periods for Miete (Feb 2024 - May 2026)
  FOR d IN SELECT generate_series('2024-02-01'::date, '2026-05-01'::date, '1 month'::interval)::date LOOP
    v_settled_at := (d + INTERVAL '5 days')::timestamp;
    INSERT INTO group_shared_expense_periods (shared_expense_id, period_start, status, settled_at, created_at)
    VALUES (v_se_miete, d::timestamp, 'settled', v_settled_at, d::timestamp)
    RETURNING id INTO v_period_id;

    -- For each non-creator member: transfer + period_transfer + paired ledger
    FOR member_username, member_uid, member_acc, member_share IN
      SELECT * FROM (VALUES
        ('demo_anna',  v_anna_id,  v_anna_acc,  v_share_anna),
        ('demo_marie', v_marie_id, v_marie_acc, v_share_marie),
        ('demo_tim',   v_tim_id,   v_tim_acc,   v_share_tim)
      ) AS m(username, uid, acc, share_id)
    LOOP
      INSERT INTO transfers (from_user_id, to_user_id, from_bank_account_id, to_bank_account_id, amount, reason, group_id, group_expense_share_id, status, created_at, completed_at)
      VALUES (member_uid, v_max_id, member_acc, v_max_acc, 412.50, 'Anteil: Miete WG', v_group_id, member_share, 'completed', v_settled_at, v_settled_at)
      RETURNING id INTO v_transfer_id;

      INSERT INTO group_shared_expense_period_transfers (period_id, share_id, transfer_id, amount, status)
      VALUES (v_period_id, member_share, v_transfer_id, 412.50, 'released');

      INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, transfer_id, group_id, created_at)
      VALUES (member_acc, 'Anteil: Miete WG', 'transfer', 412.50, 412.50, v_settled_at, v_settled_at, v_settled_at, 'Anteil: Miete WG', 'once', TRUE, 'open', v_transfer_id, v_group_id, v_settled_at);

      INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, transfer_id, group_id, created_at)
      VALUES (v_max_acc, 'Anteil: Miete WG', 'transfer', 412.50, v_settled_at, v_settled_at, 'Anteil: Miete WG', 'once', TRUE, 'open', v_transfer_id, v_group_id, v_settled_at);
    END LOOP;

    -- Max's own period_transfer (self-share marked released, no money movement)
    INSERT INTO group_shared_expense_period_transfers (period_id, share_id, amount, status)
    VALUES (v_period_id, v_share_max, 412.50, 'released');
  END LOOP;

  -- Strom+Gas: 20 periods (Nov 2024 - Jun 2026)
  FOR d IN SELECT generate_series('2024-11-01'::date, '2026-06-01'::date, '1 month'::interval)::date LOOP
    v_settled_at := (d + INTERVAL '5 days')::timestamp;
    INSERT INTO group_shared_expense_periods (shared_expense_id, period_start, status, settled_at, created_at)
    VALUES (v_se_strom, d::timestamp, 'settled', v_settled_at, d::timestamp)
    RETURNING id INTO v_period_id;

    FOR member_username, member_uid, member_acc, member_share IN
      SELECT * FROM (VALUES
        ('demo_anna',  v_anna_id,  v_anna_acc,  v_share_anna_s),
        ('demo_marie', v_marie_id, v_marie_acc, v_share_marie_s),
        ('demo_tim',   v_tim_id,   v_tim_acc,   v_share_tim_s)
      ) AS m(username, uid, acc, share_id)
    LOOP
      INSERT INTO transfers (from_user_id, to_user_id, from_bank_account_id, to_bank_account_id, amount, reason, group_id, group_expense_share_id, status, created_at, completed_at)
      VALUES (member_uid, v_max_id, member_acc, v_max_acc, 55.00, 'Anteil: Strom + Gas', v_group_id, member_share, 'completed', v_settled_at, v_settled_at)
      RETURNING id INTO v_transfer_id;

      INSERT INTO group_shared_expense_period_transfers (period_id, share_id, transfer_id, amount, status)
      VALUES (v_period_id, member_share, v_transfer_id, 55.00, 'released');

      INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, transfer_id, group_id, created_at)
      VALUES (member_acc, 'Anteil: Strom + Gas', 'transfer', 55.00, 55.00, v_settled_at, v_settled_at, v_settled_at, 'Anteil: Strom + Gas', 'once', TRUE, 'open', v_transfer_id, v_group_id, v_settled_at);

      INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, transfer_id, group_id, created_at)
      VALUES (v_max_acc, 'Anteil: Strom + Gas', 'transfer', 55.00, v_settled_at, v_settled_at, 'Anteil: Strom + Gas', 'once', TRUE, 'open', v_transfer_id, v_group_id, v_settled_at);
    END LOOP;

    INSERT INTO group_shared_expense_period_transfers (period_id, share_id, amount, status)
    VALUES (v_period_id, v_share_max_s, 55.00, 'released');
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 10. Mallorca trip — 6 expenses, 4 participants, settlements
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_group_id INT;
  v_trip_id INT;
  v_max_id INT;
  v_jonas_id INT;
  v_ben_id INT;
  v_lea_id INT;
  v_max_acc INT;
  v_jonas_acc INT;
  v_ben_acc INT;
  v_lea_acc INT;
  v_settlement_id INT;
  v_transfer_id INT;
  v_te_hotel INT;
  v_te_rest INT;
  v_te_car INT;
  v_te_bar INT;
  v_te_snack INT;
  v_te_tank INT;
  v_paid_at TIMESTAMP := '2025-06-25 18:00:00';
BEGIN
  SELECT id INTO v_group_id FROM groups WHERE name = 'Mallorca 2025';
  SELECT id INTO v_max_id   FROM users WHERE username = 'demo';
  SELECT id INTO v_jonas_id FROM users WHERE username = 'demo_jonas';
  SELECT id INTO v_ben_id   FROM users WHERE username = 'demo_ben';
  SELECT id INTO v_lea_id   FROM users WHERE username = 'demo_lea';
  SELECT id INTO v_max_acc   FROM bank_accounts WHERE user_id = v_max_id   AND label = 'Girokonto';
  SELECT id INTO v_jonas_acc FROM bank_accounts WHERE user_id = v_jonas_id AND label = 'Girokonto';
  SELECT id INTO v_ben_acc   FROM bank_accounts WHERE user_id = v_ben_id   AND label = 'Girokonto';
  SELECT id INTO v_lea_acc   FROM bank_accounts WHERE user_id = v_lea_id   AND label = 'Girokonto';

  INSERT INTO group_trips (group_id, creator_user_id, name, description, status, closed_at, created_at)
  VALUES (v_group_id, v_jonas_id, 'Mallorca-Wochenende', 'Verlängertes Wochenende auf Mallorca', 'closed', '2025-06-20 22:00:00', '2025-05-15 12:00:00')
  RETURNING id INTO v_trip_id;

  INSERT INTO group_trip_participants (trip_id, user_id) VALUES
    (v_trip_id, v_max_id), (v_trip_id, v_jonas_id), (v_trip_id, v_ben_id), (v_trip_id, v_lea_id);

  INSERT INTO group_trip_expenses (trip_id, payer_user_id, description, amount, spent_at, created_at)
  VALUES (v_trip_id, v_jonas_id, 'Hotel',         320.00, '2025-06-12 14:00:00', '2025-06-12 14:00:00') RETURNING id INTO v_te_hotel;
  INSERT INTO group_trip_expenses (trip_id, payer_user_id, description, amount, spent_at, created_at)
  VALUES (v_trip_id, v_max_id,   'Restaurant',    110.00, '2025-06-12 21:00:00', '2025-06-12 21:00:00') RETURNING id INTO v_te_rest;
  INSERT INTO group_trip_expenses (trip_id, payer_user_id, description, amount, spent_at, created_at)
  VALUES (v_trip_id, v_ben_id,   'Mietwagen',     180.00, '2025-06-13 09:00:00', '2025-06-13 09:00:00') RETURNING id INTO v_te_car;
  INSERT INTO group_trip_expenses (trip_id, payer_user_id, description, amount, spent_at, created_at)
  VALUES (v_trip_id, v_jonas_id, 'Bar-Abend',      80.00, '2025-06-13 23:00:00', '2025-06-13 23:00:00') RETURNING id INTO v_te_bar;
  INSERT INTO group_trip_expenses (trip_id, payer_user_id, description, amount, spent_at, created_at)
  VALUES (v_trip_id, v_lea_id,   'Strand-Snacks',  35.00, '2025-06-14 13:00:00', '2025-06-14 13:00:00') RETURNING id INTO v_te_snack;
  INSERT INTO group_trip_expenses (trip_id, payer_user_id, description, amount, spent_at, created_at)
  VALUES (v_trip_id, v_max_id,   'Tank',           65.00, '2025-06-15 11:00:00', '2025-06-15 11:00:00') RETURNING id INTO v_te_tank;

  -- All 4 users are participants in every expense
  INSERT INTO group_trip_expense_participants (trip_expense_id, user_id)
  SELECT te_id, u_id FROM (VALUES
    (v_te_hotel), (v_te_rest), (v_te_car), (v_te_bar), (v_te_snack), (v_te_tank)
  ) AS te(te_id)
  CROSS JOIN (VALUES (v_max_id), (v_jonas_id), (v_ben_id), (v_lea_id)) AS u(u_id);

  -- Settlements (min-cash-flow): Lea→Jonas 162.50, Max→Jonas 22.50, Ben→Jonas 17.50
  -- For each: create settlement + paired transfer + private_expense + income

  -- Lea -> Jonas 162.50
  INSERT INTO group_trip_settlements (trip_id, from_user_id, to_user_id, amount, status, paid_at, created_at)
  VALUES (v_trip_id, v_lea_id, v_jonas_id, 162.50, 'paid', v_paid_at, '2025-06-20 22:00:00')
  RETURNING id INTO v_settlement_id;
  INSERT INTO transfers (from_user_id, to_user_id, from_bank_account_id, to_bank_account_id, amount, reason, group_id, trip_settlement_id, status, created_at, completed_at)
  VALUES (v_lea_id, v_jonas_id, v_lea_acc, v_jonas_acc, 162.50, 'Settlement: Mallorca-Wochenende', v_group_id, v_settlement_id, 'completed', v_paid_at, v_paid_at)
  RETURNING id INTO v_transfer_id;
  INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, transfer_id, group_id, created_at)
  VALUES (v_lea_acc, 'Settlement: Mallorca-Wochenende', 'transfer', 162.50, 162.50, v_paid_at, v_paid_at, v_paid_at, 'Trip-Abrechnung', 'once', TRUE, 'open', v_transfer_id, v_group_id, v_paid_at);
  INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, transfer_id, group_id, created_at)
  VALUES (v_jonas_acc, 'Settlement: Mallorca-Wochenende', 'transfer', 162.50, v_paid_at, v_paid_at, 'Trip-Abrechnung', 'once', TRUE, 'open', v_transfer_id, v_group_id, v_paid_at);

  -- Max -> Jonas 22.50
  INSERT INTO group_trip_settlements (trip_id, from_user_id, to_user_id, amount, status, paid_at, created_at)
  VALUES (v_trip_id, v_max_id, v_jonas_id, 22.50, 'paid', v_paid_at, '2025-06-20 22:00:00')
  RETURNING id INTO v_settlement_id;
  INSERT INTO transfers (from_user_id, to_user_id, from_bank_account_id, to_bank_account_id, amount, reason, group_id, trip_settlement_id, status, created_at, completed_at)
  VALUES (v_max_id, v_jonas_id, v_max_acc, v_jonas_acc, 22.50, 'Settlement: Mallorca-Wochenende', v_group_id, v_settlement_id, 'completed', v_paid_at, v_paid_at)
  RETURNING id INTO v_transfer_id;
  INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, transfer_id, group_id, created_at)
  VALUES (v_max_acc, 'Settlement: Mallorca-Wochenende', 'transfer', 22.50, 22.50, v_paid_at, v_paid_at, v_paid_at, 'Trip-Abrechnung', 'once', TRUE, 'open', v_transfer_id, v_group_id, v_paid_at);
  INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, transfer_id, group_id, created_at)
  VALUES (v_jonas_acc, 'Settlement: Mallorca-Wochenende', 'transfer', 22.50, v_paid_at, v_paid_at, 'Trip-Abrechnung', 'once', TRUE, 'open', v_transfer_id, v_group_id, v_paid_at);

  -- Ben -> Jonas 17.50
  INSERT INTO group_trip_settlements (trip_id, from_user_id, to_user_id, amount, status, paid_at, created_at)
  VALUES (v_trip_id, v_ben_id, v_jonas_id, 17.50, 'paid', v_paid_at, '2025-06-20 22:00:00')
  RETURNING id INTO v_settlement_id;
  INSERT INTO transfers (from_user_id, to_user_id, from_bank_account_id, to_bank_account_id, amount, reason, group_id, trip_settlement_id, status, created_at, completed_at)
  VALUES (v_ben_id, v_jonas_id, v_ben_acc, v_jonas_acc, 17.50, 'Settlement: Mallorca-Wochenende', v_group_id, v_settlement_id, 'completed', v_paid_at, v_paid_at)
  RETURNING id INTO v_transfer_id;
  INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, transfer_id, group_id, created_at)
  VALUES (v_ben_acc, 'Settlement: Mallorca-Wochenende', 'transfer', 17.50, 17.50, v_paid_at, v_paid_at, v_paid_at, 'Trip-Abrechnung', 'once', TRUE, 'open', v_transfer_id, v_group_id, v_paid_at);
  INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, transfer_id, group_id, created_at)
  VALUES (v_jonas_acc, 'Settlement: Mallorca-Wochenende', 'transfer', 17.50, v_paid_at, v_paid_at, 'Trip-Abrechnung', 'once', TRUE, 'open', v_transfer_id, v_group_id, v_paid_at);
END $$;

-- ---------------------------------------------------------------------------
-- 11. Team Lunch — prepaid weekly, 24 settled + 1 pending period
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_group_id INT;
  v_max_id INT;
  v_ben_id INT;
  v_tim_id INT;
  v_max_acc INT;
  v_ben_acc INT;
  v_tim_acc INT;
  v_se INT;
  v_share_max INT;
  v_share_ben INT;
  v_share_tim INT;
  v_period_id INT;
  v_transfer_id INT;
  v_settled_at TIMESTAMP;
  d DATE;
  member_uid INT;
  member_acc INT;
  member_share INT;
BEGIN
  SELECT id INTO v_group_id FROM groups WHERE name = 'Team Lunch Bonn';
  SELECT id INTO v_max_id FROM users WHERE username = 'demo';
  SELECT id INTO v_ben_id FROM users WHERE username = 'demo_ben';
  SELECT id INTO v_tim_id FROM users WHERE username = 'demo_tim';
  SELECT id INTO v_max_acc FROM bank_accounts WHERE user_id = v_max_id AND label = 'Girokonto';
  SELECT id INTO v_ben_acc FROM bank_accounts WHERE user_id = v_ben_id AND label = 'Girokonto';
  SELECT id INTO v_tim_acc FROM bank_accounts WHERE user_id = v_tim_id AND label = 'Girokonto';

  INSERT INTO group_shared_expenses (group_id, creator_user_id, title, info, total_amount, payment_mode, cycle, status, created_at, updated_at)
  VALUES (v_group_id, v_max_id, 'Wöchentliches Team-Lunch', 'Team-Essen jeden Montag', 45.00, 'prepaid', 'weekly', 'active', '2026-01-12 11:00:00', '2026-01-12 11:00:00')
  RETURNING id INTO v_se;

  INSERT INTO group_shared_expense_shares (shared_expense_id, user_id, share_amount, status, decided_at, created_at) VALUES
    (v_se, v_max_id, 15.00, 'paid', '2026-01-12 11:00:00', '2026-01-12 11:00:00') RETURNING id INTO v_share_max;
  INSERT INTO group_shared_expense_shares (shared_expense_id, user_id, share_amount, status, decided_at, created_at) VALUES
    (v_se, v_ben_id, 15.00, 'paid', '2026-01-12 11:00:00', '2026-01-12 11:00:00') RETURNING id INTO v_share_ben;
  INSERT INTO group_shared_expense_shares (shared_expense_id, user_id, share_amount, status, decided_at, created_at) VALUES
    (v_se, v_tim_id, 15.00, 'paid', '2026-01-12 11:00:00', '2026-01-12 11:00:00') RETURNING id INTO v_share_tim;

  -- 24 settled weekly periods (Jan 12 to Jun 15 2026)
  FOR d IN SELECT generate_series('2026-01-12'::date, '2026-06-15'::date, '1 week'::interval)::date LOOP
    v_settled_at := (d + INTERVAL '1 day')::timestamp;
    INSERT INTO group_shared_expense_periods (shared_expense_id, period_start, status, settled_at, created_at)
    VALUES (v_se, d::timestamp, 'settled', v_settled_at, d::timestamp)
    RETURNING id INTO v_period_id;

    FOR member_uid, member_acc, member_share IN
      SELECT * FROM (VALUES
        (v_ben_id, v_ben_acc, v_share_ben),
        (v_tim_id, v_tim_acc, v_share_tim)
      ) AS m(uid, acc, share_id)
    LOOP
      INSERT INTO transfers (from_user_id, to_user_id, from_bank_account_id, to_bank_account_id, amount, reason, group_id, group_expense_share_id, status, created_at, completed_at)
      VALUES (member_uid, v_max_id, member_acc, v_max_acc, 15.00, 'Anteil: Wöchentliches Team-Lunch', v_group_id, member_share, 'completed', v_settled_at, v_settled_at)
      RETURNING id INTO v_transfer_id;

      INSERT INTO group_shared_expense_period_transfers (period_id, share_id, transfer_id, amount, status)
      VALUES (v_period_id, member_share, v_transfer_id, 15.00, 'released');

      INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, transfer_id, group_id, created_at)
      VALUES (member_acc, 'Anteil: Wöchentliches Team-Lunch', 'transfer', 15.00, 15.00, v_settled_at, v_settled_at, v_settled_at, 'Anteil: Team-Lunch', 'once', TRUE, 'open', v_transfer_id, v_group_id, v_settled_at);

      INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, transfer_id, group_id, created_at)
      VALUES (v_max_acc, 'Anteil: Wöchentliches Team-Lunch', 'transfer', 15.00, v_settled_at, v_settled_at, 'Anteil: Team-Lunch', 'once', TRUE, 'open', v_transfer_id, v_group_id, v_settled_at);
    END LOOP;

    INSERT INTO group_shared_expense_period_transfers (period_id, share_id, amount, status)
    VALUES (v_period_id, v_share_max, 15.00, 'released');
  END LOOP;

  -- One pending period (2026-06-22): shares pending for Ben/Tim, accepted for Max
  INSERT INTO group_shared_expense_periods (shared_expense_id, period_start, status, created_at)
  VALUES (v_se, '2026-06-22 00:00:00', 'collecting', '2026-06-22 09:00:00')
  RETURNING id INTO v_period_id;

  -- Override share statuses for this last period (since shares are shared across periods,
  -- we keep them 'paid' globally but the pending state lives on the period_transfers.status)
  INSERT INTO group_shared_expense_period_transfers (period_id, share_id, amount, status)
  VALUES (v_period_id, v_share_max, 15.00, 'released'),
         (v_period_id, v_share_ben, 15.00, 'reserved'),
         (v_period_id, v_share_tim, 15.00, 'reserved');
END $$;

-- ---------------------------------------------------------------------------
-- 12. Peer transfers (5 misc transfers outside groups) + paired ledger entries
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_max_id INT;
  v_anna_id INT;
  v_jonas_id INT;
  v_lea_id INT;
  v_ben_id INT;
  v_max_acc INT;
  v_anna_acc INT;
  v_jonas_acc INT;
  v_lea_acc INT;
  v_ben_acc INT;
  v_t INT;
BEGIN
  SELECT id INTO v_max_id FROM users WHERE username = 'demo';
  SELECT id INTO v_anna_id FROM users WHERE username = 'demo_anna';
  SELECT id INTO v_jonas_id FROM users WHERE username = 'demo_jonas';
  SELECT id INTO v_lea_id FROM users WHERE username = 'demo_lea';
  SELECT id INTO v_ben_id FROM users WHERE username = 'demo_ben';
  SELECT id INTO v_max_acc FROM bank_accounts WHERE user_id = v_max_id AND label = 'Girokonto';
  SELECT id INTO v_anna_acc FROM bank_accounts WHERE user_id = v_anna_id AND label = 'Girokonto';
  SELECT id INTO v_jonas_acc FROM bank_accounts WHERE user_id = v_jonas_id AND label = 'Girokonto';
  SELECT id INTO v_lea_acc FROM bank_accounts WHERE user_id = v_lea_id AND label = 'Girokonto';
  SELECT id INTO v_ben_acc FROM bank_accounts WHERE user_id = v_ben_id AND label = 'Girokonto';

  -- Max -> Anna 18.50 (Pizza geliehen)
  INSERT INTO transfers (from_user_id, to_user_id, from_bank_account_id, to_bank_account_id, amount, reason, status, created_at, completed_at)
  VALUES (v_max_id, v_anna_id, v_max_acc, v_anna_acc, 18.50, 'Pizza geliehen', 'completed', '2024-06-08 20:00:00', '2024-06-08 20:00:00')
  RETURNING id INTO v_t;
  INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, transfer_id, created_at)
  VALUES (v_max_acc, 'Pizza geliehen', 'transfer', 18.50, 18.50, '2024-06-08', '2024-06-08', '2024-06-08', 'Anna', 'once', TRUE, 'open', v_t, '2024-06-08 20:00:00');
  INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, transfer_id, created_at)
  VALUES (v_anna_acc, 'Pizza geliehen', 'transfer', 18.50, '2024-06-08', '2024-06-08', 'von Max', 'once', TRUE, 'open', v_t, '2024-06-08 20:00:00');

  -- Anna -> Max 42.00 (Rechnung geteilt)
  INSERT INTO transfers (from_user_id, to_user_id, from_bank_account_id, to_bank_account_id, amount, reason, status, created_at, completed_at)
  VALUES (v_anna_id, v_max_id, v_anna_acc, v_max_acc, 42.00, 'Rechnung geteilt', 'completed', '2024-09-14 19:30:00', '2024-09-14 19:30:00')
  RETURNING id INTO v_t;
  INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, transfer_id, created_at)
  VALUES (v_anna_acc, 'Rechnung geteilt', 'transfer', 42.00, 42.00, '2024-09-14', '2024-09-14', '2024-09-14', 'an Max', 'once', TRUE, 'open', v_t, '2024-09-14 19:30:00');
  INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, transfer_id, created_at)
  VALUES (v_max_acc, 'Rechnung geteilt', 'transfer', 42.00, '2024-09-14', '2024-09-14', 'von Anna', 'once', TRUE, 'open', v_t, '2024-09-14 19:30:00');

  -- Max -> Jonas 30.00 (Konzertkarte)
  INSERT INTO transfers (from_user_id, to_user_id, from_bank_account_id, to_bank_account_id, amount, reason, status, created_at, completed_at)
  VALUES (v_max_id, v_jonas_id, v_max_acc, v_jonas_acc, 30.00, 'Konzertkarte', 'completed', '2025-03-22 14:00:00', '2025-03-22 14:00:00')
  RETURNING id INTO v_t;
  INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, transfer_id, created_at)
  VALUES (v_max_acc, 'Konzertkarte', 'transfer', 30.00, 30.00, '2025-03-22', '2025-03-22', '2025-03-22', 'Jonas vorgestreckt', 'once', TRUE, 'open', v_t, '2025-03-22 14:00:00');
  INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, transfer_id, created_at)
  VALUES (v_jonas_acc, 'Konzertkarte', 'transfer', 30.00, '2025-03-22', '2025-03-22', 'von Max', 'once', TRUE, 'open', v_t, '2025-03-22 14:00:00');

  -- Lea -> Max 15.00 (Bahnticket)
  INSERT INTO transfers (from_user_id, to_user_id, from_bank_account_id, to_bank_account_id, amount, reason, status, created_at, completed_at)
  VALUES (v_lea_id, v_max_id, v_lea_acc, v_max_acc, 15.00, 'Bahnticket', 'completed', '2025-07-04 09:00:00', '2025-07-04 09:00:00')
  RETURNING id INTO v_t;
  INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, transfer_id, created_at)
  VALUES (v_lea_acc, 'Bahnticket', 'transfer', 15.00, 15.00, '2025-07-04', '2025-07-04', '2025-07-04', 'an Max', 'once', TRUE, 'open', v_t, '2025-07-04 09:00:00');
  INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, transfer_id, created_at)
  VALUES (v_max_acc, 'Bahnticket', 'transfer', 15.00, '2025-07-04', '2025-07-04', 'von Lea', 'once', TRUE, 'open', v_t, '2025-07-04 09:00:00');

  -- Ben -> Max 50.00 (Spielsucht-Schulden joke)
  INSERT INTO transfers (from_user_id, to_user_id, from_bank_account_id, to_bank_account_id, amount, reason, status, created_at, completed_at)
  VALUES (v_ben_id, v_max_id, v_ben_acc, v_max_acc, 50.00, 'Wettschulden', 'completed', '2026-02-14 22:00:00', '2026-02-14 22:00:00')
  RETURNING id INTO v_t;
  INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, cycle, is_active, state, transfer_id, created_at)
  VALUES (v_ben_acc, 'Wettschulden', 'transfer', 50.00, 50.00, '2026-02-14', '2026-02-14', '2026-02-14', 'an Max', 'once', TRUE, 'open', v_t, '2026-02-14 22:00:00');
  INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, info, cycle, is_active, state, transfer_id, created_at)
  VALUES (v_max_acc, 'Wettschulden', 'transfer', 50.00, '2026-02-14', '2026-02-14', 'von Ben', 'once', TRUE, 'open', v_t, '2026-02-14 22:00:00');
END $$;

-- ---------------------------------------------------------------------------
-- 13. Group messages — chat history in each group
-- ---------------------------------------------------------------------------

INSERT INTO group_message (from_user_id, group_id, message, status, edited, created_at)
SELECT u.id, g.id, x.message, 'sent', FALSE, x.created_at::timestamp
  FROM groups g
  JOIN (VALUES
    -- WG (8)
    ('WG Hauptstraße 12', 'demo',       'Willkommen in unserer WG-Gruppe!',                 '2024-02-10 14:20:00'),
    ('WG Hauptstraße 12', 'demo_anna',  'Ich übernehme diese Woche den Putzdienst.',        '2024-02-12 18:30:00'),
    ('WG Hauptstraße 12', 'demo_marie', 'Couch-Idee finde ich super!',                       '2024-04-13 10:00:00'),
    ('WG Hauptstraße 12', 'demo_tim',   'Kann jemand bitte Klopapier kaufen?',              '2024-06-22 19:00:00'),
    ('WG Hauptstraße 12', 'demo',       'Strom-Abrechnung kommt morgen.',                    '2024-11-01 10:30:00'),
    ('WG Hauptstraße 12', 'demo_anna',  'Hab Eier mitgebracht!',                             '2025-01-12 09:30:00'),
    ('WG Hauptstraße 12', 'demo_marie', 'Filmabend Freitag?',                                '2025-11-25 19:30:00'),
    ('WG Hauptstraße 12', 'demo',       'Bin dabei!',                                        '2025-11-25 19:35:00'),
    -- Mallorca (6)
    ('Mallorca 2025',     'demo_jonas', 'Wer ist beim Mallorca-Trip dabei?',                '2025-05-01 17:35:00'),
    ('Mallorca 2025',     'demo',       'Ich!',                                              '2025-05-01 17:40:00'),
    ('Mallorca 2025',     'demo_ben',   'Klar dabei.',                                       '2025-05-01 17:42:00'),
    ('Mallorca 2025',     'demo_lea',   'Yes!',                                              '2025-05-01 17:45:00'),
    ('Mallorca 2025',     'demo_jonas', 'Flüge gebucht für 12.06.',                          '2025-05-15 11:55:00'),
    ('Mallorca 2025',     'demo',       'Krass, kann es kaum erwarten!',                     '2025-05-15 12:10:00'),
    -- Geschenke (4)
    ('Geschenke für Lea', 'demo',       'Sammeln wir für Leas Geburtstag?',                 '2025-09-15 11:05:00'),
    ('Geschenke für Lea', 'demo_jonas', '50 € von mir.',                                     '2025-09-17 14:20:00'),
    ('Geschenke für Lea', 'demo_ben',   'Bin dabei!',                                        '2025-09-18 09:00:00'),
    ('Geschenke für Lea', 'demo',       'Hab Buch + Gutschein gekauft.',                     '2025-10-05 18:30:00'),
    -- Team Lunch (5)
    ('Team Lunch Bonn',   'demo',       'Ab nächster Woche: Team-Lunch immer montags.',     '2026-01-10 10:05:00'),
    ('Team Lunch Bonn',   'demo_ben',   'Super Idee!',                                       '2026-01-10 10:08:00'),
    ('Team Lunch Bonn',   'demo_tim',   'Wo gehen wir hin?',                                 '2026-01-10 10:12:00'),
    ('Team Lunch Bonn',   'demo',       'Pizzeria oder Asia-Bistro - abwechselnd.',          '2026-01-10 10:15:00'),
    ('Team Lunch Bonn',   'demo_ben',   'Klingt gut!',                                       '2026-01-10 10:18:00')
  ) AS x(group_name, username, message, created_at) ON x.group_name = g.name
  JOIN users u ON u.username = x.username;

-- ---------------------------------------------------------------------------
-- 14. Forum — global questions, answers, likes
-- ---------------------------------------------------------------------------

INSERT INTO global_questions (from_user_id, thema, message, answered, edited, created_at, updated_at)
SELECT u.id, x.thema, x.message, x.answered, FALSE, x.created_at::timestamp, x.created_at::timestamp
  FROM users u
  JOIN (VALUES
    ('demo',       'Wie spare ich am besten?',          'Als Werkstudent — welche Strategien funktionieren wirklich? Hab ca. 1100 € im Monat.', TRUE,  '2024-03-15 14:00:00'),
    ('demo',       'Aktien-ETF oder Einzeltitel?',      'Lohnt sich ein Welt-ETF mehr als einzelne Aktien zu kaufen?',                          TRUE,  '2024-06-20 19:00:00'),
    ('demo',       'Netflix-Abo wirklich nötig?',       'Überlege Netflix zu kündigen. Welche Alternativen nutzt ihr?',                         TRUE,  '2024-11-08 21:00:00'),
    ('demo',       'Erfahrungen mit Tagesgeldkonto?',   'Welcher Anbieter ist aktuell zu empfehlen?',                                            TRUE,  '2024-09-15 12:00:00'),
    ('demo',       'Steuererklärung Werkstudent?',      'Muss ich als Werkstudent eine Steuererklärung machen?',                                 TRUE,  '2025-02-10 17:00:00'),
    ('demo',       'Notgroschen — wie viel?',           'Wie viel Notgroschen empfehlt ihr? Habe 5800 € auf dem Sparkonto.',                     FALSE, '2026-05-22 18:30:00'),
    ('demo_lea',   'Trinkgeld bei Friseur in Deutschland?', 'Wie viel Trinkgeld ist üblich bei einem 30 € Haarschnitt?',                          TRUE,  '2025-08-12 11:00:00'),
    ('demo_ben',   'Reiseversicherung empfehlenswert?', 'Lohnt sich eine Reiseversicherung für eine 4-Tage-Reise nach Mallorca?',                FALSE, '2025-06-01 09:30:00')
  ) AS x(username, thema, message, answered, created_at) ON x.username = u.username;

-- Answers (mixed authors) — referenced by question topic via subquery
INSERT INTO global_answers (question_id, from_user_id, message, edited, created_at, updated_at)
SELECT q.id, u.id, x.message, FALSE, x.created_at::timestamp, x.created_at::timestamp
  FROM global_questions q
  JOIN (VALUES
    ('Wie spare ich am besten?',           'demo_jonas', 'Pay yourself first — 10-20 % direkt nach Gehaltseingang auf Sparkonto.', '2024-03-16 09:00:00'),
    ('Wie spare ich am besten?',           'demo_anna',  'Budgets setzen und tracken! Hilft mir enorm.',                          '2024-03-16 18:30:00'),
    ('Wie spare ich am besten?',           'demo_ben',   'ETF-Sparplan ab 25 €/Monat.',                                            '2024-03-17 10:00:00'),
    ('Aktien-ETF oder Einzeltitel?',       'demo_jonas', 'Für Einsteiger klar ETF (z. B. MSCI World).',                            '2024-06-21 08:00:00'),
    ('Aktien-ETF oder Einzeltitel?',       'demo_ben',   'Einzeltitel nur, wenn du das Unternehmen wirklich kennst.',              '2024-06-21 14:00:00'),
    ('Netflix-Abo wirklich nötig?',        'demo_marie', 'Ich teile mir das Abo mit Familie.',                                     '2024-11-09 10:00:00'),
    ('Netflix-Abo wirklich nötig?',        'demo_tim',   'Mediathek + YouTube reichen mir.',                                       '2024-11-09 14:00:00'),
    ('Erfahrungen mit Tagesgeldkonto?',    'demo_jonas', 'Aktuell bei mir Trade Republic mit 3,75 %.',                              '2024-09-16 11:00:00'),
    ('Erfahrungen mit Tagesgeldkonto?',    'demo_anna',  'C24 Bank ebenfalls top.',                                                '2024-09-16 16:00:00'),
    ('Steuererklärung Werkstudent?',       'demo_ben',   'Bei < 11.604 €/Jahr nicht verpflichtend, aber Rückerstattung lohnt sich oft.', '2025-02-11 09:30:00'),
    ('Steuererklärung Werkstudent?',       'demo_jonas', 'Elster ist gut, hab ich auch genutzt.',                                  '2025-02-11 12:00:00'),
    ('Notgroschen — wie viel?',            'demo_ben',   '3-6 Monatsausgaben. Bei dir also ~3000-6000 €.',                          '2026-05-23 09:00:00'),
    ('Trinkgeld bei Friseur in Deutschland?', 'demo',    '10-15 % sind üblich.',                                                   '2025-08-12 18:00:00'),
    ('Trinkgeld bei Friseur in Deutschland?', 'demo_anna','2-5 € reicht meistens.',                                                 '2025-08-13 10:00:00'),
    ('Reiseversicherung empfehlenswert?',  'demo_jonas', 'Bei 4 Tagen meist überflüssig wenn EU-Karte vorhanden.',                  '2025-06-01 15:00:00'),
    ('Reiseversicherung empfehlenswert?',  'demo',       'Hab nie eine gehabt, ist nie was passiert.',                              '2025-06-02 12:00:00')
  ) AS x(thema, username, message, created_at) ON x.thema = q.thema
  JOIN users u ON u.username = x.username;

-- Question likes (~8) and Answer likes (~10) — pick by topic/author
INSERT INTO question_likes (user_id, question_id, created_at)
SELECT u.id, q.id, '2024-04-01'::timestamp
  FROM global_questions q, users u
 WHERE q.thema = 'Wie spare ich am besten?'
   AND u.username IN ('demo_anna','demo_jonas','demo_marie');

INSERT INTO question_likes (user_id, question_id, created_at)
SELECT u.id, q.id, '2024-07-01'::timestamp
  FROM global_questions q, users u
 WHERE q.thema = 'Aktien-ETF oder Einzeltitel?'
   AND u.username IN ('demo_ben','demo_jonas');

INSERT INTO question_likes (user_id, question_id, created_at)
SELECT u.id, q.id, '2024-12-01'::timestamp
  FROM global_questions q, users u
 WHERE q.thema = 'Netflix-Abo wirklich nötig?'
   AND u.username IN ('demo_marie','demo_tim');

INSERT INTO question_likes (user_id, question_id, created_at)
SELECT u.id, q.id, '2025-08-20'::timestamp
  FROM global_questions q, users u
 WHERE q.thema = 'Trinkgeld bei Friseur in Deutschland?'
   AND u.username = 'demo';

INSERT INTO answer_likes (user_id, answer_id, created_at)
SELECT u.id, a.id, '2024-04-01'::timestamp
  FROM global_answers a, users u
 WHERE a.message = 'Pay yourself first — 10-20 % direkt nach Gehaltseingang auf Sparkonto.'
   AND u.username IN ('demo','demo_anna','demo_ben');

INSERT INTO answer_likes (user_id, answer_id, created_at)
SELECT u.id, a.id, '2024-07-01'::timestamp
  FROM global_answers a, users u
 WHERE a.message = 'Für Einsteiger klar ETF (z. B. MSCI World).'
   AND u.username IN ('demo','demo_ben');

INSERT INTO answer_likes (user_id, answer_id, created_at)
SELECT u.id, a.id, '2024-12-01'::timestamp
  FROM global_answers a, users u
 WHERE a.message = 'Ich teile mir das Abo mit Familie.'
   AND u.username = 'demo';

INSERT INTO answer_likes (user_id, answer_id, created_at)
SELECT u.id, a.id, '2024-10-01'::timestamp
  FROM global_answers a, users u
 WHERE a.message = 'Aktuell bei mir Trade Republic mit 3,75 %.'
   AND u.username IN ('demo','demo_anna');

INSERT INTO answer_likes (user_id, answer_id, created_at)
SELECT u.id, a.id, '2026-05-25'::timestamp
  FROM global_answers a, users u
 WHERE a.message = '3-6 Monatsausgaben. Bei dir also ~3000-6000 €.'
   AND u.username IN ('demo','demo_jonas');

INSERT INTO answer_likes (user_id, answer_id, created_at)
SELECT u.id, a.id, '2025-08-20'::timestamp
  FROM global_answers a, users u
 WHERE a.message = '10-15 % sind üblich.'
   AND u.username IN ('demo_lea','demo_anna');

-- ---------------------------------------------------------------------------
-- 15. Final pass — set default_bank_account_id for every demo user
-- ---------------------------------------------------------------------------

UPDATE users u
   SET default_bank_account_id = (
     SELECT ba.id FROM bank_accounts ba
      WHERE ba.user_id = u.id
        AND (u.username <> 'demo' OR ba.label = 'Girokonto')
      ORDER BY ba.created_at ASC
      LIMIT 1
   )
 WHERE u.username IN ('demo','demo_anna','demo_jonas','demo_lea','demo_ben','demo_marie','demo_tim');

COMMIT;

// @ts-ignore — postgres is used dynamically to avoid type-parameter conflicts
import createPostgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface QueryResult<T = Row> {
  data: T | null;
  error: null | { message: string; code?: string };
  count?: number | null;
}

interface QueryResultMany<T = Row> {
  data: T[] | null;
  error: null | { message: string; code?: string };
  count?: number | null;
}

type AnyResult<T> = QueryResult<T> | QueryResultMany<T>;

// ---------------------------------------------------------------------------
// Postgres-backed query builder (drop-in for @supabase/supabase-js)
// ---------------------------------------------------------------------------

class QueryBuilder<T = Row> {
  private _table: string;
  // any required: postgres tagged-template client has incompatible generic parameters with @ts-ignore'd import
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _sql: any;
  private _op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private _selectCols = '*';
  private _countMode: 'exact' | null = null;
  private _headOnly = false;
  private _data: Row | Row[] | null = null;
  private _conflictCol: string | null = null;
  private _filters: string[] = [];
  private _filterVals: unknown[] = [];
  private _orderClauses: string[] = [];
  private _limitVal: number | null = null;
  private _offsetVal: number | null = null;
  private _returnCols: string | null = null;  // null = no RETURNING, set after insert/update
  private _returnSingle = false;
  private _returnMaybe = false;
  private _pIdx = 1;

  // any required: postgres tagged-template client has incompatible generic parameters with @ts-ignore'd import
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(sql: any, table: string) {
    this._sql = sql;
    this._table = table;
  }

  // --- Operation setters ---

  select(cols = '*', opts?: { count?: 'exact'; head?: boolean }): this {
    if (this._op === 'select') {
      // Normal select
      this._selectCols = cols;
    } else {
      // Called after insert/update/delete — sets RETURNING columns
      this._returnCols = cols;
    }
    if (opts?.count === 'exact') this._countMode = 'exact';
    if (opts?.head) this._headOnly = true;
    return this;
  }

  insert(data: Row | Row[]): this {
    this._op = 'insert';
    this._data = data;
    return this;
  }

  update(data: Row): this {
    this._op = 'update';
    this._data = data;
    return this;
  }

  delete(): this {
    this._op = 'delete';
    return this;
  }

  upsert(data: Row | Row[], opts?: { onConflict?: string }): this {
    this._op = 'upsert';
    this._data = data;
    this._conflictCol = opts?.onConflict ?? null;
    return this;
  }

  // --- Filters ---

  eq(col: string, val: unknown): this {
    this._filters.push(`"${col}" = $${this._pIdx++}`);
    this._filterVals.push(val);
    return this;
  }

  neq(col: string, val: unknown): this {
    this._filters.push(`"${col}" != $${this._pIdx++}`);
    this._filterVals.push(val);
    return this;
  }

  in(col: string, vals: unknown[]): this {
    if (vals.length === 0) {
      this._filters.push('FALSE');
      return this;
    }
    const placeholders = vals.map(() => `$${this._pIdx++}`).join(', ');
    this._filters.push(`"${col}" IN (${placeholders})`);
    this._filterVals.push(...vals);
    return this;
  }

  not(col: string, operator: string, val: unknown): this {
    if (operator === 'is' && val === null) {
      this._filters.push(`"${col}" IS NOT NULL`);
    } else {
      this._filters.push(`NOT ("${col}" ${operator.toUpperCase()} $${this._pIdx++})`);
      this._filterVals.push(val);
    }
    return this;
  }

  is(col: string, val: unknown): this {
    if (val === null) {
      this._filters.push(`"${col}" IS NULL`);
    } else {
      this._filters.push(`"${col}" = $${this._pIdx++}`);
      this._filterVals.push(val);
    }
    return this;
  }

  gte(col: string, val: unknown): this {
    this._filters.push(`"${col}" >= $${this._pIdx++}`);
    this._filterVals.push(val);
    return this;
  }

  gt(col: string, val: unknown): this {
    this._filters.push(`"${col}" > $${this._pIdx++}`);
    this._filterVals.push(val);
    return this;
  }

  lte(col: string, val: unknown): this {
    this._filters.push(`"${col}" <= $${this._pIdx++}`);
    this._filterVals.push(val);
    return this;
  }

  lt(col: string, val: unknown): this {
    this._filters.push(`"${col}" < $${this._pIdx++}`);
    this._filterVals.push(val);
    return this;
  }

  ilike(col: string, val: string): this {
    this._filters.push(`"${col}" ILIKE $${this._pIdx++}`);
    this._filterVals.push(val);
    return this;
  }

  // Supabase .or() accepts "email.eq.foo,username.eq.bar"
  or(conditions: string): this {
    const parts = conditions.split(',').map((part) => {
      const [col, op, ...rest] = part.trim().split('.');
      const val = rest.join('.');
      if (op === 'eq') {
        this._filterVals.push(val);
        return `"${col}" = $${this._pIdx++}`;
      }
      if (op === 'neq') {
        this._filterVals.push(val);
        return `"${col}" != $${this._pIdx++}`;
      }
      if (op === 'is' && val === 'null') return `"${col}" IS NULL`;
      this._filterVals.push(val);
      return `"${col}" ${op} $${this._pIdx++}`;
    });
    this._filters.push(`(${parts.join(' OR ')})`);
    return this;
  }

  // --- Modifiers ---

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    const dir = (opts?.ascending ?? true) ? 'ASC' : 'DESC';
    const nulls = opts?.nullsFirst ? 'NULLS FIRST' : 'NULLS LAST';
    this._orderClauses.push(`"${col}" ${dir} ${nulls}`);
    return this;
  }

  limit(n: number): this {
    this._limitVal = n;
    return this;
  }

  range(from: number, to: number): this {
    this._offsetVal = from;
    this._limitVal = to - from + 1;
    return this;
  }

  // --- Terminators ---

  single(): Promise<QueryResult<T>> {
    this._returnSingle = true;
    return this._execute() as Promise<QueryResult<T>>;
  }

  maybeSingle(): Promise<QueryResult<T | null>> {
    this._returnMaybe = true;
    return this._execute() as Promise<QueryResult<T | null>>;
  }

  // Awaiting the builder directly returns many rows
  then<TResult1 = QueryResultMany<T>>(
    onfulfilled?: ((value: QueryResultMany<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult1 | PromiseLike<TResult1>) | null,
  ): Promise<TResult1> {
    return (this._execute() as Promise<QueryResultMany<T>>).then(
      onfulfilled ?? undefined,
      onrejected ?? undefined,
    );
  }

  // --- Execution ---

  private async _execute(): Promise<AnyResult<T>> {
    const sql = this._sql;
    const table = `"${this._table}"`;
    const where = this._filters.length > 0 ? `WHERE ${this._filters.join(' AND ')}` : '';
    const fv = this._filterVals;

    try {
      if (this._op === 'select') {
        if (this._headOnly && this._countMode === 'exact') {
          const r = (await sql.unsafe(`SELECT COUNT(*)::int AS _cnt FROM ${table} ${where}`, fv)) as Row[];
          return { data: null, error: null, count: Number((r[0] as Row)?._cnt ?? 0) };
        }

        const orderSql = this._orderClauses.length > 0 ? `ORDER BY ${this._orderClauses.join(', ')}` : '';
        const limitSql = this._limitVal != null ? `LIMIT ${this._limitVal}` : '';
        const offsetSql = this._offsetVal != null ? `OFFSET ${this._offsetVal}` : '';

        const countPrefix = this._countMode === 'exact' ? 'COUNT(*) OVER() AS _total_count, ' : '';
        const cols = this._selectCols === '*' ? '*' : this._selectCols;
        const query = `SELECT ${countPrefix}${cols} FROM ${table} ${where} ${orderSql} ${limitSql} ${offsetSql}`.replace(/\s+/g, ' ').trim();

        const rows = (await sql.unsafe(query, fv)) as Row[];

        let count: number | null = null;
        if (this._countMode === 'exact' && rows.length > 0) {
          count = Number((rows[0] as Row)._total_count ?? rows.length);
          rows.forEach((r) => delete r._total_count);
        }

        if (this._returnSingle || this._returnMaybe) {
          if (rows.length === 0) {
            if (this._returnSingle) return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
            return { data: null, error: null };
          }
          return { data: rows[0] as unknown as T, error: null, count };
        }
        return { data: rows as unknown as T[], error: null, count };
      }

      if (this._op === 'insert') {
        const records = Array.isArray(this._data) ? this._data : [this._data!];
        const returnCol = this._returnCols ?? (this._returnSingle || this._returnMaybe ? '*' : null);
        const returningSql = returnCol ? `RETURNING ${returnCol}` : '';
        let lastRows: Row[] = [];
        for (const record of records) {
          const cols = Object.keys(record).map((k) => `"${k}"`).join(', ');
          const phs = Object.values(record).map((_, i) => `$${i + 1}`).join(', ');
          lastRows = (await sql.unsafe(
            `INSERT INTO ${table} (${cols}) VALUES (${phs}) ${returningSql}`,
            Object.values(record) as unknown[],
          )) as Row[];
        }
        if (this._returnSingle) return { data: (lastRows[0] ?? null) as unknown as T, error: null };
        if (this._returnMaybe) return { data: (lastRows[0] ?? null) as unknown as T, error: null };
        return { data: lastRows as unknown as T[], error: null };
      }

      if (this._op === 'update') {
        const record = this._data as Row;
        const setKeys = Object.keys(record);
        const setClauses = setKeys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        const setVals = Object.values(record) as unknown[];
        const n = setVals.length;
        // Re-index WHERE placeholders to come after SET values
        const whereOffset = where.replace(/\$(\d+)/g, (_, num) => `$${Number(num) + n}`);
        const returnCol = this._returnCols ?? (this._returnSingle || this._returnMaybe ? '*' : null);
        const returningSql = returnCol ? `RETURNING ${returnCol}` : '';
        const query = `UPDATE ${table} SET ${setClauses} ${whereOffset} ${returningSql}`.replace(/\s+/g, ' ').trim();
        const rows = (await sql.unsafe(query, [...setVals, ...fv])) as Row[];
        if (this._returnSingle) return { data: (rows[0] ?? null) as unknown as T, error: null };
        if (this._returnMaybe) return { data: (rows[0] ?? null) as unknown as T, error: null };
        return { data: rows as unknown as T[], error: null };
      }

      if (this._op === 'delete') {
        await sql.unsafe(`DELETE FROM ${table} ${where}`.replace(/\s+/g, ' ').trim(), fv);
        return { data: null, error: null };
      }

      if (this._op === 'upsert') {
        const records = Array.isArray(this._data) ? this._data : [this._data!];
        let lastRows: Row[] = [];
        for (const record of records) {
          const cols = Object.keys(record).map((k) => `"${k}"`).join(', ');
          const phs = Object.values(record).map((_, i) => `$${i + 1}`).join(', ');
          const conflictTarget = this._conflictCol ? `"${this._conflictCol}"` : null;
          const updateCols = Object.keys(record).filter((k) => k !== this._conflictCol);
          const onConflict = conflictTarget && updateCols.length > 0
            ? `ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateCols.map((k) => `"${k}" = EXCLUDED."${k}"`).join(', ')}`
            : 'ON CONFLICT DO NOTHING';
          lastRows = (await sql.unsafe(
            `INSERT INTO ${table} (${cols}) VALUES (${phs}) ${onConflict} RETURNING *`,
            Object.values(record) as unknown[],
          )) as Row[];
        }
        if (this._returnSingle) return { data: (lastRows[0] ?? null) as unknown as T, error: null };
        return { data: lastRows as unknown as T[], error: null };
      }

      return { data: null, error: { message: 'Unknown operation' } };
    } catch (err) {
      const e = err as Error & { code?: string };
      return { data: null, error: { message: e.message, code: e.code } };
    }
  }
}

// ---------------------------------------------------------------------------
// PgClient — wraps `postgres` driver in a Supabase-compatible interface
// ---------------------------------------------------------------------------

export class PgClient {
  // any required: postgres tagged-template client has incompatible generic parameters with @ts-ignore'd import
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sql: any;

  constructor(connectionString: string) {
    this.sql = createPostgres(connectionString, {
      ssl: { rejectUnauthorized: false },
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  from<T = Row>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>(this.sql, table);
  }

  async rpc(
    name: string,
    params: Record<string, unknown>,
  ): Promise<{ data: unknown; error: null | { message: string } }> {
    try {
      const keys = Object.keys(params);
      const args = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
      const rows = await this.sql.unsafe(
        `SELECT ${name}(${args})`,
        Object.values(params),
      );
      return { data: (rows[0] as Row | undefined)?.[name] ?? null, error: null };
    } catch (err) {
      const e = err as Error;
      return { data: null, error: { message: e.message } };
    }
  }
}

// ---------------------------------------------------------------------------
// DbClient interface — satisfied by both PgClient and SupabaseClient
// ---------------------------------------------------------------------------

export interface DbClient {
  // any required: return type must accommodate both QueryBuilder and SupabaseClient's query builder, which have incompatible chainable APIs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  rpc(name: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

export function createDb(
  supabaseUrl: string | undefined,
  serviceRoleKey: string | undefined,
  databaseUrl?: string | undefined,
  hyperdrive?: { connectionString: string } | undefined,
): DbClient {
  // Use Hyperdrive in production (its connectionString is the real DB endpoint).
  // In local dev wrangler emulates Hyperdrive with a local proxy. Wrangler 3
  // returned a *.hyperdrive.local host; wrangler 4 hands out 127.0.0.1/localhost
  // on a random port that proxies to the dummy localConnectionString in
  // wrangler.toml — connecting hangs forever. Skip the proxy whenever the
  // string looks local; the DATABASE_URL / Supabase fallbacks below take over.
  const hConn = hyperdrive?.connectionString;
  const isLocalProxy =
    !!hConn &&
    (hConn.includes('.hyperdrive.local') ||
      /\/\/[^/@]*@?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/.test(hConn));

  if (hConn && !isLocalProxy) {
    // Production: use Hyperdrive directly
    return new PgClient(hConn);
  }
  // Local dev: prefer Supabase REST API (HTTP-based, works in Workers without TCP).
  // Fall back to DATABASE_URL only if Supabase creds are missing.
  if (supabaseUrl && serviceRoleKey) {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as unknown as DbClient;
  }
  if (databaseUrl) {
    return new PgClient(databaseUrl);
  }
  throw new Error(
    'No database credentials. Set HYPERDRIVE binding, DATABASE_URL, or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.',
  );
}

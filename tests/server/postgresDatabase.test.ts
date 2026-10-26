import { describe, expect, it } from 'vitest';
import { sslOption } from '@/server/db/postgresDatabase';

describe('sslOption', () => {
  it('requires SSL for the Supabase pooler', () => {
    expect(sslOption('postgresql://postgres.abc:secret@aws-1-sa-east-1.pooler.supabase.com:6543/postgres')).toEqual({ ssl: 'require' });
  });

  it('leaves the local stack unencrypted', () => {
    expect(sslOption('postgresql://postgres:postgres@127.0.0.1:54322/postgres')).toEqual({});
    expect(sslOption('postgresql://postgres:postgres@localhost:54322/postgres')).toEqual({});
  });

  it('lets an explicit sslmode in the URL decide', () => {
    expect(sslOption('postgresql://postgres.abc:secret@db.example.com:6543/postgres?sslmode=disable')).toEqual({});
  });

  it('stays encrypted when the URL cannot be parsed', () => {
    expect(sslOption('not a url')).toEqual({ ssl: 'require' });
  });
});

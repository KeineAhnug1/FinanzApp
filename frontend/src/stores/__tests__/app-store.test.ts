import { describe, expect, it, beforeEach } from 'vitest';
import { useAppStore } from '../app-store';
import type { User, BankAccount } from '@/types';

const sampleUser: User = {
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
  password: 'hashed',
  first_name: 'Alice',
  last_name: 'Doe',
  age: 30,
  income: 5000,
  profileImage: null,
  show_profile_image_to_others: true,
  default_bank_account_id: null,
  created_at: '2026-01-01T00:00:00Z',
};

const sampleAccount: BankAccount = {
  id: 10,
  user_id: 1,
  label: 'Checking',
  balance: 1234.5,
  created_at: '2026-01-01T00:00:00Z',
};

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.getState().clearSession();
  });

  it('starts with no user and an empty accounts list', () => {
    const state = useAppStore.getState();
    expect(state.user).toBeNull();
    expect(state.bankAccounts).toEqual([]);
  });

  it('setUser stores the supplied user', () => {
    useAppStore.getState().setUser(sampleUser);
    expect(useAppStore.getState().user).toEqual(sampleUser);
  });

  it('setBankAccounts replaces the accounts list', () => {
    useAppStore.getState().setBankAccounts([sampleAccount]);
    expect(useAppStore.getState().bankAccounts).toHaveLength(1);
    expect(useAppStore.getState().bankAccounts[0]).toEqual(sampleAccount);
  });

  it('updateUser merges a partial patch into the existing user', () => {
    useAppStore.getState().setUser(sampleUser);
    useAppStore.getState().updateUser({ income: 7000, first_name: 'Alicia' });
    const user = useAppStore.getState().user;
    expect(user?.income).toBe(7000);
    expect(user?.first_name).toBe('Alicia');
    expect(user?.email).toBe(sampleUser.email);
  });

  it('updateUser is a no-op when no user is set', () => {
    useAppStore.getState().updateUser({ income: 9999 });
    expect(useAppStore.getState().user).toBeNull();
  });

  it('clearSession resets user and accounts to their initial state', () => {
    useAppStore.getState().setUser(sampleUser);
    useAppStore.getState().setBankAccounts([sampleAccount]);
    useAppStore.getState().clearSession();
    expect(useAppStore.getState().user).toBeNull();
    expect(useAppStore.getState().bankAccounts).toEqual([]);
  });
});

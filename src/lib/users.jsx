import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { listUsers } from './api.js';

// Small team (≈10–20 people): load the directory once and share it.
const UsersContext = createContext(null);

export function UsersProvider({ children }) {
  const [users, setUsers] = useState([]);

  const refresh = useCallback(async () => {
    setUsers(await listUsers());
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const value = useMemo(() => {
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    return { users, byId, refresh, nameOf: (id) => byId[id]?.full_name ?? '…' };
  }, [users, refresh]);

  return <UsersContext.Provider value={value}>{children}</UsersContext.Provider>;
}

export function useUsers() {
  return useContext(UsersContext);
}

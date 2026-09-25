import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole, Family, AuthState } from '../types/auth';

const ADMIN_LOGIN = 'admin';
const ADMIN_PASSWORD = '1968';

const defaultAdmin: User = {
  id: 'admin-001',
  login: ADMIN_LOGIN,
  password: ADMIN_PASSWORD,
  name: 'Администратор',
  role: UserRole.SUPER_ADMIN,
  familyIds: [],
  createdAt: new Date().toISOString(),
};

const defaultUser: User = {
  id: 'user-001',
  login: 'user',
  password: '1234',
  name: 'Иван Петров',
  role: UserRole.USER,
  familyIds: ['family-001'],
  createdAt: new Date().toISOString(),
};

const defaultFamily: Family = {
  id: 'family-001',
  name: 'Семья Петровых',
  ownerId: 'user-001',
  memberIds: ['user-001'],
  createdAt: new Date().toISOString(),
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      users: [defaultAdmin, defaultUser],
      families: [defaultFamily],
      isAuthenticated: false,

      login: (login: string, password: string) => {
        const user = get().users.find(
          u => u.login === login && u.password === password
        );
        if (user) {
          set({ currentUser: user, isAuthenticated: true });
          return true;
        }
        return false;
      },

      logout: () => {
        set({ currentUser: null, isAuthenticated: false });
      },

      addUser: (userData) => {
        const newUser: User = {
          ...userData,
          id: uuidv4(),
          familyIds: [],
          createdAt: new Date().toISOString(),
        };
        set({ users: [...get().users, newUser] });
      },

      deleteUser: (userId: string) => {
        const { users, families } = get();
        const user = users.find(u => u.id === userId);
        if (!user) return;

        // Не удаляем админа
        if (user.role === UserRole.SUPER_ADMIN) return;

        // Удаляем пользователя из всех семей
        const updatedFamilies = families.map(f => ({
          ...f,
          memberIds: f.memberIds.filter(id => id !== userId),
        }));

        set({
          users: users.filter(u => u.id !== userId),
          families: updatedFamilies,
        });
      },

      addFamily: (name: string, ownerId: string) => {
        const newFamily: Family = {
          id: uuidv4(),
          name,
          ownerId,
          memberIds: [ownerId],
          createdAt: new Date().toISOString(),
        };

        // Добавляем семью владельцу
        const updatedUsers = get().users.map(u =>
          u.id === ownerId ? { ...u, familyIds: [...u.familyIds, newFamily.id] } : u
        );

        set({
          families: [...get().families, newFamily],
          users: updatedUsers,
        });
      },

      deleteFamily: (familyId: string) => {
        const { families, users } = get();

        // Удаляем семью из списка семей пользователей
        const updatedUsers = users.map(u => ({
          ...u,
          familyIds: u.familyIds.filter(id => id !== familyId),
        }));

        set({
          families: families.filter(f => f.id !== familyId),
          users: updatedUsers,
        });
      },

      addMemberToFamily: (familyId: string, userId: string) => {
        const { families, users } = get();

        const updatedFamilies = families.map(f =>
          f.id === familyId && !f.memberIds.includes(userId)
            ? { ...f, memberIds: [...f.memberIds, userId] }
            : f
        );

        const updatedUsers = users.map(u =>
          u.id === userId && !u.familyIds.includes(familyId)
            ? { ...u, familyIds: [...u.familyIds, familyId] }
            : u
        );

        set({ families: updatedFamilies, users: updatedUsers });
      },

      removeMemberFromFamily: (familyId: string, userId: string) => {
        const { families, users } = get();

        const updatedFamilies = families.map(f =>
          f.id === familyId
            ? { ...f, memberIds: f.memberIds.filter(id => id !== userId) }
            : f
        );

        const updatedUsers = users.map(u =>
          u.id === userId
            ? { ...u, familyIds: u.familyIds.filter(id => id !== familyId) }
            : u
        );

        set({ families: updatedFamilies, users: updatedUsers });
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);

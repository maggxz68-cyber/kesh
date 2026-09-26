import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole, Family, AuthState } from '../types/auth';

// Только супер-админ и демо-пользователь
const SUPER_ADMIN: User = {
  id: 'super-admin-001',
  login: 'admin',
  password: '1968',
  name: 'Супер Администратор',
  email: 'admin@system.local',
  role: UserRole.SUPER_ADMIN,
  familyIds: [],
  createdAt: new Date().toISOString(),
};

const DEMO_USER: User = {
  id: 'demo-user-001',
  login: 'demo',
  password: 'demo',
  name: 'Демо Пользователь',
  email: 'demo@example.com',
  role: UserRole.FAMILY_ADMIN,
  familyIds: ['demo-family-001'],
  createdAt: new Date().toISOString(),
};

const DEMO_FAMILY: Family = {
  id: 'demo-family-001',
  name: 'Демо Семья',
  ownerId: 'demo-user-001',
  memberIds: ['demo-user-001'],
  memberRoles: { 'demo-user-001': UserRole.FAMILY_ADMIN },
  createdAt: new Date().toISOString(),
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      currentFamilyId: null,
      isDemoMode: false,
      users: [SUPER_ADMIN, DEMO_USER],
      families: [DEMO_FAMILY],
      isAuthenticated: false,

      login: (login: string, password: string) => {
        const user = get().users.find(
          u => u.login === login && u.password === password
        );
        if (user) {
          if (user.role === UserRole.SUPER_ADMIN) {
            set({
              currentUser: user,
              currentFamilyId: null,
              isDemoMode: false,
              isAuthenticated: true,
            });
          } else {
            const firstFamilyId = user.familyIds.length > 0 ? user.familyIds[0] : null;
            set({
              currentUser: user,
              currentFamilyId: firstFamilyId,
              isDemoMode: false,
              isAuthenticated: true,
            });
          }
          return true;
        }
        return false;
      },

      loginDemo: () => {
        set({
          currentUser: DEMO_USER,
          currentFamilyId: 'demo-family-001',
          isDemoMode: true,
          isAuthenticated: true,
        });
      },

      logout: () => {
        set({ currentUser: null, currentFamilyId: null, isDemoMode: false, isAuthenticated: false });
      },

      register: (name: string, email: string, password: string, familyName: string) => {
        const { users } = get();
        if (users.some(u => u.email === email)) return false;

        const userId = uuidv4();
        const familyId = uuidv4();

        const newUser: User = {
          id: userId,
          login: email,
          password,
          name,
          email,
          role: UserRole.FAMILY_ADMIN,
          familyIds: [familyId],
          createdAt: new Date().toISOString(),
        };

        const newFamily: Family = {
          id: familyId,
          name: familyName,
          ownerId: userId,
          memberIds: [userId],
          memberRoles: { [userId]: UserRole.FAMILY_ADMIN },
          createdAt: new Date().toISOString(),
        };

        set({
          users: [...users, newUser],
          families: [...get().families, newFamily],
          currentUser: newUser,
          currentFamilyId: familyId,
          isDemoMode: false,
          isAuthenticated: true,
        });

        return true;
      },

      setCurrentFamily: (familyId: string) => {
        const { currentUser } = get();
        if (currentUser && currentUser.familyIds.includes(familyId)) {
          set({ currentFamilyId: familyId });
        }
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
        if (!user || user.role === UserRole.SUPER_ADMIN) return;

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
          memberRoles: { [ownerId]: UserRole.FAMILY_ADMIN },
          createdAt: new Date().toISOString(),
        };

        const updatedUsers = get().users.map(u =>
          u.id === ownerId ? { ...u, familyIds: [...u.familyIds, newFamily.id] } : u
        );

        set({
          families: [...get().families, newFamily],
          users: updatedUsers,
        });

        return newFamily.id;
      },

      deleteFamily: (familyId: string) => {
        const { families, users } = get();
        const updatedUsers = users.map(u => ({
          ...u,
          familyIds: u.familyIds.filter(id => id !== familyId),
        }));
        set({
          families: families.filter(f => f.id !== familyId),
          users: updatedUsers,
        });
      },

      addMemberToFamily: (familyId: string, userId: string, role: UserRole = UserRole.USER) => {
        const { families, users } = get();
        const updatedFamilies = families.map(f => {
          if (f.id === familyId && !f.memberIds.includes(userId)) {
            return {
              ...f,
              memberIds: [...f.memberIds, userId],
              memberRoles: { ...f.memberRoles, [userId]: role }
            };
          }
          return f;
        });
        const updatedUsers = users.map(u =>
          u.id === userId && !u.familyIds.includes(familyId)
            ? { ...u, familyIds: [...u.familyIds, familyId] }
            : u
        );
        set({ families: updatedFamilies, users: updatedUsers });
      },

      removeMemberFromFamily: (familyId: string, userId: string) => {
        const { families, users } = get();
        const updatedFamilies = families.map(f => {
          if (f.id === familyId) {
            const newMemberRoles = { ...f.memberRoles };
            delete newMemberRoles[userId];
            return {
              ...f,
              memberIds: f.memberIds.filter(id => id !== userId),
              memberRoles: newMemberRoles
            };
          }
          return f;
        });
        const updatedUsers = users.map(u =>
          u.id === userId
            ? { ...u, familyIds: u.familyIds.filter(id => id !== familyId) }
            : u
        );
        set({ families: updatedFamilies, users: updatedUsers });
      },

      updateMemberRole: (familyId: string, userId: string, role: UserRole) => {
        const { families } = get();
        const updatedFamilies = families.map(f => {
          if (f.id === familyId && f.memberIds.includes(userId)) {
            return {
              ...f,
              memberRoles: { ...f.memberRoles, [userId]: role }
            };
          }
          return f;
        });
        set({ families: updatedFamilies });
      },

      getUserRoleInFamily: (familyId: string, userId: string): UserRole | null => {
        const family = get().families.find(f => f.id === familyId);
        if (!family) return null;
        return family.memberRoles[userId] || null;
      },
    }),
    { name: 'auth-storage' }
  )
);

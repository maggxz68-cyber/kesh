import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole, Family, AuthState } from '../types/auth';

const ADMIN_LOGIN = 'admin';
const ADMIN_PASSWORD = '1968';

// Супер-админ — не состоит ни в какой семье
const defaultAdmin: User = {
  id: 'admin-001',
  login: ADMIN_LOGIN,
  password: ADMIN_PASSWORD,
  name: 'Администратор системы',
  email: 'admin@system.local',
  role: UserRole.SUPER_ADMIN,
  familyIds: [],
  createdAt: new Date().toISOString(),
};

// Демо-семья для ознакомления
const DEMO_FAMILY_ID = 'demo-family';
const DEMO_USER_ID = 'demo-user';

const demoUser: User = {
  id: DEMO_USER_ID,
  login: 'demo',
  password: 'demo',
  name: 'Демо-пользователь',
  email: 'demo@example.com',
  role: UserRole.USER,
  familyIds: [DEMO_FAMILY_ID],
  createdAt: new Date().toISOString(),
};

const demoFamily: Family = {
  id: DEMO_FAMILY_ID,
  name: 'Демо-семья (ознакомление)',
  ownerId: DEMO_USER_ID,
  memberIds: [DEMO_USER_ID],
  memberRoles: { [DEMO_USER_ID]: UserRole.FAMILY_ADMIN },
  createdAt: new Date().toISOString(),
};

export { DEMO_FAMILY_ID, DEMO_USER_ID };

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      currentFamilyId: null,
      isDemoMode: false,
      users: [defaultAdmin, demoUser],
      families: [demoFamily],
      isAuthenticated: false,

      login: (login: string, password: string) => {
        const user = get().users.find(
          u => u.login === login && u.password === password
        );
        if (user) {
          // Супер-админ не имеет семьи
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
          currentUser: demoUser,
          currentFamilyId: DEMO_FAMILY_ID,
          isDemoMode: true,
          isAuthenticated: true,
        });
      },

      logout: () => {
        set({ currentUser: null, currentFamilyId: null, isDemoMode: false, isAuthenticated: false });
      },

      register: (name: string, email: string, password: string, familyName: string) => {
        const { users } = get();
        // Проверка уникальности email
        if (users.some(u => u.email === email)) return false;

        const userId = uuidv4();
        const familyId = uuidv4();

        const newUser: User = {
          id: userId,
          login: email,
          password,
          name,
          email,
          role: UserRole.FAMILY_ADMIN, // Владелец семьи получает роль FAMILY_ADMIN
          familyIds: [familyId],
          createdAt: new Date().toISOString(),
        };

        const newFamily: Family = {
          id: familyId,
          name: familyName,
          ownerId: userId,
          memberIds: [userId],
          memberRoles: { [userId]: UserRole.FAMILY_ADMIN }, // Владелец - админ семьи
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
          memberRoles: { [ownerId]: UserRole.FAMILY_ADMIN }, // Владелец - админ семьи
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

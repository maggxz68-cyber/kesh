import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole, Family, AuthState } from '../types/auth';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      currentFamilyId: null,
      isDemoMode: false,
      users: [],
      families: [],
      isAuthenticated: false,
      _loading: false,

      login: (loginValue: string, password: string) => {
        const { users } = get();
        const user = users.find(u => (u.login === loginValue || u.email === loginValue) && u.password === password);
        if (user) {
          const firstFamilyId = user.familyIds.length > 0 ? user.familyIds[0] : null;
          set({
            currentUser: user,
            currentFamilyId: firstFamilyId,
            isAuthenticated: true,
          });
          return true;
        }
        return false;
      },

      loginDemo: () => {
        const { users } = get();
        let demoUser = users.find(u => u.login === 'demo');
        
        if (!demoUser) {
          // Создаём демо-пользователя
          const demoFamilyId = uuidv4();
          const demoUserId = uuidv4();
          
          demoUser = {
            id: demoUserId,
            login: 'demo',
            password: 'demo',
            name: 'Демо Пользователь',
            email: 'demo@example.com',
            role: UserRole.FAMILY_ADMIN,
            familyIds: [demoFamilyId],
            createdAt: new Date().toISOString(),
          };
          
          const demoFamily: Family = {
            id: demoFamilyId,
            name: 'Демо Семья',
            ownerId: demoUserId,
            memberIds: [demoUserId],
            memberRoles: { [demoUserId]: UserRole.FAMILY_ADMIN },
            createdAt: new Date().toISOString(),
          };
          
          set({
            users: [...users, demoUser],
            families: [...get().families, demoFamily],
          });
        }
        
        const firstFamilyId = demoUser.familyIds.length > 0 ? demoUser.familyIds[0] : null;
        set({
          currentUser: demoUser,
          currentFamilyId: firstFamilyId,
          isAuthenticated: true,
          isDemoMode: true,
        });
      },

      logout: () => {
        set({
          currentUser: null,
          currentFamilyId: null,
          isDemoMode: false,
          isAuthenticated: false,
        });
      },

      register: (name: string, email: string, password: string, familyName: string) => {
        const { users, families } = get();
        
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
          families: [...families, newFamily],
          currentUser: newUser,
          currentFamilyId: familyId,
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

      restoreSession: () => {
        // При использовании persist, сессия восстанавливается автоматически
        return !!get().currentUser;
      },

      addUser: (userData) => {
        const userId = uuidv4();
        const newUser: User = {
          ...userData,
          id: userId,
          familyIds: [],
          createdAt: new Date().toISOString(),
        };
        set({ users: [...get().users, newUser] });
        return userId;
      },

      deleteUser: (userId: string) => {
        set({ users: get().users.filter(u => u.id !== userId) });
      },

      addFamily: (name: string, ownerId: string) => {
        const familyId = uuidv4();
        const newFamily: Family = {
          id: familyId,
          name,
          ownerId,
          memberIds: [ownerId],
          memberRoles: { [ownerId]: UserRole.FAMILY_ADMIN },
          createdAt: new Date().toISOString(),
        };
        set({ families: [...get().families, newFamily] });
        return familyId;
      },

      deleteFamily: (familyId: string) => {
        set({ families: get().families.filter(f => f.id !== familyId) });
      },

      addMemberToFamily: (familyId: string, userId: string, role: UserRole = UserRole.USER) => {
        const { families, users } = get();
        const updatedFamilies = families.map(f => {
          if (f.id === familyId) {
            return {
              ...f,
              memberIds: f.memberIds.includes(userId) ? f.memberIds : [...f.memberIds, userId],
              memberRoles: { ...f.memberRoles, [userId]: role },
            };
          }
          return f;
        });
        const updatedUsers = users.map(u => {
          if (u.id === userId && !u.familyIds.includes(familyId)) {
            return { ...u, familyIds: [...u.familyIds, familyId] };
          }
          return u;
        });
        set({ families: updatedFamilies, users: updatedUsers });
      },

      removeMemberFromFamily: (familyId: string, userId: string) => {
        const { families, users } = get();
        const updatedFamilies = families.map(f => {
          if (f.id === familyId) {
            const { [userId]: _, ...restRoles } = f.memberRoles;
            return {
              ...f,
              memberIds: f.memberIds.filter(id => id !== userId),
              memberRoles: restRoles,
            };
          }
          return f;
        });
        const updatedUsers = users.map(u => {
          if (u.id === userId) {
            return { ...u, familyIds: u.familyIds.filter(id => id !== familyId) };
          }
          return u;
        });
        set({ families: updatedFamilies, users: updatedUsers });
      },

      updateMemberRole: (familyId: string, userId: string, role: UserRole) => {
        const { families } = get();
        const updatedFamilies = families.map(f => {
          if (f.id === familyId) {
            return {
              ...f,
              memberRoles: { ...f.memberRoles, [userId]: role },
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

      addFamilyMemberWithAccount: (familyId: string, name: string, email: string, password: string, role: UserRole = UserRole.USER) => {
        const { users, families } = get();
        
        if (users.some(u => u.email === email)) return null;
        
        const family = families.find(f => f.id === familyId);
        if (!family) return null;

        const userId = uuidv4();
        
        const newUser: User = {
          id: userId,
          login: email,
          password,
          name,
          email,
          role,
          familyIds: [familyId],
          createdAt: new Date().toISOString(),
        };

        const updatedFamilies = families.map(f => {
          if (f.id === familyId) {
            return {
              ...f,
              memberIds: [...f.memberIds, userId],
              memberRoles: { ...f.memberRoles, [userId]: role },
            };
          }
          return f;
        });

        set({
          users: [...users, newUser],
          families: updatedFamilies,
        });

        return userId;
      },

      generateInviteCode: (familyId: string): string => {
        const { families } = get();
        const family = families.find(f => f.id === familyId);
        if (!family) return '';

        const inviteData = {
          type: 'family-invite',
          version: '1.0',
          familyId: family.id,
          familyName: family.name,
          timestamp: new Date().toISOString(),
        };

        return btoa(encodeURIComponent(JSON.stringify(inviteData)));
      },

      joinFamilyByCode: (code: string, name: string, email: string, password: string) => {
        try {
          const json = decodeURIComponent(atob(code));
          const inviteData = JSON.parse(json);
          
          if (inviteData.type !== 'family-invite') return false;

          const { users, families } = get();
          
          if (users.some(u => u.email === email)) return false;

          const userId = uuidv4();
          const familyId = inviteData.familyId;
          
          const existingFamily = families.find(f => f.id === familyId);
          
          if (existingFamily) {
            const newUser: User = {
              id: userId,
              login: email,
              password,
              name,
              email,
              role: UserRole.USER,
              familyIds: [familyId],
              createdAt: new Date().toISOString(),
            };

            const updatedFamilies = families.map(f => {
              if (f.id === familyId && !f.memberIds.includes(userId)) {
                return {
                  ...f,
                  memberIds: [...f.memberIds, userId],
                  memberRoles: { ...f.memberRoles, [userId]: UserRole.USER },
                };
              }
              return f;
            });

            set({
              users: [...users, newUser],
              families: updatedFamilies,
              currentUser: newUser,
              currentFamilyId: familyId,
              isAuthenticated: true,
            });
          } else {
            const newUser: User = {
              id: userId,
              login: email,
              password,
              name,
              email,
              role: UserRole.USER,
              familyIds: [familyId],
              createdAt: new Date().toISOString(),
            };

            const newFamily: Family = {
              id: familyId,
              name: inviteData.familyName,
              ownerId: userId,
              memberIds: [userId],
              memberRoles: { [userId]: UserRole.USER },
              createdAt: inviteData.timestamp,
            };

            set({
              users: [...users, newUser],
              families: [...families, newFamily],
              currentUser: newUser,
              currentFamilyId: familyId,
              isAuthenticated: true,
            });
          }

          return true;
        } catch (error) {
          console.error('Ошибка при присоединении по коду:', error);
          return false;
        }
      },
    }),
    { name: 'auth-storage' }
  )
);

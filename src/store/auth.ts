import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole, Family, AuthState } from '../types/auth';
import api from '../api/client';

// Проверяем доступность backend
const checkBackend = async (): Promise<boolean> => {
  try {
    const response = await fetch('/api/health', { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      currentFamilyId: null,
      isDemoMode: false,
      users: [],
      families: [],
      isAuthenticated: false,

      login: async (loginValue: string, password: string) => {
        // Сначала пробуем через API
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          try {
            const data = await api.login(loginValue, password);
            const user: User = {
              id: data.user.id,
              login: data.user.login,
              password: '',
              name: data.user.name,
              email: data.user.email,
              role: data.user.role,
              familyIds: data.user.familyIds || [],
              createdAt: new Date().toISOString(),
            };
            const families: Family[] = (data.families || []).map((f: any) => ({
              id: f.id,
              name: f.name,
              ownerId: f.owner_id || user.id,
              memberIds: [user.id],
              memberRoles: { [user.id]: user.role },
              createdAt: new Date().toISOString(),
            }));

            const firstFamilyId = user.familyIds.length > 0 ? user.familyIds[0] : null;
            set({
              currentUser: user,
              currentFamilyId: firstFamilyId,
              families,
              isAuthenticated: true,
              isDemoMode: false,
            });
            return true;
          } catch (e: any) {
            console.error('Login error:', e);
            return false;
          }
        } else {
          // Fallback: вход через localStorage
          const { users } = get();
          const user = users.find(u => 
            (u.login === loginValue || u.email === loginValue) && u.password === password
          );
          
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
        }
      },

      loginDemo: async () => {
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          const success = await get().login('demo', 'demo');
          if (success) {
            set({ isDemoMode: true });
          }
        } else {
          // Fallback: демо-вход через localStorage
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
        }
      },

      logout: () => {
        api.logout();
        set({
          currentUser: null,
          currentFamilyId: null,
          isDemoMode: false,
          users: [],
          families: [],
          isAuthenticated: false,
        });
      },

      register: async (name: string, email: string, password: string, familyName: string) => {
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          try {
            const data = await api.register(name, email, password, familyName);
            const user: User = {
              id: data.user.id,
              login: data.user.login,
              password: '',
              name: data.user.name,
              email: data.user.email,
              role: data.user.role,
              familyIds: data.user.familyIds || [],
              createdAt: new Date().toISOString(),
            };
            const families: Family[] = (data.families || []).map((f: any) => ({
              id: f.id,
              name: f.name,
              ownerId: user.id,
              memberIds: [user.id],
              memberRoles: { [user.id]: user.role },
              createdAt: new Date().toISOString(),
            }));

            set({
              currentUser: user,
              currentFamilyId: user.familyIds[0] || null,
              families,
              isAuthenticated: true,
              isDemoMode: false,
            });
            return true;
          } catch (e: any) {
            console.error('Register error:', e);
            return false;
          }
        } else {
          // Fallback: регистрация через localStorage
          const { users, families } = get();
          
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
        }
      },

      setCurrentFamily: (familyId: string) => {
        const { currentUser } = get();
        if (currentUser && currentUser.familyIds.includes(familyId)) {
          set({ currentFamilyId: familyId });
        }
      },

      restoreSession: async () => {
        const token = localStorage.getItem('auth-token');
        if (!token) {
          // Проверяем localStorage на наличие сессии
          const { currentUser } = get();
          return !!currentUser;
        }
        
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          try {
            const data = await api.getMe();
            const user: User = {
              id: data.user.id,
              login: data.user.login,
              password: '',
              name: data.user.name,
              email: data.user.email,
              role: data.user.role,
              familyIds: data.user.familyIds || [],
              createdAt: new Date().toISOString(),
            };
            const families: Family[] = (data.families || []).map((f: any) => ({
              id: f.id,
              name: f.name,
              ownerId: f.owner_id || user.id,
              memberIds: [],
              memberRoles: {},
              createdAt: new Date().toISOString(),
            }));

            set({
              currentUser: user,
              families,
              currentFamilyId: user.familyIds[0] || null,
              isAuthenticated: true,
            });
            return true;
          } catch {
            api.logout();
            return false;
          }
        } else {
          // Fallback: восстановление из localStorage
          const { currentUser } = get();
          return !!currentUser;
        }
      },

      addUser: () => '',
      deleteUser: async () => {},
      addFamily: () => '',
      deleteFamily: async () => {},
      addMemberToFamily: async () => {},
      removeMemberFromFamily: async () => {},
      updateMemberRole: async () => {},
      getUserRoleInFamily: () => null,

      addFamilyMemberWithAccount: async (familyId: string, name: string, email: string, password: string, role: UserRole = UserRole.USER) => {
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          try {
            const result = await api.addFamilyMember(familyId, name, email, password, role);
            return result.userId;
          } catch (e) {
            return null;
          }
        } else {
          // Fallback: добавление через localStorage
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
        }
      },

      joinFamilyByCode: async (code: string, name: string, email: string, password: string) => {
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          try {
            const data = await api.joinFamily(code, name, email, password);
            const user: User = {
              id: data.user.id,
              login: data.user.login,
              password: '',
              name: data.user.name,
              email: data.user.email,
              role: data.user.role,
              familyIds: data.user.familyIds || [],
              createdAt: new Date().toISOString(),
            };
            const families: Family[] = (data.families || []).map((f: any) => ({
              id: f.id,
              name: f.name,
              ownerId: f.owner_id || user.id,
              memberIds: [user.id],
              memberRoles: { [user.id]: user.role },
              createdAt: new Date().toISOString(),
            }));

            set({
              currentUser: user,
              families,
              currentFamilyId: user.familyIds[0] || null,
              isAuthenticated: true,
            });
            return true;
          } catch (e) {
            return false;
          }
        } else {
          // Fallback: присоединение через localStorage
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
        }
      },

      generateInviteCode: async (familyId: string) => {
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          try {
            const result = await api.generateInviteCode(familyId);
            return result.code;
          } catch {
            return '';
          }
        } else {
          // Fallback: генерация кода локально
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
        }
      },

      loadAdminData: async () => {
        const backendAvailable = await checkBackend();
        
        if (backendAvailable) {
          try {
            const [usersData, familiesData] = await Promise.all([
              api.adminGetUsers(),
              api.adminGetFamilies(),
            ]);

            const users: User[] = usersData.map((u: any) => ({
              id: u.id,
              login: u.login,
              password: '',
              name: u.name,
              email: u.email,
              role: u.role,
              familyIds: [],
              createdAt: u.created_at || new Date().toISOString(),
            }));

            const families: Family[] = familiesData.map((f: any) => ({
              id: f.id,
              name: f.name,
              ownerId: f.owner_id,
              memberIds: [],
              memberRoles: {},
              createdAt: f.created_at || new Date().toISOString(),
            }));

            set({ users, families });
          } catch (e) {
            console.error('Load admin data error:', e);
          }
        }
        // В offline режиме данные уже в localStorage
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        currentUser: state.currentUser,
        currentFamilyId: state.currentFamilyId,
        isDemoMode: state.isDemoMode,
        users: state.users,
        families: state.families,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

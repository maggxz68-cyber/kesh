import { create } from 'zustand';
import api from '../api/client';
import { User, UserRole, Family, AuthState } from '../types/auth';

export const useAuthStore = create<AuthState>()((set, get) => ({
  currentUser: null,
  currentFamilyId: null,
  isDemoMode: false,
  users: [],
  families: [],
  isAuthenticated: false,

  login: async (login: string, password: string) => {
    try {
      const data = await api.login(login, password);
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
  },

  loginDemo: async () => {
    const success = await get().login('demo', 'demo');
    if (success) {
      set({ isDemoMode: true });
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
  },

  setCurrentFamily: (familyId: string) => {
    const { currentUser } = get();
    if (currentUser && currentUser.familyIds.includes(familyId)) {
      set({ currentFamilyId: familyId });
    }
  },

  restoreSession: async () => {
    const token = localStorage.getItem('auth-token');
    if (!token) return false;
    
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
  },

  addUser: () => '',
  deleteUser: async (userId: string) => {
    try {
      await api.adminDeleteUser(userId);
      set({ users: get().users.filter(u => u.id !== userId) });
    } catch (e) {
      console.error('Delete user error:', e);
      throw e;
    }
  },
  addFamily: () => '',
  deleteFamily: async (familyId: string) => {
    try {
      await api.adminDeleteFamily(familyId);
      set({ families: get().families.filter(f => f.id !== familyId) });
    } catch (e) {
      console.error('Delete family error:', e);
      throw e;
    }
  },
  addMemberToFamily: async () => {},
  removeMemberFromFamily: async () => {},
  updateMemberRole: async () => {},
  getUserRoleInFamily: () => null,

  addFamilyMemberWithAccount: async (familyId: string, name: string, email: string, password: string, role: UserRole = UserRole.USER) => {
    try {
      const result = await api.addFamilyMember(familyId, name, email, password, role);
      return result.userId;
    } catch (e) {
      return null;
    }
  },

  joinFamilyByCode: async (code: string, name: string, email: string, password: string) => {
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
  },

  generateInviteCode: async (familyId: string) => {
    try {
      const result = await api.generateInviteCode(familyId);
      return result.code;
    } catch {
      return '';
    }
  },

  loadAdminData: async () => {
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
  },
}));

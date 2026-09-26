export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  FAMILY_ADMIN = 'FAMILY_ADMIN', // Админ семьи
  USER = 'USER',
}

// Экспортируем для использования в других модулях
export { UserRole as FamilyRole } from './auth';

export interface User {
  id: string;
  login: string;
  password: string;
  name: string;
  email: string;
  role: UserRole;
  familyIds: string[];
  createdAt: string;
}

export interface Family {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  memberRoles: Record<string, UserRole>; // Роли участников в семье
  createdAt: string;
  lastSync?: string; // Время последней синхронизации
}

export interface AuthState {
  currentUser: User | null;
  currentFamilyId: string | null;
  isDemoMode: boolean;
  users: User[];
  families: Family[];
  isAuthenticated: boolean;
  
  login: (login: string, password: string) => boolean;
  loginDemo: () => void;
  logout: () => void;
  register: (name: string, email: string, password: string, familyName: string) => boolean;
  setCurrentFamily: (familyId: string) => void;
  addUser: (user: Omit<User, 'id' | 'createdAt' | 'familyIds'>) => string;
  deleteUser: (userId: string) => void;
  addFamily: (name: string, ownerId: string) => string;
  deleteFamily: (familyId: string) => void;
  addMemberToFamily: (familyId: string, userId: string, role?: UserRole) => void;
  removeMemberFromFamily: (familyId: string, userId: string) => void;
  updateMemberRole: (familyId: string, userId: string, role: UserRole) => void;
  getUserRoleInFamily: (familyId: string, userId: string) => UserRole | null;
  addFamilyMemberWithAccount: (familyId: string, name: string, email: string, password: string, role?: UserRole) => string | null;
  joinFamilyByCode: (code: string, name: string, email: string, password: string) => boolean;
  generateInviteCode: (familyId: string) => string;
}

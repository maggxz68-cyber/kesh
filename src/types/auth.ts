export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  USER = 'USER',
}

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
  createdAt: string;
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
  addUser: (user: Omit<User, 'id' | 'createdAt' | 'familyIds'>) => void;
  deleteUser: (userId: string) => void;
  addFamily: (name: string, ownerId: string) => string;
  deleteFamily: (familyId: string) => void;
  addMemberToFamily: (familyId: string, userId: string) => void;
  removeMemberFromFamily: (familyId: string, userId: string) => void;
}

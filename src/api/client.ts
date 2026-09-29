/**
 * API клиент для сервера "Семейный бюджет"
 * Все данные хранятся на сервере, localStorage используется только для токена
 */

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem('auth-token');
  }

  private setToken(token: string): void {
    localStorage.setItem('auth-token', token);
  }

  private clearToken(): void {
    localStorage.removeItem('auth-token');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.clearToken();
      window.location.href = '/';
      throw new Error('Сессия истекла');
    }

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка сервера');
    }

    return data as T;
  }

  // ============ AUTH ============
  async login(login: string, password: string) {
    const data = await this.request<{ token: string; user: any; families: any[] }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async register(name: string, email: string, password: string, familyName: string) {
    const data = await this.request<{ token: string; user: any; families: any[] }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, familyName }),
    });
    this.setToken(data.token);
    return data;
  }

  async joinFamily(code: string, name: string, email: string, password: string) {
    const data = await this.request<{ token: string; user: any; families: any[] }>('/auth/join-family', {
      method: 'POST',
      body: JSON.stringify({ code, name, email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async getMe() {
    return this.request<{ user: any; families: any[] }>('/auth/me');
  }

  logout() {
    this.clearToken();
  }

  // ============ FAMILY ============
  async getFamilyData(familyId: string) {
    return this.request<any>(`/families/${familyId}/data`);
  }

  async getFamily(familyId: string) {
    return this.request<any>(`/families/${familyId}`);
  }

  async generateInviteCode(familyId: string) {
    return this.request<{ code: string }>(`/families/${familyId}/invite-code`, {
      method: 'POST',
    });
  }

  async addFamilyMember(familyId: string, name: string, email: string, password: string, role: string) {
    return this.request<any>(`/families/${familyId}/members`, {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    });
  }

  async removeFamilyMember(familyId: string, userId: string) {
    return this.request<any>(`/families/${familyId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  // ============ ACCOUNTS ============
  async getAccounts(familyId: string) {
    return this.request<any[]>(`/families/${familyId}/accounts`);
  }

  async createAccount(familyId: string, data: any) {
    return this.request<any>(`/families/${familyId}/accounts`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAccount(familyId: string, id: string, data: any) {
    return this.request<any>(`/families/${familyId}/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteAccount(familyId: string, id: string) {
    return this.request<any>(`/families/${familyId}/accounts/${id}`, {
      method: 'DELETE',
    });
  }

  // ============ CATEGORIES ============
  async getCategories(familyId: string) {
    return this.request<any[]>(`/families/${familyId}/categories`);
  }

  async createCategory(familyId: string, data: any) {
    return this.request<any>(`/families/${familyId}/categories`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCategory(familyId: string, id: string, data: any) {
    return this.request<any>(`/families/${familyId}/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCategory(familyId: string, id: string) {
    return this.request<any>(`/families/${familyId}/categories/${id}`, {
      method: 'DELETE',
    });
  }

  // ============ TRANSACTIONS ============
  async getTransactions(familyId: string) {
    return this.request<any[]>(`/families/${familyId}/transactions`);
  }

  async createTransaction(familyId: string, data: any) {
    return this.request<any>(`/families/${familyId}/transactions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTransaction(familyId: string, id: string, data: any) {
    return this.request<any>(`/families/${familyId}/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTransaction(familyId: string, id: string) {
    return this.request<any>(`/families/${familyId}/transactions/${id}`, {
      method: 'DELETE',
    });
  }

  // ============ BUDGETS ============
  async getBudgets(familyId: string) {
    return this.request<any[]>(`/families/${familyId}/budgets`);
  }

  async createBudget(familyId: string, data: any) {
    return this.request<any>(`/families/${familyId}/budgets`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBudget(familyId: string, id: string, data: any) {
    return this.request<any>(`/families/${familyId}/budgets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteBudget(familyId: string, id: string) {
    return this.request<any>(`/families/${familyId}/budgets/${id}`, {
      method: 'DELETE',
    });
  }

  // ============ RECURRING ============
  async getRecurring(familyId: string) {
    return this.request<any[]>(`/families/${familyId}/recurring`);
  }

  async createRecurring(familyId: string, data: any) {
    return this.request<any>(`/families/${familyId}/recurring`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteRecurring(familyId: string, id: string) {
    return this.request<any>(`/families/${familyId}/recurring/${id}`, {
      method: 'DELETE',
    });
  }

  // ============ ADMIN ============
  async adminGetUsers() {
    return this.request<any[]>('/admin/users');
  }

  async adminGetFamilies() {
    return this.request<any[]>('/admin/families');
  }

  async adminDeleteUser(id: string) {
    return this.request<any>(`/admin/users/${id}`, { method: 'DELETE' });
  }

  async adminDeleteFamily(id: string) {
    return this.request<any>(`/admin/families/${id}`, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
export default api;

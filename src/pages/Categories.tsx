import React, { useState } from 'react';
import { useStore } from '../store';
import { TransactionType } from '../types';
import { Plus, Edit3, Trash2, X, Save } from 'lucide-react';

interface CategoryForm {
  name: string;
  type: TransactionType;
  icon: string;
  color: string;
  parentId: string | null;
}

export default function Categories() {
  const { categories, addCategory, updateCategory, deleteCategory } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>({
    name: '',
    type: TransactionType.EXPENSE,
    icon: '📦',
    color: '#6b7280',
    parentId: null,
  });

  const expenseCategories = categories.filter(c => c.type === TransactionType.EXPENSE);
  const incomeCategories = categories.filter(c => c.type === TransactionType.INCOME);

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    if (editingId) {
      updateCategory(editingId, form);
      setEditingId(null);
    } else {
      addCategory(form);
    }
    setForm({ name: '', type: TransactionType.EXPENSE, icon: '📦', color: '#6b7280', parentId: null });
    setShowForm(false);
  };

  const startEdit = (id: string) => {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    setForm({ name: cat.name, type: cat.type, icon: cat.icon, color: cat.color, parentId: cat.parentId });
    setEditingId(id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Удалить категорию? Операции с этой категорией останутся без категории.')) {
      deleteCategory(id);
    }
  };

  const iconOptions = ['🛒', '🚗', '🏠', '💊', '📚', '🎮', '👕', '📱', '📦', '💰', '💻', '🎁', '📈', '💵', '🍔', '☕', '🎬', '✈️', '🐕', '💇', '🏋️', '🎵'];
  const colorOptions = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#6b7280', '#f97316', '#14b8a6', '#a855f7'];

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Категории</h2>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', type: TransactionType.EXPENSE, icon: '📦', color: '#6b7280', parentId: null }); }}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700"
        >
          <Plus size={16} /> Добавить
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-4">
          <h3 className="font-semibold">{editingId ? 'Редактировать' : 'Новая категория'}</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Название *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                placeholder="Название категории"
              />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Тип</label>
              <select
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value as TransactionType })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                disabled={!!editingId}
              >
                <option value={TransactionType.EXPENSE}>Расход</option>
                <option value={TransactionType.INCOME}>Доход</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-2 block">Иконка</label>
            <div className="flex flex-wrap gap-2">
              {iconOptions.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setForm({ ...form, icon })}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg border ${
                    form.icon === icon ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-600'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-2 block">Цвет</label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setForm({ ...form, color })}
                  className={`w-8 h-8 rounded-full border-2 ${
                    form.color === color ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700"
            >
              <Save size={14} /> {editingId ? 'Сохранить' : 'Создать'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Expense categories */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <span className="text-red-500">📉</span> Расходы ({expenseCategories.length})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {expenseCategories.map(cat => (
            <div key={cat.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600">
              <div className="flex items-center gap-2">
                <span className="text-xl">{cat.icon}</span>
                <div>
                  <p className="text-sm font-medium">{cat.name}</p>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(cat.id)} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                  <Edit3 size={14} />
                </button>
                <button onClick={() => handleDelete(cat.id)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Income categories */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <span className="text-green-500">📈</span> Доходы ({incomeCategories.length})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {incomeCategories.map(cat => (
            <div key={cat.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600">
              <div className="flex items-center gap-2">
                <span className="text-xl">{cat.icon}</span>
                <div>
                  <p className="text-sm font-medium">{cat.name}</p>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(cat.id)} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                  <Edit3 size={14} />
                </button>
                <button onClick={() => handleDelete(cat.id)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

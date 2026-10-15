// Счета: список с балансами, создание/редактирование/архив, переводы между счетами, импорт выписок.
import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wallet, Banknote, CreditCard, Landmark, CreditCard as CreditIcon, ArrowLeftRight, Archive, Building2, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import { PageTitle } from '../components/Layout';
import { Button, Card, Input, Modal, Skeleton, fmtMoney } from '../components/ui';

interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  bank_name?: string | null;
  opening_balance: string;
  balance: string;
  icon?: string | null;
  color?: string | null;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
}

interface ParsedTransaction {
  date: string;
  amount: number;
  description: string;
  category_hint: string;
}

const TYPE_META: Record<string, { label: string; icon: typeof Wallet }> = {
  cash: { label: 'Наличные', icon: Banknote },
  card: { label: 'Карта', icon: CreditCard },
  bank: { label: 'Банковский счёт', icon: Landmark },
  credit: { label: 'Кредит', icon: CreditIcon },
};

export default function AccountsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<Account[]>('/accounts') });
  const currencies = useQuery({ queryKey: ['currencies'], queryFn: () => api.get<{code: string, name: string, symbol: string}[]>('/currencies') });
  
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Account | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'card', currency: 'RUB', bank_name: '', initial_balance: '0' });
  const [tr, setTr] = useState({ from_account_id: '', to_account_id: '', amount: '', comment: '' });

  // Состояния для импорта
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importAccountId, setImportAccountId] = useState('');
  const [previewData, setPreviewData] = useState<ParsedTransaction[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['accounts'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  };

  const save = useMutation({
    mutationFn: () =>
      edit
        ? api.patch(`/accounts/${edit.id}`, { name: form.name, bank_name: form.bank_name || null, archived: false })
        : api.post('/accounts', { ...form, initial_balance: Number(form.initial_balance), bank_name: form.bank_name || null }),
    onSuccess: () => { invalidate(); setModal(false); setEdit(null); },
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.patch(`/accounts/${id}`, { archived: true }),
    onSuccess: invalidate,
  });

  const transfer = useMutation({
    mutationFn: () => api.post('/transfers', { ...tr, amount: Number(tr.amount) }),
    onSuccess: () => { invalidate(); setTransferOpen(false); setTr({ from_account_id: '', to_account_id: '', amount: '', comment: '' }); },
  });

  // Мутация для предпросмотра импорта
  const previewImport = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new Error('Файл не выбран');
      const formData = new FormData();
      formData.append('file', importFile);
      // Используем fetch напрямую для FormData, если api.post не поддерживает его из коробки
      const response = await fetch('/api/transactions/import/preview', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Ошибка загрузки' }));
        throw new Error(err.detail || 'Ошибка парсинга файла');
      }
      return response.json() as Promise<ParsedTransaction[]>;
    },
    onSuccess: (data) => {
      setPreviewData(data);
    },
    onError: (err: any) => {
      alert(err.message || 'Не удалось распарсить файл. Проверьте формат CSV/XLSX.');
    }
  });

  // Мутация для подтверждения импорта
  const commitImport = useMutation({
    mutationFn: async () => {
      if (!importAccountId || !previewData) throw new Error('Нет данных для импорта');
      const response = await fetch('/api/transactions/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: importAccountId, transactions: previewData }),
        credentials: 'include',
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Ошибка сохранения' }));
        throw new Error(err.detail || 'Ошибка сохранения транзакций');
      }
      return response.json();
    },
    onSuccess: () => {
      invalidate();
      setImportOpen(false);
      setImportFile(null);
      setPreviewData(null);
      setImportAccountId('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      alert('Выписка успешно импортирована!');
    },
    onError: (err: any) => {
      alert(err.message || 'Не удалось сохранить транзакции.');
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setPreviewData(null); // Сбросить старый предпросмотр
    }
  };

  const total = (list.data ?? []).filter((a) => !a.is_archived).reduce((s, a) => s + Number(a.balance), 0);

  return (
    <>
      <PageTitle
        title="Счета"
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload size={16} className="mr-2" /> Импорт выписки
            </Button>
            <Button variant="outline" onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight size={16} className="mr-2" /> Перевод
            </Button>
            <Button onClick={() => { setEdit(null); setForm({ name: '', type: 'card', currency: 'RUB', bank_name: '', initial_balance: '0' }); setModal(true); }}>
              <Plus size={16} className="mr-2" /> Счёт
            </Button>
          </>
        }
      />
      <p className="mb-3 text-sm text-slate-500">Итого по всем счетам: <b className="text-base text-slate-900 dark:text-white">{fmtMoney(total)}</b></p>

      {list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(list.data ?? []).map((a) => {
            const meta = TYPE_META[a.type] ?? { label: a.type, icon: Wallet };
            return (
              <Card key={a.id} className={`p-4 ${a.is_archived ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <span className="rounded-lg bg-indigo-100 p-2 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
                    <meta.icon size={18} />
                  </span>
                  <div className="flex gap-1">
                    <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setEdit(a); setForm({ name: a.name, type: a.type, currency: a.currency, bank_name: a.bank_name || '', initial_balance: '0' }); setModal(true); }}>✎</button>
                    {!a.is_archived && (
                      <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800" title="В архив" onClick={() => archive.mutate(a.id)}>
                        <Archive size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 truncate font-medium">{a.name}</div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  {meta.label}
                  {a.bank_name && <><span>·</span> <Building2 size={12} className="inline" /> {a.bank_name}</>}
                  {a.is_archived && ' · архив'}
                </div>
                <div className={`mt-1 text-xl font-bold ${Number(a.balance) < 0 ? 'text-red-600' : ''}`}>{fmtMoney(Number(a.balance), a.currency)}</div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Модальное окно создания/редактирования счета */}
      <Modal open={modal} onClose={() => setModal(false)} title={edit ? 'Редактировать счёт' : 'Новый счёт'}>
        <div className="space-y-3">
          <Input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {!edit && (
            <>
              <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} disabled={currencies.isLoading}>
                {currencies.isLoading ? (
                  <option>Загрузка валют...</option>
                ) : (
                  (currencies.data ?? []).map((c) => (
                    <option key={c.code} value={c.code}>{c.code} {c.symbol ? `(${c.symbol})` : ''} - {c.name}</option>
                  ))
                )}
              </select>
              <Input placeholder="Название банка (необязательно)" value={form.bank_name} 
                onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
              <Input type="number" placeholder="Начальный баланс" value={form.initial_balance}
                onChange={(e) => setForm({ ...form, initial_balance: e.target.value })} />
            </>
          )}
          {edit && (
             <Input placeholder="Название банка (необязательно)" value={form.bank_name} 
               onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
          )}
          {save.error && <p className="text-sm text-red-600">{String((save.error as Error).message)}</p>}
          <Button className="w-full" onClick={() => save.mutate()} disabled={!form.name || save.isPending}>Сохранить</Button>
        </div>
      </Modal>

      {/* Модальное окно импорта выписки */}
      <Modal open={importOpen} onClose={() => { setImportOpen(false); setPreviewData(null); setImportFile(null); }} title="Импорт банковской выписки">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">1. Выберите счёт</label>
            <select 
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={importAccountId} 
              onChange={(e) => { setImportAccountId(e.target.value); setPreviewData(null); }}
            >
              <option value="">-- Выберите счёт --</option>
              {(list.data ?? []).filter((a) => !a.is_archived).map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">2. Загрузите файл (CSV или XLSX)</label>
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".csv,.xlsx,.xls" 
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-900/30 dark:file:text-indigo-300"
            />
          </div>

          {importFile && !previewData && (
            <Button 
              className="w-full" 
              onClick={() => previewImport.mutate()} 
              disabled={!importAccountId || previewImport.isPending}
            >
              {previewImport.isPending ? 'Анализ файла...' : 'Показать предпросмотр'}
            </Button>
          )}

          {previewImport.error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
              <AlertCircle size={16} />
              <span>{String(previewImport.error)}</span>
            </div>
          )}

          {previewData && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                <CheckCircle size={16} />
                <span>Найдено {previewData.length} операций. Проверьте данные перед сохранением.</span>
              </div>
              
              <div className="max-h-60 overflow-y-auto border rounded-lg dark:border-slate-700">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                    <tr>
                      <th className="p-2">Дата</th>
                      <th className="p-2">Сумма</th>
                      <th className="p-2">Описание</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.slice(0, 10).map((tx, idx) => (
                      <tr key={idx} className="border-t dark:border-slate-700">
                        <td className="p-2 whitespace-nowrap">{tx.date}</td>
                        <td className={`p-2 whitespace-nowrap font-medium ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {fmtMoney(tx.amount)}
                        </td>
                        <td className="p-2 truncate max-w-[150px]" title={tx.description}>{tx.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewData.length > 10 && (
                  <div className="p-2 text-center text-xs text-slate-500 border-t dark:border-slate-700">
                    ... и ещё {previewData.length - 10} операций
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setPreviewData(null); setImportFile(null); if(fileInputRef.current) fileInputRef.current.value = ''; }}>
                  Отмена
                </Button>
                <Button className="flex-1" onClick={() => commitImport.mutate()} disabled={commitImport.isPending}>
                  {commitImport.isPending ? 'Сохранение...' : 'Подтвердить и сохранить'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Модальное окно перевода (без изменений) */}
      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Перевод между счетами">
        <div className="space-y-3">
          <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={tr.from_account_id} onChange={(e) => setTr({ ...tr, from_account_id: e.target.value })}>
            <option value="">Откуда…</option>
            {(list.data ?? []).filter((a) => !a.is_archived).map((a) => <option key={a.id} value={a.id}>{a.name} ({fmtMoney(Number(a.balance), a.currency)})</option>)}
          </select>
          <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={tr.to_account_id} onChange={(e) => setTr({ ...tr, to_account_id: e.target.value })}>
            <option value="">Куда…</option>
            {(list.data ?? []).filter((a) => !a.is_archived && a.id !== tr.from_account_id).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </select>
          <Input type="number" inputMode="decimal" placeholder="Сумма" value={tr.amount} onChange={(e) => setTr({ ...tr, amount: e.target.value })} />
          <Input placeholder="Комментарий" value={tr.comment} onChange={(e) => setTr({ ...tr, comment: e.target.value })} />
          {transfer.error && <p className="text-sm text-red-600">{String((transfer.error as Error).message)}</p>}
          <Button className="w-full" disabled={!tr.from_account_id || !tr.to_account_id || !Number(tr.amount) || transfer.isPending}
            onClick={() => transfer.mutate()}>
            <ArrowLeftRight size={16} className="mr-2" /> Перевести
          </Button>
        </div>
      </Modal>
    </>
  );
}

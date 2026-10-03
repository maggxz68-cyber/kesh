// Сканер чеков (ТЗ 7.4/7.7): камера телефона, QR ФНС, OCR, привязка к транзакции.
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, ImageUp, Loader2, ScanLine, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import { PageTitle } from '../components/Layout';
import { Button, Card, Input, fmtMoney } from '../components/ui';
import { useAccounts, useCategories } from './TransactionsPage';

interface ReceiptItem { id: number; name: string; quantity: number; price: number; total: number }
interface ReceiptOut {
  id: string; store_name: string | null; inn: string | null;
  total_amount: number | null; items_total: number;
  receipt_date: string | null; qr_payload_raw: string | null; ocr_text: string | null;
  parse_status: string; items: ReceiptItem[];
}

export default function ScanPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<ReceiptOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const accounts = useAccounts();
  const categories = useCategories();
  const [tx, setTx] = useState({ account_id: '', category_id: '', comment: '' });

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setReceipt(null);
    setError(null);
    setPreview(URL.createObjectURL(f));
  };

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Выберите фото чека');
      const fd = new FormData();
      fd.append('file', file);
      return api.upload<ReceiptOut>(`/receipts/upload?auto_parse=true`, fd);
    },
    onSuccess: (r) => { setReceipt(r); qc.invalidateQueries({ queryKey: ['transactions'] }); },
    onError: (e: Error) => setError(e.message),
  });

  const linkTx = useMutation({
    mutationFn: () =>
      api.post('/transactions', {
        type: 'expense',
        amount: receiptTotal,
        account_id: tx.account_id,
        category_id: tx.category_id || null,
        comment: tx.comment || `Чек: ${receipt?.store_name ?? ''}`.trim(),
        occurred_at: receipt?.receipt_date ?? new Date().toISOString(),
        receipt_id: receipt!.id,
      }),
    onSuccess: () => { setReceipt(null); setFile(null); setPreview(null); qc.invalidateQueries({ queryKey: ['transactions'] }); },
    onError: (e: Error) => setError(e.message),
  });

  const receiptTotal = Number(receipt?.total_amount ?? (receipt?.items ?? []).reduce((a, i) => a + Number(i.total), 0) ?? 0);

  return (
    <>
      <PageTitle title="Сканер чеков" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
          {preview ? (
            <img src={preview} alt="Превью чека" className="max-h-[50vh] w-full rounded-lg object-contain bg-slate-100 dark:bg-slate-800" />
          ) : (
            <button onClick={() => fileRef.current?.click()}
              className="flex h-64 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700">
              <Camera size={40} />
              <span className="font-medium">Сфотографировать или выбрать из галереи</span>
            </button>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()}><ImageUp size={16} /> Другое фото</Button>
            <Button disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
              {upload.isPending ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />} Распознать
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Если на чеке есть QR-код ФНС — реквизиты и позиции подтянутся автоматически; иначе сработает OCR (Tesseract).
          </p>
          {upload.isPending && <p className="mt-2 animate-pulse text-sm text-indigo-600">Обрабатываем на сервере…</p>}
          {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}
        </Card>

        <Card className="p-4">
          {!receipt ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center text-slate-400">
              <ScanLine size={36} />
              <p className="mt-2 text-sm">Распознанный чек появится здесь</p>
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-semibold">{receipt.store_name ?? 'Магазин не определён'}</h3>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                {receipt.inn && <span>ИНН {receipt.inn}</span>}
                {receipt.receipt_date && <span>{new Date(receipt.receipt_date).toLocaleString('ru-RU')}</span>}
                {receipt.qr_payload_raw && <span className="rounded bg-emerald-100 px-1.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><CheckCircle2 size={11} className="mr-1 inline" />QR ФНС</span>}
              </div>
              {!!receipt.items.length && (
                <table className="mt-3 w-full text-sm">
                  <tbody>
                    {receipt.items.map((it, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-1">{it.name}</td>
                        <td className="whitespace-nowrap text-right text-slate-500">{it.quantity} × {fmtMoney(Number(it.price))}</td>
                        <td className="w-20 text-right font-medium">{fmtMoney(Number(it.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="mt-2 flex justify-between font-bold">
                <span>Итого:</span>
                <span>{fmtMoney(receiptTotal)}</span>
              </div>
              {receipt.ocr_text && !receipt.items.length && (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-500 dark:bg-slate-800">{receipt.ocr_text.slice(0, 800)}</pre>
              )}

              <div className="mt-4 space-y-2 border-t pt-3 dark:border-slate-800">
                <p className="text-sm font-medium">Создать расход из чека</p>
                <div className="grid grid-cols-2 gap-2">
                  <select className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    value={tx.account_id} onChange={(e) => setTx({ ...tx, account_id: e.target.value })}>
                    <option value="">Счёт…</option>
                    {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <select className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    value={tx.category_id} onChange={(e) => setTx({ ...tx, category_id: e.target.value })}>
                    <option value="">Категория…</option>
                    {(categories.data ?? []).filter((c) => c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <Input placeholder="Комментарий" value={tx.comment} onChange={(e) => setTx({ ...tx, comment: e.target.value })} />
                <Button className="w-full" variant="success"
                  disabled={!tx.account_id || !receiptTotal || linkTx.isPending}
                  onClick={() => linkTx.mutate()}>
                  {linkTx.isPending ? 'Сохраняем…' : `Списать ${fmtMoney(receiptTotal)}`}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '../api/client';
import type { Sale } from '../types';
import { formatQuantity, pkr } from '../utils/format';
import { useUiStore } from '../store/ui';

export default function SalesReturn() {
  const queryClient = useQueryClient();
  const toast = useUiStore((state) => state.toast);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [lookupInvoice, setLookupInvoice] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const sale = useQuery({
    queryKey: ['return-sale', lookupInvoice],
    queryFn: () => unwrap<Sale>(api.get(`/api/sales/by-invoice/${encodeURIComponent(lookupInvoice)}`)),
    enabled: Boolean(lookupInvoice)
  });
  const returns = useQuery({
    queryKey: ['sale-returns'],
    queryFn: () => unwrap<any[]>(api.get('/api/sales/returns'))
  });
  const submit = useMutation({
    mutationFn: () => {
      const items = Object.entries(quantities)
        .filter(([, quantity]) => Number(quantity) > 0)
        .map(([saleItemId, quantity]) => ({ saleItemId, quantity: Number(quantity) }));
      return unwrap<any>(api.post(`/api/sales/${sale.data!.id}/return`, { items, reason: 'Customer return' }));
    },
    onSuccess: (data) => {
      toast(`Return posted: ${data.returnNo}`);
      setQuantities({});
      queryClient.invalidateQueries({ queryKey: ['return-sale', lookupInvoice] });
      queryClient.invalidateQueries({ queryKey: ['sale-returns'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error: any) => toast(error.response?.data?.message || 'Return failed', 'error')
  });

  return (
    <section className="page-fade space-y-5">
      <div className="erp-page-header"><div><p className="erp-eyebrow">POS Control</p><h2 className="erp-title">Sales Return</h2></div></div>
      <div className="erp-card grid gap-3 p-5 md:grid-cols-[1fr_auto]">
        <label className="grid gap-1">
          <span className="text-sm font-semibold">Enter Invoice No to return against</span>
          <input className="erp-input" placeholder="ES-20260620-1047" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setLookupInvoice(invoiceNo.trim()); }} />
        </label>
        <button className="btn-primary self-end" onClick={() => setLookupInvoice(invoiceNo.trim())} disabled={!invoiceNo.trim()}>Find Invoice</button>
      </div>
      {sale.isError && <div className="erp-card p-5 text-red-700">Invoice not found.</div>}
      {sale.data && (
        <div className="erp-card p-5">
          <div className="mb-4 grid gap-2 rounded-xl bg-[#fff4df] p-3 text-sm md:grid-cols-3">
            <div><b>Invoice:</b> {sale.data.invoiceNo}</div>
            <div><b>Customer:</b> {sale.data.customer?.name || 'Walk-in Customer'}</div>
            <div><b>Total:</b> {pkr(sale.data.netAmount)}</div>
          </div>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left"><tr><th>Return</th><th>Product</th><th>Sold Qty</th><th>Rate</th><th>Return Qty</th></tr></thead>
            <tbody>
              {sale.data.items.map((item) => (
                <tr key={item.id} className="border-t border-[#ead8bb]">
                  <td className="py-3"><input type="checkbox" checked={Number(quantities[item.id || ''] || 0) > 0} onChange={(e) => setQuantities({ ...quantities, [item.id || '']: e.target.checked ? 1 : 0 })} /></td>
                  <td className="font-semibold">{item.product?.name}</td>
                  <td>{formatQuantity(item.displayQuantity || item.quantity, item.displayUnit || item.product?.unit || '')}</td>
                  <td>{pkr(item.unitPrice)}</td>
                  <td><input className="erp-input max-w-32" type="number" min="0" step="0.001" value={quantities[item.id || ''] || ''} placeholder="0.000" onChange={(e) => setQuantities({ ...quantities, [item.id || '']: Number(e.target.value) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-primary mt-4" onClick={() => submit.mutate()} disabled={!Object.values(quantities).some((quantity) => Number(quantity) > 0) || submit.isPending}>{submit.isPending ? 'Processing...' : 'Process Return'}</button>
        </div>
      )}
      {submit.data ? <div className="erp-card p-5 text-[#0f615d]">Return posted: {submit.data.returnNo} - {pkr(submit.data.returnAmount || 0)}</div> : null}
      <div className="erp-card p-5">
        <h3 className="mb-3 font-serif text-xl font-semibold text-[#0f615d]">Return History</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-[#55716d]"><tr><th>Date</th><th>Return No</th><th>Invoice</th><th>Items</th><th>Amount</th><th>Processed By</th></tr></thead>
            <tbody>
              {returns.isLoading && <tr><td colSpan={6} className="py-6 text-center text-[#55716d]">Loading returns...</td></tr>}
              {returns.data?.map((row) => (
                <tr key={row.id} className="border-t border-[#ead8bb]">
                  <td className="py-3">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="font-semibold">{row.returnNo}</td>
                  <td>{row.sale?.invoiceNo || '-'}</td>
                  <td>{row.items?.map((item: any) => item.product?.name).filter(Boolean).join(', ') || '-'}</td>
                  <td className="font-bold">{pkr(row.totalAmount || 0)}</td>
                  <td>{row.processedByUser?.name || '-'}</td>
                </tr>
              ))}
              {!returns.isLoading && !returns.data?.length && <tr><td colSpan={6} className="py-8 text-center text-[#55716d]">No returns recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
